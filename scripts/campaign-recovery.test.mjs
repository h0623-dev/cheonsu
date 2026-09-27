import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnlockedStageIds, normalizeClearedStageIds, createVictoryCheckpoint } from '../src/engine/campaignProgress.js';
import { recoverCampaignProgress, PROGRESS_RECOVERY_BACKUP } from '../src/engine/progressRecovery.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { canReplayStory, getNextChapter } from '../src/engine/playerExperience.js';
import { stages } from '../src/data/stages.js';
import { getInitialParty } from '../src/engine/partyEngine.js';

const all = stages.map(stage => stage.id);
const source = { version: '1.99.144', screen: 'battle', party: getInitialParty(), units: [{ id: 'hero', exp: 77 }], selectedStage: stages[2], clearedStages: all,
  gold: 812, inventory: { potion: 5 }, gearInventory: ['ironSword'], gearEnhance: { ironSword: 2 }, exploration: { claimed: ['found'] } };
function storageFor(data = source) {
  const entries = new Map([['cheonsu_v01_save', JSON.stringify(data)]]);
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
for (let completed = 0; completed <= 30; completed++) test(`${completed} sequential clears unlock only replays plus the next chapter`, () => {
  const cleared = Object.freeze(all.slice(0, completed));
  assert.deepEqual(getUnlockedStageIds(cleared), all.slice(0, Math.min(30, completed + 1)));
  assert.equal(getNextChapter(cleared), completed === 30 ? null : completed + 1);
});
test('late legacy clears keep their replay without granting unplayed stages or story spoilers', () => {
  const cleared = Object.freeze([30, 1, 8, 1, 9, null, '2', -1, 99]);
  assert.deepEqual(getUnlockedStageIds(cleared), [1, 2, 8, 9, 30]);
  assert.deepEqual(normalizeClearedStageIds(cleared), [1, 8, 9, 30]);
  assert.equal(canReplayStory(10, 'intro', cleared), false);
  assert.equal(canReplayStory(30, 'clear', cleared), true);
  for (const invalid of [null, {}, 5, 'all']) assert.deepEqual(getUnlockedStageIds(invalid), [1]);
  const raw = { ...source, clearedStages: [1, 30], unlockedStages: all };
  const before = JSON.stringify(raw);
  const migrated = normalizeSaveData(raw);
  assert.deepEqual(migrated.unlockedStages, [1, 2, 30]);
  assert.equal(migrated.selectedStage.id, 3);
  assert.equal(migrated.screen, 'battle', 'ongoing legacy battle is preserved');
  assert.equal(JSON.stringify(raw), before);
  assert.equal(normalizeSaveData({ ...raw, screen: 'deployment' }).screen, 'campaign');
  assert.equal(normalizeSaveData({ ...raw, screen: 'deployment', selectedStage: stages[1] }).screen, 'deployment');
});
test('legitimate full completion is never automatically reduced', () => {
  assert.deepEqual(normalizeSaveData(source).clearedStages, all);
  assert.deepEqual(getUnlockedStageIds(all), all);
});
test('explicit recovery to one clear preserves all growth/items and original backup', () => {
  const storage = storageFor();
  const original = storage.getItem('cheonsu_v01_save');
  const repaired = recoverCampaignProgress(storage, 1);
  assert.deepEqual(repaired.clearedStages, [1]);
  assert.deepEqual(repaired.unlockedStages, [1, 2]);
  assert.equal(repaired.screen, 'campaign');
  for (const key of ['party', 'units', 'gold', 'inventory', 'gearInventory', 'gearEnhance', 'exploration']) assert.deepEqual(repaired[key], source[key]);
  assert.equal(storage.getItem(PROGRESS_RECOVERY_BACKUP), original);
  recoverCampaignProgress(storage, 2);
  assert.equal(storage.getItem(PROGRESS_RECOVERY_BACKUP), original, 'a second repair cannot replace the original');
  assert.deepEqual(normalizeSaveData(JSON.parse(storage.getItem('cheonsu_v01_save'))).unlockedStages, [1, 2, 3]);
});
test('invalid recovery and backup/primary quota failure leave the original save untouched', () => {
  for (const stage of [-1, 31, 1.5, '1', NaN]) {
    const storage = storageFor();
    assert.throws(() => recoverCampaignProgress(storage, stage));
    assert.equal(storage.entries.size, 1);
  }
  for (const key of [PROGRESS_RECOVERY_BACKUP, 'cheonsu_v01_save']) {
    const storage = storageFor(); const before = storage.getItem('cheonsu_v01_save');
    const set = storage.setItem; storage.setItem = (name, value) => { if (name === key) throw Error('quota'); set(name, value); };
    assert.throws(() => recoverCampaignProgress(storage, 1), /quota/);
    assert.equal(storage.getItem('cheonsu_v01_save'), before);
  }
});
test('victory during an older late-stage battle cannot unlock the remaining campaign', () => {
  const data = { ...source, selectedStage: stages[29], clearedStages: [1], stageRewardClaimed: false, supportPoints: {}, battleLoot: { gold: 0, items: {}, gear: [] } };
  const result = createVictoryCheckpoint(data, { reward: { gold: 10, potion: 1 }, party: source.party, careerStats: {}, stageMastery: {}, message: '완료' });
  assert.deepEqual(result.checkpoint.clearedStages, [1, 30]);
  assert.deepEqual(result.checkpoint.unlockedStages, [1, 2, 30]);
});
