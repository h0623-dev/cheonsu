import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { combatUnitIds, getCombatChoreography } from '../src/data/combatArt.js';
import { viewports, renderDuel, seekDuel, assertBodies, assertFit } from './duel-fixture.mjs';
import { createProductionDuelFixture, productionDuelProps } from './production-duel-fixture.mjs';
import { qaBrowserOptions } from './qa-browser.mjs';

const out = 'tmp/combat-presentation-qa';
await fs.mkdir(out, { recursive: true });
const fixture = await createProductionDuelFixture(out);
let browser;
const errors = [], results = [];
const report = { passed: false, production: true, build: fixture.build, units: combatUnitIds.length, errors, results };
try {
  browser = await chromium.launch(qaBrowserOptions());
  for (const viewport of viewports) {
    const page = await fixture.open(browser, viewport, errors);
    try {
      for (const speed of (viewport.width === 390 ? [1, 2, 3] : [2])) {
        for (const unit of combatUnitIds) {
          const props = productionDuelProps(unit, null, speed);
          const enemy = props.scene.attacker.type !== 'ally';
          const plan = getCombatChoreography(unit, props.scene), duration = props.scene.durationMs;
          await renderDuel(page, props);
          assert.equal(await page.locator('.skill-cut-in').count(), 0);
          await assertFit(page, viewport, unit);
          const transforms = [];
          for (const fraction of [.05, .12, .27, plan.releases[0] - .01, plan.impact + .009, plan.impact + .07, .84, .98]) {
            await seekDuel(page, fraction, duration); await assertBodies(page, `${unit}/${speed}/${fraction}`);
            transforms.push(await page.locator('.fighter-attacker .fighter-body').evaluate(el => getComputedStyle(el).transform));
          }
          assert.ok(new Set(transforms).size >= 4, `${unit}: 준비·접촉·마무리 동작이 다릅니다`);
          await page.clock.runFor(duration * plan.impact - 21);
          assert.equal(await page.locator('.painted-combat').getAttribute('data-contact-state'), 'pending');
          assert.ok((await page.locator('.combat-health').last().innerText()).includes('30 / 50'));
          await page.clock.runFor(2);
          assert.equal(await page.locator('.painted-combat').getAttribute('data-contact-state'), 'resolved');
          assert.ok((await page.locator('.combat-health').last().innerText()).includes('18 / 50'));
          const count = await page.evaluate(id => window.__duelContactCalls.filter(value => value === id).length, props.scene.id);
          assert.equal(count, 1, '실제 피해 접촉은 한 번입니다');
          if (speed === 2 && ['hero', 'lina', 'leon', 'rakan', 'boss_commander', 'edan'].includes(unit)) {
            await seekDuel(page, plan.impact + .012, duration); await page.screenshot({ path: `${out}/${unit}-${viewport.width}.png` });
          }
          if (enemy && speed === 2) {
            const skillProps = productionDuelProps(unit, null, speed, { mode: 'skill' });
            await renderDuel(page, skillProps);
            const skillPlan = getCombatChoreography(unit, skillProps.scene);
            await seekDuel(page, skillPlan.impact + .01, skillProps.scene.durationMs);
            await assertBodies(page, `${unit}: 적 고유 기술`);
            assert.ok(skillPlan.effects.length > 0);
          }
          results.push({ viewport, unit, speed, weapon: plan.weapon, damageCallbacks: count });
        }
      }
      const miss = productionDuelProps('lina', null, 2, { outcome: { hit: false, damage: 0 }, defenderPostHp: 30 });
      await renderDuel(page, miss); await seekDuel(page, .5, miss.scene.durationMs);
      assert.equal(await page.locator('.fighter-defender .fighter-evade').evaluate(el => +getComputedStyle(el).opacity), 1);
      await page.clock.runFor(miss.scene.durationMs * .7); assert.ok((await page.locator('.combat-health').last().innerText()).includes('30 / 50'));
      const finish = productionDuelProps('hero', null, 2, { finish: true, defenderPostHp: 0 });
      await renderDuel(page, finish); await seekDuel(page, 1, finish.scene.durationMs);
      assert.equal(await page.locator('.fighter-defender .fighter-body').evaluate(el => +getComputedStyle(el).opacity), 0);
      const noShake = { ...productionDuelProps('hero'), shakeEnabled: false };
      await renderDuel(page, noShake);
      assert.equal(await page.locator('.painted-combat-arena').evaluate(el => el.getAnimations().length), 0);
      await seekDuel(page, .5, noShake.scene.durationMs);
      const shown = await page.locator('.painted-combat-arena').screenshot();
      await page.locator('.painted-fighter').evaluateAll(actors => actors.forEach(el => el.style.visibility = 'hidden'));
      const hidden = await page.locator('.painted-combat-arena').screenshot();
      const a = await sharp(shown).raw().toBuffer(), b = await sharp(hidden).raw().toBuffer();
      let different = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 20) different++;
      assert.ok(different > a.length * .01, '실제 캐릭터 그림이 화면에 표시됩니다');
      console.log(`PASS 일반 공격 ${viewport.width}x${viewport.height}: ${combatUnitIds.length}종, 무기·적 기술·회피·결정타·접촉 HP·실제 그림`);
    } catch (error) { await page.screenshot({ path: `${out}/failure-${viewport.width}.png` }).catch(() => {}); throw error; }
    finally { await page.close(); }
  }
  assert.deepEqual(errors, []); report.passed = true;
  console.log(`PASS ${results.length}개 일반 공격 장면`);
} catch (error) { report.failure = error.stack; throw error; }
finally { await fs.writeFile(`${out}/result.json`, JSON.stringify(report, null, 2)); await browser?.close(); await fixture.close(); }
