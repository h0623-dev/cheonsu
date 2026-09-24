# Combat Art v1

Created with the built-in ImageGen tool. No external API key or CLI fallback was used.

- Source PNGs: `docs/art/combat-v1/sources/`.
- Runtime WebPs: `public/art/combat-v1/` (72 poses + 16 effects).
- Rebuild: `npm run art:combat`.
- Shared neutral upper-left light, gouache texture, side-view camera, right-facing source sprites.
- Ready/action pairs share a scale and foot anchor (480/512). Defenders are mirrored by CSS.
- These are two-pose animations with anticipation, lunge/projectile/cast, impact and recovery. They are not skeletal animations.
- Four atlas columns, five unit rows; effect atlas is 4 by 4. Real alpha is validated by the tests.

## Prompts

### Allies ready

Use case: stylized-concept. Generate a production TRANSPARENT RGBA combat READY POSE sprite atlas for CHEONSU. Input image is identity/costume/style reference for the exact 17 allies. Preserve all identities, faces, hairstyles, costumes and weapons in exact row-major order. Change camera from overhead to SIDE-VIEW battle camera at chest height, three-quarter profile facing RIGHT, showing face, full natural 4-head-tall body and feet. Hand-painted soft gouache anime fantasy matching the reference, gentle upper-left daylight, no thick outlines. NO chibi giant heads, no photorealism, no pixel art.
Exactly 4 columns x 5 rows, 17 individual characters, bottom row first cell occupied and last three empty. Every full figure including weapon occupies ONLY central 72% of its cell with transparent margins on every side. NO contact between cells, feet aligned within each cell. 1536x1920 portrait. REAL transparency, no white/black background, no painted checkerboard, no shadows, no ground, no text.
All in grounded relaxed combat stance facing RIGHT: knees slightly flexed, weapons ready, not attacking. Same proportions and scale. Keep reference order: Kyle sword/teal scarf, Bram armored shield, Lina red-haired green bow, Aria ivory-haired teal healer; Leon blonde red-cape spear, Sera dark rogue, Noah green scholar/book, Yuna ivory-rose priest; Rakan mercenary axe, Miho ivory-rose fox mage, Teo green bow scout, Irene silver ice mage; Kaz charcoal assassin, Ella teal bard/lute, Jin ivory coat/crimson scarf katana, Luka blonde green knight; Baekho older white-haired martial artist.
Every weapon compact and fully inside its cell. No effects.

### Allies action

Use case: stylized-concept. Create matching ACTION POSES for the 17 allies in the reference atlas. Preserve exact identity, costume, hairstyle, weapon, painting style and side-view camera. ALL face RIGHT. This is one production RGBA transparent sprite atlas exactly 4 columns x 5 rows, same character order, bottom row first cell only. Genuine alpha, no checkerboard/background. Each character fits in central 65% of its cell with LARGE empty gaps: shrink figures, never touch neighboring sprites; absolutely no body or weapon crossing cell edges. No labels, no shadow, no ground, no standalone magical effects. 1536x1920.
Change the physical pose with convincing anatomy and weight:
Kyle leans forward with sword cutting diagonally right; Bram braces and thrusts shield right; Lina draws bow aiming right; Aria extends staff and open hand right to cast.
Leon lunges right with compact spear thrust; Sera low crouching rightward dagger strike; Noah opens book and extends casting hand right; Yuna raises staff to bless.
Rakan swings axe right with bent knees; Miho extends one graceful casting palm right; Teo aims fully drawn bow right; Irene points ice staff right.
Kaz thrusts dagger right; Ella strums lute with visible hand gesture; Jin draws katana cutting right with flowing scarf; Luka thrusts sword right.
Baekho throws a right-facing martial arts punch with planted feet.
All feet on comparable baseline, consistent 4-head-tall proportions. Important: bowstrings, hands, knees and weapons anatomically clear. No motion blur, no duplicated limbs, no glow.

### Enemies ready

Use case: stylized-concept. Production transparent RGBA READY POSE sprite atlas for CHEONSU. Reference image is identity/costume palette reference. Preserve all 19 characters exact row-major order. Change to SIDE VIEW, chest-height camera, three-quarter profile facing RIGHT, relaxed grounded combat stance. Hand-painted gouache fantasy, soft upper-left daylight, natural 4-head-tall anatomy, no thick outline, no pixel art. Exactly 4 columns x 5 rows, last cell empty. Each character and weapon fits only central 65% of its cell, LARGE clear transparent gaps. No text, no ground, no shadow, no effects, no checkerboard. 1536x1920 portrait. Row1 red-scarf sword raider, green-hood archer, gray-haired crossbow sniper, broad axe marauder; row2 dark female dual-dagger assassin, silver red-scarf spear lancer, plague-mask staff doctor, fur-cloak whip beast tamer; row3 blue storm mage, red-clad female curved blade dancer, gray-haired cannon gunner, silver shield sentinel; row4 black red-cape sword blackguard, older white-haired black-gold sword warlord, red-haired flame staff pyromancer, silver-haired pale-blue ice mage; row5 violet cultist with book, dark purple full-helmet void knight, natural gray wolf side-on. All full body including feet, all face RIGHT. Compact weapons wholly within each cell.

### Enemies action

Use case: stylized-concept. Matching ACTION POSE sprite atlas of the 19 enemies in reference. Exact same order, identities, costumes, proportions, soft gouache painting. Chest-height side view, ALL facing RIGHT. Genuine transparent RGBA, no background or checkerboard. Exactly 4 columns by 5 rows, final cell empty, 1536x1920. Each sprite only central 65% of cell with LARGE transparent margins, never touch/cross other cells. Full feet, no ground/shadow, no labels, no magic effects, no blur, no duplicated limbs. Row1 sword raider lunges and slashes right, ranger draws bow right, sniper aims crossbow right, marauder swings axe right with bent knees; row2 dual dagger assassin lunges low right, armored lancer thrusts spear right, plague doctor casts staff forward, beast tamer lashes compact whip right; row3 storm mage extends staff right, blade dancer lunges curved blade right, gunner braces and fires cannon right, sentinel shield-bashes right; row4 blackguard cuts right, warlord powerful sword swing right, pyromancer points staff to cast right, frost mage extends staff to cast right; row5 cultist opens book and points right, void knight thrusts sword right, wolf lunges right with front legs stretched and rear feet planted. Important shrink weapons enough for each cell, natural grounded weight and clear anatomy.

### Effects

Use case: stylized-concept. Production hand-painted fantasy battle EFFECTS atlas, genuine transparent RGBA, no characters, no background, no text, no checkerboard. Exactly 4 columns x 4 rows, each effect isolated within central 65% of its cell with wide transparent margins. Soft gouache brush edges consistent with hand-painted tactical RPG characters, luminous ivory highlights but restrained saturation, no photoreal smoke. 1536x1536. Row-major 16 different isolated effects: 1 ivory curved sword slash arc diagonally up-right; 2 narrow ivory straight spear thrust streak pointing right; 3 ONE wooden arrow with white feathers flying horizontally right with tiny painted speed trail; 4 ochre heavy axe impact crescent and small stone flecks; 5 teal steel shield-shaped guard shimmer; 6 orange-red flame burst; 7 pale blue ice crystal burst; 8 turquoise lightning fork; 9 wine-purple shadow blade wisps; 10 ivory gold holy star rays; 11 soft sage-green healing leaves spiraling upward; 12 muted lime poison vapor swirl; 13 pale teal and gold musical ribbons with 3 notes; 14 three pale claw scratch arcs; 15 small ivory spark impact star; 16 teal hand-painted circular casting seal. Not UI icons: organic animation overlay stamps. Every effect wholly inside its own cell, no touching cells, no border/frame.
