import { stages } from '../data/stages.js';
import { mergePartyFromUnits } from './partyEngine.js';

export function normalizeLastBattleResult(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || !Object.hasOwn(raw, 'stageId') || !Object.hasOwn(raw, 'outcome')
    || !Number.isInteger(raw.stageId) || !stages.some(stage => stage.id === raw.stageId)
    || !['victory', 'defeat'].includes(raw.outcome)) return null;
  return { stageId: raw.stageId, outcome: raw.outcome };
}

export function getCampTrainingAvailability({ trainingUsed = false, lastBattleResult = null } = {}) {
  if (normalizeLastBattleResult(lastBattleResult)?.outcome === 'defeat') {
    return { allowed: false, reason: '전투에서 승리한 뒤 훈련할 수 있습니다.' };
  }
  if (trainingUsed) return { allowed: false, reason: '이번 캠프에서는 이미 훈련을 진행했습니다.' };
  return { allowed: true, reason: '동료 전체를 한 번 훈련할 수 있습니다.' };
}

export function getCampBattleStageId({ selectedStageId = null, clearedStages = [], lastBattleResult = null } = {}) {
  const unlocked = getUnlockedStageIds(clearedStages);
  const result = normalizeLastBattleResult(lastBattleResult);
  const retryId = result?.stageId ?? selectedStageId;
  if (result?.outcome === 'defeat' && unlocked.includes(retryId)) return retryId;
  const completed = new Set(normalizeClearedStageIds(clearedStages));
  return unlocked.find(id => !completed.has(id)) ?? null;
}

export function normalizeClearedStageIds(cleared = []) {
  const valid = new Set(Array.isArray(cleared) ? cleared : []);
  return stages.filter(stage => valid.has(stage.id)).map(stage => stage.id);
}

export function getUnlockedStageIds(cleared = []) {
  const completed = new Set(normalizeClearedStageIds(cleared));
  const next = stages.find(stage => !completed.has(stage.id))?.id;
  // Preserve older out-of-order clears for replay, but never open the gaps before them.
  return stages.filter(stage => completed.has(stage.id) || stage.id === next).map(stage => stage.id);
}

export function createVictoryCheckpoint(data, settlement) {
  const id = data.selectedStage.id;
  const replay = data.clearedStages.includes(id) || data.stageRewardClaimed;
  const clearedStages = normalizeClearedStageIds([...data.clearedStages, id]);
  const reward = replay ? { gold: 0, potion: 0 } : settlement.reward;
  const inventory = { ...data.inventory };
  if (!replay) {
    inventory.potion = (inventory.potion || 0) + reward.potion;
    for (const [item, count] of Object.entries(data.battleLoot.items || {})) inventory[item] = (inventory[item] || 0) + count;
  }
  const checkpoint = {
    ...data, screen: 'camp', selectedUnit: null, mode: 'move', turn: 'ally',
    party: settlement.party, units: settlement.party, inventory,
    gold: data.gold + reward.gold,
    clearedStages, unlockedStages: getUnlockedStageIds(clearedStages),
    stageRewardClaimed: true, hazards: [], trainingUsed: false, dispatchUsed: false,
    lastBattleResult: { stageId: id, outcome: 'victory' },
    battleLoot: { gold: 0, items: {}, gear: [] },
    gearInventory: replay ? data.gearInventory : [...new Set([...data.gearInventory, ...(data.selectedStage.reward?.gear || []), ...(data.battleLoot.gear || [])])],
    careerStats: settlement.careerStats,
    stageMastery: settlement.stageMastery,
    supportPoints: replay ? data.supportPoints : Object.fromEntries(Object.entries(data.supportPoints).map(([key, value]) => [key, value + (['hero_lina', 'hero_bram', 'lina_bram'].includes(key) ? 5 : 0)])),
    campMessage: settlement.message,
  };
  return { checkpoint, reward, replay };
}

/** Retreat preserves progression and earned growth without issuing another training allowance. */
export function createDefeatCheckpoint(data, settlement = {}) {
  const stageId = data.selectedStage?.id;
  if (!stages.some(stage => stage.id === stageId)) throw new Error('철수할 전장을 확인해 주세요.');
  const savedParty = Array.isArray(data.party) ? data.party : [];
  const liveUnits = Array.isArray(data.units) ? data.units : [];
  const recovered = Array.isArray(settlement.party) ? settlement.party : mergePartyFromUnits(savedParty, liveUnits);
  const party = recovered.map(unit => ({
    ...unit, hp: unit.maxHp, status: [], acted: false, moved: false, guard: false,
    skillGuardBoost: 0, itemGuardBoost: 0, skillCooldown: 0, skillCooldowns: {}, supportUsed: false,
  }));
  const clearedStages = normalizeClearedStageIds(data.clearedStages);
  const checkpoint = {
    ...data, screen: 'camp', selectedUnit: null, mode: 'move', turn: 'ally',
    party, units: party, clearedStages, unlockedStages: getUnlockedStageIds(clearedStages),
    lastBattleResult: { stageId, outcome: 'defeat' }, trainingUsed: true,
    dispatchUsed: Boolean(data.dispatchUsed), stageRewardClaimed: false, hazards: [],
    battleLoot: { gold: 0, items: {}, gear: [] },
    careerStats: settlement.careerStats ?? data.careerStats,
    campMessage: settlement.message ?? `${data.selectedStage.title || '전장'}에서 철수했습니다. 부대를 재정비합니다.`,
  };
  return { checkpoint, reward: { gold: 0, potion: 0 }, replay: false };
}

export function writeProgressSave(storage, data) {
  const key = 'cheonsu_v01_save';
  const previous = storage.getItem(key);
  const raw = JSON.stringify(data);
  // The primary write is atomic. A full backup slot must not prevent saving progress.
  storage.setItem(key, raw);
  let backupOk = true;
  try {
    if (previous) storage.setItem('cheonsu_v01_previous_backup', previous);
    storage.setItem('cheonsu_v01_auto_backup', raw);
  } catch { backupOk = false; }
  return { backupOk };
}
