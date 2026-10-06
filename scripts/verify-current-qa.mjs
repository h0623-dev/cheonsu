import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createServer, preview } from 'vite';
import { webBuildInfo } from './update-build-info.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({ options: { group: { type: 'string' }, scripts: { type: 'string' } } });
const production = [
  'verify-player-experience.mjs', 'verify-journey.cjs', 'verify-account.mjs', 'verify-armory.mjs',
  'verify-village.cjs', 'verify-village-details.cjs', 'verify-settings-progress.mjs',
  'verify-navigation-overlap.mjs', 'verify-audio-lifecycle.cjs', 'verify-growth.mjs',
  'verify-skill-labels.mjs', 'verify-discoveries.cjs', 'verify-map-pan.mjs',
  'verify-offline-production.mjs', 'verify-performance.mjs', 'verify-auto-update.mjs',
];
const development = ['verify-score-render.mjs', 'verify-orchestra.mjs', 'verify-music-transitions.mjs'];
const groups = { production, development, 'test-ui': ['npm:test:ui'] };
const group = values.group || 'production';
assert.ok(groups[group], `알 수 없는 QA 묶음: ${group}`);
const selected = values.scripts?.split(',') || groups[group];
assert.ok(selected.length && selected.every(name => groups[group].includes(name)), '현재 유효 검사만 선택합니다');
const output = path.resolve(process.env.CHEONSU_CURRENT_QA_OUT || path.join(root, 'tmp/current-qa'));
await fs.mkdir(output, { recursive: true });
let server;
const results = [];
const report = { passed: false, group, production: group === 'production', actualAndroidDevice: false, googleProviderConfigured: false, results };
try {
  report.build = webBuildInfo(root);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'dist/ota-build.json'), 'utf8')), report.build, '최종 소스와 같은 생산 빌드가 준비되어 있습니다');
  server = group === 'production'
    ? await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } })
    : await createServer({ root, server: { host: '127.0.0.1', port: 0, open: false } });
  if (group !== 'production') await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const name of selected) {
    const started = Date.now();
    const log = path.join(output, `${group}-${name.replaceAll(':', '-')}.log`);
    const handle = await fs.open(log, 'w');
    let child;
    try {
      const npm = name === 'npm:test:ui';
      child = spawn(npm ? process.env.npm_execpath ? process.execPath : 'npm' : process.execPath,
        npm ? process.env.npm_execpath ? [process.env.npm_execpath, 'run', 'test:ui'] : ['run', 'test:ui'] : [path.join(root, 'scripts', name)],
        { cwd: root, windowsHide: true, stdio: ['ignore', handle.fd, handle.fd], env: { ...process.env, GAME_URL: base, ACTUAL_GAME_URL: base, FIXTURE_URL: base } });
      const timeout = setTimeout(() => child.kill('SIGTERM'), 20 * 60 * 1000);
      let code, signal;
      try { [code, signal] = await new Promise((resolve, reject) => { child.once('exit', (value, reason) => resolve([value, reason])); child.once('error', reject); }); }
      finally { clearTimeout(timeout); }
      results.push({ script: name, code, signal, elapsedMs: Date.now() - started, log });
      await fs.writeFile(path.join(output, `${group}.json`), JSON.stringify(report, null, 2));
      console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${name} ${Math.round((Date.now() - started) / 1000)}초`);
      if (code !== 0) console.error((await fs.readFile(log, 'utf8')).slice(-5000));
    } finally { if (child?.exitCode === null && child?.signalCode === null) child.kill('SIGTERM'); await handle.close(); }
  }
  assert.deepEqual(webBuildInfo(root), report.build, '검사 중 게임 소스·에셋이 바뀌지 않습니다');
  report.passed = results.length === selected.length && results.every(result => result.code === 0);
  if (!report.passed) process.exitCode = 1;
} catch (error) { report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally { await server?.close(); await fs.writeFile(path.join(output, `${group}.json`), JSON.stringify(report, null, 2)); }
