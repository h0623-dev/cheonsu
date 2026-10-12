import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { root, checkSetup } from './setup.mjs';
import { getPlayReleaseIssues } from './check-play-release.mjs';

try {
  const play = process.argv.includes('--play') || process.argv.includes('--play-check');
  const checkOnly = process.argv.includes('--play-check');
  if (play && !checkOnly) {
    const issues = getPlayReleaseIssues(root);
    if (issues.length) throw new Error(`Google Play 제출 빌드 차단:\n${issues.join('\n')}`);
  }
  const { sdk, java } = checkSetup({ android: true });
  const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, PATH: `${path.join(java, 'bin')}${path.delimiter}${process.env.PATH || process.env.Path || ''}` };
  const run = (command, args, cwd = root) => {
    const child = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`${command} failed (${child.status})`);
  };
  if (process.platform !== 'win32') fs.chmodSync(path.join(root, 'android/gradlew'), 0o755);
  const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const runGradle = async args => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(gradle, args, { cwd: path.join(root, 'android'), env,
          stdio: ['inherit', 'pipe', 'pipe'], shell: process.platform === 'win32' });
        let tail = '';
        const forward = stream => chunk => {
          stream.write(chunk);
          tail = (tail + chunk.toString()).slice(-65536);
        };
        child.stdout.on('data', forward(process.stdout));
        child.stderr.on('data', forward(process.stderr));
        child.on('error', reject);
        child.on('close', (status, signal) => resolve({ status, signal, tail }));
      });
      if (result.status === 0) return;
      // Gradle 자체를 받는 동안의 일시적인 서버·연결 오류만 재시도한다.
      // 컴파일·서명·권한·TLS 오류는 최초 실패 그대로 중단한다.
      const transientDownload = /org\.gradle\.wrapper\./.test(result.tail)
        && /Server returned HTTP response code: (500|502|503|504)\b|Read timed out|Connection reset|ETIMEDOUT/.test(result.tail);
      if (!transientDownload || attempt === 3)
        throw new Error(`${gradle} failed (${result.status ?? result.signal})`);
      console.warn(`Gradle 배포 파일 다운로드의 일시적 오류: ${attempt * 10}초 뒤 재시도합니다 (${attempt + 1}/3).`);
      await delay(attempt * 10000);
    }
  };
  // 깨끗한 checkout에는 Cordova의 생성 모듈이 없으므로 먼저 네이티브 구성을 만든다.
  // 빈 목적 폴더를 준비하면 update가 아직 제작하지 않은 dist를 복사하지 않는다.
  fs.mkdirSync(path.join(root, 'android/app/src/main/assets/public'), { recursive: true });
  run('npx', ['cap', 'update', 'android']);
  // 실제 APK의 의존성 고지를 먼저 제작하여 APK와 같은 웹 번들·OTA·소스 ZIP에 넣는다.
  // 이 작업은 패키징의 일부이며 앱 의존성·OTA 신뢰 설정을 변경하지 않는다.
  await runGradle(['-I', 'native-notices.init.gradle', ':app:generateCheonsuNativeNotices', `-PcheonsuNoticeVariant=${play ? 'release' : 'debug'}`]);
  run('npm', ['run', 'build']);
  run('npx', ['cap', 'sync', 'android']);
  await runGradle([play ? 'bundleRelease' : 'assembleDebug']);
  console.log(play ? `AAB: android/app/build/outputs/bundle/release/app-release.aab${checkOnly ? ' (검증 전용, 스토어 제출 불가)' : ''}` : 'APK: android/app/build/outputs/apk/debug/app-debug.apk');
} catch (error) { console.error(error.message); process.exitCode = 1; }
