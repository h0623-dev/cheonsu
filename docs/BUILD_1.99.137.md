# 1.99.137 전투 버튼 안전 영역 빌드 검사

- Android: com.cheonsu.game, versionCode 336 / versionName 1.99.137.
- APK: `cheonsu_1.99.137_update_debug.apk`.
- APK SHA-256: `B300C6EF1F37CE3408FE8CDC23C8412AC103A0CAB3F8869CA1762CC767EDEDA4`.
- OTA: `update-release/1.99.137/cheonsu_1.99.137_ota.zip`, 186,790,755 bytes.
- OTA SHA-256: `0ef15b84dad08b1c592b8e9e831ded38705faa24b22d687e99aa47280f943a41`.
- OTA 최소/최대 네이티브 버전: 335~336. 구형 APK 보호 여백 경로와 새 APK 자동 inset 경로를 각각 검증합니다.
- 단위 검사 236개 통과. 설치 앱 버전 식별, 구형 앱/브리지 실패 시 보호 여백 유지, 웹 미적용, effect 해제 후 늦은 응답 방지 포함.
- `verify-navigation-overlap.mjs`: 세로 416x658, 320x568, 390x844, 가로 844x390, 새 APK를 가정한 416x582/796x362, 웹 1280x900의 7개 조건 통과.
- 실제 포인터 이동/공격 선택/스킬 열기·닫기/아이템 열기·취소/이동 취소/대기 및 저장 확인. 모든 명령 버튼의 전체 경계와 hit-test가 시스템 버튼 오버레이를 피함을 검사합니다.
- 같은 세션 가로/세로 회전 및 구형 중복 명령창 숨김 재검사 통과.
- 기존 `picker-cancel` 390px, `attack-feedback` 320px 검사 통과.
- 자동 패치 UI 4개 화면 크기 및 웹 미지원 상태 검사 통과.
- production 번들 smoke 검사 통과.
- lint 오류 0개, 기존 App effect 의존성 경고 2개 유지.
- 최종 dist의 웹 파일 1,079개가 APK 및 OTA와 모두 일치. 기존 APK 서명 인증서 유지.
- APK에 `android.adjustMarginsForEdgeToEdge: auto`, 서명 공개 키, 복구 설정, 플러그인 등록이 포함됨을 검사.

주의: 연결된 Android 기기/에뮬레이터가 없습니다. 화면 검사는 모의 네이티브 브리지와 시스템 버튼 오버레이이며 실제 Android 설치·내비게이션 전환·OTA 복구 검증으로 간주하지 않습니다.
