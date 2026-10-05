function resolveCampaignStageId(stage) {
  const value = typeof stage === 'number' ? stage : stage?.id;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(30, Math.floor(value))) : 1;
}

/**
 * Enemy levels describe campaign progression; their existing HP/stat growth remains authoritative.
 * Two chapters correspond to one level (normal 1–15), with elite +1 and boss +2.
 * No HP, attack, defense, difficulty or reward is calculated from this label.
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
