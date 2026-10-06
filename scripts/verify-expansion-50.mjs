import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { qaBrowserOptions } from './qa-browser.mjs';
import { startDeploymentBattle, waitForDeployment } from './qa-deployment-flow.mjs';
import { webBuildInfo } from './update-build-info.mjs';
import { stages } from '../src/data/stages.js';
import { RECRUIT_BY_STAGE, getCharacterCollection } from '../src/data/characterCollection.js';
import { NEW_ALLY_TEMPLATES, ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { createExpansionRecruit, getAdvancedSealBalance } from '../src/engine/promotionEngine.js';
import { getStageMission } from '../src/engine/stageMission.js';
import { getStageEnemyLevel } from '../src/engine/enemyProgression.js';
import { EXPANSION_MONSTER_KEYS, EXPANSION_BOSS_KEYS, createExpansionEnemy } from '../src/data/expansionEnemies.js';
import { NEW_TERRAIN_POLICIES, isDeploymentTerrainUnsafe } from '../src/data/terrainPolicy.js';
import { getCharacterArt } from '../src/data/characterArt.js';
import { isTerrainBlocked } from '../src/engine/movement.js';
import { STORY_SCENES, getStoryArcIndex } from '../src/data/storyScenes.js';
import { storySpeakerKeys } from '../src/data/storyArt.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.env.CHEONSU_EXPANSION_QA_OUT || path.join(root, 'tmp/expansion-50-qa'));
const saveKey = 'cheonsu_v01_save';
const legacy = JSON.parse(await fs.readFile(new URL('./fixtures/monster-save-1.99.156.json', import.meta.url), 'utf8'));
const newIds = Object.keys(NEW_ALLY_TEMPLATES);
const fullParty = [...structuredClone(legacy.shared.party), ...newIds.map(id => createExpansionRecruit(id, legacy.shared.party))];
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 740 }];
const report = { production: true, passed: false, stageChecks: [], promotionChecks: [], recruitChecks: [], counterChecks: [], results: [], errors: [] };
const sequential = count => Array.from({ length: count }, (_, index) => index + 1);
const preserved = ['gold', 'inventory', 'gearInventory', 'gearEnhance', 'exploration', 'stageNotes', 'stageMastery', 'claimedAchievements', 'claimedMasteryRewards', 'snapshotGallery'];
let browser, server;
await fs.mkdir(output, { recursive: true });

async function ensureLayout(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${label}: 페이지 가로 넘침이 없습니다`);
  const overflow = await page.locator('.advanced-promotion-form,.collection-card,dialog[open]').evaluateAll(elements => elements
    .filter(element => element.scrollWidth > element.clientWidth + 2).map(element => element.className));
  assert.deepEqual(overflow, [], `${label}: 전직/도감/모달의 문구·버튼이 가로 너비를 넘지 않습니다`);
  const bounds = await page.locator('dialog[open]').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  }));
  assert.ok(bounds.every(rect => rect.x >= -1 && rect.y >= -1 && rect.right <= rect.width + 1 && rect.bottom <= rect.height + 1), `${label}: 모달 외곽은 모바일 화면 안에 있습니다`);
  await page.locator('dialog[open] img:visible,.collection-art img').evaluateAll(async images => {
    await Promise.all(images.map(async image => { image.loading = 'eager'; await image.decode(); }));
    if (images.some(image => !image.naturalWidth || !image.naturalHeight)) throw Error('신규 캐릭터·전직·도감 이미지가 비었습니다');
  });
}

async function readyBattle(page) {
  await page.locator('.world-battlefield .unit-visual-hero').waitFor();
  await page.waitForFunction(() => !document.querySelector('.stage-mission-dialog[open],.boss-splash-overlay,.stage-directing-banner.stage-banner-start')
    && !document.querySelector('.battle-control-heading .prominent-save')?.disabled);
}

async function actualUnitArt(page, id, artId = id) {
  const images = page.locator(`.world-battlefield .unit[data-unit-id="${id}"] img`);
  await images.evaluateAll(async elements => { await Promise.all(elements.map(image => image.decode())); });
  const sources = await images.evaluateAll(elements => elements.map(image => ({ src: image.getAttribute('src'), width: image.naturalWidth })));
  assert.ok(sources.length && sources.every(image => image.width > 0 && image.src === getCharacterArt(artId).map), `${id}: ${artId}에 연결된 실제 지도 스프라이트를 표시합니다`);
}

async function beginBattle(page) {
  await startDeploymentBattle(page);
}

async function openPromotion(page) {
  const management = page.locator('.camp-management');
  if (!(await management.evaluate(element => element.open))) await page.locator('.camp-management > summary').click();
  await page.getByRole('tab', { name: '성장', exact: true }).click();
  await page.locator('.camp-tab-panel[aria-label="성장"]').getByRole('button', { name: '전직', exact: true }).click();
  await page.locator('.promotion-dialog[open]').waitFor();
}

async function runViewport(base, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce', hasTouch: viewport.width !== 1280, isMobile: viewport.width !== 1280 });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('pageerror', error => report.errors.push({ viewport, message: error.message, stack: error.stack }));
  page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(base)) report.errors.push({ viewport, message: `${response.status()} ${response.url()}` }); });
  const result = { viewport, passed: false, stagesStarted: 0, formsSelected: 0, actualVictoryAttacks: 0, checks: [] };
  report.results.push(result);
  const button = name => page.getByRole('button', { name, exact: true });
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
  const rawSaved = () => page.evaluate(key => localStorage.getItem(key), saveKey);
  const saveBattle = async () => { await page.locator('.battle-control-heading .prominent-save').click(); return saved(); };
  const saveCamp = async () => { await page.locator('.camp-header .prominent-save').click(); return saved(); };
  const load = async (data, completedCount) => {
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: saveKey, data });
    await page.reload();
    if (completedCount !== undefined) assert.match(await page.locator('.journey-resume small').innerText(), new RegExp(` · ${completedCount}/50장 완료$`), '메인 메뉴 이어하기는 50장 기준의 완료 진행도를 표시합니다');
    await button('이어하기').click();
  };
  const selectStage = async id => {
    await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${id}장[.]`) }) }).click();
    await waitForDeployment(page);
  };
  const source = { ...structuredClone(legacy.shared), ...structuredClone(legacy.cases[0].save),
    screen: 'campaign', clearedStages: sequential(49), party: structuredClone(fullParty),
    deployedIds: ['hero', ...newIds, ...legacy.shared.party.filter(unit => unit.id !== 'hero').slice(0, 10).map(unit => unit.id)],
  };
  try {
    await page.addInitScript(() => {
      localStorage.setItem('cheonsu_auto_patch', 'false');
      localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'off', effectsOn: false, battleSpeed: 'turbo', battleSpeedRevision: 1 }));
      Math.random = () => .5;
    });
    await page.goto(base);
    const oldCompleted = { ...structuredClone(source), party: structuredClone(legacy.shared.party), clearedStages: sequential(30), unlockedStages: sequential(30) };
    await load(oldCompleted, 30);
    await page.locator('.campaign-stage-select').waitFor();
    assert.equal(await page.locator('.campaign-stage-select .world-stage-node').count(), 50, '원정 지도가 전체 50장을 표시합니다');
    const stageButton = id => page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${id}장[.]`) }) });
    assert.equal(await stageButton(31).isEnabled(), true, '기존 30장 완료 저장에서 31장을 엽니다');
    assert.equal(await stageButton(32).isEnabled(), false, '31장 승리 전에는 32장을 잠급니다');
    assert.deepEqual(await saved(), oldCompleted, '캠페인 확장 이어하기는 원래 저장을 덮어쓰지 않습니다');
    await page.locator('.campaign-header .prominent-save').click();
    const restoredOld = await saved();
    for (const field of preserved) assert.deepEqual(restoredOld[field], oldCompleted[field], `구버전 확장 ${field} 보존`);
    assert.deepEqual(restoredOld.clearedStages, sequential(30));
    result.checks.push('구버전 30장 완료 → 31장만 해금 · 저장 원본/진행/수집/장비 보존');

    const ids = viewport.width === 390 ? sequential(50).slice(30) : [31, 35, 40, 45, 50];
    for (const id of ids) {
      await load(source);
      await selectStage(id);
      assert.equal(await page.locator('.deployment-roster-card').count(), 21, '보유 아군 21명을 표시합니다');
      assert.equal(await page.locator('.deployment-roster-card[data-placed="true"]').count(), 15, '최대 출전 인원은 기존 15명입니다');
      for (const newId of newIds) assert.equal(await page.locator(`.deployment-roster-card[data-character-id="${newId}"]`).count(), 1);
      const manual = await page.locator('.deployment-board-cell[data-deployment-unit]').evaluateAll(elements => Object.fromEntries(elements.filter(element => element.dataset.deploymentUnit
        && document.querySelector(`.deployment-roster-card[data-character-id="${CSS.escape(element.dataset.deploymentUnit)}"][data-placed="true"]`))
        .map(element => [element.dataset.deploymentUnit, { x: Number(element.dataset.deploymentX), y: Number(element.dataset.deploymentY) }])));
      await beginBattle(page);
      const battle = await saveBattle();
      assert.equal(battle.selectedStage.id, id);
      const allies = battle.units.filter(unit => unit.type === 'ally'), enemies = battle.units.filter(unit => unit.type !== 'ally');
      assert.equal(allies.length, 15);
      assert.deepEqual(Object.fromEntries(allies.map(unit => [unit.id, { x: unit.x, y: unit.y }])), manual);
      for (const newId of newIds) {
        assert.ok(allies.some(unit => unit.id === newId), `${newId}를 실제 새 전장에 출전시킵니다`);
        await actualUnitArt(page, newId);
      }
      assert.ok(enemies.length && enemies.every(enemy => enemy.expansionEnemy && enemy.expansionStatsStage === id && enemy.level === getStageEnemyLevel(id, enemy)), '초기·추가 적 전체가 새 종/해당 장 레벨 곡선을 사용합니다');
      assert.ok(enemies.every(enemy => enemy.hp === enemy.maxHp && enemy.maxHp > 0 && enemy.atk > 0 && enemy.def >= 0));
      const terrain = [...new Set(battle.selectedStage.map.flat().filter(tile => Object.hasOwn(NEW_TERRAIN_POLICIES, tile)))];
      assert.ok(terrain.length > 0, '실제 새 전장에 신규 지형이 있습니다');
      await page.locator('.battle-control-heading').getByRole('button', { name: '미션 보기', exact: true }).click();
      const mission = page.locator('.stage-mission-dialog[open]');
      assert.deepEqual(await mission.locator('.stage-mission-victory li').allTextContents(), getStageMission(battle.selectedStage).victoryConditions.map(condition => condition.text));
      assert.deepEqual(await mission.locator('.stage-mission-defeat li').allTextContents(), getStageMission(battle.selectedStage).defeatConditions.map(condition => condition.text));
      await ensureLayout(page, `${id}장`);
      if ([35, 40, 45, 50].includes(id)) await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}-stage-${id}-mission.png`) });
      await page.keyboard.press('Escape');
      await readyBattle(page);
      const beforeResume = await saveBattle();
      await load(beforeResume);
      await readyBattle(page);
      assert.deepEqual(await saved(), beforeResume);
      const afterResume = await saveBattle();
      assert.deepEqual(afterResume.units, beforeResume.units.map(unit => ({ ...unit, status: unit.status ?? [] })), '신규 전투 저장 HP/좌표/행동/전직/적 스탯을 재보정하지 않습니다');
      report.stageChecks.push({ viewport, id, allies: allies.length, owned: 21, enemies: enemies.length, terrains: terrain,
        bosses: enemies.filter(enemy => enemy.type === 'boss').map(enemy => enemy.name), realBattleEntry: true, missionMatches: true, resumePreserved: true });
      result.stagesStarted++;
      console.log(`PASS 확장 ${viewport.width}x${viewport.height} ${id}장: 21명 보유/15명 출전, 적 ${enemies.length}명, 신규 지형/미션/저장 유지`);
    }

    const promotionSource = { ...structuredClone(source), screen: 'camp', gold: 10000, lastBattleResult: { stageId: 49, outcome: 'victory' },
      party: fullParty.map(unit => ({ ...structuredClone(unit), promoted: true, advancedMastery: 3, hp: 2 })) };
    await load(promotionSource);
    await page.locator('.town-hub').waitFor();
    const beforePromotion = await saveCamp();
    await openPromotion(page);
    assert.equal(await page.locator('[data-advanced-unit]').count(), 21);
    assert.equal(await page.locator('button[data-advanced-select]').count(), 42, '21명 각각 두 전직 분기를 제공합니다');
    await ensureLayout(page, '최상위 전직');
    const promotedIds = viewport.width === 390 ? Object.keys(ADVANCED_CLASSES) : ['hero', ...newIds];
    const selectedPromotionIds = new Set();
    const assertPromotionStats = (save, id, form) => {
      const unit = save.party.find(ally => ally.id === id);
      const before = beforePromotion.party.find(ally => ally.id === id);
      assert.equal(unit.advancedClass, form.id, `${id}: 선택한 분기를 실제 저장합니다`);
      assert.deepEqual(unit.advancedClassBonus, form.bonuses, '저장한 전직 보정은 현재 선택 분기와 일치합니다');
      for (const [stat, bonus] of [['maxHp', 'hp'], ['baseAtk', 'atk'], ['baseDef', 'def'], ['move', 'move']]) {
        assert.equal(unit[stat], before[stat] + form.bonuses[bonus], `${id}/${stat}: 중복 클릭·반복 분기 변경으로 능력치를 누적하지 않습니다`);
      }
      assert.equal(unit.hp, 2, '각 전직 분기에서 부상 HP를 회복하지 않습니다');
      assert.equal(unit.advancedClassSealUsed, true);
      assert.equal(unit.activeSkillId, form.skill.id, '각 전직 분기의 기술을 실제 선택 상태로 저장합니다');
      assert.deepEqual(unit.equipment, before.equipment, '각 전직 분기에서 기존 장비를 유지합니다');
    };
    for (const id of promotedIds) for (const form of ADVANCED_CLASSES[id]) {
      const art = page.locator(`[data-advanced-form="${form.id}"] > img`);
      assert.equal(await art.getAttribute('src'), getCharacterArt(form.id).motion.recover, `${form.name}: 폼별 실제 전투 원화를 사용합니다`);
      const choice = page.locator(`button[data-advanced-select="${form.id}"]`);
      assert.equal(await choice.isEnabled(), true, `${form.name} 실제 선택이 가능합니다`);
      if (id === 'hero' && form === ADVANCED_CLASSES.hero[0]) {
        await choice.evaluate(element => { element.click(); element.click(); });
      } else await choice.click();
      assert.equal(await choice.isDisabled(), true, '현재 분기의 중복 선택을 차단합니다');
      selectedPromotionIds.add(id);
      await page.keyboard.press('Escape');
      await page.locator('.promotion-dialog').waitFor({ state: 'detached' });
      const selectionSave = await saveCamp();
      assertPromotionStats(selectionSave, id, form);
      assert.equal(selectionSave.gold, promotionSource.gold, '최초 전직·첫 분기 변경은 골드를 차감하지 않습니다');
      assert.equal(getAdvancedSealBalance(selectionSave.party, selectionSave.clearedStages).spent, selectedPromotionIds.size, '각 동료 최초 선택에 인장 한 개만 소모합니다');
      const selectedUnit = selectionSave.party.find(unit => unit.id === id);
      assert.equal(selectedUnit.advancedClassChanges, ADVANCED_CLASSES[id].indexOf(form), '최초 선택·첫 변경 횟수를 각각 저장합니다');
      report.promotionChecks.push({ viewport, id, form: form.id, selectedInProductionUi: true, actualSavedStatsChecked: true,
        maxHp: selectedUnit.maxHp, hp: selectedUnit.hp, baseAtk: selectedUnit.baseAtk, baseDef: selectedUnit.baseDef, move: selectedUnit.move,
        spentSeals: selectedPromotionIds.size, gold: selectionSave.gold });
      result.formsSelected++;
      console.log(`PASS 전직 ${viewport.width}x${viewport.height} ${selectedUnit.name} ${form.name}: 실제 저장 능력치/HP/기술/장비, 인장 ${selectedPromotionIds.size}개, ${selectionSave.gold}G`);
      await openPromotion(page);
    }
    const heroA = ADVANCED_CLASSES.hero[0], heroChoice = page.locator(`button[data-advanced-select="${heroA.id}"]`);
    // Submit two same-task events while the paid change is still enabled; the busy guard must charge once.
    await heroChoice.evaluate(element => { element.click(); element.click(); });
    assert.equal(await heroChoice.isDisabled(), true);
    await heroChoice.evaluate(element => element.click());
    await page.keyboard.press('Escape');
    await page.locator('.promotion-dialog').waitFor({ state: 'detached' });
    const promoted = await saveCamp();
    assert.equal(promoted.gold, promotionSource.gold - 300, '첫 분기 변경 무료·두 번째 변경 300G·중복 입력 비용 없음');
    assert.equal(promoted.party.find(unit => unit.id === 'hero').advancedClass, heroA.id);
    for (const id of promotedIds) {
      const unit = promoted.party.find(unit => unit.id === id);
      assert.equal(unit.advancedClassSealUsed, true);
      assert.equal(unit.hp, 2, '최상위 전직/분기 변경으로 부상 HP를 회복하지 않습니다');
      assert.equal(unit.advancedClass, id === 'hero' ? heroA.id : ADVANCED_CLASSES[id][1].id);
      const form = ADVANCED_CLASSES[id].find(entry => entry.id === unit.advancedClass);
      assertPromotionStats(promoted, id, form);
      assert.deepEqual(unit.equipment, promotionSource.party.find(unit => unit.id === id).equipment);
    }
    assert.deepEqual(promoted.inventory, promotionSource.inventory, '전직인장은 기존 소모품 저장을 바꾸지 않습니다');
    assert.equal(getAdvancedSealBalance(promoted.party, promoted.clearedStages).spent, promotedIds.length);
    await load(promoted);
    await page.locator('.town-hub').waitFor();
    assert.deepEqual((await saveCamp()).party, promoted.party, '최상위 전직·숙련·분기 보너스·HP·장비를 재로드해도 중복 적용하지 않습니다');
    const beforeReplay = await rawSaved();
    await page.locator('.town-player-nav').getByRole('button', { name: '기록실', exact: true }).click();
    for (const [stageId, id] of [[1, 'hero'], [32, 'mare'], [37, 'harin'], [42, 'edan'], [47, 'sylvan']]) {
      const lines = STORY_SCENES[stageId].intro;
      const index = lines.findIndex(line => storySpeakerKeys[line.speaker] === id);
      assert.ok(index >= 0, `${stageId}장 이야기에서 ${id}가 대화합니다`);
      await page.locator('.library-acts').getByRole('button', { name: `제${getStoryArcIndex(stageId) + 1}막`, exact: true }).click();
      await button(`${stageId}장 전투 전 이야기`).click();
      for (let line = 0; line < index; line++) await button('다음').click();
      assert.equal(await page.locator('.narrative-speaker strong').innerText(), lines[index].speaker);
      const portrait = page.locator('.narrative-actor img');
      await portrait.evaluate(image => image.decode());
      assert.equal(await portrait.getAttribute('src'), getCharacterArt(promoted.party.find(unit => unit.id === id).advancedClass).dialogue,
        `${id}: 선택한 상위 전직의 대화 원화를 실제 이야기에서 표시합니다`);
      await ensureLayout(page, `${id} 전직 대화`);
      await page.locator('.narrative-header').getByRole('button', { name: '기록실로', exact: true }).click();
      await page.locator('.journey-library').waitFor();
      assert.equal(await rawSaved(), beforeReplay, '전직 모습의 이야기 재생으로 저장·보상·선택 전직을 바꾸지 않습니다');
      console.log(`PASS 대화 ${viewport.width}x${viewport.height} ${stageId}장 ${id}: 선택 전직 원화/저장 보존`);
    }
    result.advancedDialogueArtVerified = true;
    await load({ ...structuredClone(promoted), screen: 'campaign' });
    await selectStage(50);
    await beginBattle(page);
    const advancedBattle = await saveBattle();
    for (const id of ['hero', ...newIds]) {
      const unit = advancedBattle.units.find(ally => ally.id === id);
      assert.ok(unit?.advancedClass);
      await actualUnitArt(page, id, unit.advancedClass);
      await page.locator(`.world-battlefield .unit[data-unit-id="${id}"]`).click();
      await page.locator('.cmd-skill').click();
      const skillDialog = page.locator('.skill-choice-dialog[open]');
      await skillDialog.waitFor();
      const form = ADVANCED_CLASSES[id].find(entry => entry.id === unit.advancedClass);
      assert.equal(await skillDialog.locator(`[data-skill-id="${form.skill.id}"]`).count(), 1, '선택한 상위 전직 기술이 실제 전투 명령에 연결됩니다');
      await button('스킬 선택 닫기').click();
    }
    result.advancedMapSpriteVerified = true;
    result.advancedSkillMenuVerified = true;
    result.checks.push('최상위 42폼 표시/실제 선택·첫 변경 무료/이후 300G·중복 클릭 차단·HP 회복 없음·전직 저장 재로드');

    await load({ ...structuredClone(source), screen: 'codex', clearedStages: sequential(50) }, 50);
    result.titleProgressChecked = [30, 50];
    await page.locator('.character-codex').waitFor();
    assert.equal(await page.locator('.collection-card').count(), 21);
    for (const id of newIds) assert.equal(await page.locator(`[data-character="${id}"]`).getAttribute('data-collected'), 'true');
    const catalogSource = await rawSaved();
    const catalog = getCharacterCollection({ party: fullParty, clearedStages: sequential(50) });
    for (const [tab, kind, requiredIds] of [['적군', 'enemy', EXPANSION_MONSTER_KEYS], ['보스', 'boss', EXPANSION_BOSS_KEYS]]) {
      await button(tab).click();
      assert.equal(await page.locator('.collection-card').count(), catalog.filter(entry => entry.kind === kind).length);
      for (const id of requiredIds) {
        const card = page.locator(`[data-character="${id}"]`);
        assert.equal(await card.getAttribute('data-collected'), 'true', `${id} 실제 조사 기록`);
        await card.click();
        const detail = page.locator('.character-detail-dialog[open]');
        await detail.waitFor();
        assert.equal(await detail.locator('.character-detail-identity img').getAttribute('src'), getCharacterArt(id).motion.recover, `${id}: 고유 신규 종족·보스 전투 원화`);
        await ensureLayout(page, id);
        assert.match(await detail.locator('.collection-condition').innerText(), /장/);
        assert.ok((await detail.locator('.character-detail-story').innerText()).length > 10);
        await page.keyboard.press('Escape');
      }
    }
    assert.equal(await rawSaved(), catalogSource, '신규 도감 보기로 저장/수집 기록을 덮어쓰지 않습니다');
    result.checks.push('신규 아군4/일반적12/보스4 실제 도감 기록·이미지·상세·모바일 넘침 없음');

    // Seed a one-HP commander save, then use a real production attack, outcome and first-clear settlement.
    // This checks recruitment/progression plumbing; it is not claimed as an unseeded balance playthrough.
    for (const id of [32, 37, 42, 47]) {
      const recruitId = RECRUIT_BY_STAGE[id];
      const before = { ...structuredClone(source), clearedStages: sequential(id - 1),
        party: fullParty.filter(unit => !newIds.includes(unit.id) || Number(Object.entries(RECRUIT_BY_STAGE).find(([, allyId]) => allyId === unit.id)?.[0]) < id),
        deployedIds: legacy.shared.party.slice(0, 15).map(unit => unit.id) };
      await load(before);
      await selectStage(id);
      await beginBattle(page);
      const fresh = await saveBattle();
      const combat = structuredClone(fresh), commander = combat.units.find(unit => unit.type === 'boss');
      const hero = combat.units.find(unit => unit.id === 'hero');
      const point = [{ x: commander.x - 1, y: commander.y }, { x: commander.x + 1, y: commander.y }, { x: commander.x, y: commander.y + 1 }, { x: commander.x, y: commander.y - 1 }]
        .find(cell => combat.selectedStage.map[cell.y]?.[cell.x] && !isTerrainBlocked(combat.selectedStage.map[cell.y][cell.x])
          && !isDeploymentTerrainUnsafe(combat.selectedStage.map[cell.y][cell.x])
          && !combat.units.some(unit => unit.x === cell.x && unit.y === cell.y));
      assert.ok(point, '보스 인접 공격 검사 칸이 있습니다');
      Object.assign(hero, point, { atk: Math.max(hero.atk, 80), baseAtk: Math.max(hero.baseAtk, 80), acted: false, moved: false });
      commander.hp = 1;
      commander.def = 0;
      combat.selectedUnit = 'hero';
      combat.mode = 'move';
      combat.selectedStage.units = structuredClone(combat.units);
      await load(combat);
      await readyBattle(page);
      await page.locator('.world-battlefield .unit[data-unit-id="hero"]').click();
      await page.locator('.cmd-attack').click();
      await page.locator('.battle-target-buttons button').filter({ hasText: commander.name }).click();
      await page.locator('.victory-dialog[open]').waitFor();
      await page.locator('.victory-dialog').getByRole('button', { name: '대기실', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.town-hub,.story-screen,.narrative-screen'));
      if (await page.locator('.story-screen,.narrative-screen').count()) await button('건너뛰기').click();
      await page.locator('.town-hub').waitFor();
      const settled = await saveCamp();
      assert.deepEqual(settled.clearedStages, sequential(id));
      assert.deepEqual(settled.unlockedStages, sequential(id + 1));
      assert.equal(settled.party.filter(unit => unit.id === recruitId).length, 1, '첫 승리에서 해당 신규 동료를 정확히 한 번 영입합니다');
      assert.equal(settled.lastBattleResult.outcome, 'victory');
      assert.ok(settled.gold > fresh.gold);
      report.recruitChecks.push({ viewport, id, recruitId, actualAttack: true, seededCommanderHp: 1, actualVictorySettlement: true, nextStage: id + 1 });
      result.actualVictoryAttacks++;
      console.log(`PASS 합류 ${viewport.width}x${viewport.height} ${id}장 ${recruitId}: 실제 공격/승리 정산, ${id + 1}장 해금`);
    }
    result.checks.push('32/37/42/47장 실제 공격·승리 정산으로 신규 동료1명 합류·다음 장 해금');

    await load(source);
    await selectStage(32);
    await beginBattle(page);
    const counterTemplate = await saveBattle();
    for (const attackMode of ['attack', 'skill']) for (const distance of [1, 2]) {
      const combat = structuredClone(counterTemplate);
      const map = combat.selectedStage.map;
      const safe = (x, y) => typeof map[y]?.[x] === 'string' && !isTerrainBlocked(map[y][x]) && !isDeploymentTerrainUnsafe(map[y][x]);
      let contact;
      for (let y = 3; y < map.length - 3 && !contact; y++) for (let x = 3; x < map[0].length - 3; x++) {
        if (safe(x, y) && safe(x + 1, y) && safe(x + distance, y)) { contact = { x, y }; break; }
      }
      assert.ok(contact, '신규 전장에 지형 위험 없는 반격 검사 좌표가 있습니다');
      const lina = combat.units.find(unit => unit.id === 'lina');
      Object.assign(lina, contact, { hp: 100, maxHp: 100, baseHP: 100, atk: 20, baseAtk: 20, def: 1, baseDef: 1,
        equipment: { weapon: null, armor: null }, range: 2, minRange: 2, status: [], acted: false, moved: false, guard: false,
        skillGuardBoost: 0, itemGuardBoost: 0 });
      const occupied = new Set([`${contact.x},${contact.y}`, `${contact.x + distance},${contact.y}`]);
      const distant = [];
      for (let y = map.length - 2; y >= 0 && distant.length < 2; y--) for (let x = map[0].length - 2; x >= 0 && distant.length < 2; x--) {
        if (safe(x, y) && !occupied.has(`${x},${y}`) && Math.abs(x - contact.x) + Math.abs(y - contact.y) > 10
          && distant.every(cell => Math.abs(x - cell.x) + Math.abs(y - cell.y) > 4)) {
          distant.push({ x, y }); occupied.add(`${x},${y}`);
        }
      }
      assert.equal(distant.length, 2);
      const hero = combat.units.find(unit => unit.id === 'hero'), boss = combat.units.find(unit => unit.type === 'boss');
      Object.assign(hero, distant[0], { hp: 100, maxHp: 100, baseHP: 100, status: [] });
      Object.assign(boss, distant[1], { move: 0, range: 1, minRange: 1, skillRange: 0, skillCooldown: 999,
        hp: 1000, maxHp: 1000, status: [], expansionSupportNextRound: 999, expansionSupport: null });
      const enemy = createExpansionEnemy(32, distance === 2 ? 'eel_archer' : 'crab_guard', {
        id: 'qa-counter-enemy', x: contact.x + distance, y: contact.y,
      });
      Object.assign(enemy, { move: 0, skillCooldown: 0, hp: 100, maxHp: 100, atk: 8, def: 0,
        expansionSupport: null, status: [], skillBonus: 0 });
      // Enemy skills have a separate selection policy; disable the skill explicitly for attack-only fixtures.
      if (attackMode === 'attack') enemy.skillType = null;
      combat.units = [hero, lina, enemy, boss];
      combat.selectedStage.units = structuredClone(combat.units);
      combat.selectedUnit = 'lina';
      combat.round = 1;
      combat.turn = 'ally';
      combat.battleStats = { ...combat.battleStats, counters: 0 };
      combat.unitBattleStats = {};
      await load(combat);
      await readyBattle(page);
      const before = await saveBattle();
      await page.locator('.battle-end-turn-float').click();
      await page.waitForFunction(() => !document.querySelector('.defeat-dialog[open],.victory-dialog[open],.painted-combat-overlay')
        && document.querySelector('.battle-end-turn-float:not(:disabled)'));
      const after = await saveBattle();
      const beforeLina = before.units.find(unit => unit.id === 'lina'), afterLina = after.units.find(unit => unit.id === 'lina');
      const afterEnemy = after.units.find(unit => unit.id === enemy.id);
      assert.equal(after.round, 2, '실제 적 AI 턴이 끝나 다음 아군 턴으로 돌아옵니다');
      assert.ok(after.logs.some(log => log.includes(`${enemy.name} ${attackMode === 'skill' ? enemy.skill : '공격'} → ${lina.name}`)),
        `${attackMode}: 실제 적 공격 로그로 일반 공격/스킬 경로를 구분합니다`);
      assert.ok(afterLina.hp < beforeLina.hp, `${distance}칸 적 공격이 실제 HP 피해를 발생시킵니다`);
      assert.equal(after.unitBattleStats.lina?.counters || 0, distance === 2 ? 1 : 0,
        `${distance}칸에서 리나는 ${distance === 2 ? '정확히 한 번 반격합니다' : '최소 사거리 때문에 반격하지 않습니다'}`);
      assert.ok(afterEnemy, '반격 검사 적은 생존하여 결과를 비교할 수 있습니다');
      if (distance === 2) assert.ok(afterEnemy.hp < enemy.hp, '2칸 반격은 적 HP를 실제로 감소시킵니다');
      else assert.equal(afterEnemy.hp, enemy.hp, '1칸 공격에는 반격 피해가 없습니다');
      report.counterChecks.push({ viewport, distance, attackMode, realEnemyAi: true, seededPositions: true, skillDisabledInAttackFixture: attackMode === 'attack',
        linaHpBefore: beforeLina.hp, linaHpAfter: afterLina.hp, enemyHpAfter: afterEnemy.hp, counters: after.unitBattleStats.lina?.counters || 0 });
      console.log(`PASS 반격 ${viewport.width}x${viewport.height} ${attackMode === 'skill' ? '스킬' : '일반 공격'} ${distance}칸: 반격 ${after.unitBattleStats.lina?.counters || 0}회, 리나 HP ${beforeLina.hp}→${afterLina.hp}, 적 HP ${afterEnemy.hp}`);
    }
    result.checks.push('신규 적 실제 AI 일반 공격/스킬: 활 캐릭터 2칸 공격 반격 1회·1칸 공격 미반격·양쪽 HP/다음 턴 판정');
    assert.deepEqual(report.errors, [], '브라우저 JavaScript 오류·HTTP 실패가 없습니다');
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
  assert.equal(stages.length, 50);
  assert.equal(fullParty.length, 21);
  assert.equal(EXPANSION_MONSTER_KEYS.length, 12);
  assert.equal(EXPANSION_BOSS_KEYS.length, 4);
  assert.equal(Object.values(ADVANCED_CLASSES).flat().length, 42);
  report.build = JSON.parse(await fs.readFile(path.join(root, 'dist/ota-build.json'), 'utf8'));
  assert.deepEqual(report.build, webBuildInfo(root));
  server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } });
  browser = await chromium.launch(qaBrowserOptions());
  for (const viewport of viewports) await runViewport(`http://127.0.0.1:${server.httpServer.address().port}`, viewport);
  assert.equal(report.stageChecks.length, 35, '20 신규 장과 나머지 세 화면의 지역 시작/보스 장을 검사했습니다');
  assert.equal(report.promotionChecks.length, 72, '모바일 전체42폼과 나머지 세 화면의 카일·신규4명10폼을 실제 선택했습니다');
  assert.equal(report.recruitChecks.length, 16, '네 화면에서 신규 네 동료의 실제 첫 승리 정산을 검사했습니다');
  assert.equal(report.counterChecks.length, 16, '네 화면에서 일반 공격/스킬과 최소 사거리 안/밖의 실제 적 턴 반격을 검사했습니다');
  assert.deepEqual(report.build, webBuildInfo(root), '검사 중 소스가 변경되지 않았습니다');
  report.passed = true;
  console.log(`PASS 50장 확장: 전투 진입 ${report.stageChecks.length}회, 전직 ${report.promotionChecks.length}회, 승리/합류 ${report.recruitChecks.length}회, 실제 AI 반격 ${report.counterChecks.length}회, 화면 ${viewports.length}개, 오류 0`);
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  if (server) await server.close();
}
