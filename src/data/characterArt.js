import manifest from '../../public/art/characters-v2/manifest.json' with { type: 'json' };
import expansionManifest from '../../public/art/characters-v3/manifest.json' with { type: 'json' };
import promotionManifest from '../../public/art/promotions-v1/manifest.json' with { type: 'json' };
import { CHARACTER_SKILLS } from './skills.js';
import { getAdvancedClassDefinition } from './advancedClasses.js';
import { getExpansionArtIdentity } from './expansionArtRegistry.js';

const expansionEntries = new Map();

// 전직 외형은 기존 성장 정보에서 선택하며, 새 지도·보행 원화와 전투 원화를 함께 묶는다.
// 최상위 전직은 기존 전투/대화 원화를 보존하고 지도·후면·보행만 덧붙일 수 있다.
export function getCharacterArt(key) {
  const identity = getExpansionArtIdentity(key);
  const expansion = identity && Object.hasOwn(expansionManifest.units, identity.assetId) ? expansionManifest.units[identity.assetId] : null;
  const promotion = identity && Object.hasOwn(promotionManifest.units, identity.key) ? promotionManifest.units[identity.key] : null;
  if (expansion || promotion) {
    if (!expansionEntries.has(identity.key)) expansionEntries.set(identity.key, {
      ...expansion, ...promotion, map: promotion?.map || identity.map,
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
