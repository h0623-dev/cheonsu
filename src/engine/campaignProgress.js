import { stages } from '../data/stages.js';

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
    battleLoot: { gold: 0, items: {}, gear: [] },
    gearInventory: replay ? data.gearInventory : [...new Set([...data.gearInventory, ...(data.selectedStage.reward?.gear || []), ...(data.battleLoot.gear || [])])],
    careerStats: settlement.careerStats,
    stageMastery: settlement.stageMastery,
    supportPoints: replay ? data.supportPoints : Object.fromEntries(Object.entries(data.supportPoints).map(([key, value]) => [key, value + (['hero_lina', 'hero_bram', 'lina_bram'].includes(key) ? 5 : 0)])),
    campMessage: settlement.message,
  };
  return { checkpoint, reward, replay };
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
