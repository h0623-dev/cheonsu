import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { configurePage, createStageSeed, enterStage, loadSeed, readBattle, startDeploymentBattle, watchErrors } from './qa175-harness.mjs';
import { applyAdvancedPromotion } from '../src/engine/promotionEngine.js';
import { getAttackRange, isTerrainBlocked } from '../src/engine/movement.js';
const out = process.env.CHEONSU_QA_FX_OUT || 'tmp/cloud-qa/full-effects';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
page.setDefaultTimeout(30000);
const errors = [], results = [];
watchErrors(page, errors);
await configurePage(page, { fullEffects: true });
await page.addInitScript(() => {
  window.__qaScenes = [];
  window.__qaFx = [];
  new MutationObserver(() => {
    const scene = document.querySelector('.painted-combat');
    const heading = scene?.querySelector('h2')?.textContent;
    const fx = document.querySelector('.skill-spectacle');
    if (fx && !window.__qaFx.some(entry => entry.theme === fx.dataset.skillTheme)) window.__qaFx.push({ theme: fx.dataset.skillTheme, className: fx.className });
    if (heading && window.__qaScenes.at(-1)?.heading !== heading) window.__qaScenes.push({ heading, presentation: scene.dataset.presentation, actor: scene.querySelector('header span')?.textContent });
    const boss = document.querySelector('.boss-splash-overlay');
    if (boss && window.__qaScenes.at(-1)?.heading !== 'boss-splash') window.__qaScenes.push({ heading: 'boss-splash', text: boss.textContent });
  }).observe(document, { childList: true, subtree: true });
});
function fixture(saved, { phase = false, basic = false } = {}) {
  const seed = structuredClone(saved);
  const hero = seed.units.find(unit => unit.id === 'hero');
  const target = basic ? seed.units.find(unit => unit.type === 'enemy' && (unit.range || 1) === 1) : seed.units.find(unit => unit.type === 'boss');
  assert.ok(target, 'actual boss or melee enemy');
  const map = seed.selectedStage.map;
  const cells = [];
  for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) if (!isTerrainBlocked(map[y][x])) cells.push({ x, y });
  const heroCell = cells.find(cell => cells.some(other => Math.abs(other.x - cell.x) + Math.abs(other.y - cell.y) === 1));
  const targetCell = cells.find(cell => Math.abs(heroCell.x - cell.x) + Math.abs(heroCell.y - cell.y) === 1);
  // Explicit proximity fixture: retain real stats, original boss HP and all living opponents.
  const reserved = new Set([`${heroCell.x},${heroCell.y}`, `${targetCell.x},${targetCell.y}`]);
  const occupied = new Set(reserved);
  for (const unit of seed.units) {
    if (unit.id === hero.id || unit.id === target.id) continue;
    const key = `${unit.x},${unit.y}`;
    if (occupied.has(key)) {
      const available = cells.find(cell => !occupied.has(`${cell.x},${cell.y}`));
      assert.ok(available);
      Object.assign(unit, available);
    }
    occupied.add(`${unit.x},${unit.y}`);
  }
  Object.assign(hero, heroCell, { acted: false, moved: true, counterUsed: false, skillCooldowns: {}, skillCooldown: 0 });
  Object.assign(target, targetCell, { counterUsed: false });
  if (phase) { target.hp = Math.floor(target.maxHp * .45); target.phase2 = false; }
  seed.selectedUnit = hero.id;
  seed.mode = 'attack';
  seed.turn = 'ally';
  return { seed, target: { ...target } };
}
async function settle() {
  await page.waitForFunction(() => document.querySelector('.battle-screen')?.dataset.saveReady === 'true' || document.querySelector('.victory-dialog,.defeat-dialog'), null, { timeout: 120000 });
  assert.equal(await page.locator('.painted-combat-overlay,.boss-splash-overlay').count(), 0, 'cutscene cleanup');
}
async function attack(target, basic = false, screenshot = null) {
  await page.locator('.world-battlefield .unit[data-unit-id="hero"]').click();
  await page.locator(basic ? '.cmd-attack' : '.cmd-skill').click();
  if (!basic) await page.getByRole('button').filter({ hasText: '여명 회오리참' }).last().click();
  await page.locator('.battle-target-buttons button').filter({ hasText: target.name }).first().click();
  if (screenshot) {
    await page.locator('.painted-combat').waitFor({ timeout: 20000 });
    await page.screenshot({ path: `${out}/${screenshot}` });
    await page.locator('.skill-spectacle').waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${out}/${screenshot.replace('.png', '-fx.png')}` });
  }
  await settle();
}
try {
  for (const id of (process.env.CHEONSU_QA_FX_STAGES || '35,40,45,50').split(',').map(Number)) {
    const item = { stage: id, fixture: 'original-HP proximity, actual promotion engine', checks: [] };
    const errorStart = errors.length;
    try {
      const campaign = createStageSeed(id);
      let hero = campaign.party.find(unit => unit.id === 'hero');
      hero.advancedMastery = 3;
      hero.promoted = true;
      assert.ok(hero.level >= 10);
      const promotion = applyAdvancedPromotion(hero, 'hero__form0', { party: campaign.party, clearedStages: campaign.clearedStages, gold: campaign.gold, mastery: 3 });
      assert.equal(promotion.ok, true, promotion.message);
      campaign.party = campaign.party.map(unit => unit.id === 'hero' ? promotion.unit : unit);
      await page.setViewportSize({ width: 1365, height: 900 });
      await loadSeed(page, campaign);
      await enterStage(page, id);
      await startDeploymentBattle(page);
      const actual = await readBattle(page);
      item.boss = actual.units.find(unit => unit.type === 'boss');
      item.checks.push('actual entry/mission/deployment/original HP');
      const arranged = fixture(actual);
      assert.equal(arranged.target.hp, item.boss.hp);
      await page.setViewportSize(id === 35 ? { width: 390, height: 844 } : { width: 1365, height: 900 });
      await loadSeed(page, arranged.seed);
      await attack(arranged.target, false, id === 35 || id === 50 ? `stage${id}-${id === 35 ? '390x844' : '1365x900'}-upper-skill.png` : null);
      const after = await readBattle(page);
      const damaged = after.units.find(unit => unit.id === arranged.target.id);
      assert.ok(!damaged || damaged.hp < arranged.target.hp, 'real skill causes damage');
      item.skillScenes = await page.evaluate(() => window.__qaScenes);
      item.skillFx = await page.evaluate(() => window.__qaFx);
      assert.ok(item.skillFx.some(effect => effect.theme === "fire"), "upper skill renders actual fire spectacle DOM");
      assert.ok(item.skillScenes.some(scene => scene.heading.includes('여명 회오리참')), 'upper skill real cutscene');
      item.checks.push('upper skill/full effects/real damage/cleanup/save');
      await loadSeed(page, after);
      const reloaded = await readBattle(page);
      assert.equal(reloaded.units.find(unit => unit.id === arranged.target.id)?.hp, damaged?.hp);
      item.checks.push('damage save/continue persistence');
      const counter = fixture(actual, { basic: true });
      await loadSeed(page, counter.seed);
      await attack(counter.target, true);
      item.counterScenes = await page.evaluate(() => window.__qaScenes);
      assert.ok(item.counterScenes.some(scene => scene.actor === counter.target.name), 'actual enemy counter cutscene');
      item.checks.push('basic hit/enemy counter/full scene cleanup');
      if (id === 40 || id === 50) {
        const phase = fixture(actual, { phase: true });
        await loadSeed(page, phase.seed);
        await page.locator('.battle-end-turn-float').click();
        const confirmation = page.getByRole('button', { name: /턴 종료|종료하기/ });
        if (await page.locator('.confirm-dialog').count()) await confirmation.last().click();
        await settle();
        const phaseAfter = await readBattle(page);
        assert.ok(phaseAfter.units.find(unit => unit.id === phase.target.id)?.phase2, '45% boss phase trigger');
        item.phaseScenes = await page.evaluate(() => window.__qaScenes);
        item.checks.push('45% HP phase fixture/actual enemy turn/phase2/end cleanup');
      }
      item.status = 'passed';
    } catch (error) { item.status = 'failed-or-uncertain'; item.error = error.stack; await page.screenshot({ path: `${out}/stage${id}-failure.png` }).catch(() => {}); }
    item.errors = errors.slice(errorStart);
    if (item.errors.length) item.status = 'failed-or-uncertain';
    results.push(item);
    await writeFile(`${out}/report.json`, JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify(item));
  }
} finally { await browser.close(); }
if (results.some(item => item.status !== 'passed')) process.exitCode = 1;
