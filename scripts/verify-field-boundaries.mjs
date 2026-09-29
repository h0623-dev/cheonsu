import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fieldProps } from './field-fixture.mjs';

const out = 'tmp/field-combat-qa';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket('**', () => {});
  const time = new Date('2026-09-29T00:00:00Z');
  await page.clock.install({ time }); await page.clock.pauseAt(time);
  await page.goto('http://127.0.0.1:5176/tests/fixtures/field-combat.html');
  const nonblank = () => page.locator('canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let voidPixels = 0, count = 0;
    for (let i = 0; i < data.length; i += 256) {
      count++;
      if (data[i] === 25 && data[i + 1] === 41 && data[i + 2] === 35 || data[i + 3] === 0 || data[i] + data[i + 1] + data[i + 2] === 0) voidPixels++;
    }
    return voidPixels / count;
  });
  for (const stage of [1, 8, 16, 23, 30]) for (const [x, y] of [[1, 1], [11, 1], [1, 11], [11, 11]]) {
    const props = fieldProps('hero', 'gale', { stage });
    Object.assign(props.scene.attacker, { x, y }); Object.assign(props.scene.defender, { x: x + 1, y });
    props.scene.fieldUnits = [props.scene.attacker, props.scene.defender];
    props.scene.fieldTargets = [{ ...props.scene.defender, postHp: 18 }];
    await page.evaluate(props => window.renderFieldFixture(props), props);
    await page.locator('[data-ready="true"]').waitFor();
    await page.clock.runFor(2300);
    assert.ok(await nonblank() < .02, `stage ${stage} corner ${x},${y}: continuous biome backdrop`);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.clock.runFor(1000);
  assert.ok(await nonblank() < .02, 'rotation redraws without a blank frame after playback');
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--native-safe-top', '42px');
    document.documentElement.style.setProperty('--native-safe-bottom', '56px');
    document.documentElement.style.setProperty('--native-safe-left', '56px');
    document.documentElement.style.setProperty('--native-safe-right', '56px');
  });
  const bounds = await page.locator('.field-battle-heading, .field-battle-health').evaluateAll(elements => elements.map(el => {
    const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }));
  for (const r of bounds) assert.ok(r.left >= 56 && r.top >= 42 && r.right <= 788 && r.bottom <= 334);
  await page.screenshot({ path: `${out}/boundary-rotated-native-safe.png` });
  assert.deepEqual(errors, []);
  console.log('PASS 20 map corners / 5 biomes, post-playback rotation, Android safe areas, no runtime errors');
} finally { await browser.close(); }
