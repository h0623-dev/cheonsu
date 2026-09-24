# 천수 전체 아트 통일 기록

## 적용 범위

- ImageGen 내장 도구로 새 원화를 제작했다. 외부 CLI/API 경로는 사용하지 않았다.
- 아군 17명, 적 19종의 전신과 초상화를 같은 45도 하향 시점과 손그림 화풍으로 교체했다.
- 잔디, 흙길, 숲, 바위, 석재, 물, 늪, 눈, 얼음, 저주, 룬, 함정 등 지면 소재 16종을 제작했다.
- 나무, 바위, 성벽, 폐허, 설원 나무, 수정 등 지형 오브젝트 16종을 제작했다.
- 국경, 숲, 요새, 설원, 최종 성채, 야영지 배경 6종을 제작했다. 국경 배경은 메뉴용 큰 원화로 별도 제작했다.
- 메뉴, 지역 선택, 지도 갤러리, 대화, 전투 컷씬, 편성, 야영지와 설치 아이콘에 연결했다.
- 전투 HUD의 강한 검정 윤곽선, 황금색/보라색 발광, 갈색 유광 버튼을 차분한 녹회색/적갈색/청록색으로 정리했다.

## 지형과 캐릭터 정합

이전 버전은 고정 배경 그림에 이동 격자를 겹쳐 그렸다. 새 렌더러는 현재 전투 맵의 각 칸을 읽어 실제 지면과 장애물을 그린다. 기존 전장의 경로 데이터와 저장 형식, 능력치, 전투 규칙은 변경하지 않았다. 저장되어 있던 전투도 같은 렌더러를 사용하므로 새 게임을 시작할 필요가 없다.

- 지면 세로 비율은 가로의 0.82로 통일한다.
- 전신 이미지는 384x480, 발 기준선은 y=448이다. 칼끝이 더 낮은 캐릭터는 별도 보정한다.
- 캐릭터와 지형 오브젝트는 행 위치로 앞뒤를 정한다.
- 길 가까이의 큰 나무 일부는 낮은 바위로 표현해 아군 가림을 줄인다.
- 지면의 같은 소재끼리는 이어지고, 다른 소재 사이만 경계를 부드럽게 한다.
- 지형 생성의 무작위성은 좌표 기반 고정값이다. 화면을 다시 그려도 배치가 흔들리지 않는다.
- 기존 원화는 호환/참조용으로 남겨두고 현재 표시 경로를 새 파일로 교체했다.

## 파일

- 원본: docs/art/world-v2/sources/
- 게임용 이미지: public/art/world-v2/
- 이미지 목록: public/art/world-v2/manifest.json
- 분할/변환: scripts/prepare-world-art.cjs
- 지형 렌더 정보: src/data/worldArt.js
- 캐릭터 연결: src/data/unitVisuals.js
- 공통 스타일: src/world-art.css, src/battle-art.css
- 화면 검수: tmp/world-art-qa/

## 재검증

```powershell
$env:NODE_PATH='C:\\Users\\user\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules'
node scripts/prepare-world-art.cjs
node --test scripts/battlefield-ground.test.mjs scripts/world-art.test.mjs
node scripts/verify-battle-art.cjs 1
node scripts/verify-battle-art.cjs 7
node scripts/verify-battle-art.cjs 13
node scripts/verify-battle-art.cjs 19
node scripts/verify-battle-art.cjs 30
npm.cmd run build
npx.cmd cap copy android
```

단위 검사 64개. 브라우저 검사는 1280x900과 390x844에서 이미지 로딩, 발 위치, 지면 비율, 이동 거리, 확대, 모션 축소, 가로 넘침을 확인한다. 1장에서는 대화, 저장 후 이어하기와 야영지 화면도 확인한다. 실제 Android 기기에서의 터치/성능 검사는 별도로 필요하다.

## 생성 프롬프트

### 1. worldTexturePrompt

```text
Use case: stylized-concept. Production raster texture atlas for CHEONSU, a polished hand-painted tactical fantasy RPG. This is one asset sheet: EXACTLY 4 columns by 4 rows, sixteen square textures covering the whole square image, no gutters, no borders, no labels, no UI.
Art bible: beautiful softly painted gouache/anime background art, clear simplified shapes, moderate detail, soft neutral daylight from upper left, gentle painterly edges, sage and emerald greenery, cool gray stones, muted clay paths, restrained teal water. Not photographic, not pixel art, not grungy/dark, not realistic noise, no glossy 3D. Top-down ground textures only, level orthographic view, no perspective horizon, no elevated objects.
Row1 left to right: short fresh meadow grass; compacted pale earth footpath with tiny pebbles; shady forest floor with moss and tiny fallen leaves; uneven gray-green rocky ground.
Row2: cool gray flagstone courtyard; old pale stone paving with moss seams; tranquil teal river water, small painted ripples; marshy damp green mud.
Row3: soft powder snow; pale icy blue frozen ground with faint cracks; dark charcoal stone earth with muted violet hints; ancient circular teal rune delicately engraved in gray stone floor (one rune centered in this square).
Row4: dark burnt soil with a few warm ember cracks; concealed iron trap set into earth (one low flat small trap centered); close lawn clover and little white flowers; neutral desaturated gray gravel.
Each texture fills its square to the edges, uniformly lit, no edge bevel, no rounded corners, no grid lines. The grass/path/forest/snow materials tile seamlessly on all edges. Keep ground textures low contrast so characters read beautifully. High quality game texture painting, 2048x2048.
```

### 2. worldAlliesPrompt

```text
Use case: stylized-concept. Create one production TRANSPARENT RGBA character sprite atlas for hand-painted fantasy tactics game CHEONSU. Input image is a STYLE AND PALETTE reference only (ground materials), do NOT include any ground.
EXACT layout: 4 equal columns x 5 equal rows, seventeen individual ALLIED hero sprites in row-major order, last three slots empty. Each figure centered in own cell, generous transparent padding, feet at the same bottom baseline of each cell. No figures touching adjacent cells, all weapons fully inside each cell. Image 1536x1920 portrait. REAL transparent background, no checkerboard painted into the pixels, no colored background, no shadows or platforms.
Unified art direction: polished charming hand-painted gouache fantasy, rounded simple volumes, elegant faces, muted sage/teal cloth, cool ivory steel, burgundy accents, gentle soft upper-left sunlight. ALL characters seen from an elevated 45-degree camera looking down: clearly see tops of head and shoulders, foreshortened legs, orthographic three-quarter game view. Face toward bottom-right, neutral relaxed combat-ready standing pose. 3.5-head-tall proportions, NOT large anime heads, NOT realistic tall portrait people. Same character scale and perspective throughout. Crisp silhouettes and clean readable garments. Slight painted line definition, no thick black outlines. No glow. No pixel art. No realism. These must look physically present among small painted trees.
The 17 slots are:
row1: 1 young male swordsman Kyle, short chestnut hair, muted navy tunic and silver shoulder armor, teal short cape, low-held sword; 2 sturdy mature male guardian Bram, beard, ivory steel armor, sage tabard, shield; 3 red-brown haired female archer Lina, practical moss-green cloak, bow held low; 4 long ivory-haired female healer Aria, ivory and muted teal layered robes, small staff.
row2: 5 blonde male lancer Leon, silver armor and muted red scarf, shortened spear held diagonally within cell; 6 dark purple-haired female rogue Sera, charcoal fitted outfit, burgundy waist wrap, short blades; 7 dark-haired young male scholar Noah, forest green coat, small closed book; 8 black-haired female priest Yuna, flowing ivory and dusty rose robes, wood staff.
row3: 9 muscular tan male mercenary Rakan, burgundy sash, leather armor, low axe; 10 dark-haired female fox-spirit mage Miho with small fox ears, ivory/rose robes, no tail sprawl; 11 auburn boy scout Teo, sage hooded cape and shorts, short bow; 12 silver-blonde female ice mage Irene, muted pale blue robe, short icy staff.
row4: 13 male assassin Kaz, dark tied hair, muted plum and gray tunic, dagger; 14 copper-haired female bard Ella, muted teal dress, small lute; 15 East Asian male swordsman Jin, tied black hair, crimson scarf, ivory-gray coat, sheathed katana; 16 blonde male young knight Luka, sage cloak, light silver armor; 
row5: 17 silver-haired older male martial artist Baekho, ivory and moss robes, wrapped fists; last three cells completely transparent.
No text or labels, no ground, no frame, no collage decoration.
```

### 3. worldEnemiesPrompt

```text
Use case: stylized-concept. One production transparent RGBA enemy sprite atlas for CHEONSU. Use the input ALLY ATLAS ONLY as the exact style, anatomy, elevated camera, paint rendering and lighting reference. These enemies must look painted by the SAME artist in the SAME game as those allies. Change characters and equipment only.
Layout EXACTLY 4 columns x 5 rows, 19 enemies in row-major order, bottom-right final cell empty. Each entirely in its own equally sized cell with generous gaps, no overlap, full weapons visible. 1536x1920 portrait. GENUINE transparency, not black, not white, NOT a painted checkerboard. No ground or pedestal, no text, no shadows. Soft upper-left daylight. Three-quarter view looking DOWN from 45 degrees, tops of heads/shoulders visible, natural short 3.5-head figures. Enemy facing bottom-left. Fine softly painted outlines, restrained hues, no pixel art, no photorealism, no bright glow.
Row1: 1 raider swordsman, rough chestnut hair, burgundy tunic, dark leather armor, worn sword; 2 hooded green ranger with simple bow; 3 gray-haired sniper in gray coat with small crossbow; 4 broad muscular marauder in muted red and iron armor with axe.
Row2: 5 elite assassin in charcoal scarf and burgundy armor with two short blades; 6 iron lancer in steel closed helmet and muted red tabard, shortened spear fully inside cell; 7 plague doctor in desaturated sage coat and bone beak mask, staff; 8 weathered beast tamer with fur shoulder mantle and coiled whip, no animal.
Row3: 9 storm mage in muted teal-gray hooded robe, short staff with blue crystal; 10 elegant female blade dancer dark tied hair burgundy outfit, curved blades; 11 siege gunner stocky gray-bearded man with compact hand cannon; 12 sentinel in broad cool iron armor and square shield.
Row4: 13 blackguard in charcoal armor and burgundy cloak, heavy sword; 14 warlord Garon imposing silver-haired older man, ornate black iron armor and crimson cape, greatsword held low; 15 auburn female pyromancer in muted russet robe with ember staff but no glow; 16 pale male frost mage in ivory and muted icy blue robe.
Row5: 17 cultist in desaturated plum robes with bone mask and book; 18 void knight in dark violet-gray armor and jagged shield; 19 one gray wolf animal standing at same overhead camera, compact readable silhouette, natural anatomy; 20 empty.
Keep lively readable faces and clear material volumes matching the ally reference.
```

### 4. worldEnemiesLayoutPrompt

```text
Edit target: input enemy atlas. Preserve every enemy identity, design, style, palette and overhead view exactly. Layout correction ONLY. Repaint and arrange these exact 19 characters on the exact same 4 column x 5 row equal cell atlas but SHRINK EACH figure by 22% about its own cell center, so every character including weapons has at least 12% transparent margin on every side inside its own cell. Especially separate row3 blade dancer feet from row4 warlord head. No character crossing a row or column boundary, no touching between any sprites. Last cell bottom-right remains empty. REAL transparent alpha background. No background color, no checkerboard pixels, no text, no shadows. This is a production atlas that must be mechanically divided into 20 equal rectangles without cutting any silhouette. Portrait 1536x1920.
```

### 5. worldPropsPrompt

```text
Use case: stylized-concept. Create ONE transparent RGBA environment prop sprite atlas for CHEONSU hand-painted tactics game. Reference1 ground materials and reference2 allied characters establish the exact softly hand-painted gouache fantasy style, palette, upper-left sunlight, overhead 45-degree orthographic camera. Match them precisely, never photoreal, never pixel art.
EXACT 4 columns x 4 rows, 16 isolated props, centered within own square cell, generous transparent spacing. Every asset entire and separate, no clipping, no adjacent contact. 2048x2048. GENUINE transparent alpha, not white or black or painted checkerboard. No platform or diamond base, no baked ground or cast shadows, no labels.
Row1: one full round-canopy deciduous tree sage and emerald, visible trunk; one full compact evergreen pine muted deep green; one compact cluster of 3 mossy rounded granite boulders; one short broken pale-gray castle wall section with moss, compact wide rectangle.
Row2: one small weathered stone gateway arch open through center; one ruined square stone pillar with ivy; one full snow-laden evergreen pine; one blue ice crystal rock cluster.
Row3: one gnarled leafless gray dead tree with narrow crown; one cluster of dark amethyst crystals embedded in rock; one small wooden crate stack; one iron brazier containing small warm flame.
Row4: one low sage shrub cluster with tiny white flowers; one red-leaf maple sapling; one little rounded gray stone monument with delicately engraved teal rune; one compact wooden palisade section.
Props seen DOWN from above: visible top faces of stones, upper surfaces of foliage, ellipse foreshortening. Painted with same clean material definition as reference characters. Large tree approx 2.5 character heights in real game but fit source cell. No heavy outlines, no glow, no shadows, no terrain underneath.
```

### 6. worldScenesPrompt

```text
Use case: stylized-concept. Production six-background atlas for CHEONSU fantasy tactics RPG. Reference images define a single cohesive beautiful hand-painted gouache/anime fantasy style: sage green trees, cool stone, painterly brush shapes, soft daylight, no photographic detail, no pixel art. Make scenery that belongs to those exact characters and props.
EXACT 2 columns x 3 rows, 6 evenly sized LANDSCAPE rectangular scenes, each edge-to-edge to its panel, NO gutters, NO frames, NO labels. Whole canvas 2048x1920, each panel about 1024x640, clearly separated only by different scenes. Scenic camera slightly elevated with foreground walkable clearing occupying lower half, distant background occupying upper half. No characters, no words, no UI.
Row1 left: sunny borderland grassy clearing with gently winding pale dirt road through sage woodland toward a small distant ivory-stone gatehouse, red pennants, azure sky, beautiful welcoming scene. Row1 right: ancient mossy forest, broad open glade surrounded by deep emerald deciduous trees, turquoise brook and footbridge, soft mist only in far background.
Row2 left: ruined ivory-stone fortress courtyard, gray flagstone floor, weathered wall and broken arch, ivy and grass, clear neutral daylight. Row2 right: serene snow-covered mountain valley, broad snowy path in foreground, blue ice outcrops, snow-laden evergreen trees, pale azure sky, white stone bridge.
Row3 left: twilight ruined citadel, slate-gray ground, leafless trees, restrained amethyst crystals and small warm braziers, distant ruined keep, plum-gray dusk sky; readable and beautiful, NOT mostly black. Row3 right: tranquil army camp in a meadow at soft late-afternoon light, muted teal canvas tents, low campfire, stacked crates, silver weapons rack, sage trees, open empty foreground. 
Each panel must be a distinct finished game background. Hand-painted softened edges, restrained detail consistent with the transparent props. Balanced green, teal, ivory, gray, burgundy, no yellow-brown cast.
```

### 7. worldTitlePrompt

```text
Use case: stylized-concept. One finished wide 2048x1152 title/background illustration for CHEONSU hand-painted fantasy tactics RPG. Reference1 is the environment prop style, reference2 the exact ally style. Same cohesive hand-painted gouache/anime fantasy art, crisp painted forms, no photographic noise, no pixel art.
Scene: a beautiful sunny borderland clearing, soft sage/emerald woodland, natural grassy banks and little white flowers, cool gray mossy boulders. A broad pale earth road curves from open foreground toward an ivory-stone fortified gatehouse and small distant medieval castle with muted burgundy pennants. Warm-neutral upper-left daylight, bright soft azure sky, a few gentle clouds, calm adventurous feeling. Elevated scenic viewpoint. Trees frame the edges but large clear central area leaves room for title UI. Rich high-quality painting, restrained saturation, no brown-yellow color cast. Clean legible natural materials matching those sprites.
Full bleed SINGLE scene, NO panels, NO borders, NO atlas, no people, no text, no logo, no fake UI.
```

### 8. worldIconPrompt

```text
Use case: stylized-concept. One square polished hand-painted fantasy game app icon for CHEONSU. Match reference image's silver armor, sage fabric, muted teal, warm-neutral upper-left lighting, softly painted gouache/anime materials. Centered beautiful ivory-silver kite shield bearing a simple four-point guiding star emblem in pale gold, short burgundy ribbon tied near the base, a single silver sword behind shield pointed upward. Very restrained oak-leaf sprigs beside shield, clearly distinguishable silhouette at tiny icon scale. Deep muted forest-green solid painted background with subtle material brushwork, NOT a gradient, no glow, no particles. Entire emblem fits inside central 65% of square so circular adaptive masks never crop the subject. Cool ivory, sage, teal, one tiny burgundy accent. No text, no letters, no UI, no frame, no rounded outer corners. Opaque square 1024x1024.
```

