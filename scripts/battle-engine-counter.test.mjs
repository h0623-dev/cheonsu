import test from 'node:test';
import assert from 'node:assert/strict';
import { canCounterattack } from '../src/engine/battleEngine.js';
import { canCounter } from '../src/engine/movement.js';

const map = Array.from({ length: 7 }, () => Array(7).fill('plain'));
const bow = { id: 'lina', type: 'ally', x: 2, y: 2, hp: 30, range: 2 };
const enemy = { id: 'archer', type: 'enemy', x: 3, y: 2, hp: 30, range: 2 };

test('public counter API keeps defender-first arguments and the same two-cell bow range as live combat', () => {
  for (const type of ['ally', 'enemy', 'boss']) {
    const defender = { ...bow, type, minRange: 2, range: 2, skillRange: 4 };
    const attacker = { ...enemy, type: type === 'ally' ? 'enemy' : 'ally' };
    for (const [x, y, expected] of [[3, 2, false], [4, 2, true], [3, 3, true], [5, 2, false], [2, 2, false]]) {
      const target = { ...attacker, x, y };
      assert.equal(canCounterattack(defender, target), expected);
      assert.equal(canCounterattack(defender, target, map), canCounter(target, defender, map));
    }
  }
  assert.equal(canCounterattack(bow, { ...enemy, x: 4 }), true, 'a legacy two-cell bow without an explicit minimum is an exact ring');
  assert.equal(canCounterattack({ ...bow, range: 1 }, { ...enemy, range: 3 }), true, 'the defender owns the counter range');
});

test('public counter API preserves explicit bands and never uses skill range or extends the maximum', () => {
  const defender = { ...bow, minRange: 1, range: 3, skillRange: 5, skillMinRange: 2 };
  for (let distance = 0; distance <= 4; distance++) {
    const target = { ...enemy, x: bow.x + distance };
    assert.equal(canCounterattack(defender, target), distance >= 1 && distance <= 3);
  }
  for (const invalid of [0, -1, NaN, Infinity, 1.5]) {
    assert.equal(canCounterattack({ ...bow, range: invalid }, { ...enemy, x: 4 }), false);
  }
  assert.equal(canCounterattack({ ...bow, minRange: 3, range: 2 }, { ...enemy, x: 4 }), false);
});

test('public counters respect death and once-per-turn flags while guard and spent actions remain counterable', () => {
  const target = { ...enemy, x: 4 };
  for (const state of [{ guard: true }, { acted: true }, { moved: true }, { guard: true, acted: true, moved: true }]) {
    const defender = { ...bow, ...state };
    const snapshot = structuredClone(defender);
    assert.equal(canCounterattack(defender, target), true);
    assert.equal(canCounterattack(defender, target, map), true);
    assert.deepEqual(defender, snapshot);
  }
  for (const state of [{ hp: 0 }, { hp: -1 }, { counterUsed: true }, { guard: true, counterUsed: true }]) {
    assert.equal(canCounterattack({ ...bow, ...state }, target), false);
    assert.equal(canCounterattack({ ...bow, ...state }, target, map), false);
  }
  assert.equal(canCounterattack(bow, { ...target, hp: 0 }), false);
  assert.equal(canCounterattack(bow, { ...target, type: 'ally' }), false);
  assert.equal(canCounterattack({ ...bow, type: 'boss' }, target), false);
  assert.equal(canCounterattack(null, target), false);
  assert.equal(canCounterattack(bow, null), false);
  assert.equal(canCounterattack({ x: 0, y: 0, hp: 10, range: 1 }, { x: 1, y: 0, hp: 10 }), true,
    'old two-argument callers without faction fields retain their positional contract');
});

test('optional map validation shares blocked-cell and board-boundary rules with live combat', () => {
  const target = { ...enemy, x: 4 };
  const blocked = structuredClone(map); blocked[2][4] = 'wall';
  assert.equal(canCounterattack(bow, target, blocked), false);
  assert.equal(canCounterattack(bow, { ...target, x: 7 }, map), false);
  assert.equal(canCounterattack({ ...bow, x: -1 }, { ...target, x: 1 }, map), false);
  assert.equal(canCounterattack(bow, target, map), true);
});
