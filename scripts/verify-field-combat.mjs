import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fieldProps, fieldSkills, fieldViewports, combatUnitIds } from './field-fixture.mjs';

const out = 'tmp/field-combat-qa';
await fs.mkdir(out, { recursive: true });
const errors = [], results = [], screenshots = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const viewport of fieldViewports) {
    const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.routeWebSocket('**', () => {});
    const time = new Date('2026-09-29T00:00:00Z');
    await page.clock.install({ time }); await page.clock.pauseAt(time);
    await page.goto(`${process.env.GAME_URL || 'http://127.0.0.1:5176'}/tests/fixtures/field-combat.html`);
    const full = viewport.width === 390;
    const cases = full ? [
      ...combatUnitIds.map(key => [key, null, {}]),
      ...fieldSkills.map(([key, skill]) => [key, skill.id, { multi: skill.radius > 0 || skill.targets > 1 }]),
      ...combatUnitIds.filter(key => !fieldSkills.some(([id]) => id === key)).map(key => [key, 'enemy-skill', { finish: true }]),
    ] : [['hero', 'gale', {}], ['lina', 'ember', {}], ['noah', 'chain', { multi: true }], ['boss_abyss', 'enemy-skill', {}], ['aria', 'sanctuary', { multi: true }]];
    cases.push(['hero', null, { miss: true }], ['hero', 'gale', { reverse: true }], ['hero', 'gale', { vertical: true }], ['noah', 'ward', { multi: true }], ['bram', 'bulwark', {}]);
    for (const speed of [2, 3]) cases.push(['hero', 'gale', { speed }], ['lina', 'ember', { speed }]);
    for (const [key, skill, options] of cases) {
      const props = fieldProps(key, skill, options);
      await page.evaluate(props => window.renderFieldFixture(props), props);
      await page.locator('.field-battle-scene[data-ready="true"]').waitFor();
      const canvas = page.locator('.field-battle-canvas');
      let elapsed = 0;
      const pixels = [], poses = [], positions = [];
      for (const fraction of [.12, .38, .66, .94]) {
        await page.clock.runFor(Math.round(props.scene.durationMs * fraction) - elapsed);
        elapsed = Math.round(props.scene.durationMs * fraction);
        const frame = await canvas.evaluate(canvas => {
          const ctx = canvas.getContext('2d'), data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0; const colors = new Set();
          for (let i = 0; i < data.length; i += 256) { sum = (sum + data[i] * 3 + data[i + 1] * 7 + data[i + 2] * 11) >>> 0; colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`); }
          return { sum, colors: colors.size, bodies: Number(canvas.dataset.renderedUnits), pose: canvas.dataset.pose, x: canvas.dataset.actorX, y: canvas.dataset.actorY };
        });
        assert.equal(frame.bodies, props.scene.fieldUnits.length, `${key}:${skill} all field sprites loaded`);
        assert.ok(frame.colors > 200, `${key}:${skill} nonblank textured scene`);
        pixels.push(frame.sum); poses.push(frame.pose); positions.push(`${frame.x},${frame.y}`);
        if (fraction === .66 && !options.speed && (key === 'hero' || key === 'noah' || key === 'boss_abyss' || key === 'aria') && !options.reverse && !options.vertical) {
          const file = `${viewport.width}x${viewport.height}-${key}-${skill || (options.miss ? 'miss' : 'attack')}.png`;
          await page.screenshot({ path: `${out}/${file}` }); screenshots.push(file);
        }
      }
      assert.ok(new Set(pixels).size > 2, `${key}:${skill} rendered animation moves`);
      assert.ok(new Set(poses).size > 1, `${key}:${skill} anatomical poses change`);
      const fit = await page.locator('.field-battle-scene').evaluate(root => {
        const issues = [];
        for (const el of root.querySelectorAll('.field-battle-heading, .field-battle-health, .field-health, h2, strong')) {
          if (el.closest('.field-skill-banner, .field-battle-result')) continue;
          const r = el.getBoundingClientRect();
          if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || el.scrollWidth > el.clientWidth + 1) issues.push(el.className || el.tagName);
        }
        return issues;
      });
      assert.deepEqual(fit, [], `${key}:${skill} readable HUD`);
      results.push({ viewport, key, skill, options, poses, positions, pixels });
      await page.clock.runFor(props.scene.durationMs - elapsed + 40);
      assert.equal(await canvas.getAttribute('data-progress'), '1.000');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = fieldProps('hero', 'gale');
    await page.evaluate(props => window.renderFieldFixture(props), reduced);
    await page.locator('.field-battle-scene[data-ready="true"]').waitFor();
    await page.clock.runFor(1600);
    assert.equal(await page.locator('canvas').getAttribute('data-pose'), 'recover');
    await page.evaluate(() => window.renderFieldFixture(null));
    await page.clock.runFor(3000);
    await page.close();
    console.log(`PASS ${viewport.width}x${viewport.height}: ${cases.length} scenes + reduced motion/cleanup`);
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ scenes: results.length, screenshots, errors, results }, null, 2));
  console.log(`PASS ${results.length} field scenes, ${screenshots.length} screenshots, no asset/runtime errors`);
} finally { await browser.close(); }
