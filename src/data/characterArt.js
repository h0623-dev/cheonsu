import manifest from '../../public/art/characters-v2/manifest.json' with { type: 'json' };
import { CHARACTER_SKILLS } from './skills.js';

// This catalogue changes combat and dialogue only; map and directional sprites stay separate.
export function getCharacterArt(key) {
  return Object.hasOwn(manifest.units, key) ? manifest.units[key] : null;
}

export function getCharacterFrameStyle(key, pose) {
  const art = getCharacterArt(key);
  const metrics = art?.metrics?.[pose];
  const reference = art?.metrics?.recover;
  if (!metrics || !reference) return null;
  const visibleFraction = art.visibleFraction ?? (key === 'wolf' ? .45 : .703125);
  const scale = visibleFraction * reference.height / (reference.bottom - reference.top + 1);
  return {
    '--combat-sprite-scale': scale,
    '--combat-foot-offset': `${100 * scale * (.9375 - (metrics.bottom + 1) / metrics.height)}%`,
  };
}

export function getCharacterSkillPose(key, skillId) {
  const art = getCharacterArt(key);
  if (!art) return null;
  const authored = art.skills?.[skillId] || art.skill;
  if (authored?.src) return authored;
  const index = CHARACTER_SKILLS[key]?.findIndex(skill => skill.id === skillId);
  const requested = index === 1 ? 'skill-b' : 'skill-a';
  const pose = art.motion?.[requested] ? requested : 'strike';
  const src = art.motion?.[pose];
  if (!src) return null;
  const style = getCharacterFrameStyle(key, pose);
  return { src, scale: style?.['--combat-sprite-scale'] ?? 1,
    footOffset: style?.['--combat-foot-offset'] ?? '0%' };
}
