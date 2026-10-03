import test from 'node:test';
import assert from 'node:assert/strict';
import { canAttackTarget, canCounter, getAttackTiles, getAttackRange, formatAttackRange, distance } from '../src/engine/movement.js';
import { getEnemyAttackChoice, moveEnemyToward } from '../src/engine/enemyAI.js';
import { withSkill } from '../src/data/skills.js';
import { applyEquipmentStats } from '../src/engine/partyEngine.js';

const map = Array.from({ length: 13 }, () => Array(13).fill('plain'));
const bow = { id: 'lina', type: 'ally', x: 6, y: 6, hp: 30, range: 2, acted: false };
const target = { id: 'enemy', type: 'enemy', x: 7, y: 6, hp: 100, maxHp: 100, range: 1 };

test('single ranges 1 through 4 allow exactly that Manhattan distance, including diagonals', () => {
  for (let range = 1; range <= 4; range++) {
    const unit = { ...bow, range };
    assert.equal(getAttackTiles(unit, 'attack', map).length, 4 * range);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      assert.equal(canAttackTarget(unit, { ...target, x, y }, 'attack', map), distance(unit, { x, y }) === range);
    }
    assert.equal(formatAttackRange(unit), `${range}`);
  }
});

test('explicit attack bands honor both boundaries; invalid and zero ranges never hit', () => {
  const unit = { ...bow, minRange: 2, range: 3 };
  assert.equal(formatAttackRange(unit), '2~3');
  for (let d = 0; d < 5; d++) assert.equal(canAttackTarget(unit, { ...target, x: 6 + d }, 'attack', map), d >= 2 && d <= 3);
  for (const range of [0, -1, NaN, Infinity, 1.5]) assert.deepEqual(getAttackTiles({ ...bow, range }, 'attack', map), []);
  assert.deepEqual(getAttackTiles({ ...bow, minRange: 3, range: 2 }, 'attack', map), []);
});

test('bows cannot attack or counter adjacent enemies; skill range never extends counters', () => {
  assert.equal(canAttackTarget(bow, target, 'attack', map), false);
  assert.equal(canCounter(target, bow, map), false);
  assert.equal(canCounter({ ...target, x: 8 }, bow, map), true);
  const sniper = withSkill(bow, 'snipe');
  assert.equal(canAttackTarget(sniper, { ...target, x: 10 }, 'skill', map), true);
  assert.equal(canCounter({ ...target, x: 10 }, sniper, map), false);
  assert.equal(canCounter(bow, { ...target, x: 8 }, map), false, 'swords cannot counter a two-tile shot');
});

test('spent actions do not block counters at the exact basic attack range', () => {
  for (const type of ['ally', 'enemy', 'boss']) {
    const defender = { ...bow, type, acted: true, moved: true, counterUsed: false };
    const attacker = { ...target, type: type === 'ally' ? 'enemy' : 'ally' };
    const snapshot = structuredClone(defender);
    assert.equal(canCounter({ ...attacker, x: 8 }, defender, map), true, `${type}: two-tile counter`);
    assert.equal(canCounter({ ...attacker, x: 7, y: 7 }, defender, map), true, `${type}: diagonal two-tile counter`);
    assert.equal(canCounter(attacker, defender, map), false, `${type}: no adjacent bow counter`);
    assert.equal(canCounter({ ...attacker, x: 9 }, defender, map), false, `${type}: no three-tile bow counter`);
    assert.equal(canAttackTarget(defender, { ...attacker, x: 8 }, 'attack', map), false, 'ordinary attack remains spent');
    assert.deepEqual(defender, snapshot, 'counter check must preserve action and save state');
  }
  assert.equal(canCounter(target, { ...bow, range: 1, acted: true }, map), true, 'spent melee unit can also counter in range');
});

test('counter availability preserves once-per-turn/death rules and rejects allies and blocked cells', () => {
  for (const state of [{ counterUsed: true }, { acted: true, counterUsed: true }, { hp: 0 }]) assert.equal(canCounter({ ...target, x: 8 }, { ...bow, ...state }, map), false);
  assert.equal(canCounter({ ...target, x: 8, hp: 0 }, bow, map), false);
  assert.equal(canCounter({ ...target, x: 8, type: 'ally' }, bow, map), false);
  const blocked = structuredClone(map); blocked[6][8] = 'wall';
  assert.equal(canCounter({ ...target, x: 8 }, { ...bow, acted: true }, blocked), false);
  assert.equal(canCounter({ ...target, x: 13 }, { ...bow, acted: true }, map), false);
  assert.equal(canCounter(target, undefined, map), false);
  assert.equal(canAttackTarget(bow, { ...target, x: 8 }, 'attack', blocked), false);
  assert.equal(canAttackTarget(bow, { ...target, x: 13 }, 'attack', map), false);
});

test('all bow skills reject adjacency, including learned skills and stale saved fields', () => {
  for (const [id, skillId] of [['lina', 'ember'], ['lina', 'snipe'], ['teo', 'rapid'], ['teo', 'breaker'], ['lina', 'lina-phoenix-flare']]) {
    const unit = withSkill({ ...bow, id, learnedTechniques: [skillId], skillMinRange: 1 }, skillId);
    assert.equal(getAttackRange(unit, 'skill').min, 2);
    assert.equal(canAttackTarget(unit, target, 'skill', map), false);
    assert.equal(canAttackTarget(unit, { ...target, x: 8 }, 'skill', map), true);
    assert.equal(canAttackTarget(unit, { ...target, x: 6 + unit.skillSpec.range + 1 }, 'skill', map), false);
  }
});

test('enemy archer retreats to legal range and cannot move when immobilized or out of movement', () => {
  const archer = { ...bow, id: 'archer', type: 'enemy', aiType: 'archer', move: 2, skillType: 'attack', skillRange: 2 };
  const hero = { ...target, id: 'hero', type: 'ally' };
  assert.equal(getEnemyAttackChoice(archer, [hero], map), null);
  const moved = moveEnemyToward(archer, [hero], [archer, hero], map);
  assert.equal(distance(moved, hero), 2);
  assert.equal(getEnemyAttackChoice(moved, [hero], map).target.id, 'hero');
  for (const state of [{ move: 0 }, { moved: true }, { acted: true }, { status: [{ type: 'freeze' }] }]) {
    const locked = { ...archer, ...state };
    assert.deepEqual(moveEnemyToward(locked, [hero], [locked, hero], map), locked);
  }
});

test('AI falls back to basic attack only when its own range permits it', () => {
  const enemy = { ...target, skillType: 'attack', skillRange: 2 };
  assert.equal(getEnemyAttackChoice(enemy, [bow], map).mode, 'attack');
  assert.equal(getEnemyAttackChoice({ ...enemy, range: 2 }, [bow], map), null);
});

test('equipment preview and equip use identical enhanced stats, do not mutate or stack', () => {
  const unit = applyEquipmentStats({ ...bow, baseAtk: 8, baseDef: 5, skillGuardBoost: 3, gearEnhance: { ironSword: 2, chainArmor: 3 }, equipment: { weapon: 'ironSword', armor: 'chainArmor' } });
  const snapshot = structuredClone(unit);
  assert.equal(unit.atk, 11); assert.equal(unit.def, 13);
  const preview = applyEquipmentStats({ ...unit, equipment: { ...unit.equipment, armor: 'leatherArmor' } });
  assert.equal(preview.atk, 11); assert.equal(preview.def, 9);
  assert.deepEqual(applyEquipmentStats(preview), preview);
  assert.deepEqual(unit, snapshot);
  assert.equal(applyEquipmentStats({ ...unit, equipment: { ...unit.equipment, weapon: null } }).atk, 8);
});
