import { getUnlockedStageIds } from './campaignProgress.js';
import { stages } from '../data/stages.js';

export function readMenuCheckpoint(storage) {
  try {
    const raw = storage.getItem('cheonsu_v01_save');
    if (!raw) return { exists: false, data: null };
    const data = JSON.parse(raw);
    const valid = data && Array.isArray(data.party) && data.party.length > 0 && data.party.every(unit => unit && typeof unit.id === 'string') && Array.isArray(data.clearedStages);
    return { exists: true, data: valid ? data : null };
  } catch { return { exists: true, data: null }; }
}

export function canReplayStory(stageId, type, cleared = []) {
  if (!Number.isInteger(stageId) || !stages.some(stage => stage.id === stageId)) return false;
  if (type === 'intro') return getUnlockedStageIds(cleared).includes(stageId);
  return type === 'clear' && cleared.includes(stageId);
}

export function getNextChapter(cleared = []) {
  const unlocked = getUnlockedStageIds(cleared);
  return unlocked.find(id => !cleared.includes(id)) || null;
}

export function getStoryReadDelay(text) {
  return Math.min(9000, Math.max(4000, String(text).length * 95));
}
