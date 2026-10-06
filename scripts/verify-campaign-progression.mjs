import { qaBrowserOptions } from './qa-browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { webBuildInfo } from './update-build-info.mjs';
import { stages } from '../src/data/stages.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.env.CHEONSU_PROGRESSION_QA_OUT || path.join(root, 'tmp/campaign-progression-qa'));
const saveKey = 'cheonsu_v01_save';
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const failureReason = '전투에서 승리한 뒤 훈련할 수 있습니다.';
const report = { production: true, passed: false, results: [], errors: [] };
let server, browser;
await fs.mkdir(output, { recursive: true });

async function waitBattle(page) {
  await page.locator('.world-battlefield .unit-visual-hero').waitFor();
  await page.waitForFunction(() => !document.querySelector('.battle-control-heading .prominent-save')?.disabled && !document.querySelector('.boss-splash-overlay'));
}

async function startBattle(page) {
  await page.getByRole('button', { name: '전투 시작', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.final-deploy-card,.story-screen,.narrative-screen,.world-battlefield'));
  const override = page.getByRole('button', { name: '그래도 출전', exact: true });
  if (await override.count()) await override.click();
  const skip = page.getByRole('button', { name: '바로 전투', exact: true });
  if (await skip.count()) await skip.click();
  await page.locator('.stage-mission-dialog[open]').getByRole('button', { name: '미션 확인', exact: true }).click();
  await waitBattle(page);
}

async function selectStage(page, stageId) {
  const stage = page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${stageId}장[.]`) }) });
  assert.equal(await stage.isEnabled(), true, `${stageId}장은 실제로 해금되어 있습니다`);
  await stage.click();
  await page.locator('.deployment-board-grid').waitFor();
  assert.match(await page.locator('.deployment-screen h1').innerText(), new RegExp(`^${stageId}장[.]`));
}

async function stageEnabled(page, stageId) {
  const stage = page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${stageId}장[.]`) }) });
  return stage.isEnabled();
}

async function growthTrainingButton(page) {
  const management = page.locator('.camp-management');
  if (!(await management.evaluate(element => element.open))) await page.locator('.camp-management > summary').click();
  await page.getByRole('tab', { name: '성장', exact: true }).click();
  return page.locator('.camp-tab-panel[aria-label="성장"]').getByRole('button', { name: '훈련', exact: true });
}

async function assertTrainingBlocked(page, label, { facility = false } = {}) {
  const growth = await growthTrainingButton(page);
  assert.equal(await growth.isDisabled(), true, `${label}: 성장 메뉴의 훈련을 차단합니다`);
  assert.match(await page.locator('.camp-tab-panel[aria-label="성장"]').innerText(), new RegExp(failureReason.replace(/[.]/g, '[.]')), `${label}: 실패 후 훈련 불가 사유를 표시합니다`);
  await growth.click({ force: true });
  assert.equal(await page.locator('.company-training-dialog').count(), 0, `${label}: 비활성 훈련 버튼이 대화창을 열지 않습니다`);
  if (facility) {
    await page.getByRole('button', { name: '훈련소으로 이동', exact: true }).click();
    const dialog = page.locator('.town-facility-dialog.facility-training[open]');
    await dialog.waitFor();
    const training = dialog.getByRole('button', { name: '훈련', exact: true });
    assert.equal(await training.isDisabled(), true, `${label}: 마을 훈련소에서도 차단합니다`);
    assert.match(await dialog.innerText(), new RegExp(failureReason.replace(/[.]/g, '[.]')));
    await training.click({ force: true });
    assert.equal(await page.locator('.company-training-dialog').count(), 0);
    await page.getByRole('button', { name: '시설 닫기', exact: true }).click();
  }
}

async function trainOnce(page, saveCamp) {
  const growth = await growthTrainingButton(page);
  assert.equal(await growth.isEnabled(), true, '정상 훈련권 1회를 사용할 수 있습니다');
  await growth.click();
  await page.locator('.company-training-dialog[open]').waitFor();
  assert.equal(await page.locator('[data-training-id="attack"]').isEnabled(), true);
  await page.locator('[data-training-id="attack"]').click();
  assert.ok(await page.locator('[data-training-id]').evaluateAll(elements => elements.every(element => element.disabled)), '훈련 후 모든 훈련 선택을 잠급니다');
  const roster = await page.locator('.company-training-roster').innerText();
  await page.locator('[data-training-id="attack"]').click({ force: true });
  assert.equal(await page.locator('.company-training-roster').innerText(), roster, '훈련 연속 입력이 중복 성장을 발생시키지 않습니다');
  await page.getByRole('button', { name: '훈련 닫기', exact: true }).click();
  const trained = await saveCamp();
  assert.equal(trained.trainingUsed, true);
  assert.equal(await (await growthTrainingButton(page)).isDisabled(), true);
  return trained;
}

async function recommendedPreparation(page, stageId) {
  await page.locator('.town-player-nav').getByRole('button', { name: '출전 준비', exact: true }).click();
  await page.locator('.deployment-board-grid').waitFor();
  assert.match(await page.locator('.deployment-screen h1').innerText(), new RegExp(`^${stageId}장[.]`), '마을의 출전 준비가 올바른 전장으로 안내합니다');
}

async function makeSolo(page) {
  const ids = await page.locator('.deployment-roster-card[data-placed="true"]').evaluateAll(elements => elements.map(element => element.dataset.characterId));
  for (const id of ids.filter(id => id !== 'hero')) {
    await page.locator(`.deployment-roster-card[data-character-id="${id}"]`).click();
    await page.getByRole('button', { name: '배치 해제', exact: true }).click();
  }
  assert.equal(await page.locator('.deployment-roster-card[data-placed="true"]').count(), 1);
}

async function actualDefeat(page, saveBattle, result, label) {
  const turns = [];
  let lastBattle;
  // Use the production turn command and enemy AI throughout. No save, HP, outcome,
  // or React state is injected to produce this defeat.
  for (let commands = 0; commands < 32; commands++) {
    await page.waitForFunction(() => document.querySelector('.defeat-dialog[open],.victory-dialog[open]') || document.querySelector('.battle-end-turn-float:not(:disabled)'));
    if (await page.locator('.defeat-dialog[open]').count()) break;
    assert.equal(await page.locator('.victory-dialog[open]').count(), 0, `${label}: 주인공 단독 대기로 실패 경로를 검사합니다`);
    lastBattle = await saveBattle();
    turns.push({ round: lastBattle.round, heroHp: lastBattle.units.find(unit => unit.id === 'hero')?.hp, enemyCount: lastBattle.units.filter(unit => unit.type !== 'ally').length });
    await page.locator('.battle-end-turn-float').click();
    await page.waitForTimeout(150);
  }
  await page.locator('.defeat-dialog[open]').waitFor();
  assert.ok(turns.length > 0 && lastBattle, '실제 전투에서 적 턴을 수행했습니다');
  result.actualDefeats.push({ label, commands: turns.length, turns, realEnemyAi: true, saveInjected: false });
  console.log(`PASS 실제 전투 패배 ${label}: 턴 종료 ${turns.length}회, 적 AI 처리`);
  return lastBattle;
}

async function finishVictory(page) {
  await page.locator('.victory-dialog[open]').waitFor();
  await page.locator('.victory-dialog').getByRole('button', { name: '대기실', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.town-hub,.story-screen,.narrative-screen'));
  if (await page.locator('.story-screen,.narrative-screen').count()) await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await page.locator('.town-hub').waitFor();
}

async function runViewport(base, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce', hasTouch: viewport.width !== 1280, isMobile: viewport.width !== 1280 });
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  const result = { viewport, passed: false, checks: [], actualDefeats: [] };
  report.results.push(result);
  page.on('pageerror', error => report.errors.push({ viewport, message: error.message, stack: error.stack }));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith('http://127.0.0.1:')) report.errors.push({ viewport, message: `${response.status()} ${response.url()}` });
  });
  const button = name => page.getByRole('button', { name, exact: true });
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
  const rawSave = () => page.evaluate(key => localStorage.getItem(key), saveKey);
  const saveCamp = async () => { await page.locator('.camp-header .prominent-save').click(); return saved(); };
  const saveBattle = async () => { await page.locator('.battle-control-heading .prominent-save').click(); return saved(); };
  const load = async data => {
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: saveKey, data });
    await page.reload();
    await button('이어하기').click();
  };
  const preserveRewardFields = (after, before, label) => {
    for (const field of ['gold', 'inventory', 'clearedStages', 'gearInventory', 'gearEnhance', 'supportPoints', 'supportDialoguesSeen', 'exploration', 'stageNotes', 'stageMastery', 'claimedAchievements', 'claimedMasteryRewards', 'snapshotGallery']) assert.deepEqual(after[field], before[field], `${label}: ${field}에 실패 보상을 지급하지 않습니다`);
  };
  const capture = async label => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${label}: 페이지가 가로 화면을 넘지 않습니다`);
    await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}-${label}.png`) });
  };
  try {
    await page.addInitScript(() => {
      localStorage.setItem('cheonsu_auto_patch', 'false');
      localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'off', effectsOn: false, battleSpeed: 'turbo', battleSpeedRevision: 1 }));
      // Fixed combat rolls make the loss path reproducible while the actual AI,
      // movement, attacks, counters, HP, and round limit run normally.
      Math.random = () => .5;
    });
    await page.goto(base);
    await button('새 게임').click();
    assert.equal(await stageEnabled(page, 1), true);
    assert.equal(await stageEnabled(page, 2), false);
    await page.locator('.campaign-header').getByRole('button', { name: '마을', exact: true }).click();
    const fresh = await saveCamp();
    const initiallyTrained = await trainOnce(page, saveCamp);
    assert.ok(initiallyTrained.party.every(unit => unit.baseAtk > fresh.party.find(before => before.id === unit.id).baseAtk), '새 게임의 정상 훈련은 보유 동료 전체를 성장시킵니다');
    result.checks.push('새 게임 훈련 1회와 중복 입력 차단', '초기 1장만 해금');

    await recommendedPreparation(page, 1);
    await makeSolo(page);
    await startBattle(page);
    const firstBattle = await saveBattle();
    const beforeFirstLoss = await actualDefeat(page, saveBattle, result, '첫 미션 실패');
    await capture('actual-defeat');
    await button('대기실로 이동').click();
    await page.locator('.town-hub').waitFor();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.screen === 'camp', saveKey);
    const afterFirstLoss = await saved();
    assert.deepEqual(afterFirstLoss.lastBattleResult, { stageId: 1, outcome: 'defeat' });
    assert.equal(afterFirstLoss.trainingUsed, true, '패배가 기존 훈련 사용 횟수를 초기화하지 않습니다');
    preserveRewardFields(afterFirstLoss, beforeFirstLoss, '실제 패배 철수');
    await assertTrainingBlocked(page, '실제 패배 직후', { facility: true });
    const blockedSave = await saveCamp();
    assert.deepEqual(blockedSave.party, afterFirstLoss.party, '훈련 차단을 클릭해도 동료 능력·경험치가 바뀌지 않습니다');
    await capture('failed-camp');
    result.checks.push('실제 전투 패배와 철수 자동저장', '실패 시 성장 메뉴·훈련소 양쪽 차단 및 사유 표시', '실패 보상·해금·훈련 성장 없음');

    const rawBlocked = await rawSave();
    await page.reload();
    await button('이어하기').click();
    await page.locator('.town-hub').waitFor();
    assert.equal(await rawSave(), rawBlocked, '실패 후 이어하기 자체는 기존 저장을 덮어쓰지 않습니다');
    await assertTrainingBlocked(page, '실패 저장 이어하기');
    assert.deepEqual((await saveCamp()).party, blockedSave.party);
    await recommendedPreparation(page, 1);
    assert.equal(await page.locator('.deployment-roster-card[data-character-id="hero"]').getAttribute('data-placed'), 'true');
    result.checks.push('저장 복원 후 훈련 차단·사용 상태 보존', '실패 후 출전 준비는 실패 장 재도전');

    await page.locator('.screen-panel-header').getByRole('button', { name: '뒤로', exact: true }).click();
    assert.equal(await stageEnabled(page, 2), false, '1장 실패로 2장을 해금하지 않습니다');
    await selectStage(page, 1);
    await makeSolo(page);
    await startBattle(page);
    const beforeSecondLoss = await actualDefeat(page, saveBattle, result, '반복 미션 실패');
    await button('대기실로 이동').click();
    await page.locator('.town-hub').waitFor();
    const repeatedLoss = await saveCamp();
    preserveRewardFields(repeatedLoss, beforeSecondLoss, '반복 실패 철수');
    await assertTrainingBlocked(page, '반복 패배');
    assert.deepEqual((await saveCamp()).party, repeatedLoss.party);
    result.checks.push('실제 반복 실패가 훈련권·보상을 재지급하지 않음');

    // An old live defeat save had no lastBattleResult field. Its real unit outcome
    // must remain authoritative even if an imported marker falsely says victory.
    const oldDefeat = structuredClone(firstBattle);
    oldDefeat.units = oldDefeat.units.filter(unit => unit.id !== 'hero');
    oldDefeat.trainingUsed = false;
    // The long-standing save reader fills absent support dialogue arrays. Supply
    // their explicit shape and nonempty user data to check preservation separately
    // from that pre-existing migration.
    oldDefeat.supportDialoguesSeen = { hero_lina: ['C'], hero_bram: [], lina_bram: [] };
    oldDefeat.stageNotes = { 1: '훈련과 전투 뒤에도 남겨 둔 원정 메모' };
    delete oldDefeat.lastBattleResult;
    await load(oldDefeat);
    await page.locator('.defeat-dialog[open]').waitFor();
    await button('대기실로 이동').click();
    await page.locator('.town-hub').waitFor();
    await assertTrainingBlocked(page, '구버전 전투 패배 저장');
    const migratedDefeat = await saveCamp();
    assert.deepEqual(migratedDefeat.lastBattleResult, { stageId: 1, outcome: 'defeat' });
    preserveRewardFields(migratedDefeat, oldDefeat, '구버전 패배 복원');
    result.checks.push('결과 필드가 없는 구버전 패배 저장 복원');
    for (const oldScreen of ['camp', 'campaign']) {
      const oldRetreat = { ...structuredClone(afterFirstLoss), screen: oldScreen, trainingUsed: false, supportDialoguesSeen: structuredClone(oldDefeat.supportDialoguesSeen), stageNotes: structuredClone(oldDefeat.stageNotes), campMessage: `${afterFirstLoss.selectedStage.title}에서 철수했습니다. 부대를 재정비합니다.` };
      delete oldRetreat.lastBattleResult;
      await load(oldRetreat);
      assert.deepEqual(await saved(), oldRetreat, '구버전 철수 저장 이어하기는 읽기만 합니다');
      if (oldScreen === 'campaign') {
        await page.locator('.campaign-header').waitFor();
        await page.locator('.campaign-header').getByRole('button', { name: '마을', exact: true }).click();
      }
      await page.locator('.town-hub').waitFor();
      await assertTrainingBlocked(page, `구버전 ${oldScreen} 철수 저장`);
      const restoredRetreat = await saveCamp();
      assert.deepEqual(restoredRetreat.lastBattleResult, { stageId: 1, outcome: 'defeat' });
      assert.equal(restoredRetreat.trainingUsed, true);
      preserveRewardFields(restoredRetreat, oldRetreat, '구버전 철수 캠프 복원');
    }
    result.checks.push('구버전 마을·원정 지도 철수 저장 이관과 훈련 차단');
    const falseVictory = { ...structuredClone(oldDefeat), lastBattleResult: { stageId: 1, outcome: 'victory' } };
    await load(falseVictory);
    await page.locator('.defeat-dialog[open]').waitFor();
    await button('대기실로 이동').click();
    await page.locator('.town-hub').waitFor();
    await assertTrainingBlocked(page, '잘못된 승리 표식이 있는 패배');
    preserveRewardFields(await saveCamp(), falseVictory, '패배 승리 표식 제외');
    result.checks.push('잘못된 승리 표식으로 실패 보상·훈련을 우회하지 못함');

    const victoryFixture = structuredClone(firstBattle);
    victoryFixture.units = victoryFixture.units.filter(unit => unit.type === 'ally');
    victoryFixture.stageRewardClaimed = false;
    await load(victoryFixture);
    await finishVictory(page);
    const victorious = await saveCamp();
    assert.deepEqual(victorious.clearedStages, [1]);
    assert.deepEqual(victorious.unlockedStages, [1, 2]);
    assert.deepEqual(victorious.lastBattleResult, { stageId: 1, outcome: 'victory' });
    assert.equal(victorious.trainingUsed, false, '정상 승리 후 기존 훈련 1회 기회를 유지합니다');
    assert.ok(victorious.gold > victoryFixture.gold);
    const victoryTrained = await trainOnce(page, saveCamp);
    assert.ok(victoryTrained.party.every(unit => unit.baseAtk > victorious.party.find(before => before.id === unit.id).baseAtk));
    const trainedRaw = await rawSave();
    await page.reload();
    await button('이어하기').click();
    await page.locator('.town-hub').waitFor();
    assert.equal(await rawSave(), trainedRaw);
    assert.equal(await (await growthTrainingButton(page)).isDisabled(), true, '승리 훈련을 사용한 저장 복원도 재훈련하지 못합니다');
    await recommendedPreparation(page, 2);
    await capture('victory-next-stage');
    result.checks.push('정상 승리 보상·2장 해금과 훈련 1회 유지', '승리 훈련 사용 후 저장 복원·중복 성장 차단', '정상 승리 후 다음 미클리어 장 출전');

    const replayUnits = firstBattle.units.filter(unit => unit.type === 'ally').map(unit => {
      const trained = victoryTrained.party.find(member => member.id === unit.id);
      return { ...structuredClone(unit), ...structuredClone(trained), hp: trained.maxHp, moved: false, acted: false, status: [] };
    });
    const replayVictory = { ...structuredClone(firstBattle), ...structuredClone(victoryTrained), screen: 'battle', units: replayUnits, selectedStage: structuredClone(firstBattle.selectedStage), currentStageId: 1, stageRewardClaimed: true };
    await load(replayVictory);
    await finishVictory(page);
    const replayed = await saveCamp();
    assert.deepEqual(replayed.clearedStages, [1]);
    assert.equal(replayed.gold, replayVictory.gold, '클리어 재플레이 승리는 골드를 중복 지급하지 않습니다');
    assert.deepEqual(replayed.inventory, replayVictory.inventory);
    for (const member of replayed.party) {
      const before = victoryTrained.party.find(unit => unit.id === member.id);
      for (const stat of ['baseAtk', 'baseDef', 'level', 'exp']) assert.equal(member[stat], before[stat], '재플레이 정산은 이미 훈련한 성장을 보존합니다');
    }
    assert.equal(replayed.trainingUsed, false, '기존 클리어 재플레이 승리의 훈련 리셋을 유지합니다');
    assert.equal(await (await growthTrainingButton(page)).isEnabled(), true);
    result.checks.push('승리 재플레이의 기존 훈련 리셋·중복 보상 방지');

    // Ignore forged unlockedStages and preserve old out-of-order clear records.
    const forged = { ...structuredClone(afterFirstLoss), screen: 'deployment', selectedStage: { id: 2 }, currentStageId: 2, unlockedStages: stages.map(stage => stage.id) };
    await load(forged);
    await page.locator('.campaign-stage-select').waitFor();
    assert.equal(await stageEnabled(page, 1), true);
    assert.equal(await stageEnabled(page, 2), false);
    assert.equal(await page.locator('.deployment-board-grid').count(), 0, '잠긴 전장 배치 저장은 원정 지도로 복구합니다');
    result.checks.push('잘못된 해금 목록·잠긴 전장 저장의 경계 보호');
    const outOfOrder = { ...structuredClone(afterFirstLoss), screen: 'campaign', clearedStages: [1, 3], unlockedStages: stages.map(stage => stage.id) };
    await load(outOfOrder);
    await page.locator('.campaign-stage-select').waitFor();
    assert.equal(await stageEnabled(page, 1), true);
    assert.equal(await stageEnabled(page, 2), true);
    assert.equal(await stageEnabled(page, 3), true);
    assert.equal(await stageEnabled(page, 4), false);
    await page.locator('.campaign-header .prominent-save').click();
    assert.deepEqual((await saved()).clearedStages, [1, 3]);
    assert.deepEqual((await saved()).unlockedStages, [1, 2, 3]);
    result.checks.push('과거 순서가 다른 클리어를 보존하고 미클리어 경계를 지킴');
    const failedReplay = { ...structuredClone(afterFirstLoss), clearedStages: [1], lastBattleResult: { stageId: 1, outcome: 'defeat' }, trainingUsed: false };
    await load(failedReplay);
    await page.locator('.town-hub').waitFor();
    await assertTrainingBlocked(page, '이미 클리어한 장 재도전 실패');
    await recommendedPreparation(page, 1);
    await page.locator('.screen-panel-header').getByRole('button', { name: '뒤로', exact: true }).click();
    assert.equal(await stageEnabled(page, 2), true, '이전 승리로 해금한 다른 장은 실패 후에도 명시 선택할 수 있습니다');
    await selectStage(page, 2);
    result.checks.push('실패 장 재도전 우선과 이미 해금한 다른 장의 명시 선택 유지');

    const earlierVictory = { ...structuredClone(victorious), clearedStages: [1, 2], selectedStage: structuredClone(firstBattle.selectedStage), lastBattleResult: { stageId: 1, outcome: 'victory' } };
    await load(earlierVictory);
    await page.locator('.town-hub').waitFor();
    await recommendedPreparation(page, 3);
    result.checks.push('이전 장 재플레이 후에도 첫 미클리어 장으로 출전 안내');
    const allCleared = { ...structuredClone(victorious), clearedStages: stages.map(stage => stage.id), lastBattleResult: { stageId: stages.at(-1).id, outcome: 'victory' } };
    await load(allCleared);
    await page.locator('.town-hub').waitFor();
    await page.locator('.town-player-nav').getByRole('button', { name: '출전 준비', exact: true }).click();
    await page.locator('.campaign-stage-select').waitFor();
    assert.equal(await page.locator('.deployment-board-grid').count(), 0, '모든 장 클리어 후 존재하지 않는 다음 장으로 진입하지 않습니다');
    assert.equal(await stageEnabled(page, stages.at(-1).id), true);
    result.checks.push(`${stages.length}장 완료 경계와 재플레이 접근 유지`);
    await capture('all-cleared-boundary');

    assert.deepEqual(report.errors, [], '브라우저 오류와 리소스 실패가 없습니다');
    result.passed = true;
    console.log(`PASS 캠페인 진행 ${viewport.width}x${viewport.height}: 실제 패배 ${result.actualDefeats.length}회, 훈련·보상·저장·다음 장·해금 경계`);
  } catch (error) {
    result.failure = error.stack;
    await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}-failure.png`) }).catch(() => {});
    await fs.writeFile(path.join(output, `${viewport.width}x${viewport.height}-failure.txt`), `${error.stack}\n${await page.locator('body').innerText()}`).catch(() => {});
    throw error;
  } finally {
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await context.close();
  }
}

try {
  report.build = JSON.parse(await fs.readFile(path.join(root, 'dist/ota-build.json'), 'utf8'));
  assert.deepEqual(report.build, webBuildInfo(root), '현재 최종 소스와 같은 생산 빌드로 검사합니다');
  server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
  browser = await chromium.launch(qaBrowserOptions());
  for (const viewport of viewports) await runViewport(`http://127.0.0.1:${server.httpServer.address().port}`, viewport);
  assert.deepEqual(report.build, webBuildInfo(root), '검사 도중 생산 빌드 소스가 바뀌지 않았습니다');
  report.passed = true;
  console.log(`PASS 캠페인 진행 전체: ${report.results.length}개 화면, 실제 패배 ${report.results.reduce((count, result) => count + result.actualDefeats.length, 0)}회, 브라우저 오류 ${report.errors.length}건`);
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await server?.close();
}
