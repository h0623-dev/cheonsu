import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getStoryPortrait } from '../src/data/storyArt.js';

const base = process.env.ACTUAL_GAME_URL || 'http://127.0.0.1:5189';
const key = 'cheonsu_v01_save';
const browser = await chromium.launch({ headless: true, ...(process.env.CHEONSU_QA_BROWSER ? { channel: process.env.CHEONSU_QA_BROWSER } : process.platform === 'win32' ? { channel: 'msedge' } : {}) });
await fs.mkdir('tmp/story-art-qa', { recursive: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'off' })));
    await page.goto(base);
    await page.getByRole('button', { name: '새 게임', exact: true }).click();
    await page.locator('.campaign-header .prominent-save').click();
    await page.evaluate(key => {
      const save = JSON.parse(localStorage.getItem(key));
      save.clearedStages = [1, 2];
      localStorage.setItem(key, JSON.stringify(save));
    }, key);
    await page.reload();
    await page.getByRole('button', { name: '이어하기', exact: true }).click();
    await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: /^3장\./ }) }).click();
    await page.getByRole('button', { name: '전투 시작', exact: true }).click();
    const before = await page.evaluate(key => localStorage.getItem(key), key);
    await page.getByRole('button', { name: '다음', exact: true }).click();
    const actor = page.locator('.narrative-actor img');
    await actor.evaluate(img => img.decode());
    assert.equal(await actor.getAttribute('src'), getStoryPortrait('흑천 가론'));
    assert.equal(await actor.getAttribute('alt'), '흑천 가론');
    await page.screenshot({ path: `tmp/story-art-qa/production-garon-${viewport.width}.png` });
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await actor.evaluate(img => img.decode());
    assert.equal(await actor.getAttribute('src'), getStoryPortrait('카일'));
    await page.getByRole('button', { name: '이전 대사', exact: true }).click();
    assert.equal(await actor.getAttribute('src'), getStoryPortrait('흑천 가론'));
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before, 'dialogue must preserve the existing save');
    await page.getByRole('button', { name: '바로 전투', exact: true }).click();
    await page.locator('.world-battlefield').waitFor();
    await page.waitForFunction(() => document.querySelector('.cinematic-command-bar .prominent-save')?.disabled === false && !document.querySelector('.boss-splash-overlay'));
    await page.locator('.cinematic-command-bar .prominent-save').click();
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(after.selectedStage.id, 3);
    assert.deepEqual(after.clearedStages, [1, 2]);
    assert.ok(after.units.filter(unit => unit.type === 'ally').every(unit => !unit.acted));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS production story: Garon/hero/back, battle entry, unchanged progress and actions in portrait/landscape');
} finally { await browser.close(); }
