import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stages } from '../src/data/stages.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { sanitizeDeploymentDraft } from '../src/engine/deploymentEngine.js';
import { recoverCampaignProgress, PROGRESS_RECOVERY_BACKUP } from '../src/engine/progressRecovery.js';
import { getUnlockedStageIds, getCampBattleStageId, createDefeatCheckpoint } from '../src/engine/campaignProgress.js';
import { canReplayStory, getNextChapter } from '../src/engine/playerExperience.js';

const legacy = JSON.parse(await readFile(new URL('./fixtures/monster-save-1.99.156.json', import.meta.url), 'utf8'));
const baseline = () => ({ ...structuredClone(legacy.shared), ...structuredClone(legacy.cases[0].save) });
const sequential = count => Array.from({ length: count }, (_, index) => index + 1);
const preserveFields = ['party', 'units', 'inventory', 'gold', 'gearInventory', 'gearEnhance', 'exploration',
  'claimedAchievements', 'claimedChallenges', 'claimedMasteryRewards', 'stageMastery', 'stageNotes', 'snapshotGallery'];
const storageFor = source => {
  const values = new Map([['cheonsu_v01_save', JSON.stringify(source)]]);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('a completed thirty-chapter save opens exactly chapter 31 and preserves every recorded clear', () => {
  assert.equal(stages.length, 50);
  const raw = { ...baseline(), screen: 'campaign', clearedStages: sequential(30), unlockedStages: sequential(30) };
  const before = JSON.stringify(raw);
  const restored = normalizeSaveData(raw, '1.99.163');
  assert.deepEqual(restored.clearedStages, sequential(30));
  assert.deepEqual(restored.unlockedStages, sequential(31));
  assert.equal(getNextChapter(restored.clearedStages), 31);
  assert.equal(getCampBattleStageId(restored), 31);
  assert.equal(canReplayStory(31, 'intro', restored.clearedStages), true);
  assert.equal(canReplayStory(31, 'clear', restored.clearedStages), false);
  assert.equal(canReplayStory(32, 'intro', restored.clearedStages), false);
  assert.equal(JSON.stringify(raw), before);
});

test('new campaign failure and forged unlock records cannot cross any of the nineteen new progression boundaries', () => {
  for (let id = 31; id <= 50; id++) {
    const original = { ...baseline(), screen: 'battle', selectedStage: stages[id - 1], clearedStages: sequential(id - 1),
      unlockedStages: sequential(50), lastBattleResult: { stageId: id, outcome: 'victory' },
      units: baseline().units.filter(unit => unit.id !== 'hero'), trainingUsed: false };
    const { checkpoint } = createDefeatCheckpoint(original);
    assert.deepEqual(checkpoint.clearedStages, sequential(id - 1));
    assert.deepEqual(checkpoint.unlockedStages, sequential(id));
    assert.deepEqual(checkpoint.lastBattleResult, { stageId: id, outcome: 'defeat' });
    assert.equal(checkpoint.trainingUsed, true);
    assert.equal(getCampBattleStageId(checkpoint), id);
    for (const field of ['gold', 'inventory', 'gearInventory', 'gearEnhance', 'exploration', 'claimedAchievements', 'stageMastery']) {
      assert.deepEqual(checkpoint[field], original[field], `${id}장 실패에 ${field}를 보상으로 바꾸지 않습니다`);
    }
  }
  assert.deepEqual(getUnlockedStageIds([1, 30, 50]), [1, 2, 30, 50], '옛 불연속 클리어 기록은 남기고 미클리어 중간 장은 잠급니다');
});

test('saved deployment positions and story replay accept chapters 31 through 50 with the same strict boundaries', () => {
  for (let id = 31; id <= 50; id++) {
    const draft = { stageId: id, placements: { hero: { x: 5, y: 19 }, lina: { x: 6, y: 19 } } };
    assert.deepEqual(sanitizeDeploymentDraft(draft, id), draft);
    assert.deepEqual(sanitizeDeploymentDraft(draft, id - 1), { stageId: id - 1, placements: {} });
    assert.equal(canReplayStory(id, 'clear', sequential(id)), true);
    assert.equal(canReplayStory(id, 'intro', sequential(id - 1)), true);
    assert.equal(canReplayStory(id, 'intro', sequential(id - 2)), false);
  }
  assert.deepEqual(sanitizeDeploymentDraft({ stageId: 51, placements: { hero: { x: 1, y: 1 } } }, 51), { stageId: null, placements: {} });
  assert.equal(canReplayStory(51, 'intro', sequential(50)), false);
  assert.equal(getNextChapter(sequential(50)), null);
  assert.equal(getCampBattleStageId({ clearedStages: sequential(50) }), null);
});

test('explicit progress repair supports new late chapters while preserving the untouched backup and every growth/collection field', () => {
  const source = baseline();
  for (const count of [30, 31, 49, 50]) {
    const storage = storageFor(source);
    const original = storage.getItem('cheonsu_v01_save');
    const result = recoverCampaignProgress(storage, count);
    assert.deepEqual(result.clearedStages, sequential(count));
    assert.deepEqual(result.unlockedStages, sequential(Math.min(50, count + 1)));
    for (const field of preserveFields) assert.deepEqual(result[field], source[field]);
    assert.equal(storage.getItem(PROGRESS_RECOVERY_BACKUP), original);
  }
  const storage = storageFor(source), original = storage.getItem('cheonsu_v01_save');
  assert.throws(() => recoverCampaignProgress(storage, 51), /0~50/);
  assert.equal(storage.getItem('cheonsu_v01_save'), original);
  assert.equal(storage.values.size, 1);
});

test('actual pre-expansion battle saves retain their selected map, commander, live roster, coordinates, HP and progress', () => {
  for (const entry of legacy.cases) {
    const raw = { ...structuredClone(legacy.shared), ...structuredClone(entry.save) };
    const before = JSON.stringify(raw);
    const restored = normalizeSaveData(raw, '1.99.163');
    assert.deepEqual(restored.selectedStage, raw.selectedStage);
    assert.deepEqual(restored.units.map(unit => [unit.id, unit.type, unit.x, unit.y, unit.hp, unit.maxHp, unit.acted, unit.moved]),
      raw.units.map(unit => [unit.id, unit.type, unit.x, unit.y, unit.hp, unit.maxHp, unit.acted, unit.moved]));
    for (const field of ['gold', 'inventory', 'clearedStages', 'gearInventory', 'gearEnhance', 'exploration', 'stageNotes', 'stageMastery', 'claimedAchievements', 'claimedMasteryRewards']) {
      assert.deepEqual(restored[field], raw[field]);
    }
    assert.equal(JSON.stringify(raw), before);
  }
});
