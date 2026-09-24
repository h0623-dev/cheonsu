import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { combatUnitIds, combatMotionPoses, getCombatMotionSprite, getCombatPresentation } from '../src/data/combatArt.js';
import { getUnitCombatClass } from '../src/engine/combat.js';
import { withSkill } from '../src/data/skills.js';

test('all 41 combat characters have transparent anchored frames from their active art catalogue', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/art/combat-v2/manifest.json', import.meta.url), 'utf8'));
  const enemies = JSON.parse(await readFile(new URL('../public/art/enemies-v3/manifest.json', import.meta.url), 'utf8'));
  const bosses = JSON.parse(await readFile(new URL('../public/art/bosses-v1/manifest.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(manifest.units).length, 36);
  assert.equal(combatMotionPoses.length, 6);
  for (const id of combatUnitIds) {
    const hashes = new Set();
    for (const pose of combatMotionPoses) {
      const asset = getCombatMotionSprite(id, pose);
      assert.equal((bosses.units[id]?.motion || enemies.units[id]?.motion || manifest.units[id])[pose], asset);
      const source = await readFile(new URL(`../public${asset}`, import.meta.url));
      hashes.add(createHash('sha256').update(source).digest('hex'));
      const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, 512);
      assert.equal(info.height, 512);
      let visible = 0;
      let bottom = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 64) { visible++; bottom = Math.floor(i / 4 / info.width); }
      assert.ok(visible > 10000 && visible < 220000, `${id}/${pose}: nonempty transparent silhouette`);
      assert.ok(bottom >= 473 && bottom <= 480, `${id}/${pose}: foot anchor ${bottom}`);
    }
    // The new wolf atlas has five authored poses; windup intentionally holds its ready stance.
    assert.equal(hashes.size, id === 'wolf' ? 5 : 6, `${id}: authored poses must remain distinct`);
  }
});

test('support skills are never presented as misses or zero-damage attacks', () => {
  const guard = getCombatPresentation('hero', { outcome: { guard: true, hit: false, damage: 0 } });
  assert.equal(guard.support, true);
  assert.equal(guard.guarding, true);
  assert.equal(guard.miss, false);
  assert.equal(guard.effect, 'guard');
  assert.equal(guard.style, 'cast');
});

test('chosen skill effect overrides old character skill effects', () => {
  const scene = { mode: 'skill', attacker: { skillSpec: { effect: 'arrow' } }, effectType: 'fire', outcome: { hit: true } };
  assert.equal(getCombatPresentation('lina', scene).effect, 'arrow');
  assert.equal(getCombatPresentation('lina', scene).style, 'ranged');
  assert.equal(getCombatMotionSprite('unknown', 'unknown'), '/art/combat-v2/units/raider-recover.webp');
});

test('weapon affinities match art and remain stable when switching abilities', () => {
  for (const [id, expected] of [['hero', 'sword'], ['lina', 'bow'], ['leon', 'spear'], ['luka', 'sword'], ['teo', 'bow'], ['miho', 'magic']]) {
    assert.equal(getUnitCombatClass({ id }), expected);
  }
  assert.equal(getUnitCombatClass(withSkill({ id: 'hero' }, 'oath')), 'sword');
  assert.equal(getUnitCombatClass(withSkill({ id: 'bram' }, 'bash')), 'shield');
});
