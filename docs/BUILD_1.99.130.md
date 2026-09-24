# 1.99.130 / Android 329

2026-09-22

- Stage information panel: 210 x 108.5 px on desktop; responsive compact text and spacing on mobile.
- All allied units gain one movement point. Enemy movement and terrain costs are unchanged.
- The bonus is computed, not written into base stats, so existing saves benefit without accumulating bonuses on repeated loads.
- Deployment, unit details, compact stats and movement logs display the effective range.
- Tests: 121 Node tests passed. Playwright checks passed at 1280, 390 and 320 px, including panel bounds, overflow, displayed hero movement and browser errors.
- Android debug APK built successfully; version 1.99.130 / 329 and signature verified. Physical-device installation not tested.

Artifacts:

- `cheonsu_1.99.130_movement_hud_debug.apk`
- `cheonsu_development_1.99.130.zip`

Recheck: `npm test`, `node scripts/verify-movement-hud.cjs`, `npm run android:apk`.
