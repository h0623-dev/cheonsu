import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function hashInputs(root, entries, transform = (name, data) => data) {
  const hash = createHash('sha256');
  const visit = (relative) => {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) throw new Error(`필수 파일 없음: ${relative}`);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error(`심볼릭 링크는 배포할 수 없습니다: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) visit(`${relative}/${name}`);
    } else {
      hash.update(relative); hash.update('\0'); hash.update(transform(relative, fs.readFileSync(full))); hash.update('\0');
    }
  };
  for (const entry of entries) visit(entry);
  return hash.digest('hex');
}

export function webBuildInfo(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return { version: pkg.version, sourceHash: hashInputs(root, ['src', 'public', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json', 'scripts/update-build-info.mjs']) };
}

export function nativeFingerprint(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const nativeDependencies = Object.entries(lock.packages).filter(([name]) => /node_modules\/@(capacitor|capawesome)\//.test(name))
    .map(([name, value]) => [name, value.version, value.integrity]).sort();
  const files = hashInputs(root, ['capacitor.config.json', 'android/app/src/main/java', 'android/app/src/main/res',
    'android/app/src/main/AndroidManifest.xml', 'android/app/build.gradle', 'android/app/capacitor.build.gradle',
    'android/build.gradle', 'android/settings.gradle', 'android/capacitor.settings.gradle', 'android/variables.gradle',
    'android/gradle/wrapper/gradle-wrapper.properties'], (name, data) => name.endsWith('app/build.gradle')
    ? data.toString().replace(/versionCode\s+\d+/, 'versionCode N').replace(/versionName\s+"[^"]+"/, 'versionName "N"').replaceAll('\r\n', '\n')
    : /\.(json|java|kt|xml|gradle|properties)$/.test(name) ? data.toString().replaceAll('\r\n', '\n') : data);
  return createHash('sha256').update(JSON.stringify({ files, nativeDependencies })).digest('hex');
}
