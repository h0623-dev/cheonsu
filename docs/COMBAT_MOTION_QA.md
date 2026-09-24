# 1.99.129 Combat Motion Patch

## Scope

- Six anatomical poses per character: run A/B, windup, strike, recovery, recoil. 36 characters, 216 transparent frames.
- Melee approach/strike/retreat, ranged aim/release, caster windup/release, defender recoil/dodge, support and finish states.
- 1x/2x/3x movement, action delays, cutscenes, effects and banners.
- Two abilities for each of 17 allies, independently stored cooldowns, legacy save migration, healing/cleanse/guard.
- Explicit command selection and target buttons; native modal skill picker and defeat-to-camp dialog.
- Camp return heals the party and clears temporary battle state without victory rewards.

## Automated Checks

- `npm test`: 118 passed, 0 failed. Maps, camera, asset alpha/size/anchors, six distinct frame hashes per unit, 34 abilities, support targets, guard lifecycle, cooldown migration, speed ratios and weapon affinity.
- `node scripts/verify-combat-motion.cjs`: 1280x900, 390x844, 320x568. Seven combat types, exactly one visible body frame throughout sampled phases, changing anatomical frames, reduced-motion fallback and viewport bounds.
- `node scripts/verify-combat-patch.cjs`: settings, four item cancel methods, saved unit/inventory invariance, turn camera, live mobile combat, fifteen presentation fixtures.
- `node scripts/verify-battle-controls.cjs`: skill selection/cancellation, command feedback, independent cooldown, speed persistence and defeat recovery.

## Final Build, 2026-09-22

- `npm test`: all 118 tests passed again.
- Android debug assembly succeeded: `com.cheonsu.game`, version `1.99.129`, versionCode `328`.
- APK contains all 216 motion frames, the 36-character manifest, motion precache and the current production JavaScript bundle.
- APK signatures v1 and v2 verified. Certificate matches the previous 1.99.128 debug APK.
- Motion UI checks passed again at all three viewport sizes. Restoring a defeated save immediately opens the recovery dialog.
- A cold development server exposed duplicate React resolution from `tmp/portable-check`. Vite now scans only the game and test entry points, deduplicates React, and ignores temporary/Android generated files during watch. Retested with the temporary copy still present.
- The motion test now waits for the React scene to mount before examining frames.

Vite configuration reference: [dependency entries](https://vite.dev/config/dep-optimization-options#optimizedeps-entries) and [dependency deduplication](https://vite.dev/config/shared-options#resolve-dedupe).

## Art Pipeline

Built-in image generation created the six source sheets and a separate correction sheet for six overlapping follow-through silhouettes. Sources and prompts live in `docs/art/combat-v2`; runtime assets are in `public/art/combat-v2`. The offline cache includes every motion frame.

QA images are in `tmp/motion-qa` and `tmp/battle-controls-qa`; temporary outputs are intentionally excluded from the portable source ZIP. This is frame animation, not a skeletal rig or motion-capture implementation.

## Limits

Physical Android device touch, GPU performance and installation testing remain unperformed. The debug APK is for testing, not a release-signed store package. Existing bundle-size and dependency-audit warnings are separate follow-up work. No remote Git push or cloud save synchronization was performed.
