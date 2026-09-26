import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { CHARACTER_SKILLS, withSkill } from '../src/data/skills.js';
import { DISCOVERY_TECHNIQUES } from '../src/data/discoveries.js';
import { getAttackTiles, getTilesInRadius } from '../src/engine/movement.js';

const map = Array.from({ length: 13 }, () => Array(13).fill('plain'));
const actor = { type: 'ally', x: 6, y: 6, hp: 30, range: 2, acted: false };

test('all 34 skill ranges match their specification, never the normal weapon range', () => {
  for (const [id, skills] of Object.entries(CHARACTER_SKILLS)) {
    for (const skill of skills) {
      const unit = withSkill({ ...actor, id }, skill.id);
      const tiles = getAttackTiles(unit, 'skill', map);
      assert.equal(tiles.length, skill.type === 'attack' ? 2 * skill.range * (skill.range + 1) : 0, skill.id);
      for (const tile of tiles) {
        const distance = Math.abs(tile.x - unit.x) + Math.abs(tile.y - unit.y);
        assert.ok(distance >= 1 && distance <= skill.range, skill.id);
      }
      assert.equal(getAttackTiles(unit, 'attack', map).length, 12);
    }
  }
});

test('explicit zero range, dead/acted units, map edges and blocked cells cannot be targets', () => {
  assert.deepEqual(getAttackTiles({ ...actor, skillRange: 0 }, 'skill', map), []);
  assert.deepEqual(getAttackTiles({ ...actor, range: 0 }, 'attack', map), []);
  for (const state of [{ acted: true }, { hp: 0 }]) assert.deepEqual(getAttackTiles({ ...actor, ...state }, 'attack', map), []);
  assert.deepEqual(getAttackTiles(actor, 'attack', []), []);
  const irregular = [['plain', 'wall', 'plain'], ['plain'], ['void', 'block', 'plain']];
  assert.deepEqual(getAttackTiles({ ...actor, x: 0, y: 0, range: 4 }, 'attack', irregular), [
    { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 2 },
  ]);
  assert.deepEqual(getTilesInRadius({ x: 0, y: 0 }, 0, irregular), [{ x: 0, y: 0 }]);
});

test('discovered techniques use their own ranges after loading learned skill IDs', () => {
  for (const skill of Object.values(DISCOVERY_TECHNIQUES)) {
    const unit = withSkill({ ...actor, id: skill.unitId, learnedTechniques: [skill.id] }, skill.id);
    assert.equal(unit.activeSkillId, skill.id);
    assert.equal(getAttackTiles(unit, 'skill', map).length, skill.type === 'attack' ? 2 * skill.range * (skill.range + 1) : 0);
  }
});

test('chosen skill specification overrides stale legacy skillRange fields', () => {
  const unit = withSkill({ ...actor, id: 'lina' }, 'snipe');
  unit.skillRange = 1;
  assert.equal(getAttackTiles(unit, 'skill', map).length, 40);
});

test('area preview and damage share a Manhattan footprint without friendly fire', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('function getSkillAreaRadius(');
  const end = source.indexOf('function getAreaSkillLabel(', start);
  const context = { getTilesInRadius, getSkillUpgradeLevel: () => 0 };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const caster = withSkill({ ...actor, id: 'noah' }, 'chain');
  const center = { id: 'target', type: 'enemy', hp: 50, x: 7, y: 6 };
  const units = [caster, center,
    { ...center, id: 'splash', x: 8 },
    { ...center, id: 'diagonal', x: 8, y: 7 },
    { ...center, id: 'ally', type: 'ally', y: 5 },
    { ...center, id: 'dead', y: 7, hp: 0 },
  ];
  const preview = getTilesInRadius(center, caster.skillSpec.radius, map);
  const damaged = context.getAreaTargets(caster, center, units, map);
  assert.equal(preview.length, 5);
  assert.deepEqual(Array.from(damaged, unit => unit.id), ['splash']);
  assert.ok(damaged.every(unit => preview.some(tile => tile.x === unit.x && tile.y === unit.y)));
  const blocked = structuredClone(map);
  blocked[6][8] = 'block';
  assert.equal(context.getAreaTargets(caster, center, units, blocked).length, 0);
});
