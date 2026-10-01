# 1.99.151 빌드 및 QA

검증일: 2026-10-01. 패키지 com.cheonsu.game / Android 350 / target API 36.

## 배포 APK

- 파일: cheonsu_1.99.151_update_debug.apk
- 크기: 216,103,391 bytes
- SHA-256: A9E9E2348625A985D4DC26CAA625D7C8F92F64AE987CDECB8EF0E9634558640D
- 기존 개발 APK와 같은 인증서: 1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f
- 최종 소스로 npm run android:apk 성공. APK 내 웹 1,244개 파일과 dist의 SHA-256이 전부 일치합니다.
- 웹 소스 식별자: 45994ff26d40dfacd84b911a632e9b1baaadf9df0765fba94fb458a9fbe3bd53
- 네이티브 지문: e4a96c16ff95a60f9cf68440c9bf9fd72d5710729264d2464199f400a559dfc6
- APK 버전/서명, LiveUpdate 클래스 포함, 공개 키/실패 복구, origin 및 시스템 바 여백 설정 검증.

## 검증용 Play AAB

- 파일: cheonsu_1.99.151_play_unsigned.aab
- 크기: 213,482,082 bytes
- SHA-256: 29B76C7ACDA42F7F64C49F12923EF33FF556BEA50EB85DB76E4031668521A7CD
- npm run android:aab:check 성공. jarsigner로 미서명 상태 확인. **Play 업로드/출시용이 아닙니다.**
- base/assets/public의 1,244개 파일이 최종 웹 번들과 일치합니다. .so 파일은 없습니다. 네이티브 ELF 정렬 검사 대상은 없으나 실기기 16KB 검증은 미실시입니다.
- release MainActivity 바이트코드를 javap로 확인했습니다. LiveUpdate 등록이 컴파일 시 제거되고 Firebase 등록은 google_app_id 리소스 존재 조건에만 남아 있습니다. 자동 플러그인 목록은 비어 있습니다.
- 병합 manifest의 targetSdkVersion=36, release BuildConfig의 PLAY_STORE_BUILD=true 확인.

## 자동 및 화면 검사

- npm test: **403/403 통과**. 계정 미설정/취소/오류/중복 요청/토큰 제외/저장 미접근/오프라인 초기화 재시도 및 1.99.148/149/150 저장의 현재 버전 호환 포함.
- 배포 스크립트의 이전 채널 검증은 구버전 네이티브 대상도 허용하되 서명/주소/형식 검사를 유지합니다. 신규 배포와 앱 내부의 호환 검사는 완화하지 않았으며 별도 회귀 검사를 추가했습니다.
- npm run lint: 오류 0, 기존 App effect 의존성 경고 2개.
- npm audit fix 이후 전체 의존성 검사 취약점 0. 강제 메이저 변경 없이 호환 범위의 보안 패치를 반영했습니다.
- verify-account: 1280x900, 390x844, 320x568, 844x390. 미연결 상태 표시, 외부 인증 요청 없음, 저장 보존, 이어하기, 정책 페이지, 화면 넘침 없음. 최종 production 번들에서도 전부 통과. 모바일 스크린샷 직접 확인.
- verify-battle-controls: 390에서 즉시 기본 공격/스킬/궁수 스킬/자신 보호/협공 없음 확인. 320와 1280에서 정확한 사거리/반격/광역 피해/즉시 공격과 스킬 확인. 빠른 연속 클릭 2회가 1회 행동으로 처리됨을 확인했습니다.
- 최종 production 번들에서 attack-feedback, primary-skill, lina-secondary-execute를 390 화면으로 재검사: fixture 포함 4/4 통과.
- verify-facing: 위 4개 화면에서 이동 방향/취소/대기/공격과 반격 방향/저장/실제 일반 및 스킬 연출 통과.
- verify-growth: 위 4개 화면에서 전체 17명 훈련, 중복 훈련 차단, 일반/광역/상태이상/보스 경험치, 사망 및 미출전 구분, 자동저장, 즉시 보호/수동 지원 통과.

## 미완료 항목

- Firebase 프로젝트 및 google-services.json이 없어 실제 Google OAuth와 계정 삭제를 서비스에 연결하여 시험하지 못했습니다. 현 APK에서 로그인은 연결 준비 상태입니다. 테스트의 인증 SDK 응답은 단위 테스트용 대역이며 실제 Google 검증으로 표현하지 않습니다.
- 정식 업로드 서명 키, 운영자/지원 연락처, 공개 정책/삭제 접수 URL, Play 계정 및 심사 정보가 없습니다. npm run release:check는 17개 미완료 항목을 보고하며 제출 빌드를 차단합니다.
- Android 실기기/에뮬레이터 설치, Google Play 설치, 실제 OTA 활성화와 Android 16 시스템 바 터치는 미검증입니다.
- 준비 절차와 현재 한계는 [Google Play 준비 안내](GOOGLE_PLAY_1.99.151.md)를 참조하세요. 사용자 저장이나 기존 게임 데이터를 삭제하지 않았습니다.
