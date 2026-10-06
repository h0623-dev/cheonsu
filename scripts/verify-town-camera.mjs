import { qaBrowserOptions } from './qa-browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

const output = new URL('../tmp/town-camera-qa/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const development = process.env.CHEONSU_QA_DEV === '1';
const server = development
  ? await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  : await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
if (development) await server.listen();
const report = { source: development ? 'development' : 'production', passed: false, results: [] };
let browser;
try {
  browser = await chromium.launch(qaBrowserOptions());
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack }));
    page.setDefaultTimeout(12000);
    const result = { viewport, passed: false, checks: [], lateCallbacks: [], errors };
    report.results.push(result);
    const button = name => page.getByRole('button', { name, exact: true });
    const primarySave = () => page.evaluate(() => localStorage.getItem('cheonsu_v01_save'));
    const captureObserver = () => page.evaluate(() => {
      window.__pendingTownCamera = window.__townCameraObservers.findLast(entry => !entry.disconnected && entry.target.isConnected);
      if (!window.__pendingTownCamera) throw new Error('마을 카메라 관찰자가 없습니다');
    });
    const deliverLateObserver = async label => {
      const lifecycle = await page.evaluate(() => ({ disconnected: window.__pendingTownCamera.disconnected, targetConnected: window.__pendingTownCamera.target.isConnected }));
      assert.equal(lifecycle.disconnected, true, `${label}: 마을 이탈 시 관찰자를 해제합니다`);
      assert.equal(lifecycle.targetConnected, false, `${label}: 이탈한 마을 DOM은 제거됩니다`);
      // Model an already queued host callback arriving after React has cleared the DOM ref.
      await page.evaluate(() => {
        window.__lateTownCameraDelivered = false;
        setTimeout(() => {
          try { window.__pendingTownCamera.callback([], window.__pendingTownCamera.observer); }
          finally { window.__lateTownCameraDelivered = true; }
        }, 0);
      });
      await page.waitForFunction(() => window.__lateTownCameraDelivered);
      assert.deepEqual(errors, [], `${label}: 늦게 도착한 카메라 콜백이 오류를 발생시키지 않습니다`);
      assert.equal(await page.getByText('오류 보호 모드', { exact: true }).count(), 0);
      result.lateCallbacks.push({ label, ...lifecycle });
    };
    const cameraCentered = async () => {
      await page.waitForFunction(() => {
        const shell = document.querySelector('.town-map-shell');
        const world = document.querySelector('.town-world');
        const walker = document.querySelector('.town-walker');
        if (!shell || !world || !walker) return false;
        const x = (Number(walker.dataset.townX) + .5) / 24 * world.clientWidth - shell.clientWidth / 2;
        const y = (Number(walker.dataset.townY) + .5) / 16 * world.clientHeight - shell.clientHeight / 2;
        const expectedX = Math.max(0, Math.min(x, world.clientWidth - shell.clientWidth));
        const expectedY = Math.max(0, Math.min(y, world.clientHeight - shell.clientHeight));
        return Math.abs(shell.scrollLeft - expectedX) < 2 && Math.abs(shell.scrollTop - expectedY) < 2;
      });
    };
    try {
      await page.addInitScript(() => {
        localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false }));
        const Original = window.ResizeObserver;
        window.__townCameraObservers = [];
        window.ResizeObserver = class extends Original {
          constructor(callback) { super(callback); this.__cameraCallback = callback; }
          observe(element, options) {
            if (element.classList.contains('town-map-shell')) window.__townCameraObservers.push({ observer: this, callback: this.__cameraCallback, target: element, disconnected: false });
            return super.observe(element, options);
          }
          disconnect() {
            for (const entry of window.__townCameraObservers) if (entry.observer === this) entry.disconnected = true;
            return super.disconnect();
          }
        };
      });
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
      await button('새 게임').click();
      await page.locator('.campaign-header-actions').getByRole('button', { name: '마을', exact: true }).click();
      await page.locator('.town-hub').waitFor();
      await page.locator('.camp-header .prominent-save').click();
      const saved = await primarySave();
      assert.equal(JSON.parse(saved).screen, 'camp');
      await cameraCentered();
      const rotated = { width: viewport.height, height: viewport.width };
      await page.setViewportSize(rotated);
      await cameraCentered();
      await page.setViewportSize(viewport);
      await cameraCentered();
      result.checks.push('실제 크기 변경 후 캐릭터 위치로 카메라 복구');

      await page.getByRole('combobox', { name: '이동 캐릭터', exact: true }).selectOption('lina');
      await page.locator('.town-idle-art[src*="lina.webp"]').waitFor();
      await button('장비점으로 이동').click();
      await page.locator('.town-facility-dialog').waitFor();
      await page.setViewportSize(rotated);
      await cameraCentered();
      await page.locator('.town-facility-dialog').getByRole('button', { name: '시설 닫기', exact: true }).click();
      await page.setViewportSize(viewport);
      await cameraCentered();
      result.checks.push('이동 캐릭터 변경과 시설 도착·대화 중 화면 회전');

      await captureObserver();
      await button('여관으로 이동').click();
      await page.locator('.town-walker.is-walking').waitFor();
      await page.locator('.town-player-nav').getByRole('button', { name: '설정', exact: true }).click();
      await page.locator('.town-hub').waitFor({ state: 'detached' });
      await deliverLateObserver('이동 중 설정 화면 진입');
      assert.equal(await primarySave(), saved, '설정 진입과 늦은 콜백은 기존 저장을 변경하지 않습니다');
      await button('뒤로').click();
      await page.locator('.town-hub').waitFor();
      await deliverLateObserver('새 마을이 생성된 후 이전 마을 콜백');
      await cameraCentered();

      await captureObserver();
      await button('출전으로 이동').click();
      await page.locator('.campaign-header-actions').waitFor();
      await deliverLateObserver('마을 출구에서 원정 지도 전환');
      assert.equal(await primarySave(), saved, '마을 출구 전환은 기존 저장을 변경하지 않습니다');
      await page.locator('.campaign-header-actions').getByRole('button', { name: '마을', exact: true }).click();
      await page.locator('.town-hub').waitFor();
      await deliverLateObserver('원정 지도에서 마을 재진입 후 이전 콜백');

      for (let cycle = 0; cycle < 3; cycle++) {
        await captureObserver();
        await page.setViewportSize(cycle % 2 ? viewport : rotated);
        await page.locator('.camp-header').getByRole('button', { name: '메뉴', exact: true }).click();
        await page.locator('.town-hub').waitFor({ state: 'detached' });
        await deliverLateObserver(`크기 변경과 메뉴 복귀 ${cycle + 1}`);
        assert.equal(await primarySave(), saved, '반복 마을 이탈 후에도 저장 문자열 전체를 보존합니다');
        await button('이어하기').click();
        await page.locator('.town-hub').waitFor();
        await cameraCentered();
      }
      await page.setViewportSize(viewport);
      await cameraCentered();
      assert.equal(await primarySave(), saved, '저장된 진행도·수집 데이터 전체를 보존합니다');
      assert.deepEqual(errors, []);
      result.checks.push('이탈 후 늦은 관찰자 콜백 7회 안전 처리', '마을 재진입과 반복 메뉴 복귀', '기존 저장 전체 보존');
      result.passed = true;
      await page.screenshot({ path: fileURLToPath(new URL(`${viewport.width}x${viewport.height}-passed.png`, output)) });
      console.log(`PASS 마을 카메라 ${viewport.width}x${viewport.height}: 늦은 콜백 ${result.lateCallbacks.length}회, 저장 보존`);
    } catch (error) {
      result.failure = error.stack;
      await page.screenshot({ path: fileURLToPath(new URL(`${viewport.width}x${viewport.height}-failure.png`, output)) }).catch(() => {});
      throw error;
    } finally {
      await fs.writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
      await context.close();
    }
  }
  report.passed = true;
  await fs.writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
