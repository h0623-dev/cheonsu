import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function findAndroidEnvironment() {
  const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android/Sdk'),
    path.join(os.homedir(), 'Library/Android/sdk'), path.join(os.homedir(), 'Android/Sdk')]
    .find(value => value && fs.existsSync(path.join(value, 'platforms/android-35')));
  const java = [process.env.JAVA_HOME,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Android/Android Studio/jbr'),
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home', '/opt/android-studio/jbr']
    .find(value => value && fs.existsSync(path.join(value, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')));
  return { sdk, java };
}
export function checkSetup({ android = false } = {}) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24) throw new Error('Use Node.js 24 or newer. See .nvmrc.');
  for (const asset of ['public/art/world-v2/manifest.json', 'public/art/combat-v1/manifest.json', 'public/art/combat-v2/manifest.json']) {
    if (!fs.existsSync(path.join(root, asset))) throw new Error(`Missing bundled asset: ${asset}`);
  }
  const environment = findAndroidEnvironment();
  if (android && (!environment.sdk || !environment.java)) throw new Error('Android build requires SDK Platform 35 and JAVA_HOME (JDK 21+). See docs/DEVELOPMENT_HANDOFF.md.');
  if (environment.sdk) {
    // Machine-local SDK paths are intentionally excluded from source bundles and Git.
    fs.writeFileSync(path.join(root, 'android/local.properties'), `sdk.dir=${environment.sdk.replaceAll('\\', '/')}\n`);
  }
  console.log(`Node ${process.versions.node}; project assets ready.`);
  console.log(environment.sdk && environment.java ? 'Android SDK and Java found.' : 'Web development ready. Android SDK/JDK setup is optional until building APKs.');
  return environment;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { checkSetup(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
