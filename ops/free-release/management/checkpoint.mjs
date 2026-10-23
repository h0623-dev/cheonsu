// GitHub-only management data. Signing identities are never accepted here.
// Checkpoint contents are encrypted strings, never file names or executable code.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_ID = 1248868923;
const TARGET_ID = 1430565223;
const OWNER_ID = 261550809;
const SOURCE = 'h0623-dev/cheonsu';
const TARGET = 'h0623-dev/cheonsu-distribution-staging';
const ENVIRONMENT = 'cheonsu-release';
const KEY_NAME = 'CHEONSU_MIGRATION_CHECKPOINT_KEY';
const CREDENTIAL_NAME = 'CHEONSU_REPOSITORY_MIGRATION_TOKEN';
const WORKFLOW = '.github/workflows/repository-migration-management.yml';
const MAXIMUM_PLAINTEXT = 16 * 1024 * 1024;
const MAXIMUM_ARCHIVE = 24 * 1024 * 1024;
const HEX40 = /^[a-f0-9]{40}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const FILES = new Set(['state', 'enrollment', 'journal', 'adoption', 'adoptionBackup', 'adoptionLock', 'error']);
const HEADER = ['sourceRepositoryId', 'targetRepositoryId', 'sourceSha', 'controlSha', 'phase', 'runId', 'runAttempt'];
const SPEC = ['repository', 'repositoryId', 'runId', 'runAttempt', 'artifactName', 'workflowPath', 'workflowId', 'workflowBlobSha', 'headSha', 'controlSha'];
const archiveTool = fileURLToPath(new URL('./checkpoint-archive.py', import.meta.url));

function requireCheckpoint(condition, message = '복구 체크포인트의 형식 또는 신원이 다릅니다.') {
  if (!condition) throw new Error(message);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function exactKeys(value, names) {
  requireCheckpoint(object(value) && Object.keys(value).length === names.length
    && names.every(name => Object.hasOwn(value, name)));
}

function headerData(value) {
  exactKeys(value, HEADER);
  requireCheckpoint(value.sourceRepositoryId === SOURCE_ID && value.targetRepositoryId === TARGET_ID
    && typeof value.sourceSha === 'string' && HEX40.test(value.sourceSha)
    && typeof value.controlSha === 'string' && HEX40.test(value.controlSha)
    && typeof value.phase === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value.phase)
    && positiveInteger(value.runId) && positiveInteger(value.runAttempt));
  return Object.fromEntries(HEADER.map(name => [name, value[name]]));
}

function fileData(value) {
  requireCheckpoint(object(value) && Object.keys(value).length > 0 && Object.keys(value).length <= FILES.size);
  const result = Object.create(null);
  let size = 0;
  for (const name of Object.keys(value).sort()) {
    requireCheckpoint(FILES.has(name) && typeof value[name] === 'string');
    size += Buffer.byteLength(value[name]);
    requireCheckpoint(size <= MAXIMUM_PLAINTEXT);
    result[name] = value[name];
  }
  return result;
}

function decodeBase64(value, limit) {
  requireCheckpoint(typeof value === 'string' && value.length > 0 && value.length <= limit && BASE64.test(value));
  const bytes = Buffer.from(value, 'base64');
  requireCheckpoint(bytes.toString('base64') === value);
  return bytes;
}

function keyData(key) {
  requireCheckpoint(Buffer.isBuffer(key) && key.length === 32, 'GitHub 내부의 32바이트 체크포인트 키가 필요합니다.');
  return key;
}

export function checkpointKey(env = process.env) {
  let bytes;
  try {
    bytes = decodeBase64(env[KEY_NAME], 44);
    keyData(bytes);
    return bytes;
  } catch {
    bytes?.fill(0);
    throw new Error('기존 GitHub Environment의 체크포인트 키가 없거나 형식이 다릅니다. 새 키로 덮어쓰지 않습니다.');
  }
}

async function directoryPath(directory) {
  requireCheckpoint(typeof directory === 'string' && path.isAbsolute(directory)
    && path.normalize(directory) === directory, '체크포인트의 절대 디렉터리가 필요합니다.');
  const information = await lstat(directory);
  requireCheckpoint(information.isDirectory() && !information.isSymbolicLink()
    && await realpath(directory) === directory, '체크포인트 디렉터리에 symlink를 허용하지 않습니다.');
  return directory;
}

async function filePath(file) {
  requireCheckpoint(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file);
  await directoryPath(path.dirname(file));
  return file;
}

async function readBoundedFile(file, maximum) {
  await filePath(file);
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const information = await handle.stat();
    requireCheckpoint(information.isFile() && information.size > 0 && information.size <= maximum);
    const bytes = Buffer.alloc(information.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const chunk = await handle.read(bytes, length, bytes.length - length, null);
      if (chunk.bytesRead === 0) break;
      length += chunk.bytesRead;
    }
    requireCheckpoint(length === information.size && length <= maximum);
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

export async function saveCheckpoint(file, data, key) {
  let plaintext;
  let handle;
  let created = false;
  try {
    exactKeys(data, ['header', 'files']);
    const header = headerData(data.header);
    const files = fileData(data.files);
    keyData(key);
    plaintext = Buffer.from(JSON.stringify({ files }), 'utf8');
    requireCheckpoint(plaintext.length <= MAXIMUM_PLAINTEXT);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify(header), 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = { schemaVersion: 1, algorithm: 'AES-256-GCM', header,
      nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
    const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`, 'utf8');
    requireCheckpoint(bytes.length <= MAXIMUM_ARCHIVE);
    await filePath(file);
    handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
    await handle.writeFile(bytes);
    await handle.sync();
    return file;
  } catch {
    if (handle) await handle.close().catch(() => {});
    handle = null;
    if (created) await rm(file, { force: true }).catch(() => {});
    throw new Error('복구 체크포인트 저장에 실패했습니다. 기존 파일과 키는 덮어쓰지 않습니다.');
  } finally {
    plaintext?.fill(0);
    if (handle) await handle.close().catch(() => {});
  }
}

export async function loadCheckpoint(file, key) {
  let plaintext;
  try {
    keyData(key);
    const bytes = await readBoundedFile(file, MAXIMUM_ARCHIVE);
    const envelope = JSON.parse(bytes.toString('utf8'));
    exactKeys(envelope, ['schemaVersion', 'algorithm', 'header', 'nonce', 'tag', 'ciphertext']);
    requireCheckpoint(envelope.schemaVersion === 1 && envelope.algorithm === 'AES-256-GCM');
    const header = headerData(envelope.header);
    const nonce = decodeBase64(envelope.nonce, 16);
    const tag = decodeBase64(envelope.tag, 24);
    const ciphertext = decodeBase64(envelope.ciphertext, Math.ceil(MAXIMUM_PLAINTEXT / 3) * 4);
    requireCheckpoint(nonce.length === 12 && tag.length === 16 && ciphertext.length <= MAXIMUM_PLAINTEXT);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(JSON.stringify(header), 'utf8'));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    requireCheckpoint(plaintext.length <= MAXIMUM_PLAINTEXT);
    const data = JSON.parse(plaintext.toString('utf8'));
    exactKeys(data, ['files']);
    return { header, files: fileData(data.files) };
  } catch {
    throw new Error('복구 체크포인트를 인증·복호화할 수 없습니다. 키나 원문은 출력하지 않습니다.');
  } finally { plaintext?.fill(0); }
}

async function boundedResponse(response, maximum) {
  requireCheckpoint(response.body, 'GitHub 메타데이터 응답이 없습니다.');
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      requireCheckpoint(size <= maximum, 'GitHub 메타데이터 크기가 제한을 초과했습니다.');
      chunks.push(chunk);
    }
  } catch { throw new Error('GitHub 메타데이터를 제한된 크기로 읽지 못했습니다.'); }
  return Buffer.concat(chunks);
}

export function apiClient(token) {
  requireCheckpoint(typeof token === 'string' && token.length > 0 && token.length <= 8192
    && !/[\s\u0000-\u001f\u007f]/.test(token), 'GitHub 내부 저장소 관리 자격증명이 필요합니다.');
  return async (endpoint, method = 'GET', body, options = {}) => {
    requireCheckpoint(typeof endpoint === 'string' && endpoint.length <= 4096
      && /^\/(?:repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+|repositories\/[1-9][0-9]*)(?:[/?]|$)/.test(endpoint)
      && !/[\\#\u0000-\u0020\u007f]/.test(endpoint)
      && !/(?:^|\/)\.{1,2}(?:\/|\?|$)/.test(endpoint)
      && !/%(?:2f|5c|2e|00)/i.test(endpoint), '허용된 GitHub 저장소 API 경로만 사용합니다.');
    requireCheckpoint(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
      && object(options) && Object.keys(options).every(name => name === 'missing')
      && (options.missing === undefined || typeof options.missing === 'boolean'));
    const url = new URL(`https://api.github.com${endpoint}`);
    requireCheckpoint(url.origin === 'https://api.github.com');
    let encoded;
    try {
      if (body !== undefined) encoded = JSON.stringify(body);
      requireCheckpoint(encoded === undefined || Buffer.byteLength(encoded) <= MAXIMUM_PLAINTEXT);
    } catch { throw new Error('GitHub 관리 요청 본문의 형식 또는 크기가 다릅니다.'); }
    let response;
    try {
      response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Cheonsu-Pinned-Repository-Management',
          ...(encoded === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: encoded });
    } catch { throw new Error('GitHub 관리 API 연결에 실패했습니다. 원문과 자격증명은 출력하지 않습니다.'); }
    if (response.status === 404 && options.missing === true) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`GitHub 관리 API 요청 실패: HTTP ${response.status}`); }
    if (response.status === 204) { await response.body?.cancel(); return null; }
    const bytes = await boundedResponse(response, MAXIMUM_PLAINTEXT);
    try { return JSON.parse(bytes.toString('utf8')); }
    catch { throw new Error('GitHub 관리 API가 올바른 JSON 메타데이터를 반환하지 않았습니다.'); }
  };
}

function managementRuntime(env) {
  requireCheckpoint(env.GITHUB_ACTIONS === 'true' && process.platform === 'linux'
    && env.GITHUB_SERVER_URL === 'https://github.com' && env.GITHUB_API_URL === 'https://api.github.com'
    && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_REF_TYPE === 'branch'
    && env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'GitHub main의 수동 관리 작업 안에서만 허용합니다.');
  requireCheckpoint(!env.ANDROID_DEBUG_KEYSTORE_BASE64 && !env.OTA_PRIVATE_KEY_PEM,
    '저장소 관리 작업에 Android·OTA 서명키를 전달하지 마세요.');
  requireCheckpoint(typeof env.RUNNER_TEMP === 'string' && path.isAbsolute(env.RUNNER_TEMP)
    && typeof env.HOME === 'string' && path.isAbsolute(env.HOME));
}

async function environmentMainOnly(api, repository) {
  const [environment, policies] = await Promise.all([
    api(`/repos/${repository}/environments/${ENVIRONMENT}`),
    api(`/repos/${repository}/environments/${ENVIRONMENT}/deployment-branch-policies?per_page=100`),
  ]);
  requireCheckpoint(positiveInteger(environment.id) && environment.name === ENVIRONMENT
    && environment.deployment_branch_policy?.protected_branches === false
    && environment.deployment_branch_policy?.custom_branch_policies === true
    && policies.total_count === 1 && policies.branch_policies?.length === 1
    && policies.branch_policies[0].name === 'main' && policies.branch_policies[0].type === 'branch',
  '두 저장소 Environment 모두 branch형 main 하나만 허용해야 합니다.');
  return environment.id;
}

async function prepareBoundary(api, env) {
  const [source, target, main, run] = await Promise.all([
    api(`/repositories/${SOURCE_ID}`), api(`/repositories/${TARGET_ID}`),
    api(`/repos/${SOURCE}/git/ref/heads/main`), api(`/repos/${SOURCE}/actions/runs/${env.GITHUB_RUN_ID}`),
  ]);
  for (const [repository, id, name] of [[source, SOURCE_ID, SOURCE], [target, TARGET_ID, TARGET]]) {
    requireCheckpoint(repository.id === id && repository.full_name === name && repository.private === false
      && repository.archived === false && repository.fork === false && repository.default_branch === 'main'
      && repository.owner?.id === OWNER_ID && repository.owner?.login === 'h0623-dev',
    '키 생성 전 원본 public·staging 저장소의 고정 신원이 다릅니다.');
  }
  requireCheckpoint(main.ref === 'refs/heads/main' && main.object?.type === 'commit' && main.object.sha === env.GITHUB_SHA
    && run.id === Number(env.GITHUB_RUN_ID) && run.run_attempt === Number(env.GITHUB_RUN_ATTEMPT)
    && run.repository?.id === SOURCE_ID && run.head_repository?.id === SOURCE_ID
    && run.head_branch === 'main' && run.head_sha === env.GITHUB_SHA && run.event === 'workflow_dispatch'
    && run.path === WORKFLOW && Array.isArray(run.pull_requests) && run.pull_requests.length === 0,
  '체크포인트 키 생성 작업의 현재 main·실행 출처가 다릅니다.');
  await Promise.all([environmentMainOnly(api, SOURCE), environmentMainOnly(api, TARGET)]);
}

function writeSecret(repository, name, value, token, directory, env) {
  requireCheckpoint(name === KEY_NAME && [SOURCE, TARGET].includes(repository)
    || name === CREDENTIAL_NAME && repository === TARGET,
  '체크포인트 키와 지정 대상 관리 자격증명만 등록할 수 있습니다.');
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/gh', ['secret', 'set', '--env-file', '-', '--repo', repository, '--env', ENVIRONMENT], {
      shell: false, stdio: ['pipe', 'ignore', 'ignore'], timeout: 120000,
      env: { PATH: '/usr/bin:/bin', HOME: env.HOME, TMPDIR: directory, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
        GH_TOKEN: token, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_CONFIG_DIR: path.join(directory, 'gh-config') },
    });
    child.on('error', () => reject(new Error('GitHub 내부 체크포인트 키 등록에 실패했습니다.')));
    child.on('close', code => code === 0 ? resolve() : reject(new Error('GitHub 내부 체크포인트 키 등록에 실패했습니다.')));
    child.stdin.on('error', () => {});
    // One whitelisted value, quoted stdin only. No secret in arguments/files/logs.
    child.stdin.end(`${name}=${JSON.stringify(value)}\n`);
  });
}

function sourcePrepareRuntime(env) {
  managementRuntime(env);
  requireCheckpoint(env.GITHUB_REPOSITORY === SOURCE && Number(env.GITHUB_REPOSITORY_ID) === SOURCE_ID
    && typeof env.GITHUB_SHA === 'string' && HEX40.test(env.GITHUB_SHA)
    && env.GITHUB_WORKFLOW_SHA === env.GITHUB_SHA && HEX40.test(env.CONTROL_SOURCE_REVISION)
    && /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID) && positiveInteger(Number(env.GITHUB_RUN_ID))
    && /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT) && positiveInteger(Number(env.GITHUB_RUN_ATTEMPT))
    && env.GITHUB_WORKFLOW_REF === `${SOURCE}/${WORKFLOW}@refs/heads/main`,
  '기존 public 원본의 고정 main 준비 workflow에서만 체크포인트 키를 준비합니다.');
}

export async function ensureCheckpointKey(env = process.env) {
  sourcePrepareRuntime(env);
  const token = env.CHEONSU_REPOSITORY_MIGRATION_TOKEN;
  const api = apiClient(token);
  await prepareBoundary(api, env);
  const existing = await Promise.all([SOURCE, TARGET].map(repository => api(
    `/repos/${repository}/environments/${ENVIRONMENT}/secrets/${KEY_NAME}`, 'GET', undefined, { missing: true })));
  requireCheckpoint(existing.every(item => item === null || item.name === KEY_NAME && typeof item.updated_at === 'string'),
    '기존 체크포인트 Secret 메타데이터를 읽을 수 없습니다.');
  requireCheckpoint(env[KEY_NAME] || existing.every(item => item === null),
    '기존 체크포인트 키 이름은 있지만 실행 컨텍스트에 값이 없습니다. 새 키로 덮어쓰지 않습니다.');
  const key = env[KEY_NAME] ? checkpointKey(env) : randomBytes(32);
  let directory;
  try {
    const temporary = await directoryPath(env.RUNNER_TEMP);
    directory = await mkdtemp(path.join(temporary, 'cheonsu-checkpoint-key-'));
    await mkdir(path.join(directory, 'gh-config'), { mode: 0o700 });
    for (const repository of [SOURCE, TARGET]) {
      await prepareBoundary(api, env);
      await writeSecret(repository, KEY_NAME, key.toString('base64'), token, directory, env);
      const metadata = await api(`/repos/${repository}/environments/${ENVIRONMENT}/secrets/${KEY_NAME}`);
      requireCheckpoint(metadata.name === KEY_NAME && typeof metadata.updated_at === 'string',
        '체크포인트 Secret 등록 메타데이터가 다릅니다.');
    }
    await prepareBoundary(api, env);
    return key;
  } catch {
    key.fill(0);
    throw new Error('체크포인트 키 준비가 중단됐습니다. 이미 등록한 키를 삭제·교체하지 말고 동일 원본 main에서 재개하세요.');
  } finally { if (directory) await rm(directory, { recursive: true, force: true }); }
}

// A short-lived, repository-scoped administration credential stays inside
// GitHub. Only the original public source's approved main prepare job can
// synchronize that same value to the target management Environment.
export async function syncManagementCredential(env = process.env) {
  sourcePrepareRuntime(env);
  const token = env[CREDENTIAL_NAME];
  requireCheckpoint(typeof token === 'string' && /^[A-Za-z0-9_]{20,8192}$/.test(token),
    'GitHub 내부의 기존 저장소 관리 자격증명이 필요합니다.');
  const api = apiClient(token);
  let directory;
  try {
    await prepareBoundary(api, env);
    const original = await api(`/repos/${SOURCE}/environments/${ENVIRONMENT}/secrets/${CREDENTIAL_NAME}`);
    requireCheckpoint(original.name === CREDENTIAL_NAME && typeof original.updated_at === 'string',
      '원본 Environment의 기존 관리 자격증명 메타데이터가 다릅니다.');
    const temporary = await directoryPath(env.RUNNER_TEMP);
    directory = await mkdtemp(path.join(temporary, 'cheonsu-management-credential-'));
    await mkdir(path.join(directory, 'gh-config'), { mode: 0o700 });
    await prepareBoundary(api, env);
    await writeSecret(TARGET, CREDENTIAL_NAME, token, token, directory, env);
    await prepareBoundary(api, env);
    const copied = await api(`/repos/${TARGET}/environments/${ENVIRONMENT}/secrets/${CREDENTIAL_NAME}`);
    requireCheckpoint(copied.name === CREDENTIAL_NAME && typeof copied.updated_at === 'string');
    return { schemaVersion: 1, sourceRepositoryId: SOURCE_ID, targetRepositoryId: TARGET_ID,
      environment: ENVIRONMENT, copiedSecretName: CREDENTIAL_NAME, synchronized: true };
  } catch {
    throw new Error('GitHub 내부 대상 관리 자격증명 동기화가 중단됐습니다. 원본 값은 변경·삭제하지 않습니다.');
  } finally { if (directory) await rm(directory, { recursive: true, force: true }); }
}

function downloadSpec(value) {
  exactKeys(value, SPEC);
  requireCheckpoint(typeof value.repository === 'string' && /^h0623-dev\/[A-Za-z0-9_.-]+$/.test(value.repository)
    && [SOURCE_ID, TARGET_ID].includes(value.repositoryId)
    && positiveInteger(value.runId) && positiveInteger(value.runAttempt) && positiveInteger(value.workflowId)
    && typeof value.artifactName === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(value.artifactName)
    && typeof value.workflowPath === 'string' && /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(value.workflowPath)
    && [value.workflowBlobSha, value.headSha, value.controlSha].every(item => typeof item === 'string' && HEX40.test(item)));
  return value;
}

async function inspectCheckpoint(api, spec) {
  const base = `/repos/${spec.repository}`;
  const [repository, main, run, workflow, workflowFile, artifacts] = await Promise.all([
    api(`/repositories/${spec.repositoryId}`), api(`${base}/git/ref/heads/main`),
    api(`${base}/actions/runs/${spec.runId}`), api(`${base}/actions/workflows/${spec.workflowId}`),
    api(`${base}/contents/${spec.workflowPath}?ref=${spec.headSha}`),
    api(`${base}/actions/runs/${spec.runId}/artifacts?per_page=100`),
  ]);
  requireCheckpoint(repository.id === spec.repositoryId && repository.full_name === spec.repository
    && repository.archived === false && repository.fork === false && repository.default_branch === 'main'
    && repository.owner?.id === OWNER_ID && repository.owner?.login === 'h0623-dev'
    && main.ref === 'refs/heads/main' && main.object?.type === 'commit' && main.object.sha === spec.headSha,
  '체크포인트의 저장소 객체와 현재 main이 승인된 출처와 다릅니다.');
  requireCheckpoint(run.id === spec.runId && run.run_attempt === spec.runAttempt
    && run.repository?.id === spec.repositoryId && run.head_repository?.id === spec.repositoryId
    && run.head_branch === 'main' && run.head_sha === spec.headSha && run.event === 'workflow_dispatch'
    && run.status === 'completed' && ['success', 'failure'].includes(run.conclusion)
    && Array.isArray(run.pull_requests) && run.pull_requests.length === 0
    && run.workflow_id === spec.workflowId && run.path === spec.workflowPath
    && workflow.id === spec.workflowId && workflow.path === spec.workflowPath && workflow.state === 'active'
    && workflowFile.type === 'file' && workflowFile.path === spec.workflowPath && workflowFile.sha === spec.workflowBlobSha,
  '승인된 main 수동 관리 작업의 완료 기록·attempt·workflow blob과 다릅니다.');
  requireCheckpoint(positiveInteger(artifacts.total_count) && artifacts.total_count <= 100
    && Array.isArray(artifacts.artifacts) && artifacts.artifacts.length === artifacts.total_count,
  '체크포인트 artifact 목록을 완전하게 읽지 못했습니다.');
  const matching = artifacts.artifacts.filter(item => item.name === spec.artifactName);
  requireCheckpoint(matching.length === 1, '지정한 체크포인트 artifact가 정확히 하나여야 합니다.');
  const artifact = matching[0];
  requireCheckpoint(positiveInteger(artifact.id) && artifact.expired === false
    && typeof artifact.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(artifact.digest)
    && positiveInteger(artifact.size_in_bytes) && artifact.size_in_bytes <= MAXIMUM_ARCHIVE
    && artifact.workflow_run?.id === spec.runId && artifact.workflow_run.repository_id === spec.repositoryId
    && artifact.workflow_run.head_repository_id === spec.repositoryId
    && artifact.workflow_run.head_branch === 'main' && artifact.workflow_run.head_sha === spec.headSha,
  '체크포인트 artifact의 서버 출처·SHA256·용량·만료 조건이 다릅니다.');
  const created = Date.parse(artifact.created_at);
  const started = Date.parse(run.run_started_at);
  const completed = Date.parse(run.updated_at);
  const expires = Date.parse(artifact.expires_at);
  requireCheckpoint([created, started, completed, expires].every(Number.isFinite)
    && created >= started && created <= completed && created <= Date.now() && expires > Date.now());
  return artifact;
}

function storageUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('체크포인트 저장소 다운로드 주소가 다릅니다.'); }
  const host = url.hostname.toLowerCase();
  requireCheckpoint(url.protocol === 'https:' && (!url.port || url.port === '443')
    && !url.username && !url.password && !url.hash
    && (host.endsWith('.blob.core.windows.net') || host.endsWith('.actions.githubusercontent.com')),
  '승인된 GitHub artifact 저장소 HTTPS 주소만 허용합니다.');
  return url;
}

async function artifactResponse(spec, artifact, token) {
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${spec.repository}/actions/artifacts/${artifact.id}/zip`, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Accept-Encoding': 'identity' },
    });
    for (let count = 0; [301, 302, 303, 307, 308].includes(response.status); count += 1) {
      requireCheckpoint(count < 3);
      const next = storageUrl(response.headers.get('location'));
      await response.body?.cancel();
      // The repository management credential never follows a storage redirect.
      response = await fetch(next, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(120000),
        headers: { 'Accept-Encoding': 'identity' } });
    }
  } catch { throw new Error('체크포인트 artifact 다운로드 연결 또는 목적지 정책이 다릅니다.'); }
  requireCheckpoint(response.status === 200 && response.ok && response.body,
    `체크포인트 artifact 다운로드 실패: HTTP ${response.status}`);
  const declared = response.headers.get('content-length');
  requireCheckpoint(!declared || /^[0-9]+$/.test(declared) && Number(declared) === artifact.size_in_bytes);
  return response;
}

function extractCheckpoint(archive, destination) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/python3', ['-I', archiveTool], { shell: false, stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 60000, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
    const output = [];
    let size = 0;
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 4096) child.kill('SIGKILL'); else output.push(chunk); });
    child.on('error', () => reject(new Error('고정 체크포인트 압축 도구를 실행할 수 없습니다.')));
    child.on('close', code => {
      try {
        requireCheckpoint(code === 0 && size <= 4096);
        const result = JSON.parse(Buffer.concat(output).toString('utf8'));
        exactKeys(result, ['schemaVersion', 'size']);
        requireCheckpoint(result.schemaVersion === 1 && positiveInteger(result.size) && result.size <= MAXIMUM_ARCHIVE);
        resolve();
      } catch { reject(new Error('체크포인트 압축 자료의 단일 파일·경로·용량 계약이 다릅니다.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ archive, destination }));
  });
}

export async function downloadCheckpoint(env, input, destination) {
  let directory;
  let archiveHandle;
  let key;
  try {
    managementRuntime(env);
    const spec = downloadSpec(input);
    const token = env.CHEONSU_REPOSITORY_MIGRATION_TOKEN;
    const api = apiClient(token);
    const artifact = await inspectCheckpoint(api, spec);
    key = checkpointKey(env);
    await directoryPath(destination);
    const runner = await directoryPath(env.RUNNER_TEMP);
    requireCheckpoint(destination === runner || destination.startsWith(`${runner}${path.sep}`),
      '체크포인트 다운로드는 일회 runner 임시 디렉터리 아래에만 보관합니다.');
    directory = await mkdtemp(path.join(destination, 'cheonsu-checkpoint-download-'));
    const archive = path.join(directory, 'transfer.zip');
    const file = path.join(directory, 'checkpoint.json');
    const response = await artifactResponse(spec, artifact, token);
    archiveHandle = await open(archive, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      requireCheckpoint(size <= artifact.size_in_bytes && size <= MAXIMUM_ARCHIVE);
      hash.update(chunk);
      await archiveHandle.writeFile(chunk);
    }
    await archiveHandle.close();
    archiveHandle = null;
    requireCheckpoint(size === artifact.size_in_bytes && hash.digest('hex') === artifact.digest.slice(7),
      '체크포인트 실제 다운로드의 SHA256·용량이 GitHub 서버 기록과 다릅니다.');
    await extractCheckpoint(archive, file);
    await rm(archive);
    const checkpoint = await loadCheckpoint(file, key);
    requireCheckpoint(checkpoint.header.controlSha === spec.controlSha
      && checkpoint.header.runId === spec.runId && checkpoint.header.runAttempt === spec.runAttempt,
    '인증된 체크포인트의 고정 control SHA 또는 실행 신원이 다릅니다.');
    const current = await inspectCheckpoint(api, spec);
    requireCheckpoint(current.id === artifact.id && current.digest === artifact.digest
      && current.size_in_bytes === artifact.size_in_bytes);
    return file;
  } catch {
    if (archiveHandle) await archiveHandle.close().catch(() => {});
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw new Error('승인된 GitHub 체크포인트를 가져올 수 없습니다. 원문·토큰·키는 출력하지 않습니다.');
  } finally { key?.fill(0); }
}
