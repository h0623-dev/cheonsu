import manifest from '../../public/art/world-v2/manifest.json' with { type: 'json' };
import enemyManifest from '../../public/art/enemies-v3/manifest.json' with { type: 'json' };
import bossManifest from '../../public/art/bosses-v1/manifest.json' with { type: 'json' };
import { getEnemyIllustration } from './enemyIllustrations.js';
import { getCharacterArt } from './characterArt.js';
import { isExpansionEnemyKey } from './expansionEnemies.js';

export function getPaintedVisualProfile(key) {
  const redesigned = getCharacterArt(key);
  if (redesigned) return {
    map: redesigned.map || `/art/map-sprites-v4/${key}.webp`, battle: redesigned.motion.recover,
    portrait: redesigned.portrait, cutscene: redesigned.dialogue,
  };
  if (isExpansionEnemyKey(key)) return {
    map: `/art/characters-v3/map/${key}.webp`, battle: `/art/characters-v3/units/${key}-recover.webp`,
    portrait: `/art/characters-v3/portraits/${key}.webp`, cutscene: `/art/characters-v3/dialogue/${key}.webp`,
  };
  const boss = bossManifest.units[key];
  if (boss) return { map: boss.map, battle: boss.ready, ...getEnemyIllustration(key) };
  if (Object.hasOwn(enemyManifest.units, key)) {
    const enemy = enemyManifest.units[key];
    return { map: `/art/map-sprites-v4/${key}.webp`, battle: enemy.ready, portrait: enemy.portrait, cutscene: enemy.ready };
  }
  const entry = manifest.units[key];
  if (!entry) return null;
  return { map: `/art/map-sprites-v4/${key}.webp`, battle: entry.sprite, portrait: entry.portrait, cutscene: entry.sprite };
}

// Orthographic ground is compressed vertically, without perspective scaling.
export const BATTLE_GROUND_ROW_RATIO = 0.82;
