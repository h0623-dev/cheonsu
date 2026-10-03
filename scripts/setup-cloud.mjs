import { spawnSync } from 'node:child_process';
import { root } from './setup.mjs';

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24+ is required.');
for (const [command, args] of [
  ['npm', ['ci']],
  ['npm', ['run', 'setup']],
  ['npx', ['playwright', 'install', '--with-deps', 'chromium']],
]) {
  const child = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${command} failed (${child.status}).`);
}
console.log('Cloud web workspace ready. Android signing runs only in GitHub Actions.');
