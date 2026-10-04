import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { getBattlefieldPlan } from '../src/data/battlefieldPlans.js';
import { webBuildInfo } from './update-build-info.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.env.CHEONSU_DEPLOYMENT_QA_OUT || path.join(root, 'tmp/deployment-qa'));
const saveKey = 'cheonsu_v01_save';
const settingsKey = 'cheonsu_settings_v1';
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const initialIds = ['hero', 'bram', 'lina', 'aria'];
const legacy = JSON.parse(await fs.readFile(new URL('./fixtures/monster-save-1.99.156.json', import.meta.url), 'utf8'));
const report = { production: true, passed: false, results: [], stageChecks: [], errors: [] };
let browser, server;
await fs.mkdir(output, { recursive: true });

function watch(page, viewport) {
  page.on('pageerror', error => report.errors.push({ viewport, message: error.message, stack: error.stack }));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith('http://127.0.0.1:')) report.errors.push({ viewport, message: `${response.status()} ${response.url()}` });
  });
}

async function board(page) {
  await page.locator('.deployment-board-grid').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.deployment-roster-card').length > 0);
}

async function layout(page, label) {
  await page.locator('.deployment-board img:visible').evaluateAll(async images => {
    await Promise.all(images.map(async image => { image.loading = 'eager'; await image.decode(); }));
    if (images.some(image => !image.naturalWidth)) throw new Error('배치 지도·캐릭터 이미지가 비었습니다');
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${label}: 페이지가 가로 화면을 넘지 않습니다`);
  const targets = await page.locator('.deployment-board-cell').evaluateAll(elements => elements.map(element => ({ width: element.offsetWidth, height: element.offsetHeight })));
  assert.ok(targets.length && targets.every(target => target.width >= 44 && target.height >= 44), `${label}: 지도 칸은 최소 44px 터치 영역입니다`);
  const start = page.getByRole('button', { name: '전투 시작', exact: true });
  assert.equal(await start.count(), 1, `${label}: 전투 시작 버튼은 하나입니다`);
  assert.equal(await start.isEnabled(), true, `${label}: 유효한 편성은 시작할 수 있습니다`);
}

async function placements(page) {
  return page.locator('.deployment-board-cell[data-deployment-unit]').evaluateAll(elements => Object.fromEntries(elements.filter(element => {
    const id = element.dataset.deploymentUnit;
    return id && document.querySelector(`.deployment-roster-card[data-character-id="${CSS.escape(id)}"][data-placed="true"]`);
  }).map(element => [element.dataset.deploymentUnit, { x: Number(element.dataset.deploymentX), y: Number(element.dataset.deploymentY) }])));
}

const cell = (page, point) => page.locator(`.deployment-board-cell[data-deployment-x="${point.x}"][data-deployment-y="${point.y}"]`);
const card = (page, id) => page.locator(`.deployment-roster-card[data-character-id="${id}"]`);

async function emptyCell(page, excluded = []) {
  const points = await page.locator('.deployment-board-cell[data-deployment-valid="true"][data-deployment-unit=""]').evaluateAll(elements => elements.map(element => ({ x: Number(element.dataset.deploymentX), y: Number(element.dataset.deploymentY) })));
  const point = points.find(point => !excluded.some(other => other.x === point.x && other.y === point.y));
  assert.ok(point, '실제로 표시된 배치 구역에 빈칸이 있습니다');
  return point;
}

async function selectStage(page, stageId) {
  await page.locator('.campaign-stage-select').waitFor();
  await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${stageId}장[.]`) }) }).click();
  await board(page);
}

async function startBattle(page) {
  await page.getByRole('button', { name: '전투 시작', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.final-deploy-card,.narrative-screen,.story-screen,.world-battlefield'));
  const override = page.getByRole('button', { name: '그래도 출전', exact: true });
  if (await override.count()) await override.click();
  const skip = page.getByRole('button', { name: '바로 전투', exact: true });
  if (await skip.count()) await skip.click();
  await page.locator('.world-battlefield .unit-visual-hero').waitFor();
  await page.waitForFunction(() => !document.querySelector('.battle-control-heading .prominent-save')?.disabled && !document.querySelector('.boss-splash-overlay'));
}

async function saveBattle(page) {
  await page.locator('.battle-control-heading .prominent-save').click();
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
}

async function nativePan(page, viewport) {
  if (viewport.width === 1280) return null;
  const before = await placements(page);
  await page.locator('.deployment-board-scroll').scrollIntoViewIfNeeded();
  const shell = await page.locator('.deployment-board-scroll').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, left: element.scrollLeft, top: element.scrollTop, maxX: element.scrollWidth - element.clientWidth, maxY: element.scrollHeight - element.clientHeight, touchAction: getComputedStyle(element).touchAction };
  });
  assert.ok(shell.maxX > 60 || shell.maxY > 60, '휴대폰 지도는 내부 스크롤로 전체 전장을 볼 수 있습니다');
  assert.match(shell.touchAction, /pan-x|auto/, '휴대폰의 기본 터치 스크롤을 허용합니다');
  const axis = shell.maxX > 60 ? 'x' : 'y';
  const coordinate = axis === 'x' ? shell.left : shell.top;
  const maximum = axis === 'x' ? shell.maxX : shell.maxY;
  const direction = coordinate < maximum / 2 ? -1 : 1;
  const start = { x: Math.min(viewport.width - 30, shell.x + shell.width / 2), y: Math.min(viewport.height - 35, shell.y + shell.height / 2) };
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, radiusX: 3, radiusY: 3 }] });
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (axis === 'x' ? direction * step * 11 : 0), y: start.y + (axis === 'y' ? direction * step * 11 : 0), radiusX: 3, radiusY: 3 }] });
      await page.waitForTimeout(24);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(350);
  } finally { await session.detach(); }
  const after = await page.locator('.deployment-board-scroll').evaluate(element => ({ left: element.scrollLeft, top: element.scrollTop }));
  assert.ok(Math.abs(after[axis === 'x' ? 'left' : 'top'] - coordinate) > 20, '실제 휴대폰 터치 동작으로 지도가 움직입니다');
  assert.deepEqual(await placements(page), before, '지도 터치 스크롤은 캐릭터를 잘못 배치하지 않습니다');
  return { axis, before: { left: shell.left, top: shell.top }, after };
}

async function cameraCentered(page) {
  await page.waitForFunction(() => {
    const shell = document.querySelector('.deployment-board-scroll');
    const selected = document.querySelector('.deployment-roster-card[aria-pressed="true"]');
    const id = selected?.dataset.characterId || 'hero';
    const target = [...document.querySelectorAll('.deployment-board-cell')].find(element => element.dataset.deploymentUnit === id);
    if (!shell || !target) return false;
    const left = Math.max(0, Math.min(target.offsetLeft + target.offsetWidth / 2 - shell.clientWidth / 2, shell.scrollWidth - shell.clientWidth));
    const top = Math.max(0, Math.min(target.offsetTop + target.offsetHeight / 2 - shell.clientHeight / 2, shell.scrollHeight - shell.clientHeight));
    return Math.abs(shell.scrollLeft - left) <= 2 && Math.abs(shell.scrollTop - top) <= 2;
  });
}

async function runViewport(base, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce', hasTouch: viewport.width !== 1280, isMobile: viewport.width !== 1280 });
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  watch(page, viewport);
  const result = { viewport, passed: false, checks: [] };
  report.results.push(result);
  const button = name => page.getByRole('button', { name, exact: true });
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
  const rawSave = () => page.evaluate(key => localStorage.getItem(key), saveKey);
  const load = async data => {
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: saveKey, data });
    await page.reload();
    await button('이어하기').click();
  };
  const saveDeployment = async () => {
    await button('배치 저장').click();
    const data = await saved();
    assert.equal(data.screen, 'deployment', '배치 저장은 진행 중 전투 저장으로 기록하지 않습니다');
    assert.equal(data.deploymentDraft?.stageId, data.selectedStage.id);
    assert.deepEqual(data.deploymentDraft.placements, await placements(page), '배치 저장에 지도에서 선택한 모든 좌표가 기록됩니다');
    return data;
  };
  try {
    await page.addInitScript(({ settingsKey }) => {
      localStorage.setItem('cheonsu_auto_patch', 'false');
      if (!localStorage.getItem(settingsKey)) localStorage.setItem(settingsKey, JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'off', effectsOn: true }));
    }, { settingsKey });
    await page.goto(base);
    await button('새 게임').click();
    await page.locator('.campaign-header .prominent-save').click();
    const freshCampaign = await saved();
    await selectStage(page, 1);
    assert.deepEqual(await page.locator('.deployment-roster-card').evaluateAll(elements => elements.map(element => element.dataset.characterId).sort()), [...initialIds].sort(), '보유 중인 4명만 표시하며 미보유 레온을 추가하지 않습니다');
    assert.deepEqual(Object.keys(await placements(page)).sort(), [...initialIds].sort(), '기존 출전 부대는 안전한 초기 칸에 자동 배치됩니다');
    assert.equal(await page.locator('.deployment-roster-card[aria-pressed="true"]').count(), 0, '처음에는 이동 대상을 임의로 선택하지 않습니다');
    await layout(page, '초기 배치');
    result.checks.push('실제 새 게임 보유 4명만 표시', '안전한 초기 배치와 단일 시작 버튼');

    const initial = await placements(page);
    await card(page, 'bram').click();
    assert.deepEqual(await placements(page), initial, '보유 캐릭터 클릭은 즉시 배치 해제를 하지 않습니다');
    const destination = await emptyCell(page, Object.values(initial));
    await cell(page, destination).click();
    assert.deepEqual((await placements(page)).bram, destination, '선택한 캐릭터는 허용 칸 클릭으로 이동합니다');
    result.checks.push('보유 캐릭터 선택 후 허용 칸 클릭 이동');

    const priorSwap = await placements(page);
    await cell(page, priorSwap.lina).click();
    const swapped = await placements(page);
    assert.deepEqual(swapped.bram, priorSwap.lina);
    assert.deepEqual(swapped.lina, priorSwap.bram, '배치된 아군끼리는 겹치지 않고 자리 교환합니다');
    await card(page, 'lina').click();
    await button('배치 해제').click();
    assert.equal(await card(page, 'lina').getAttribute('data-placed'), 'false');
    const removed = await placements(page);
    assert.equal(Object.keys(removed).length, 3);
    await cell(page, removed.hero).click();
    assert.deepEqual(await placements(page), removed, '미배치 캐릭터는 다른 아군을 밀어내지 않습니다');
    const readd = await emptyCell(page);
    await cell(page, readd).click();
    assert.deepEqual((await placements(page)).lina, readd, '해제한 보유 캐릭터를 빈칸에 다시 배치합니다');
    await card(page, 'hero').click();
    assert.equal(await button('배치 해제').isDisabled(), true, '주인공은 출전 해제할 수 없습니다');
    const beforeBlocked = await placements(page);
    const invalid = page.locator('.deployment-board-cell[data-deployment-valid="false"][data-deployment-unit=""]').first();
    assert.equal(await invalid.isDisabled(), true, '배치 구역 밖과 막힌 칸은 클릭할 수 없습니다');
    await invalid.click({ force: true });
    assert.deepEqual(await placements(page), beforeBlocked);
    result.checks.push('아군 자리 교환', '해제·재배치와 점유 칸 보호', '주인공 출전 유지', '배치 불가 칸 입력 차단');

    result.nativePan = await nativePan(page, viewport);
    if (result.nativePan) result.checks.push('실제 모바일 터치 스크롤과 오배치 방지');
    if (viewport.width !== 1280) {
      const beforeRotation = await placements(page);
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await cameraCentered(page);
      await layout(page, '모바일 화면 회전');
      assert.deepEqual(await placements(page), beforeRotation, '화면 회전은 배치 좌표를 변경하지 않습니다');
      await page.setViewportSize(viewport);
      await cameraCentered(page);
      assert.deepEqual(await placements(page), beforeRotation);
      result.checks.push('화면 회전 후 배치·선택 위치와 카메라 복구');
    }
    const pending = await saveDeployment();
    const pendingRaw = await rawSave();
    const finalCoordinates = await placements(page);
    for (const field of ['gold', 'inventory', 'clearedStages', 'gearInventory', 'gearEnhance', 'exploration', 'supportPoints', 'supportDialoguesSeen']) assert.deepEqual(pending[field], freshCampaign[field], `배치 저장은 ${field}를 변경하지 않습니다`);
    await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}-deployment.png`) });
    await page.reload();
    await button('이어하기').click();
    await board(page);
    assert.equal(await rawSave(), pendingRaw, '배치 이어하기 자체는 저장 문자열을 덮어쓰지 않습니다');
    assert.deepEqual(await placements(page), finalCoordinates, '배치 저장을 이어하면 직접 정한 위치를 복원합니다');
    await layout(page, '배치 이어하기');
    result.checks.push('배치 저장·이어하기와 진행도·수집 보존');

    await startBattle(page);
    const started = await saveBattle(page);
    assert.equal(started.round, 1);
    assert.equal(started.turn, 'ally');
    const actualCoordinates = Object.fromEntries(started.units.filter(unit => unit.type === 'ally').map(unit => [unit.id, { x: unit.x, y: unit.y }]));
    assert.deepEqual(actualCoordinates, finalCoordinates, '실제 시작 전투가 직접 배치한 좌표를 유지합니다');
    assert.ok(started.units.filter(unit => unit.type === 'ally').every(unit => !unit.acted && !unit.moved && unit.hp === unit.maxHp), '배치는 행동·이동·HP를 소모하지 않습니다');
    await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}-battle.png`) });
    result.checks.push('실제 전투 시작 좌표 유지와 턴·행동·HP 미소모');

    const ongoing = structuredClone(started);
    ongoing.round = 3;
    // The existing save reader fills absent enemy status arrays. Use its established
    // explicit serialized shape so this check measures battle changes, not that migration.
    ongoing.units = ongoing.units.map(unit => ({ ...unit, status: unit.status || [] }));
    const ongoingLina = ongoing.units.find(unit => unit.id === 'lina');
    ongoingLina.hp = Math.max(1, ongoingLina.maxHp - 3);
    ongoingLina.moved = true;
    ongoingLina.status = [{ type: 'poison', turns: 2 }];
    ongoing.deploymentDraft = { stageId: started.selectedStage.id, placements: Object.fromEntries(initialIds.map(id => [id, { x: 127, y: 127 }])) };
    await load(ongoing);
    await page.locator('.world-battlefield .unit-visual-hero').waitFor();
    await page.waitForFunction(() => !document.querySelector('.battle-control-heading .prominent-save')?.disabled);
    assert.deepEqual(await saved(), ongoing, '진행 중 전투 이어하기는 기존 저장을 변경하지 않습니다');
    const resumed = await saveBattle(page);
    assert.deepEqual(resumed.units, ongoing.units, '배치 초안이 있어도 기존 전투 좌표·HP·상태·장비·행동 정보를 유지합니다');
    assert.equal(resumed.round, ongoing.round);
    assert.equal(resumed.turn, ongoing.turn);
    result.checks.push('진행 중 전투의 좌표·HP·상태·장비·턴·행동 정보 보존');

    const tampered = structuredClone(freshCampaign);
    tampered.screen = 'deployment';
    tampered.selectedStage = freshCampaign.selectedStage || { id: 1 };
    tampered.currentStageId = 1;
    tampered.deployedIds = ['enemy1', 'leon', 'hero', 'hero', 'bram', 'lina', 'aria'];
    tampered.deploymentDraft = { stageId: 1, placements: { enemy1: { x: 0, y: 0 }, leon: { x: 1, y: 1 }, hero: { x: 127, y: 127 }, bram: { x: 1.5, y: 2 }, lina: { x: -1, y: 0 }, aria: { x: 0, y: 0 }, constructor: { x: 1, y: 1 } } };
    await load(tampered);
    await board(page);
    assert.deepEqual(Object.keys(await placements(page)).sort(), [...initialIds].sort(), '잘못된 저장에서 적·미보유·중복 캐릭터를 배치하지 않습니다');
    const cleaned = await saveDeployment();
    assert.ok(!Object.hasOwn(cleaned.deploymentDraft.placements, 'enemy1') && !Object.hasOwn(cleaned.deploymentDraft.placements, 'leon') && !Object.hasOwn(cleaned.deploymentDraft.placements, 'constructor'));
    assert.ok(Object.values(cleaned.deploymentDraft.placements).every(point => point.x >= 0 && point.x < 127 && point.y >= 0 && point.y < 127 && Number.isInteger(point.x) && Number.isInteger(point.y)));
    result.checks.push('잘못된 초안·좌표·적·미보유·중복 인물 제외');

    const mismatch = { ...structuredClone(pending), deploymentDraft: { stageId: 2, placements: structuredClone(finalCoordinates) } };
    await load(mismatch);
    await board(page);
    assert.deepEqual(await placements(page), initial, '다른 장의 배치 초안은 현재 전장에 적용하지 않습니다');
    const beforeAuto = await placements(page);
    await card(page, 'bram').click();
    await cell(page, await emptyCell(page, Object.values(beforeAuto))).click();
    await button('자동 배치').click();
    assert.deepEqual(await placements(page), initial, '자동 배치는 출전 인물을 바꾸지 않고 안전한 초기 위치로 되돌립니다');
    result.checks.push('다른 장 초안 제외와 자동 배치');

    for (const legacyCase of legacy.cases) {
      const baseline = { ...structuredClone(legacy.shared), ...structuredClone(legacyCase.save) };
      await load(baseline);
      await page.locator('.world-battlefield .unit-visual-hero').waitFor();
      await page.waitForFunction(() => !document.querySelector('.battle-control-heading .prominent-save')?.disabled && !document.querySelector('.boss-splash-overlay'));
      assert.deepEqual(await saved(), baseline, '기존 1.99.156 전투 저장 이어하기는 읽기만 합니다');
      const reSaved = await saveBattle(page);
      assert.deepEqual(reSaved.units, baseline.units, '기존 전투의 유닛 전체 필드를 보존합니다');
      assert.deepEqual(reSaved.selectedStage.units, baseline.selectedStage.units, '기존 저장 전장의 적 전체 구성을 보존합니다');
      for (const field of ['party', 'gold', 'inventory', 'clearedStages', 'gearInventory', 'gearEnhance', 'supportPoints', 'supportDialoguesSeen', 'exploration', 'stageNotes', 'stageMastery', 'claimedAchievements', 'claimedMasteryRewards', 'snapshotGallery']) assert.deepEqual(reSaved[field], baseline[field], `기존 저장 ${field} 보존`);
    }
    result.checks.push(`실제 1.99.156 전투 저장 ${legacy.cases.length}건의 전체 유닛·진행도 보존`);

    if (viewport.width === 1280) {
      const campaign = { ...structuredClone(legacy.shared), ...structuredClone(legacy.cases[0].save), screen: 'campaign', clearedStages: Array.from({ length: 29 }, (_, index) => index + 1), deployedIds: legacy.shared.party.slice(0, 15).map(unit => unit.id) };
      for (let stageId = 1; stageId <= 30; stageId++) {
        await load(campaign);
        await selectStage(page, stageId);
        assert.equal(await page.locator('.deployment-roster-card').count(), 17, `${stageId}장: 보유 캐릭터 17명을 표시합니다`);
        const assigned = await placements(page);
        assert.equal(Object.keys(assigned).length, 15, `${stageId}장: 최대 15명만 배치됩니다`);
        assert.ok(Object.hasOwn(assigned, 'hero'), `${stageId}장: 주인공을 배치합니다`);
        const valid = await page.locator('.deployment-board-cell[data-deployment-valid="true"]').count();
        assert.ok(valid >= 15, `${stageId}장: 15명 이상 놓을 안전한 배치 칸이 있습니다`);
        assert.equal(new Set(Object.values(assigned).map(point => `${point.x},${point.y}`)).size, 15, `${stageId}장: 배치 칸이 겹치지 않습니다`);
        assert.ok(await page.locator('.deployment-roster-card[data-placed="false"]').count() === 2);
        const unplaced = await page.locator('.deployment-roster-card[data-placed="false"]').first().getAttribute('data-character-id');
        await card(page, unplaced).click();
        await cell(page, await emptyCell(page)).click();
        assert.deepEqual(await placements(page), assigned, `${stageId}장: 16번째 인물을 추가할 수 없습니다`);
        assert.equal(await button('전투 시작').isEnabled(), true);
        const direction = getBattlefieldPlan(stageId).direction;
        const stageCheck = { stageId, direction, owned: 17, placed: 15, validCells: valid, unique: true, limitProtected: true, started: false, coordinatesPreserved: false, enemyCoordinatesPreserved: false };
        report.stageChecks.push(stageCheck);
        const enemiesBefore = await page.locator('.deployment-board-cell.is-enemy').evaluateAll(elements => Object.fromEntries(elements.map(element => [element.dataset.deploymentUnit, { x: Number(element.dataset.deploymentX), y: Number(element.dataset.deploymentY) }])));
        await card(page, 'hero').click();
        const manualDestination = await emptyCell(page);
        await cell(page, manualDestination).click();
        const manuallyAssigned = await placements(page);
        assert.deepEqual(manuallyAssigned.hero, manualDestination, `${stageId}장: 주인공을 안전한 빈칸에 직접 이동합니다`);
        assert.notDeepEqual(manuallyAssigned.hero, assigned.hero, `${stageId}장: 자동 배치와 다른 수동 위치를 검사합니다`);
        if ([1, 8, 15, 22, 30].includes(stageId)) await page.screenshot({ path: path.join(output, `stage-${stageId}-deployment.png`) });
        await startBattle(page);
        const actualBattle = await saveBattle(page);
        stageCheck.started = true;
        assert.equal(actualBattle.selectedStage.id, stageId, `${stageId}장: 선택한 전장을 실제로 시작합니다`);
        const actualAllies = actualBattle.units.filter(unit => unit.type === 'ally');
        assert.equal(actualAllies.length, 15, `${stageId}장: 실제 전투에 정확히 15명을 출전시킵니다`);
        assert.deepEqual(Object.fromEntries(actualAllies.map(unit => [unit.id, { x: unit.x, y: unit.y }])), manuallyAssigned, `${stageId}장: 실제 전투가 직접 배치한 모든 좌표를 유지합니다`);
        stageCheck.coordinatesPreserved = true;
        assert.deepEqual(Object.fromEntries(actualBattle.units.filter(unit => unit.type !== 'ally').map(unit => [unit.id, { x: unit.x, y: unit.y }])), enemiesBefore, `${stageId}장: 수동 아군 배치는 적 구성·좌표를 변경하지 않습니다`);
        stageCheck.enemyCoordinatesPreserved = true;
        assert.equal(actualBattle.round, 1, `${stageId}장: 배치가 턴을 소모하지 않습니다`);
        assert.equal(actualBattle.turn, 'ally', `${stageId}장: 아군 첫 턴으로 시작합니다`);
        assert.ok(actualAllies.every(unit => !unit.acted && !unit.moved && unit.hp === unit.maxHp), `${stageId}장: 배치는 행동·이동·HP를 소모하지 않습니다`);
        stageCheck.actionsUnspent = true;
        console.log(`PASS ${stageId}장 전투 시작: 수동 배치 15명 좌표 유지, 적 ${Object.keys(enemiesBefore).length}명 위치 유지, 아군 첫 턴`);
        await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
      }
      assert.equal(new Set(report.stageChecks.map(stage => stage.direction)).size, 8, '30개 장의 모든 진입 방향을 검사합니다');
      result.checks.push('30개 장·8개 진입 방향·보유17명·최대15명·16번째 차단');
      assert.ok(report.stageChecks.every(stage => stage.started && stage.coordinatesPreserved && stage.enemyCoordinatesPreserved && stage.actionsUnspent));
      result.checks.push('30개 장·15명 실제 전투에서 직접 배치·적 위치·아군 첫 턴·행동 미소모 유지');

      await load(pending);
      await board(page);
      await page.evaluate(key => {
        const settings = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({ ...settings, cutsceneMode: 'full' }));
      }, settingsKey);
      await page.reload();
      await button('이어하기').click();
      await board(page);
      await button('전투 시작').click();
      await page.waitForFunction(() => document.querySelector('.story-screen,.narrative-screen'));
      assert.equal(await page.locator('.world-battlefield').count(), 0, '도입 대화가 끝나기 전에 전투를 시작하지 않습니다');
      await button('바로 전투').click();
      await page.locator('.world-battlefield .unit-visual-hero').waitFor();
      await page.waitForFunction(() => !document.querySelector('.battle-control-heading .prominent-save')?.disabled);
      const afterStory = await saveBattle(page);
      assert.deepEqual(Object.fromEntries(afterStory.units.filter(unit => unit.type === 'ally').map(unit => [unit.id, { x: unit.x, y: unit.y }])), finalCoordinates, '도입 대화 후에도 배치 좌표를 유지합니다');
      await page.evaluate(key => {
        const settings = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({ ...settings, cutsceneMode: 'off' }));
      }, settingsKey);
      const defeated = structuredClone(started);
      defeated.units = defeated.units.filter(unit => unit.id !== 'hero');
      await load(defeated);
      await page.locator('.defeat-dialog[open]').waitFor();
      await button('재도전').click();
      await board(page);
      assert.equal(await page.locator('.world-battlefield').count(), 0, '패배 후 재도전은 곧바로 전투를 시작하지 않고 배치 화면을 엽니다');
      assert.ok(Object.hasOwn(await placements(page), 'hero'));
      const victorious = structuredClone(started);
      victorious.units = victorious.units.filter(unit => unit.type === 'ally');
      await load(victorious);
      await page.locator('.victory-dialog[open]').waitFor();
      await button('다음 스테이지').click();
      await page.waitForFunction(() => document.querySelector('.deployment-board-grid,.story-screen,.narrative-screen'));
      // The existing chapter-clear dialogue may precede the next preparation screen.
      if (await page.locator('.story-screen,.narrative-screen').count()) await button('건너뛰기').click();
      await board(page);
      assert.equal(await page.locator('.world-battlefield').count(), 0, '승리 후 다음 장도 배치 단계를 엽니다');
      const nextPreparation = await saveDeployment();
      assert.equal(nextPreparation.deploymentDraft.stageId, 2, '다음 장에서는 이전 장의 배치 초안을 사용하지 않습니다');
      result.checks.push('도입 대화 후 배치 유지', '패배 재도전 시 배치 단계 진입', '승리 후 다음 장 배치 단계 진입');
    }
    assert.deepEqual(report.errors, [], '브라우저 오류·이미지 실패가 없습니다');
    result.passed = true;
    console.log(`PASS 전투 전 배치 ${viewport.width}x${viewport.height}: 실제 선택·이동·교환·저장·전투 시작·기존 저장 보존${result.nativePan ? '·터치 이동' : ''}`);
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
  browser = await chromium.launch({ headless: true, ...(process.env.CHEONSU_QA_BROWSER ? { channel: process.env.CHEONSU_QA_BROWSER } : {}) });
  for (const viewport of viewports) await runViewport(`http://127.0.0.1:${server.httpServer.address().port}`, viewport);
  assert.deepEqual(report.build, webBuildInfo(root), '검사 도중 생산 빌드의 소스가 변경되지 않았습니다');
  report.passed = true;
  console.log(`PASS 전투 전 배치 전체: ${report.results.length}개 화면, ${report.stageChecks.length}개 장, 브라우저 오류 ${report.errors.length}건`);
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await server?.close();
}
