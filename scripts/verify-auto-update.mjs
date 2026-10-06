import { qaBrowserOptions } from './qa-browser.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { webBuildInfo } from './update-build-info.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const trust = JSON.parse(fs.readFileSync('src/data/updateTrust.json', 'utf8'));
// Only this isolated fixture trusts a fresh in-memory test key. Release trust stays unchanged.
const { privateKey: key, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const fixtureTrust = { ...trust, publicKey: publicKey.export({ type: 'spki', format: 'pem' }) };
const nativeVersion = JSON.parse(fs.readFileSync('android/app/build.gradle', 'utf8').match(/versionCode\s+(\d+)/)[1]);
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const nextVersion = pkg.version.replace(/\d+$/, n => String(Number(n) + 1));
const sha256 = 'a'.repeat(64);
const releaseRoot = `https://github.com/${trust.repository}/releases/download/v${nextVersion}`;
const manifest = { schema: 1, version: nextVersion, bundleId: `${nextVersion}-${sha256.slice(0, 12)}`, sha256,
  url: `${releaseRoot}/cheonsu_${nextVersion}_ota.zip`, apkUrl: `${releaseRoot}/cheonsu_${nextVersion}_update_debug.apk`,
  size: 200000000, minNativeVersion: nativeVersion, maxNativeVersion: nativeVersion, bundleSignature: 'a'.repeat(512), notes: ['자동 패치 화면 검사'] };
const bytes = Buffer.from(JSON.stringify(manifest));
const envelope = { payload: bytes.toString('base64'), signature: sign('RSA-SHA256', bytes, key).toString('base64') };
fs.mkdirSync('tmp/update-qa', { recursive: true });
let browser, fixtureServer, productionServer;
try {
  const originalBuild = webBuildInfo(root);
  assert.deepEqual(JSON.parse(fs.readFileSync('dist/ota-build.json', 'utf8')), originalBuild, '최종 소스와 동일한 생산 빌드');
  productionServer = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } });
  const productionBase = `http://127.0.0.1:${productionServer.httpServer.address().port}`;
  const fixtureOut = path.join(root, 'tmp/update-qa/production-fixture');
  await build({ root, configFile: false, logLevel: 'error', plugins: [{
    name: 'temporary-update-ui-test-trust', enforce: 'pre', load(id) {
      if (id === path.join(root, 'src/data/updateTrust.json')) return JSON.stringify(fixtureTrust);
    },
  }, react()], build: { outDir: fixtureOut, emptyOutDir: true, copyPublicDir: false } });
  fixtureServer = await preview({ root, configFile: false, build: { outDir: fixtureOut }, preview: { host: '127.0.0.1', port: 0, open: false } });
  const base = `http://127.0.0.1:${fixtureServer.httpServer.address().port}`;
  browser = await chromium.launch(qaBrowserOptions());
  const proxyAssets = async page => {
    for (const glob of ['**/art/**', '**/audio/**', '**/legal/**']) await page.route(glob, async route => {
      const response = await route.fetch({ url: route.request().url().replace(base, productionBase) });
      await route.fulfill({ response });
    });
  };
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    await context.addInitScript(({ bundleId, nativeVersion }) => {
      window.androidBridge = {};
      window.__nativeCalls = [];
      window.__progress = null;
      window.Capacitor = {
        PluginHeaders: [{ name: 'LiveUpdate', methods: ['ready', 'getVersionCode', 'getBlockedBundles', 'getNextBundle', 'getDownloadedBundles', 'downloadBundle', 'setNextBundle', 'reload', 'removeListener'].map(name => ({ name, rtype: 'promise' })).concat([{ name: 'addListener', rtype: 'callback' }]) }],
        nativeCallback: (plugin, method, options, callback) => { window.__progress = callback; return 'progress'; },
        nativePromise: async (plugin, method, options) => {
          window.__nativeCalls.push({ method, options });
          if (method === 'getVersionCode') return { versionCode: String(nativeVersion) };
          if (['getBlockedBundles', 'getDownloadedBundles'].includes(method)) return { bundleIds: [] };
          if (method === 'getNextBundle') return { bundleId: null };
          if (method === 'downloadBundle') {
            window.__progress({ bundleId, progress: 0.51 });
            return new Promise(resolve => { window.__finishDownload = resolve; });
          }
          return {};
        },
      };
      localStorage.setItem('cheonsu_v01_save', '{"version":"1.99.135","sentinel":"keep-me"}');
    }, { bundleId: manifest.bundleId, nativeVersion });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await proxyAssets(page);
    await page.route(trust.manifestUrl, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope), headers: { 'Access-Control-Allow-Origin': '*' } }));
    await page.routeWebSocket('**', () => {});
    await page.goto(base);
    await page.locator('.patch-title-status').filter({ hasText: '51%' }).waitFor();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('button', { name: '업데이트', exact: true }).click();
    const card = page.locator('.patch-settings');
    await card.scrollIntoViewIfNeeded();
    assert.equal(await card.getByRole('progressbar').getAttribute('value'), '51');
    const box = await card.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, 'settings must fit');
    await card.screenshot({ path: `tmp/update-qa/downloading-${viewport.width}.png` });
    await page.evaluate(async bundleId => {
      let map = window.__CHEONSU_ACTIVE_MAP__;
      window.__rootRendersDuringDownload = 0;
      Object.defineProperty(window, '__CHEONSU_ACTIVE_MAP__', { configurable: true,
        get: () => map, set: value => { map = value; window.__rootRendersDuringDownload++; } });
      for (let i = 520; i <= 800; i++) {
        window.__progress({ bundleId, progress: i / 1000 });
        if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 10));
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, manifest.bundleId);
    assert.equal(await card.getByRole('progressbar').getAttribute('value'), '80');
    assert.equal(await page.evaluate(() => window.__rootRendersDuringDownload), 0, 'Background patch progress must not re-render the game root');
    await card.getByRole('checkbox').uncheck();
    assert.equal(await page.evaluate(() => localStorage.getItem('cheonsu_auto_patch')), 'false');
    await page.evaluate(() => window.__finishDownload());
    await card.getByText('설치 준비 완료', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__nativeCalls.some(call => call.method === 'reload')), false);
    assert.match(await page.evaluate(() => localStorage.getItem('cheonsu_v01_save')), /keep-me/);
    await page.locator('.player-settings').getByRole('button', { name: '뒤로', exact: true }).click();
    await page.locator('.patch-title-status').getByRole('button', { name: '지금 적용' }).waitFor();
    const patchBox = await page.locator('.patch-title-status').boundingBox();
    const menuBox = await page.locator('.journey-title-actions').boundingBox();
    assert.ok(patchBox.y >= menuBox.y + menuBox.height, 'patch status must not overlap title or menu');
    assert.ok(patchBox.x >= 0 && patchBox.x + patchBox.width <= viewport.width + 1);
    await page.screenshot({ path: `tmp/update-qa/pending-${viewport.width}.png` });
    await page.locator('.patch-title-status').getByRole('button', { name: '지금 적용' }).click();
    await page.waitForFunction(() => window.__nativeCalls.some(call => call.method === 'reload'));
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${viewport.width}x${viewport.height}: 실제 앱 UI + 모의 네이티브 브리지, 진행률/설정/저장보존/수동적용`);
  }
  const page = await browser.newPage({ serviceWorkers: 'block' });
  await proxyAssets(page);
  await page.routeWebSocket('**', () => {});
  await page.goto(base); await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '업데이트', exact: true }).click();
  await page.getByText('자동 패치는 Android 앱에서 제공됩니다.', { exact: true }).waitFor();
  assert.equal(await page.locator('.patch-settings').getByRole('checkbox').isDisabled(), true);
  console.log('PASS 웹 실행: 네이티브 기능 미지원 안내');
  assert.deepEqual(webBuildInfo(root), originalBuild, '검사에서 게임 소스와 공개 OTA trust는 바뀌지 않습니다');
  fs.writeFileSync('tmp/update-qa/result.json', JSON.stringify({ passed: true, productionUi: true, ephemeralTestTrust: true, releasePrivateKeyAccessed: false, nativeBridge: 'mock', actualAndroidDevice: false, viewports: 4, build: originalBuild }, null, 2));
} finally { await browser?.close(); await fixtureServer?.close(); await productionServer?.close(); }
