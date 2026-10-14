import assert from 'node:assert/strict';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { withLegacyAccessorySlot, withApprovedAllyMigration } from './qa-legacy-equipment.mjs';
const enemy = { id: 'teo', type: 'enemy', equipment: { weapon: 'x' }, skillRange: 9 };
const old = { id: 'teo', type: 'ally', icon: '⚔️', range: 1, move: 2, skill: 'old', skillType: 'guard', skillRange: 1,
  hp: 8, maxHp: 40, atk: 23, def: 17, x: 4, y: 6, level: 19, exp: 97,
  skillLevel: 4, advancedMastery: 2, activeSkillId: 'rapid', skillCooldown: 3, skillCooldowns: { rapid: 3 },
  equipment: { weapon: 'hunterBow', armor: 'leatherArmor' }, gearEnhance: { hunterBow: 4 }, status: [{ type: 'burn', turns: 2 }] };
const snapshot = structuredClone(old);
assert.deepEqual(withLegacyAccessorySlot([old])[0], { ...old, equipment: { ...old.equipment, accessory: null } });
const migrated = withApprovedAllyMigration([old, enemy]);
assert.equal(migrated[1], enemy);
assert.deepEqual(migrated[0], { ...old, icon: '🏹', range: 2, minRange: 2, move: 3,
  skill: '삼연사', skillType: 'attack', skillRange: 3,
  equipment: { ...old.equipment, accessory: null }, itemPowerBoost: 0, itemGuardBoost: 0 });
assert.deepEqual(old, snapshot);
assert.deepEqual(withApprovedAllyMigration(migrated), migrated);
for (const [id, identity] of [['luka', { icon: '⚔️', range: 1, minRange: 1 }], ['leon', { icon: '🔱', range: 2, minRange: 1 }], ['miho', { icon: '🦊', range: 2, minRange: 2 }], ['ella', { icon: '🎵' }]]) {
  const unit = { ...old, id, activeSkillId: undefined, itemPowerBoost: 3, itemGuardBoost: 5 };
  const out = withApprovedAllyMigration([unit])[0];
  for (const [key, value] of Object.entries(identity)) assert.equal(out[key], value);
  assert.equal(out.itemPowerBoost, 3); assert.equal(out.itemGuardBoost, 5);
  for (const key of ['hp', 'maxHp', 'atk', 'def', 'x', 'y', 'level', 'exp', 'skillLevel', 'advancedMastery', 'skillCooldown', 'skillCooldowns', 'gearEnhance', 'status', 'move']) assert.deepEqual(out[key], unit[key]);
}
const storedBonus = { hp: 2, atk: 1, def: 1, move: 2 };
assert.equal(withApprovedAllyMigration([{ ...old, advancedClassBonus: storedBonus }])[0].move, 5);
assert.equal(withApprovedAllyMigration([{ ...old, move: 8, advancedClassBonus: storedBonus }])[0].move, 8);
assert.equal(withApprovedAllyMigration([{ ...old, advancedClassBonus: { ...storedBonus, move: Infinity } }])[0].move, 3);
const form = ADVANCED_CLASSES.teo[0];
assert.equal(withApprovedAllyMigration([{ ...old, advancedClass: form.id }])[0].move, 3 + form.bonuses.move);
assert.equal(withApprovedAllyMigration([{ ...old, advancedClass: 'mare__form0' }])[0].move, 3);
const live = { ...old, itemPowerBoost: 3, itemGuardBoost: 5 };
assert.equal(withApprovedAllyMigration([live])[0].itemPowerBoost, 3);
assert.equal(withApprovedAllyMigration([live], { camp: true })[0].itemPowerBoost, 0);
assert.equal(withApprovedAllyMigration([live], { camp: true })[0].itemGuardBoost, 0);
console.log('QA175 legacy 독립 migration whitelist/원본·성장·상태 보존 통과');
