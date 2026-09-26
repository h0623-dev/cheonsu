import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createSign, createPublicKey, sign } from 'node:crypto';
import { ZipArchive } from 'archiver';
import { webBuildInfo, nativeFingerprint } from './update-build-info.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const info = webBuildInfo(root);
const built = read('dist/ota-build.json');
if (JSON.stringify(info) !== JSON.stringify(built)) throw new Error('소스가 빌드 후 변경되었습니다. APK를 먼저 다시 빌드하세요.');
const trust = read('src/data/updateTrust.json');
const compatibility = read('docs/update-native-baseline.json');
if (nativeFingerprint(root) !== compatibility.fingerprint || trust.minNativeVersion !== compatibility.minNativeVersion) {
  throw new Error('Android 네이티브 구조가 바뀌었습니다. APK 설치가 필요한 패치로 최소 앱 버전과 네이티브 기준을 갱신하세요.');
}
const privateKey = fs.readFileSync(process.env.CHEONSU_UPDATE_PRIVATE_KEY_PATH || path.join(root, '.update-keys/private.pem'), 'utf8');
if (createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString() !== trust.publicKey) throw new Error('패치 서명 키가 APK 공개 키와 다릅니다.');
const notes = read('docs/update-notes.json');
if (notes.version !== info.version || !notes.notes?.length) throw new Error('현재 버전의 패치 노트가 필요합니다.');
const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const maxNativeVersion = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
if (!gradle.includes(`versionName "${info.version}"`)) throw new Error('APK와 게임 버전이 다릅니다.');
const outputDir = path.join(root, 'update-release', info.version);
fs.mkdirSync(outputDir, { recursive: true });
const fileName = `cheonsu_${info.version}_ota.zip`;
const zipPath = path.join(outputDir, fileName);
const zip = new ZipArchive({ zlib: { level: 6 } });
const output = fs.createWriteStream(zipPath);
const complete = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); zip.on('error', reject); zip.on('warning', reject); });
zip.pipe(output);
zip.directory(path.join(root, 'dist'), false);
await zip.finalize(); await complete;
const hash = createHash('sha256');
const signer = createSign('RSA-SHA256');
for await (const chunk of fs.createReadStream(zipPath)) { hash.update(chunk); signer.update(chunk); }
const sha256 = hash.digest('hex');
const releaseRoot = `https://github.com/${trust.repository}/releases/download/v${info.version}`;
const manifest = { schema: 1, version: info.version, bundleId: `${info.version}-${sha256.slice(0, 12)}`,
  url: `${releaseRoot}/${fileName}`, apkUrl: `${releaseRoot}/cheonsu_${info.version}_update_debug.apk`,
  sha256, bundleSignature: signer.sign(privateKey, 'base64'), size: fs.statSync(zipPath).size,
  minNativeVersion: trust.minNativeVersion, maxNativeVersion, releasedAt: new Date().toISOString(), notes: notes.notes,
};
const bytes = Buffer.from(JSON.stringify(manifest));
const envelope = { payload: bytes.toString('base64'), signature: sign('RSA-SHA256', bytes, privateKey).toString('base64') };
fs.writeFileSync(path.join(outputDir, 'latest.json'), JSON.stringify(envelope, null, 2) + '\n');
console.log(JSON.stringify({ zipPath, version: manifest.version, size: manifest.size, sha256, minNativeVersion: manifest.minNativeVersion, maxNativeVersion }, null, 2));
