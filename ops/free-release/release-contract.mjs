import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';

const VERSION = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function requireRelease(condition, message) {
  if (!condition) throw new Error(message);
}

export async function readJsonFile(file, limit = 128 * 1024) {
  const info = await stat(file);
  requireRelease(info.isFile() && info.size > 0 && info.size <= limit, '배포 JSON 파일의 종류 또는 크기가 다릅니다.');
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function readSigningIdentity() {
  const identity = await readJsonFile(new URL('./contracts/signing-identity.json', import.meta.url));
  requireRelease(identity.schemaVersion === 1 && identity.repository === 'h0623-dev/cheonsu' && identity.manifestUrl === 'https://raw.githubusercontent.com/h0623-dev/cheonsu/updates/latest.json', '기존 공개 배포 trust 경로가 다릅니다.');
  requireRelease(identity.androidPackageId === 'com.cheonsu.game' && identity.androidKeyAlias === 'androiddebugkey' && identity.androidCertificateSha256 === '1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f', '기존 Android 서명 신원이 다릅니다.');
  requireRelease(SHA256.test(identity.nativeFingerprint) && Number.isSafeInteger(identity.minNativeVersion) && identity.minNativeVersion >= 350 && identity.rollbackBaselineCommit === '5d0f52175792dcaf464fd870db3f6e7c313d9314', '네이티브 호환·원복 고정 계약이 다릅니다.');
  const publicKey = createPublicKey(identity.otaPublicKeyPem);
  requireRelease(publicKey.asymmetricKeyType === 'rsa' && publicKey.asymmetricKeyDetails?.modulusLength >= 2048, 'OTA 공개키 형식이 다릅니다.');
  return identity;
}

export function compareVersions(next, current) {
  requireRelease(VERSION.test(next) && VERSION.test(current), '배포 버전 형식이 다릅니다.');
  const a = next.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return 0;
}

function decodeBase64(value, maximum) {
  requireRelease(typeof value === 'string' && value.length > 0 && value.length <= maximum && BASE64.test(value), '서명 안내의 base64 형식이 다릅니다.');
  const bytes = Buffer.from(value, 'base64');
  requireRelease(bytes.toString('base64') === value, '서명 안내의 base64 인코딩이 다릅니다.');
  return bytes;
}

// Same envelope, RSA-SHA256 signatures, bundle identity and exact URLs as the
// installed liveUpdateEngine contract. This module belongs to pinned PUBLIC
// control code and must not import or execute a private source helper.
export function verifyEnvelope(envelope, identity, { historical = false } = {}) {
  requireRelease(envelope && typeof envelope === 'object', '서명된 업데이트 안내가 필요합니다.');
  const payload = decodeBase64(envelope.payload, 24000);
  const signature = decodeBase64(envelope.signature, 1024);
  requireRelease(verify('RSA-SHA256', payload, identity.otaPublicKeyPem, signature), '기존 OTA 공개키로 업데이트 안내 서명을 확인할 수 없습니다.');
  const manifest = JSON.parse(payload.toString('utf8'));
  requireRelease(manifest.schema === 1 && VERSION.test(manifest.version), '서명된 업데이트 버전 형식이 다릅니다.');
  const root = `https://github.com/${identity.repository}/releases/download/v${manifest.version}/`;
  requireRelease(SHA256.test(manifest.sha256) && manifest.bundleId === `${manifest.version}-${manifest.sha256.slice(0, 12)}`, '업데이트 묶음 식별값이 다릅니다.');
  requireRelease(manifest.url === `${root}cheonsu_${manifest.version}_ota.zip` && manifest.apkUrl === `${root}cheonsu_${manifest.version}_update_debug.apk`, '기존 APK·OTA 공개 경로와 다릅니다.');
  requireRelease(Number.isSafeInteger(manifest.size) && manifest.size > 0 && manifest.size <= 512 * 1024 * 1024, '업데이트 묶음 크기가 다릅니다.');
  const minimum = historical ? 1 : identity.minNativeVersion;
  requireRelease(Number.isSafeInteger(manifest.minNativeVersion) && manifest.minNativeVersion >= minimum && Number.isSafeInteger(manifest.maxNativeVersion) && manifest.maxNativeVersion >= manifest.minNativeVersion, '업데이트의 네이티브 호환 범위가 다릅니다.');
  decodeBase64(manifest.bundleSignature, 1024);
  requireRelease(manifest.bundleSignature.length >= 256 && Array.isArray(manifest.notes) && manifest.notes.length <= 8 && manifest.notes.every(note => typeof note === 'string' && note.length <= 400), '업데이트 서명 또는 한국어 안내 형식이 다릅니다.');
  requireRelease(typeof manifest.releasedAt === 'string' && Number.isFinite(Date.parse(manifest.releasedAt)), '업데이트 시각이 다릅니다.');
  return manifest;
}

export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
