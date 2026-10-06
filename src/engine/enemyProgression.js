function resolveCampaignStageId(stage) {
  const value = typeof stage === 'number' ? stage : stage?.id;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(50, Math.floor(value))) : 1;
}

/**
 * Enemy levels describe campaign progression; their existing HP/stat growth remains authoritative.
 * Two chapters correspond to one level (normal 1–25), with elite +1 and boss +2.
 * This label never recalculates HP; expansion stat growth is applied once during creation.
 */
export function getStageEnemyLevel(stage, unit = null) {
  const normalLevel = 1 + Math.floor((resolveCampaignStageId(stage) - 1) / 2);
  const rankBonus = unit?.type === 'boss' || unit?.id === 'boss'
    ? 2 : unit?.monsterRank === 'elite' ? 1 : 0;
  return normalLevel + rankBonus;
}

/** Use only while creating new enemies; never apply this helper to a saved live battle. */
export function withStageEnemyLevel(unit, stage) {
  if (!unit || !['enemy', 'boss'].includes(unit.type)) return unit;
  if (Number.isInteger(unit.level) && unit.level > 0) return unit;
  return { ...unit, level: getStageEnemyLevel(stage, unit) };
}

/** Fresh 31–50 enemies share one curve before the existing difficulty/deployment scaling. */
export function getExpansionEnemyStats(stage, profile = {}) {
  const stageId = resolveCampaignStageId(stage);
  if (stageId <= 30) return null;
  const power = stageId - 31;
  const rank = profile.type === 'boss' ? 'boss' : profile.rank || profile.monsterRank || 'normal';
  const multiplier = rank === 'boss' ? 2.2 : rank === 'elite' ? 1.25 : 1;
  const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const maxHp = Math.max(1, Math.round((68 + power * 2 + number(profile.hpOffset)) * multiplier));
  const atk = Math.max(1, 21 + Math.floor(power / 3) + number(profile.atkOffset) + (rank === 'boss' ? 6 : rank === 'elite' ? 1 : 0));
  const def = Math.max(0, 12 + Math.floor(power / 5) + number(profile.defOffset) + (rank === 'boss' ? 3 : rank === 'elite' ? 2 : 0));
  return { hp: maxHp, maxHp, atk, def, level: getStageEnemyLevel(stageId, {
    type: rank === 'boss' ? 'boss' : 'enemy', monsterRank: rank,
  }) };
}

/** Never rebase a live/difficulty-scaled enemy or any legacy chapter. */
export function withExpansionEnemyStats(unit, stage, profile = {}) {
  if (!unit || !['enemy', 'boss'].includes(unit.type)) return unit;
  const stageId = resolveCampaignStageId(stage);
  if (stageId <= 30 || unit.difficultyApplied || unit.expansionStatsStage === stageId) return unit;
  const stats = getExpansionEnemyStats(stageId, { ...unit, ...profile, type: unit.type });
  return { ...unit, ...stats, expansionStatsStage: stageId };
}
