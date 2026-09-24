# 천수 1.99.132 빌드 검증

- 날짜: 2026-09-23 (한국 시간).
- 최종 게임 소스/이미지에서 `npm run android:apk` 실행, Gradle BUILD SUCCESSFUL.
- 파일: `cheonsu_1.99.132_battle_refinement_debug.apk`.
- 크기: 191,278,597 bytes.
- 패키지: com.cheonsu.game, 이름: 천수.
- versionName: 1.99.132, versionCode: 331.
- minSdk: 23, targetSdk/compileSdk: 35.
- 서명: 개발용 debug, APK Signature v1/v2 검증 성공.
- 서명 인증서 SHA-256: `1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f` (기존 개발 빌드와 동일).
- APK SHA-256: `8BF7F855142B9E3615A7A90F10F0CBEC0FAA2C53ECB382E80FA334542AFC2F5C`.
- APK의 `assets/public` 파일 1,076개가 현재 `dist` 파일과 SHA-256 비교 일치.
- 보스 이미지/매니페스트/캐시 목록 37개, 정규화 맵 이미지/매니페스트/캐시 목록 43개 포함.
- 배포 JS `index-DunKJoEn.js`, CSS `index-D3m6ULGR.css` 포함 및 원본 일치.
- `npm test`: 189/189. 배포 번들 2장/이미지/탐색 UI 검사 통과. 기능별 검사 목록은 `BATTLE_REFINEMENT_1.99.132.md`.
- 기존 Vite 대형 청크, Gradle flatDir/SDK XML 버전 차이, apksigner META-INF 관련 경고가 남아 있으나 빌드/서명 검증은 성공했습니다.
- 실제 Android 기기 설치/실기 음향 검사는 하지 않았습니다. Play Store용 출시 서명 APK가 아닌 설치 테스트용 개발 APK입니다.

소스 이관: `cheonsu_development_1.99.132.zip`. 개인 저장/인증 정보, node_modules, 로컬 SDK 경로, 빌드 캐시는 제외합니다.
