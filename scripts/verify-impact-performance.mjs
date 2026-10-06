import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CHARACTER_SKILLS } from '../src/data/skills.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { getCombatChoreography } from '../src/data/combatArt.js';
import { renderDuel, seekDuel, assertBodies } from './duel-fixture.mjs';
import { createProductionDuelFixture, productionDuelProps } from './production-duel-fixture.mjs';
import { qaBrowserOptions } from './qa-browser.mjs';

const out = 'tmp/impact-performance-qa';
await fs.mkdir(out, { recursive: true });
const fixture = await createProductionDuelFixture(out);
let browser;
const errors = [], results = [];
const report = { passed: false, production: true, build: fixture.build, errors, results };
try {
  browser = await chromium.launch(qaBrowserOptions());
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const page = await fixture.open(browser, viewport, errors);
    try {
      for (const unit of ['hero', 'lina', 'teo', 'baekho', 'boss_commander', 'mare', 'harin', 'edan', 'sylvan', 'resonance_judge', 'hero__form0']) {
        const canonical = unit.split('__form')[0], form = ADVANCED_CLASSES[canonical]?.find(value => value.id === unit);
        const skill = unit === 'hero' ? null : form?.skill || CHARACTER_SKILLS[canonical]?.find(skill => skill.type === 'attack');
        if (skill) assert.equal(skill.type, 'attack', `${unit}: 타격 성능은 실제 공격 기술로 검사합니다`);
        const props = productionDuelProps(unit, skill, 2, { ...(!skill && unit !== 'hero' ? { mode: 'skill' } : {}) });
        const plan = getCombatChoreography(unit, props.scene), duration = props.scene.durationMs;
        await renderDuel(page, props);
        await seekDuel(page, .04, duration);
        assert.ok(await page.locator('.duel-hit,.duel-footfall').evaluateAll(elements => elements.every(el => +getComputedStyle(el).opacity === 0)), '움직임 시작 전 먼지와 타격을 띄우지 않습니다');
        for (const [index, at] of plan.contacts.entries()) {
          await seekDuel(page, at + .02, duration);
          const hit = page.locator(`[data-duel-impact="${index}"]`);
          assert.equal(await hit.evaluate(el => +getComputedStyle(el).opacity), 1);
          assert.ok(await hit.locator('.hit-core').evaluate(el => +getComputedStyle(el).opacity > .6));
          assert.ok(await page.locator('.fighter-defender .fighter-poses').evaluate(el => getComputedStyle(el).filter !== 'brightness(1)'));
          const from = await hit.locator('.hit-particle').first().evaluate(el => getComputedStyle(el).transform);
          await seekDuel(page, at + .08, duration);
          assert.notEqual(await hit.locator('.hit-particle').first().evaluate(el => getComputedStyle(el).transform), from);
          if (plan.moving) {
            await seekDuel(page, at + .002, duration);
            const planted = await page.locator('.fighter-attacker').evaluate(el => getComputedStyle(el).transform);
            await seekDuel(page, at + Math.min(.02, plan.contactPause * .8), duration);
            assert.equal(await page.locator('.fighter-attacker').evaluate(el => getComputedStyle(el).transform), planted, '무기 접촉 시 짧게 발을 고정합니다');
          }
        }
        for (const [index, fraction] of [.25, plan.releases[0] - .01, plan.impact, plan.impact + .015, plan.impact + .06, .85].entries()) {
          await seekDuel(page, fraction, duration); await assertBodies(page, unit);
          if (viewport.width === 390 && unit === 'hero') await page.locator('.painted-combat-arena').screenshot({ path: `${out}/hero-${index}.png` });
        }
        await page.setViewportSize({ width: viewport.width - 12, height: viewport.height }); await page.clock.runFor(32);
        await assertBodies(page, '화면 크기 변경'); await page.setViewportSize(viewport);
        results.push({ viewport, unit, skill: skill?.id || null, skillType: skill?.type || null, weapon: plan.weapon, contacts: plan.contacts.length, particles: plan.impacts.map(impact => impact.count) });
      }
      const miss = productionDuelProps('teo', CHARACTER_SKILLS.teo[0], 2, { outcome: { hit: false, damage: 0 }, defenderPostHp: 30 });
      await renderDuel(page, miss); await seekDuel(page, .64, miss.scene.durationMs);
      assert.ok(await page.locator('.duel-hit').evaluateAll(elements => elements.every(el => getComputedStyle(el).visibility === 'hidden')));
      await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.runFor(32);
      assert.equal(await page.locator('.duel-impacts').evaluate(el => getComputedStyle(el).display), 'none');
      await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.clock.runFor(32);
      await page.evaluate(() => window.renderDuelFixture(null));
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
      console.log(`PASS 타격 성능 ${viewport.width}: 접촉 정지·입자·피격·연속 공격·크기 변경·동작 최소화·정리`);
    } catch (error) { await page.screenshot({ path: `${out}/failure-${viewport.width}.png` }).catch(() => {}); throw error; }
    finally { await page.close(); }
  }
  assert.deepEqual(errors, []); report.passed = true;
} catch (error) { report.failure = error.stack; throw error; }
finally { await fs.writeFile(`${out}/result.json`, JSON.stringify(report, null, 2)); await browser?.close(); await fixture.close(); }
