import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CHARACTER_SKILLS } from '../src/data/skills.js';
import { getCombatChoreography } from '../src/data/combatArt.js';
import { openDuelFixture, duelProps, renderDuel, seekDuel, assertBodies } from './duel-fixture.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = 'tmp/impact-performance-qa';
await fs.mkdir(out, { recursive: true });
const errors = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const page = await openDuelFixture(browser, viewport, errors);
    for (const [unit, skill] of [['hero', null], ['lina', CHARACTER_SKILLS.lina[0]], ['teo', CHARACTER_SKILLS.teo[0]], ['baekho', CHARACTER_SKILLS.baekho[0]], ['boss_commander', null]]) {
      const props = duelProps(unit, skill, 2);
      if (unit.startsWith('boss')) props.scene.attacker.type = 'boss';
      const plan = getCombatChoreography(unit, props.scene), duration = props.scene.durationMs;
      await renderDuel(page, props);
      await seekDuel(page, .04, duration);
      assert.ok(await page.locator('.duel-hit,.duel-footfall').evaluateAll(elements => elements.every(el => +getComputedStyle(el).opacity === 0)), 'no dust or hit burst before an acted beat');
      for (const [index, at] of plan.contacts.entries()) {
        await seekDuel(page, at + .02, duration);
        const hit = page.locator(`[data-duel-impact="${index}"]`);
        assert.equal(await hit.evaluate(el => +getComputedStyle(el).opacity), 1);
        assert.ok(await hit.locator('.hit-core').evaluate(el => +getComputedStyle(el).opacity > .6));
        assert.ok(await page.locator('.fighter-defender .fighter-poses').evaluate(el => getComputedStyle(el).filter !== 'brightness(1)'));
        const from = await hit.locator('.hit-particle').first().evaluate(el => getComputedStyle(el).transform);
        await seekDuel(page, at + .08, duration);
        assert.notEqual(await hit.locator('.hit-particle').first().evaluate(el => getComputedStyle(el).transform), from);
      }
      if (plan.moving) {
        await seekDuel(page, plan.impact + .002, duration);
        const at = await page.locator('.fighter-attacker').evaluate(el => getComputedStyle(el).transform);
        await seekDuel(page, plan.impact + .02, duration);
        assert.equal(await page.locator('.fighter-attacker').evaluate(el => getComputedStyle(el).transform), at, 'contact plants the feet');
      }
      for (const [index, fraction] of [.25, .42, .50, .525, .65, .85].entries()) {
        await seekDuel(page, fraction, duration); await assertBodies(page, unit);
        if (viewport.width === 390 && unit === 'hero') await page.locator('.painted-combat-arena').screenshot({ path: `${out}/hero-${index}.png` });
      }
      await page.setViewportSize({ width: viewport.width - 12, height: viewport.height });
      await page.clock.runFor(32);
      await assertBodies(page, 'resize');
      await page.setViewportSize(viewport);
    }
    const miss = duelProps('teo', CHARACTER_SKILLS.teo[0], 2, { outcome: { hit: false, damage: 0 } });
    await renderDuel(page, miss);
    await seekDuel(page, .64, miss.scene.durationMs);
    assert.ok(await page.locator('.duel-hit').evaluateAll(elements => elements.every(el => getComputedStyle(el).visibility === 'hidden')));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.duel-impacts').evaluate(el => getComputedStyle(el).display), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.clock.runFor(32);
    await page.evaluate(() => window.renderDuelFixture(null));
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    await page.close();
    console.log(`PASS impact performance ${viewport.width}: planted contact, particles, reaction, multi-hit, resize, reduced motion, cleanup`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
