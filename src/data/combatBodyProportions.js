import proportions from './combatBodyProportions.json' with { type: 'json' };
import { getExpansionArtIdentity } from './expansionArtRegistry.js';

const identityKey = key => getExpansionArtIdentity(key)?.key || key;

// These are anatomical input landmarks, not weapon/cape bounds. A bent knee
// changes the pose's height, not the camera distance or the character's skull.
export function getCombatPoseBodyScale(key, pose) {
  return proportions.units[identityKey(key)]?.poses?.[pose]?.correction ?? 1;
}

export function applyCombatBodyProportion(key, pose, style) {
  const correction = getCombatPoseBodyScale(key, pose);
  if (!style || correction === 1) return style;
  return {
    ...style,
    '--combat-sprite-scale': Number(style['--combat-sprite-scale']) * correction,
    '--combat-foot-offset': `${(parseFloat(style['--combat-foot-offset']) || 0) * correction}%`,
  };
}

export function getCombatBodyBounds(key) {
  // Promoted forms retain their independent costume and source dimensions.
  // Their central body interval is used only for reserving a home gap.
  return proportions.units[identityKey(key)]?.bodyBounds
    || { left: 174, top: 110, right: 338, bottom: 479 };
}
