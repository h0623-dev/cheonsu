import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/legal/npm');
const supplementRoot = path.join(root, 'docs/legal/npm');
const noticeName = /^(?:licen[cs]e(?:[._-]|$)|copying(?:[._-]|$)|notice(?:[._-]|$)|copyright(?:[._-]|notice|$)|third[-_ ]?party(?:[._ -]|notices|$))|\.licen[cs]e$/i;
const sourceName = /\.(?:[cm]?js|jsx|tsx?|java|kt|swift|[cmh]|mm|cc|cpp|proto|sh)$/i;
const posix = value => value.split(path.sep).join('/');
const digest = value => createHash('sha256').update(value).digest('hex');

async function packageFiles(directory, relative = '') {
  const files = [];
  for (const entry of (await readdir(path.join(directory, relative), { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (entry.isSymbolicLink() || ['node_modules', '.git'].includes(entry.name)) continue;
    const file = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await packageFiles(directory, file));
    else if (entry.isFile() && (noticeName.test(entry.name) || sourceName.test(entry.name))) files.push(file);
  }
  return files;
}

function repositoryUrl(repository) {
  const value = typeof repository === 'string' ? repository : repository?.url;
  if (!value) return '';
  const clean = value.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
  return clean.includes('://') ? clean : `https://github.com/${clean}`;
}

function legalBlocks(text) {
  // 원본 소스의 법적 고지 블록만 옮깁니다. 소스 코드나 소스맵은 고지에 넣지 않습니다.
  return [...text.matchAll(/^[\t ]*\/\*[\s\S]*?\*\//gm)]
    .map(match => match[0].trim())
    .filter(block => /(?:@license\b|copyright\b|SPDX-License-Identifier|permission is hereby granted|licensed under)/i.test(block));
}

export async function generateThirdPartyNotices() {
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const supplements = JSON.parse(await readFile(path.join(supplementRoot, 'supplements.json'), 'utf8')).packages;
  const dependencies = Object.entries(lock.packages).filter(([key, item]) => key && !item.dev).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const packages = [];
  const sections = [];
  await mkdir(path.join(output, 'packages'), { recursive: true });

  for (const [packagePath, locked] of dependencies) {
    const directory = path.join(root, packagePath);
    const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    if (metadata.version !== locked.version) throw new Error(`고지 제작 중 설치 버전이 lockfile과 다릅니다: ${packagePath}`);
    const notices = [];
    const headers = new Map();
    for (const file of await packageFiles(directory)) {
      const text = await readFile(path.join(directory, file), 'utf8');
      if (noticeName.test(path.basename(file))) {
        notices.push({ origin: `${packagePath}/${posix(file)}`, text, sha256: digest(text), kind: 'npm-file' });
      } else {
        for (const block of legalBlocks(text)) {
          if (!headers.has(block)) headers.set(block, []);
          headers.get(block).push(posix(file));
        }
      }
    }
    if (!notices.some(notice => /licen[cs]e|copying/i.test(path.basename(notice.origin)))) {
      const extra = supplements[metadata.name];
      if (!extra || extra.version !== metadata.version) throw new Error(`고지 전문 보충 자료가 필요합니다: ${metadata.name}@${metadata.version}`);
      const text = await readFile(path.join(supplementRoot, extra.file), 'utf8');
      notices.push({ origin: extra.source, sourceCommit: extra.sourceCommit, releaseTag: extra.releaseTag, note: extra.note, text, sha256: digest(text), kind: 'pinned-upstream-file' });
    }
    // 같은 패키지에 반복 삽입된 원문은 한 번 싣고 원래 위치를 모두 기록합니다.
    for (const [text, files] of headers) notices.push({ origin: packagePath, sourceFiles: files, text, sha256: digest(text), kind: 'original-source-notice' });
    const label = `${metadata.name}@${metadata.version}`;
    const fileName = `${metadata.name.replace(/^@/, '').replaceAll('/', '--')}--${metadata.version}--${digest(packagePath).slice(0, 8)}.txt`;
    const repository = repositoryUrl(metadata.repository);
    const declaredLicense = locked.license || metadata.license || '원문 참조';
    const copyright = [...new Set(notices.flatMap(notice => notice.text.split(/\r?\n/).filter(line => /copyright|\(c\)|©/i.test(line)).map(line => line.trim())))];
    const header = [`패키지: ${label}`, `lockfile 경로: ${packagePath}`, `선언 라이선스: ${declaredLicense}`, `원본 저장소: ${repository || '패키지 원문 참조'}`, '아래 원문에 추가 라이선스·저작권·NOTICE가 있으면 함께 적용됩니다.'];
    const body = notices.map(notice => [
      `----- 원문 출처: ${notice.origin} -----`,
      ...(notice.sourceFiles ? [`원본 파일: ${notice.sourceFiles.join(', ')}`] : []),
      ...(notice.sourceCommit ? [`고정 원본 커밋: ${notice.sourceCommit}`, notice.note] : []),
      notice.text,
    ].join('\n')).join('\n\n');
    const text = `${header.join('\n')}\n\n${body}\n`;
    await writeFile(path.join(output, 'packages', fileName), text);
    sections.push(text);
    packages.push({
      name: metadata.name, version: metadata.version, packagePath, declaredLicense, repository,
      npmIntegrity: locked.integrity || null, copyright,
      noticeFile: `packages/${fileName}`,
      notices: notices.map(({ text: _text, ...notice }) => notice),
    });
  }

  const scope = 'package-lock.json에서 개발 전용이 아닌 npm 의존성 전체의 원문 고지를 보존합니다. 타입·서버·플랫폼별 의존성까지 포함한 보수적인 목록으로, 모든 항목이 게임에 실행 코드로 포함된다는 뜻은 아닙니다. 실제 웹 번들 목록은 ../bundled-web-notices.md, Android 네이티브 고지는 상위 법적 고지 화면을 참고하세요.';
  const introduction = [
    '천수 · npm 의존성 저작권 및 라이선스 원문',
    scope,
    '이 문서는 외부 구성요소의 권리를 안내하며 천수 자체 코드·이야기·아트의 재사용 허락을 부여하지 않습니다.',
    '라이선스의 법적 원문과 권리자 표기를 보존하기 위해 아래 원문은 번역하지 않았습니다.',
    'Firebase npm 배포본에 빠진 공통 LICENSE는 Firebase 11.10.0 공식 릴리스의 고정 커밋에서 보충했습니다.',
    '',
  ].join('\n');
  await writeFile(path.join(output, 'THIRD_PARTY_NOTICES.txt'), `${introduction}\n${sections.join('\n\n' + '='.repeat(80) + '\n\n')}`);
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    title: '천수 npm 의존성 고지',
    scope,
    packageCount: packages.length,
    dependencySnapshotSha256: digest(JSON.stringify(dependencies.map(([key, item]) => [key, item.version, item.integrity || null]))),
    packages,
  }, null, 2)}\n`);
  console.log(`npm 라이선스 고지 제작 완료: ${packages.length}개 → public/legal/npm`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await generateThirdPartyNotices();
