# Project Delivery Rules

- The user requires a fresh Android APK whenever game source or assets are changed. Build and verify the APK from the final source state, link the versioned APK in the final response, and never present an older APK as containing new changes.
- If an APK build is blocked, state the exact blocker and do not claim delivery is complete.
- Keep saves backward compatible. Do not discard the user's existing work.
- User-facing game text and development summaries are in Korean.
- When the user says "원복" without naming a different target, restore the game behavior/art from version 1.99.148, commit `f556e33e113b7f15b1fc1f515a201beded9a1aeb`. This is the fixed baseline before the requested full-field combat redesign, not the immediately preceding patch. See `docs/ROLLBACK_BASELINE.md`. Preserve current saves and unrelated user work. Deliver rollback as a newly numbered, freshly verified APK and signed OTA; never downgrade the public update pointer or force-reset shared Git history.
- The user approved h0623-dev/cheonsu as the public automatic patch channel. For compatible game updates, also package and publish the signed OTA using `npm run update:package` and `npm run update:publish` after final APK verification and source push. Do not call delivery complete when the channel is not updated. Never publish `.update-keys/private.pem`; see `docs/AUTO_UPDATE_1.99.136.md`.

## 클라우드 개발

- 저장소는 `h0623-dev/cheonsu`, 기준 브랜치는 `main`입니다. 상세 설정은 `docs/CODEX_CLOUD.md`를 읽으세요.
- 작업 시작 시 `npm ci`, `npm run setup`을 실행합니다. 검증은 `npm run lint`, `npm test`, `npm run build`, `node scripts/verify-cloud-smoke.mjs`입니다. Chromium이 없으면 `npx playwright install --with-deps chromium`을 실행합니다.
- PC의 파일, 실행 중 서버, 로그인 세션, 서명키가 클라우드에 있다고 가정하지 마세요. APK/OTA 서명키를 클라우드 작업이나 Git 소스에 복사하지 마세요. 서명은 GitHub Actions의 `cheonsu-release` 환경에서만 실행합니다.
- 게임 변경은 새 버전으로 올리고 기존 버전 갱신 규칙을 지킵니다. `main`의 게임 소스 변경은 `Android APK and OTA`를 실행합니다. PR에서의 `Cloud Quality` 통과는 APK/OTA 배포 완료가 아닙니다.
- APK 작업 완료 상태, 최종 소스 커밋, APK/OTA 검증 로그, 공개 Release와 `updates/latest.json`을 확인하고 한국어로 결과와 다운로드 링크를 전달하세요. 실패 시 정확한 차단 사유를 보고하고 과거 APK로 대신하지 마세요.
- 문서/빌드 환경만 바꾸는 작업에서는 이미 공개된 게임 버전을 덮어쓰지 마세요. 수동 `Android APK and OTA`의 `publish=false`로 새 빌드를 검증할 수 있습니다.
