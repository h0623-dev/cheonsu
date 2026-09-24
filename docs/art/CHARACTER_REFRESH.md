# 캐릭터·전장 아트 적용 기록

- 제작: 내장 ImageGen 도구. 아군 17명, 적 19종을 새로 생성했습니다.
- 원본: `sources/allies.png`, `sources/enemies.png` (실제 알파 투명 PNG).
- 게임용 파일: `public/sprites/painted-v1/` (36개 전신 WebP, 36개 초상화 WebP).
- `scripts/prepare-painted-sprites.cjs`는 실루엣 단위로 아틀라스를 분리하고 발 기준선을 384x480 캔버스의 y=466에 맞춥니다. 실행 시 `sharp` 패키지가 필요합니다.
- `src/battle-art.css`에서 지형 원본 비율 941:1672를 유지하고 이미지, 클릭 좌표, 이동 애니메이션을 같은 격자에 맞춥니다.
- `src/data/battlefieldGround.js`는 원본 지형의 길·공터와 각 장의 이미지 확대/반전을 반영합니다. 나무·성벽 쪽은 통행을 막고 연결된 길만 사용합니다. 이 조정은 이동 경로와 배치에도 영향을 줍니다.
- 전투가 시작된 기존 저장의 배치는 자동 변경하지 않습니다. 새로 전투에 진입하면 지형 정렬이 적용됩니다.
- 검증: `node --test scripts/battlefield-ground.test.mjs`, `npm run build`, `scripts/verify-battle-art.cjs` (Playwright 필요).

## 아군 생성 프롬프트

```text
Use case: stylized-concept.
Asset type: production transparent sprite atlas for the tactical fantasy RPG Cheonsu, allies. Create ONE sprite-sheet PNG, 2048x2560 portrait, exactly 4 columns and 5 rows of equal 512x512 cells, 17 separate full-body characters ordered below, last three cells empty. Absolutely NO text, labels, borders, grid lines, scenery, platforms, floor, cast shadows, or checkerboard. Genuine transparent alpha background. Each character completely within its cell, centered horizontally, both feet on common baseline at 90% of cell height, with head near 12%, weapons entirely within cell. Never overlap cells.
Art direction: beautiful polished hand-painted fantasy strategy game miniatures with refined expressive faces, elegant organic anatomy, approximately 4.5 heads tall, NOT big-headed chibi, NOT flat stickers, NOT pixel art. Elevated three-quarter camera looking down 30 degrees matching an overhead hand-painted forest fortress battlefield; all characters face slightly to viewer's right. Soft daylight from upper left, muted rich materials, warm highlights, subtle cool shadows, crisp readable silhouette, restrained detail, no black outlines or glow. Grounded relaxed battle-ready posture, balanced weight and visible boots. Consistent rendering across all 17.
Row 1 left to right:
1 Kyle, handsome young adult brown-haired male swordsman, blue and silver armor, navy short cape, silver sword held low at side.
2 Bram, broad mature male guardian, cropped dark hair, steel plate, forest green cloth, large shield and mace, face visible.
3 Lina, adult red-haired female fire mage, burgundy coat over ivory dress, gold trim, small ruby-topped staff, confident.
4 Aria, adult blonde female healer, ivory and soft sage robes, gold circlet, slim golden staff, gentle.
Row 2:
5 Leon, adult auburn-haired male archer, moss-green cloak, tan leather, longbow at side and quiver.
6 Sera, adult silver-haired female rogue, charcoal leather with plum scarf, twin daggers down at sides.
7 Noah, adult dark-haired male tactician, teal military coat, brass trim, a closed book held at waist.
8 Yuna, adult silver-blue-haired female moon healer, blue and white robes, crescent-topped staff.
Row 3:
9 Rakan, muscular adult male wild warrior, russet hair, leather and warm fur mantle, claw gauntlets.
10 Miho, adult dark-haired female illusion swordswoman, rose and ivory layered outfit, one slender curved sword.
11 Teo, stocky adult male heavy infantry, steel armor and ochre cloth, two-handed hammer resting at side.
12 Irene, adult pale-blue-haired female lancer, white-silver armor, ice-blue cape, slim crystal spear.
Row 4:
13 Kaz, adult black-haired male shadow scout, charcoal and muted violet cloth, short sword, face partly masked.
14 Ella, adult violet-haired female astral mage, plum and silver robes, compact star staff.
15 Jin, adult dark-haired male dragon knight, wine-red and gold plate, long spear, small swept helmet crests.
16 Luka, adult brown-haired female sharpshooter, olive cloak, leather armor, compact crossbow held low.
Row 5:
17 Baekho, adult white-haired muscular male martial guardian, white fur shoulders, black-and-silver armor, gold fist guards; human face.
18, 19, 20 remain completely transparent.
This is a usable game texture atlas, not a presentation poster. Beautiful professional cohesive characters, no doll limbs, no enormous heads.
```

## 적 생성 프롬프트

```text
Use case: stylized-concept. Production enemy character sprite atlas for Cheonsu fantasy tactical RPG.
Create a brand-new hand-painted fantasy strategy game character atlas, with natural proportions, refined beautiful character illustration, soft material lighting and elevated three-quarter camera.
Canvas: portrait 4 columns by 5 rows of equal square cells. Exactly 19 separate sprites, last cell empty. TRANSPARENT alpha background. No labels, no text, no grid, no shadows, no scenery or checkerboard. All full bodies and every weapon fit inside own cell with generous 12% blank gutters on EVERY side. Character height no more than 76% of one cell! Feet at 88% cell height, heads below 12%. Clear gap between rows. Consistent 4.5-head-tall proportions, slightly overhead three-quarter camera, faces turned slightly LEFT for opposing army. Relaxed balanced ready poses, visible boots, clean silhouettes, beautifully sculpted cloth, armor, faces. Restrained saturation, upper-left natural daylight. No heavy outlines, no glow.
Row 1 left-right: 1 raider: muscular male raider with russet short hair, red scarf, leather armor and small axe; 2 ranger: lean male forest ranger in dark moss cloak with bow; 3 sniper: female scarlet-hooded sharpshooter carrying crossbow; 4 marauder: male rugged leather-armored spearman with bronze spear.
Row 2: 5 assassin_elite: slim adult masked assassin in black and muted plum leather with dagger; 6 iron_lancer: steel-plated knight with crimson tabard and short upright lance; 7 plague_doctor: masked dark-green-robed plague doctor with small medical satchel and crooked staff; 8 beast_tamer: leather-armored male beast tamer with fur collar and coiled whip.
Row 3: 9 storm_mage: adult silver-haired male storm mage in teal and silver robes with blue crystal staff; 10 blade_dancer: adult female dark-haired dual swordswoman in crimson and charcoal light armor; 11 siege_gunner: stocky male gunner in leather and iron with compact shoulder-held hand cannon; 12 sentinel: steel-armored guard with red cloth, broad shield and sword.
Row 4: 13 blackguard: dark iron knight with burgundy short cape and broadsword; 14 warlord: imposing commander with antique gold armor and crimson cape, sword held low; 15 pyromancer: adult red-haired male fire sorcerer in charcoal and scarlet robes with ruby staff; 16 frost_mage: adult white-haired female frost witch, ice-blue robes and pale crystal staff.
Row 5: 17 cultist: adult hooded priest in muted violet robes, book and staff; 18 void_knight: imposing obsidian and silver armored knight, dark violet cape, horned helmet and broad sword; 19 wolf: silver-gray wolf standing on four legs in matching painterly game style, angled left; 20 entirely empty transparent.
Output the sprites isolated with real transparent alpha. No reference image.
Highest priority: actual transparent background exactly like a PNG game asset. A fully transparent canvas surrounding the characters. Never illustrate transparency with gray squares.
```

