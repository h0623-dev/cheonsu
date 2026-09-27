import test from 'node:test';
import assert from 'node:assert/strict';
import { createStagePreviewReader } from '../src/engine/stagePreviewCache.js';

test('stage previews build once per stage identity and deployment count', () => {
  let builds = 0;
  const read = createStagePreviewReader((stage, count) => { builds++; return { ...structuredClone(stage), count }; });
  const stage = { id: 1, units: [{ id: 'hero', hp: 24 }], map: [['plain']] };
  const first = read(stage, 4);
  for (let i = 0; i < 100; i++) assert.equal(read(stage, 4), first);
  assert.equal(builds, 1);
  assert.notEqual(read(stage, 5), first);
  assert.equal(read(stage, 5).count, 5);
  const changed = { ...stage, map: [['forest']] };
  assert.deepEqual(read(changed, 4).map, [['forest']]);
  assert.equal(builds, 3);
  assert.deepEqual(stage.units, [{ id: 'hero', hp: 24 }]);
});

test('missing stage does not generate a preview', () => {
  const read = createStagePreviewReader(() => { throw new Error('Must not build'); });
  assert.equal(read(null, 4), null);
  assert.equal(read(undefined, 4), undefined);
});

test('failed preview build can be retried and is never cached as success', () => {
  let attempts = 0;
  const read = createStagePreviewReader(stage => { if (++attempts === 1) throw new Error('failed'); return { ...stage }; });
  const stage = { id: 2 };
  assert.throws(() => read(stage, 4));
  assert.deepEqual(read(stage, 4), stage);
  read(stage, 4);
  assert.equal(attempts, 2);
});
