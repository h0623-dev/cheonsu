import { saveBattle as clickBattleSave } from './qa-battle-tools.mjs';
import { qaBrowserOptions, confirmStageMission } from './qa-browser.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.GAME_URL || 'http://127.0.0.1:5193';
const browser = await chromium.launch(qaBrowserOptions());
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem('cheonsu_auto_patch', 'false');
    localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'off' }));
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 120000 });
  await page.reload();
  await page.getByRole('button', { name: '새 게임', exact: true }).waitFor();
  const samples = await page.evaluate(async () => {
    const paths = (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(r => new URL(r.url).pathname)))).flat();
    return [...new Set(paths.filter(path => path.startsWith('/audio/') && path.endsWith('.mp3')))];
  });
  assert.equal(samples.length, 72);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: /^1장\./ }) }).click();
  await page.getByRole('button', { name: '전투 시작', exact: true }).click();
  await page.getByRole('button', { name: '바로 전투', exact: true }).click(); await confirmStageMission(page);
  await page.locator('.world-battlefield .unit-visual-hero').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.world-battlefield img')].every(img => img.complete && img.naturalWidth > 0));
  const decoded = await page.evaluate(async paths => {
    const ctx = new OfflineAudioContext(1, 22050, 22050);
    for (const path of paths) {
      const response = await fetch(path);
      if (!response.ok) throw Error(`Offline sample missing: ${path}`);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      if (buffer.duration <= 0) throw Error(`Empty sample: ${path}`);
    }
    return paths.length;
  }, samples);
  await clickBattleSave(page);
  await page.reload();
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  await page.locator('.world-battlefield .unit-visual-hero').waitFor();
  assert.deepEqual(errors, []);
  await fs.mkdir('tmp/qa153', { recursive: true });
  await page.screenshot({ path: 'tmp/qa153/offline-production.png' });
  console.log(`PASS production PWA: offline reload, new battle, save/resume, ${decoded} cached/decoded music samples, no page errors`);
} finally {
  await browser.close();
}
