import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { getWorldScene, getWorldSceneThumbnail } from '../src/data/worldArt.js';

const base = process.env.GAME_URL || 'http://127.0.0.1:5176';
const fixtures = process.env.FIXTURE_URL || 'http://127.0.0.1:5176';
const out = 'tmp/chapter-art-qa';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 568, height: 320 }];
let deployments = 0, combats = 0, previews = 0;
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem('cheonsu_settings_v1')) localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'off' }));
    });
    await page.goto(base);
    await page.getByRole('button', { name: '새 게임', exact: true }).click();
    await page.locator('.campaign-header .prominent-save').click();
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('cheonsu_v01_save'));
      data.clearedStages = Array.from({ length: 30 }, (_, index) => index + 1);
      data.screen = 'campaign';
      localStorage.setItem('cheonsu_v01_save', JSON.stringify(data));
    });
    await page.reload();
    await page.getByRole('button', { name: '이어하기', exact: true }).click();
    const checkpoint = await page.evaluate(() => localStorage.getItem('cheonsu_v01_save'));
    for (let id = 1; id <= 30; id++) {
      const node = page.locator('.world-stage-node').filter({ has: page.locator('strong', { hasText: new RegExp(`^${id}장\\.`) }) });
      await node.scrollIntoViewIfNeeded();
      const thumbnail = node.locator('.chapter-node-preview > img');
      await thumbnail.evaluate(img => img.decode());
      assert.equal(await thumbnail.getAttribute('src'), getWorldSceneThumbnail(id));
      await node.click();
      const image = page.locator('.chapter-brief img');
      await image.evaluate(img => img.decode());
      assert.equal(await image.getAttribute('src'), getWorldScene(id));
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.chapter-brief,.chapter-brief > div,.screen-panel-header')].filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.className));
      assert.deepEqual(overflow, [], `chapter ${id}: ${viewport.width}`);
      if ([1, 12, 21, 30].includes(id)) await page.screenshot({ path: `${out}/deployment-${id}-${viewport.width}.png` });
      await page.locator('.screen-panel-header').getByRole('button', { name: '뒤로', exact: true }).click();
      deployments++;
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('cheonsu_v01_save')), checkpoint, 'browsing chapters preserves progress');
    await page.reload();
    await page.getByRole('button', { name: '기록실', exact: true }).click();
    for (let act = 1; act <= 5; act++) {
      await page.getByRole('button', { name: `제${act}막`, exact: true }).click();
      for (let index = 0; index < 6; index++) {
        const image = page.locator('.library-chapters article > img').nth(index);
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(img => img.decode());
        assert.equal(await image.getAttribute('src'), getWorldSceneThumbnail((act - 1) * 6 + index + 1));
        previews++;
      }
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('cheonsu_v01_save')), checkpoint);
    for (let id = 1; id <= 30; id++) {
      await page.goto(`${fixtures}/tests/fixtures/combat.html?stage=${id}`);
      await page.locator('.painted-combat').waitFor();
      await page.locator('.painted-combat img').evaluateAll(async images => { for (const image of images) await image.decode(); });
      const scene = getWorldScene(id);
      const background = await page.locator('.painted-combat-arena').evaluate(async (el, path) => {
        const image = new Image(); image.src = path; await image.decode();
        return { url: getComputedStyle(el).backgroundImage, width: image.naturalWidth };
      }, scene);
      assert.ok(background.url.includes(scene));
      assert.equal(background.width, 1536);
      await page.evaluate(() => document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 1900; }));
      const bounds = await page.locator('.painted-combat').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
      const screenshot = await page.locator('.painted-combat-arena').screenshot();
      const stats = await sharp(screenshot).stats();
      assert.ok(stats.channels.slice(0, 3).every(channel => channel.stdev > 20), `nonblank chapter ${id}`);
      if ([1, 12, 21, 30].includes(id)) await page.screenshot({ path: `${out}/combat-${id}-${viewport.width}.png` });
      combats++;
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}x${viewport.height}: 30장 출전/기록실/전투 배경`);
    await page.close();
  }
  console.log(`PASS ${deployments} deployments, ${previews} library previews, ${combats} combat scenes; progress unchanged`);
} finally { await browser.close(); }
