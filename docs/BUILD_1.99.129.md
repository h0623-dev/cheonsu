# 천수 1.99.129 빌드

최종 빌드일: 2026-09-22

## APK

- 파일: `cheonsu_1.99.129_battle_motion_debug.apk`
- 패키지: `com.cheonsu.game`
- 버전: `1.99.129`, Android versionCode `328`
- 크기: 168,923,995 bytes
- SHA-256: `ACC64964E587FA3F9DA8FB222E246664E7740EA63CA04DBAB09B05156FCDE70C`
- 테스트용 디버그 서명. APK v1/v2 서명 검증 통과.
- 이전 1.99.128 APK와 서명 인증서 일치.
- 아군/적군 36종의 모션 이미지 216개와 최신 웹 빌드 포함 확인.

설치 전 설정의 저장 내보내기로 진행 상황을 백업하는 것을 권장합니다. 다른 서명으로 설치된 앱에는 바로 업데이트할 수 없을 수 있습니다. 실제 Android 기기 설치 및 성능 검사는 아직 하지 않았습니다.

## 개발 통합본

`cheonsu_development_1.99.129.zip`에는 소스, 이미지와 생성 원본, 테스트, Android 프로젝트, 잠금 파일, 실행 및 빌드 안내가 들어갑니다. 개인 서명키, SDK 경로, node_modules, 빌드 캐시는 제외합니다.

다른 PC에서 Node.js 24를 설치하고 ZIP 내부 `cheonsu` 폴더에서 실행합니다.

```sh
npm ci
npm run setup
npm run dev
```

자세한 내용은 [개발 인계](DEVELOPMENT_HANDOFF.md), 기능 검증은 [전투 패치 QA](COMBAT_MOTION_QA.md)를 참조하세요.
