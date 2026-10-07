import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateThirdPartyNotices } from '../scripts/generate-third-party-notices.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'tmp/safari-dist');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const webRevision = 'safari-1';

await generateThirdPartyNotices();

// An independent entry and output: the Android build, public files and OTA stay intact.
await build({
  configFile: false,
  root: path.join(root, 'web'),
  base: '/',
  publicDir: path.join(root, 'public'),
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: { outDir: output, emptyOutDir: true, target: 'safari16.4', license: { fileName: 'legal/bundled-web-notices.md' } },
});

const manifest = JSON.parse(await readFile(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
Object.assign(manifest, {
  id: '/', start_url: '/', scope: '/', name: '천수', short_name: '천수',
  description: '천수 · Safari에서 즐기는 턴제 전술 RPG',
  shortcuts: [{ name: '천수 실행', short_name: '실행', url: '/' }],
});
await writeFile(path.join(output, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// This is only the old in-game web update notice, never the signed Android channel.
await mkdir(path.join(output, 'updates'), { recursive: true });
await writeFile(path.join(output, 'updates/latest.json'), JSON.stringify({
  version: pkg.version, title: `천수 웹 ${pkg.version}`, apkUrl: '', required: false,
  notes: ['웹 버전은 게임을 저장하고 완전히 닫았다가 다시 열어 갱신합니다.'],
}, null, 2));

const files = await readdir(path.join(output, 'assets'));
const bundles = files.filter(name => /\.(?:js|css)$/.test(name)).sort();
const worker = await readFile(path.join(root, 'web/service-worker.mjs'), 'utf8');
const hash = createHash('sha256').update(webRevision).update(pkg.version).update(worker);
for (const file of ['index.html', 'manifest.webmanifest', ...bundles.map(name => `assets/${name}`)]) {
  hash.update(await readFile(path.join(output, file)));
}
const revision = `${pkg.version}-${webRevision}-${hash.digest('hex').slice(0, 12)}`;
const shell = ['/', '/index.html', '/manifest.webmanifest', '/art/world-v2/icon-192.png',
  ...bundles.map(name => `/assets/${name}`)];
const script = `const WEB_CACHE_VERSION = ${JSON.stringify(revision)};\nconst WEB_SHELL = ${JSON.stringify(shell)};\n${worker}`;
await writeFile(path.join(output, 'sw.js'), script);
await writeFile(path.join(output, 'service-worker.js'), script);
await writeFile(path.join(output, 'web-release.json'), JSON.stringify({
  gameVersion: pkg.version, webRevision, cacheRevision: revision,
  sourceCommit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
  builtAt: new Date().toISOString(), platform: 'safari-web',
}, null, 2));
console.log(`천수 Safari 웹 제작 완료: ${revision} → tmp/safari-dist`);
