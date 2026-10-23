// Pinned public administration only. Never execute a private source checkout or
// accept Android/OTA signing keys in this job. Checkpoint data is authenticated
// and restored as inert strings outside the checkout, never imported as code.
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, realpath, lstat, rename, appendFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runFreeCutover } from '../free-cutover.mjs';
import { apiClient, checkpointKey, downloadCheckpoint, loadCheckpoint, saveCheckpoint } from './checkpoint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE_ID = 1248868923;
const TARGET_ID = 1430565223;
const OWNER_ID = 261550809;
const SOURCE = 'h0623-dev/cheonsu';
const PRIVATE_SOURCE = 'h0623-dev/cheonsu-source';
const STAGING = 'h0623-dev/cheonsu-distribution-staging';
const ENVIRONMENT = 'cheonsu-release';
const ACTIVATION_SECRET = 'CHEONSU_FREE_RELEASE_ACTIVATION';
const WORKFLOW = '.github/workflows/free-repository-management.yml';
const IDENTITY_WORKFLOW = '.github/workflows/free-key-identity-preflight.yml';
const SOURCE_WORKFLOW = '.github/workflows/repository-migration-management.yml';
const ARTIFACT_TEMPLATE = 'cheonsu-free-management-{runId}-{runAttempt}';
const CONFIRMATION = 'preserve-game-data-identities-and-addresses';
const PHASES = ['staging-proof', 'cutover', 'postflight', 'finalize', 'status'];
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const MAX_ATTEMPT = 10;
const SAFE_PHASES = new Set(['not-started', 'planned', 'staging-created', 'prepared', 'staging-proof-completed',
  'cutover-starting', 'source-rename-uncertain', 'source-renamed', 'prepared-restored',
  'source-renamed-recovery-required', 'public-path-switched-unconfirmed', 'public-path-switched',
  'source-private-unconfirmed', 'source-private-awaiting-postflight', 'completed', 'completed-awaiting-activation']);
const FILE_NAMES = Object.freeze({ state: 'state.json', enrollment: 'enrollment.json', journal: 'journal.json',
  adoption: 'adoption.json', adoptionBackup: 'state.json.before-staging-adoption',
  adoptionLock: 'state.json.staging-adoption.lock', error: 'error.json' });
const sha256 = value => createHash('sha256').update(value).digest('hex');

class PublicManagementError extends Error {}
function requireManagement(condition, message) {
  if (!condition) throw new PublicManagementError(message);
}
function numeric(value, label) {
  requireManagement(/^[1-9][0-9]*$/.test(String(value)), `${label}의 실제 숫자 ID가 필요합니다.`);
  const number = Number(value);
  requireManagement(Number.isSafeInteger(number) && number > 0, `${label}의 숫자 범위를 벗어났습니다.`);
  return number;
}
function attemptNumber(value, label) {
  const number = numeric(value, label);
  requireManagement(number <= MAX_ATTEMPT, `${label} 재실행 한도를 초과했습니다. 자동 재개하지 않습니다.`);
  return number;
}
function artifactName(runId, attempt) {
  return ARTIFACT_TEMPLATE.replace('{runId}', String(runId)).replace('{runAttempt}', String(attempt));
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function safeHttpStatus(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  const match = message.match(/\bHTTP\s+([45][0-9]{2})\b/i);
  return match ? Number(match[1]) : null;
}
function safePhase(value) { return SAFE_PHASES.has(value) ? value : 'not-started'; }
function fileText(file) {
  requireManagement(file?.type === 'file' && file.encoding === 'base64' && typeof file.content === 'string', '고정 공개 workflow 파일을 읽지 못했습니다.');
  return Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8');
}

function inputs(env) {
  requireManagement(PHASES.includes(env.MANAGEMENT_PHASE), '승인된 공개 관리 단계가 아닙니다.');
  requireManagement(env.MANAGEMENT_CONFIRMATION === CONFIRMATION, '게임·저장·서명·기존 주소 보존 확인 문구가 다릅니다.');
  requireManagement(HEX40.test(env.SOURCE_EXPECTED_SHA || ''), '현재 원본 main의 전체 SHA가 필요합니다.');
  const checkpointRepositoryId = numeric(env.CHECKPOINT_REPOSITORY_ID, '체크포인트 저장소');
  requireManagement([SOURCE_ID, TARGET_ID].includes(checkpointRepositoryId), '승인된 두 저장소의 체크포인트만 복원합니다.');
  requireManagement(['true', 'false'].includes(env.OWNER_SPEND_STOP_CONFIRMED), '지출 중지 확인은 명시적인 boolean이어야 합니다.');
  return { phase: env.MANAGEMENT_PHASE, sourceSha: env.SOURCE_EXPECTED_SHA,
    checkpointRepositoryId, checkpointRunId: numeric(env.CHECKPOINT_RUN_ID, '체크포인트 run'),
    checkpointAttempt: attemptNumber(env.CHECKPOINT_RUN_ATTEMPT, '체크포인트 attempt'),
    ownerSpendStopConfirmed: env.OWNER_SPEND_STOP_CONFIRMED === 'true' };
}

async function runtime(env) {
  requireManagement(env.GITHUB_ACTIONS === 'true' && process.platform === 'linux'
    && env.GITHUB_SERVER_URL === 'https://github.com' && env.GITHUB_API_URL === 'https://api.github.com'
    && env.GITHUB_REPOSITORY_ID === String(TARGET_ID) && [STAGING, SOURCE].includes(env.GITHUB_REPOSITORY)
    && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_REF_TYPE === 'branch' && env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    && env.GITHUB_WORKFLOW_REF === `${env.GITHUB_REPOSITORY}/${WORKFLOW}@refs/heads/main`
    && HEX40.test(env.GITHUB_SHA || '') && env.GITHUB_WORKFLOW_SHA === env.GITHUB_SHA
    && HEX40.test(env.CONTROL_SOURCE_REVISION || ''), '공개 저장소 main의 고정 수동 관리 실행만 허용합니다.');
  requireManagement(!env.ANDROID_DEBUG_KEYSTORE_BASE64 && !env.OTA_PRIVATE_KEY_PEM,
    '공개 관리 작업에는 Android·OTA 서명키를 전달하지 마세요.');
  requireManagement(typeof env.RUNNER_TEMP === 'string' && path.isAbsolute(env.RUNNER_TEMP)
    && typeof env.GITHUB_WORKSPACE === 'string' && path.isAbsolute(env.GITHUB_WORKSPACE), '기존 GitHub runner 경로가 필요합니다.');
  const [runner, checkout, root] = await Promise.all([realpath(env.RUNNER_TEMP), realpath(env.GITHUB_WORKSPACE), realpath(ROOT)]);
  requireManagement(runner === env.RUNNER_TEMP && checkout === root && runner !== root && !runner.startsWith(`${root}${path.sep}`),
    '고정 공개 checkout과 별도 runner 임시 디렉터리가 필요합니다.');
  let actual;
  try {
    actual = execFileSync('/usr/bin/git', ['--no-optional-locks', 'rev-parse', 'HEAD'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 65536,
      env: { PATH: '/usr/bin:/bin', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    }).trim();
  } catch { throw new PublicManagementError('고정 공개 control checkout을 읽지 못했습니다.'); }
  requireManagement(actual === env.CONTROL_SOURCE_REVISION, '현재 실행 코드가 고정 공개 control SHA와 다릅니다.');
  return { runner, runId: numeric(env.GITHUB_RUN_ID, '현재 관리 run'),
    runAttempt: attemptNumber(env.GITHUB_RUN_ATTEMPT, '현재 관리 attempt') };
}

async function readPolicy(env, requested) {
  const file = path.join(ROOT, 'ops/free-release/contracts/management-policy.json');
  const metadata = await lstat(file);
  requireManagement(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > 0 && metadata.size <= 1024 * 1024,
    '고정 공개 관리 정책 파일이 없습니다.');
  const policy = JSON.parse(await readFile(file, 'utf8'));
  const sourceWorkflow = policy.source?.managementWorkflow;
  requireManagement(policy.schemaVersion === 1 && policy.state === 'enrolled'
    && HEX64.test(policy.preparedStateSha256)
    && policy.source?.repositoryId === SOURCE_ID && policy.source.repository === SOURCE
    && policy.source.privateRepository === PRIVATE_SOURCE && policy.source.expectedSha === requested.sourceSha
    && sourceWorkflow?.path === SOURCE_WORKFLOW && Number.isSafeInteger(sourceWorkflow.id) && sourceWorkflow.id > 0
    && HEX40.test(sourceWorkflow.blobSha) && HEX40.test(sourceWorkflow.controlCommitSha)
    && policy.distribution?.repositoryId === TARGET_ID && policy.distribution.stagingRepository === STAGING
    && policy.distribution.repository === SOURCE && policy.distribution.branch === 'main'
    && policy.distribution.environment === ENVIRONMENT
    && Array.isArray(policy.allowedOperations) && PHASES.every(phase => policy.allowedOperations.includes(phase))
    && policy.recovery?.artifactNameTemplate === ARTIFACT_TEMPLATE && policy.recovery.archiveEntry === 'checkpoint.json'
    && policy.recovery.maximumArtifactBytes === 25165824 && policy.recovery.maximumPlaintextBytes === 16777216
    && policy.recovery.schemaVersion === 1 && policy.recovery.algorithm === 'AES-256-GCM',
  '고정 공개 정책의 원본·복구 출처 계약이 아직 등록되지 않았습니다.');
  return policy;
}

async function ownBoundary(api, env, context) {
  const target = await api(`/repositories/${TARGET_ID}`);
  requireManagement(target.id === TARGET_ID && [STAGING, SOURCE].includes(target.full_name)
    && target.private === false && target.fork === false && target.archived === false
    && target.owner?.id === OWNER_ID && target.owner.login === 'h0623-dev' && target.default_branch === 'main',
  '실제 공개 배포 저장소 객체가 다릅니다.');
  const base = `/repos/${target.full_name}`;
  const [head, run, workflow, file] = await Promise.all([
    api(`${base}/git/ref/heads/main`), api(`${base}/actions/runs/${context.runId}`),
    api(`${base}/actions/workflows/free-repository-management.yml`), api(`${base}/contents/${WORKFLOW}?ref=${env.GITHUB_SHA}`),
  ]);
  requireManagement(head.ref === 'refs/heads/main' && head.object?.type === 'commit' && head.object.sha === env.GITHUB_SHA
    && run.id === context.runId && run.run_attempt === context.runAttempt && run.head_sha === env.GITHUB_SHA
    && run.repository?.id === TARGET_ID && run.head_repository?.id === TARGET_ID
    && run.head_branch === 'main' && run.event === 'workflow_dispatch' && run.status === 'in_progress' && run.conclusion === null
    && Array.isArray(run.pull_requests) && run.pull_requests.length === 0
    && run.path === WORKFLOW && run.workflow_id === workflow.id && workflow.path === WORKFLOW && workflow.state === 'active'
    && file.path === WORKFLOW && HEX40.test(file.sha)
    && fileText(file).includes(`CONTROL_SOURCE_REVISION: ${env.CONTROL_SOURCE_REVISION}`),
  '현재 공개 main·관리 workflow·실행 ID·control pin의 서버 기록이 다릅니다.');
  return { repository: target.full_name, id: workflow.id, path: WORKFLOW, blobSha: file.sha,
    controlCommitSha: env.CONTROL_SOURCE_REVISION, head: env.GITHUB_SHA };
}

async function checkpointSpec(api, requested, policy, own) {
  const repository = await api(`/repositories/${requested.checkpointRepositoryId}`);
  requireManagement(repository.id === requested.checkpointRepositoryId
    && repository.owner?.id === OWNER_ID && repository.owner?.login === 'h0623-dev', '체크포인트 소유자가 다릅니다.');
  let workflow;
  let head;
  if (repository.id === SOURCE_ID) {
    requireManagement([SOURCE, PRIVATE_SOURCE].includes(repository.full_name), '원본 체크포인트 저장소의 현재 이름이 다릅니다.');
    workflow = policy.source.managementWorkflow;
    head = policy.source.expectedSha;
  } else {
    requireManagement(repository.id === TARGET_ID && [STAGING, SOURCE].includes(repository.full_name) && repository.private === false,
      '공개 체크포인트 저장소 신원이 다릅니다.');
    workflow = own;
    head = own.head;
  }
  return { repository: repository.full_name, repositoryId: repository.id,
    runId: requested.checkpointRunId, runAttempt: requested.checkpointAttempt,
    artifactName: artifactName(requested.checkpointRunId, requested.checkpointAttempt),
    workflowPath: workflow.path, workflowId: workflow.id, workflowBlobSha: workflow.blobSha,
    headSha: head, controlSha: workflow.controlCommitSha };
}

function bindEnrollment(enrollment, stateRaw, state, policy, own, env) {
  const management = enrollment.managementWorkflow;
  const source = enrollment.sourceManagementWorkflow;
  requireManagement(object(enrollment) && enrollment.schemaVersion === 1 && enrollment.state === 'enrolled'
    && enrollment.sourceExpectedSha === policy.source.expectedSha && state.source?.head === policy.source.expectedSha
    && state.source?.id === SOURCE_ID && state.source.repository === SOURCE && state.staging?.id === TARGET_ID
    && state.staging.repository === STAGING && state.phase === 'prepared'
    && enrollment.preparedStateSha256 === policy.preparedStateSha256 && sha256(stateRaw) === enrollment.preparedStateSha256
    && enrollment.targetRepositoryId === TARGET_ID && enrollment.targetExpectedMainSha === env.GITHUB_SHA
    && enrollment.controlCommitSha === env.CONTROL_SOURCE_REVISION
    && management?.id === own.id && management.path === WORKFLOW && management.blobSha === own.blobSha
    && management.controlCommitSha === env.CONTROL_SOURCE_REVISION
    && object(enrollment.approvedPublicBlobs) && enrollment.approvedPublicBlobs[WORKFLOW]?.includes(own.blobSha),
  '인증된 준비 상태·공개 A/B SHA·관리 workflow 승인 목록이 서로 다릅니다.');
  requireManagement(source?.id === policy.source.managementWorkflow.id && source.path === policy.source.managementWorkflow.path
    && source.blobSha === policy.source.managementWorkflow.blobSha
    && source.controlCommitSha === policy.source.managementWorkflow.controlCommitSha,
  '인증된 체크포인트의 원본 관리 workflow가 고정 공개 정책과 다릅니다.');
  const installation = enrollment.publicControlInstallation;
  requireManagement(installation?.preparedStateSha256 === policy.preparedStateSha256
    && installation.sourceSha === policy.source.expectedSha
    && installation.sourceControlSha === policy.source.managementWorkflow.controlCommitSha
    && installation.controlCommitSha === env.CONTROL_SOURCE_REVISION && installation.targetMainSha === own.head,
  '인증된 공개 control 설치 기록의 원본·A/B SHA·준비 상태가 다릅니다.');
  const identity = enrollment.targetIdentityProof;
  requireManagement(identity?.path === IDENTITY_WORKFLOW && Number.isSafeInteger(identity.workflowId) && identity.workflowId > 0
    && HEX40.test(identity.blobSha), '대상 신원 확인 workflow의 승인 ID·path·blob이 없습니다.');
}

async function restoreFiles(directory, checkpoint) {
  const files = {};
  for (const [name, value] of Object.entries(checkpoint.files)) {
    requireManagement(Object.hasOwn(FILE_NAMES, name) && typeof value === 'string', '체크포인트에 허용하지 않은 복원 파일이 있습니다.');
    const file = path.join(directory, FILE_NAMES[name]);
    await writeFile(file, value, { flag: 'wx', mode: 0o600 });
    files[name] = file;
  }
  return files;
}

async function writeEnrollment(file, enrollment) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(enrollment, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await rename(temporary, file);
}

async function steadySecretNames(api, enrollment, { beforeCutover = false } = {}) {
  const [source, target] = await Promise.all([api(`/repositories/${SOURCE_ID}`), api(`/repositories/${TARGET_ID}`)]);
  requireManagement([SOURCE, PRIVATE_SOURCE].includes(source.full_name) && [STAGING, SOURCE].includes(target.full_name)
    && target.private === false, '정상 운영 자격증명의 실제 대상이 다릅니다.');
  const [sourceNames, targetNames] = await Promise.all([
    api(`/repos/${source.full_name}/actions/secrets?per_page=100`),
    api(`/repos/${target.full_name}/environments/${ENVIRONMENT}/secrets?per_page=100`),
  ]);
  for (const record of [sourceNames, targetNames]) {
    requireManagement(Array.isArray(record.secrets) && record.total_count === record.secrets.length,
      '자격증명 이름 메타데이터 전체를 읽지 못했습니다. 값은 조회하지 않습니다.');
  }
  requireManagement(Array.isArray(enrollment.requiredSourceRepositorySecrets)
    && enrollment.requiredSourceRepositorySecrets.includes('CHEONSU_SIGN_REQUEST_TOKEN')
    && enrollment.requiredSourceRepositorySecrets.every(name => sourceNames.secrets.some(item => item.name === name)),
  '원본의 공개 서명 요청 자격증명 이름이 없습니다.');
  const required = ['ANDROID_DEBUG_KEYSTORE_BASE64', 'OTA_PRIVATE_KEY_PEM', 'SOURCE_ARTIFACT_READ_TOKEN',
    'PUBLIC_RELEASE_TOKEN', 'CHEONSU_REPOSITORY_MIGRATION_TOKEN', 'CHEONSU_MIGRATION_CHECKPOINT_KEY'];
  requireManagement(Array.isArray(enrollment.requiredTargetEnvironmentSecrets)
    && required.every(name => targetNames.secrets.some(item => item.name === name))
    && enrollment.requiredTargetEnvironmentSecrets.every(name => targetNames.secrets.some(item => item.name === name)),
  '공개 Environment의 기존 서명·읽기·게시·관리·복구 자격증명 이름이 없습니다.');
  requireManagement(!beforeCutover || !targetNames.secrets.some(item => item.name === ACTIVATION_SECRET),
    '전환 완료 전 공개 서명 활성화 항목이 이미 있습니다. 이른 서명 개방을 추정 승인하지 않습니다.');
}

function matchingProof(run, identity, own, title) {
  return run?.workflow_id === identity.workflowId && run.path === IDENTITY_WORKFLOW
    && run.repository?.id === TARGET_ID && run.head_repository?.id === TARGET_ID && run.head_sha === own.head
    && run.head_branch === 'main' && run.event === 'workflow_dispatch' && run.display_title === title
    && run.run_attempt === 1 && Array.isArray(run.pull_requests) && run.pull_requests.length === 0;
}

async function identityProof(api, env, context, enrollment, phase, own) {
  const target = await api(`/repositories/${TARGET_ID}`);
  requireManagement(target.full_name === (phase === 'staging' ? STAGING : SOURCE) && target.private === false,
    '이 단계의 실제 공개 신원 확인 대상이 다릅니다.');
  const identity = enrollment.targetIdentityProof;
  const base = `/repos/${target.full_name}`;
  const [workflow, file, before, current] = await Promise.all([
    api(`${base}/actions/workflows/${identity.workflowId}`), api(`${base}/contents/${IDENTITY_WORKFLOW}?ref=${own.head}`),
    api(`${base}/actions/workflows/${identity.workflowId}/runs?event=workflow_dispatch&branch=main&per_page=100`),
    ownBoundary(api, env, context),
  ]);
  requireManagement(current.head === own.head && workflow.id === identity.workflowId && workflow.path === IDENTITY_WORKFLOW
    && workflow.state === 'active' && file.path === IDENTITY_WORKFLOW && file.sha === identity.blobSha
    && fileText(file).includes(`CONTROL_SOURCE_REVISION: ${enrollment.controlCommitSha}`)
    && Array.isArray(before.workflow_runs), '고정 공개 신원 확인 workflow가 변경됐습니다.');
  const previous = new Set(before.workflow_runs.map(run => run.id));
  const title = `cheonsu-free-identity/${phase}/${enrollment.sourceExpectedSha}/${TARGET_ID}`;
  const started = Date.now();
  await api(`${base}/actions/workflows/${identity.workflowId}/dispatches`, 'POST', {
    ref: 'main', inputs: { phase, source_expected_sha: enrollment.sourceExpectedSha, target_repository_id: String(TARGET_ID) },
  });
  let found;
  for (let count = 0; count < 180; count += 1) {
    if (!found) {
      const result = await api(`${base}/actions/workflows/${identity.workflowId}/runs?event=workflow_dispatch&branch=main&per_page=100`);
      requireManagement(Array.isArray(result.workflow_runs), '신원 확인 실행 목록을 읽지 못했습니다.');
      const candidates = result.workflow_runs.filter(run => !previous.has(run.id) && matchingProof(run, identity, own, title)
        && Number.isFinite(Date.parse(run.created_at)) && Date.parse(run.created_at) >= started - 3000);
      requireManagement(candidates.length <= 1, '같은 요청의 신원 확인 실행이 여러 개입니다. 자동 선택하지 않습니다.');
      if (candidates.length === 1) found = candidates[0].id;
    }
    if (found) {
      const run = await api(`${base}/actions/runs/${found}`);
      requireManagement(matchingProof(run, identity, own, title) && run.id === found,
        '신원 확인 실행의 서버 출처 또는 attempt가 바뀌었습니다.');
      if (run.status === 'completed') {
        requireManagement(run.conclusion === 'success' && Number.isFinite(Date.parse(run.run_started_at))
          && Date.parse(run.run_started_at) >= started - 3000 && Number.isFinite(Date.parse(run.updated_at))
          && Date.parse(run.updated_at) >= Date.parse(run.run_started_at), '새 신원 확인 작업이 성공하지 못했습니다.');
        return { runId: run.id, runAttempt: run.run_attempt, workflowId: identity.workflowId,
          path: IDENTITY_WORKFLOW, blobSha: identity.blobSha };
      }
      requireManagement(['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(run.status),
        '신원 확인 실행 상태가 예상과 다릅니다.');
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new PublicManagementError('신원 확인 대기 시간을 초과했습니다. 실행을 취소하거나 추정 완료하지 않습니다.');
}

async function journalPhase(file) {
  try { return JSON.parse(await readFile(file, 'utf8')).phase; }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

async function activateRelease(api, env, context, enrollment, journalFile) {
  const journal = JSON.parse(await readFile(journalFile, 'utf8'));
  requireManagement(journal.phase === 'completed' && journal.postCutoverProof?.runId === enrollment.postCutoverPreflightProof?.runId
    && journal.postCutoverProof?.runAttempt === enrollment.postCutoverPreflightProof?.runAttempt,
  '정확한 사후 확인과 완료 저널 없이는 신규 서명·게시를 활성화하지 않습니다.');
  const own = await ownBoundary(api, env, context);
  requireManagement(own.repository === SOURCE, '완료한 공개 배포 객체에서만 서명·게시를 활성화합니다.');
  const directory = await mkdtemp(path.join(context.runner, 'cheonsu-release-activation-gh-'));
  const started = Date.now();
  try {
    // A fixed, non-signing flag only. gh encrypts the quoted dotenv value to
    // GitHub's Environment public key; no value or credential enters arguments,
    // temporary dotenv files, stdout, stderr, or the public checkpoint.
    execFileSync('/usr/bin/gh', ['secret', 'set', '--env-file', '-', '--repo', SOURCE, '--env', ENVIRONMENT], {
      input: `${ACTIVATION_SECRET}="enabled"\n`, encoding: 'utf8', timeout: 120000, maxBuffer: 65536,
      stdio: ['pipe', 'ignore', 'ignore'], env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', HOME: env.HOME,
        GH_TOKEN: env.CHEONSU_REPOSITORY_MIGRATION_TOKEN, GH_CONFIG_DIR: directory,
        GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GIT_TERMINAL_PROMPT: '0' },
    });
  } catch { throw new PublicManagementError('완료 후 공개 서명 활성화 등록에 실패했습니다. 완료 저널로 finalize를 재개하세요.'); }
  finally { await rm(directory, { recursive: true, force: true }); }
  const metadata = await api(`/repos/${SOURCE}/environments/${ENVIRONMENT}/secrets/${ACTIVATION_SECRET}`);
  requireManagement(metadata.name === ACTIVATION_SECRET && Number.isFinite(Date.parse(metadata.updated_at))
    && Date.parse(metadata.updated_at) >= started - 5000, '공개 서명 활성화 저장 메타데이터를 확인하지 못했습니다.');
  journal.publicReleaseActivation = { name: ACTIVATION_SECRET, targetRepositoryId: TARGET_ID,
    secretUpdatedAt: metadata.updated_at, managementRunId: context.runId, managementRunAttempt: context.runAttempt };
  await writeEnrollment(journalFile, journal);
}

async function collectFiles(paths, previous) {
  const files = { ...previous };
  for (const [name, file] of Object.entries(paths)) {
    try { files[name] = await readFile(file, 'utf8'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  return files;
}

export async function publicManagement(env = process.env) {
  let context;
  let key;
  let requested;
  let output;
  let restored = {};
  let checkpointFiles = {};
  let completed = false;
  let resultingPhase = 'not-started';
  let failure = false;
  let checkpointSaved = false;
  let operation = 'runtime';
  let httpStatus = null;
  try {
    requested = inputs(env);
    context = await runtime(env);
    key = checkpointKey(env); // Decrypt existing key only; never generate/copy.
    const policy = await readPolicy(env, requested);
    const api = apiClient(env.CHEONSU_REPOSITORY_MIGRATION_TOKEN);
    const operationEnv = { ...env, GH_TOKEN: env.CHEONSU_REPOSITORY_MIGRATION_TOKEN };
    const own = await ownBoundary(api, env, context);
    const directory = await mkdtemp(path.join(context.runner, 'cheonsu-public-management-'));
    output = path.join(context.runner, `cheonsu-free-management-${context.runId}-${context.runAttempt}`, 'checkpoint.json');
    await mkdir(path.dirname(output), { mode: 0o700 });
    operation = 'recovery';
    const spec = await checkpointSpec(api, requested, policy, own);
    const incoming = await downloadCheckpoint(env, spec, directory);
    const checkpoint = await loadCheckpoint(incoming, key);
    requireManagement(checkpoint.header.sourceRepositoryId === SOURCE_ID && checkpoint.header.targetRepositoryId === TARGET_ID
      && checkpoint.header.sourceSha === requested.sourceSha, '인증된 체크포인트의 원본 스냅샷 SHA가 다릅니다.');
    checkpointFiles = checkpoint.files;
    restored = await restoreFiles(directory, checkpoint);
    requireManagement(typeof checkpointFiles.state === 'string' && typeof checkpointFiles.enrollment === 'string',
      '복구 자료에 준비 상태 또는 운영 등록이 없습니다.');
    const state = JSON.parse(checkpointFiles.state);
    const enrollment = JSON.parse(checkpointFiles.enrollment);
    bindEnrollment(enrollment, checkpointFiles.state, state, policy, own, env);
    restored.journal ||= path.join(directory, 'journal.json');
    const argumentsFor = mode => [mode, '--state', restored.state, '--enrollment', restored.enrollment, '--journal', restored.journal];
    const initialJournal = await journalPhase(restored.journal);
    if (requested.phase === 'status') {
      const status = await runFreeCutover(argumentsFor('status'), operationEnv);
      resultingPhase = safePhase(status.phase);
      if (status.phase === 'completed') {
        resultingPhase = 'completed-awaiting-activation';
        const journal = JSON.parse(await readFile(restored.journal, 'utf8'));
        const activation = journal.publicReleaseActivation;
        if (status.source?.id === SOURCE_ID && status.source.repository === PRIVATE_SOURCE && status.source.private === true
          && status.target?.id === TARGET_ID && status.target.repository === SOURCE && status.target.private === false
          && activation?.name === ACTIVATION_SECRET && activation.targetRepositoryId === TARGET_ID
          && Number.isSafeInteger(activation.managementRunId) && activation.managementRunId > 0
          && Number.isSafeInteger(activation.managementRunAttempt) && activation.managementRunAttempt > 0
          && activation.managementRunAttempt <= MAX_ATTEMPT && Number.isFinite(Date.parse(activation.secretUpdatedAt))) {
          const [metadata, activationRun] = await Promise.all([
            api(`/repos/${SOURCE}/environments/${ENVIRONMENT}/secrets/${ACTIVATION_SECRET}`, 'GET', undefined, { missing: true }),
            api(`/repos/${SOURCE}/actions/runs/${activation.managementRunId}`, 'GET', undefined, { missing: true }),
          ]);
          completed = metadata?.name === ACTIVATION_SECRET && metadata.updated_at === activation.secretUpdatedAt
            && activationRun?.id === activation.managementRunId && activationRun.run_attempt === activation.managementRunAttempt
            && activationRun.repository?.id === TARGET_ID && activationRun.head_repository?.id === TARGET_ID
            && activationRun.head_branch === 'main' && activationRun.head_sha === own.head
            && activationRun.path === WORKFLOW && activationRun.workflow_id === own.id
            && activationRun.event === 'workflow_dispatch' && activationRun.status === 'completed'
            && ['success', 'failure'].includes(activationRun.conclusion);
          if (completed) resultingPhase = 'completed';
        }
      }
    } else if (requested.phase === 'staging-proof') {
      requireManagement(initialJournal === null, '전환 저널이 있는 자료로 staging 신원 확인을 다시 시작하지 않습니다.');
      await steadySecretNames(api, enrollment, { beforeCutover: true });
      operation = 'identity';
      enrollment.targetIdentityProof = await identityProof(api, env, context, enrollment, 'staging', own);
      await writeEnrollment(restored.enrollment, enrollment);
      resultingPhase = 'staging-proof-completed';
    } else if (requested.phase === 'cutover') {
      requireManagement(initialJournal === null && requested.ownerSpendStopConfirmed,
        '새 전환은 기존 저널 없이 지출 중지 확인을 명시한 경우만 허용합니다.');
      enrollment.ownerSpendStopConfirmed = true;
      await steadySecretNames(api, enrollment, { beforeCutover: true });
      operation = 'identity';
      enrollment.targetIdentityProof = await identityProof(api, env, context, enrollment, 'staging', own);
      await writeEnrollment(restored.enrollment, enrollment);
      operation = 'cutover';
      await runFreeCutover([...argumentsFor('cutover'), '--execute-cutover'], operationEnv);
      resultingPhase = await journalPhase(restored.journal);
      requireManagement(resultingPhase === 'source-private-awaiting-postflight', '전환 후 저널이 사후 확인 대기 상태가 아닙니다.');
      operation = 'postflight';
      enrollment.postCutoverPreflightProof = await identityProof(api, env, context, enrollment, 'post-cutover', own);
      await writeEnrollment(restored.enrollment, enrollment);
      operation = 'finalize';
      await runFreeCutover([...argumentsFor('finalize'), '--execute-finalize'], operationEnv);
      resultingPhase = 'completed';
      operation = 'activation';
      await activateRelease(api, env, context, enrollment, restored.journal);
      operation = 'finalize';
      await runFreeCutover([...argumentsFor('finalize'), '--execute-finalize'], operationEnv);
      completed = true;
    } else {
      requireManagement(initialJournal === 'source-private-awaiting-postflight'
        || requested.phase === 'finalize' && initialJournal === 'completed',
        '사후 확인은 비공개 전환 완료·사후 확인 대기 저널에서만 재개합니다. status로 실제 ID부터 확인하세요.');
      await steadySecretNames(api, enrollment);
      if (initialJournal !== 'completed') {
        operation = 'postflight';
        enrollment.postCutoverPreflightProof = await identityProof(api, env, context, enrollment, 'post-cutover', own);
        await writeEnrollment(restored.enrollment, enrollment);
        resultingPhase = 'source-private-awaiting-postflight';
      }
      if (requested.phase === 'finalize') {
        operation = 'finalize';
        await runFreeCutover([...argumentsFor('finalize'), '--execute-finalize'], operationEnv);
        resultingPhase = 'completed';
        operation = 'activation';
        await activateRelease(api, env, context, enrollment, restored.journal);
        operation = 'finalize';
        await runFreeCutover([...argumentsFor('finalize'), '--execute-finalize'], operationEnv);
        completed = true;
      }
    }
  } catch (error) {
    failure = true;
    httpStatus = safeHttpStatus(error);
    // Do not include raw errors, API bodies, checkpoint contents or secrets.
    checkpointFiles.error = JSON.stringify({ schemaVersion: 1, phase: requested?.phase || 'invalid-input',
      operation, safeHttpStatus: httpStatus,
      message: '공개 관리 작업이 중단됐습니다. 실제 객체 ID와 인증된 저널을 확인한 뒤 안전한 단계에서 재개하세요.' });
  } finally {
    try {
      if (key && context && requested && output) {
        const failureRecord = failure ? checkpointFiles.error : null;
        checkpointFiles = await collectFiles(restored, checkpointFiles);
        if (failureRecord) checkpointFiles.error = failureRecord;
        const phase = restored.journal ? await journalPhase(restored.journal) : null;
        if (phase && !(requested.phase === 'status' && phase === 'completed' && !completed)) resultingPhase = safePhase(phase);
        const headerPhase = /^[a-z0-9][a-z0-9-]{0,63}$/.test(resultingPhase) ? resultingPhase : failure ? 'public-management-failed' : 'public-management-finished';
        if (Object.keys(checkpointFiles).length === 0) checkpointFiles.error = '{"message":"운영 자료를 복원하지 못했습니다."}';
        await saveCheckpoint(output, { header: { sourceRepositoryId: SOURCE_ID, targetRepositoryId: TARGET_ID,
          sourceSha: requested.sourceSha, controlSha: env.CONTROL_SOURCE_REVISION, phase: headerPhase,
          runId: context.runId, runAttempt: context.runAttempt }, files: checkpointFiles }, key);
        checkpointSaved = true;
      }
    } catch (error) { failure = true; httpStatus ??= safeHttpStatus(error); }
    key?.fill(0);
    const summary = { phase: requested?.phase || 'invalid-input', result: failure ? '중단' : requested?.phase === 'status' ? '상태 확인' : completed ? '완료' : '기록됨',
      operation, safeHttpStatus: httpStatus, sourceRepositoryId: SOURCE_ID, targetRepositoryId: TARGET_ID, resultingPhase: safePhase(resultingPhase),
      checkpointSaved, checkpointArtifact: context ? artifactName(context.runId, context.runAttempt) : null };
    if (env.GITHUB_STEP_SUMMARY) {
      await appendFile(env.GITHUB_STEP_SUMMARY, `### 천수 공개 저장소 관리\n\n${JSON.stringify(summary)}\n`).catch(() => {});
    }
    console.log(JSON.stringify(summary));
  }
  return { success: !failure, completed, checkpointSaved };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) {
    console.error('공개 관리 입력은 고정 workflow 환경변수로만 받습니다.');
    process.exitCode = 1;
  } else {
    publicManagement().then(result => { if (!result.success) process.exitCode = 1; }).catch(() => {
      console.error('공개 관리 작업이 중단됐습니다. 원문과 자격증명은 출력하지 않습니다.');
      process.exitCode = 1;
    });
  }
}
