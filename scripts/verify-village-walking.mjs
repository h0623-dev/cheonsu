import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { qaBrowserOptions } from './qa-browser.mjs';
import { createServer, preview } from 'vite';
import { VILLAGE_WALK_IDS, getVillageWalkFrames } from '../src/data/villageWalk.js';
import { getPaintedVisualProfile } from '../src/data/unitVisuals.js';
import { createExpansionRecruit } from '../src/engine/promotionEngine.js';
import { NEW_ALLY_TEMPLATES } from '../src/data/advancedClasses.js';

const output = new URL('../tmp/village-walking-qa/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const providedUrl = process.env.ACTUAL_GAME_URL;
const development = !providedUrl && process.env.CHEONSU_QA_DEV === '1';
const server = providedUrl ? null : development
  ? await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  : await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
if (development) await server.listen();
const base = providedUrl || `http://127.0.0.1:${server.httpServer.address().port}`;
const legacy = JSON.parse(await fs.readFile(new URL('./fixtures/monster-save-1.99.156.json', import.meta.url), 'utf8'));
const fullParty = [...structuredClone(legacy.shared.party), ...Object.keys(NEW_ALLY_TEMPLATES)
  .map(id => createExpansionRecruit(id, legacy.shared.party))];
const preserved = ['party', 'gold', 'inventory', 'gearInventory', 'gearEnhance', 'clearedStages', 'stageMastery',
  'exploration', 'stageNotes', 'claimedAchievements', 'claimedMasteryRewards', 'snapshotGallery'];
const report = { source: development ? 'development' : 'production', productionUrl: base,
  expectedCompanions: 21, expectedFrames: 84, authoredFrames: [], results: [] };
assert.equal(VILLAGE_WALK_IDS.length, 21);
assert.deepEqual(new Set(fullParty.map(unit => unit.id)), new Set(VILLAGE_WALK_IDS));
let browser;
try {
  browser = await chromium.launch(qaBrowserOptions());
  // Read the assets served by this build, so stale dist files cannot pass on source metadata alone.
  const assets = await browser.newContext({ serviceWorkers: 'block' });
  try {
    for (const id of VILLAGE_WALK_IDS) {
      const frames = [];
      for (const src of getVillageWalkFrames(id)) {
        const response = await assets.request.get(new URL(src, base).href);
        assert.equal(response.status(), 200, `${id}: production walking asset ${src}`);
        const bytes = await response.body();
        frames.push({ src, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
      assert.equal(new Set(frames.map(frame => frame.sha256)).size, 4, `${id}: four different authored production poses`);
      report.authoredFrames.push({ id, frames });
    }
    assert.equal(new Set(report.authoredFrames.flatMap(unit => unit.frames.map(frame => frame.sha256))).size, 84,
      '21 companions use 84 separate production walking poses');
  } finally { await assets.close(); }
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && response.url().startsWith(base) && response.url().includes('/art/')) errors.push(`${response.status()} ${response.url()}`);
    });
    const result = { viewport, passed: false, checks: [], companions: [] };
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
          idleVisible: actor?.querySelector('.town-idle-art') ? getComputedStyle(actor.querySelector('.town-idle-art')).visibility === 'visible' : false,
          transform: art ? getComputedStyle(art).transform : null });
        if (!actor?.classList.contains('is-walking') || samples.length > 500) { clearInterval(timer); resolve(samples); }
      }, 35);
    }));
    try {
      await page.addInitScript(() => {
        localStorage.setItem('cheonsu_auto_patch', 'false');
        localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false }));
      });
      await page.goto(base);
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

      // Seed only an isolated saved roster, then enter and operate the published game through its UI.
      await page.evaluate(({ party }) => {
        const save = JSON.parse(localStorage.getItem('cheonsu_v01_save'));
        save.party = party;
        save.screen = 'camp';
        save.clearedStages = Array.from({ length: 49 }, (_, index) => index + 1);
        localStorage.setItem('cheonsu_v01_save', JSON.stringify(save));
      }, { party: fullParty });
      await page.reload();
      await button('이어하기').click();
      await page.locator('.town-hub').waitFor();
      const selector = page.getByLabel('이동 캐릭터', { exact: true });
      assert.deepEqual(new Set(await selector.locator('option').evaluateAll(options => options.map(option => option.value))),
        new Set(VILLAGE_WALK_IDS), 'the actual town selector exposes the original 17 and all four new companions');
      await page.locator('.camp-header .prominent-save').click();
      const allPartyBaseline = await page.evaluate(() => JSON.parse(localStorage.getItem('cheonsu_v01_save')));
      for (const id of VILLAGE_WALK_IDS) {
        await selector.selectOption(id);
        await page.waitForFunction(() => document.querySelector('.town-walker')?.dataset.walkReady === 'true');
        await idle.evaluate(image => image.decode());
        const expectedIdle = getPaintedVisualProfile(id)?.map;
        assert.ok(expectedIdle, `${id}: current idle artwork is registered`);
        assert.equal(await idle.getAttribute('src'), expectedIdle, `${id}: selection keeps its current idle artwork`);
        const checkpoint = await page.evaluate(() => localStorage.getItem('cheonsu_v01_save'));
        await button('상점으로 이동').click();
        const normalTrace = await traceWalk();
        await facility.waitFor();
        await stopped();
        assert.deepEqual(await coordinates(), [8, 5]);
        assert.equal(await idle.getAttribute('src'), expectedIdle, `${id}: arrival returns to current idle artwork`);
        const observed = new Set(normalTrace.map(sample => sample.src).filter(Boolean));
        for (const frame of getVillageWalkFrames(id)) assert.ok(observed.has(frame), `${id}: actual movement displays ${frame}`);
        assert.deepEqual(observed, new Set(getVillageWalkFrames(id)), `${id}: movement uses only its four authored poses`);
        assert.ok(normalTrace.every(sample => sample.loaded), `${id}: every walking frame is decoded during travel`);
        assert.ok(normalTrace.filter(sample => sample.src).every(sample => !sample.idleVisible),
          `${id}: active walking poses replace the visible idle body during travel`);
        assert.ok(normalTrace.some(sample => sample.direction === 'left' && sample.transform === 'matrix(-1, 0, 0, 1, 0, 0)'),
          `${id}: left travel flips the authored walking pose`);
        await facility.getByRole('button', { name: '시설 닫기', exact: true }).click();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await button('장비점으로 이동').click();
        const reducedTrace = await traceWalk();
        await facility.waitFor();
        await stopped();
        assert.deepEqual(await coordinates(), [8, 11]);
        assert.ok(reducedTrace.some(sample => sample.x !== '8' || sample.y !== '5'), `${id}: reduced motion still reaches the facility`);
        assert.ok(reducedTrace.every(sample => sample.src === null && sample.idleVisible && sample.loaded),
          `${id}: reduced motion shows decoded idle artwork throughout actual movement`);
        assert.equal(await idle.getAttribute('src'), expectedIdle, `${id}: reduced-motion arrival preserves idle artwork`);
        await facility.getByRole('button', { name: '시설 닫기', exact: true }).click();
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        assert.equal(await page.evaluate(() => localStorage.getItem('cheonsu_v01_save')), checkpoint,
          `${id}: selection and both movement modes leave the saved progress unchanged`);
        await page.locator('.camp-header .prominent-save').click();
        const after = await page.evaluate(() => JSON.parse(localStorage.getItem('cheonsu_v01_save')));
        for (const field of preserved) assert.deepEqual(after[field], allPartyBaseline[field], `${id}: saving a walk preserves ${field}`);
        result.companions.push({ id, idle: expectedIdle, observedFrames: [...observed], normalSamples: normalTrace.length,
          reducedSamples: reducedTrace.length, reducedMotion: true, savePreserved: true });
        if (['mare', 'harin', 'edan', 'sylvan'].includes(id)) await screenshot(`companion-${id}-idle`);
        console.log(`PASS 마을 동료 ${id} ${viewport.width}×${viewport.height}: 실제 4자세, 대기 복귀, 동작 줄이기, 저장 보존`);
      }
      assert.equal(result.companions.length, 21);
      assert.deepEqual(errors, []);
      result.checks.push('21명 전체 실제 선택과 이동', '84개 배포 자세 SHA 고유', '21명 전체 동작 줄이기', '21명 전체 저장 보존');
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
  else if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
