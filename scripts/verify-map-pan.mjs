import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.GAME_URL || 'http://127.0.0.1:5176';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
await fs.mkdir('tmp/performance-qa', { recursive: true });
try {
  for (const code of [335, 337]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await context.addInitScript(code => {
      localStorage.setItem('cheonsu_auto_patch', 'false');
      window.androidBridge = {};
      window.Capacitor = {
        PluginHeaders: [{ name: 'LiveUpdate', methods: ['ready', 'getVersionCode'].map(name => ({ name, rtype: 'promise' })) }],
        nativePromise: async (plugin, method) => method === 'getVersionCode' ? { versionCode: String(code) } : {},
      };
    }, code);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.getByRole('button', { name: '새 게임', exact: true }).click();
    await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: /^1장\./ }) }).click();
    await page.getByRole('button', { name: '전투 시작', exact: true }).click();
    await page.getByRole('button', { name: '바로 전투', exact: true }).click();
    const save = page.locator('.cinematic-command-bar .prominent-save');
    await save.click();
    const unitsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('cheonsu_v01_save')).units);
    await page.waitForTimeout(1000);
    const shell = page.locator('.battle-map-scroll-shell');
    await shell.evaluate(element => { element.scrollTop = 0; element.scrollLeft = 0; });
    const cdp = await context.newCDPSession(page);
    // Real browser touch input: native scrolling cancels pointer events, unlike mouse dragging.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 440 }] });
    for (let y = 430; y >= 260; y -= 10) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(900);
    assert.ok(await shell.evaluate(element => element.scrollTop) > 80, 'Native touch scroll must move the map');
    await save.click();
    const afterTouch = await page.evaluate(() => JSON.parse(localStorage.getItem('cheonsu_v01_save')).units);
    assert.deepEqual(afterTouch, unitsBefore, 'Touch scrolling/cancellation must never move or act a unit');
    const beforeMouse = await shell.evaluate(element => element.scrollTop);
    await page.mouse.move(190, 300); await page.mouse.down();
    await page.mouse.move(230, 470, { steps: 30 }); await page.mouse.up();
    await page.waitForTimeout(250);
    assert.ok(await shell.evaluate(element => element.scrollTop) < beforeMouse - 60, 'Desktop dragging still works');
    await save.click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('cheonsu_v01_save')).units), unitsBefore);
    await page.screenshot({ path: `tmp/performance-qa/touch-pan-${code}.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS APK ${code}: native touch/momentum, pointercancel, mouse pan, unchanged units/save`);
  }
} finally { await browser.close(); }
