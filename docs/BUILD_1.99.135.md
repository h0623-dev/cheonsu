# 1.99.135 최종 빌드 기록

확인일: 2026-09-26

## 산출물

- APK: `cheonsu_1.99.135_village_debug.apk`
- 크기: 192,195,086 bytes
- SHA-256: `7DCDD701C8C55F57C60D9675F7EA193BC078B0874C5F1F3176AEEABC03866F30`
- 패키지: `com.cheonsu.game`
- Android versionName `1.99.135`, versionCode `334`, minSdk 23, targetSdk 35
- 디버그 서명 v1/v2 검증 통과
- 인증서 SHA-256: `1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f`
- 최종 웹 번들: `index-CN31wN3D.js`, `index-Ck2LYG_Q.css`
- APK 웹 파일 1,077개와 최종 `dist`의 SHA-256 전부 일치. 새 마을 이미지 포함.
- 전체 개발 소스: `cheonsu_development_1.99.135.zip`

## 검사

- `npm test`: 204/204 통과. 기존 197개와 해금/체크포인트/저장 실패/수동 보조 마법/마을 경로/전투 자세 크기 7개.
- `verify-village.cjs`: 1280x900, 390x844, 320x568, 844x390에서 새 게임 잠금, 눈에 띄는 저장, 승리 즉시 자동저장, 재실행 중복 보상 방지, 다음 장 해금/이전 장 경험치 재도전, 시설까지 이동, 구매/장착/휴식, 회복 대상 수동 선택/취소/사거리/쿨다운 통과.
- `verify-village-details.cjs`: 시설 창 가운데 배치, 키보드 이동, 저장 알림 자동 해제, 부상자 여관 회복, 도착 캐릭터와 건물 표식 분리, 저장 공간 부족 시 기존 저장 읽기/보존 및 자동저장 재시도 1회 정산 통과.
- `verify-combat-presentation.cjs`: PC/모바일 5개 화면 크기, 14개 대표 유닛/보스와 1/2/3배속, 무기별 동작, 피격/회피/격파/자가 보조, 실제 렌더 픽셀 검사 통과. 모든 246개 자세의 높이와 발 기준은 단위 검사로 별도 확인.
- `verify-refinement.cjs`: PC/모바일 3개 화면에서 보스 승리 후 다음 스테이지/상점/대기실 9개 이동 흐름, 턴당 행동 1회, 기본 130%/2배속, 반복 BGM과 공격/이동/스킬 효과음의 음성 신호 검사 통과.
- `verify-release.cjs`: APK와 같은 최종 프로덕션 번들의 2장 진입, 이미지, 탐색 창, 모바일 명령 버튼, 브라우저 오류 검사 통과.
- `verify-battle-controls.cjs`: 40/40 통과. 1280/390/320px에서 정보 숨김/줌, 스킬 사거리/광역 표시, 연계공격 제거, 배속, 아이템/스킬 취소, 공격/스킬 피드백, 수호 수동 선택, 개별 쿨다운, 패배 복귀를 재검증했습니다.
- `git diff --check`: 통과.
- 변경한 주요 소스 ESLint: 오류 0개. 기존 App.jsx 자동 전투 효과의 의존성 경고 2개는 남아 있습니다.

화면 캡처와 기계 보고서는 로컬 `tmp/village-qa`, `tmp/combat-presentation-qa`, `tmp/refinement-qa`, `tmp/release-qa`, `tmp/battle-controls-qa`에 있습니다. 임시 검사 결과는 소스 ZIP에 포함하지 않습니다.

## 남은 제한

- Android 실기기 설치/터치/스피커 청음은 미검증. 브라우저 검사와 APK 패키지 검증을 수행했습니다.
- 기존 저장 키/동료/장비/육성/진행 중 전투는 유지합니다. 과거 전체 스테이지 테스트 해금만 실제 클리어 기록 기준으로 정리됩니다.
- 개인 브라우저 저장은 사용하지 않고 독립된 Playwright 컨텍스트에서 검사했습니다.
- Vite 대형 번들 경고, Gradle flatDir/SDK 도구 버전 경고가 남아 있습니다. 빌드는 성공했습니다.
- 개발 테스트용 디버그 APK입니다. 현재 변경은 GitHub에 게시하지 않았습니다.
