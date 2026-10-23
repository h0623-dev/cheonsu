import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// This gate reads GitHub metadata only. It neither downloads nor executes the
// private artifact, reads signing secrets, signs a file, nor changes a repository.
// The workflow must load BOTH this file and policy.json from its reviewed full
// commit SHA. Loading these files from mutable main defeats that trust boundary.
const SOURCE_ID = 1248868923;
const SOURCE_REPOSITORY = 'h0623-dev/cheonsu-source';
const DISTRIBUTION_REPOSITORY = 'h0623-dev/cheonsu';
const HEX40 = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:([a-f0-9]{64})$/;
const MAXIMUM_METADATA_BYTES = 4 * 1024 * 1024;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function positiveInteger(value, message) {
  requireCondition(/^[1-9][0-9]*$/.test(String(value)), message);
  const number = Number(value);
  requireCondition(Number.isSafeInteger(number), message);
  return number;
}

function idMatches(value, expected) {
  return Number.isSafeInteger(value) && value === expected;
}

function apiReader(token) {
  requireCondition(typeof token === 'string' && token.length > 0, 'GitHub 내부의 읽기 자격증명이 필요합니다.');
  return async function get(path) {
    requireCondition(path.startsWith('/repos/'), '승인된 GitHub API 경로만 사용할 수 있습니다.');
    let response;
    try {
      response = await fetch(`https://api.github.com${path}`, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new Error('GitHub 메타데이터 연결에 실패했습니다. 접근 정책을 우회하지 않습니다.');
    }
    requireCondition(response.ok, `GitHub 메타데이터 접근 실패: HTTP ${response.status}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      requireCondition(size <= MAXIMUM_METADATA_BYTES, 'GitHub 메타데이터 응답이 허용 크기를 초과했습니다.');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new Error('GitHub 메타데이터가 JSON 형식이 아닙니다.');
    }
  };
}

function enrolledPolicy(policy) {
  requireCondition(policy.schemaVersion === 1 && policy.state === 'enrolled', '운영 등록 전 준비안입니다. 서명·이관을 활성화하지 않습니다.');
  requireCondition(policy.source?.repository === SOURCE_REPOSITORY && policy.source.repositoryId === SOURCE_ID, '기존 비공개 원본의 이름 또는 객체 ID가 다릅니다.');
  requireCondition(policy.source.branch === 'main' && policy.source.workflowPath === '.github/workflows/private-unsigned-release.yml', '원본 main의 전용 무서명 workflow만 허용합니다.');
  positiveInteger(policy.source.workflowId, '승인된 원본 workflow ID가 필요합니다.');
  requireCondition(HEX40.test(policy.source.workflowBlobSha), '승인된 무서명 workflow의 Git blob SHA가 필요합니다.');
  requireCondition(policy.distribution?.repository === DISTRIBUTION_REPOSITORY && policy.distribution.branch === 'main', '기존 공개 배포 주소와 main을 유지해야 합니다.');
  positiveInteger(policy.distribution.repositoryId, '새 공개 저장소의 실제 객체 ID가 필요합니다.');
  requireCondition(policy.distribution.repositoryId !== SOURCE_ID, '원본과 공개 배포 객체가 분리되지 않았습니다.');
  requireCondition(policy.distribution.environment === 'cheonsu-release' && policy.distribution.workflowPath === '.github/workflows/free-sign-release.yml', '공개 서명 환경 또는 workflow가 다릅니다.');
  requireCondition(policy.artifact?.namePrefix === 'cheonsu-unsigned', '전용 APK 전달 artifact만 허용합니다.');
  requireCondition(Number.isSafeInteger(policy.artifact.maximumArchiveBytes) && policy.artifact.maximumArchiveBytes > 0 && policy.artifact.maximumArchiveBytes <= 450000000, '임시 전달 artifact의 크기 상한이 다릅니다.');
}

/**
 * A successful result authorizes only the provenance stage. Archive digest,
 * unpacking, APK/OTA contracts, signing, immutable publication and channel lease
 * still need the separately reviewed signer. Re-run this stage immediately
 * before signing and publication; a stored record is never a bearer credential.
 */
export async function authorizeRequest(env = process.env) {
  const policy = JSON.parse(await readFile(new URL('./policy.json', import.meta.url), 'utf8'));
  enrolledPolicy(policy);
  const distribution = policy.distribution;
  const source = policy.source;
  // Only the protected management workflow sets this Environment-only marker
  // after the private-access postflight and explicit finalize have succeeded.
  // A repository rename alone must not open the new signing/publishing path.
  requireCondition(env.CHEONSU_FREE_RELEASE_ACTIVATION === 'enabled', '전환 후 신원 확인과 명시적 finalize가 끝나지 않았습니다. 새 서명·게시는 닫힌 상태입니다.');
  requireCondition(env.GITHUB_ACTIONS === 'true' && env.GITHUB_SERVER_URL === 'https://github.com' && env.GITHUB_API_URL === 'https://api.github.com', 'GitHub의 승인된 Actions 실행만 허용합니다.');
  requireCondition(env.GITHUB_REPOSITORY === distribution.repository && positiveInteger(env.GITHUB_REPOSITORY_ID, '현재 공개 저장소 ID가 필요합니다.') === distribution.repositoryId, '공개 서명 저장소의 실행이 아닙니다.');
  requireCondition(env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_REF_TYPE === 'branch' && env.GITHUB_EVENT_NAME === 'workflow_dispatch', '공개 main의 전용 수동/자동 dispatch 실행만 허용합니다.');
  requireCondition(env.GITHUB_WORKFLOW_REF === `${distribution.repository}/${distribution.workflowPath}@refs/heads/main`, '승인된 공개 서명 workflow 경로가 아닙니다.');
  requireCondition(HEX40.test(env.GITHUB_SHA) && env.GITHUB_WORKFLOW_SHA === env.GITHUB_SHA && HEX40.test(env.CONTROL_SOURCE_REVISION), '공개 workflow와 승인된 제어 코드의 전체 SHA가 필요합니다.');
  requireCondition(HEX40.test(env.SOURCE_SHA), '원본 main의 전체 SHA가 필요합니다.');
  const sourceRunId = positiveInteger(env.SOURCE_RUN_ID, '숫자 원본 run ID가 필요합니다.');
  const sourceRunAttempt = positiveInteger(env.SOURCE_RUN_ATTEMPT, '숫자 원본 run attempt가 필요합니다.');
  const sourceRead = apiReader(env.SOURCE_ARTIFACT_READ_TOKEN);
  const publicRead = apiReader(env.GITHUB_TOKEN);
  const sourcePath = `/repos/${source.repository}`;
  const distributionPath = `/repos/${distribution.repository}`;

  const [sourceRepository, publicRepository, sourceMain, publicMain, environment, branchPolicies, run, workflow, workflowFile] = await Promise.all([
    sourceRead(sourcePath),
    publicRead(distributionPath),
    sourceRead(`${sourcePath}/git/ref/heads/main`),
    publicRead(`${distributionPath}/git/ref/heads/main`),
    publicRead(`${distributionPath}/environments/cheonsu-release`),
    publicRead(`${distributionPath}/environments/cheonsu-release/deployment-branch-policies?per_page=100`),
    sourceRead(`${sourcePath}/actions/runs/${sourceRunId}`),
    sourceRead(`${sourcePath}/actions/workflows/${source.workflowId}`),
    sourceRead(`${sourcePath}/contents/.github/workflows/private-unsigned-release.yml?ref=${env.SOURCE_SHA}`),
  ]);
  requireCondition(idMatches(sourceRepository.id, SOURCE_ID) && sourceRepository.full_name === source.repository && sourceRepository.private === true && sourceRepository.archived === false && sourceRepository.default_branch === 'main', '비공개 원본 저장소 신원이 다릅니다.');
  requireCondition(idMatches(publicRepository.id, distribution.repositoryId) && publicRepository.full_name === distribution.repository && publicRepository.private === false && publicRepository.archived === false && publicRepository.default_branch === 'main', '공개 배포 저장소 신원이 다릅니다.');
  requireCondition(sourceMain.object?.type === 'commit' && sourceMain.object.sha === env.SOURCE_SHA, '요청된 소스가 현재 원본 main HEAD와 다릅니다.');
  requireCondition(publicMain.object?.type === 'commit' && publicMain.object.sha === env.GITHUB_SHA, '대기 중 공개 main이 변경됐습니다. 새 workflow 실행이 필요합니다.');
  requireCondition(environment.name === distribution.environment && environment.deployment_branch_policy?.protected_branches === false && environment.deployment_branch_policy?.custom_branch_policies === true, 'GitHub Environment의 선택 branch 제한이 필요합니다.');
  requireCondition(branchPolicies.total_count === 1 && branchPolicies.branch_policies?.length === 1 && branchPolicies.branch_policies[0].name === 'main' && branchPolicies.branch_policies[0].type === 'branch', 'Environment는 branch형 main 하나만 허용해야 합니다. tag·wildcard·추가 규칙은 허용하지 않습니다.');
  requireCondition(idMatches(run.id, sourceRunId) && idMatches(run.repository?.id, SOURCE_ID) && idMatches(run.head_repository?.id, SOURCE_ID), '원본 저장소 또는 fork 실행 신원이 다릅니다.');
  requireCondition(run.head_branch === 'main' && run.head_sha === env.SOURCE_SHA && run.event === 'push' && run.status === 'completed' && run.conclusion === 'success' && run.run_attempt === sourceRunAttempt, '현재 원본 main push의 완료된 성공 빌드만 허용합니다.');
  requireCondition(Array.isArray(run.pull_requests) && run.pull_requests.length === 0, 'PR 연결 실행은 서명 대상으로 받지 않습니다.');
  requireCondition(idMatches(run.workflow_id, source.workflowId) && run.path === source.workflowPath && idMatches(workflow.id, source.workflowId) && workflow.path === source.workflowPath && workflow.state === 'active', '전용 무서명 빌드 workflow와 일치하지 않습니다.');
  requireCondition(workflowFile.type === 'file' && workflowFile.path === source.workflowPath && workflowFile.sha === source.workflowBlobSha, '무서명 빌드 workflow의 승인된 내용이 변경됐습니다.');

  const artifactName = `${policy.artifact.namePrefix}-${sourceRunId}-${sourceRunAttempt}`;
  const artifacts = await sourceRead(`${sourcePath}/actions/runs/${sourceRunId}/artifacts?per_page=100`);
  requireCondition(Number.isSafeInteger(artifacts.total_count) && artifacts.total_count <= 100 && Array.isArray(artifacts.artifacts), '전달 artifact 목록을 완전하게 읽을 수 없습니다.');
  const matching = artifacts.artifacts.filter(artifact => artifact.name === artifactName);
  requireCondition(matching.length === 1, '이번 run attempt의 전달 artifact가 정확히 하나여야 합니다.');
  const artifact = matching[0];
  const artifactId = positiveInteger(artifact.id, '전달 artifact ID가 잘못됐습니다.');
  const artifactRun = artifact.workflow_run;
  requireCondition(idMatches(artifactRun?.id, sourceRunId) && idMatches(artifactRun.repository_id, SOURCE_ID) && idMatches(artifactRun.head_repository_id, SOURCE_ID) && artifactRun.head_branch === 'main' && artifactRun.head_sha === env.SOURCE_SHA, 'artifact의 서버 기록이 원본 main 빌드와 다릅니다.');
  const digest = typeof artifact.digest === 'string' ? artifact.digest.match(DIGEST) : null;
  requireCondition(artifact.expired === false && digest && Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= policy.artifact.maximumArchiveBytes, 'artifact의 만료·SHA256·크기 조건이 맞지 않습니다.');
  const createdAt = Date.parse(artifact.created_at);
  const startedAt = Date.parse(run.run_started_at);
  const expiresAt = Date.parse(artifact.expires_at);
  requireCondition(Number.isFinite(createdAt) && Number.isFinite(startedAt) && Number.isFinite(expiresAt) && createdAt >= startedAt && createdAt <= Date.now() && expiresAt > Date.now(), 'artifact가 이번 실행에서 만들어졌는지 확인할 수 없습니다.');

  return {
    schemaVersion: 1,
    scope: 'metadata-provenance-only',
    sourceRepositoryId: SOURCE_ID,
    sourceSha: env.SOURCE_SHA,
    sourceRunId,
    sourceRunAttempt,
    sourceWorkflowBlobSha: source.workflowBlobSha,
    distributionRepositoryId: distribution.repositoryId,
    controlSourceRevision: env.CONTROL_SOURCE_REVISION,
    artifactId,
    artifactName,
    artifactArchiveSha256: digest[1],
    artifactArchiveBytes: artifact.size_in_bytes,
  };
}

async function main() {
  const result = await authorizeRequest();
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `artifact_id=${result.artifactId}\nartifact_sha256=${result.artifactArchiveSha256}\nsource_sha=${result.sourceSha}\n`);
  }
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
