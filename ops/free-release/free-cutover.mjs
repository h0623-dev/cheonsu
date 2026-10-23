// GitHub repository administration only. No signing keys are read here.
// Existing migration plan/prepare state is reused without changing its old
// private-Environment/Pro cutover guard. This separate cutover requires the
// public signing Environment and independently enrolled operational evidence.
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSigningIdentity, verifyEnvelope, requireRelease } from './release-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_ID = 1248868923;
const TARGET_ID = 1430565223;
const SOURCE = 'h0623-dev/cheonsu';
const PRIVATE_SOURCE = 'h0623-dev/cheonsu-source';
const STAGING = 'h0623-dev/cheonsu-distribution-staging';
const ENVIRONMENT = 'cheonsu-release';
const MANAGEMENT_WORKFLOW = '.github/workflows/free-repository-management.yml';
const ACTIVATION_SECRET = 'CHEONSU_FREE_RELEASE_ACTIVATION';
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const KEY_NAMES = ['ANDROID_DEBUG_KEYSTORE_BASE64', 'OTA_PRIVATE_KEY_PEM'];
const binaryAsset = name => /\.(?:apk|aab)$/i.test(name) || /_ota\.zip$/i.test(name);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const insideRoot = value => value === ROOT || value.startsWith(`${ROOT}${path.sep}`);

function integer(value, label) {
  requireRelease(Number.isSafeInteger(value) && value > 0, `${label}의 실제 숫자 ID가 필요합니다.`);
  return value;
}

function argsFor(argv) {
  const args = { mode: 'check', state: path.join(os.tmpdir(), 'cheonsu-release-repository-migration.json'),
    enrollment: fileURLToPath(new URL('./contracts/free-cutover-enrollment.json', import.meta.url)), execute: false, finalize: false };
  if (argv[0] && !argv[0].startsWith('--')) args.mode = argv.shift();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--execute-cutover') args.execute = true;
    else if (flag === '--execute-finalize') args.finalize = true;
    else if (['--state', '--enrollment', '--journal'].includes(flag)) {
      const value = argv[++index];
      requireRelease(value && !value.startsWith('--'), `${flag} 경로가 필요합니다.`);
      args[flag.slice(2)] = path.resolve(value);
    } else throw new Error(`지원하지 않는 인수: ${flag}`);
  }
  requireRelease(['check', 'status', 'cutover', 'finalize'].includes(args.mode), '모드는 check, status, cutover, finalize만 지원합니다.');
  args.state = path.resolve(args.state);
  args.enrollment = path.resolve(args.enrollment);
  args.journal = path.resolve(args.journal || `${args.state}.free-cutover.json`);
  requireRelease(!insideRoot(args.state) && !insideRoot(args.journal), '운영 상태와 전환 저널은 저장소 밖에 보관하세요.');
  requireRelease(args.state !== args.journal && args.state !== args.enrollment && args.enrollment !== args.journal, '상태·운영 등록·저널 경로를 분리하세요.');
  return args;
}

function enrolled(configuration, { finalizing = false } = {}) {
  requireRelease(configuration.schemaVersion === 1 && configuration.state === 'enrolled', '운영 등록 전 Free 전환 준비안입니다. 어떤 저장소도 변경하지 않습니다.');
  requireRelease(HEX40.test(configuration.sourceExpectedSha) && HEX64.test(configuration.preparedStateSha256)
    && HEX40.test(configuration.targetExpectedMainSha) && HEX40.test(configuration.controlCommitSha), '원본·대상·제어 코드·준비 상태의 고정 SHA가 필요합니다.');
  integer(configuration.targetRepositoryId, '새 공개 저장소');
  requireRelease(configuration.targetRepositoryId === TARGET_ID && configuration.targetRepositoryId !== SOURCE_ID,
    '사용자가 생성한 정확한 공개 배포 저장소 객체가 아닙니다.');
  integer(configuration.expectedReleaseCount, '공개 릴리스 수');
  integer(configuration.expectedBinaryAssetCount, '공개 바이너리 수');
  requireRelease(configuration.ownerSpendStopConfirmed === true, 'Free 사용량 초과 시 과금 중지 설정을 소유자가 확인해야 합니다. 자동 유료 전환하지 않습니다.');
  requireRelease(configuration.approvedPublicBlobs && typeof configuration.approvedPublicBlobs === 'object'
    && !Array.isArray(configuration.approvedPublicBlobs), '공개로 허용한 파일의 정확한 Git blob 목록이 필요합니다.');
  for (const [name, hashes] of Object.entries(configuration.approvedPublicBlobs)) {
    requireRelease(publicPath(name) && Array.isArray(hashes) && hashes.length > 0 && hashes.every(hash => HEX40.test(hash)), '공개 허용 파일 경로 또는 승인 blob SHA가 잘못됐습니다.');
  }
  for (const [key, expectedPath] of [
    ['sourceUnsignedWorkflow', '.github/workflows/private-unsigned-release.yml'],
    ['targetSigningWorkflow', '.github/workflows/free-sign-release.yml'],
    ['managementWorkflow', MANAGEMENT_WORKFLOW],
  ]) {
    integer(configuration[key]?.id, key);
    requireRelease(configuration[key].path === expectedPath && HEX40.test(configuration[key].blobSha), '승인된 빌드·서명 workflow의 ID/path/blob이 필요합니다.');
  }
  requireRelease(HEX40.test(configuration.managementWorkflow.controlCommitSha), '공개 관리 workflow의 별도 승인 control SHA가 필요합니다.');
  for (const [key, expectedPath] of [
    ['keyMigrationProof', '.github/workflows/migrate-signing-keys.yml'],
    ['targetIdentityProof', '.github/workflows/free-key-identity-preflight.yml'],
    ...(finalizing ? [['postCutoverPreflightProof', '.github/workflows/free-key-identity-preflight.yml']] : []),
  ]) {
    const proof = configuration[key];
    integer(proof?.runId, `${key} run`);
    integer(proof.runAttempt, `${key} attempt`);
    integer(proof.workflowId, `${key} workflow`);
    requireRelease(proof.path === expectedPath && HEX40.test(proof.blobSha), '운영 사전확인의 고정 workflow 내용이 필요합니다.');
  }
  requireRelease(HEX40.test(configuration.keyMigrationProof.controlCommitSha), 'GitHub 내부 키 이관 코드를 고정한 원본 저장소의 별도 control SHA가 필요합니다.');
  requireRelease(Array.isArray(configuration.requiredSourceRepositorySecrets)
    && configuration.requiredSourceRepositorySecrets.includes('CHEONSU_SIGN_REQUEST_TOKEN'), '원본의 최소 공개 요청 자격증명 이름이 필요합니다.');
  requireRelease(Array.isArray(configuration.requiredTargetEnvironmentSecrets)
    && [...KEY_NAMES, 'SOURCE_ARTIFACT_READ_TOKEN', 'PUBLIC_RELEASE_TOKEN'].every(name => configuration.requiredTargetEnvironmentSecrets.includes(name)), '공개 Environment의 서명·읽기·게시 자격증명 이름이 필요합니다.');
  for (const name of [...configuration.requiredSourceRepositorySecrets, ...configuration.requiredTargetEnvironmentSecrets]) {
    requireRelease(/^[A-Z][A-Z0-9_]{0,99}$/.test(name), '허용하지 않는 Secret 이름입니다.');
  }
}

function publicPath(value) {
  return ['README.md', 'AGENTS.md', 'public/updates/latest.json'].includes(value)
    || /^(?:releases|release-provenance)\/[A-Za-z0-9._-]+\.json$/.test(value)
    || /^\.github\/workflows\/(?:free-sign-release|free-key-identity-preflight|free-repository-management)\.yml$/.test(value)
    || /^ops\/free-release\/(?:authorize-request|release-contract|publish-release|key-identity-preflight|free-cutover)\.mjs$/.test(value)
    || /^ops\/free-release\/(?:policy\.json|contracts\/(?:signing-identity|free-cutover-enrollment|management-policy)\.json)$/.test(value)
    || /^ops\/free-release\/management\/(?:checkpoint|public-controller)\.mjs$/.test(value)
    || value === 'ops/free-release/management/checkpoint-archive.py'
    || /^ops\/free-release\/public\/[a-z0-9-]+\.(?:mjs|py)$/.test(value);
}

function apiClient(env) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  requireRelease(typeof token === 'string' && token.length > 0, '기존 운영 GitHub 연결의 관리 권한이 필요합니다. 토큰 값을 채팅이나 소스에 보내지 마세요.');
  return async function api(endpoint, method = 'GET', body, optional = false) {
    requireRelease(endpoint.startsWith('/repos/') || endpoint.startsWith('/repositories/'), 'GitHub 저장소 API만 사용할 수 있습니다.');
    let response;
    try {
      response = await fetch(`https://api.github.com${endpoint}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(120000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error(`GitHub ${method} 운영 연결 실패. 허용 정책을 우회하지 않습니다.`);
    }
    if (optional && method === 'GET' && response.status === 404) return null;
    requireRelease(response.ok, `GitHub ${method} 운영 접근 실패: HTTP ${response.status}`);
    if (response.status === 204) return null;
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      requireRelease(size <= 8 * 1024 * 1024, 'GitHub 운영 메타데이터 응답이 너무 큽니다.');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
}

async function pages(api, endpoint) {
  const output = [];
  for (let page = 1; page <= 100; page += 1) {
    const next = await api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    requireRelease(Array.isArray(next), '운영 목록의 전체 응답을 읽을 수 없습니다.');
    output.push(...next);
    if (next.length < 100) return output;
  }
  throw new Error('예상보다 긴 운영 목록입니다. 자동 전환하지 않습니다.');
}

async function inventory(api, repository) {
  const releases = await pages(api, `/repos/${repository}/releases`);
  const result = [];
  for (const release of releases.filter(item => !item.draft)) {
    const assets = await pages(api, `/repos/${repository}/releases/${release.id}/assets`);
    const selected = assets.filter(item => binaryAsset(item.name));
    if (!selected.length) continue;
    requireRelease(selected.every(item => item.state === 'uploaded' && path.basename(item.name) === item.name), '미완료 또는 비정상 공개 바이너리가 있습니다.');
    result.push({ id: release.id, tag: release.tag_name,
      assets: selected.map(item => ({ id: item.id, name: item.name, size: item.size,
        digest: DIGEST.test(item.digest || '') ? item.digest : null, updatedAt: item.updated_at })) });
  }
  return result;
}

function inventoryFingerprint(releases) {
  return JSON.stringify(releases.map(release => ({ id: release.id, tag: release.tag,
    assets: release.assets.map(asset => ({ id: asset.id, name: asset.name, size: asset.size,
      digest: asset.digest, updatedAt: asset.updatedAt })).sort((a, b) => a.id - b.id) })).sort((a, b) => a.id - b.id));
}

function fileContent(file) {
  requireRelease(file?.type === 'file' && file.encoding === 'base64' && typeof file.content === 'string', '원본 파일의 정확한 base64 내용을 읽을 수 없습니다.');
  return file.content.replace(/\s/g, '');
}

async function exactChannel(api, repository, state, identity) {
  const channel = await api(`/repos/${repository}/contents/latest.json?ref=updates`);
  requireRelease(fileContent(channel) === state.latest.content, '실제 signed updates/latest.json 원문이 다릅니다.');
  verifyEnvelope(JSON.parse(Buffer.from(state.latest.content, 'base64').toString('utf8')), identity, { historical: true });
  const tree = await api(`/repos/${repository}/git/trees/updates?recursive=1`);
  requireRelease(tree?.truncated === false && Array.isArray(tree.tree)
    && tree.tree.every(item => item.type === 'tree' || item.type === 'blob' && item.mode === '100644' && item.path === 'latest.json'), 'updates 브랜치에 서명 봉투 외 파일이 있습니다.');
  const legacy = await api(`/repos/${repository}/contents/public/updates/latest.json?ref=main`, 'GET', undefined, true);
  requireRelease(state.legacy ? fileContent(legacy) === state.legacy.content : legacy === null, 'legacy main/public/updates 파일의 보존 상태가 다릅니다.');
}

async function sourceUnchanged(api, state, { renamed = false, privateSource = false } = {}) {
  const source = await api(`/repositories/${SOURCE_ID}`);
  requireRelease(source.id === SOURCE_ID && source.full_name === (renamed ? PRIVATE_SOURCE : SOURCE)
    && source.private === privateSource && source.fork === false && source.default_branch === 'main', '스냅샷의 원본 객체·이름·공개 상태가 다릅니다.');
  const [head, latest, legacy, releases] = await Promise.all([
    api(`/repos/${source.full_name}/git/ref/heads/main`),
    api(`/repos/${source.full_name}/contents/latest.json?ref=updates`),
    api(`/repos/${source.full_name}/contents/public/updates/latest.json?ref=main`, 'GET', undefined, true),
    inventory(api, source.full_name),
  ]);
  requireRelease(head.object?.sha === state.source.head && latest.sha === state.latest.sha
    && fileContent(latest) === state.latest.content
    && (legacy?.sha || null) === (state.legacy?.sha || null)
    && (legacy ? fileContent(legacy) : null) === (state.legacy?.content || null)
    && inventoryFingerprint(releases) === inventoryFingerprint(state.releases), '스냅샷 이후 원본 main·릴리스·업데이트 원문이 바뀌었습니다. 새 계획이 필요합니다.');
  return source;
}

async function fullyTransferred(api, state, repository) {
  const staged = await inventory(api, repository);
  requireRelease(staged.length === state.releases.length, '공개 바이너리 릴리스 수가 다릅니다.');
  const allReleases = await pages(api, `/repos/${repository}/releases`);
  for (const release of allReleases) {
    const assets = await pages(api, `/repos/${repository}/releases/${release.id}/assets`);
    requireRelease(!release.draft && assets.every(asset => binaryAsset(asset.name)), 'staging에 미완료 릴리스·개발 ZIP·계획 외 파일이 있습니다.');
  }
  for (const release of state.releases) {
    const target = staged.find(item => item.tag === release.tag);
    requireRelease(target && target.assets.length === release.assets.length, '사전 이관 릴리스 파일이 누락됐습니다.');
    for (const asset of release.assets) {
      const actual = target.assets.find(item => item.name === asset.name);
      const copied = state.copied[String(asset.id)];
      requireRelease(actual && copied && copied.sourceAssetId === asset.id
        && copied.destinationRepositoryId === state.staging.id && actual.id === copied.destinationAssetId
        && actual.size === asset.size && copied.size === asset.size
        && DIGEST.test(copied.digest || '') && actual.digest === copied.digest
        && (!asset.digest || actual.digest === asset.digest), '사전 이관 파일의 객체·크기·SHA256 기록이 다릅니다.');
    }
  }
}

async function environmentMainOnly(api, repository) {
  const [environment, rules] = await Promise.all([
    api(`/repos/${repository}/environments/${ENVIRONMENT}`),
    api(`/repos/${repository}/environments/${ENVIRONMENT}/deployment-branch-policies?per_page=100`),
  ]);
  requireRelease(environment.name === ENVIRONMENT && environment.deployment_branch_policy?.protected_branches === false
    && environment.deployment_branch_policy?.custom_branch_policies === true
    && rules.total_count === 1 && rules.branch_policies?.length === 1
    && rules.branch_policies[0].name === 'main' && rules.branch_policies[0].type === 'branch', '공개 서명 Environment에 branch형 main 하나의 플랫폼 제한이 필요합니다.');
}

async function secretMetadata(api, repository, environment = true) {
  const endpoint = environment ? `/environments/${ENVIRONMENT}/secrets` : '/actions/secrets';
  const result = await api(`/repos/${repository}${endpoint}?per_page=100`);
  requireRelease(Number.isSafeInteger(result.total_count) && Array.isArray(result.secrets)
    && result.total_count === result.secrets.length, 'Secret 이름 메타데이터 전체를 읽을 수 없습니다. 값은 읽지 않습니다.');
  return result.secrets;
}

function requiredSecretNames(metadata, names) {
  requireRelease(names.every(name => metadata.some(item => item.name === name)), '필수 Secret 이름 메타데이터가 없습니다. GitHub 내부에서 준비하세요.');
}

async function workflow(api, repository, specification, sha) {
  const encodedPath = specification.path.split('/').map(encodeURIComponent).join('/');
  const [metadata, file] = await Promise.all([
    api(`/repos/${repository}/actions/workflows/${specification.id}`),
    api(`/repos/${repository}/contents/${encodedPath}?ref=${sha}`),
  ]);
  requireRelease(metadata.id === specification.id && metadata.path === specification.path && metadata.state === 'active'
    && file.type === 'file' && file.path === specification.path && file.sha === specification.blobSha, '승인한 workflow ID·path·내용이 바뀌었습니다.');
  return file;
}

async function proofRun(api, repository, repositoryId, head, proof, createdAfter, displayTitle, controlCommitSha) {
  const specification = { id: proof.workflowId, path: proof.path, blobSha: proof.blobSha };
  const workflowFile = await workflow(api, repository, specification, head);
  const workflowText = Buffer.from(fileContent(workflowFile), 'base64').toString('utf8');
  requireRelease(workflowText.includes(`CONTROL_SOURCE_REVISION: ${controlCommitSha}`), '운영 사전확인 workflow가 승인된 제어 코드 SHA에 고정되지 않았습니다.');
  const run = await api(`/repos/${repository}/actions/runs/${proof.runId}`);
  requireRelease(run.id === proof.runId && run.workflow_id === proof.workflowId && run.path === proof.path
    && run.repository?.id === repositoryId && run.head_repository?.id === repositoryId
    && run.head_branch === 'main' && run.head_sha === head && run.event === 'workflow_dispatch'
    && run.display_title === displayTitle
    && run.status === 'completed' && run.conclusion === 'success' && run.run_attempt === proof.runAttempt
    && Array.isArray(run.pull_requests) && run.pull_requests.length === 0
    && Number.isFinite(Date.parse(run.created_at)) && Date.parse(run.created_at) >= createdAfter
    && Number.isFinite(Date.parse(run.run_started_at)) && Date.parse(run.run_started_at) >= Date.parse(run.created_at)
    && Number.isFinite(Date.parse(run.updated_at)) && Date.parse(run.updated_at) >= Date.parse(run.run_started_at),
  '현재 main·대상 객체·승인 제어 코드에 연결된 성공 운영 사전확인이 아닙니다.');
  return run;
}

async function currentManagementRun(api, repository, enrollment, env) {
  // Ordinary CLI calls, source workflows and arbitrary public workflows never
  // acquire this exemption. Even a matching environment is only a candidate:
  // the live server run, current public main and enrolled workflow are checked
  // again at every active-run barrier, including after repository renames.
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY_ID !== String(TARGET_ID)
    || ![STAGING, SOURCE].includes(env.GITHUB_REPOSITORY)
    || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_REF_TYPE !== 'branch'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_WORKFLOW_REF !== `${env.GITHUB_REPOSITORY}/${MANAGEMENT_WORKFLOW}@refs/heads/main`) return null;
  requireRelease(env.GITHUB_SHA === enrollment.targetExpectedMainSha && env.GITHUB_WORKFLOW_SHA === env.GITHUB_SHA
    && env.CONTROL_SOURCE_REVISION === enrollment.managementWorkflow.controlCommitSha,
  '실행 중 공개 관리 main·workflow SHA·고정 control SHA가 운영 등록과 다릅니다.');
  requireRelease(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID || '') && /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT || ''),
    '현재 관리 run ID·attempt가 필요합니다.');
  const runId = integer(Number(env.GITHUB_RUN_ID), '현재 관리 run');
  const attempt = integer(Number(env.GITHUB_RUN_ATTEMPT), '현재 관리 run attempt');
  const candidate = await api(`/repos/${repository}`);
  if (candidate.id !== TARGET_ID) return null;
  const target = await api(`/repositories/${TARGET_ID}`);
  requireRelease(target.id === enrollment.targetRepositoryId && target.full_name === repository
    && [STAGING, SOURCE].includes(target.full_name) && target.private === false && target.fork === false
    && target.default_branch === 'main' && target.owner?.id === 261550809 && target.owner?.login === 'h0623-dev',
  '관리 run 예외의 실제 공개 배포 저장소 ID·이름·소유자가 다릅니다.');
  const [head, file, run] = await Promise.all([
    api(`/repos/${target.full_name}/git/ref/heads/main`),
    workflow(api, target.full_name, enrollment.managementWorkflow, enrollment.targetExpectedMainSha),
    api(`/repos/${target.full_name}/actions/runs/${runId}`),
  ]);
  const text = Buffer.from(fileContent(file), 'base64').toString('utf8');
  requireRelease(head.object?.sha === enrollment.targetExpectedMainSha
    && text.includes(`CONTROL_SOURCE_REVISION: ${enrollment.managementWorkflow.controlCommitSha}`),
  '공개 관리 workflow 또는 현재 main이 승인된 control SHA와 다릅니다.');
  requireRelease(run.id === runId && run.run_attempt === attempt && run.workflow_id === enrollment.managementWorkflow.id
    && run.path === MANAGEMENT_WORKFLOW && run.repository?.id === TARGET_ID && run.head_repository?.id === TARGET_ID
    && run.head_branch === 'main' && run.head_sha === enrollment.targetExpectedMainSha && run.event === 'workflow_dispatch'
    && run.status === 'in_progress' && run.conclusion === null
    && Array.isArray(run.pull_requests) && run.pull_requests.length === 0,
  '서버에서 현재 실행 중인 정확한 승인 관리 run 하나만 제외할 수 있습니다.');
  let actualControl;
  try {
    // No authentication or signing environment is passed to this read-only Git
    // query. The management CLI itself must come from the pinned public control
    // checkout; source/private controllers cannot supply a self-run exemption.
    actualControl = execFileSync('/usr/bin/git', ['--no-optional-locks', 'rev-parse', 'HEAD'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 65536,
      env: { PATH: '/usr/bin:/bin', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    }).trim();
  } catch { throw new Error('공개 관리 control checkout의 전체 SHA를 읽지 못했습니다.'); }
  requireRelease(actualControl === enrollment.managementWorkflow.controlCommitSha,
    '관리 도구가 승인된 공개 control commit에서 실행되지 않았습니다.');
  return { id: runId, attempt, workflowId: enrollment.managementWorkflow.id,
    head: enrollment.targetExpectedMainSha, repositoryId: TARGET_ID };
}

async function noActiveActions(api, repository, enrollment, env) {
  const management = await currentManagementRun(api, repository, enrollment, env);
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
    const result = await api(`/repos/${repository}/actions/runs?status=${status}&per_page=2`);
    requireRelease(result && Number.isSafeInteger(result.total_count) && result.total_count >= 0
      && Array.isArray(result.workflow_runs), '진행 중 Actions 목록 전체 개수를 읽을 수 없습니다.');
    if (result.total_count === 0) {
      requireRelease(result.workflow_runs.length === 0 && !(management && status === 'in_progress'),
        'Actions 실행 목록과 현재 관리 run의 서버 상태가 다릅니다.');
      continue;
    }
    const run = result.workflow_runs[0];
    requireRelease(management && status === 'in_progress' && result.total_count === 1 && result.workflow_runs.length === 1
      && run.id === management.id && run.run_attempt === management.attempt && run.workflow_id === management.workflowId
      && run.path === MANAGEMENT_WORKFLOW && run.repository?.id === management.repositoryId
      && run.head_repository?.id === management.repositoryId && run.head_branch === 'main' && run.head_sha === management.head
      && run.event === 'workflow_dispatch' && run.status === 'in_progress' && run.conclusion === null
      && Array.isArray(run.pull_requests) && run.pull_requests.length === 0,
    '승인된 현재 관리 run 외 제작·서명·운영 Actions가 진행 중입니다. 종료 후 전환하세요.');
  }
}

async function publicHistory(api, repository, enrollment, identity) {
  const [branches, tags] = await Promise.all([
    pages(api, `/repos/${repository}/branches`), pages(api, `/repos/${repository}/tags`),
  ]);
  requireRelease(branches.every(branch => ['main', 'updates', 'releases'].includes(branch.name)), '계획하지 않은 공개 branch가 있습니다.');
  const pending = [...branches.filter(branch => branch.name !== 'updates').map(branch => ({ sha: branch.commit.sha, channel: false })),
    ...tags.map(tag => ({ sha: tag.commit.sha, channel: false })),
    ...[enrollment.controlCommitSha, enrollment.managementWorkflow.controlCommitSha].map(sha => ({ sha, channel: false })),
    ...branches.filter(branch => branch.name === 'updates').map(branch => ({ sha: branch.commit.sha, channel: true }))];
  const seen = new Set();
  const signedBlobs = new Set();
  while (pending.length) {
    const { sha, channel } = pending.pop();
    requireRelease(HEX40.test(sha), '공개 Git 이력의 commit SHA가 다릅니다.');
    const visit = `${channel ? 'updates' : 'control'}:${sha}`;
    if (seen.has(visit)) continue;
    seen.add(visit);
    requireRelease(seen.size <= 4096, '공개 이력이 예상 범위를 초과했습니다. 원본 이력 노출을 막기 위해 중단합니다.');
    const commit = await api(`/repos/${repository}/git/commits/${sha}`);
    const tree = await api(`/repos/${repository}/git/trees/${commit.tree.sha}?recursive=1`);
    requireRelease(tree?.truncated === false && Array.isArray(tree.tree), '공개 Git tree 전체를 읽을 수 없습니다.');
    for (const item of tree.tree) {
      if (item.type === 'tree') continue;
      requireRelease(item.type === 'blob' && item.mode === '100644'
        && (channel ? item.path === 'latest.json' : publicPath(item.path) && enrollment.approvedPublicBlobs[item.path]?.includes(item.sha)),
      '공개 이력에 승인하지 않은 파일·소스·symlink가 있습니다.');
      if (channel && !signedBlobs.has(item.sha)) {
        const blob = await api(`/repos/${repository}/git/blobs/${item.sha}`);
        requireRelease(blob.encoding === 'base64' && typeof blob.content === 'string', '과거 updates 서명 봉투를 읽을 수 없습니다.');
        verifyEnvelope(JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8')), identity, { historical: true });
        signedBlobs.add(item.sha);
      }
    }
    pending.push(...commit.parents.map(parent => ({ sha: parent.sha, channel })));
  }
}

async function targetControl(api, enrollment) {
  const signWorkflow = await workflow(api, STAGING, enrollment.targetSigningWorkflow, enrollment.targetExpectedMainSha);
  const workflowText = Buffer.from(fileContent(signWorkflow), 'base64').toString('utf8');
  requireRelease(workflowText.includes(`CONTROL_SOURCE_REVISION: ${enrollment.controlCommitSha}`), '공개 서명 workflow가 승인된 제어 코드 SHA에 고정되지 않았습니다.');
  const controlPolicy = await api(`/repos/${STAGING}/contents/ops/free-release/policy.json?ref=${enrollment.controlCommitSha}`);
  const policy = JSON.parse(Buffer.from(fileContent(controlPolicy), 'base64').toString('utf8'));
  requireRelease(policy.schemaVersion === 1 && policy.state === 'enrolled'
    && policy.source?.repositoryId === SOURCE_ID && policy.source.repository === PRIVATE_SOURCE && policy.source.branch === 'main'
    && policy.source.workflowId === enrollment.sourceUnsignedWorkflow.id
    && policy.source.workflowPath === enrollment.sourceUnsignedWorkflow.path
    && policy.source.workflowBlobSha === enrollment.sourceUnsignedWorkflow.blobSha
    && policy.distribution?.repository === SOURCE && policy.distribution.repositoryId === enrollment.targetRepositoryId
    && policy.distribution.branch === 'main' && policy.distribution.environment === ENVIRONMENT,
  '고정 제어 정책이 실제 private 원본·public 배포 객체와 다릅니다.');
}

async function readiness(api, state, enrollment, identity, env) {
  const source = await sourceUnchanged(api, state);
  const reserved = await api(`/repos/${PRIVATE_SOURCE}`, 'GET', undefined, true);
  requireRelease(reserved === null, 'cheonsu-source 이름이 이미 사용 중입니다. 기존 저장소를 덮어쓰지 않습니다.');
  const target = await api(`/repositories/${enrollment.targetRepositoryId}`);
  requireRelease(target.id === state.staging.id && target.id !== SOURCE_ID && target.full_name === STAGING
    && target.private === false && target.fork === false && target.default_branch === 'main', '실제 공개 staging 객체가 다릅니다.');
  const targetHead = await api(`/repos/${STAGING}/git/ref/heads/main`);
  requireRelease(targetHead.object?.sha === enrollment.targetExpectedMainSha, 'staging main이 운영 등록 이후 바뀌었습니다.');
  requireRelease(state.releases.length === enrollment.expectedReleaseCount
    && state.releases.flatMap(release => release.assets).length === enrollment.expectedBinaryAssetCount, '새 스냅샷의 전체 릴리스·바이너리 수가 다릅니다.');
  await fullyTransferred(api, state, STAGING);
  await exactChannel(api, STAGING, state, identity);
  await environmentMainOnly(api, STAGING);
  await targetControl(api, enrollment);
  await publicHistory(api, STAGING, enrollment, identity);
  await workflow(api, source.full_name, enrollment.sourceUnsignedWorkflow, state.source.head);
  const createdAfter = Date.parse(state.staging.createdAt);
  requireRelease(Number.isFinite(createdAfter), 'staging 생성 시각을 확인할 수 없습니다.');
  const [copy, identityProof, sourceNames, sourceRepositorySecrets, targetNames] = await Promise.all([
    proofRun(api, source.full_name, SOURCE_ID, state.source.head, enrollment.keyMigrationProof, createdAfter,
      `cheonsu-free-key-copy/${state.source.head}/${target.id}`, enrollment.keyMigrationProof.controlCommitSha),
    proofRun(api, STAGING, target.id, enrollment.targetExpectedMainSha, enrollment.targetIdentityProof, createdAfter,
      `cheonsu-free-identity/staging/${state.source.head}/${target.id}`, enrollment.controlCommitSha),
    secretMetadata(api, source.full_name), secretMetadata(api, source.full_name, false), secretMetadata(api, STAGING),
  ]);
  requiredSecretNames(sourceNames, [...state.source.secretNames, ...KEY_NAMES]);
  requiredSecretNames(sourceRepositorySecrets, enrollment.requiredSourceRepositorySecrets);
  requiredSecretNames(targetNames, enrollment.requiredTargetEnvironmentSecrets);
  requireRelease(!targetNames.some(item => item.name === ACTIVATION_SECRET), '완료 전 공개 서명 활성화 항목이 이미 있습니다. 자동 전환하지 않습니다.');
  requireRelease(Date.parse(copy.updated_at) <= Date.parse(identityProof.run_started_at), '대상 키 신원 확인은 실제 키 이관 완료 이후여야 합니다.');
  for (const item of sourceNames.filter(item => KEY_NAMES.includes(item.name))) {
    requireRelease(Number.isFinite(Date.parse(item.updated_at)) && Date.parse(item.updated_at) <= Date.parse(copy.run_started_at), '원본 키 메타데이터가 이관 시작 후 바뀌었습니다. 이전·신원 확인을 다시 준비하세요.');
  }
  for (const item of targetNames) {
    requireRelease(Number.isFinite(Date.parse(item.updated_at)) && Date.parse(item.updated_at) <= Date.parse(identityProof.run_started_at), '대상 Environment의 키/자격증명이 신원 사전확인 시작 이후 바뀌었습니다. 다시 확인하세요.');
  }
  await noActiveActions(api, source.full_name, enrollment, env);
  await noActiveActions(api, STAGING, enrollment, env);
  return { source, target, proof: { keyMigrationRunId: copy.id, identityRunId: identityProof.id,
    keyMigrationStartedAt: copy.run_started_at, identityProofStartedAt: identityProof.run_started_at,
    identityProofAt: identityProof.updated_at, androidCertificateSha256: identity.androidCertificateSha256,
    otaPublicKeySha256: sha256(identity.otaPublicKeyPem) } };
}

async function saveJournal(file, document) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, file);
}

function enrollmentFingerprint(enrollment) {
  const { postCutoverPreflightProof: deferredProof, ...fixedEnrollment } = enrollment;
  return sha256(JSON.stringify(fixedEnrollment));
}

async function publicTargetUnchanged(api, enrollment, repository) {
  const [target, head] = await Promise.all([
    api(`/repositories/${enrollment.targetRepositoryId}`), api(`/repos/${repository}/git/ref/heads/main`),
  ]);
  requireRelease(target.full_name === repository && target.id === enrollment.targetRepositoryId
    && target.private === false && target.fork === false && target.default_branch === 'main'
    && head.object?.sha === enrollment.targetExpectedMainSha, '공개 배포 객체 또는 운영 등록 main이 전환 도중 바뀌었습니다.');
}

async function credentialMetadataUnchanged(api, state, enrollment, proof, sourceRepository = PRIVATE_SOURCE, targetRepository = SOURCE) {
  const [sourceNames, sourceRepositoryNames, targetNames] = await Promise.all([
    secretMetadata(api, sourceRepository), secretMetadata(api, sourceRepository, false), secretMetadata(api, targetRepository),
  ]);
  requiredSecretNames(sourceNames, [...state.source.secretNames, ...KEY_NAMES]);
  requiredSecretNames(sourceRepositoryNames, enrollment.requiredSourceRepositorySecrets);
  requiredSecretNames(targetNames, enrollment.requiredTargetEnvironmentSecrets);
  requireRelease(!targetNames.some(item => item.name === ACTIVATION_SECRET), '비공개 전환 전에 공개 서명 활성화 항목을 만들 수 없습니다.');
  requireRelease(sourceNames.filter(item => KEY_NAMES.includes(item.name)).every(item =>
    Number.isFinite(Date.parse(item.updated_at)) && Date.parse(item.updated_at) <= Date.parse(proof.keyMigrationStartedAt)),
  '원본 서명 키 메타데이터가 이관 시작 이후 바뀌었습니다. 전환을 중단합니다.');
  requireRelease(targetNames.every(item => Number.isFinite(Date.parse(item.updated_at))
    && Date.parse(item.updated_at) <= Date.parse(proof.identityProofStartedAt)),
  '공개 Environment의 Secret이 신원 확인 시작 이후 바뀌었습니다. 전환을 중단합니다.');
  return { sourceRepositoryId: SOURCE_ID, sourceEnvironment: ENVIRONMENT, sourceVisibility: 'public',
    sourceHead: state.source.head, checkedAt: new Date().toISOString(),
    keyMigrationRunId: proof.keyMigrationRunId, keyMigrationStartedAt: proof.keyMigrationStartedAt,
    secretMetadata: sourceNames.map(item => ({ name: item.name, updatedAt: item.updated_at })).sort((a, b) => a.name.localeCompare(b.name)),
    signingKeyDeletionPerformed: false };
}

async function cutover(api, state, enrollment, identity, args, proof, env) {
  requireRelease(args.execute, '이름·공개 범위 전환에는 --execute-cutover를 명시해야 합니다.');
  requireRelease(!existsSync(args.journal), '기존 전환 저널이 있습니다. status와 실제 객체 ID를 읽고 복구하세요. 자동 재전환하지 않습니다.');
  const journal = { schemaVersion: 1, phase: 'cutover-starting', createdAt: new Date().toISOString(),
    sourceRepositoryId: SOURCE_ID, targetRepositoryId: enrollment.targetRepositoryId, sourceHead: state.source.head,
    preparedStateSha256: enrollment.preparedStateSha256, controlCommitSha: enrollment.controlCommitSha,
    targetMain: enrollment.targetExpectedMainSha, enrollmentSha256: enrollmentFingerprint(enrollment), proof };
  const phase = async value => { journal.phase = value; journal.updatedAt = new Date().toISOString(); await saveJournal(args.journal, journal); };
  await saveJournal(args.journal, journal);
  try {
    const renamed = await api(`/repos/${SOURCE}`, 'PATCH', { name: 'cheonsu-source' });
    requireRelease(renamed.id === SOURCE_ID && renamed.full_name === PRIVATE_SOURCE && renamed.private === false, '원본 이름 변경 응답이 예상과 다릅니다.');
  } catch (error) {
    await phase('source-rename-uncertain');
    throw new Error(`${error.message} 원본 ID의 실제 이름을 읽고 복구하세요. 어떤 저장소도 비공개로 바꾸지 않았습니다.`);
  }
  await phase('source-renamed');
  try {
    const renamed = await api(`/repos/${STAGING}`, 'PATCH', { name: 'cheonsu' });
    requireRelease(renamed.id === enrollment.targetRepositoryId && renamed.full_name === SOURCE && renamed.private === false, '공개 이름 변경 응답이 예상과 다릅니다.');
  } catch (error) {
    const [sourceNow, targetNow] = await Promise.all([
      api(`/repositories/${SOURCE_ID}`), api(`/repositories/${enrollment.targetRepositoryId}`),
    ]).catch(() => [null, null]);
    if (sourceNow?.full_name === PRIVATE_SOURCE && sourceNow.private === false && targetNow?.full_name === STAGING && targetNow.private === false) {
      try {
        const restored = await api(`/repos/${PRIVATE_SOURCE}`, 'PATCH', { name: 'cheonsu' });
        requireRelease(restored.id === SOURCE_ID && restored.full_name === SOURCE && restored.private === false, '원래 공개 이름 복구 응답이 다릅니다.');
        await phase('prepared-restored');
      } catch {
        await phase('source-renamed-recovery-required');
      }
    } else await phase(targetNow?.full_name === SOURCE ? 'public-path-switched-unconfirmed' : 'source-renamed-recovery-required');
    throw new Error(`${error.message} 원본·대상 ID를 읽고 저널의 복구 상태를 따르세요. 삭제·force-push·자동 비공개 전환을 하지 않습니다.`);
  }
  await phase('public-path-switched');
  await sourceUnchanged(api, state, { renamed: true });
  await publicTargetUnchanged(api, enrollment, SOURCE);
  await fullyTransferred(api, state, SOURCE);
  await exactChannel(api, SOURCE, state, identity);
  await environmentMainOnly(api, SOURCE);
  journal.prePrivateSourceEnvironmentLease = await credentialMetadataUnchanged(api, state, enrollment, proof);
  await noActiveActions(api, PRIVATE_SOURCE, enrollment, env);
  await noActiveActions(api, SOURCE, enrollment, env);
  // Source Environment APIs can become unavailable on Free after privatizing.
  // Preserve the last successful metadata lease before visibility changes; no
  // key deletion or relocation happens in this management CLI.
  await phase('public-path-switched');
  try {
    const changed = await api(`/repos/${PRIVATE_SOURCE}`, 'PATCH', { private: true });
    requireRelease(changed.id === SOURCE_ID && changed.full_name === PRIVATE_SOURCE && changed.private === true, '원본 비공개 전환 응답이 예상과 다릅니다.');
  } catch (error) {
    await phase('source-private-unconfirmed');
    throw new Error(`${error.message} 새 공개 APK/OTA 경로는 유지합니다. 원본 ID의 visibility만 확인해 복구하며 원본을 자동 공개하거나 공개 배포 객체를 private로 바꾸지 않습니다.`);
  }
  journal.sourcePrivateAt = new Date().toISOString();
  await phase('source-private-awaiting-postflight');
  const [sourceNow, targetNow] = await Promise.all([
    api(`/repositories/${SOURCE_ID}`), api(`/repositories/${enrollment.targetRepositoryId}`),
  ]);
  requireRelease(sourceNow.full_name === PRIVATE_SOURCE && sourceNow.private === true && targetNow.full_name === SOURCE && targetNow.private === false, '전환 이후 두 저장소의 객체·공개 범위가 다릅니다. 저널 상태에서 복구하세요.');
  await exactChannel(api, SOURCE, state, identity);
  await environmentMainOnly(api, SOURCE);
  return { ...journal, completed: false,
    next: '공개 main에서 post-cutover 신원·private 읽기·공개 게시 자격증명 사전확인을 실행한 뒤, 운영 등록에 그 성공 run을 넣고 finalize --execute-finalize로 완료하세요.' };
}

async function finalize(api, state, enrollment, identity, args, env) {
  requireRelease(args.finalize, '전환 완료 기록에는 --execute-finalize를 명시해야 합니다.');
  requireRelease(existsSync(args.journal), '전환 저널이 없습니다. 실제 원본과 공개 대상의 상태부터 확인하세요.');
  const journal = JSON.parse(await readFile(args.journal, 'utf8'));
  const alreadyCompleted = journal.phase === 'completed';
  requireRelease(journal.schemaVersion === 1 && ['source-private-awaiting-postflight', 'completed'].includes(journal.phase)
    && journal.sourceRepositoryId === SOURCE_ID && journal.targetRepositoryId === enrollment.targetRepositoryId
    && journal.sourceHead === state.source.head && journal.preparedStateSha256 === enrollment.preparedStateSha256
    && journal.controlCommitSha === enrollment.controlCommitSha && journal.targetMain === enrollment.targetExpectedMainSha
    && journal.enrollmentSha256 === enrollmentFingerprint(enrollment)
    && Number.isFinite(Date.parse(journal.sourcePrivateAt)), '전환 저널·스냅샷·승인 등록이 다릅니다. 자동 완료하지 않습니다.');
  requireRelease(enrollment.postCutoverPreflightProof.workflowId === enrollment.targetIdentityProof.workflowId
    && enrollment.postCutoverPreflightProof.path === enrollment.targetIdentityProof.path
    && enrollment.postCutoverPreflightProof.blobSha === enrollment.targetIdentityProof.blobSha,
  '전환 이후 사전확인도 같은 승인된 공개 workflow여야 합니다.');
  requireRelease(!alreadyCompleted || journal.postCutoverProof?.runId === enrollment.postCutoverPreflightProof.runId
    && journal.postCutoverProof?.runAttempt === enrollment.postCutoverPreflightProof.runAttempt,
  '완료한 전환은 동일한 사후 확인 성공 기록으로만 재검증할 수 있습니다.');
  const sourceLease = journal.prePrivateSourceEnvironmentLease;
  requireRelease(sourceLease?.sourceRepositoryId === SOURCE_ID && sourceLease.sourceEnvironment === ENVIRONMENT
    && sourceLease.sourceVisibility === 'public' && sourceLease.sourceHead === state.source.head
    && sourceLease.keyMigrationRunId === journal.proof?.keyMigrationRunId
    && sourceLease.keyMigrationStartedAt === journal.proof?.keyMigrationStartedAt
    && sourceLease.signingKeyDeletionPerformed === false && Array.isArray(sourceLease.secretMetadata)
    && [...state.source.secretNames, ...KEY_NAMES].every(name => sourceLease.secretMetadata.some(item => item.name === name))
    && sourceLease.secretMetadata.filter(item => KEY_NAMES.includes(item.name)).every(item =>
      Number.isFinite(Date.parse(item.updatedAt)) && Date.parse(item.updatedAt) <= Date.parse(sourceLease.keyMigrationStartedAt))
    && Number.isFinite(Date.parse(sourceLease.checkedAt)) && Date.parse(sourceLease.checkedAt) <= Date.parse(journal.sourcePrivateAt),
  '비공개 전환 직전 원본 Environment 이름·키 메타데이터 lease가 없습니다. 키를 삭제하거나 전환 완료로 추정하지 않습니다.');
  await sourceUnchanged(api, state, { renamed: true, privateSource: true });
  await publicTargetUnchanged(api, enrollment, SOURCE);
  await fullyTransferred(api, state, SOURCE);
  await exactChannel(api, SOURCE, state, identity);
  await environmentMainOnly(api, SOURCE);
  await publicHistory(api, SOURCE, enrollment, identity);
  await workflow(api, PRIVATE_SOURCE, enrollment.sourceUnsignedWorkflow, state.source.head);
  await workflow(api, SOURCE, enrollment.targetSigningWorkflow, enrollment.targetExpectedMainSha);
  const post = await proofRun(api, SOURCE, enrollment.targetRepositoryId, enrollment.targetExpectedMainSha,
    // GitHub run.created_at has whole-second precision; the title and identity
    // workflow independently require the post-cutover private source state.
    enrollment.postCutoverPreflightProof, Math.floor(Date.parse(journal.sourcePrivateAt) / 1000) * 1000,
    `cheonsu-free-identity/post-cutover/${state.source.head}/${enrollment.targetRepositoryId}`, enrollment.controlCommitSha);
  const [sourceRepositoryNames, targetNames] = await Promise.all([
    secretMetadata(api, PRIVATE_SOURCE, false), secretMetadata(api, SOURCE),
  ]);
  requiredSecretNames(sourceRepositoryNames, enrollment.requiredSourceRepositorySecrets);
  requiredSecretNames(targetNames, enrollment.requiredTargetEnvironmentSecrets);
  requireRelease(alreadyCompleted || !targetNames.some(item => item.name === ACTIVATION_SECRET),
    '완료 기록 전에 공개 서명 활성화 항목이 있습니다. 자동 완료하지 않습니다.');
  requireRelease(targetNames.every(item => Number.isFinite(Date.parse(item.updated_at))
    && (alreadyCompleted && item.name === ACTIVATION_SECRET || Date.parse(item.updated_at) <= Date.parse(post.run_started_at))),
  '공개 Secret이 post-cutover 사전확인 시작 이후 바뀌었습니다. 다시 확인하세요.');
  await noActiveActions(api, PRIVATE_SOURCE, enrollment, env);
  await noActiveActions(api, SOURCE, enrollment, env);
  if (alreadyCompleted) return { ...journal, completed: true, revalidated: true };
  journal.phase = 'completed';
  journal.updatedAt = new Date().toISOString();
  journal.postCutoverProof = { runId: post.id, runAttempt: post.run_attempt, startedAt: post.run_started_at,
    sourcePrivateAccessVerified: true, publicContentsWriteVerified: true };
  await saveJournal(args.journal, journal);
  return { ...journal, completed: true };
}

export async function runFreeCutover(argv = process.argv.slice(2), env = process.env) {
  const args = argsFor([...argv]);
  const raw = await readFile(args.state);
  requireRelease(raw.length > 0 && raw.length <= 8 * 1024 * 1024, '준비 상태 파일 크기가 다릅니다.');
  const state = JSON.parse(raw.toString('utf8'));
  requireRelease(state.schemaVersion === 1 && state.source?.id === SOURCE_ID && state.source.repository === SOURCE
    && state.targetRepository === SOURCE && state.privateRepository === PRIVATE_SOURCE && state.stagingRepository === STAGING
    && state.staging?.repository === STAGING && Number.isSafeInteger(state.staging?.id), '기존 migration plan/prepare schema1 상태 파일이 필요합니다.');
  const api = apiClient(env);
  if (args.mode === 'status') {
    const [source, target] = await Promise.all([api(`/repositories/${SOURCE_ID}`), api(`/repositories/${state.staging.id}`)]);
    const journal = existsSync(args.journal) ? JSON.parse(await readFile(args.journal, 'utf8')) : null;
    return { mode: 'status', source: { id: source.id, repository: source.full_name, private: source.private },
      target: { id: target.id, repository: target.full_name, private: target.private }, phase: journal?.phase || state.phase,
      journal: args.journal, automaticResume: false };
  }
  const configuration = JSON.parse(await readFile(args.enrollment, 'utf8'));
  enrolled(configuration, { finalizing: args.mode === 'finalize' });
  requireRelease(!insideRoot(args.enrollment), '실제 운영 등록 파일은 저장소 밖의 경로에 복사해 사용하세요.');
  requireRelease(state.phase === 'prepared' && state.source.head === configuration.sourceExpectedSha
    && sha256(raw) === configuration.preparedStateSha256 && state.staging.id === configuration.targetRepositoryId
    && HEX40.test(state.latest?.sha) && typeof state.latest?.content === 'string'
    && Array.isArray(state.releases) && state.releases.length > 0 && state.copied && Array.isArray(state.source.secretNames), '완료된 준비 스냅샷과 운영 등록 정보가 다릅니다.');
  const identity = await readSigningIdentity();
  if (args.mode === 'finalize') return finalize(api, state, configuration, identity, args, env);
  requireRelease(!existsSync(args.journal), '기존 전환 저널이 있습니다. status로 객체 ID와 복구 상태를 먼저 확인하세요.');
  const ready = await readiness(api, state, configuration, identity, env);
  // A last source lease before the first mutation; keys stay inside GitHub.
  await sourceUnchanged(api, state);
  await publicTargetUnchanged(api, configuration, STAGING);
  await environmentMainOnly(api, STAGING);
  await credentialMetadataUnchanged(api, state, configuration, ready.proof, SOURCE, STAGING);
  await noActiveActions(api, SOURCE, configuration, env);
  await noActiveActions(api, STAGING, configuration, env);
  if (args.mode === 'cutover') return cutover(api, state, configuration, identity, args, ready.proof, env);
  return { mode: 'check', changeExecuted: false, sourceRepositoryId: SOURCE_ID,
    sourceHead: state.source.head, targetRepositoryId: configuration.targetRepositoryId,
    controlCommitSha: configuration.controlCommitSha, proof: ready.proof,
    releases: state.releases.length, binaryAssets: state.releases.flatMap(release => release.assets).length,
    next: '명시 cutover --execute-cutover 외에는 저장소 이름·공개 범위를 변경하지 않습니다.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runFreeCutover().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error instanceof Error ? error.message : 'Free 저장소 전환을 완료하지 못했습니다.');
    process.exitCode = 1;
  });
}
