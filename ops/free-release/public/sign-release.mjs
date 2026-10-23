import { createPrivateKey, createPublicKey, createSign, createVerify, X509Certificate } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeRequest } from '../authorize-request.mjs';
import { hashFile, readSigningIdentity, requireRelease, verifyEnvelope } from '../release-contract.mjs';
import { archiveData, prepareArtifact } from './safe-artifact.mjs';

const VERSION = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TOOL_VERSION = '35.0.0';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sourceIdentity(approval) {
  return [approval.sourceRepositoryId, approval.sourceSha, approval.sourceRunId, approval.sourceRunAttempt, approval.artifactId, approval.artifactArchiveSha256, approval.artifactArchiveBytes, approval.sourceWorkflowBlobSha, approval.distributionRepositoryId, approval.controlSourceRevision].join(':');
}

function runTool(file, args, { env = process.env, expectSuccess = true, binary = false } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { shell: false, env, encoding: binary ? 'buffer' : 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 5 * 60 * 1000 }, (error, stdout) => {
      if (error && expectSuccess) return reject(new Error('승인된 Android 서명 도구 작업이 실패했습니다. 키·원문 진단은 출력하지 않습니다.'));
      if (!expectSuccess) return resolve({ success: !error, output: stdout });
      resolve(stdout);
    });
  });
}

function toolEnvironment(env, extra = {}) {
  return {
    PATH: env.PATH,
    JAVA_HOME: env.JAVA_HOME,
    ANDROID_HOME: env.ANDROID_HOME,
    ANDROID_SDK_ROOT: env.ANDROID_SDK_ROOT,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    ...extra,
  };
}

async function androidTools(env) {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  requireRelease(typeof sdk === 'string' && path.isAbsolute(sdk) && typeof env.JAVA_HOME === 'string' && path.isAbsolute(env.JAVA_HOME), '승인된 Android SDK와 JDK 경로가 필요합니다.');
  const tools = Object.fromEntries(['aapt', 'zipalign', 'apksigner'].map(name => [name, path.join(sdk, 'build-tools', TOOL_VERSION, name)]));
  tools.keytool = path.join(env.JAVA_HOME, 'bin/keytool');
  for (const file of Object.values(tools)) requireRelease((await stat(file)).isFile(), '고정 버전의 Android 서명 도구가 필요합니다.');
  return tools;
}

function validateMetadata(metadata, approval, identity) {
  requireRelease(metadata && metadata.schemaVersion === 1 && VERSION.test(metadata.version), '무서명 배포 메타데이터 버전 형식이 다릅니다.');
  requireRelease(metadata.sourceRepositoryId === approval.sourceRepositoryId && metadata.sourceSha === approval.sourceSha && metadata.runId === approval.sourceRunId && metadata.runAttempt === approval.sourceRunAttempt, '무서명 메타데이터가 GitHub 출처와 다릅니다.');
  requireRelease(Number.isSafeInteger(metadata.nativeVersionCode) && metadata.nativeVersionCode >= identity.minNativeVersion && metadata.minNativeVersion === identity.minNativeVersion, '무서명 APK의 네이티브 버전 범위가 다릅니다.');
  requireRelease(Number.isSafeInteger(metadata.apkSize) && metadata.apkSize > 0 && metadata.apkSize <= identity.maximumApkBytes && SHA256.test(metadata.apkSha256) && SHA256.test(metadata.payloadIndexSha256), '무서명 APK 크기·SHA256 형식이 다릅니다.');
  requireRelease(metadata.nativeFingerprint === identity.nativeFingerprint && metadata.rollbackBaselineCommit === identity.rollbackBaselineCommit, '승인된 네이티브 지문 또는 원복 기준이 다릅니다.');
  requireRelease(metadata.nativeBaseline?.minNativeVersion === identity.requiredNativeBaseline.minNativeVersion && metadata.nativeBaseline.fingerprint === identity.requiredNativeBaseline.fingerprint, '승인된 네이티브 호환 기준 문서가 다릅니다.');
  const trust = metadata.updateTrust;
  requireRelease(trust && trust.repository === identity.repository && trust.manifestUrl === identity.manifestUrl && trust.minNativeVersion === identity.minNativeVersion && trust.publicKey === identity.otaPublicKeyPem, '기존 APK/OTA 공개 신뢰 계약이 다릅니다.');
  requireRelease(metadata.webBuildInfo?.version === metadata.version && SHA256.test(metadata.webBuildInfo?.sourceHash), '웹 빌드 출처 정보가 다릅니다.');
  requireRelease(Array.isArray(metadata.notes) && metadata.notes.length >= 1 && metadata.notes.length <= 8 && metadata.notes.every(note => typeof note === 'string' && note.length <= 400), '한국어 패치 안내 형식이 다릅니다.');
  const releasedAt = Date.parse(metadata.releasedAt);
  requireRelease(Number.isFinite(releasedAt) && releasedAt >= Date.UTC(2020, 0, 1) && releasedAt <= Date.now() && new Date(releasedAt).toISOString() === metadata.releasedAt, '원본 빌드의 고정 배포 시각이 다릅니다.');
}

function validateApkData(data, metadata, identity) {
  const config = data.capacitorConfig;
  requireRelease(canonical(config) === canonical(identity.requiredCapacitorConfig), 'APK Capacitor 설정이 승인된 공개 설정과 다릅니다.');
  requireRelease(config.appId === identity.androidPackageId && config.android?.adjustMarginsForEdgeToEdge === 'auto' && !Object.hasOwn(config.server || {}, 'url'), 'APK package·화면 맞춤·저장 origin 보호가 다릅니다.');
  const update = config.plugins?.LiveUpdate;
  requireRelease(update?.publicKey === identity.otaPublicKeyPem && update.readyTimeout === 30000 && update.autoBlockRolledBackBundles === true && update.autoDeleteBundles === true && update.autoUpdateStrategy === 'none', 'APK의 OTA 신뢰·복구 설정이 다릅니다.');
  requireRelease(data.hasLiveUpdatePlugin === true && Number.isSafeInteger(data.payloadFileCount) && data.payloadFileCount > 0 && data.payloadFileCount <= identity.maximumPayloadEntries, 'APK의 LiveUpdate 플러그인 또는 웹 파일 수가 다릅니다.');
  requireRelease(canonical(data.webBuildInfo) === canonical(metadata.webBuildInfo), 'APK 내 웹 빌드 정보가 원본 빌드와 다릅니다.');
}

async function validateApkIdentity(apk, metadata, identity, tools, env) {
  const badging = await runTool(tools.aapt, ['dump', 'badging', apk], { env: toolEnvironment(env) });
  const firstLine = badging.split('\n')[0];
  const details = firstLine.match(/^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'/);
  requireRelease(details && details[1] === identity.androidPackageId && Number(details[2]) === metadata.nativeVersionCode && details[3] === metadata.version, 'APK의 실제 package·버전이 전달 메타데이터와 다릅니다.');
  requireRelease(/^application-debuggable\s*$/m.test(badging), '기존 동작을 유지하는 debug variant APK만 허용합니다.');
}

async function outputDirectory(env) {
  requireRelease(env.GITHUB_ACTIONS === 'true' && process.platform === 'linux' && env.RUNNER_TEMP && path.isAbsolute(env.RUNNER_TEMP), 'GitHub의 임시 Linux runner에서만 서명합니다.');
  const runner = await realpath(env.RUNNER_TEMP);
  requireRelease(typeof env.CHEONSU_RELEASE_OUTPUT === 'string' && path.isAbsolute(env.CHEONSU_RELEASE_OUTPUT), 'runner 임시 디렉터리 안의 배포 출력 경로가 필요합니다.');
  const directory = path.resolve(env.CHEONSU_RELEASE_OUTPUT);
  const relative = path.relative(runner, directory);
  requireRelease(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative), '배포 출력은 runner 임시 디렉터리 아래여야 합니다.');
  let current = runner;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    try { requireRelease(!(await lstat(current)).isSymbolicLink(), '출력 경로의 심볼릭 링크를 허용하지 않습니다.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  requireRelease((await realpath(directory)) === directory, '배포 출력 경로가 다른 위치를 가리킵니다.');
  await chmod(directory, 0o700);
  return { runner, directory };
}

/** Signed output only; never publishes or executes private build code. */
export async function signRelease(env = process.env) {
  const approval = await authorizeRequest(env);
  const identity = await readSigningIdentity();
  const { runner, directory } = await outputDirectory(env);
  const workspace = await mkdtemp(path.join(runner, 'cheonsu-public-sign-'));
  await chmod(workspace, 0o700);
  const outputs = [];
  let keystoreBytes;
  try {
    const transfer = await prepareArtifact(approval, env, workspace);
    const metadata = transfer.metadata;
    validateMetadata(metadata, approval, identity);
    requireRelease((await stat(transfer.apkPath)).size === metadata.apkSize && await hashFile(transfer.apkPath) === metadata.apkSha256, '무서명 APK의 실제 크기·SHA256이 다릅니다.');
    const payloadDirectory = path.join(workspace, 'web-payload');
    const apkData = await archiveData('payload', { apk: transfer.apkPath, index: transfer.indexPath, destination: payloadDirectory, requireUnsigned: true });
    validateApkData(apkData, metadata, identity);
    const tools = await androidTools(env);
    await validateApkIdentity(transfer.apkPath, metadata, identity, tools, env);
    const unsigned = await runTool(tools.apksigner, ['verify', transfer.apkPath], { env: toolEnvironment(env), expectSuccess: false });
    requireRelease(unsigned.success === false, '이미 서명된 APK를 무서명 전달물로 취급할 수 없습니다.');

    const current = await authorizeRequest(env);
    requireRelease(sourceIdentity(current) === sourceIdentity(approval), '서명 직전 원본 main 또는 artifact 출처가 변경됐습니다.');
    const encoded = env.ANDROID_DEBUG_KEYSTORE_BASE64;
    requireRelease(typeof encoded === 'string' && encoded.length > 0 && encoded.length <= 2 * 1024 * 1024 && /^[A-Za-z0-9+/=\r\n]+$/.test(encoded), '기존 Android 서명 신원 값이 필요합니다.');
    // Preserve the Environment Secret verbatim. Only this in-memory decoding
    // copy removes Base64 line wrapping used by earlier signing setup.
    const normalizedEncoding = encoded.replaceAll('\r', '').replaceAll('\n', '');
    requireRelease(/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedEncoding), 'Android 서명 자료의 base64 형식이 다릅니다.');
    keystoreBytes = Buffer.from(normalizedEncoding, 'base64');
    requireRelease(keystoreBytes.toString('base64') === normalizedEncoding, 'Android 서명 자료의 base64 형식이 다릅니다.');
    requireRelease(typeof env.OTA_PRIVATE_KEY_PEM === 'string' && env.OTA_PRIVATE_KEY_PEM.length <= 16384, '기존 OTA 서명 신원 값이 필요합니다.');
    let otaKey;
    try {
      otaKey = createPrivateKey(env.OTA_PRIVATE_KEY_PEM);
      const actual = createPublicKey(otaKey).export({ type: 'spki', format: 'der' });
      const expected = createPublicKey(identity.otaPublicKeyPem).export({ type: 'spki', format: 'der' });
      requireRelease(actual.equals(expected), 'OTA 서명키가 기존 앱의 공개키와 다릅니다.');
    } catch {
      throw new Error('OTA 서명 신원이 기존 공개키와 일치하지 않습니다.');
    }
    const keyDirectory = path.join(workspace, 'keys');
    await mkdir(keyDirectory, { mode: 0o700 });
    const keystore = path.join(keyDirectory, 'android.keystore');
    await writeFile(keystore, keystoreBytes, { flag: 'wx', mode: 0o600 });
    const secretToolEnvironment = toolEnvironment(env, { CHEONSU_KEYSTORE_PASSWORD: 'android', CHEONSU_KEY_PASSWORD: 'android' });
    const certificate = await runTool(tools.keytool, ['-exportcert', '-keystore', keystore, '-alias', identity.androidKeyAlias, '-storepass:env', 'CHEONSU_KEYSTORE_PASSWORD'], { env: secretToolEnvironment, binary: true });
    requireRelease(new X509Certificate(certificate).fingerprint256.replaceAll(':', '').toLowerCase() === identity.androidCertificateSha256, 'Android 서명 인증서가 기존 설치 앱과 다릅니다.');

    const apkName = `cheonsu_${metadata.version}_update_debug.apk`;
    const otaName = `cheonsu_${metadata.version}_ota.zip`;
    const apkOutput = path.join(directory, apkName);
    const otaOutput = path.join(directory, otaName);
    for (const file of [apkOutput, otaOutput, path.join(directory, 'latest.json'), path.join(directory, 'publication.json')]) {
      try { await lstat(file); throw new Error('기존 로컬 배포 결과를 덮어쓰지 않습니다. 새 출력 디렉터리를 사용하세요.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    outputs.push(apkOutput, otaOutput, path.join(directory, 'latest.json'), path.join(directory, 'publication.json'));
    const aligned = path.join(workspace, 'aligned.apk');
    const signed = path.join(workspace, 'signed.apk');
    await runTool(tools.zipalign, ['-P', '16', '-f', '4', transfer.apkPath, aligned], { env: toolEnvironment(env) });
    await runTool(tools.apksigner, ['sign', '--ks', keystore, '--ks-key-alias', identity.androidKeyAlias, '--ks-pass', 'env:CHEONSU_KEYSTORE_PASSWORD', '--key-pass', 'env:CHEONSU_KEY_PASSWORD', '--v4-signing-enabled', 'false', '--out', signed, aligned], { env: secretToolEnvironment });
    const signature = await runTool(tools.apksigner, ['verify', '--verbose', '--print-certs', signed], { env: toolEnvironment(env) });
    const certificates = [...signature.matchAll(/Signer #[0-9]+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})/g)].map(match => match[1].toLowerCase());
    requireRelease(certificates.length === 1 && certificates[0] === identity.androidCertificateSha256, '최종 APK의 실제 서명 인증서가 다릅니다.');
    await runTool(tools.zipalign, ['-c', '-P', '16', '4', signed], { env: toolEnvironment(env) });
    await validateApkIdentity(signed, metadata, identity, tools, env);
    validateApkData(await archiveData('payload', { apk: signed, index: transfer.indexPath }), metadata, identity);
    await archiveData('ota', { source: payloadDirectory, index: transfer.indexPath, output: otaOutput });
    await archiveData('ota-check', { archive: otaOutput, index: transfer.indexPath });

    const bundleSigner = createSign('RSA-SHA256');
    const bundleVerifier = createVerify('RSA-SHA256');
    for await (const chunk of createReadStream(otaOutput)) { bundleSigner.update(chunk); bundleVerifier.update(chunk); }
    const bundleSignature = bundleSigner.sign(otaKey, 'base64');
    requireRelease(bundleVerifier.verify(identity.otaPublicKeyPem, bundleSignature, 'base64'), 'OTA 묶음 서명이 기존 공개키와 다릅니다.');
    const otaSha256 = await hashFile(otaOutput);
    const root = `https://github.com/${identity.repository}/releases/download/v${metadata.version}`;
    const manifest = { schema: 1, version: metadata.version, bundleId: `${metadata.version}-${otaSha256.slice(0, 12)}`, url: `${root}/${otaName}`, apkUrl: `${root}/${apkName}`, sha256: otaSha256, bundleSignature, size: (await stat(otaOutput)).size, minNativeVersion: identity.minNativeVersion, maxNativeVersion: metadata.nativeVersionCode, releasedAt: metadata.releasedAt, notes: metadata.notes };
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const envelopeSigner = createSign('RSA-SHA256');
    envelopeSigner.update(manifestBytes);
    const envelope = { payload: manifestBytes.toString('base64'), signature: envelopeSigner.sign(otaKey, 'base64') };
    verifyEnvelope(envelope, identity);
    await rename(signed, apkOutput);
    const manifestPath = path.join(directory, 'latest.json');
    await writeFile(manifestPath, `${JSON.stringify(envelope, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    const files = [];
    for (const file of [apkOutput, otaOutput]) files.push({ name: path.basename(file), size: (await stat(file)).size, sha256: await hashFile(file) });
    const publication = { schemaVersion: 1, version: metadata.version, sourceSha: approval.sourceSha, sourceRunId: approval.sourceRunId, sourceRunAttempt: approval.sourceRunAttempt, sourceArtifactId: approval.artifactId, nativeVersionCode: metadata.nativeVersionCode, minNativeVersion: identity.minNativeVersion, maxNativeVersion: metadata.nativeVersionCode, manifest, envelope, files };
    const publicationPath = path.join(directory, 'publication.json');
    await writeFile(publicationPath, `${JSON.stringify(publication, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { version: metadata.version, sourceSha: approval.sourceSha, nativeVersionCode: metadata.nativeVersionCode, publicationPath, files };
  } catch (error) {
    for (const file of outputs) await rm(file, { force: true }).catch(() => {});
    throw error;
  } finally {
    keystoreBytes?.fill(0);
    await rm(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  signRelease().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
