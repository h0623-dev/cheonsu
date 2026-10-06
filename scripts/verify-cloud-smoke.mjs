import { qaBrowserOptions } from './qa-browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const output = new URL('../tmp/cloud-qa/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
let browser;
const results = [];
try {
  browser = await chromium.launch(qaBrowserOptions());
  const address = server.httpServer.address();
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith('http://127.0.0.1:')) errors.push(`${response.status()} ${response.url()}`); });
    await page.addInitScript(() => localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'off' })));
    const button = name => page.getByRole('button', { name, exact: true });
    const screenshot = async name => {
      await page.locator('img:visible').evaluateAll(async images => {
        await Promise.all(images.map(async img => {
          img.loading = 'eager';
          await img.decode();
          if (!img.naturalWidth) throw new Error(`Blank image: ${img.src}`);
        }));
      });
      await page.screenshot({ path: fileURLToPath(new URL(`${viewport.width}-${name}.png`, output)) });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'page must fit the viewport');
    };
    try {
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.locator('.journey-title').waitFor();
      await screenshot('title');
      await button('도감').click();
      await page.locator('.collection-card').first().waitFor();
      assert.equal(await page.locator('.collection-card').count(), 21);
      assert.equal(await page.locator('[data-collected=true]').count(), 4);
      await page.locator('[data-character="hero"]').click();
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.locator('.character-detail-skills > div').count(), 2);
      await screenshot('codex');
      await page.keyboard.press('Escape');
      await button('뒤로').click();
      await button('설정').click();
      await screenshot('settings');
      await button('뒤로').click();
      await button('새 게임').click();
      await page.locator('.campaign-header .prominent-save').click();
      const save = await page.evaluate(() => localStorage.getItem('cheonsu_v01_save'));
      assert.ok(save, 'manual save must persist');
      await screenshot('campaign');
      await page.reload();
      await button('이어하기').click();
      await page.locator('.campaign-stage-select').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('cheonsu_v01_save')), save, 'continue must preserve the save');
      assert.deepEqual(errors, []);
      results.push({ viewport, passed: true, checks: ['title', 'codex', 'settings', 'campaign', 'save', 'continue', 'images', 'overflow', 'console'] });
      console.log(`PASS cloud browser smoke ${viewport.width}x${viewport.height}`);
    } catch (error) {
      await page.screenshot({ path: fileURLToPath(new URL(`${viewport.width}-failure.png`, output)) }).catch(() => {});
      results.push({ viewport, passed: false, error: error.message, errors });
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await fs.writeFile(new URL('result.json', output), JSON.stringify(results, null, 2));
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
