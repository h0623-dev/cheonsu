# 1.99.133 최종 빌드 기록

확인일: 2026-09-24

## 산출물

- APK: `cheonsu_1.99.133_journey_debug.apk`
- 크기: 191,413,174 bytes
- SHA-256: `CE1517E985BC1326A33C6F6AFDB5EF4FEC139750CB9E01D308713322A1AB2F38`
- 패키지: `com.cheonsu.game`
- Android versionName: `1.99.133`, versionCode: `332`
- minSdk 23, targetSdk 35
- 디버그 서명 v1/v2 검증 통과
- 서명 인증서 SHA-256: `1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f`
- 웹 번들: `index-DOyZ1sF3.js`, `index-Ce_mCRV1.css`
- 최종 dist의 1,076개 파일과 APK 내부 `assets/public`의 해당 파일을 SHA-256으로 비교하여 모두 일치
- 개발 통파일: `cheonsu_development_1.99.133.zip`

## 검사 결과

- `npm test`: 192/192 통과. 30개 실제 확장 전장의 4/15/17인 배치, 간격·겹침·연결성·탐색물, 이야기 인물/합류 시점, 기존 저장 복원 포함.
- `node scripts/verify-journey.cjs`: 1280x900, 390x844, 320x568, 844x390 통과. 역할 필터, 출전 체크, 대화 인물/이전/다음/기록/Esc, 승리 후 세 목적지, 보상 정산, 야영지 키보드 탭, 다음 장 편성, 가로 넘침 검사.
- `node scripts/verify-refinement.cjs`: 1280/390/320px에서 130%·2배속, 턴당 공격 1회, 보스 승리, 승리 후 세 목적지와 저장 검사 통과. BGM 3종과 효과음 14종의 오디오 신호 검사 통과.
- `node scripts/verify-battle-controls.cjs --viewport 390`: 10/10 통과. 공격 피드백, 두 스킬/개별 쿨다운, 지원 스킬 실행, 아이템 취소, 패배 복귀 등.
- `node scripts/verify-release.cjs`: 최종 프로덕션 번들의 2장 진입, 인물 이미지, 적 이미지, 탐색 기록 창, 390/320px 명령 버튼 아이콘과 한 줄 레이블, 브라우저 오류 없음 확인.
- `npx eslint src/engine/formations.js src/components/StoryScene.jsx src/data/storyScenes.js`: 통과. 기존 거대 App 전체의 린트 통과를 의미하지 않음.
- `npm run android:apk`: 최종 소스로 빌드 성공. APK 버전과 서명은 aapt/apksigner로 검증.

스크린샷과 기계 보고서는 로컬 `tmp/journey-qa`, `tmp/refinement-qa`, `tmp/battle-controls-qa`, `tmp/release-qa`에 있습니다. 임시 폴더는 개발 ZIP에 넣지 않습니다.

## 호환성과 한계

- 진행 중 전투 저장은 원래 지도·유닛 위치·행동 상태를 유지합니다. 새 분산 배치는 신규 출전에 적용합니다.
- 이전 제공 APK와 동일한 로컬 디버그 인증서를 사용했습니다. 설치 전 게임 저장 내보내기를 권장합니다. Android 실기기 설치/터치/스피커 청음은 이번 환경에서 검증하지 않았습니다.
- 브라우저 검사에 개인 저장을 사용하지 않았습니다. 별도 Playwright 컨텍스트를 사용했습니다.
- Vite의 대형 번들 경고, Gradle flatDir 경고가 남아 있습니다. 빌드 오류는 아닙니다.
- 정식 스토어 배포용 릴리스 서명 APK가 아니라 개발 테스트 APK입니다.
- 최초 APK 검증 시점에는 원격에 업로드하지 않았습니다. 이후 사용자의 업로드 요청에 따라 현재 개발본은 `h0623-dev/cheonsu`의 main, APK와 개발 ZIP은 `v1.99.133` 릴리스로 배포합니다. 게임 소스와 APK 내용은 동일하며 이관 문서만 갱신합니다.
