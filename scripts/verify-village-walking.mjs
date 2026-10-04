import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

const output = new URL('../tmp/village-walking-qa/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const development = process.env.CHEONSU_QA_DEV === '1';
const server = development
  ? await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  : await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
if (development) await server.listen();
const address = server.httpServer.address();
const report = { source: development ? 'development' : 'production', results: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHEONSU_QA_BROWSER ? { channel: process.env.CHEONSU_QA_BROWSER } : {}) });
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/art/village-walk-v2/')) errors.push(`${response.status()} ${response.url()}`);
    });
    const result = { viewport, passed: false, checks: [] };
    report.results.push(result);
    const button = name => page.getByRole('button', { name, exact: true });
    const walker = page.locator('.town-walker');
    const idle = page.locator('.town-idle-art');
    const facility = page.locator('.town-facility-dialog');
    const coordinates = () => walker.evaluate(element => [Number(element.dataset.townX), Number(element.dataset.townY)]);
    const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(`${viewport.width}x${viewport.height}-${name}.png`, output)) });
    const stopped = async () => {
      await page.locator('.town-walker.is-walking').waitFor({ state: 'detached', timeout: 10000 });
      assert.equal(await page.locator('.town-walk-art').count(), 0, '멈추면 걷기 프레임이 남지 않아야 합니다');
      assert.equal(await idle.evaluate(element => getComputedStyle(element).visibility), 'visible');
    };
    const traceWalk = () => page.evaluate(() => new Promise(resolve => {
      const samples = [];
      const timer = setInterval(() => {
        const actor = document.querySelector('.town-walker');
        const art = actor?.querySelector('.town-walk-art');
        samples.push({ x: actor?.dataset.townX, y: actor?.dataset.townY, direction: actor?.dataset.townDirection,
          frame: actor?.dataset.walkFrame, src: art?.getAttribute('src') || null,
          loaded: art ? art.complete && art.naturalWidth > 0 : true,
          transform: art ? getComputedStyle(art).transform : null });
        if (!actor?.classList.contains('is-walking') || samples.length > 500) { clearInterval(timer); resolve(samples); }
      }, 35);
    }));
    try {
      await page.addInitScript(() => localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false })));
      await page.goto(`http://127.0.0.1:${address.port}`);
      await button('새 게임').click();
      await page.locator('.campaign-header-actions').getByRole('button', { name: '마을', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.town-walker')?.dataset.walkReady === 'true');
      const idleSource = await idle.getAttribute('src');
      assert.match(idleSource, /\/art\/map-sprites-v4\/hero\.webp$/);
      await screenshot('idle');
      await page.locator('.camp-header .prominent-save').click();
      const beforeSave = await page.evaluate(() => JSON.parse(localStorage.getItem('cheonsu_v01_save')));
      await button('상점으로 이동').click();
      const trace = await traceWalk();
      await facility.waitFor();
      await stopped();
      assert.equal(await idle.getAttribute('src'), idleSource, '도착 후 기존 대기 그림으로 정확히 복귀합니다');
      assert.deepEqual(await coordinates(), [8, 5]);
      const frames = new Set(trace.map(sample => sample.src).filter(Boolean));
      for (const view of ['front', 'back']) for (const pose of ['a', 'b']) {
        assert.ok(frames.has(`/art/village-walk-v2/hero-${view}-${pose}.webp`), `${view}/${pose} 교차 보행 프레임을 실제 이동 중 표시합니다`);
      }
      assert.ok(trace.every(sample => sample.loaded), '사전 로딩한 프레임은 이동 중 빈 이미지 없이 표시됩니다');
      assert.ok(trace.some(sample => sample.direction === 'left' && sample.transform === 'matrix(-1, 0, 0, 1, 0, 0)'), '왼쪽 보행은 좌우 반전합니다');
      result.checks.push('앞뒤 교차 보행 4개 프레임', '좌우 방향', '시설 도착 후 기존 대기 그림');
      result.observedFrames = [...frames];
      const atShop = await coordinates();
      await page.waitForTimeout(450);
      assert.deepEqual(await coordinates(), atShop, '시설 대화 중에는 이동을 계속하지 않습니다');
      await screenshot('shop-arrival');
      await facility.getByRole('button', { name: '시설 닫기', exact: true }).click();
      await button('상점으로 이동').click();
      await facility.waitFor();
      await stopped();
      await facility.getByRole('button', { name: '시설 닫기', exact: true }).click();
      result.checks.push('시설 대화 중 정지', '현재 시설 즉시 재방문');

      await button('여관으로 이동').click();
      await page.locator('.town-walk-art').waitFor();
      await screenshot('walking');
      await button('마을 이동 취소').click();
      await stopped();
      const cancelledAt = await coordinates();
      await page.waitForTimeout(450);
      assert.deepEqual(await coordinates(), cancelledAt, '이동 취소 후에는 남은 경로를 걷지 않습니다');
      assert.equal(await facility.count(), 0, '취소한 시설이 뒤늦게 열리지 않습니다');
      assert.equal(await idle.getAttribute('src'), idleSource);
      result.checks.push('이동 취소 후 정지');

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await button('여관으로 이동').click();
      await page.locator('.town-walker.is-walking').waitFor();
      assert.equal(await page.locator('.town-walk-art').count(), 0, '동작 줄이기에서는 보행 프레임 순환을 멈춥니다');
      assert.equal(await idle.evaluate(element => getComputedStyle(element).visibility), 'visible');
      await facility.waitFor();
      await stopped();
      assert.deepEqual(await coordinates(), [17, 5]);
      await facility.getByRole('button', { name: '시설 닫기', exact: true }).click();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      result.checks.push('동작 줄이기와 시설 이동');

      // Hold DOM decode promises to reproduce rapid A→B→A selection before new frames are ready.
      await page.evaluate(() => {
        const gate = { original: HTMLImageElement.prototype.decode, released: false, pending: [] };
        window.__townDecodeGate = gate;
        HTMLImageElement.prototype.decode = function () {
          const decoded = gate.original.call(this);
          return this.src.includes('/art/village-walk-v2/')
            ? decoded.then(() => gate.released ? undefined : new Promise(resolve => gate.pending.push(resolve)))
            : decoded;
        };
      });
      await page.getByLabel('이동 캐릭터', { exact: true }).selectOption('lina');
      await page.getByLabel('이동 캐릭터', { exact: true }).selectOption('hero');
      assert.equal(await walker.getAttribute('data-walk-ready'), 'false', '재선택한 DOM 이미지도 decode 완료까지 기다립니다');
      await button('상점으로 이동').click();
      assert.equal(await page.locator('.town-walk-art').count(), 0, '로딩 중 이동은 기존 대기 이미지로 계속 표시합니다');
      assert.equal(await idle.evaluate(element => getComputedStyle(element).visibility), 'visible');
      await page.waitForFunction(() => window.__townDecodeGate.pending.length >= 4);
      await page.evaluate(() => {
        const gate = window.__townDecodeGate;
        gate.released = true;
        HTMLImageElement.prototype.decode = gate.original;
        gate.pending.forEach(resolve => resolve());
      });
      await page.waitForFunction(() => document.querySelector('.town-walker')?.dataset.walkReady === 'true');
      await page.locator('.town-walk-art').evaluate(image => {
        if (!image.complete || !image.naturalWidth) throw new Error('재선택 후 이동 프레임이 비었습니다.');
      });
      await button('마을 이동 취소').click();
      await stopped();
      result.checks.push('빠른 캐릭터 재선택과 지연 로딩');

      await page.getByLabel('이동 캐릭터', { exact: true }).selectOption('lina');
      await page.waitForFunction(() => document.querySelector('.town-walker')?.dataset.walkReady === 'true');
      await button('상점으로 이동').click();
      await page.locator('.town-walk-art[src*="lina-front-"]').waitFor();
      await page.locator('.town-map-shell').focus();
      await page.keyboard.press('Escape');
      await stopped();
      assert.match(await idle.getAttribute('src'), /\/art\/map-sprites-v4\/lina\.webp$/);
      result.checks.push('캐릭터 변경', '키보드 이동 취소');

      await page.locator('.camp-header .prominent-save').click();
      const afterSave = await page.evaluate(() => JSON.parse(localStorage.getItem('cheonsu_v01_save')));
      for (const field of ['party', 'gold', 'inventory', 'gearInventory', 'clearedStages', 'stageMastery']) {
        assert.deepEqual(afterSave[field], beforeSave[field], `${field}: 보행은 기존 진행도와 소지품을 변경하지 않습니다`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), '마을 화면은 화면 너비를 벗어나지 않습니다');
      assert.deepEqual(errors, []);
      result.checks.push('진행도 저장 보존', '화면 너비', '브라우저 오류 없음');
      result.passed = true;
      console.log(`PASS 마을 보행 ${viewport.width}×${viewport.height}: ${result.checks.length}개 검사`);
    } catch (error) {
      result.error = error.stack || String(error);
      result.errors = errors;
      await screenshot('failure').catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await fs.writeFile(new URL('result.json', output), JSON.stringify(report, null, 2));
  await browser?.close();
  if (development) await server.close();
  else await new Promise(resolve => server.httpServer.close(resolve));
}
