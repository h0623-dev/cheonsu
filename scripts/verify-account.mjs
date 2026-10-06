import { qaBrowserOptions } from './qa-browser.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out = 'tmp/account-qa';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(qaBrowserOptions());
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
    const errors = [], authRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/identitytoolkit|securetoken|accounts.google/.test(request.url())) authRequests.push(request.url()); });
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5177');
    await page.getByRole('button', { name: '새 게임', exact: true }).click();
    await page.locator('.campaign-header .prominent-save').click();
    const before = await page.evaluate(() => localStorage.getItem('cheonsu_v01_save'));
    await page.reload();
    await page.screenshot({ path: `${out}/${viewport.width}-title.png` });
    await page.getByRole('button', { name: '게스트 · 기기 저장', exact: true }).click();
    await page.getByRole('heading', { name: '계정', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Google로 로그인', exact: true }).count(), 0);
    assert.match(await page.locator('.account-panel').innerText(), /아직 지원하지 않습니다/);
    assert.equal(await page.evaluate(() => localStorage.getItem('cheonsu_v01_save')), before);
    const layout = await page.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page overflow');
      for (const el of document.querySelectorAll('.account-panel button, .ux-tabs button')) {
        const r = el.getBoundingClientRect();
        if (r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1) issues.push(el.textContent);
      }
      return issues;
    });
    assert.deepEqual(layout, []);
    await page.screenshot({ path: `${out}/${viewport.width}-account.png` });
    for (const href of ['/legal/privacy.html', '/legal/account-deletion.html']) {
      const response = await page.request.get(new URL(href, page.url()).href);
      assert.equal(response.status(), 200);
      assert.match(await response.text(), /천수/);
    }
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
    await page.getByRole('button', { name: '이어하기', exact: true }).click();
    await page.locator('.campaign-header').waitFor();
    assert.deepEqual(errors, []); assert.deepEqual(authRequests, []);
    console.log(`PASS account ${viewport.width}x${viewport.height}: honest configuration state, no auth network, saves preserved, legal pages, layout`);
    await page.close();
  }
} finally { await browser.close(); }
