# Project Delivery Rules

- The user requires a fresh Android APK whenever game source or assets are changed. Build and verify the APK from the final source state, link the versioned APK in the final response, and never present an older APK as containing new changes.
- If an APK build is blocked, state the exact blocker and do not claim delivery is complete.
- Keep saves backward compatible. Do not discard the user's existing work.
- User-facing game text and development summaries are in Korean.
- The user approved h0623-dev/cheonsu as the public automatic patch channel. For compatible game updates, also package and publish the signed OTA using `npm run update:package` and `npm run update:publish` after final APK verification and source push. Do not call delivery complete when the channel is not updated. Never publish `.update-keys/private.pem`; see `docs/AUTO_UPDATE_1.99.136.md`.
