const { chromium } = require('playwright');
const { mkdir, writeFile } = require('node:fs/promises');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const base = process.env.GAME_URL || 'http://127.0.0.1:5176';
const out = 'tmp/motion-qa';

async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  const errors = [];
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      for (const [unit, kind] of [['hero', 'attack'], ['lina', 'attack'], ['irene', 'skill'], ['aria', 'heal'], ['raider', 'miss'], ['bram', 'guard'], ['wolf', 'attack']]) {
        const page = await browser.newPage({ viewport });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${base}/tests/fixtures/combat.html?unit=${unit}&kind=${kind}`);
        await page.locator('.painted-combat').waitFor();
        await page.locator('.painted-combat img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
        const seen = new Set();
        const shots = [];
        for (const fraction of [0.05, 0.12, 0.18, 0.38, 0.50, 0.67, 0.90]) {
          await page.evaluate(time => document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = time; }), fraction * 4000);
          const poses = await page.locator('.fighter-attacker .fighter-frame').evaluateAll(images => images.filter(img => +getComputedStyle(img).opacity > .5).map(img => img.dataset.pose));
          assert.equal(poses.length, 1, `${unit}/${kind} at ${fraction}: one body, no ghost limbs`);
          seen.add(poses[0]);
          assert.equal(await page.locator('.fighter-defender .fighter-frame').evaluateAll(images => images.filter(img => +getComputedStyle(img).opacity > .5).length), kind === 'guard' ? 0 : 1);
          assert.equal(await page.locator('.painted-combat-health .combat-health').count(), kind === 'guard' ? 1 : 2);
          if ([0.12, 0.38, 0.50, 0.67].includes(fraction)) shots.push(await page.locator('.painted-combat-arena').screenshot());
        }
        const ranged = ['lina', 'irene', 'aria', 'bram'].includes(unit);
        for (const pose of ['ready', 'windup', 'strike', 'recover', ...(!ranged ? ['run-a', 'run-b'] : [])]) assert.ok(seen.has(pose), `${unit}: visible ${pose}`);
        const bounds = await page.locator('.painted-combat').boundingBox();
        assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
        const tiles = [];
        for (const shot of shots) tiles.push(await sharp(shot).resize(520, 240, { fit: 'contain', background: '#152720' }).png().toBuffer());
        await sharp({ create: { width: 1040, height: 480, channels: 4, background: '#152720' } }).composite(tiles.map((input, i) => ({ input, left: i % 2 * 520, top: Math.floor(i / 2) * 240 }))).png().toFile(`${out}/${unit}-${kind}-${viewport.width}.png`);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.locator('.fighter-attacker').evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.equal(await page.locator('.fighter-attacker .fighter-ready').evaluate(el => +getComputedStyle(el).opacity), 1);
        await page.close();
      }
      console.log(`Motion QA ${viewport.width}: seven combat types, anatomical frames, no overlapping bodies, responsive fit`);
    }
    assert.deepEqual(errors, []);
    await writeFile(`${out}/result.json`, JSON.stringify({ passed: true, errors, viewports: [1280, 390, 320] }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
