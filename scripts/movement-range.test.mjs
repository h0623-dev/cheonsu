import test from 'node:test';
import assert from 'node:assert/strict';
import { getMoveTiles, getUnitMoveRange } from '../src/engine/movement.js';

const map = [Array(8).fill('plain')];
const ally = { id: 'hero', type: 'ally', move: 3, x: 0, y: 0 };
const reachable = (unit, terrain = map, units = [unit]) => getMoveTiles(unit, units, terrain).map(tile => tile.x);

test('allies gain one tile, including slower allies; enemies retain base range', () => {
  assert.deepEqual(reachable(ally), [0, 1, 2, 3, 4]);
  assert.deepEqual(reachable({ ...ally, id: 'bram', move: 2 }), [0, 1, 2, 3]);
  assert.deepEqual(reachable({ ...ally, type: 'enemy' }), [0, 1, 2, 3]);
  assert.equal(getUnitMoveRange(null), 0);
});

test('movement bonus does not mutate stats or accumulate across saved copies', () => {
  let saved = structuredClone(ally);
  for (let i = 0; i < 5; i++) {
    assert.equal(getUnitMoveRange(saved), 4);
    reachable(saved);
    saved = JSON.parse(JSON.stringify(saved));
    assert.equal(saved.move, 3);
  }
});

test('extra movement preserves terrain costs, blockers and action restrictions', () => {
  assert.deepEqual(reachable(ally, [['plain', 'forest', 'plain', 'plain', 'plain']]), [0, 1, 2, 3]);
  assert.deepEqual(reachable(ally, [['plain', 'wall', 'plain']]), [0]);
  assert.deepEqual(reachable(ally, map, [ally, { id: 'enemy', x: 2, y: 0 }]), [0, 1]);
  for (const condition of [{ moved: true }, { acted: true }, { status: [{ type: 'freeze' }] }]) {
    assert.deepEqual(reachable({ ...ally, ...condition }), []);
  }
});
