import { EXPANSION_BASE_ART_KEYS, LEGACY_CHARACTER_ART_KEYS, getExpansionArtIdentity } from './expansionArtRegistry.js';

const styleBBaseKeys = new Set([...LEGACY_CHARACTER_ART_KEYS, ...EXPANSION_BASE_ART_KEYS]);
const settledPoses = new Set(['run-a', 'run-b', 'windup', 'recoil']);

export function isBattleStyleBBaseKey(key) {
  // Use the exact form key: a promoted costume must never inherit its base actor's images.
  const identity = getExpansionArtIdentity(key);
  return styleBBaseKeys.has(identity?.key || key);
}

// The action track still names each acted beat. B's base actors use their newly authored
// settled body for anticipation, footwork, recoil and the backward recovery, so a single
// action cannot switch to an older body or run forward while travelling backward.
// This is a combat-only image identity; source art, promotion outfits and skill-b stay intact.
export function resolveCombatPose(key, pose = 'recover') {
  const sourcePose = pose === 'ready' ? 'recover' : pose === 'evade' ? 'run-a' : pose;
  return isBattleStyleBBaseKey(key) && settledPoses.has(sourcePose) ? 'recover' : sourcePose;
}
