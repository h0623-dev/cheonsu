import manifest from '../../public/art/characters-v2/manifest.json' with { type: 'json' };
import expansionManifest from '../../public/art/characters-v3/manifest.json' with { type: 'json' };
import { CHARACTER_SKILLS } from './skills.js';
import { getAdvancedClassDefinition } from './advancedClasses.js';
import { getExpansionArtIdentity } from './expansionArtRegistry.js';

const expansionEntries = new Map();

// This catalogue changes combat and dialogue only; map and directional sprites stay separate.
export function getCharacterArt(key) {
  const identity = getExpansionArtIdentity(key);
  if (identity && Object.hasOwn(expansionManifest.units, identity.assetId)) {
    if (!expansionEntries.has(identity.key)) expansionEntries.set(identity.key, {
      ...expansionManifest.units[identity.assetId], map: identity.map,
    });
    return expansionEntries.get(identity.key);
  }
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
  const identity = getExpansionArtIdentity(key);
  const baseKey = identity?.baseId || key;
  const inherited = manifest.units[baseKey]?.skills?.[skillId];
  const inheritedPose = inherited?.src?.match(/-(skill-[ab])\.webp$/)?.[1];
  const advanced = getAdvancedClassDefinition({ id: baseKey, type: 'ally', advancedClass: identity?.key });
  const index = CHARACTER_SKILLS[baseKey]?.findIndex(skill => skill.id === skillId);
  const requested = inheritedPose || (advanced?.skill.id === skillId
    ? advanced.skill.type === 'attack' ? 'skill-a' : 'skill-b' : index === 1 ? 'skill-b' : 'skill-a');
  const pose = art.motion?.[requested] ? requested : 'strike';
  const src = art.motion?.[pose];
  if (!src) return null;
  const style = getCharacterFrameStyle(key, pose);
  return { src, scale: style?.['--combat-sprite-scale'] ?? 1,
    footOffset: style?.['--combat-foot-offset'] ?? '0%' };
}
