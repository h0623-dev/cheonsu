import { getUnlockedStageIds, writeProgressSave } from './campaignProgress.js';

export const PROGRESS_RECOVERY_BACKUP = 'cheonsu_v01_progress_recovery_backup';

export function recoverCampaignProgress(storage, completedThrough, source = null) {
  if (!Number.isInteger(completedThrough) || completedThrough < 0 || completedThrough > 30) throw new Error('완료한 장을 0~30 사이에서 선택해 주세요.');
  const raw = source ? JSON.stringify(source) : storage.getItem('cheonsu_v01_save');
  const data = JSON.parse(raw || 'null');
  if (!data || !Array.isArray(data.party) || !data.party.length || !Array.isArray(data.clearedStages)) throw new Error('복구할 저장 데이터를 찾을 수 없습니다.');
  const clearedStages = Array.from({ length: completedThrough }, (_, index) => index + 1);
  const repaired = { ...data, screen: 'campaign', clearedStages, unlockedStages: getUnlockedStageIds(clearedStages), selectedUnit: null, mode: 'move' };
  // Keep the first untouched snapshot; if backup storage is full, do not alter the primary save.
  if (!storage.getItem(PROGRESS_RECOVERY_BACKUP)) storage.setItem(PROGRESS_RECOVERY_BACKUP, raw);
  writeProgressSave(storage, repaired);
  return repaired;
}
