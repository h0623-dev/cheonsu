import { qaBrowserOptions } from './qa-browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { getStageRoundLimit } from '../src/engine/stageRules.js';
import { getBattleOutcome } from '../src/engine/battleOutcome.js';
import { webBuildInfo } from './update-build-info.mjs';
import { stages } from '../src/data/stages.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.env.CHEONSU_MISSIONS_QA_OUT || path.join(root, 'tmp/stage-missions-qa'));
const saveKey = 'cheonsu_v01_save';
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 740 }];
const legacy = JSON.parse(await fs.readFile(new URL('./fixtures/monster-save-1.99.156.json', import.meta.url), 'utf8'));
const preserveFields = ['party', 'gold', 'inventory', 'clearedStages', 'gearInventory', 'gearEnhance', 'supportPoints', 'supportDialoguesSeen', 'exploration', 'stageNotes', 'stageMastery', 'claimedAchievements', 'claimedMasteryRewards', 'snapshotGallery'];
const report = { production: true, passed: false, results: [], stageChecks: [], errors: [] };
const openDialog = page => page.locator('.stage-mission-dialog[open]');
const introSelector = '.stage-directing-banner.stage-banner-start,.boss-splash-overlay';
let server, browser;
await fs.mkdir(output, { recursive: true });

async function contents(container) {
  return {
    victory: await container.locator('.stage-mission-victory li').allTextContents(),
    defeat: await container.locator('.stage-mission-defeat li').allTextContents(),
    victoryJoin: await container.locator('.stage-mission-victory p').innerText(),
    defeatJoin: await container.locator('.stage-mission-defeat p').innerText(),
  };
}

function verifyConditions(actual, stage, units) {
  const bosses = (stage.units || []).filter(unit => unit.type === 'boss' || (unit.id === 'boss' && unit.type !== 'ally'));
  const names = bosses.map(unit => unit.name.trim());
  const leaderText = names.length === 1 ? `적 대장 「${names[0]}」 섬멸` : `적 대장 전원 섬멸(${names.map(name => `「${name}」`).join(', ')})`;
  const hero = (stage.units || []).find(unit => unit.id === 'hero');
  assert.deepEqual(actual.victory, names.length ? [leaderText, '모든 적 섬멸'] : ['모든 적 섬멸'], '미션에는 이 전장의 실제 적 대장 이름을 표시합니다');
  assert.deepEqual(actual.defeat, [`주인공 ${hero?.name || '카일'} 사망`, '아군 전멸', `${getStageRoundLimit(stage)}라운드의 아군 턴 종료까지 승리하지 못함`], '미션의 패배 조건과 제한 라운드가 실제 전장 규칙과 일치합니다');
  assert.equal(actual.victoryJoin, names.length ? '위 조건 중 하나를 달성하면 승리합니다.' : '위 조건을 달성하면 승리합니다.');
  assert.equal(actual.defeatJoin, '위 조건 중 하나라도 발생하면 패배합니다.');
  if (units) {
    const leaderIds = new Set(bosses.map(unit => unit.id));
    assert.equal(getBattleOutcome(stage, units.filter(unit => !leaderIds.has(unit.id))), 'victory', '적 대장 섬멸은 일반 적 생존과 별개로 승리합니다');
    assert.equal(getBattleOutcome(stage, units.filter(unit => unit.type === 'ally')), 'victory', '적 전멸도 독립적인 승리 조건입니다');
    assert.equal(getBattleOutcome(stage, units.filter(unit => unit.id !== 'hero')), 'defeat', '주인공 사망은 패배 조건입니다');
  }
  return { bossNames: names, roundLimit: getStageRoundLimit(stage) };
}

async function geometry(page, container, { modal = false } = {}) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), '페이지 가로 넘침이 없습니다');
  const overflow = await container.locator('.stage-mission-victory,.stage-mission-defeat').evaluateAll(elements => elements.map(element => ({ width: element.clientWidth, scroll: element.scrollWidth })));
  assert.ok(overflow.every(element => element.scroll <= element.width + 2), '미션 문구가 카드 너비를 넘지 않습니다');
  if (!modal) return;
  const bounds = await container.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { modal: element.matches(':modal'), left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  });
  assert.equal(bounds.modal, true, '미션은 실제 네이티브 모달입니다');
  assert.ok(bounds.left >= -1 && bounds.top >= -1 && bounds.right <= bounds.width + 1 && bounds.bottom <= bounds.height + 1, '미션 대화창 전체가 화면 안에 있습니다');
  const confirm = container.getByRole('button', { name: '미션 확인', exact: true });
  const target = await confirm.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const visible = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { height: rect.height, width: rect.width, unobscured: !!visible && element.contains(visible) };
  });
  assert.ok(target.height >= 44 && target.width >= 44 && target.unobscured, '미션 확인 버튼의 터치 영역이 충분하며 가려지지 않습니다');
  assert.ok(await container.evaluate(element => element.contains(document.activeElement)), '모달을 열면 확인 버튼에 키보드 포커스가 있습니다');
  await page.keyboard.press('Tab');
  assert.ok(await container.evaluate(element => document.activeElement === document.body || element.contains(document.activeElement)), 'Tab 입력이 배경의 전투 버튼으로 포커스를 옮기지 않습니다');
}

async function readyBattle(page) {
  await page.locator('.world-battlefield .unit-visual-hero').waitFor();
  await page.waitForFunction(selector => !document.querySelector(selector) && !document.querySelector('.battle-control-heading .prominent-save')?.disabled, introSelector);
}

async function beginBattle(page) {
  await page.getByRole('button', { name: '전투 시작', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.final-deploy-card,.story-screen,.narrative-screen,.world-battlefield'));
  const override = page.getByRole('button', { name: '그래도 출전', exact: true });
  if (await override.count()) await override.click();
  const skip = page.getByRole('button', { name: '바로 전투', exact: true });
  if (await skip.count()) await skip.click();
  await openDialog(page).waitFor();
}

async function confirm(page, escape = false) {
  if (escape) await page.keyboard.press('Escape');
  else await openDialog(page).getByRole('button', { name: '미션 확인', exact: true }).click();
  await openDialog(page).waitFor({ state: 'detached' });
  await readyBattle(page);
}

async function reopen(page, expected, label) {
  const button = page.locator('.battle-control-heading').getByRole('button', { name: '미션 보기', exact: true });
  assert.equal(await button.isVisible(), true, '전투 HUD를 접은 상태에서도 미션 보기 버튼이 보입니다');
  await page.evaluate(selector => {
    window.__missionIntroEvents = [];
    window.__missionIntroObserver?.disconnect();
    window.__missionIntroObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && (node.matches(selector) || node.querySelector(selector))) window.__missionIntroEvents.push(node.className);
      }
    });
    window.__missionIntroObserver.observe(document.body, { childList: true, subtree: true });
  }, introSelector);
  await button.click();
  await openDialog(page).waitFor();
  assert.deepEqual(await contents(openDialog(page)), expected, `${label}: 다시 연 미션 내용은 동일합니다`);
  await confirm(page, true);
  await page.waitForTimeout(1050);
  assert.deepEqual(await page.evaluate(() => { window.__missionIntroObserver.disconnect(); return window.__missionIntroEvents; }), [], `${label}: 수동으로 미션을 확인할 때 도입 연출을 반복하지 않습니다`);
}

async function runViewport(base, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce', hasTouch: viewport.width !== 1280, isMobile: viewport.width !== 1280 });
  const page = await context.newPage();
  page.setDefaultTimeout(22000);
  page.on('pageerror', error => report.errors.push({ viewport, message: error.message, stack: error.stack }));
  page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(base)) report.errors.push({ viewport, message: `${response.status()} ${response.url()}` }); });
  const result = { viewport, passed: false, stagesStarted: 0, resumedBattles: 0, legacyBattles: 0, checks: [] };
  report.results.push(result);
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
  const rawSave = () => page.evaluate(key => localStorage.getItem(key), saveKey);
  const load = async data => {
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: saveKey, data });
    await page.reload();
    await page.getByRole('button', { name: '이어하기', exact: true }).click();
  };
  const saveBattle = async () => {
    await page.locator('.battle-control-heading .prominent-save').click();
    return saved();
  };
  const campaign = { ...structuredClone(legacy.shared), ...structuredClone(legacy.cases[0].save), screen: 'campaign', clearedStages: stages.slice(0, -1).map(stage => stage.id), deployedIds: legacy.shared.party.slice(0, 15).map(unit => unit.id) };
  try {
    await page.addInitScript(() => {
      localStorage.setItem('cheonsu_auto_patch', 'false');
      localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'off', effectsOn: false, battleSpeed: 'turbo', battleSpeedRevision: 1 }));
    });
    await page.goto(base);
    const sampleStageIds = [1, 13, stages.at(-1).id];
    const stageIds = viewport.width === 390 ? stages.map(stage => stage.id) : sampleStageIds;
    for (const stageId of stageIds) {
      await load(campaign);
      await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${stageId}장[.]`) }) }).click();
      await page.locator('.deployment-board-grid').waitFor();
      const missionCard = page.locator(`.stage-mission-card[data-mission-context="deployment"][data-mission-stage="${stageId}"]`);
      await missionCard.waitFor();
      assert.equal(await openDialog(page).count(), 0, '배치 단계에서는 미션 카드만 표시하고 자동 모달을 열지 않습니다');
      assert.equal(await page.locator('.deployment-roster-card[data-placed="true"]').count(), 15);
      const cardContents = await contents(missionCard);
      await geometry(page, missionCard);
      const unchangedCampaign = await rawSave();
      await page.locator('.deployment-roster-card[data-character-id="hero"]').click();
      const destination = page.locator('.deployment-board-cell[data-deployment-valid="true"][data-deployment-unit=""]').first();
      const point = await destination.evaluate(element => ({ x: Number(element.dataset.deploymentX), y: Number(element.dataset.deploymentY) }));
      await destination.click();
      assert.equal(await page.locator(`.deployment-board-cell[data-deployment-x="${point.x}"][data-deployment-y="${point.y}"]`).getAttribute('data-deployment-unit'), 'hero', '미션 카드가 수동 배치를 막지 않습니다');
      assert.equal(await rawSave(), unchangedCampaign, '미션 보기와 수동 배치는 기존 저장을 자동 변경하지 않습니다');
      await beginBattle(page);
      const dialog = openDialog(page);
      assert.equal(await dialog.getAttribute('data-mission-stage'), String(stageId));
      const dialogContents = await contents(dialog);
      assert.deepEqual(dialogContents, cardContents, '배치 카드와 실제 전투 진입 미션이 같습니다');
      await geometry(page, dialog, { modal: true });
      assert.equal(await page.locator(introSelector).count(), 0, '미션 확인 전에 전투·보스 도입 연출을 재생하지 않습니다');
      assert.equal(await page.locator('.battle-control-heading .prominent-save').isDisabled(), true, '미션 모달이 열려 있을 때 전투 저장을 잠급니다');
      assert.equal(await page.locator('.battle-end-turn-float').isDisabled(), true, '미션 확인 전 턴 종료를 잠급니다');
      if (stageId === 1 || stageId === stages.at(-1).id) {
        await page.waitForTimeout(900);
        assert.equal(await page.locator(introSelector).count(), 0, '시간이 지나도 확인 전에는 도입 연출을 시작하지 않습니다');
        await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}-stage-${stageId}-mission.png`) });
      }
      await confirm(page, stageId % 3 === 0);
      const battle = await saveBattle();
      assert.equal(battle.selectedStage.id, stageId);
      const canonical = verifyConditions(dialogContents, battle.selectedStage, battle.units);
      assert.deepEqual({ x: battle.units.find(unit => unit.id === 'hero').x, y: battle.units.find(unit => unit.id === 'hero').y }, point, '미션 확인이 수동 배치 좌표를 바꾸지 않습니다');
      assert.equal(battle.round, 1);
      assert.equal(battle.turn, 'ally');
      assert.equal(battle.units.filter(unit => unit.type === 'ally').length, 15);
      assert.ok(battle.units.filter(unit => unit.type === 'ally').every(unit => !unit.acted && !unit.moved && unit.hp === unit.maxHp), '미션 확인은 HP·행동·이동을 소모하지 않습니다');
      result.stagesStarted++;
      report.stageChecks.push({ viewport, stageId, ...canonical, started: true, conditionsMatch: true, victoryOr: true, defeatOr: true, modalContained: true, manualCoordinatesPreserved: true, closeMethod: stageId % 3 === 0 ? 'Escape' : '미션 확인' });
      if (sampleStageIds.includes(stageId)) {
        await reopen(page, dialogContents, `${stageId}장`);
        await page.locator('.world-battlefield .unit[data-unit-id="bram"]').click();
        const selected = await saveBattle();
        assert.equal(selected.selectedUnit, 'bram', '모달을 닫은 뒤 전장의 아군을 선택할 수 있습니다');
        assert.deepEqual(selected.units, battle.units, '아군 선택은 유닛의 행동·좌표·상태를 바꾸지 않습니다');
        if (stageId === 1) await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}-battle-mission-button.png`) });
        const resumed = structuredClone(selected);
        resumed.units = resumed.units.map(unit => ({ ...unit, status: unit.status || [] }));
        await load(resumed);
        await readyBattle(page);
        assert.equal(await openDialog(page).count(), 0, '이미 진행 중인 전투 이어하기에서는 미션 모달을 자동으로 열지 않습니다');
        assert.deepEqual(await saved(), resumed, '이어하기 자체는 기존 저장을 변경하지 않습니다');
        await reopen(page, dialogContents, `${stageId}장 이어하기`);
        const after = await saveBattle();
        assert.deepEqual(after.units, resumed.units, '미션 열기·닫기·이어하기 후 유닛 전체 필드가 유지됩니다');
        assert.deepEqual(after.selectedStage.units, resumed.selectedStage.units, '저장 전장의 적 구성을 유지합니다');
        for (const field of [...preserveFields, 'turn', 'round', 'selectedUnit', 'trainingUsed', 'dispatchUsed']) assert.deepEqual(after[field], resumed[field], `미션 확인 후 ${field} 보존`);
        result.resumedBattles++;
      }
      console.log(`PASS 미션 ${viewport.width}x${viewport.height} ${stageId}장: ${canonical.bossNames.join(', ')} / ${canonical.roundLimit}라운드 / 실제 전투 진입`);
    }
    result.checks.push(`${stageIds.length}개 장에서 최대 15명 수동 배치 후 실제 전투 진입`, '실제 적 대장 이름·라운드 제한·승리 또는/패배 또는 안내 일치', '배치 자동 모달 없음·전투 자동 모달·확인/Escape·모달 명령/저장 잠금', '미션 카드·대화창 가로 넘침 없음·확인 버튼 44px 이상·키보드 포커스 유지', `${sampleStageIds.join('·')}장 수동 재열기와 이어하기 후 유닛·진행도·수집·장비 보존`);
    for (const legacyCase of legacy.cases) {
      const baseline = { ...structuredClone(legacy.shared), ...structuredClone(legacyCase.save) };
      await load(baseline);
      await readyBattle(page);
      assert.equal(await openDialog(page).count(), 0, '실제 구버전 전투 저장도 자동 미션 없이 이어집니다');
      assert.deepEqual(await saved(), baseline, '구버전 저장은 이어하기에서 변경하지 않습니다');
      await page.locator('.battle-control-heading').getByRole('button', { name: '미션 보기', exact: true }).click();
      await openDialog(page).waitFor();
      verifyConditions(await contents(openDialog(page)), baseline.selectedStage, baseline.units);
      await confirm(page, true);
      const after = await saveBattle();
      assert.deepEqual(after.units, baseline.units, '실제 구버전 저장의 전체 유닛 필드를 보존합니다');
      assert.deepEqual(after.selectedStage.units, baseline.selectedStage.units);
      for (const field of [...preserveFields, 'turn', 'round', 'selectedUnit', 'trainingUsed', 'dispatchUsed']) assert.deepEqual(after[field], baseline[field], `실제 구버전 저장 ${field} 보존`);
      result.legacyBattles++;
    }
    result.checks.push(`실제 1.99.156 전투 저장 ${legacy.cases.length}건의 전체 유닛·진행도 보존`);
    assert.deepEqual(report.errors, [], '브라우저 JavaScript 오류와 HTTP 실패가 없습니다');
    result.passed = true;
  } catch (error) {
    result.failure = error.stack;
    await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}-failure.png`) }).catch(() => {});
    throw error;
  } finally {
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await context.close();
  }
}

try {
  report.build = JSON.parse(await fs.readFile(path.join(root, 'dist/ota-build.json'), 'utf8'));
  assert.deepEqual(report.build, webBuildInfo(root), '현재 최종 소스와 동일한 생산 빌드로 검사합니다');
  server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
  browser = await chromium.launch(qaBrowserOptions());
  for (const viewport of viewports) await runViewport(`http://127.0.0.1:${server.httpServer.address().port}`, viewport);
  assert.deepEqual(report.build, webBuildInfo(root), '검사 중 게임 소스가 변경되지 않았습니다');
  assert.deepEqual(report.build, JSON.parse(await fs.readFile(path.join(root, 'dist/ota-build.json'), 'utf8')), '검사 중 생산 빌드가 변경되지 않았습니다');
  assert.equal(report.stageChecks.length, stages.length + (viewports.length - 1) * 3, '390 세로의 전체 캠페인과 나머지 세 화면의 대표 장을 실제로 시작했습니다');
  report.passed = true;
  console.log(`PASS 스테이지 미션: ${report.stageChecks.length}개 실제 전투 / ${viewports.length}개 화면 / 오류 0 / ${report.build.version}`);
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  if (server) await server.close();
}
