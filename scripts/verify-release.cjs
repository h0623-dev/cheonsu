const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { mkdir } = require('node:fs/promises');
const assert = require('node:assert/strict');

(async () => {
  const url = 'http://127.0.0.1:5187';
  const occupied = await fetch(url).then(() => true).catch(() => false);
  assert.equal(occupied, false, 'Production smoke-test port must be unused');
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { windowsHide: true, stdio: 'ignore' });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      ready = await fetch(url).then(response => response.ok).catch(() => false);
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'Production preview started');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
    await page.goto(url);
    await page.getByRole('button', { name: '새 게임', exact: true }).click();
    await page.locator('.campaign-header .prominent-save').click();
    await page.evaluate(() => {
      const key = 'cheonsu_v01_save'; const data = JSON.parse(localStorage.getItem(key));
      data.clearedStages = [1]; localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload();
    await page.getByRole('button', { name: '이어하기', exact: true }).click();
    await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: /^2장\./ }) }).click();
    await page.getByRole('button', { name: '전투 시작', exact: true }).click();
    await page.locator('.narrative-actor img').evaluate(image => image.decode());
    assert.ok(await page.locator('.narrative-line').innerText());
    await page.getByRole('button', { name: '바로 전투', exact: true }).click();
    await page.locator('.world-battlefield .unit-visual-hero').waitFor();
    const enemies = page.locator('.world-battlefield .unit img[src*="/art/map-sprites-v4/"]');
    assert.ok(await enemies.count() > 0);
    await enemies.evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.getByRole('button', { name: '탐색 기록', exact: true }).click();
    const dialog = page.locator('.discovery-dialog');
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(element => element.matches(':modal')), true);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 10 && bounds.y >= 10 && bounds.x + bounds.width <= 380 && bounds.y + bounds.height <= 834);
    assert.ok(await dialog.locator('article').count() >= 2);
    await mkdir('tmp/release-qa', { recursive: true });
    await page.screenshot({ path: 'tmp/release-qa/discoveries-production-390.png' });
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    for (const width of [390, 320]) {
      await page.setViewportSize({width, height:width===320?568:844});
      const commands=page.locator('.cinematic-command-bar > button');
      assert.equal(await commands.locator('svg').count(),4);
      const overflow=await commands.evaluateAll(buttons=>buttons.some(button=>button.scrollWidth>button.clientWidth+2));
      assert.equal(overflow,false,'Command icons and labels fit narrow viewports');
      const wrapped=await commands.evaluateAll(buttons=>buttons.some(button=>[...button.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE && node.textContent.trim()).some(node=>{
        const range=document.createRange(); range.selectNodeContents(node);
        return range.getClientRects().length>1;
      })));
      assert.equal(wrapped,false,'Command labels remain on one line');
      await page.screenshot({path:`tmp/release-qa/commands-production-${width}.png`});
    }
    assert.deepEqual(errors, []);
    console.log('PASS: production bundle, stage 2, refreshed enemies, native centered discovery journal, no browser errors');
  } finally {
    if (browser) await browser.close();
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
