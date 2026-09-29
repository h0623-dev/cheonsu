import { getCombatMotionSprite, getCombatEffect, combatMotionPoses } from '../data/combatArt.js';
import { getWorldTileVisual, WORLD_ART_ROOT } from '../data/worldArt.js';
import { getPaintedVisualProfile } from '../data/unitVisuals.js';

const cache = new Map();
export function loadFieldImage(src) {
  if (!cache.has(src)) {
    const image = new Image(); image.src = src;
    const ready = image.decode().then(() => image).catch(() => null);
    cache.set(src, { image, ready });
    if (cache.size > 96) cache.delete(cache.keys().next().value);
  }
  return cache.get(src).ready;
}
export async function loadFieldAssets(plan) {
  const paths = new Set();
  paths.add(`${WORLD_ART_ROOT}/terrain/${getWorldTileVisual([['plain']], 0, 0, plan.stageId).material}.webp`);
  for (const unit of plan.units) {
    const key = unit.artKey || unit.id;
    const active = unit.id === plan.source.id || plan.targets.some(target => target.id === unit.id);
    for (const pose of active ? combatMotionPoses : ['recover']) paths.add(getCombatMotionSprite(key, pose));
  }
  if (plan.skillPose) paths.add(plan.skillPose.src);
  if (plan.skill) paths.add(getPaintedVisualProfile(plan.source.artKey)?.portrait);
  if (plan.effects.some(effect => ['flame', 'embers', 'dragon', 'phoenix'].includes(effect.shape))) paths.add(getCombatEffect('fire'));
  for (let y = 0; y < (plan.map?.length || 0); y++) for (let x = 0; x < plan.map[y].length; x++) {
    const visual = getWorldTileVisual(plan.map, x, y, plan.stageId);
    paths.add(`${WORLD_ART_ROOT}/terrain/${visual.material}.webp`);
    if (visual.prop) paths.add(`${WORLD_ART_ROOT}/props/${visual.prop}.webp`);
  }
  const loaded = await Promise.all([...paths].filter(Boolean).map(async src => [src, await loadFieldImage(src)]));
  return new Map(loaded);
}
