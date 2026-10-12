import { getCharacterArt } from './characterArt.js';

export const VILLAGE_WALK_IDS = ['hero', 'bram', 'lina', 'aria', 'leon', 'sera', 'noah', 'yuna', 'rakan', 'miho', 'teo', 'irene', 'kaz', 'ella', 'jin', 'luka', 'baekho', 'mare', 'harin', 'edan', 'sylvan'];

export function getVillageWalkFrame(id, direction = 'down', step = 0) {
  const view = direction.startsWith('up') ? 'back' : 'front';
  const pose = Math.abs(Math.trunc(step)) % 2 ? 'b' : 'a';
  const authored = getCharacterArt(id)?.walk?.[`${view}-${pose}`];
  if (authored) return authored;
  if (!VILLAGE_WALK_IDS.includes(id)) return null;
  return `/art/village-walk-v2/${id}-${view}-${pose}.webp`;
}

export function getVillageWalkFrames(id) {
  return ['down', 'up'].flatMap(direction => [0, 1].map(step => getVillageWalkFrame(id, direction, step))).filter(Boolean);
}
