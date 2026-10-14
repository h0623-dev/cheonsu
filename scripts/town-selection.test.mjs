import test from 'node:test';
import assert from 'node:assert/strict';
import { getInitialParty } from '../src/engine/partyEngine.js';
import { normalizeTownWalkerId } from '../src/engine/townSelection.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { createVictoryCheckpoint, createDefeatCheckpoint } from '../src/engine/campaignProgress.js';
import { stages } from '../src/data/stages.js';

test('구저장과 존재하지 않는 마을 선택은 보유 동료로 복구한다', () => {
  const party = getInitialParty();
  assert.equal(normalizeTownWalkerId('lina', party), 'lina');
  assert.equal(normalizeTownWalkerId('missing', party), 'hero');
  assert.equal(normalizeTownWalkerId(null, party.filter(unit => unit.id === 'aria')), 'aria');
  assert.equal(normalizeTownWalkerId('enemy', [{ id: 'enemy', type: 'enemy' }]), null);
  assert.equal(normalizeSaveData({ party }).campWalkerId, 'hero');
});

test('마을 이동 선택은 전투 선택과 분리되고 승리·철수·저장 불러오기에서 유지한다', () => {
  const party = getInitialParty();
  const data = {
    party, units: party, campWalkerId: 'lina', selectedUnit: 'hero', screen: 'battle',
    selectedStage: stages[0], clearedStages: [], stageRewardClaimed: false,
    inventory: {}, battleLoot: { gold: 0, items: {}, gear: [] }, gold: 300,
    gearInventory: [], supportPoints: {},
  };
  const victory = createVictoryCheckpoint(data, {
    party, reward: { gold: 20, potion: 1 }, message: '승리', careerStats: {}, stageMastery: {},
  }).checkpoint;
  const defeat = createDefeatCheckpoint(data).checkpoint;
  for (const checkpoint of [victory, defeat]) {
    assert.equal(checkpoint.campWalkerId, 'lina');
    assert.equal(checkpoint.selectedUnit, null);
    const restored = normalizeSaveData(JSON.parse(JSON.stringify(checkpoint)));
    assert.equal(restored.campWalkerId, 'lina');
    assert.equal(restored.party.length, party.length);
    assert.deepEqual(restored.clearedStages, checkpoint.clearedStages);
  }
});
