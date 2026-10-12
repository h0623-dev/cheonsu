import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { qaBrowserOptions } from './qa-browser.mjs';
import { ensureBattleInformationOpen, saveBattle, waitForBattleReady } from './qa-battle-tools.mjs';
import { startDeploymentBattle, waitForDeployment } from './qa-deployment-flow.mjs';
import { BATTLEFIELD_PLANS } from '../src/data/battlefieldPlans.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.env.CHEONSU_MAP_QA_OUT || path.join(root, 'tmp/map-atmosphere-qa'));
const source = JSON.parse(await fs.readFile(new URL('./fixtures/monster-save-1.99.156.json', import.meta.url), 'utf8'));
const campaign = { ...structuredClone(source.shared), ...structuredClone(source.cases[0].save), screen: 'campaign',
  clearedStages: Array.from({ length: 49 }, (_, i) => i + 1), deployedIds: source.shared.party.slice(0, 15).map(unit => unit.id) };
const saveKey = 'cheonsu_v01_save';
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const representativeIds = [1, 2, 7, 31, 50];
const requestedStageIds = process.env.CHEONSU_MAP_QA_STAGE_IDS?.split(',').map(value => Number(value.trim()));
if (requestedStageIds) assert.ok(requestedStageIds.length > 0 && requestedStageIds.every(id => Number.isInteger(id) && id >= 1 && id <= 50),
  'CHEONSU_MAP_QA_STAGE_IDS에는 1~50장의 번호를 쉼표로 구분해 입력해야 합니다');
const scopedPlans = requestedStageIds ? BATTLEFIELD_PLANS.filter(plan => requestedStageIds.includes(plan.id)) : BATTLEFIELD_PLANS;
const scopedRepresentativeIds = representativeIds.filter(id => scopedPlans.some(plan => plan.id === id));
// 지하·실내 장면은 같은 생태의 야외 지역과 별개로 구름·풀을 표시하지 않습니다.
const coveredStageIds = new Set([12, 16, 18, 21, 22, 25, 26, 30, 34, 41, 42, 43, 44, 45]);
const report = { passed: false, source: process.env.GAME_URL ? '외부 제공 실행 서버' : '프로덕션 빌드',
  requestedStageIds: scopedPlans.map(plan => plan.id), fullCampaign: !requestedStageIds,
  stages: [], interactionChecks: [], settingChecks: [], errors: [] };
let server, browser;
await fs.mkdir(output, { recursive: true });

async function frames(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function mapGeometry(page, plan, label, { effects = true } = {}) {
  const actual = await page.evaluate(() => {
    const shell = document.querySelector('.battle-map-scroll-shell');
    const board = shell?.querySelector('.world-battlefield');
    if (!board) throw new Error('실제 전장 지도가 없습니다.');
    const bounds = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const tiles = [...board.querySelectorAll(':scope > [data-map-x][data-map-y]')];
    const first = bounds(tiles[0]);
    const gridErrors = [];
    for (const tile of tiles) {
      const tileBounds = bounds(tile), ground = tile.querySelector(':scope > .world-ground');
      const x = Number(tile.dataset.mapX), y = Number(tile.dataset.mapY);
      if (Math.abs(tileBounds.left - first.left - first.width * x) > 1 || Math.abs(tileBounds.top - first.top - first.height * y) > 1)
        gridErrors.push({ x, y, error: '타일 좌표 불일치' });
      if (!ground) gridErrors.push({ x, y, error: '지형 누락' });
      else {
        const r = bounds(ground);
        if (Math.abs(r.left - tileBounds.left) > 1 || Math.abs(r.top - tileBounds.top) > 1 ||
            Math.abs(r.width - tileBounds.width) > 1 || Math.abs(r.height - tileBounds.height) > 1)
          gridErrors.push({ x, y, error: '지형과 칸 경계 불일치' });
      }
    }
    const atmosphere = board.querySelector(':scope > .battle-map-atmosphere');
    const grass = [...board.querySelectorAll('.battle-map-grass')];
    const shellBounds = bounds(shell), boardBounds = bounds(board), shellStyle = getComputedStyle(shell);
    const paddingLeft = parseFloat(shellStyle.paddingLeft) || 0, paddingRight = parseFloat(shellStyle.paddingRight) || 0;
    const innerWidth = shell.clientWidth - paddingLeft - paddingRight;
    return {
      boardCount: shell.querySelectorAll('.world-battlefield').length,
      shellBackground: getComputedStyle(shell).backgroundImage,
      shellBefore: getComputedStyle(shell, '::before').display,
      shellAfter: getComputedStyle(shell, '::after').display,
      tileCount: tiles.length, gridErrors, first, board: boardBounds,
      centeredError: boardBounds.width < innerWidth - 2 && shell.scrollLeft < 1
        ? Math.abs(boardBounds.left - (shellBounds.left + shell.clientLeft + paddingLeft + (innerWidth - boardBounds.width) / 2)) : null,
      cols: Number(board.style.getPropertyValue('--map-cols')), rows: Number(board.style.getPropertyValue('--map-rows')),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      atmosphere: atmosphere ? { ...bounds(atmosphere), biome: atmosphere.dataset.biome, quality: atmosphere.dataset.quality,
        pointerEvents: getComputedStyle(atmosphere).pointerEvents, ariaHidden: atmosphere.getAttribute('aria-hidden') } : null,
      grass: grass.map(element => {
        const x = Number(element.dataset.mapGrassX), y = Number(element.dataset.mapGrassY);
        const tile = board.querySelector(`[data-map-x="${x}"][data-map-y="${y}"]`);
        return { x, y, onVegetation: !!tile && (tile.classList.contains('plain') || tile.classList.contains('forest')) };
      }),
      cloudCount: board.querySelectorAll('.battle-map-cloud-shadow').length,
      animated: atmosphere ? atmosphere.getAnimations({ subtree: true }).map(a => ({ state: a.playState, time: a.currentTime })) : [],
      missingImages: [...board.querySelectorAll('img')].filter(img => img.complete && img.naturalWidth === 0).map(img => img.src),
    };
  });
  assert.equal(actual.boardCount, 1, `${label}: 단일 전장입니다`);
  assert.equal(actual.shellBackground, 'none', `${label}: 스크롤 셸에 두 번째 지형 사진을 중복 표시하지 않습니다`);
  assert.equal(actual.shellBefore, 'none');
  assert.equal(actual.shellAfter, 'none');
  assert.equal(actual.cols, plan.width);
  assert.equal(actual.rows, plan.height);
  assert.equal(actual.tileCount, plan.width * plan.height);
  assert.deepEqual(actual.gridErrors, [], `${label}: 이동·확대 중에도 모든 지형과 칸이 같은 좌표계를 사용합니다`);
  assert.equal(actual.overflow, false, `${label}: 페이지 가로 넘침이 없습니다`);
  if (actual.centeredError !== null) assert.ok(actual.centeredError < 2, `${label}: 작은 지도는 수평 가운데에 놓입니다`);
  assert.deepEqual(actual.missingImages, [], `${label}: 지형·캐릭터 이미지 로드 실패가 없습니다`);
  const vegetation = ['frontier', 'forest'].includes(plan.biome);
  const outdoor = !coveredStageIds.has(plan.id) && (vegetation || ['snow', 'coast'].includes(plan.biome));
  if (effects && outdoor) {
    assert.ok(actual.atmosphere, `${label}: 야외 분위기 효과가 있습니다`);
    assert.equal(actual.atmosphere.biome, plan.biome);
    assert.equal(actual.atmosphere.pointerEvents, 'none', '효과는 지도·캐릭터 터치를 가로채지 않습니다');
    assert.equal(actual.atmosphere.ariaHidden, 'true');
    for (const key of ['left', 'top', 'width', 'height'])
      assert.ok(Math.abs(actual.atmosphere[key] - actual.board[key]) < 2, `${label}: 분위기 층의 ${key}가 전장과 일치합니다`);
    assert.ok(actual.cloudCount >= 1 && actual.cloudCount <= (actual.atmosphere.quality === 'low' ? 1 : 2));
    assert.ok(actual.grass.length <= (actual.atmosphere.quality === 'low' ? 12 : 24));
    if (vegetation) assert.ok(actual.grass.length > 0, `${label}: 초목 지형의 풀 효과가 있습니다`);
    else assert.equal(actual.grass.length, 0, '눈·해안 지형에 풀을 임의로 추가하지 않습니다');
    assert.ok(actual.grass.every(grass => grass.onVegetation), '풀은 원래 초목 칸 위에서만 움직입니다');
    assert.ok(actual.animated.some(animation => animation.state === 'running'), '정상 설정에서 실제 CSS 애니메이션이 재생됩니다');
  } else {
    assert.equal(actual.atmosphere, null, `${label}: 실내·효과 끄기·동작 감소 시 야외 분위기 층을 만들지 않습니다`);
  }
  return { stageId: plan.id, label, cols: actual.cols, rows: actual.rows, tileCount: actual.tileCount,
    singleTerrain: true, aligned: true, grassCount: actual.grass.length, cloudCount: actual.cloudCount,
    quality: actual.atmosphere?.quality || null };
}

async function setSaveAndLoad(page, data) {
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: saveKey, data });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.web-start-button') ||
    [...document.querySelectorAll('button')].some(button => button.getAttribute('aria-label') === '이어하기' || button.textContent.includes('이어하기')));
  const webStart = page.locator('.web-start-button');
  if (await webStart.count()) await webStart.click();
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
}

async function openStage(page, stageId, confirm = false) {
  await setSaveAndLoad(page, campaign);
  await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${stageId}장[.]`) }) }).click();
  await waitForDeployment(page, { confirmMission: false });
  await page.locator('.stage-mission-dialog[open]').waitFor();
  if (confirm) {
    await page.locator('.stage-mission-dialog[open]').getByRole('button', { name: '미션 확인', exact: true }).click();
    await waitForDeployment(page);
  }
  await frames(page);
}

async function recordSavedBattle(page) {
  await saveBattle(page);
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
}

async function cornerChecks(page, plan, label) {
  for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0, 1], [.5, .5]]) {
    await page.locator('.battle-map-scroll-shell').evaluate((shell, { x, y }) => {
      shell.scrollTo({ left: (shell.scrollWidth - shell.clientWidth) * x,
        top: (shell.scrollHeight - shell.clientHeight) * y, behavior: 'instant' });
    }, { x, y });
    await frames(page);
    await mapGeometry(page, plan, `${label} 모서리 ${x}/${y}`);
  }
}

async function dragMap(page, context, touch, unitId = null) {
  const shell = page.locator('.battle-map-scroll-shell');
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await shell.evaluate(el => el.scrollTo({ left: Math.max(0, (el.scrollWidth - el.clientWidth) / 2),
    top: Math.max(0, (el.scrollHeight - el.clientHeight) / 2), behavior: 'instant' }));
  if (unitId) await shell.evaluate((el, id) => {
    const unit = el.querySelector(`.unit[data-unit-id="${id}"]`), r = unit.getBoundingClientRect(), s = el.getBoundingClientRect();
    const hud = document.querySelector('.selected-unit-status-hud')?.getBoundingClientRect();
    const targetY = Math.max(s.top + 75, Math.min(s.top + el.clientHeight / 2, (hud?.top || innerHeight) - 40));
    el.scrollTo({ left: el.scrollLeft + r.left + r.width / 2 - s.left - el.clientWidth / 2,
      top: el.scrollTop + r.top + r.height / 2 - targetY, behavior: 'instant' });
  }, unitId);
  // Native touch scrolling reads the compositor's last committed scroll offset.
  await frames(page);
  await page.waitForTimeout(120);
  const point = await shell.evaluate((el, id) => {
    const r = el.getBoundingClientRect();
    const hud = document.querySelector('.selected-unit-status-hud')?.getBoundingClientRect();
    const bottom = Math.min(innerHeight - 100, r.bottom - 20, (hud?.top || innerHeight) - 20);
    const top = Math.max(80, r.top + 80);
    const unitBounds = id ? el.querySelector(`.unit[data-unit-id="${id}"]`).getBoundingClientRect() : null;
    const axis = el.scrollHeight - el.clientHeight >= 80 ? 'y' : 'x';
    const before = axis === 'y' ? el.scrollTop : el.scrollLeft;
    const maximum = axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    const direction = maximum - before >= 50 ? -1 : 1;
    const x = unitBounds ? unitBounds.left + unitBounds.width / 2 : Math.max(40, Math.min(innerWidth - 40, r.left + r.width * .45));
    const y = unitBounds ? unitBounds.top + unitBounds.height / 2 : (top + bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, direction, axis, onMap: !!hit?.closest('.world-battlefield'), hitUnit: hit?.closest('[data-unit-id]')?.dataset.unitId || null,
      distance: Math.min(110, axis === 'y' ? (direction < 0 ? y - 15 : innerHeight - y - 30) : (direction < 0 ? x - 15 : innerWidth - x - 15)), before };
  }, unitId);
  assert.equal(point.onMap, true, '터치·드래그 시작점이 상태창이 아닌 실제 전장입니다');
  if (unitId) assert.equal(point.hitUnit, unitId, '유닛 드래그를 실제 해당 캐릭터에서 시작합니다');
  assert.ok(point.distance >= 65, '짧은 가로 화면에서도 브라우저 터치 시작 여유를 넘는 실제 제스처를 입력합니다');
  await page.evaluate(() => {
    window.__mapGestureStart = null;
    document.addEventListener('pointerdown', event => {
      window.__mapGestureStart = { unit: event.target.closest('[data-unit-id]')?.dataset.unitId || null,
        scrollTop: document.querySelector('.battle-map-scroll-shell').scrollTop,
        scrollLeft: document.querySelector('.battle-map-scroll-shell').scrollLeft };
    }, { capture: true, once: true });
  });
  if (touch) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
    for (let step = 1; step <= 12; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: point.x + (point.axis === 'x' ? point.direction * point.distance * step / 12 : 0),
        y: point.y + (point.axis === 'y' ? point.direction * point.distance * step / 12 : 0),
      }] });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + (point.axis === 'x' ? point.direction * point.distance : 25),
      point.y + (point.axis === 'y' ? point.direction * point.distance : 0), { steps: 15 });
    await page.mouse.up();
  }
  await page.waitForTimeout(350);
  const after = await shell.evaluate((el, axis) => axis === 'y' ? el.scrollTop : el.scrollLeft, point.axis);
  const start = await page.evaluate(() => window.__mapGestureStart);
  assert.ok(start && Math.abs((point.axis === 'y' ? start.scrollTop : start.scrollLeft) - point.before) < 2, '스크롤 준비가 끝난 위치에서 실제 입력을 시작합니다');
  if (unitId) assert.equal(start.unit, unitId, '실제 pointerdown 이벤트가 해당 유닛에 도달합니다');
  assert.ok((after - point.before) * -point.direction > 15, `${touch ? '실제 터치' : '마우스'} ${unitId ? '유닛 위' : '지형'} 드래그가 전장을 이동합니다 (${point.before} → ${after}, ${JSON.stringify(point)})`);
  assert.equal(await page.evaluate(() => window.getSelection()?.isCollapsed ?? true), true, '지도 드래그로 브라우저 텍스트·이미지 선택을 만들지 않습니다');
  return { input: touch ? '브라우저 실제 터치' : '마우스', origin: unitId || '지형', axis: point.axis, before: point.before, after };
}

async function interact(page, context, viewport, plan) {
  await startDeploymentBattle(page);
  const before = await recordSavedBattle(page);
  await cornerChecks(page, plan, '전투');
  const touch = viewport.width !== 1280;
  const drag = await dragMap(page, context, touch);
  const unitDrag = await dragMap(page, context, touch, 'bram');
  await mapGeometry(page, plan, '드래그 뒤');
  await ensureBattleInformationOpen(page);
  for (const name of ['전장 확대', '전장 축소', '전장 자동 맞춤']) {
    const control = page.getByRole('button', { name, exact: true });
    if (await control.isEnabled()) await control.click();
    await page.waitForTimeout(160);
    await mapGeometry(page, plan, name);
  }
  await page.getByRole('button', { name: '정보 숨김', exact: true }).click();
  await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await page.waitForTimeout(180);
  await mapGeometry(page, plan, '화면 회전');
  await page.setViewportSize(viewport);
  await page.waitForTimeout(180);
  await mapGeometry(page, plan, '화면 원복');
  const after = await recordSavedBattle(page);
  for (const field of ['units', 'party', 'gold', 'inventory', 'clearedStages', 'exploration', 'turn', 'round'])
    assert.deepEqual(after[field], before[field], `${field}: 지도 이동·줌·회전으로 진행 데이터를 바꾸지 않습니다`);
  assert.equal(after.selectedUnit, before.selectedUnit, '유닛 위 지도 드래그가 캐릭터 선택을 바꾸지 않습니다');
  await page.locator('.world-battlefield .unit[data-unit-id="bram"]').click();
  assert.equal((await recordSavedBattle(page)).selectedUnit, 'bram', '드래그 방지가 기존 아군 탭·클릭 선택을 막지 않습니다');
  await page.screenshot({ path: path.join(output, `stage-${plan.id}-${viewport.width}x${viewport.height}.png`) });
  report.interactionChecks.push({ viewport, stageId: plan.id, drag, unitDrag, unitTap: true, corners: 5, zoom: true, rotation: true, savePreserved: true });
  return after;
}

async function settingsChecks(page, plan, battle) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.battle-map-atmosphere').waitFor({ state: 'detached' });
  await mapGeometry(page, plan, '동작 감소', { effects: false });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.battle-map-atmosphere').waitFor();
  const first = await page.locator('.battle-map-atmosphere').evaluate(el => el.getAnimations({ subtree: true }).map(a => a.currentTime));
  await page.waitForTimeout(180);
  const second = await page.locator('.battle-map-atmosphere').evaluate(el => el.getAnimations({ subtree: true }).map(a => a.currentTime));
  assert.ok(second.some((time, i) => time > first[i] + 50), '풀·구름 애니메이션의 실제 시간이 진행됩니다');
  await page.evaluate(() => {
    window.__mapVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.querySelector('.battle-map-atmosphere')?.dataset.paused === 'true');
  const paused = await page.locator('.battle-map-atmosphere').evaluate(el => el.getAnimations({ subtree: true }).every(a => a.playState === 'paused'));
  assert.equal(paused, true, '브라우저 숨김 이벤트에서 모든 분위기 애니메이션을 멈춥니다');
  await page.evaluate(() => {
    if (window.__mapVisibilityDescriptor) Object.defineProperty(document, 'visibilityState', window.__mapVisibilityDescriptor);
    else delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.querySelector('.battle-map-atmosphere')?.dataset.paused === 'false');
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('cheonsu_settings_v1'));
    localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ ...settings, effectsOn: false }));
  });
  await setSaveAndLoad(page, battle);
  await waitForBattleReady(page);
  await mapGeometry(page, plan, '효과 끄기', { effects: false });
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('cheonsu_settings_v1'));
    localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ ...settings, effectsOn: true }));
  });
  report.settingChecks.push({ reducedMotion: true, effectsOff: true, animationProgress: true, simulatedVisibilityPause: true });
}

try {
  let base = process.env.GAME_URL;
  if (!base) {
    server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } });
    base = `http://127.0.0.1:${server.httpServer.address().port}`;
  }
  browser = await chromium.launch(qaBrowserOptions());
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width !== 1280, isMobile: viewport.width !== 1280,
      serviceWorkers: 'block', reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    page.on('pageerror', error => report.errors.push({ viewport, message: error.message }));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(base)) report.errors.push({ viewport, message: `${response.status()} ${response.url()}` }); });
    await page.addInitScript(() => {
      localStorage.setItem('cheonsu_auto_patch', 'false');
      if (!localStorage.getItem('cheonsu_settings_v1')) localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false,
        cutsceneMode: 'off', effectsOn: true, battleSpeed: 'turbo', battleSpeedRevision: 1 }));
    });
    try {
      await page.goto(base);
      const plans = viewport.width === 390 ? scopedPlans : scopedPlans.filter(plan => scopedRepresentativeIds.includes(plan.id));
      for (const plan of plans) {
        await openStage(page, plan.id, representativeIds.includes(plan.id));
        report.stages.push({ viewport, ...await mapGeometry(page, plan, '실제 배치 전장') });
        if (representativeIds.includes(plan.id)) {
          await cornerChecks(page, plan, '배치');
          const battle = await interact(page, context, viewport, plan);
          if (plan.id === 1) await settingsChecks(page, plan, battle);
        }
        assert.deepEqual(report.errors, [], '브라우저 오류·네트워크 실패가 없습니다');
        console.log(`PASS 지도 ${viewport.width}x${viewport.height} ${plan.id}장: 단일 지형, ${plan.width}x${plan.height}칸 정합, ${plan.biome} 분위기${representativeIds.includes(plan.id) ? ', 이동·확대·회전·저장 보존' : ''}`);
      }
    } catch (error) {
      await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}-failure.png`) }).catch(() => {});
      throw error;
    } finally {
      await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
      await context.close();
    }
  }
  assert.equal(new Set(report.stages.map(stage => stage.stageId)).size, scopedPlans.length);
  assert.equal(report.interactionChecks.length, scopedRepresentativeIds.length * viewports.length);
  assert.equal(report.settingChecks.length, scopedRepresentativeIds.includes(1) ? viewports.length : 0);
  report.passed = true;
  console.log(`PASS 전장 정합성: ${requestedStageIds ? '선택' : '전체'} ${scopedPlans.length}장 배치 진입, 화면 3종, 실제 전투 ${report.interactionChecks.length}회, 효과 설정 ${report.settingChecks.length}회, 오류 0`);
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await server?.close();
}
