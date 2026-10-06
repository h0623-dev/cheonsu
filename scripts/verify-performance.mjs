import { saveBattle as clickBattleSave } from './qa-battle-tools.mjs';
import { qaBrowserOptions, confirmStageMission } from './qa-browser.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const label = process.env.PERF_LABEL || 'current';
const url = process.env.GAME_URL || 'http://127.0.0.1:5188';
let server;
let browser;
await fs.mkdir('tmp/performance-qa', { recursive: true });
try {
  if (!process.env.GAME_URL) {
    assert.equal(await fetch(url).then(() => true).catch(() => false), false, 'Preview port must be unused');
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], { windowsHide: true, stdio: 'ignore' });
    for (let i = 0; i < 80; i++) {
      if (await fetch(url).then(r => r.ok).catch(() => false)) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  browser = await chromium.launch(qaBrowserOptions());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    localStorage.setItem('cheonsu_auto_patch', 'false');
    window.__perf = { longTasks: [], frames: [] };
    new PerformanceObserver(list => window.__perf.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const results = [];
  async function measure(name, action) {
    const before = await cdp.send('Performance.getMetrics');
    const start = await page.evaluate(() => performance.now());
    await action();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const end = await page.evaluate(() => performance.now());
    const after = await cdp.send('Performance.getMetrics');
    const delta = Object.fromEntries(after.metrics.filter(m => ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].includes(m.name)).map(m => [m.name, Math.round((m.value - before.metrics.find(b => b.name === m.name).value) * 1000)]));
    const longTasks = await page.evaluate(({ start, end }) => window.__perf.longTasks.filter(t => t.start >= start && t.start <= end).map(t => Math.round(t.duration)), { start, end });
    const row = { name, elapsedMs: Math.round(end - start), ...delta, longTasks };
    results.push(row);
    console.log(JSON.stringify(row));
  }
  await page.goto(url);
  await page.getByRole('button', { name: '새 게임', exact: true }).waitFor();
  await measure('campaign', () => page.getByRole('button', { name: '새 게임', exact: true }).click());
  await measure('deployment', () => page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: /^1장\./ }) }).click());
  await measure('story', () => page.getByRole('button', { name: '전투 시작', exact: true }).click());
  await measure('battle-entry', async () => {
    await page.getByRole('button', { name: '바로 전투', exact: true }).click(); await confirmStageMission(page);
    await page.locator('.unit-visual-hero').waitFor();
    await page.waitForTimeout(1200);
  });
  await clickBattleSave(page);
  await page.waitForTimeout(1000);
  for (let i = 0; i < 3; i++) {
    await measure(`commands-${i}`, async () => {
      await page.locator('.cinematic-command-bar .cmd-attack').click();
      await page.locator('.battle-command-feedback').waitFor();
      await page.locator('.cinematic-command-bar .cmd-skill').click();
      await page.getByRole('button', { name: '스킬 선택 닫기' }).click();
    });
  }
  await page.evaluate(() => {
    window.__perf.frames = [];
    let previous = performance.now();
    const tick = now => { window.__perf.frames.push(now - previous); previous = now; window.__perf.raf = requestAnimationFrame(tick); };
    window.__perf.raf = requestAnimationFrame(tick);
  });
  await measure('map-pan', async () => {
    for (let i = 0; i < 4; i++) {
      await page.mouse.move(210, 360);
      await page.mouse.down();
      await page.mouse.move(210 + (i % 2 ? 100 : -100), 360 + (i % 2 ? 140 : -140), { steps: 24 });
      await page.mouse.up();
    }
  });
  const frames = await page.evaluate(() => { cancelAnimationFrame(window.__perf.raf); return window.__perf.frames; });
  const sorted = frames.slice(1).sort((a, b) => a - b);
  const dom = await page.evaluate(() => ({ nodes: document.querySelectorAll('*').length, tiles: document.querySelectorAll('.world-battlefield > .tile').length, animations: document.getAnimations().length, mapWidth: document.querySelector('.battle-map').offsetWidth, mapHeight: document.querySelector('.battle-map').offsetHeight }));
  const { profile } = await cdp.send('Profiler.stop');
  const totals = new Map();
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  profile.samples.forEach((id, i) => {
    const frame = nodes.get(id).callFrame;
    const name = `${frame.functionName || '(anonymous)'} ${frame.url.split('/').pop()}:${frame.lineNumber + 1}`;
    totals.set(name, (totals.get(name) || 0) + profile.timeDeltas[i]);
  });
  const summary = { label, url, cpuRate: 4, results, dom, frameMedianMs: sorted[Math.floor(sorted.length / 2)], frameP95Ms: sorted[Math.floor(sorted.length * .95)], framesOver50: sorted.filter(ms => ms > 50).length, topSamples: [...totals].sort((a, b) => b[1] - a[1]).slice(0, 35).map(([name, us]) => ({ name, ms: Math.round(us / 1000) })) };
  await fs.writeFile(`tmp/performance-qa/${label}.json`, JSON.stringify(summary, null, 2));
  await fs.writeFile(`tmp/performance-qa/${label}.cpuprofile`, JSON.stringify(profile));
  await page.screenshot({ path: `tmp/performance-qa/${label}.png` });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
  }
}
