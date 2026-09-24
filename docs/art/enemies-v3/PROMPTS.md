# Enemy Refresh V3

## Generation Provenance

All three supplied atlases were generated with the built-in `image_gen.imagegen`
tool by the parent task. This extraction task made no new generation calls and
performed only connected-alpha isolation, cropping, scaling, placement, and
lossless WebP encoding. No drawing, recoloring, background replacement, pixel
inpainting, or pose fabrication was performed.

The three actual generation prompts are recorded in
[`GENERATION_PROMPTS.md`](GENERATION_PROMPTS.md). The `promptDocument` fields in
`sources.json` link to the corresponding batch; inline `prompt` fields remain
null to avoid duplicating those strings. The layout contract below is the supplied
processing brief. Original generated filenames and paths are retained in
`sources.json`; workspace PNG copies and SHA-256 hashes make the build independent
of those external paths. `EXTRACTION.json` records the measured dimensions,
component counts, ownership adjustment, source bounds, and output placement.

## Supplied Layout Contract

Transparent RGBA enemy animation atlases. Each row retains one enemy's identity,
costume, colors, and weapon across its poses. The six columns, from left to right,
are `run-a`, `run-b`, `windup`, `strike`, `recover`, `recoil`. Map ready sprites and
portraits are derived from each row's recover figure. Preserve genuine alpha and
weapons extending beyond nominal cells by following components and pixel
ownership. Artistic corrections must use the built-in image generation tool;
programmatic work is limited to extraction and format processing.

| Source | Native Size | Rows, Top To Bottom |
| --- | --- | --- |
| `sources/batch-1.png` | 1254x1254 | raider, ranger, marauder, iron_lancer, warlord, cultist |
| `sources/batch-2.png` | 1254x1254 | sniper, assassin_elite, plague_doctor, beast_tamer, storm_mage, blade_dancer |
| `sources/batch-3.png` | 1161x1355 | siege_gunner, sentinel, blackguard, pyromancer, frost_mage, void_knight, wolf |

The last row of batch 3 contains five actual figures: run A, run B, leap, ready,
and recoil. The approved mapping uses leap for strike and ready for both windup
and recover. Two separate output filenames contain identical ready pixels. No
frame from the old wolf is mixed into the new identity.

## Reviewed Identities

| Enemy | Appearance In The Supplied Atlas |
| --- | --- |
| raider | Dark hair, red scarf, dark leather, curved sword |
| ranger | Auburn hair, green hooded cape, leather, bow |
| marauder | Large bearded fighter, fur mantle, tattoos, red sash, axe |
| iron_lancer | Silver closed helmet and armor, red plume and cape, spear |
| warlord | White-haired veteran, dark gold-edged armor, red cape, greatsword |
| cultist | Long dark hair, dark green/red robes, skull-topped staff |
| sniper | Silver-haired crossbow fighter, pale cape, brown armor |
| assassin_elite | Black hood and mask, dark leather, red scarf, twin blades |
| plague_doctor | Beaked mask, broad hat, green coat, hooked staff |
| beast_tamer | Muscular dark-haired fighter, yellow scarf, leather, whip |
| storm_mage | Dark hair, navy/ivory coat, blue crystal staff |
| blade_dancer | Long dark hair, white/red robes, curved swords |
| siege_gunner | Bearded gunner, gold armor, blue cloth, handheld cannon |
| sentinel | Silver closed armor, blue plume, blue/gold shield, sword |
| blackguard | Long dark hair, black/red armor and cape, dark sword |
| pyromancer | Red hair, ivory/red robes, red crystal staff |
| frost_mage | Silver hair, teal/ivory fur-trimmed robes, blue crystal staff |
| void_knight | Closed dark armor, purple cape, dark sword |
| wolf | Grey quadruped, red collar and round gold pendant |

## Extraction And Limits

- Batch 1 contains 36 separate major components. Cross-cell swords, bows, and
  staffs are retained without a uniform cell crop.
- Batch 2 contains 35 major components. Storm mage windup and blade dancer windup
  touch at the raised sword and the mage's forward boot. A source-specific
  ownership outline separates the visible blade. The boot occludes part of the
  blade tip in the source; extraction cannot recover those hidden pixels.
- Batch 3 contains 41 separate major components. The six humanoid rows contain
  all six poses. The wolf row is mapped as described above. The frost mage recoil
  source has an ice effect reaching the atlas's right edge; the body is complete.
- Connectivity uses alpha >= 24; assigned pixels retain their original RGBA.
  Disconnected details attach by distance to actual body pixels, not overlapping
  bounding boxes. Adjacent low-alpha antialiasing is restored within two pixels.
  Isolated tiny components and distant faint source residue are excluded.
- All six poses of an enemy use one common scale. Motion canvases are 512x512
  with the last visible pixel (alpha > 64) at y=479, immediately above the y=480
  ground anchor. This is measured after resampling, so faint residue below a boot
  cannot lift the character. Attached faint pixels remain in the canvas padding.
  Maps are exact 256x256 downsamplings of recover,
  with the corresponding y=240 anchor. The wolf uses the smaller quadruped scale
  from the existing motion pipeline.
- Portraits are 256x256 crops from the isolated recover figure. Reviewed crop
  rectangles are expressed in source-atlas coordinates and never include an
  adjacent figure. Head and upper-body framing can intentionally omit weapons.
- Contact-sheet checkerboards and labels exist only in QA composites. Production
  images keep transparent backgrounds and are encoded as lossless WebP.

## Rebuild And Integration

Run `node scripts/prepare-enemy-refresh.cjs` from the project root. Source files
must already be copied into this directory; the script never reads the recorded
external generated-image paths. Run `node --test scripts/enemy-refresh-art.test.mjs`
for the independent static asset/routing checks.

Outputs:

- `public/art/enemies-v3/motion/{key}-{pose}.webp`: 114 motion files.
- `public/art/enemies-v3/maps/{key}.webp`: 19 maps.
- `public/art/enemies-v3/portraits/{key}.webp`: 19 portraits.
- `public/art/enemies-v3/manifest.json`: paths and canvas metadata.
- `public/art/enemies-v3/precache.js`: `self.ENEMY_REFRESH_FILES`, all 152 images.
- `tmp/enemy-refresh-qa/batch-{1,2,3}-motion.png`: six-pose inspection sheets.
- `tmp/enemy-refresh-qa/batch-{1,2,3}-profiles.png`: map/portrait inspection sheets.
- `docs/art/enemies-v3/EXTRACTION.json`: reproducible extraction evidence.

`getPaintedVisualProfile`, `getCombatSprite`, and `getCombatMotionSprite` route
only keys present in this manifest to V3. Allies and unknown-key fallbacks retain
their existing paths. CombatScene already calls `getCombatMotionSprite`, so it
needs no component change to consume these assets. The parent integrated
`/art/enemies-v3/precache.js` and `self.ENEMY_REFRESH_FILES` into the service worker
and updated `scripts/combat-motion.test.mjs` to use the active asset catalogue and
documented wolf alias. That test retains its alpha > 64 foot-anchor requirement
of 473..480 and its 10000..220000 visible-pixel bounds for 512px motion frames.
