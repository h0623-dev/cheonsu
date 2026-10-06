import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { qaBrowserOptions } from './qa-browser.mjs';
import { confirmArtQaDeployment, confirmArtQaMission } from './art-qa-game.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getStoryPortrait } from '../src/data/storyArt.js';
import { STORY_ARCS, STORY_SCENES, getStoryArcIndex } from '../src/data/storyScenes.js';
import { getWorldScene } from '../src/data/worldArt.js';
import { stages } from '../src/data/stages.js';
import { NEW_ALLY_TEMPLATES } from '../src/data/advancedClasses.js';
import { createExpansionRecruit } from '../src/engine/promotionEngine.js';

const base = process.env.ACTUAL_GAME_URL || 'http://127.0.0.1:5189';
const key = 'cheonsu_v01_save';
const out = process.env.CHEONSU_STORY_PRODUCTION_QA_OUT || 'tmp/story-art-qa';
const viewports = [{ width: 390, height: 844 }, { width: 844, height: 390 }];
const expansionIds = Array.from({ length: 20 }, (_, index) => index + 31);
const saveKeys = [key, 'cheonsu_v01_auto_backup', 'cheonsu_v01_previous_backup',
  ...[1, 2, 3].map(slot => `cheonsu_v01_manual_slot_${slot}`)];
const legacy = JSON.parse(await fs.readFile(new URL('./fixtures/monster-save-1.99.156.json', import.meta.url), 'utf8'));
const fullParty = [...structuredClone(legacy.shared.party),
  ...Object.keys(NEW_ALLY_TEMPLATES).map(id => createExpansionRecruit(id, legacy.shared.party))];
const expansionSave = { ...structuredClone(legacy.shared), ...structuredClone(legacy.cases[0].save),
  screen: 'campaign', clearedStages: Array.from({ length: 50 }, (_, index) => index + 1),
  party: fullParty, deployedIds: fullParty.slice(0, 15).map(unit => unit.id),
  deploymentDraft: { stageId: null, placements: {} },
};
const report = { production: true, actualGameUrl: base, passed: false, legacyRegression: [], expansionScenes: [], errors: [],
  coverage: { uniqueExpansionScenes: 40, stageIds: expansionIds, sceneTypes: ['intro', 'clear'], viewports,
    sourceFixtureCoverage: 'verify-story-art.mjs separately renders all 50 chapters and all lines in its fixture; this script checks actual game UI for chapters 31–50 and the existing chapter 3 regression.',
    promotionCoverage: 'Primary-20 advanced-class dialogue and promotion checks are separate from these 40 campaign intro/clear scenes.',
    excludes: ['actual victories and first-clear rewards', 'promotion dialogue', 'full chapter 1–30 production traversal'],
  } };
const browser = await chromium.launch(qaBrowserOptions());
await fs.mkdir(out, { recursive: true });

async function savedStorage(page) {
  return page.evaluate(keys => Object.fromEntries(keys.map(saveKey => [saveKey, localStorage.getItem(saveKey)])), saveKeys);
}

async function assertSavedStorage(page, before, label) {
  assert.deepEqual(await savedStorage(page), before, `${label}: 원본 저장·자동/이전 백업·수동 슬롯을 변경하지 않습니다`);
}

async function productionPage(viewport) {
  const page = await browser.newPage({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
  page.setDefaultTimeout(25000);
  page.on('pageerror', error => report.errors.push({ viewport, message: error.message }));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/art/')) report.errors.push({ viewport, message: `${response.status()} ${response.url()}` });
  });
  await page.addInitScript(() => {
    localStorage.setItem('cheonsu_auto_patch', 'false');
    localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'off' }));
  });
  await page.goto(base);
  return page;
}

async function seedExpansionSave(page) {
  await page.evaluate(({ data, keys }) => {
    const raw = JSON.stringify(data);
    for (const saveKey of keys) localStorage.setItem(saveKey, raw);
  }, { data: expansionSave, keys: saveKeys });
  await page.reload();
  return savedStorage(page);
}

async function checkStoryLine(page, stageId, type, index, before) {
  const line = STORY_SCENES[stageId][type][index];
  const scene = page.locator(`.story-screen.story-${type}`);
  await scene.waitFor();
  assert.equal(await scene.locator('.narrative-header h1').textContent(), stages.find(stage => stage.id === stageId).title);
  assert.equal(await scene.locator('.narrative-header small').textContent(), `${STORY_ARCS[getStoryArcIndex(stageId)]} · ${type === 'intro' ? '전투 전' : '전투 후'}`,
    `${stageId}/${type}: 실제 이야기 헤더가 해당 장의 막과 전투 전/후 구분을 표시합니다`);
  assert.equal(await scene.locator('.narrative-progress').getAttribute('aria-label'), `대사 ${index + 1} / ${STORY_SCENES[stageId][type].length}`);
  assert.equal(await scene.locator('.narrative-line').textContent(), line.text, `${stageId}/${type}/${index}: 실제 대사를 순서대로 재생합니다`);
  const background = scene.locator('.narrative-background');
  const actor = scene.locator('.narrative-actor img');
  const decoded = await scene.locator('.narrative-background,.narrative-actor img').evaluateAll(async images => {
    await Promise.all(images.map(image => image.decode()));
    return images.map(image => ({ src: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight, complete: image.complete }));
  });
  assert.equal(decoded.length, 2);
  assert.ok(decoded.every(image => image.complete && image.width > 0 && image.height > 0), `${stageId}/${type}/${index}: 배경과 초상이 실제로 디코딩됩니다`);
  assert.equal(await background.getAttribute('src'), getWorldScene(stageId), `${stageId}/${type}: 해당 장의 고유 환경 원화를 표시합니다`);
  assert.equal(await actor.getAttribute('alt'), line.speaker);
  assert.equal(await actor.getAttribute('src'), getStoryPortrait(line.speaker, fullParty), `${stageId}/${type}/${index}: 실제 보유 기사단 기준 화자 초상을 표시합니다`);
  await assertSavedStorage(page, before, `${stageId}/${type}/${index}`);
  return { index, speaker: line.speaker, background: getWorldScene(stageId), portrait: await actor.getAttribute('src'), decoded: true };
}

async function replayExpansionScene(page, viewport, stageId, type) {
  const before = await seedExpansionSave(page);
  if (type === 'intro') {
    await page.getByRole('button', { name: '이어하기', exact: true }).click();
    await page.locator('.campaign-stage-select').waitFor();
    await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${stageId}장[.]`) }) }).click();
    await page.locator('.deployment-board-grid').waitFor();
    await page.getByRole('button', { name: '전투 시작', exact: true }).click();
    await confirmArtQaDeployment(page);
  } else {
    await page.locator('.journey-title').getByRole('button', { name: '기록실', exact: true }).click();
    await page.locator('.journey-library').waitFor();
    await page.locator('.library-acts').getByRole('button', { name: `제${getStoryArcIndex(stageId) + 1}막`, exact: true }).click();
    await page.getByRole('button', { name: `${stageId}장 전투 후 이야기`, exact: true }).click();
  }
  const lines = [];
  for (let index = 0; index < STORY_SCENES[stageId][type].length; index++) {
    lines.push(await checkStoryLine(page, stageId, type, index, before));
    if (index < STORY_SCENES[stageId][type].length - 1) await page.locator('.narrative-next').click();
  }
  const screenshot = `production-chapter-${stageId}-${type}-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: path.join(out, screenshot), animations: 'disabled' });
  assert.equal(await page.locator('.narrative-next').textContent(), type === 'intro' ? '계속' : '기록실로');
  await page.locator('.narrative-next').click();
  await page.locator('.story-screen').waitFor({ state: 'detached' });
  if (type === 'intro') await page.locator('.stage-mission-dialog[open]').waitFor();
  else await page.locator('.journey-library').waitFor();
  await assertSavedStorage(page, before, `${stageId}/${type}/complete`);
  report.expansionScenes.push({ viewport, stageId, type,
    path: type === 'intro' ? '원정 지도 → 출전 배치 → 도입 전 대사 → 실제 전투 미션 안내' : '메인 메뉴 → 기록실 해당 막 → 전투 후 전 대사 → 기록실 복귀',
    lines, completedThroughUi: true, saveKeysPreserved: saveKeys, screenshot,
  });
  console.log(`PASS 실제 스토리 ${viewport.width}x${viewport.height} ${stageId}장 ${type}: ${lines.length}줄 · 고유 배경/초상 디코딩 · 저장 보존`);
}

async function legacyRegression(viewport) {
    const page = await productionPage(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
    await page.getByRole('button', { name: '새 게임', exact: true }).click();
    await page.locator('.campaign-header .prominent-save').click();
    await page.evaluate(key => {
      const save = JSON.parse(localStorage.getItem(key));
      save.clearedStages = [1, 2];
      localStorage.setItem(key, JSON.stringify(save));
    }, key);
    await page.reload();
    await page.getByRole('button', { name: '이어하기', exact: true }).click();
    await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: /^3장\./ }) }).click();
    await page.getByRole('button', { name: '전투 시작', exact: true }).click();
    await confirmArtQaDeployment(page);
    const before = await page.evaluate(key => localStorage.getItem(key), key);
    await page.getByRole('button', { name: '다음', exact: true }).click();
    const actor = page.locator('.narrative-actor img');
    await actor.evaluate(img => img.decode());
    assert.equal(await actor.getAttribute('src'), getStoryPortrait('흑천 가론'));
    assert.equal(await actor.getAttribute('alt'), '흑천 가론');
    await page.screenshot({ path: path.join(out, `production-garon-${viewport.width}.png`) });
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await actor.evaluate(img => img.decode());
    assert.equal(await actor.getAttribute('src'), getStoryPortrait('카일'));
    await page.getByRole('button', { name: '이전 대사', exact: true }).click();
    assert.equal(await actor.getAttribute('src'), getStoryPortrait('흑천 가론'));
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before, 'dialogue must preserve the existing save');
    await page.getByRole('button', { name: '바로 전투', exact: true }).click();
    await confirmArtQaMission(page);
    await page.locator('.world-battlefield').waitFor();
    await page.waitForFunction(() => document.querySelector('.cinematic-command-bar .prominent-save')?.disabled === false && !document.querySelector('.boss-splash-overlay'));
    await page.locator('.cinematic-command-bar .prominent-save').click();
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(after.selectedStage.id, 3);
    assert.deepEqual(after.clearedStages, [1, 2]);
    assert.ok(after.units.filter(unit => unit.type === 'ally').every(unit => !unit.acted));
    assert.deepEqual(errors, []);
    report.legacyRegression.push({ viewport, stageId: 3, garonHeroPrevious: true, actualBattleEntry: true, progressAndActionsPreserved: true });
    } finally { await page.close(); }
}

try {
  for (const viewport of viewports) {
    await legacyRegression(viewport);
    const page = await productionPage(viewport);
    try {
      for (const stageId of expansionIds) for (const type of ['intro', 'clear']) await replayExpansionScene(page, viewport, stageId, type);
    } finally { await page.close(); }
  }
  assert.equal(new Set(report.expansionScenes.map(scene => `${scene.stageId}/${scene.type}`)).size, 40);
  assert.equal(report.expansionScenes.length, 40 * viewports.length);
  assert.deepEqual(report.errors, []);
  report.coverage.viewportSceneRuns = report.expansionScenes.length;
  report.coverage.productionLineRuns = report.expansionScenes.reduce((count, scene) => count + scene.lines.length, 0);
  report.passed = true;
  console.log(`PASS production story: 신규 40개 고유 장면 / ${report.expansionScenes.length}회 실제 UI 재생, 전 대사 고유 배경/초상 디코딩·저장 보존, 3장 가론/카일 회귀 세로·가로 유지`);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await fs.writeFile(path.join(out, 'production-story-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
