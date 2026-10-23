import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Shared identity/read primitives only. This module has no Secret-copy API,
// publication, branch/tag, visibility, or repository-name mutation capability.
// Callers keep any temporary keystore inside their own GitHub runner directory.
const PUBLIC_REPOSITORY = 'h0623-dev/cheonsu';
const ENVIRONMENT = 'cheonsu-release';
const MANIFEST_URL = 'https://raw.githubusercontent.com/h0623-dev/cheonsu/updates/latest.json';
const ANDROID_CERTIFICATE = '1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f';
const MAXIMUM_RESPONSE_BYTES = 1024 * 1024;
const MAXIMUM_SECRET_BYTES = 65536;
const SECRET_NAMES = Object.freeze(['ANDROID_DEBUG_KEYSTORE_BASE64', 'OTA_PRIVATE_KEY_PEM']);

export class MigrationError extends Error {}

function requireCondition(condition, message) {
  if (!condition) throw new MigrationError(message);
}

export function requireSecretFormat(name, value) {
  requireCondition(SECRET_NAMES.includes(name) && typeof value === 'string' && value.length > 0
    && Buffer.byteLength(value) <= MAXIMUM_SECRET_BYTES, '기존 키 두 개가 GitHub Environment 내부에 있어야 합니다.');
  if (name === 'ANDROID_DEBUG_KEYSTORE_BASE64') {
    requireCondition(/^[A-Za-z0-9+/=\r\n]+$/.test(value), 'Android Base64 값이 원문 보존용 허용 문자 범위를 벗어났습니다.');
  } else {
    requireCondition(/^-----BEGIN ((?:RSA )?PRIVATE KEY)-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n)+-----END \1-----(?:\r?\n)*$/.test(value),
      'OTA PEM 값이 원문 보존용 허용 형식 범위를 벗어났습니다.');
  }
  // The grammars exclude quote/backslash/dollar expansion, tabs and non-ASCII.
  // A one-entry JSON-quoted dotenv copy can therefore preserve exact CR/LF.
  requireCondition(!/["'\\$\t]/.test(value), '키 값에 dotenv 해석을 바꿀 수 있는 문자가 있습니다.');
}

export function githubReader(token) {
  requireCondition(typeof token === 'string' && token.length > 0, 'GitHub 내부 운영 자격증명이 필요합니다.');
  return async (apiPath) => {
    requireCondition(apiPath.startsWith('/repos/'), '지정한 GitHub 저장소 API만 사용할 수 있습니다.');
    let response;
    try {
      response = await fetch(`https://api.github.com${apiPath}`, {
        method: 'GET', redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new MigrationError('GitHub 운영 API에 연결하지 못했습니다. 접근 정책을 우회하지 않습니다.');
    }
    requireCondition(response.ok, `GitHub 운영 API 접근 실패: HTTP ${response.status}`);
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      requireCondition(total <= MAXIMUM_RESPONSE_BYTES, '운영 메타데이터 응답이 허용 크기를 초과했습니다.');
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new MigrationError('운영 메타데이터가 올바른 JSON이 아닙니다.'); }
  };
}

function publicKeyDer(value, label) {
  requireCondition(typeof value === 'string' && Buffer.byteLength(value) <= MAXIMUM_SECRET_BYTES, `${label} 공개키 계약이 필요합니다.`);
  try { return createPublicKey(value).export({ type: 'spki', format: 'der' }); }
  catch { throw new MigrationError(`${label} 공개키 형식을 읽을 수 없습니다.`); }
}

export function publicIdentityContract() {
  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(new URL('../contracts/signing-identity.json', import.meta.url), 'utf8'));
  } catch { throw new MigrationError('고정 control SHA의 공개 서명 신원 계약이 필요합니다.'); }
  requireCondition(contract.schemaVersion === 1 && contract.androidKeyAlias === 'androiddebugkey'
    && contract.androidCertificateSha256 === ANDROID_CERTIFICATE, '기존 Android 서명 신원 계약과 다릅니다.');
  requireCondition(contract.repository === PUBLIC_REPOSITORY && contract.manifestUrl === MANIFEST_URL,
    '기존 APK/OTA 공개 배포 경로 계약과 다릅니다.');
  return contract;
}

export function verifyOtaIdentity(privatePem, contract, trust) {
  requireSecretFormat('OTA_PRIVATE_KEY_PEM', privatePem);
  let actual;
  try {
    const privateKey = createPrivateKey(privatePem);
    requireCondition(privateKey.type === 'private' && privateKey.asymmetricKeyType === 'rsa', '기존 RSA OTA 개인키가 필요합니다.');
    actual = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError('기존 OTA 개인키를 읽을 수 없습니다. 원문을 출력하지 않습니다.');
  }
  const expected = publicKeyDer(contract.otaPublicKeyPem, '고정 OTA');
  const live = publicKeyDer(trust.publicKey, '현재 원본 OTA');
  requireCondition(actual.equals(expected) && actual.equals(live), 'OTA 개인키가 기존 앱 및 현재 main의 공개키와 다릅니다.');
  return createHash('sha256').update(actual).digest('hex');
}

export function minimalChildEnvironment(env, directory) {
  // Preserve the runner's existing HOME; do not inherit signing secrets/debug.
  return { PATH: env.PATH || '/usr/bin:/bin', HOME: env.HOME, TMPDIR: directory, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
}

export function verifyAndroidIdentity(encoded, contract, directory, env) {
  requireSecretFormat('ANDROID_DEBUG_KEYSTORE_BASE64', encoded);
  const normalized = encoded.replace(/[\r\n]/g, '');
  requireCondition(normalized.length > 0 && normalized.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(normalized),
    '기존 Android keystore의 Base64 형식이 올바르지 않습니다.');
  const bytes = Buffer.from(normalized, 'base64');
  requireCondition(bytes.length > 0 && bytes.toString('base64') === normalized, '기존 Android keystore를 정확하게 복원할 수 없습니다.');
  const keystore = path.join(directory, 'existing.keystore');
  requireCondition(typeof env.JAVA_HOME === 'string' && path.isAbsolute(env.JAVA_HOME), '승인된 JDK의 JAVA_HOME이 필요합니다.');
  const keytool = path.join(env.JAVA_HOME, 'bin', 'keytool');
  fs.writeFileSync(keystore, bytes, { mode: 0o600, flag: 'wx' });
  bytes.fill(0);
  const common = ['-keystore', keystore, '-alias', contract.androidKeyAlias, '-storepass', 'android',
    '-J-Duser.language=en', '-J-Duser.country=US'];
  const options = { env: minimalChildEnvironment(env, directory), stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 };
  let certificate;
  try {
    certificate = execFileSync(keytool, ['-exportcert', ...common], options);
    const description = execFileSync(keytool, ['-list', '-v', ...common], options).toString('utf8');
    requireCondition(/Entry type:\s*PrivateKeyEntry/.test(description), 'Android keystore에 기존 개인키 항목이 없습니다.');
    // Unlock the existing entry without exporting its key. Discard the CSR.
    execFileSync(keytool, ['-certreq', ...common, '-keypass', 'android'], options);
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError('표준 keytool로 기존 Android 개인키 신원을 확인하지 못했습니다. 키나 도구 출력을 기록하지 않습니다.');
  }
  let fingerprint;
  try { fingerprint = new X509Certificate(certificate).fingerprint256.replaceAll(':', '').toLowerCase(); }
  catch { throw new MigrationError('기존 Android 인증서를 읽을 수 없습니다.'); }
  requireCondition(fingerprint === contract.androidCertificateSha256, 'Android 인증서가 기존 설치 앱의 인증서와 다릅니다.');
  return fingerprint;
}

export async function assertEnvironmentMainOnly(read, repository) {
  const [environment, policies] = await Promise.all([
    read(`/repos/${repository}/environments/${ENVIRONMENT}`),
    read(`/repos/${repository}/environments/${ENVIRONMENT}/deployment-branch-policies?per_page=100`),
  ]);
  requireCondition(environment.name === ENVIRONMENT
    && environment.deployment_branch_policy?.protected_branches === false
    && environment.deployment_branch_policy?.custom_branch_policies === true,
  '기존 방식의 Environment 선택 branch 제한이 필요합니다.');
  requireCondition(policies.total_count === 1 && policies.branch_policies?.length === 1
    && policies.branch_policies[0].name === 'main' && policies.branch_policies[0].type === 'branch',
  '원본과 대상 Environment 모두 branch형 main 하나만 허용해야 합니다.');
}
