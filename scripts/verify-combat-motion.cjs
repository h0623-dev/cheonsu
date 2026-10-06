const { chromium } = require('playwright');
const { mkdir, writeFile } = require('node:fs/promises');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const out = 'tmp/motion-qa';

async function setMotionPreference(page, reducedMotion) {
  await page.emulateMedia({ reducedMotion });
  const disabled = reducedMotion === 'reduce';
  for (let attempt = 0; attempt < 25; attempt++) {
    await page.clock.runFor(32);
    const ready = await page.locator('.painted-combat').evaluate((el, expected) =>
      matchMedia('(prefers-reduced-motion: reduce)').matches === expected &&
      el.classList.contains('duel-motion-disabled') === expected, disabled);
    if (ready) return;
    // Native media change dispatch is independent of the paused page clock.
    await page.waitForTimeout(20);
  }
  assert.fail(`reducedMotion=${reducedMotion}: media change handler did not settle`);
}

async function main() {
  const { qaBrowserOptions } = await import('./qa-browser.mjs');
  const { createProductionDuelFixture, productionDuelProps } = await import('./production-duel-fixture.mjs');
  const { renderDuel, seekDuel, assertBodies, assertFit } = await import('./duel-fixture.mjs');
  const { CHARACTER_SKILLS } = await import('../src/data/skills.js');
  const { ADVANCED_CLASSES } = await import('../src/data/advancedClasses.js');
  const { getCombatChoreography } = await import('../src/data/combatArt.js');
  await mkdir(out, { recursive: true });
  const fixture = await createProductionDuelFixture(out);
  let browser;
  const errors = [], results = [];
  const report = { passed: false, production: true, build: fixture.build, errors, results };
  const cases = [['hero', 'attack'], ['lina', 'attack'], ['irene', 'skill'], ['aria', 'heal'], ['raider', 'miss'], ['bram', 'guard'], ['wolf', 'attack'], ['baekho', 'skill'], ['mare', 'skill'], ['edan', 'skill'], ['sylvan', 'skill'], ['resonance_judge', 'skill'], ['hero__form0', 'skill']];
  try {
    browser = await chromium.launch(qaBrowserOptions());
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      const page = await fixture.open(browser, viewport, errors);
      try {
        for (const [unit, kind] of cases) {
          const canonical = unit.split('__form')[0];
          const form = ADVANCED_CLASSES[canonical]?.find(value => value.id === unit);
          const skill = ['skill', 'heal', 'guard'].includes(kind) ? form?.skill || CHARACTER_SKILLS[canonical]?.find(value => kind === 'skill' || value.type === kind) : null;
          const props = productionDuelProps(unit, skill, 2, { ...(kind === 'miss' ? { outcome: { hit: false, damage: 0 }, defenderPostHp: 30 } : {}), ...(kind === 'skill' ? { mode: 'skill' } : {}) });
          const plan = getCombatChoreography(unit, props.scene);
          await renderDuel(page, props);
          const seen = new Set(), shots = [];
          for (let index = 0; index < plan.poses.length; index++) {
            const [start, expected] = plan.poses[index];
            const end = plan.poses[index + 1]?.[0] ?? 1;
            if (end - start < .0001) continue;
            await seekDuel(page, (start + end) / 2, props.scene.durationMs);
            await assertBodies(page, `${unit}/${kind}/${start}`);
            const visible = await page.locator('.fighter-attacker .fighter-frame').evaluateAll(images => images.filter(img => +getComputedStyle(img).opacity > .5).map(img => img.dataset.pose));
            assert.deepEqual(visible, [expected], `${unit}/${kind}: 실제 계획된 몸·팔·무기 포즈`);
            seen.add(expected);
          }
          for (const pose of ['ready', 'windup', plan.skillPose ? 'skill' : 'strike', 'recover', ...(plan.moving ? ['run-a', 'run-b'] : [])]) assert.ok(seen.has(pose), `${unit}: ${pose} 실제 표시`);
          assert.equal(await page.locator('.fighter-defender').count(), props.scene.outcome.guard ? 0 : 1);
          assert.equal(await page.locator('.combat-health').count(), props.scene.outcome.guard ? 1 : 2);
          await assertFit(page, viewport, unit);
          for (const fraction of [.25, plan.releases[0] - .01, plan.impact + .02, .84]) {
            await seekDuel(page, fraction, props.scene.durationMs);
            shots.push(await page.locator('.painted-combat-arena').screenshot());
          }
          const tiles = await Promise.all(shots.map(shot => sharp(shot).resize(520, 240, { fit: 'contain', background: '#152720' }).png().toBuffer()));
          await sharp({ create: { width: 1040, height: 480, channels: 4, background: '#152720' } }).composite(tiles.map((input, i) => ({ input, left: i % 2 * 520, top: Math.floor(i / 2) * 240 }))).png().toFile(`${out}/${unit}-${kind}-${viewport.width}.png`);
          await setMotionPreference(page, 'reduce');
          assert.equal(await page.locator('.fighter-attacker').evaluate(el => el.getAnimations().length), 0);
          assert.equal(await page.locator('.fighter-attacker .fighter-ready').evaluate(el => +getComputedStyle(el).opacity), 1);
          await setMotionPreference(page, 'no-preference');
          results.push({ viewport, unit, kind, poses: [...seen], weapon: plan.weapon });
        }
        console.log(`PASS 전투 모션 ${viewport.width}x${viewport.height}: ${cases.length}종, 실제 포즈·무기·화면 맞춤·동작 최소화`);
      } finally { await page.close(); }
    }
    assert.deepEqual(errors, []); report.passed = true;
  } catch (error) { report.failure = error.stack; throw error; }
  finally { await writeFile(`${out}/result.json`, JSON.stringify(report, null, 2)); await browser?.close(); await fixture.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
