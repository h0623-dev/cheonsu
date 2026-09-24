import test from 'node:test';
import assert from 'node:assert/strict';
import { alignMapToArtwork, isPaintedGround } from '../src/data/battlefieldGround.js';
import { findMovePath } from '../src/engine/movement.js';

for (let stage = 1; stage <= 30; stage++) {
  test(`Stage ${stage}: ground registration, connected routes, and space for formations`, () => {
    const width = stage <= 6 ? 12 : 18;
    const height = stage <= 6 ? 26 : 26 + Math.floor((stage - 1) / 10);
    const original = Array.from({ length: height }, () => Array(width).fill('plain'));
    original[Math.floor(height / 2)][Math.floor(width / 2)] = 'fire';
    const snapshot = JSON.stringify(original);
    const aligned = alignMapToArtwork(original, stage);
    const open = aligned.flatMap((row, y) => row.flatMap((terrain, x) => terrain === 'block' ? [] : [{ x, y }]));
    assert.ok(open.length >= 42, 'Enough grounded tiles for allies and a full enemy formation');
    assert.equal(JSON.stringify(original), snapshot, 'Source stage data must not be mutated');
    for (const cell of open) {
      assert.ok(isPaintedGround(stage, (cell.x + 0.5) / width, (cell.y + 0.7) / height));
    }
    const origin = { ...open[0], id: 'hero', type: 'ally', move: 999 };
    for (const target of open.slice(1)) {
      assert.ok(findMovePath(origin, target.x, target.y, [origin], aligned).length, 'Every ground tile must be reachable');
    }
  });
}

test('First six stages register against the actual shared stage-1 art', () => {
  for (let stage = 2; stage <= 6; stage++) {
    for (const [u, v] of [[0.7, 0.17], [0.1, 0.05], [0.56, 0.86]]) {
      assert.equal(isPaintedGround(stage, u, v), isPaintedGround(1, u, v));
    }
  }
});
