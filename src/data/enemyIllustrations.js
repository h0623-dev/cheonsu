import { getCharacterArt } from './characterArt.js';

export const ENEMY_ILLUSTRATION_ROOT = '/art/enemy-illustrations-v1';
export const enemyIllustrationKeys = ['boss_commander', 'boss_frost', 'boss_ember', 'boss_oracle', 'boss_abyss'];

export function getEnemyIllustration(key) {
  if (!enemyIllustrationKeys.includes(key)) return null;
  const redesigned = getCharacterArt(key);
  if (redesigned) return { cutscene: redesigned.dialogue, portrait: redesigned.portrait };
  return {
    cutscene: `${ENEMY_ILLUSTRATION_ROOT}/${key}.webp`,
    portrait: `${ENEMY_ILLUSTRATION_ROOT}/portraits/${key}.webp`,
  };
}
