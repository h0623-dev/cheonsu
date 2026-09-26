# 1.99.134 최종 빌드 기록

확인일: 2026-09-24

## 산출물

- APK: `cheonsu_1.99.134_targeting_debug.apk`
- 크기: 191,291,846 bytes
- SHA-256: `0954A4CD66BCB7811BCA4EBB535219F7594706B3CF14A32097B99CCD9842B525`
- 패키지: `com.cheonsu.game`
- Android versionName: `1.99.134`, versionCode: `333`
- minSdk 23, targetSdk 35
- 디버그 서명 v1/v2 검증 통과
- 서명 인증서 SHA-256: `1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f`
- 웹 번들: `index-DpT61vp8.js`, `index-B8NMDBW-.css`
- 최종 dist의 1,076개 파일과 APK 내부 `assets/public`의 해당 파일을 SHA-256으로 비교하여 모두 일치
- 개발 통파일: `cheonsu_development_1.99.134.zip`

## 검사 결과

- `npm test`: 197/197 통과. 기본 34개 스킬 및 발견 기술 4개의 사거리, 0칸, 행동 완료/사망, 맵 경계, 차단 지형, 광역 표시와 실제 피해 대상, 기존 저장/이야기/배치 검사 포함.
- `npm run build`, `npm run android:apk`: 성공.
- `node scripts/verify-battle-controls.cjs --case hud-zoom,range-geometry,area-range,no-follow-up`: 13/13 통과. 1280x900, 390x844, 320x568에서 줌 숨김/복원과 배율 유지, 3/4칸 스킬 전환, 실제 타일 경계 일치, 위험 범위 중첩 방지, 광역 범위/피해/저장, 궁수 단독 피해와 검사의 행동 보존을 확인했습니다.
- 기존 모바일 조작 검사: 배속, 아이템/스킬 선택 취소, 공격 피드백, 기본 공격 스킬, 두 스킬 전환, 패배 복원/적 턴 패배 후 대기실 복귀를 통과했습니다. 수호 스킬과 두 번째 공격 스킬은 아래 재검사 결과를 포함합니다.
- `node scripts/verify-release.cjs`: 최종 프로덕션 빌드의 2장 진입, 이미지, 탐색 창, 390/320px 명령 버튼과 브라우저 오류 검사 통과.
- `npx eslint src/engine/movement.js scripts/targeting.test.mjs`: 통과. 별도 ESLint API로 App.jsx 검사 시 오류 0개, 정의되지 않은 참조 0개.
- 모바일 전체 전투 조작 검사에서 컷신 두 건은 짧은 재생 구간이 끝난 뒤 상태를 읽어 실패했습니다. 스냅샷을 원자적으로 읽도록 테스트를 정리한 뒤 수호 스킬과 리나 두 번째 스킬 실행/독립 쿨다운 검사를 통과했습니다.
- 광역 스킬 후 저장 검사에는 필드 효과 종료 대기를 추가했습니다. 게임의 효과 시간을 늘리거나 효과를 끄지 않았습니다.

화면 캡처와 기계 보고서는 로컬 `tmp/battle-controls-qa`, `tmp/release-qa`에 있습니다. 임시 보고서 폴더는 개발 ZIP에 포함하지 않습니다.

## 호환성과 한계

- 기존 저장 키와 데이터 구조, 이미 소비한 행동, 누적 협공 통계는 유지합니다. 새 자동 연계공격만 제거했습니다.
- 반격, 광역 피해, 지원 관계와 포위 보너스는 유지합니다.
- 이전 제공 APK와 같은 디버그 인증서입니다. 설치 전 저장 내보내기를 권장합니다. Android 실기기 설치/터치/스피커 청음은 미검증입니다.
- 별도 Playwright 컨텍스트에서 검사했으며 개인 브라우저 저장을 사용하지 않았습니다.
- Vite 대형 번들, Gradle flatDir/SDK 도구 버전 경고가 남아 있지만 빌드는 성공했습니다.
- 정식 스토어 배포용 서명이 아닌 개발 테스트 APK입니다. 이번 수정은 GitHub에 게시하지 않았습니다.
