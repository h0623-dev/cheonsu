import { ENEMY_ILLUSTRATION_ROOT } from './enemyIllustrations.js';
import { getCharacterArt } from './characterArt.js';
import { EXPANSION_ENEMY_ART_KEYS } from './expansionArtRegistry.js';

export const legacyBossCombatIds = ['boss_commander', 'boss_frost', 'boss_ember', 'boss_oracle', 'boss_abyss'];
export const expansionBossCombatIds = ['tide_keeper', 'frost_queen', 'resonance_judge', 'oath_guardian'];
export const bossCombatIds = [...legacyBossCombatIds, ...expansionBossCombatIds];
export const BOSS_SPLASH_ROOT = ENEMY_ILLUSTRATION_ROOT;
const splashAccents = { boss_commander: '#e7c98b', boss_frost: '#a7e8ff', boss_ember: '#ffb675', boss_oracle: '#96ebca', boss_abyss: '#d0baff',
  tide_keeper: '#85d7cf', frost_queen: '#c7efff', resonance_judge: '#d8bf83', oath_guardian: '#e1dbf5' };
export function getBossSplash(unit) {
  const key = getBossSpriteKey(unit) || 'boss_commander';
  const redesigned = getCharacterArt(key);
  return { key, src: redesigned?.splash || redesigned?.dialogue || redesigned?.motion?.recover || redesigned?.portrait || `${BOSS_SPLASH_ROOT}/${key}.webp`, accent: splashAccents[key] || splashAccents.boss_commander };
}
export function getBossSpriteKey(unit) {
  if (unit?.type !== 'boss') return null;
  // New leaders and ordinary species appointed as captains keep their explicit bodies.
  // Resolve those before legacy name hints (the queen is not the old frost commander).
  for (const key of [unit.artId, unit.spriteKey, unit.id]) {
    if (EXPANSION_ENEMY_ART_KEYS.includes(key)) return key;
  }
  if (legacyBossCombatIds.includes(unit.spriteKey)) return unit.spriteKey;
  const text = `${unit.id || ''} ${unit.name || ''} ${unit.skill || ''} ${unit.spriteKey || ''}`;
  if (/가론|심연|공허|최종|void/.test(text)) return 'boss_abyss';
  if (/빙|얼음|설원|서리|frost/.test(text)) return 'boss_frost';
  if (/화염|흑염|혈|잿|불|pyro/.test(text)) return 'boss_ember';
  if (/마도|마녀|사제|주술|cultist/.test(text)) return 'boss_oracle';
  return 'boss_commander';
}
