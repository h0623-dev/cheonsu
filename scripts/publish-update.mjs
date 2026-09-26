import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyPatchManifest } from '../src/engine/liveUpdateEngine.js';
import { webBuildInfo } from './update-build-info.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const trust = read('src/data/updateTrust.json');
const { version } = read('package.json');
const envelope = read(`update-release/${version}/latest.json`);
const manifest = await verifyPatchManifest(envelope, trust);
if (manifest.version !== version || JSON.stringify(webBuildInfo(root)) !== JSON.stringify(read('dist/ota-build.json'))) throw new Error('최종 빌드와 배포 정보가 다릅니다.');
if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()) throw new Error('소스 변경 사항을 커밋한 뒤 배포하세요.');
const credential = execFileSync('git', ['-c', 'credential.interactive=never', 'credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, windowsHide: true,
});
const token = credential.split('\n').find(line => line.startsWith('password='))?.slice(9).trim();
if (!token) throw new Error('GitHub 로그인 정보가 없습니다.');
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Cheonsu-Updates', 'X-GitHub-Api-Version': '2022-11-28' };
async function api(endpoint, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${trust.repository}${endpoint}`, {
    method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub ${method} ${endpoint}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const repo = await api('');
if (repo.private) throw new Error('휴대폰에서 로그인 없이 접근할 수 있는 공개 배포 저장소가 필요합니다.');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (!await api(`/commits/${head}`)) throw new Error('현재 소스 커밋을 GitHub에 먼저 올려 주세요.');
let feed = await api('/contents/latest.json?ref=updates');
const expectedChannelSha = feed?.sha;
if (feed) {
  const previous = await verifyPatchManifest(JSON.parse(Buffer.from(feed.content, 'base64').toString()), trust);
  const { compareVersions } = await import('../src/engine/updateEngine.js');
  if (compareVersions(version, previous.version) < 0) throw new Error('이전 버전으로 배포 채널을 되돌릴 수 없습니다. 새 버전 번호로 복구 패치를 만드세요.');
  if (previous.version === version && previous.sha256 !== manifest.sha256) throw new Error('이미 배포된 버전을 덮어쓸 수 없습니다. 버전을 올리세요.');
}
const releaseNotes = `## 천수 ${version}\n\n${manifest.notes.map(note => `- ${note}`).join('\n')}\n\n자동 패치 지원: Android versionCode ${manifest.minNativeVersion}~${manifest.maxNativeVersion}. 최초 자동 패치 지원 APK는 한 번 설치해야 합니다. 저장 데이터는 유지됩니다.\n\n소스 커밋: ${head}\n\nOTA SHA-256: ${manifest.sha256}`;
let release = await api(`/releases/tags/v${version}`);
if (!release) release = await api('/releases', 'POST', { tag_name: `v${version}`, target_commitish: head, name: `천수 ${version} 자동 패치`, body: releaseNotes, draft: true });
const files = [
  { file: `update-release/${version}/cheonsu_${version}_ota.zip`, name: `cheonsu_${version}_ota.zip`, type: 'application/zip' },
  { file: `cheonsu_${version}_update_debug.apk`, name: `cheonsu_${version}_update_debug.apk`, type: 'application/vnd.android.package-archive' },
  { file: `cheonsu_development_${version}.zip`, name: `cheonsu_development_${version}.zip`, type: 'application/zip' },
];
for (const item of files) {
  const file = path.join(root, item.file);
  const size = fs.statSync(file).size;
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  const digest = `sha256:${hash.digest('hex')}`;
  if (item.name.endsWith('_ota.zip') && digest !== `sha256:${manifest.sha256}`) throw new Error('OTA 파일이 서명 이후 변경되었습니다.');
  let asset = release.assets.find(asset => asset.name === item.name);
  if (!asset) {
    console.log(`업로드: ${item.name} (${Math.ceil(size / 1048576)} MB)`);
    const response = await fetch(`https://uploads.github.com/repos/${trust.repository}/releases/${release.id}/assets?name=${encodeURIComponent(item.name)}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': item.type, 'Content-Length': String(size) },
      body: fs.createReadStream(file), duplex: 'half', signal: AbortSignal.timeout(900000),
    });
    if (!response.ok) throw new Error(`배포 파일 업로드 실패: ${response.status}`);
    asset = await response.json();
  }
  if (asset.size !== size || asset.digest !== digest || asset.state !== 'uploaded') throw new Error(`기존 배포 파일이 다릅니다: ${item.name}`);
  console.log(`검증 완료: ${item.name} ${digest}`);
}
release = await api(`/releases/${release.id}`, 'PATCH', { draft: false, body: releaseNotes, make_latest: 'true' });
// The channel pointer is updated only after every immutable asset is publicly reachable.
for (const url of [manifest.url, manifest.apkUrl]) {
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`공개 다운로드 확인 실패: ${response.status}`);
}
if (!await api('/git/ref/heads/updates')) {
  const blob = await api('/git/blobs', 'POST', { content: JSON.stringify(envelope, null, 2) + '\n', encoding: 'utf-8' });
  const tree = await api('/git/trees', 'POST', { tree: [{ path: 'latest.json', mode: '100644', type: 'blob', sha: blob.sha }] });
  const commit = await api('/git/commits', 'POST', { message: `천수 ${version} 패치 채널 시작`, tree: tree.sha, parents: [] });
  await api('/git/refs', 'POST', { ref: 'refs/heads/updates', sha: commit.sha });
} else {
  feed = await api('/contents/latest.json?ref=updates');
  if (feed?.sha !== expectedChannelSha) throw new Error('배포 중 패치 채널이 변경되었습니다. 현재 채널을 확인하고 다시 실행하세요.');
  await api('/contents/latest.json', 'PUT', { message: `천수 ${version} 패치 배포`, branch: 'updates', sha: feed?.sha,
    content: Buffer.from(JSON.stringify(envelope, null, 2) + '\n').toString('base64') });
}
console.log(`배포 완료: ${release.html_url}\n패치 채널: ${trust.manifestUrl}`);
