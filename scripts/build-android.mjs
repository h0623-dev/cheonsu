import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { root, checkSetup } from './setup.mjs';

try {
  const { sdk, java } = checkSetup({ android: true });
  const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, PATH: `${path.join(java, 'bin')}${path.delimiter}${process.env.PATH || process.env.Path || ''}` };
  const run = (command, args, cwd = root) => {
    const child = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`${command} failed (${child.status})`);
  };
  run('npm', ['run', 'build']);
  run('npx', ['cap', 'sync', 'android']);
  if (process.platform !== 'win32') fs.chmodSync(path.join(root, 'android/gradlew'), 0o755);
  run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug'], path.join(root, 'android'));
  console.log('APK: android/app/build/outputs/apk/debug/app-debug.apk');
} catch (error) { console.error(error.message); process.exitCode = 1; }
