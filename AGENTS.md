# Project Delivery Rules

## 최신 사용자 지시: 코드 작업 후 검증 생략

- 2026-10-05 KST 사용자가 "코드 작업 후에 검증하지 않도록 스킬 저장하고 엄격히 준수해"라고 명시했습니다. 이 저장소에서 작업할 때 [검증 생략 스킬](.agents/skills/cheonsu-no-post-change-validation/SKILL.md)을 읽고 적용합니다.
- 사용자가 다시 검증을 명시적으로 요청하기 전에는 코드 수정 후 테스트·린트·스모크·브라우저/화면 QA·회귀 검사·아티팩트 대조를 직접 실행하거나 다른 에이전트에 맡기지 않습니다. 검증 목적의 빌드, 검증용 개발 서버, 수동 CI 검사도 실행하지 않습니다.
- 이 최신 사용자 지시는 아래 및 기존 문서의 에이전트 검증 지시보다 우선합니다. 과거 인수인계의 검사 목록을 자동으로 실행하지 않습니다.
- 요청한 APK·OTA를 제작하기 위한 빌드·패키징·서명과 기존 저장·변경 보존은 유지합니다. 별도 검증을 하지 않은 결과를 통과·검증 완료로 보고하지 않습니다.
- 기존 GitHub Actions가 자동 실행하는 검사는 에이전트의 직접 검증과 구분합니다. 이 스킬 저장 요청만으로 워크플로를 삭제·비활성화하거나 서명·배포 보호를 변경하지 않습니다. 이번 스킬·문서 저장 커밋에는 `[skip ci]`를 사용합니다.

- The user requires a fresh Android APK whenever game source or assets are changed. Build and verify the APK from the final source state, link the versioned APK in the final response, and never present an older APK as containing new changes.
- If an APK build is blocked, state the exact blocker and do not claim delivery is complete.
- Keep saves backward compatible. Do not discard the user's existing work.
- User-facing game text and development summaries are in Korean.
- 사용자가 다른 대상을 지정하지 않고 "원복"이라고 하면 천수 1.99.154 / Android 353, 소스 커밋 `801234d1c99d0cdc7c11d645e111f64336e80672`의 게임 동작·아트·구성 전체를 복원합니다. 2026-10-03 사용자가 현재 배포 상태를 새 원복 기준으로 지정한 명시적 요청에 따라 변경한 기준이며, 이후 전 캐릭터 리디자인·마을 걷기 모션 작업 전에 고정합니다. 보존 태그는 `codex/rollback-1.99.154`이며, 예전 1.99.148은 역사적 별도 기준으로 보존합니다. 상세 절차와 기준은 `docs/ROLLBACK_BASELINE.md`를 따릅니다. 현재 저장·진행도·수집 데이터와 무관한 사용자 작업을 보존하고, 새로운 상위 버전의 최종 소스로 fresh APK를 제작·검증한 뒤 signed OTA까지 배포합니다. 공개 업데이트 포인터를 낮추거나 공유 Git 이력을 강제 reset/push하지 않습니다.
- The user approved h0623-dev/cheonsu as the public automatic patch channel. For compatible game updates, also package and publish the signed OTA using `npm run update:package` and `npm run update:publish` after final APK verification and source push. Do not call delivery complete when the channel is not updated. Never publish `.update-keys/private.pem`; see `docs/AUTO_UPDATE_1.99.136.md`.

## 클라우드 개발

- 저장소는 `h0623-dev/cheonsu`, 기준 브랜치는 `main`입니다. 상세 설정은 `docs/CODEX_CLOUD.md`를 읽으세요.
- 작업 시작 시 `npm ci`, `npm run setup`을 실행합니다. 검증은 `npm run lint`, `npm test`, `npm run build`, `node scripts/verify-cloud-smoke.mjs`입니다. Chromium이 없으면 `npx playwright install --with-deps chromium`을 실행합니다.
- PC의 파일, 실행 중 서버, 로그인 세션, 서명키가 클라우드에 있다고 가정하지 마세요. APK/OTA 서명키를 클라우드 작업이나 Git 소스에 복사하지 마세요. 서명은 GitHub Actions의 `cheonsu-release` 환경에서만 실행합니다.
- 게임 변경은 새 버전으로 올리고 기존 버전 갱신 규칙을 지킵니다. `main`의 게임 소스 변경은 `Android APK and OTA`를 실행합니다. PR에서의 `Cloud Quality` 통과는 APK/OTA 배포 완료가 아닙니다.
- APK 작업 완료 상태, 최종 소스 커밋, APK/OTA 검증 로그, 공개 Release와 `updates/latest.json`을 확인하고 한국어로 결과와 다운로드 링크를 전달하세요. 실패 시 정확한 차단 사유를 보고하고 과거 APK로 대신하지 마세요.
- 문서/빌드 환경만 바꾸는 작업에서는 이미 공개된 게임 버전을 덮어쓰지 마세요. 수동 `Android APK and OTA`의 `publish=false`로 새 빌드를 검증할 수 있습니다.
