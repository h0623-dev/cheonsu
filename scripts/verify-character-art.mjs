import { saveBattle as clickBattleSave } from './qa-battle-tools.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { combatArtKeys, getCombatChoreography } from '../src/data/combatArt.js';
import { CHARACTER_SKILLS, getUnitSkills, withSkill } from '../src/data/skills.js';
import { getCharacterArt } from '../src/data/characterArt.js';
import { storySpeakerKeys } from '../src/data/storyArt.js';
import { getExpansionArtIdentity } from '../src/data/expansionArtRegistry.js';
import { EXPANSION_ENEMY_TEMPLATES } from '../src/data/expansionEnemies.js';
import { qaBrowserOptions } from './qa-browser.mjs';
import { confirmArtQaDeployment, confirmArtQaMission } from './art-qa-game.mjs';
import { openDuelFixture, duelProps, renderDuel, seekDuel, assertBodies, assertFit } from './duel-fixture.mjs';

const output = path.resolve(process.env.CHEONSU_ART_QA_OUT || '../work/character-art-qa');
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const showcase = new Set(['hero', 'bram', 'lina', 'aria', 'blackguard', 'boss_abyss']);
const saveKey = 'cheonsu_v01_save';
const requestedIds = process.env.CHEONSU_QA_ART_IDS?.split(',').map(id => id.trim()).filter(Boolean);
const selectedIds = requestedIds ? [...new Set(requestedIds)] : combatArtKeys;
const partial = selectedIds.length < combatArtKeys.length;
assert.ok(selectedIds.length && selectedIds.every(id => combatArtKeys.includes(id)), 'CHEONSU_QA_ART_IDS must contain known character IDs');
const errors = [], results = [];
let server, browser;
let passed = false;
await fs.mkdir(output, { recursive: true });
assert.ok(selectedIds.every(id => getCharacterArt(id)), '검사 대상 기존47·신규20·최상위42종 원화를 먼저 생성해야 합니다');

function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/art/')) errors.push(`${response.status()} ${response.url()}`);
  });
}

async function activeImages(page, selector) {
  return page.locator(selector).evaluateAll(async images => {
    await Promise.all(images.map(image => image.decode()));
    return images.map(image => ({ src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0,
      width: image.naturalWidth, height: image.naturalHeight }));
  });
}

function assertNewImages(images, label) {
  assert.ok(images.length, `${label}: images exist`);
  for (const image of images) {
    assert.ok(image.loaded, `${label}: decoded ${image.src}`);
    assert.match(image.src, /^\/art\/characters-v[23]\//, `${label}: 활성 원화 버전`);
  }
}

async function actualGame(base, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  watch(page);
  page.setDefaultTimeout(15000);
  await page.addInitScript(() => {
    localStorage.setItem('cheonsu_auto_patch', 'false');
    localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false,
      cutsceneMode: 'full', battleSpeed: 'normal', effectsOn: true }));
  });
  const button = name => page.getByRole('button', { name, exact: true });
  try {
    await page.goto(base);
    await button('새 게임').click();
    await page.locator('.campaign-header .prominent-save').click();
    await page.evaluate(key => {
      const save = JSON.parse(localStorage.getItem(key));
      save.clearedStages = [1, 2];
      localStorage.setItem(key, JSON.stringify(save));
    }, saveKey);
    await page.reload();
    await button('이어하기').click();
    const storyStage = partial ? 2 : 3;
    await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${storyStage}장[.]`) }) }).click();
    await button('전투 시작').click();
    await confirmArtQaDeployment(page);
    const beforeStory = await page.evaluate(key => localStorage.getItem(key), saveKey);
    for (let index = 0; index < 3; index++) {
      const images = await activeImages(page, '.narrative-actor img');
      const speaker = await page.locator('.narrative-actor img').first().getAttribute('alt');
      const storyId = storySpeakerKeys[speaker];
      if (!partial || selectedIds.includes(storyId)) assertNewImages(images, `actual story/${index}`);
      else assert.ok(images.every(image => image.loaded), 'pending character still loads its current artwork');
      await page.screenshot({ path: path.join(output, `actual-story-${index}-${viewport.width}.png`), animations: 'disabled' });
      results.push({ viewport, type: 'actual-story', index, id: storyId, speaker, newArtChecked: !partial || selectedIds.includes(storyId), images });
      if (index < 2) await button('다음').click();
    }
    assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), beforeStory, 'viewing new dialogue preserves save data');
    await button('바로 전투').click();
    await confirmArtQaMission(page);
    await page.locator('.world-battlefield .unit-visual-hero').waitFor();
    await page.waitForFunction(() => document.querySelector('.battle-screen:not(.deployment-screen)')?.dataset.saveReady === 'true' && !document.querySelector('.boss-splash-overlay'), null, { timeout: 120000 });
    const mapImages = await activeImages(page, '.world-battlefield .unit > img');
    assert.ok(mapImages.length);
    assert.ok(mapImages.every(image => image.loaded && /^\/art\/(map-sprites-v4|directions-v1)\//.test(image.src)), 'existing idle/back artwork stays active');
    await clickBattleSave(page);
    const baseline = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
    for (const [id, mode] of [['hero', 'attack'], ['hero', 'skill'], ['bram', 'attack'], ['lina', 'attack'], ['lina', 'skill']].filter(([id]) => selectedIds.includes(id))) {
      const fixture = structuredClone(baseline);
      const actor = fixture.units.find(unit => unit.id === id);
      const enemy = fixture.units.find(unit => unit.type === 'enemy');
      const reserve = fixture.units.find(unit => unit.type === 'ally' && unit.id !== id);
      assert.ok(actor && enemy && reserve, `actual stage must contain ${id} and a regular enemy`);
      fixture.selectedStage.map = Array.from({ length: 12 }, () => Array(12).fill('plain'));
      fixture.selectedStage.terrainRevision = 3;
      Object.assign(actor, { x: 3, y: 3, hp: 99, maxHp: 99, acted: false, moved: false,
        skillCooldown: 0, skillCooldowns: {}, status: [], facing: 'right' });
      Object.assign(reserve, { x: 1, y: 8, hp: 99, maxHp: 99, acted: false, moved: false, status: [] });
      Object.assign(enemy, { x: id === 'lina' ? 5 : 4, y: 3, hp: 9999, maxHp: 9999,
        atk: 1, def: 1, move: 0, range: 1, spriteKey: 'raider', status: [] });
      Object.assign(fixture, { screen: 'battle', units: [actor, reserve, enemy], selectedUnit: id,
        mode: 'move', turn: 'ally', round: 1, hazards: [] });
      fixture.selectedStage.units = structuredClone(fixture.units);
      await page.evaluate(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: saveKey, save: fixture });
      await page.reload();
      await button('이어하기').click();
      await page.locator(`.world-battlefield .unit[data-unit-id="${id}"]`).waitFor();
      await page.locator(`.cmd-${mode}`).click();
      if (mode === 'skill') await page.locator(`.skill-choice-dialog [data-skill-id="${CHARACTER_SKILLS[id][0].id}"]`).click();
      await page.locator(`.tile[data-map-x="${enemy.x}"][data-map-y="${enemy.y}"]`).click();
      const scene = page.locator(`.painted-combat[data-presentation="${mode}"]`);
      await scene.waitFor();
      const images = await activeImages(page, '.painted-combat .fighter-frame, .painted-combat .skill-cut-in img');
      if (partial) assertNewImages(await activeImages(page, '.painted-combat .fighter-attacker .fighter-frame, .painted-combat .skill-cut-in img'), `actual ${id}/${mode}`);
      else assertNewImages(images, `actual ${id}/${mode}`);
      await scene.evaluate((element, fraction) => {
        const duration = Number.parseFloat(getComputedStyle(element).getPropertyValue('--combat-duration'));
        for (const animation of document.getAnimations()) if (animation.effect?.target?.closest('.painted-combat')) {
          animation.pause(); animation.currentTime = duration * fraction;
        }
      }, mode === 'skill' ? .46 : id === 'lina' ? .38 : .505);
      await page.screenshot({ path: path.join(output, `actual-${id}-${mode}-${viewport.width}.png`) });
      results.push({ viewport, type: 'actual-combat', id, mode, images });
      await page.waitForFunction(() => document.querySelector('.battle-screen:not(.deployment-screen)')?.dataset.saveReady === 'true' && !document.querySelector('.painted-combat'), null, { timeout: 120000 });
      await clickBattleSave(page);
      const completed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
      assert.deepEqual(completed.clearedStages, baseline.clearedStages);
      assert.equal(completed.gold, baseline.gold);
      assert.ok(completed.units.find(unit => unit.id === id).acted, 'attack still completes its turn');
    }
    console.log(`PASS 실제 게임 전투·대화 ${viewport.width}×${viewport.height}`);
  } finally { await context.close(); }
}

try {
  const root = fileURLToPath(new URL('..', import.meta.url));
  let base = process.env.FIXTURE_URL || process.env.GAME_URL;
  if (!base) {
    server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
    await server.listen();
    const address = server.httpServer.address();
    base = `http://127.0.0.1:${address.port}`;
  }
  process.env.GAME_URL = base;
  browser = await chromium.launch(qaBrowserOptions());
  for (const viewport of viewports) {
    const page = await openDuelFixture(browser, viewport, errors);
    for (const id of selectedIds) {
      const identity = getExpansionArtIdentity(id);
      const canonical = identity?.baseId || id;
      const formId = id.includes('__form') ? id : null;
      const enemyProfile = EXPANSION_ENEMY_TEMPLATES[id];
      const skills = Object.hasOwn(CHARACTER_SKILLS, canonical)
        ? getUnitSkills({ id: canonical, type: 'ally', ...(formId ? { advancedClass: formId } : {}) })
        : enemyProfile ? [enemyProfile.skillSpec, enemyProfile.phaseSkill].filter(Boolean) : null;
      const cases = [{ skill: null, mode: 'attack' }, ...(skills
        ? skills.map(skill => ({ skill, mode: 'skill' })) : [{ skill: null, mode: 'skill' }])];
      for (const { skill, mode } of cases) {
        const props = duelProps(canonical, skill, 1, { mode });
        props.attackerKey = id;
        if (formId) {
          props.scene.attacker = skill ? withSkill({ ...props.scene.attacker, advancedClass: formId }, skill.id)
            : { ...props.scene.attacker, advancedClass: formId };
          if (skill?.type === 'guard') props.defenderKey = id;
        }
        if (!Object.hasOwn(CHARACTER_SKILLS, canonical)) props.scene.attacker = {
          ...props.scene.attacker, type: id.startsWith('boss_') || enemyProfile?.rank === 'boss' ? 'boss' : 'enemy',
          ...(skill ? { skillSpec: skill, skill: skill.name } : {}),
        };
        const plan = getCombatChoreography(id, props.scene);
        await renderDuel(page, props);
        const images = await activeImages(page, '.fighter-frame, .skill-cut-in img');
        const actorImages = await activeImages(page, '.fighter-attacker .fighter-frame, .skill-cut-in img');
        const actorArt = getCharacterArt(id);
        const ownedAssets = new Set([...Object.values(actorArt.motion), actorArt.portrait]);
        assert.ok(actorImages.length && actorImages.every(image => ownedAssets.has(image.src)), `${id}: 자기 캐릭터·선택 분기 원화를 표시합니다`);
        if (partial) assertNewImages(await activeImages(page, '.fighter-attacker .fighter-frame, .skill-cut-in img'), `${id}/${props.scene.mode}`);
        else assertNewImages(images, `${id}/${props.scene.mode}`);
        await assertFit(page, viewport, id);
        for (const at of [.05, .25, plan.releases[0] + .01, .85]) {
          await seekDuel(page, at, props.scene.durationMs);
          await assertBodies(page, `${id}/${props.scene.mode}/${at}`);
        }
        await seekDuel(page, plan.releases[0] + .01, props.scene.durationMs);
        if (showcase.has(id) || viewport.width === 1280 && !skill && props.scene.mode === 'attack') {
          await page.screenshot({ path: path.join(output, `fixture-${id}-${skill?.id || props.scene.mode}-${viewport.width}.png`) });
        }
        results.push({ viewport, type: 'fixture', id, mode: props.scene.mode, skill: skill?.id, images });
      }
    }
    await page.close();
    await actualGame(process.env.ACTUAL_GAME_URL || base, viewport);
    console.log(`PASS ${selectedIds.length}종 전투 아트 ${viewport.width}×${viewport.height}${partial ? ' (부분 검사)' : ''}`);
  }
  assert.deepEqual(errors, []);
  passed = true;
} catch (error) {
  errors.push(`QA assertion: ${error.message}`);
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed, partial, selectedIds, actualGameSource: process.env.ACTUAL_GAME_URL ? 'production' : 'development',
    cases: results.length, errors, results }, null, 2));
  await browser?.close();
  await server?.close();
}
