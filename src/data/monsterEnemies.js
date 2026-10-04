// Species art is separate from the saved battle ID and its original combat rules.
export const MONSTER_ENEMIES = {
  'kobold-hunter': { name: '코볼트 사냥꾼', role: '석궁 사냥꾼', rank: 'normal', firstStage: 4, icon: '🏹' },
  'lizard-spearman': { name: '도마뱀 창병', role: '장창 전사', rank: 'normal', firstStage: 8, icon: '🔱' },
  'horned-ogre': { name: '뿔오거', role: '정예 곤봉 전사', rank: 'elite', firstStage: 9, icon: '👹' },
  'rock-spirit': { name: '바위정령', role: '정예 바위 수호자', rank: 'elite', firstStage: 10, icon: '🪨' },
  'skeleton-warrior': { name: '해골전사', role: '도끼 전사', rank: 'normal', firstStage: 14, icon: '💀' },
  'harpy-scout': { name: '하피 정찰병', role: '기습 정찰병', rank: 'normal', firstStage: 15, icon: '🪶' },
};

// Replace existing slots; never add combatants, reorder templates or replace story bosses.
export const MONSTER_STAGE_ROLES = {
  4: { storm_mage: 'kobold-hunter' },
  7: { cultist: 'kobold-hunter' },
  8: { marauder: 'lizard-spearman' },
  9: { raider: 'horned-ogre', sniper: 'kobold-hunter' },
  10: { void_knight: 'rock-spirit' },
  11: { marauder: 'lizard-spearman', ranger: 'kobold-hunter' },
  12: { warlord: 'horned-ogre' },
  13: { sniper: 'kobold-hunter' },
  14: { sentinel: 'rock-spirit', void_knight: 'skeleton-warrior' },
  15: { iron_lancer: 'lizard-spearman', assassin_elite: 'harpy-scout' },
  16: { blackguard: 'skeleton-warrior' },
  17: { blackguard: 'skeleton-warrior', sentinel: 'rock-spirit' },
  18: { warlord: 'horned-ogre', blade_dancer: 'harpy-scout' },
  19: { void_knight: 'skeleton-warrior', sentinel: 'rock-spirit' },
  20: { warlord: 'horned-ogre', blackguard: 'skeleton-warrior' },
  21: { void_knight: 'rock-spirit' },
  22: { void_knight: 'skeleton-warrior' },
  23: { iron_lancer: 'lizard-spearman', ranger: 'kobold-hunter' },
  24: { void_knight: 'skeleton-warrior' },
  25: { sentinel: 'rock-spirit', blackguard: 'skeleton-warrior' },
  26: { warlord: 'horned-ogre', void_knight: 'skeleton-warrior' },
  27: { iron_lancer: 'lizard-spearman' },
  28: { warlord: 'rock-spirit', blackguard: 'skeleton-warrior' },
  29: { blade_dancer: 'harpy-scout', void_knight: 'skeleton-warrior' },
  30: { warlord: 'horned-ogre', void_knight: 'rock-spirit' },
};

export function isMonsterArtId(key) {
  return Object.hasOwn(MONSTER_ENEMIES, key);
}

export function applyStageMonsterAppearance(unit, stage) {
  if (!unit || unit.type === 'ally' || unit.type === 'boss' || unit.id === 'boss') return unit;
  const stageId = typeof stage === 'number' ? stage : stage?.id;
  const sourceKey = unit.legacySpriteKey || unit.spriteKey || unit.stageEnemyRole;
  const artId = MONSTER_STAGE_ROLES[stageId]?.[sourceKey];
  const identity = MONSTER_ENEMIES[artId];
  if (!identity || stageId < identity.firstStage) return unit;

  const kobold = artId === 'kobold-hunter';
  const legacyName = unit.legacyName || unit.name;
  const next = {
    ...unit,
    name: identity.rank === 'elite' ? `정예 ${identity.name}` : identity.name,
    icon: identity.icon,
    artId,
    monsterRank: identity.rank,
    legacySpriteKey: sourceKey,
    legacyName,
    combatIdentityName: unit.combatIdentityName || legacyName,
  };
  if (kobold) {
    return {
      ...next,
      spriteKey: 'ranger',
      skill: '정밀 석궁',
      combatIdentityName: '코볼트 석궁병',
      minRange: unit.minRange ?? unit.range,
      skillMinRange: unit.skillMinRange ?? unit.skillRange,
    };
  }
  return next;
}

export function applyStageMonsterAppearances(units, stage) {
  return (units || []).map(unit => applyStageMonsterAppearance(unit, stage));
}
