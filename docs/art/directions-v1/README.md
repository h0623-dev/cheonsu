# 전장 후면 그림 제작 기록

2026-09-27, 1.99.146. 내장 `image_gen` 도구로 기존 게임의 정면 스프라이트를 참조해 제작했습니다. 외부 게임 그림을 가져오거나 외부 API 키를 사용하지 않았습니다.

`*-reference.png`는 `public/art/map-sprites-v4`의 실제 정면 그림을 격자로 배치한 참조입니다. 같은 이름의 `*.png`는 생성한 투명 배경 후면 원본입니다. 셀은 왼쪽에서 오른쪽, 위에서 아래 순서입니다.

| 원본 | 격자 | 순서 |
| --- | --- | --- |
| allies-a | 3x3 | hero, bram, lina, aria, leon, sera, noah, yuna, rakan |
| allies-b | 3x3 | miho, teo, irene, kaz, ella, jin, luka, baekho, 빈 셀 |
| enemies-a | 5x2 | raider, ranger, sniper, marauder, assassin_elite, iron_lancer, plague_doctor, beast_tamer, storm_mage, blade_dancer |
| enemies-b | 3x3 | siege_gunner, sentinel, blackguard, warlord, pyromancer, frost_mage, cultist, void_knight, wolf |
| bosses | 3x2 | boss_commander, boss_frost, boss_ember, boss_oracle, boss_abyss, 빈 셀 |

## 프롬프트 구성

각 참조 이미지를 실제 첨부하고 다음 공통 지시와 해당 격자/유닛 순서를 지정했습니다.

> Create a production sprite atlas matching the provided character reference sheet. Show every character from a genuine rear three-quarter view facing upper-right / northeast, with the same elevated tactical RPG camera. Preserve each character's identity, hair, outfit, colors, armor, cape, weapon, proportions and hand-painted game style. Show the entire body and weapon, readable at map size. Keep the exact grid and order from the reference, one character per cell with generous transparent margins. Unused cells must remain empty. True transparent alpha background. No text, labels, borders, scenery, floor, cast shadows, halos, new characters or cropped limbs and weapons.

보스 최종 수정 지시:

> Edit this sprite atlas for direct game import. REMOVE ALL background, atmosphere, glow, halos of light, drop shadows and gradients around every sprite. Background must be truly TRANSPARENT alpha, not black, not colored haze. Keep the five rear-facing character illustrations themselves unchanged, including actual physical gold halo ornament on the bottom-left character and colors within their weapons. Resize and reposition each whole character slightly smaller to fit in a precise equal 3 columns x 2 rows grid with at least 15% empty transparent margin INSIDE each cell, including all capes and weapon tips. In particular top-left sword must not cross the first cell border and bottom-center sword must not enter bottom-right cell. Keep same order, bottom-right cell entirely empty transparent. No new text, borders, scenery, effects or characters. Same exact rear-facing poses.

위 공통 지시는 재제작용으로 정리한 프롬프트 구성입니다. 기존 아군/적/보스의 정면 그림은 변경하지 않았습니다.

## 게임용 처리

`node scripts/prepare-direction-art.mjs --refs`로 참조 시트를, `node scripts/prepare-direction-art.mjs`로 게임용 WebP 41종과 manifest/precache 목록을 만듭니다. 원본 alpha를 유지하고 투명 셀 경계에서 분리합니다. 사람형 가시 높이 400px, wolf 260px, 캔버스 높이 480px와 발 기준 y=447로 정규화합니다. 원본/게임용 모두 전체 개발 ZIP에 포함됩니다.

`node --test scripts/unit-facing.test.mjs`는 모든 그림의 투명 여백, 잘림, 발 위치, 크기와 총 용량을 검사합니다. 좌우 방향은 CSS 반전이며 후면은 이 신규 원화를 사용합니다.
