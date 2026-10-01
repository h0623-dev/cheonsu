import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { getInitialParty } from '../src/engine/partyEngine.js';
import { stages } from '../src/data/stages.js';
import fs from 'node:fs';
const currentVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version;

for (const version of ['1.99.148', '1.99.149', '1.99.150']) test(`${version} save survives update without resetting progress or combat`, () => {
  const party = getInitialParty().map((unit, index) => ({ ...unit, level: 3 + index, exp: 73 + index }));
  const stage = structuredClone(stages[0]);
  const units = stage.units.filter(unit => unit.id !== 'bram').map(unit => ({ ...unit,
    ...(unit.id === 'hero' ? { level: 6, exp: 87, hp: 8, acted: true, moved: true, facing: 'left', skillCooldowns: { gale: 2, oath: 1 } } : {}) }));
  const original = normalizeSaveData({ version, selectedStage: stage, party, units,
    screen: 'battle', selectedUnit: 'hero', turn: 'ally', mode: 'move', round: 7,
    deployedIds: ['hero', 'bram', 'lina'], gold: 7654, clearedStages: [1], trainingUsed: true,
    inventory: { potion: 11, hiPotion: 4 }, stageRewardClaimed: true,
    stageMastery: { 1: { clears: 3, bestRank: 'A' } }, savedAt: '2026-09-29T10:00:00.000Z',
  }, version);
  const snapshot = structuredClone(original);
  const restored = normalizeSaveData(JSON.parse(JSON.stringify(original)), currentVersion);
  assert.deepEqual(restored, { ...snapshot, version: currentVersion });
  assert.deepEqual(original, snapshot);
  assert.equal(restored.gold, 7654);
  assert.deepEqual(restored.clearedStages, [1]);
  assert.deepEqual(restored.unlockedStages, [1, 2]);
  assert.equal(restored.trainingUsed, true);
  assert.equal(restored.units.find(unit => unit.id === 'hero').exp, 87);
  assert.equal(restored.units.find(unit => unit.id === 'hero').acted, true);
  assert.ok(!restored.units.some(unit => unit.id === 'bram'), 'fallen ally is not respawned');
});
