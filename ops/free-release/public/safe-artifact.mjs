import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, readFile, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_REPOSITORY = 'h0623-dev/cheonsu-source';
const MAXIMUM_ARCHIVE_BYTES = 450000000;
const SHA256 = /^[a-f0-9]{64}$/;
const archiveTool = fileURLToPath(new URL('./archive-data.py', import.meta.url));

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function allowedArtifactLocation(value) {
  const url = new URL(value);
  requireCondition(url.protocol === 'https:' && (!url.port || url.port === '443') && !url.username && !url.password, 'GitHub artifact의 HTTPS 다운로드만 허용합니다.');
  const host = url.hostname.toLowerCase();
  requireCondition(host.endsWith('.blob.core.windows.net') || host.endsWith('.actions.githubusercontent.com') || host === 'results-receiver.actions.githubusercontent.com' || host === 'productionresultssa0.blob.core.windows.net', '승인되지 않은 artifact 다운로드 호스트입니다.');
  return url;
}

export function archiveData(mode, options) {
  requireCondition(['outer', 'payload', 'ota', 'ota-check'].includes(mode), '압축 처리 모드가 다릅니다.');
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [archiveTool, mode], { shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, LANG: 'C.UTF-8', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' } });
    const output = [];
    let bytes = 0;
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) child.kill('SIGKILL');
      else output.push(chunk);
    });
    child.stderr.resume();
    child.on('error', () => reject(new Error('승인된 Python 압축 도구를 실행할 수 없습니다.')));
    child.on('close', code => {
      if (code !== 0 || bytes > 1024 * 1024) return reject(new Error('압축 자료의 경로·형식·용량·파일 계약이 다릅니다.'));
      try { resolve(JSON.parse(Buffer.concat(output).toString('utf8'))); }
      catch { reject(new Error('압축 도구 결과 형식이 올바르지 않습니다.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(options));
  });
}

async function artifactResponse(approval, token) {
  requireCondition(typeof token === 'string' && token.length > 0, 'GitHub 내부의 원본 artifact 읽기 자격증명이 필요합니다.');
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${SOURCE_REPOSITORY}/actions/artifacts/${approval.artifactId}/zip`, {
      method: 'GET', redirect: 'manual',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(60000),
    });
    for (let count = 0; [301, 302, 303, 307, 308].includes(response.status); count++) {
      requireCondition(count < 3, 'artifact 다운로드 리디렉션이 너무 많습니다.');
      const next = allowedArtifactLocation(response.headers.get('location'));
      await response.body?.cancel();
      // Never forward the private repository credential to storage/CDN URLs.
      response = await fetch(next, { method: 'GET', redirect: 'manual', headers: { 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(10 * 60 * 1000) });
    }
  } catch {
    throw new Error('GitHub artifact 다운로드 연결 또는 목적지 정책이 올바르지 않습니다.');
  }
  requireCondition(response.ok && response.status === 200 && response.body, `artifact 다운로드 실패: HTTP ${response.status}`);
  return response;
}

export async function prepareArtifact(approval, env, workspace) {
  requireCondition(approval.scope === 'metadata-provenance-only' && Number.isSafeInteger(approval.artifactId) && approval.artifactId > 0 && SHA256.test(approval.artifactArchiveSha256), '승인된 artifact 출처 기록이 필요합니다.');
  requireCondition(Number.isSafeInteger(approval.artifactArchiveBytes) && approval.artifactArchiveBytes > 0 && approval.artifactArchiveBytes <= MAXIMUM_ARCHIVE_BYTES, 'artifact 다운로드 크기가 허용 범위를 초과했습니다.');
  const response = await artifactResponse(approval, env.SOURCE_ARTIFACT_READ_TOKEN);
  const declared = response.headers.get('content-length');
  if (declared) requireCondition(/^[0-9]+$/.test(declared) && Number(declared) === approval.artifactArchiveBytes, 'artifact HTTP 크기와 GitHub API 크기가 다릅니다.');
  const archive = path.join(workspace, 'transfer.zip');
  const output = createWriteStream(archive, { flags: 'wx', mode: 0o600 });
  const completed = finished(output, { cleanup: true });
  completed.catch(() => {});
  const hash = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      requireCondition(size <= approval.artifactArchiveBytes && size <= MAXIMUM_ARCHIVE_BYTES, 'artifact 실제 다운로드 크기가 제한을 초과했습니다.');
      hash.update(chunk);
      if (!output.write(chunk)) await once(output, 'drain');
    }
    output.end();
    await completed;
    requireCondition(size === approval.artifactArchiveBytes && hash.digest('hex') === approval.artifactArchiveSha256, 'artifact의 실제 SHA256·크기가 GitHub API와 다릅니다.');
    const destination = path.join(workspace, 'incoming');
    await archiveData('outer', { archive, destination });
    await rm(archive, { force: true });
    const releasePath = path.join(destination, 'release.json');
    const indexPath = path.join(destination, 'payload-index.json');
    requireCondition((await stat(releasePath)).size <= 32 * 1024 && (await stat(indexPath)).size <= 4 * 1024 * 1024, '전달 JSON 크기가 허용 범위를 초과했습니다.');
    let metadata;
    try { metadata = JSON.parse(await readFile(releasePath, 'utf8')); }
    catch { throw new Error('전달 배포 JSON 형식이 올바르지 않습니다. 원문은 출력하지 않습니다.'); }
    const indexBytes = await readFile(indexPath);
    requireCondition(createHash('sha256').update(indexBytes).digest('hex') === metadata.payloadIndexSha256, '웹 파일 목록의 SHA256이 다릅니다.');
    const apkPath = path.join(destination, 'unsigned.apk');
    await chmod(apkPath, 0o600);
    return { apkPath, indexPath, metadata, incomingDirectory: destination };
  } catch (error) {
    output.destroy();
    await completed.catch(() => {});
    await rm(archive, { force: true });
    throw error;
  }
}
