import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { combatUnitIds, getCombatChoreography } from '../src/data/combatArt.js';
import { CHARACTER_SKILLS } from '../src/data/skills.js';
import { getCharacterArt } from '../src/data/characterArt.js';
import { storySpeakerKeys } from '../src/data/storyArt.js';
import { openDuelFixture, duelProps, renderDuel, seekDuel, assertBodies, assertFit } from './duel-fixture.mjs';

const output = path.resolve(process.env.CHEONSU_ART_QA_OUT || '../work/character-art-qa');
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const showcase = new Set(['hero', 'bram', 'lina', 'aria', 'blackguard', 'boss_abyss']);
const saveKey = 'cheonsu_v01_save';
const requestedIds = process.env.CHEONSU_QA_ART_IDS?.split(',').map(id => id.trim()).filter(Boolean);
const selectedIds = requestedIds ? [...new Set(requestedIds)] : combatUnitIds;
const partial = selectedIds.length < combatUnitIds.length;
assert.ok(selectedIds.length && selectedIds.every(id => combatUnitIds.includes(id)), 'CHEONSU_QA_ART_IDS must contain known character IDs');
const errors = [], results = [];
let server, browser;
let passed = false;
await fs.mkdir(output, { recursive: true });
assert.ok(selectedIds.every(id => getCharacterArt(id)), requestedIds ? 'generate all selected characters before running this QA' : 'generate all 41 characters before running this QA');

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
    assert.match(image.src, /^\/art\/characters-v2\//, `${label}: no previous character art`);
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
    await page.locator('.world-battlefield .unit-visual-hero').waitFor();
    await page.waitForFunction(() => !document.querySelector('.battle-control-heading .prominent-save')?.disabled && !document.querySelector('.boss-splash-overlay'));
    const mapImages = await activeImages(page, '.world-battlefield .unit > img');
    assert.ok(mapImages.length);
    assert.ok(mapImages.every(image => image.loaded && /^\/art\/(map-sprites-v4|directions-v1)\//.test(image.src)), 'existing idle/back artwork stays active');
    await page.locator('.battle-control-heading .prominent-save').click();
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
      await page.waitForFunction(() => !document.querySelector('.battle-control-heading .prominent-save')?.disabled && !document.querySelector('.painted-combat'));
      await page.locator('.battle-control-heading .prominent-save').click();
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
  server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}`;
  process.env.GAME_URL = base;
  browser = await chromium.launch({ headless: true, ...(process.env.CHEONSU_QA_BROWSER ? { channel: process.env.CHEONSU_QA_BROWSER } : {}) });
  for (const viewport of viewports) {
    const page = await openDuelFixture(browser, viewport, errors);
    for (const id of selectedIds) {
      const skills = CHARACTER_SKILLS[id];
      const cases = [{ skill: null, mode: 'attack' }, ...(skills
        ? skills.map(skill => ({ skill, mode: 'skill' })) : [{ skill: null, mode: 'skill' }])];
      for (const { skill, mode } of cases) {
        const props = duelProps(id, skill, 1, { mode });
        if (!Object.hasOwn(CHARACTER_SKILLS, id)) props.scene.attacker.type = id.startsWith('boss_') ? 'boss' : 'enemy';
        const plan = getCombatChoreography(id, props.scene);
        await renderDuel(page, props);
        const images = await activeImages(page, '.fighter-frame, .skill-cut-in img');
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
    await actualGame(base, viewport);
    console.log(`PASS ${selectedIds.length}종 전투 아트 ${viewport.width}×${viewport.height}${partial ? ' (부분 검사)' : ''}`);
  }
  assert.deepEqual(errors, []);
  passed = true;
} catch (error) {
  errors.push(`QA assertion: ${error.message}`);
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed, partial, selectedIds,
    cases: results.length, errors, results }, null, 2));
  await browser?.close();
  await server?.close();
}
