const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    await mkdir('tmp/movement-hud-qa', { recursive: true });
    for (const width of [1280, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: width === 320 ? 568 : 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5176');
      await page.getByRole('button', { name: '새 게임', exact: true }).click();
      await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: /^1장\./ }) }).click();
      await page.getByRole('button', { name: '전투 시작', exact: true }).click();
      await page.getByRole('button', { name: '바로 전투', exact: true }).click();
      await page.locator('.world-battlefield .unit-visual-hero').waitFor();
      const card = page.locator('.cinematic-stage-card');
      const bounds = await card.boundingBox();
      assert.ok(bounds.width <= (width > 600 ? 212 : 192), JSON.stringify(bounds));
      assert.ok(bounds.height < 140, JSON.stringify(bounds));
      assert.equal(await card.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
      await page.locator('.world-battlefield .unit-visual-hero').click();
      assert.ok((await page.locator('.selected-unit-status-hud').innerText()).includes('이 4'));
      await page.screenshot({ path: `tmp/movement-hud-qa/hud-${width}.png` });
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, bounds, movement: 4, errors }));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
