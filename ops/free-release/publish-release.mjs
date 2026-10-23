import { createHash, createVerify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeRequest } from './authorize-request.mjs';
import { compareVersions, hashFile, readJsonFile, readSigningIdentity, requireRelease, verifyEnvelope } from './release-contract.mjs';

const REPOSITORY = 'h0623-dev/cheonsu';
const RECORD_BRANCH = 'releases';
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const jsonBytes = value => `${JSON.stringify(value, null, 2)}\n`;

function github(token) {
  requireRelease(typeof token === 'string' && token.length > 0, '공개 저장소 전용 게시 자격증명이 필요합니다.');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  async function api(endpoint, method = 'GET', body, { missing = false } = {}) {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${endpoint}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (missing && method === 'GET' && response.status === 404) return null;
    requireRelease(response.ok, `공개 게시 API 실패: ${method} HTTP ${response.status}`);
    if (response.status === 204) return null;
    const text = await response.text();
    requireRelease(text.length <= 4 * 1024 * 1024, '공개 게시 메타데이터 응답이 너무 큽니다.');
    return JSON.parse(text);
  }
  async function upload(releaseId, file) {
    const response = await fetch(`https://uploads.github.com/repos/${REPOSITORY}/releases/${releaseId}/assets?name=${encodeURIComponent(file.name)}`, {
      method: 'POST', redirect: 'error', headers: { ...headers, 'Content-Type': file.type, 'Content-Length': String(file.size) },
      body: createReadStream(file.path), duplex: 'half', signal: AbortSignal.timeout(900000),
    });
    requireRelease(response.ok, `공개 배포 파일 업로드 실패: HTTP ${response.status}`);
    return response.json();
  }
  return { api, upload };
}

async function releaseDirectory(env) {
  requireRelease(env.RUNNER_TEMP && env.CHEONSU_RELEASE_OUTPUT, 'GitHub runner의 전용 배포 디렉터리가 필요합니다.');
  const base = await realpath(env.RUNNER_TEMP);
  const directory = await realpath(env.CHEONSU_RELEASE_OUTPUT);
  requireRelease(directory.startsWith(`${base}${path.sep}`), '배포 파일은 runner 임시 디렉터리 안에 있어야 합니다.');
  return directory;
}

async function fileContract(directory, entry) {
  const full = path.join(directory, entry.name);
  const info = await lstat(full);
  requireRelease(info.isFile() && !info.isSymbolicLink() && info.size === entry.size, '최종 배포 파일의 종류 또는 크기가 다릅니다.');
  requireRelease(await hashFile(full) === entry.sha256, '최종 배포 파일이 서명 이후 변경됐습니다.');
  return { ...entry, path: full, type: entry.name.endsWith('.apk') ? 'application/vnd.android.package-archive' : 'application/zip' };
}

async function verifyPublicFile(url, file) {
  // Public download verification is a mandatory production publishing guard.
  // No API token is attached to the request or any CDN redirect.
  const response = await fetch(url, {
    method: 'GET', redirect: 'follow', headers: { 'Accept-Encoding': 'identity' },
    signal: AbortSignal.timeout(900000),
  });
  requireRelease(response.ok && response.body, `공개 APK/OTA 다운로드 실패: HTTP ${response.status}`);
  const digest = createHash('sha256');
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    requireRelease(size <= file.size, '공개 다운로드 파일이 승인된 크기를 초과했습니다.');
    digest.update(chunk);
  }
  requireRelease(size === file.size && digest.digest('hex') === file.sha256, '공개 다운로드의 실제 크기·SHA256이 최종 서명 파일과 다릅니다. 채널을 변경하지 않습니다.');
}

function parsedFeed(content, identity) {
  requireRelease(content?.type === 'file' && content.encoding === 'base64' && content.size > 0 && content.size <= 32000 && HEX40.test(content.sha), '사전 이관한 실제 서명 채널이 필요합니다.');
  const bytes = Buffer.from(content.content, 'base64');
  requireRelease(bytes.byteLength === content.size && bytes.byteLength <= 32000, '실제 채널 봉투의 크기가 다릅니다.');
  const envelope = JSON.parse(bytes.toString('utf8'));
  return { envelope, manifest: verifyEnvelope(envelope, identity, { historical: true }), bytes };
}

function assertChannelAdvance(previous, manifest, envelope) {
  const order = compareVersions(manifest.version, previous.manifest.version);
  requireRelease(order >= 0, '실제 OTA 채널을 이전 버전으로 낮출 수 없습니다.');
  if (order === 0) requireRelease(previous.envelope.payload === envelope.payload && previous.envelope.signature === envelope.signature, '같은 버전의 서명 안내를 덮어쓸 수 없습니다.');
}

async function metadataCommit(api, record) {
  const tag = `v${record.version}`;
  const recordPath = `releases/${record.version}.json`;
  const content = jsonBytes(record);
  const existingTag = await api(`/git/ref/tags/${tag}`, 'GET', undefined, { missing: true });
  if (existingTag) {
    requireRelease(existingTag.object?.type === 'commit' && HEX40.test(existingTag.object.sha), '공개 배포 태그가 metadata commit을 가리키지 않습니다.');
    const existing = await api(`/contents/${recordPath}?ref=${tag}`);
    requireRelease(existing?.encoding === 'base64' && Buffer.from(existing.content, 'base64').toString('utf8') === content, '같은 공개 버전의 소스·파일 기록이 다릅니다.');
    return existingTag.object.sha;
  }
  const branch = await api(`/git/ref/heads/${RECORD_BRANCH}`, 'GET', undefined, { missing: true });
  let baseTree;
  const parents = [];
  if (branch) {
    requireRelease(branch.object?.type === 'commit' && HEX40.test(branch.object.sha), '공개 배포 기록 branch가 다릅니다.');
    parents.push(branch.object.sha);
    const commit = await api(`/git/commits/${branch.object.sha}`);
    baseTree = commit.tree.sha;
    const tree = await api(`/git/trees/${baseTree}?recursive=1`);
    requireRelease(tree.truncated === false && Array.isArray(tree.tree) && tree.tree.every(entry => entry.type === 'tree' ? entry.path === 'releases' : entry.type === 'blob' && /^releases\/\d{1,5}\.\d{1,5}\.\d{1,5}\.json$/.test(entry.path) && entry.size <= 128 * 1024), '공개 배포 기록 branch에 허용되지 않은 파일이 있습니다.');
    const existing = tree.tree.find(entry => entry.path === recordPath);
    if (existing) {
      const file = await api(`/contents/${recordPath}?ref=${RECORD_BRANCH}`);
      requireRelease(file?.encoding === 'base64' && Buffer.from(file.content, 'base64').toString('utf8') === content, '같은 버전의 공개 기록을 덮어쓸 수 없습니다.');
      await api('/git/refs', 'POST', { ref: `refs/tags/${tag}`, sha: branch.object.sha });
      return branch.object.sha;
    }
  }
  const blob = await api('/git/blobs', 'POST', { content, encoding: 'utf-8' });
  const tree = await api('/git/trees', 'POST', { ...(baseTree ? { base_tree: baseTree } : {}), tree: [{ path: recordPath, mode: '100644', type: 'blob', sha: blob.sha }] });
  const commit = await api('/git/commits', 'POST', { message: `천수 ${record.version} 공개 배포 기록 [skip ci]`, tree: tree.sha, parents });
  if (branch) await api(`/git/refs/heads/${RECORD_BRANCH}`, 'PATCH', { sha: commit.sha, force: false });
  else await api('/git/refs', 'POST', { ref: `refs/heads/${RECORD_BRANCH}`, sha: commit.sha });
  await api('/git/refs', 'POST', { ref: `refs/tags/${tag}`, sha: commit.sha });
  return commit.sha;
}

export async function publishRelease(env = process.env) {
  // The signing step must not export key values through GITHUB_ENV. The
  // publication step gets only scoped API credentials and public signed files.
  requireRelease(!env.ANDROID_DEBUG_KEYSTORE_BASE64 && !env.OTA_PRIVATE_KEY_PEM, '게시 단계에는 서명 개인키를 전달하지 않습니다.');
  const approved = await authorizeRequest(env);
  const identity = await readSigningIdentity();
  const directory = await releaseDirectory(env);
  const publication = await readJsonFile(path.join(directory, 'publication.json'));
  requireRelease(publication.schemaVersion === 1 && publication.sourceSha === approved.sourceSha
    && publication.sourceRunId === approved.sourceRunId && publication.sourceRunAttempt === approved.sourceRunAttempt
    && publication.sourceArtifactId === approved.artifactId, '게시 자료의 원본 SHA·run·attempt·artifact가 승인된 빌드와 다릅니다.');
  const reauthorize = async () => {
    const current = await authorizeRequest(env);
    for (const key of ['sourceSha', 'sourceRunId', 'sourceRunAttempt', 'artifactId', 'artifactArchiveSha256', 'artifactArchiveBytes', 'sourceWorkflowBlobSha', 'distributionRepositoryId', 'controlSourceRevision']) {
      requireRelease(current[key] === approved[key], '게시 중 승인된 원본 또는 전달 artifact가 변경됐습니다.');
    }
  };
  const manifest = verifyEnvelope(publication.envelope, identity);
  requireRelease(publication.version === manifest.version && JSON.stringify(publication.manifest) === JSON.stringify(manifest) && publication.nativeVersionCode === manifest.maxNativeVersion && publication.minNativeVersion === manifest.minNativeVersion && publication.maxNativeVersion === manifest.maxNativeVersion, '게시 자료와 서명된 호환 범위가 다릅니다.');
  const localEnvelope = await readJsonFile(path.join(directory, 'latest.json'), 32000);
  requireRelease(localEnvelope.payload === publication.envelope.payload && localEnvelope.signature === publication.envelope.signature, '서명 안내 파일이 최종 게시 자료와 다릅니다.');
  const names = [`cheonsu_${manifest.version}_ota.zip`, `cheonsu_${manifest.version}_update_debug.apk`].sort();
  requireRelease(Array.isArray(publication.files) && publication.files.length === 2 && [...publication.files.map(file => file.name)].sort().every((name, index) => name === names[index]), '공개 배포에는 해당 APK와 서명 OTA 두 파일만 허용합니다.');
  const files = [];
  for (const entry of publication.files) {
    requireRelease(HEX64.test(entry.sha256) && Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= 512 * 1024 * 1024, '배포 파일 hash·크기가 다릅니다.');
    files.push(await fileContract(directory, entry));
  }
  const ota = files.find(file => file.name.endsWith('_ota.zip'));
  requireRelease(ota.sha256 === manifest.sha256 && ota.size === manifest.size, 'OTA 파일과 서명된 안내가 다릅니다.');
  const verifier = createVerify('RSA-SHA256');
  for await (const chunk of createReadStream(ota.path)) verifier.update(chunk);
  requireRelease(verifier.verify(identity.otaPublicKeyPem, Buffer.from(manifest.bundleSignature, 'base64')), 'OTA 묶음의 기존 키 서명을 확인할 수 없습니다.');

  const { api, upload } = github(env.PUBLIC_RELEASE_TOKEN);
  const repository = await api('');
  requireRelease(repository.id === approved.distributionRepositoryId && repository.full_name === REPOSITORY && repository.private === false && repository.permissions?.push === true, '게시 전용 인증의 공개 저장소 신원 또는 쓰기 권한이 다릅니다.');
  const channel = await api('/git/ref/heads/updates');
  requireRelease(channel.object?.type === 'commit' && HEX40.test(channel.object.sha), '사전 이관한 updates branch가 필요합니다.');
  const expectedChannelHead = channel.object.sha;
  const previous = parsedFeed(await api('/contents/latest.json?ref=updates'), identity);
  assertChannelAdvance(previous, manifest, publication.envelope);
  const tag = `v${manifest.version}`;
  let release = await api(`/releases/tags/${tag}`, 'GET', undefined, { missing: true });
  if (release) requireRelease(release.tag_name === tag && release.prerelease === false && !release.assets?.some(asset => /development|source/i.test(asset.name)), '공개 버전의 기존 릴리스 계약이 다릅니다.');

  const metadata = {
    schemaVersion: 1, version: manifest.version, sourceSha: approved.sourceSha,
    nativeVersionCode: publication.nativeVersionCode, minNativeVersion: manifest.minNativeVersion, maxNativeVersion: manifest.maxNativeVersion,
    files: files.map(({ name, size, sha256 }) => ({ name, size, sha256 })).sort((a, b) => a.name.localeCompare(b.name)),
  };
  const recordCommit = await metadataCommit(api, metadata);
  const releaseNotes = `## 천수 ${manifest.version}\n\n${manifest.notes.map(note => `- ${note}`).join('\n')}\n\n기존 저장 데이터와 앱 서명을 유지합니다.\n\n원본 SHA: ${approved.sourceSha}\n\nOTA SHA-256: ${manifest.sha256}`;
  if (!release) release = await api('/releases', 'POST', { tag_name: tag, target_commitish: recordCommit, name: `천수 ${manifest.version} 자동 패치`, body: releaseNotes, draft: true, prerelease: false });
  requireRelease(Number.isSafeInteger(release.id), '공개 릴리스 ID가 다릅니다.');
  let assets = await api(`/releases/${release.id}/assets?per_page=100`);
  requireRelease(Array.isArray(assets) && assets.length <= 2 && assets.every(asset => names.includes(asset.name)), '공개 릴리스에 허용되지 않은 자산이 있습니다.');
  for (const file of files) {
    let asset = assets.find(item => item.name === file.name);
    if (!asset) asset = await upload(release.id, file);
    requireRelease(asset.name === file.name && asset.size === file.size && asset.digest === `sha256:${file.sha256}` && asset.state === 'uploaded', '같은 공개 버전의 배포 파일이 다릅니다. 기존 파일을 삭제하거나 덮어쓰지 않습니다.');
  }
  await reauthorize();
  release = await api(`/releases/${release.id}`, 'PATCH', { draft: false, body: releaseNotes, make_latest: 'true' });
  requireRelease(release.html_url === `https://github.com/${REPOSITORY}/releases/tag/${tag}`, '공개 릴리스 경로가 다릅니다.');
  for (const file of files) await verifyPublicFile(file.name.endsWith('.apk') ? manifest.apkUrl : manifest.url, file);
  await reauthorize();
  const current = await api('/git/ref/heads/updates');
  requireRelease(current.object?.sha === expectedChannelHead, '배포 중 실제 채널이 변경됐습니다. 채널 포인터를 수정하지 않습니다.');
  const currentFeed = parsedFeed(await api('/contents/latest.json?ref=updates'), identity);
  requireRelease(currentFeed.envelope.payload === previous.envelope.payload && currentFeed.envelope.signature === previous.envelope.signature, '배포 중 서명 안내가 변경됐습니다.');
  if (currentFeed.envelope.payload !== publication.envelope.payload || currentFeed.envelope.signature !== publication.envelope.signature) {
    const parent = await api(`/git/commits/${expectedChannelHead}`);
    const blob = await api('/git/blobs', 'POST', { content: jsonBytes(publication.envelope), encoding: 'utf-8' });
    const tree = await api('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: [{ path: 'latest.json', mode: '100644', type: 'blob', sha: blob.sha }] });
    const commit = await api('/git/commits', 'POST', { message: `천수 ${manifest.version} 서명 OTA 채널 게시 [skip ci]`, tree: tree.sha, parents: [expectedChannelHead] });
    // A sibling concurrent update cannot fast-forward to this commit, so this
    // non-forced ref update implements the channel lease without history reset.
    await api('/git/refs/heads/updates', 'PATCH', { sha: commit.sha, force: false });
  }
  return { releaseUrl: release.html_url, manifestUrl: identity.manifestUrl, version: manifest.version, sourceSha: approved.sourceSha };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishRelease().then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('공개 게시가 중단됐습니다. 기존 APK·OTA·채널과 원본 키를 유지하며 운영 로그의 실패 단계부터 재개하세요.');
    process.exitCode = 1;
  });
}
