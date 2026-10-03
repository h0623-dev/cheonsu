import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const group = process.argv[2] || 'interface';
const groups = {
  production: ['verify-player-experience.mjs', 'verify-character-codex.mjs', 'verify-account.mjs', 'verify-audio-lifecycle.cjs'],
  world: ['verify-chapter-maps.mjs', 'verify-story-art.mjs', 'verify-story-production.mjs', 'verify-discoveries.cjs'],
  interface: ['verify-player-experience.mjs', 'verify-character-codex.mjs', 'verify-account.mjs', 'verify-armory.mjs', 'verify-village-details.cjs', 'verify-settings-progress.mjs', 'verify-navigation-overlap.mjs', 'verify-audio-lifecycle.cjs'],
  combat: ['verify-duel-basics.mjs', 'verify-skill-presentation.mjs', 'verify-growth.mjs', ['verify-battle-controls.cjs', '--case', 'strict-range-execution,area-range,attack-feedback,primary-skill,secondary-guard,lina-secondary-execute', '--viewport', '390']],
};
if (!groups[group]) throw new Error('Unknown QA group');
const dir = 'tmp/qa153';
await fs.mkdir(dir, { recursive: true });
const results = [];
for (const entry of groups[group]) {
  const [script, ...args] = Array.isArray(entry) ? entry : [entry];
  const started = Date.now();
  let output = '';
  const child = spawn(process.execPath, [`scripts/${script}`, ...args], {
    windowsHide: true, env: { ...process.env, GAME_URL: process.env.GAME_URL || 'http://127.0.0.1:5178', ACTUAL_GAME_URL: process.env.GAME_URL || 'http://127.0.0.1:5178' },
  });
  child.stdout.on('data', value => { output += value; });
  child.stderr.on('data', value => { output += value; });
  const timeout = setTimeout(() => child.kill(), 1200000);
  const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  clearTimeout(timeout);
  await fs.writeFile(`${dir}/${script}.log`, output);
  results.push({ script, code, elapsedMs: Date.now() - started, log: `${dir}/${script}.log` });
  await fs.writeFile(`${dir}/${group}.json`, JSON.stringify(results, null, 2));
  console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${script} (${Math.round((Date.now() - started) / 1000)}s)`);
  if (code !== 0) console.log(output.slice(-3500));
}
process.exitCode = results.every(result => result.code === 0) ? 0 : 1;
