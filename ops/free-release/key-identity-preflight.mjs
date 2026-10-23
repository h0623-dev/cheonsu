import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  MigrationError, requireSecretFormat, githubReader, publicIdentityContract,
  verifyOtaIdentity, verifyAndroidIdentity, minimalChildEnvironment, assertEnvironmentMainOnly,
} from './public/key-identity-helpers.mjs';

// Operational readiness only: no APK/OTA signing, key export, visibility/name
// change, branch/tag update, or channel publication. The sole API write creates
// an unreferenced, harmless public metadata blob to prove Contents:write.
const SOURCE_ID = 1248868923;
const ENVIRONMENT = 'cheonsu-release';
const WORKFLOW = '.github/workflows/free-key-identity-preflight.yml';
const HEX40 = /^[a-f0-9]{40}$/;
const PHASES = Object.freeze({
  staging: { source: 'h0623-dev/cheonsu', sourcePrivate: false, target: 'h0623-dev/cheonsu-distribution-staging' },
  'post-cutover': { source: 'h0623-dev/cheonsu-source', sourcePrivate: true, target: 'h0623-dev/cheonsu' },
});

class IdentityPreflightError extends Error {}

function requireCondition(condition, message) {
  if (!condition) throw new IdentityPreflightError(message);
}

function positiveInteger(value, message) {
  requireCondition(/^[1-9][0-9]*$/.test(String(value)), message);
  const number = Number(value);
  requireCondition(Number.isSafeInteger(number), message);
  return number;
}

function controlCheckout(env) {
  requireCondition(typeof env.GITHUB_WORKSPACE === 'string' && path.isAbsolute(env.GITHUB_WORKSPACE)
    && typeof env.RUNNER_TEMP === 'string' && path.isAbsolute(env.RUNNER_TEMP)
    && typeof env.HOME === 'string' && path.isAbsolute(env.HOME), '기존 GitHub runner의 workspace·temp·HOME 설정이 필요합니다.');
  let actual;
  try {
    requireCondition(fs.realpathSync(path.join(env.GITHUB_WORKSPACE, 'ops/free-release/key-identity-preflight.mjs'))
      === fs.realpathSync(fileURLToPath(import.meta.url)), '승인된 control workspace의 신원 확인 도구만 실행할 수 있습니다.');
    actual = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
      cwd: env.GITHUB_WORKSPACE, env: minimalChildEnvironment(env, env.RUNNER_TEMP),
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 65536,
    }).toString('utf8').trim();
  } catch (error) {
    if (error instanceof IdentityPreflightError) throw error;
    throw new IdentityPreflightError('승인된 control checkout의 전체 SHA를 읽지 못했습니다.');
  }
  requireCondition(actual === env.CONTROL_SOURCE_REVISION, '실행 중인 control checkout이 승인된 전체 SHA와 다릅니다.');
}

async function sourceTrust(read, source, sha, contract) {
  const file = await read(`/repos/${source}/contents/src/data/updateTrust.json?ref=${sha}`);
  requireCondition(file.type === 'file' && file.path === 'src/data/updateTrust.json' && file.encoding === 'base64'
    && typeof file.content === 'string' && file.size > 0 && file.size <= 16384, '현재 원본 main의 공개 신뢰 계약을 읽지 못했습니다.');
  let trust;
  try { trust = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); }
  catch { throw new IdentityPreflightError('원본 공개 신뢰 계약의 JSON 형식이 올바르지 않습니다.'); }
  requireCondition(trust.repository === contract.repository && trust.manifestUrl === contract.manifestUrl
    && trust.minNativeVersion === contract.minNativeVersion, '원본의 기존 공개 OTA 경로 또는 native 지원 계약과 다릅니다.');
  return trust;
}

async function provePublicWrite(env, phase, target, targetId, publicHead, runId, attempt) {
  const token = env.PUBLIC_RELEASE_TOKEN;
  const read = githubReader(token);
  const repository = await read(`/repos/${target}`);
  requireCondition(repository.id === targetId && repository.full_name === target && repository.private === false
    && repository.permissions?.push === true, '공개 게시 자격증명의 대상 ID·public·쓰기 권한이 다릅니다.');
  const content = JSON.stringify({
    schemaVersion: 1, purpose: 'cheonsu-free-public-contents-readiness',
    phase, sourceRepositoryId: SOURCE_ID, sourceSha: env.SOURCE_EXPECTED_SHA,
    targetRepositoryId: targetId, publicHead, runId, runAttempt: attempt,
  });
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${target}/git/blobs`, {
      method: 'POST', redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ content, encoding: 'utf-8' }), signal: AbortSignal.timeout(30000),
    });
  } catch { throw new IdentityPreflightError('공개 Contents 쓰기 접근에 실패했습니다. 원문 응답을 출력하지 않습니다.'); }
  requireCondition(response.status === 201, `공개 Contents 쓰기 접근 실패: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    requireCondition(size <= 65536, '공개 쓰기 메타데이터의 크기가 허용 범위를 초과했습니다.');
    chunks.push(chunk);
  }
  let blob;
  try { blob = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new IdentityPreflightError('공개 쓰기 메타데이터가 올바른 JSON이 아닙니다.'); }
  requireCondition(HEX40.test(blob.sha), '공개 Contents 쓰기의 실제 blob 식별값이 없습니다.');
  return blob.sha;
}

async function assertBoundary(sourceRead, publicRead, phase, targetId, env, runId, attempt) {
  const configuration = PHASES[phase];
  const [source, target, sourceHead, publicHead, actions, run, workflow] = await Promise.all([
    sourceRead(`/repos/${configuration.source}`),
    publicRead(`/repos/${configuration.target}`),
    sourceRead(`/repos/${configuration.source}/git/ref/heads/main`),
    publicRead(`/repos/${configuration.target}/git/ref/heads/main`),
    sourceRead(`/repos/${configuration.source}/actions/runs?per_page=1`),
    publicRead(`/repos/${configuration.target}/actions/runs/${runId}`),
    publicRead(`/repos/${configuration.target}/actions/workflows/free-key-identity-preflight.yml`),
    assertEnvironmentMainOnly(publicRead, configuration.target),
  ]);
  requireCondition(source.id === SOURCE_ID && source.full_name === configuration.source
    && source.private === configuration.sourcePrivate && source.archived === false
    && source.fork === false && source.default_branch === 'main', '이 단계의 원본 저장소 신원 또는 공개 범위가 다릅니다.');
  requireCondition(target.id === targetId && target.id !== SOURCE_ID && target.full_name === configuration.target
    && target.private === false && target.archived === false && target.fork === false && target.default_branch === 'main',
  '이 단계의 공개 저장소 신원·실제 ID·공개 범위가 다릅니다.');
  requireCondition(sourceHead.object?.type === 'commit' && sourceHead.object.sha === env.SOURCE_EXPECTED_SHA,
    '현재 원본 main SHA가 운영 요청과 다릅니다.');
  requireCondition(publicHead.object?.type === 'commit' && publicHead.object.sha === env.GITHUB_SHA,
    '실행 중 공개 main이 변경됐습니다. 새 운영 실행이 필요합니다.');
  requireCondition(Number.isSafeInteger(actions.total_count) && actions.total_count >= 0 && Array.isArray(actions.workflow_runs),
    '원본 Actions 읽기 API에 실제로 접근하지 못했습니다.');
  const title = `cheonsu-free-identity/${phase}/${env.SOURCE_EXPECTED_SHA}/${targetId}`;
  requireCondition(run.id === runId && run.run_attempt === attempt && run.event === 'workflow_dispatch'
    && run.head_branch === 'main' && run.head_sha === env.GITHUB_SHA && run.display_title === title
    && run.repository?.id === targetId && run.head_repository?.id === targetId
    && run.path === WORKFLOW && run.status === 'in_progress'
    && Number.isSafeInteger(run.workflow_id) && workflow.id === run.workflow_id
    && workflow.path === WORKFLOW && workflow.state === 'active',
  '실제 서버 run의 이름·단계·소스 SHA·대상 ID·main workflow가 운영 요청과 다릅니다.');
  return { title, workflowId: workflow.id, publicHead: publicHead.object.sha };
}

export async function keyIdentityPreflight(env = process.env) {
  const phase = env.KEY_IDENTITY_PHASE;
  requireCondition(Object.hasOwn(PHASES, phase), 'staging 또는 post-cutover 단계만 허용합니다.');
  const configuration = PHASES[phase];
  const targetId = positiveInteger(env.TARGET_REPOSITORY_ID, '대상의 실제 숫자 저장소 ID가 필요합니다.');
  const runId = positiveInteger(env.GITHUB_RUN_ID, '실제 GitHub 운영 run ID가 필요합니다.');
  const attempt = positiveInteger(env.GITHUB_RUN_ATTEMPT, '실제 GitHub 운영 run attempt가 필요합니다.');
  requireCondition(targetId !== SOURCE_ID, '원본과 다른 공개 저장소 ID가 필요합니다.');
  requireCondition(env.GITHUB_ACTIONS === 'true' && process.platform === 'linux'
    && env.GITHUB_SERVER_URL === 'https://github.com' && env.GITHUB_API_URL === 'https://api.github.com',
  '표준 Linux GitHub Actions 안에서만 공개 키 신원을 확인할 수 있습니다.');
  requireCondition(env.GITHUB_REPOSITORY === configuration.target
    && positiveInteger(env.GITHUB_REPOSITORY_ID, '현재 공개 저장소 ID가 필요합니다.') === targetId
    && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_REF_TYPE === 'branch'
    && env.GITHUB_EVENT_NAME === 'workflow_dispatch', '이 단계의 공개 main 수동 운영 실행이 아닙니다.');
  requireCondition(env.GITHUB_WORKFLOW_REF === `${configuration.target}/${WORKFLOW}@refs/heads/main`
    && HEX40.test(env.SOURCE_EXPECTED_SHA) && HEX40.test(env.GITHUB_SHA)
    && env.GITHUB_WORKFLOW_SHA === env.GITHUB_SHA && HEX40.test(env.CONTROL_SOURCE_REVISION),
  '현재 공개 main의 전용 workflow 및 승인된 전체 SHA가 필요합니다.');
  controlCheckout(env);
  requireSecretFormat('ANDROID_DEBUG_KEYSTORE_BASE64', env.ANDROID_DEBUG_KEYSTORE_BASE64);
  requireSecretFormat('OTA_PRIVATE_KEY_PEM', env.OTA_PRIVATE_KEY_PEM);
  const sourceRead = githubReader(env.SOURCE_ARTIFACT_READ_TOKEN);
  const publicRead = githubReader(env.GITHUB_TOKEN);
  const contract = publicIdentityContract();
  const boundary = await assertBoundary(sourceRead, publicRead, phase, targetId, env, runId, attempt);
  const trust = await sourceTrust(sourceRead, configuration.source, env.SOURCE_EXPECTED_SHA, contract);
  const otaFingerprint = verifyOtaIdentity(env.OTA_PRIVATE_KEY_PEM, contract, trust);
  const directory = fs.mkdtempSync(path.join(env.RUNNER_TEMP, 'cheonsu-public-key-identity-'));
  fs.chmodSync(directory, 0o700);
  try {
    const androidFingerprint = verifyAndroidIdentity(env.ANDROID_DEBUG_KEYSTORE_BASE64, contract, directory, env);
    const proofBlobSha = await provePublicWrite(env, phase, configuration.target, targetId, boundary.publicHead, runId, attempt);
    await assertBoundary(sourceRead, publicRead, phase, targetId, env, runId, attempt);
    const record = {
      schemaVersion: 1, purpose: 'cheonsu-free-key-identity-readiness', phase,
      sourceRepository: configuration.source, sourceRepositoryId: SOURCE_ID, sourceSha: env.SOURCE_EXPECTED_SHA,
      targetRepository: configuration.target, targetRepositoryId: targetId, environment: ENVIRONMENT,
      publicHead: boundary.publicHead, controlRevision: env.CONTROL_SOURCE_REVISION,
      workflowPath: WORKFLOW, workflowId: boundary.workflowId, runId, runAttempt: attempt,
      displayTitle: boundary.title,
      publicIdentity: { androidCertificateSha256: androidFingerprint, otaPublicKeySha256: otaFingerprint },
      targetIdentityVerified: true, publicEnvironmentMainPolicyVerified: true,
      sourceActionsEndpointReadable: true, sourceContentsEndpointReadable: true,
      // A public-source staging read does not prove access after privatization.
      sourcePrivateAccessVerified: configuration.sourcePrivate,
      publicContentsWriteVerified: true, publicWriteProofBlobSha: proofBlobSha,
      signingOrPublicationPerformed: false, cutoverAuthorized: false,
      completedAt: new Date().toISOString(),
    };
    if (env.GITHUB_STEP_SUMMARY) {
      // Only already-public fingerprints, object IDs and source identifiers.
      // No raw API responses, secret metadata values, keys or ciphertext.
      fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
        `### GitHub 내부 서명 신원·권한 준비 확인\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n\n서명·공개 배포·저장소 전환은 수행하지 않았습니다.\n`);
    }
    return record;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireCondition(process.argv.length === 2, '키·토큰·운영 값은 CLI 인자로 받지 않습니다.');
    console.log(JSON.stringify(await keyIdentityPreflight(), null, 2));
  } catch (error) {
    console.error(error instanceof IdentityPreflightError || error instanceof MigrationError
      ? error.message : 'GitHub 내부 키 신원 확인이 중단됐습니다. 원문 예외·키·API 응답은 출력하지 않습니다.');
    process.exitCode = 1;
  }
}
