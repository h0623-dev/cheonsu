import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import sharp from 'sharp';
import { combatUnitIds, combatMotionPoses, getCombatMotionSprite, getCombatSprite } from '../src/data/combatArt.js';
import { getPaintedVisualProfile } from '../src/data/unitVisuals.js';

const manifest = JSON.parse(await readFile(new URL('../public/art/enemies-v3/manifest.json', import.meta.url), 'utf8'));
const config = JSON.parse(await readFile(new URL('../docs/art/enemies-v3/sources.json', import.meta.url), 'utf8'));
const report = JSON.parse(await readFile(new URL('../docs/art/enemies-v3/EXTRACTION.json', import.meta.url), 'utf8'));
const ids = ['raider', 'ranger', 'marauder', 'iron_lancer', 'warlord', 'cultist', 'sniper', 'assassin_elite', 'plague_doctor', 'beast_tamer', 'storm_mage', 'blade_dancer', 'siege_gunner', 'sentinel', 'blackguard', 'pyromancer', 'frost_mage', 'void_knight', 'wolf'];
const assetFile = asset => new URL(`../public${asset}`, import.meta.url);

test('all 19 enemies route map, portrait, ready and motion to the same refreshed identity', () => {
  assert.deepEqual(Object.keys(manifest.units).sort(), [...ids].sort());
  assert.deepEqual(manifest.poses, combatMotionPoses);
  for (const id of ids) {
    const unit = manifest.units[id];
    assert.equal(unit.map, `/art/enemies-v3/maps/${id}.webp`);
    assert.equal(unit.portrait, `/art/enemies-v3/portraits/${id}.webp`);
    assert.equal(unit.ready, unit.motion.recover);
    assert.deepEqual(getPaintedVisualProfile(id), { map: `/art/map-sprites-v4/${id}.webp`, battle: unit.ready, portrait: unit.portrait, cutscene: unit.ready });
    assert.equal(getCombatSprite(id), unit.ready);
    assert.equal(getCombatSprite(id, 'action'), unit.motion.strike);
    assert.equal(getCombatMotionSprite(id, 'invalid'), unit.ready);
    for (const pose of combatMotionPoses) assert.equal(getCombatMotionSprite(id, pose), unit.motion[pose]);
  }
  for (const id of combatUnitIds.filter(id => !ids.includes(id) && !id.startsWith('boss_'))) {
    assert.equal(getCombatSprite(id), `/art/combat-v1/units/${id}-ready.webp`);
    assert.equal(getCombatMotionSprite(id), `/art/combat-v2/units/${id}-recover.webp`);
    assert.equal(getPaintedVisualProfile(id).map, `/art/map-sprites-v4/${id}.webp`);
  }
  assert.equal(getCombatMotionSprite('unknown', 'unknown'), '/art/combat-v2/units/raider-recover.webp');
  assert.equal(getCombatSprite('unknown'), '/art/combat-v1/units/raider-ready.webp');
  assert.equal(getPaintedVisualProfile('unknown'), null);
});

test('152 production images exist with genuine alpha, correct sizes, and consistent baselines', async () => {
  for (const id of ids) {
    const unit = manifest.units[id];
    const hashes = new Set();
    const entries = [['map', unit.map, 256, 240], ['portrait', unit.portrait, 256, null], ...combatMotionPoses.map(pose => [pose, unit.motion[pose], 512, 480])];
    for (const [kind, asset, size, baseline] of entries) {
      const buffer = await readFile(assetFile(asset));
      const metadata = await sharp(buffer).metadata();
      assert.equal(metadata.hasAlpha, true, `${id}/${kind}: genuine alpha channel`);
      assert.equal(metadata.width, size);
      assert.equal(metadata.height, size);
      const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let clear = 0;
      let solid = 0;
      let partial = 0;
      let bottom = -1;
      for (let pos = 0; pos < size * size; pos++) {
        const alpha = data[pos * 4 + 3];
        if (!alpha) clear++;
        else if (alpha >= 250) solid++;
        else partial++;
        if (alpha >= 8) {
          const y = Math.floor(pos / size);
          if (alpha > 64) bottom = Math.max(bottom, y);
          if (baseline !== null) {
            assert.ok(pos % size > 0 && pos % size < size - 1 && y > 0, `${id}/${kind}: silhouette clipped by canvas`);
          }
        }
      }
      assert.ok(clear > size * size * 0.1 && solid > 1000 && partial > 0, `${id}/${kind}: nonempty antialiased silhouette, no opaque background`);
      if (baseline !== null) assert.ok(bottom >= baseline - 2 && bottom < baseline, `${id}/${kind}: visible foot baseline ${bottom}`);
      if (combatMotionPoses.includes(kind)) hashes.add(createHash('sha256').update(buffer).digest('hex'));
    }
    assert.equal(hashes.size, id === 'wolf' ? 5 : 6, `${id}: distinct source poses, except the documented wolf alias`);
  }
});

test('wolf windup explicitly reuses refreshed ready while strike uses the new leap', async () => {
  const wolf = manifest.units.wolf;
  assert.deepEqual(report.units.wolf.poseAliases, { windup: 'recover' });
  assert.deepEqual(await readFile(assetFile(wolf.motion.windup)), await readFile(assetFile(wolf.motion.recover)));
  assert.notDeepEqual(await readFile(assetFile(wolf.motion.strike)), await readFile(assetFile(wolf.motion.recover)));
});

test('precache lists every refreshed image exactly once and workspace sources match provenance', async () => {
  const context = { self: {} };
  vm.runInNewContext(await readFile(new URL('../public/art/enemies-v3/precache.js', import.meta.url), 'utf8'), context);
  const expected = Object.values(manifest.units).flatMap(unit => [unit.map, unit.portrait, ...Object.values(unit.motion)]);
  assert.equal(expected.length, 152);
  assert.equal(new Set(context.self.ENEMY_REFRESH_FILES).size, expected.length);
  assert.deepEqual([...context.self.ENEMY_REFRESH_FILES].sort(), [...expected].sort());
  for (const file of context.self.ENEMY_REFRESH_FILES) await access(assetFile(file));
  assert.equal(config.generator, 'Built-in image_gen.imagegen tool');
  assert.equal(config.batches.length, 3);
  for (const batch of config.batches) {
    const buffer = await readFile(new URL(`../docs/art/enemies-v3/${batch.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(buffer).digest('hex'), report.batches.find(entry => entry.id === batch.id).sha256);
  }
});
