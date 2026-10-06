import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { STORY_SCENES } from '../src/data/storyScenes.js';
import { getStoryPortrait } from '../src/data/storyArt.js';
import { getWorldScene } from '../src/data/worldArt.js';
import { qaBrowserOptions } from './qa-browser.mjs';

const base = process.env.FIXTURE_URL || process.env.GAME_URL || 'http://127.0.0.1:5176';
const out = 'tmp/story-art-qa';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(qaBrowserOptions());
let count = 0;
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
    const page = await browser.newPage({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tests/fixtures/story-art.html`);
    for (const [id, story] of Object.entries(STORY_SCENES)) for (const type of ['intro', 'clear']) {
      for (const [index, line] of story[type].entries()) {
        await page.evaluate(data => window.renderStoryArt(data), { stageId: Number(id), type, index });
        const actor = page.locator('.narrative-actor img');
        const background = page.locator('.narrative-background');
        await background.evaluate(img => img.decode());
        assert.equal(await background.getAttribute('src'), getWorldScene(Number(id)));
        await actor.evaluate(img => img.decode());
        assert.equal(await actor.getAttribute('src'), getStoryPortrait(line.speaker));
        const issues = await page.evaluate(() => [...document.querySelectorAll('.narrative-header,.narrative-actor,.narrative-dialogue,.narrative-dialogue button')].flatMap(el => {
          const r = el.getBoundingClientRect();
          return r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2 ? [el.className] : [];
        }));
        assert.deepEqual(issues, [], `${viewport.width}x${viewport.height}: ${id}-${type}-${index}`);
        if (id === '3' && type === 'intro') await page.screenshot({ path: `${out}/${viewport.width}-${line.speaker}-${index}.png` });
        if (viewport.width === 390 && type === 'intro' && index === 0) await page.screenshot({ path: `${out}/chapter-${id}.png` });
        count++;
      }
    }
    await page.evaluate(() => window.renderStoryArt());
    await page.getByRole('button', { name: '이전 대사', exact: true }).click();
    assert.equal(await page.locator('.narrative-actor img').getAttribute('alt'), '레온');
    await page.getByRole('button', { name: '다음', exact: true }).click();
    assert.equal(await page.locator('.narrative-actor img').getAttribute('alt'), '흑천 가론');
    await page.getByRole('button', { name: '대화 기록', exact: true }).click();
    assert.ok(await page.getByRole('dialog').isVisible());
    await page.getByRole('button', { name: '대화 기록 닫기', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(`PASS ${count} story lines, 5 viewports, speaker switching and history controls`);
} finally { await browser.close(); }
