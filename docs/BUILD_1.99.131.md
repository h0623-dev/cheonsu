# Build 1.99.131 / Android 330

2026-09-22. Package: `com.cheonsu.game`, min SDK 23, target SDK 35.

## Verified

- `npm test`: 183/183 passed.
- Targeted ESLint: discovery, skills, save, enemy-art and modal modules passed. App has no undefined identifiers in the lint audit.
- `verify-discoveries.cjs --viewport 390,320`: 8/8 passed. Latest compact promotion layout rerun at 320px passed. Desktop discovery cases also exercised.
- `verify-battle-controls.cjs --viewport 390`: 10/10 passed, including prior battle controls, speeds and defeat flows.
- `verify-combat-presentation.cjs`: all five desktop/mobile portrait/landscape viewports passed, including three speeds. Enemy baselines verified from image pixels.
- `verify-movement-hud.cjs`: all three viewports passed.
- `verify-release.cjs`: production bundle, stage 2, refreshed enemy files, native centered journal, no browser errors.
- `npm run android:apk`: succeeded from final source. `aapt` confirmed version 1.99.131 / 330. APK signature v1/v2 verified.
- APK contains all 152 new enemy images and final `index-DaQzYv5N.js` / `index-DnUh8QF7.css` bundles.

## Artifacts

- `cheonsu_1.99.131_discovery_debug.apk`
- APK SHA-256: `8C1EE4F704F3DA8BECC2453A34D398A5D80DE6B56D0B67556395EF73A0BDE77A`
- `cheonsu_development_1.99.131.zip`
- Feature scope and locations: `docs/DISCOVERY_PATCH_1.99.131.md`.

## Limits

No physical Android-device install/performance test was performed. This is a debug-signed test APK, not a store release. The existing large-bundle build warning remains. The map's existing floating zoom controls can still overlap terrain/units underneath until the map is panned; new native discovery/promotion modals were checked separately for clipping and overflow.
