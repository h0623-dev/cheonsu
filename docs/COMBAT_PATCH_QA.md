# 1.99.128 검증 기록

확인일: 2026-09-17

## 통과

- `npm test`: 68/68.
- 새 컴포넌트, 전투 아트 매핑, 카메라 모듈 ESLint 통과.
- `node scripts/verify-battle-art.cjs 1`: 1280x900, 390x844에서 이동, 발 위치, 줌, 저장/복원, 캠프 검사.
- `npm run test:ui`: 1280x900, 390x844, 320x568에서 설정창 및 아이템 창 배치, 취소/닫기/Esc/바깥 영역, 아이템 수량 및 행동 상태 유지.
- 턴 전환 시 아군/적군 목표와 실제 스크롤 변화, 기존 확대 배율 유지.
- 근접, 활, 얼음 시전, 회복, 회피의 이미지 로딩과 프레임 픽셀 변화, reduced-motion 반영.
- 모바일 실제 게임에서 공격 예측 후 실행, 새 전투 화면 진입과 종료, 런타임 오류 없음.
- 별도 폴더에 개발 ZIP 압축 해제 후 `npm ci`, `npm test`, `npm run build` 성공.
- `npm run android:apk`: Gradle assembleDebug 성공.
- APK 메타데이터: com.cheonsu.game, versionName 1.99.128, versionCode 327, minSdk 23, targetSdk 35.
- APK 내 전투 WebP 88개와 새 JS 번들, manifest, service worker 포함 확인.
- apksigner verify: v1/v2 서명 검증 통과, 서명자 1개.

## 범위 밖

- Android 실기기 설치/성능/터치 검사는 아직 수행하지 않았습니다.
- GitHub 원격 업로드와 CI 실행은 하지 않았습니다. ZIP 이동은 가능하며 Git 동기화 절차는 개발 인계 문서에 있습니다.
- 완전한 앱 전체 린트 정리, 기존 의존성 audit 항목 9개(낮음 1, 보통 1, 높음 6, 치명 1)의 보안 검토는 별도 작업입니다. 정식 배포용이 아닌 테스트용 debug APK입니다.
- 별도 폴더 검사는 같은 Windows PC에서 수행했습니다. macOS/Linux 및 다른 실제 PC 검증과 동일하지 않습니다.
