# 1.99.136 자동 패치 빌드 검사

- Android: `com.cheonsu.game`, versionCode 335, versionName 1.99.136.
- APK: `cheonsu_1.99.136_update_debug.apk`.
- APK SHA-256: `9E1301DB69D77B4FC23AD98E68B6F016A15D02F7366ED8E7382016898C06B300`.
- OTA: `update-release/1.99.136/cheonsu_1.99.136_ota.zip`, 186,790,050 bytes.
- OTA SHA-256: `15742b559ddf8de31b8411d5df1920a9b7a65b268d4fd6f71e6cc03e74e252ca`.
- `npm test`: 229/229 통과. 자동 패치 25개 포함.
- `npm run lint`: 오류 0개. 기존 App effect 의존성 경고 2개 유지.
- `npm audit --omit=dev`: 실제 앱 의존성의 알려진 취약점 0개. 전체 개발 도구 감사에는 기존 취약점이 남아 있습니다.
- `verify-auto-update.mjs`: 320x568, 390x844, 844x390, 1280x900에서 실제 React UI + 모의 Capacitor 브리지 검사 통과. 진행률, 옵션, 서명된 안내, 저장 보존, 자동 재시작 금지, 시작 화면 수동 적용, 웹 미지원 상태 확인.
- `verify-village-details.cjs`: 마을, 저장 실패/복구, 승리 자동저장 재시도 통과.
- `verify-release.cjs`: 최종 production 번들 검사 재실행 통과. 중간 한 번 탐색 기록 열기 대기가 시간 초과되어 재검사했습니다.
- APK 서명 인증서는 기존 버전과 동일. APK 내 플러그인 등록, 공개 키, 30초 복구 타이머, localhost origin 유지 확인.
- 최종 dist의 웹 파일 1,079개가 APK와 OTA ZIP 양쪽에서 모두 SHA-256 일치.
- 패치 안내와 전체 OTA ZIP의 RSA-SHA256 서명 검증 통과.
- 개인 패치 서명 키는 현재 사용자만 접근하도록 ACL을 제한하고 Git/소스 ZIP에서 제외했습니다.

실제 Android 기기 또는 에뮬레이터는 연결되지 않아 실제 OTA 다운로드/시작/시간 초과 복구는 아직 미검증입니다. UI 테스트의 네이티브 동작은 모의 브리지이며 실제 설치 테스트로 간주하지 않습니다. GitHub 배포 성공 후 공개 채널 서명과 다운로드 파일 접근도 별도로 확인합니다.
