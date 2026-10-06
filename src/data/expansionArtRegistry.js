import legacyManifest from '../../public/art/characters-v2/manifest.json' with { type: 'json' };
import { ADVANCED_CLASSES } from './advancedClasses.js';

const baseProfiles = {
  hero: ['slash', 'slash'], bram: ['guard', 'guard'], lina: ['arrow', 'bow'], aria: ['holy', 'cast'],
  leon: ['thrust', 'thrust'], sera: ['shadow', 'quick'], noah: ['lightning', 'cast'], yuna: ['holy', 'cast'],
  rakan: ['heavy', 'heavy'], miho: ['fire', 'cast'], teo: ['arrow', 'bow'], irene: ['ice', 'cast'],
  kaz: ['shadow', 'quick'], ella: ['music', 'cast'], jin: ['slash', 'slash'], luka: ['slash', 'slash'], baekho: ['impact', 'fist'],
  mare: ['thrust', 'thrust'], harin: ['impact', 'fist'], edan: ['heavy', 'heavy'], sylvan: ['nature', 'cast'],
  crab_guard: ['claw', 'beast'], eel_archer: ['arrow', 'bow'], spore_colony: ['poison', 'cast'],
  mist_ram: ['impact', 'beast'], crystal_insect: ['claw', 'beast'], spring_salamander: ['fire', 'cast'],
  gold_puppet: ['slash', 'slash'], bell_keeper: ['music', 'cast'], scroll_spirit: ['holy', 'cast'],
  eclipse_cat: ['claw', 'beast'], ink_vine: ['poison', 'cast'], hollow_armor: ['guard', 'guard'],
  tide_keeper: ['thrust', 'thrust'], frost_queen: ['ice', 'cast'], resonance_judge: ['music', 'thrust'], oath_guardian: ['holy', 'slash'],
};

export const EXPANSION_ALLY_ART_KEYS = Object.freeze(['mare', 'harin', 'edan', 'sylvan']);
export const EXPANSION_ENEMY_ART_KEYS = Object.freeze(['crab_guard', 'eel_archer', 'spore_colony', 'mist_ram', 'crystal_insect',
  'spring_salamander', 'gold_puppet', 'bell_keeper', 'scroll_spirit', 'eclipse_cat', 'ink_vine', 'hollow_armor',
  'tide_keeper', 'frost_queen', 'resonance_judge', 'oath_guardian']);
export const EXPANSION_BASE_ART_KEYS = Object.freeze([...EXPANSION_ALLY_ART_KEYS, ...EXPANSION_ENEMY_ART_KEYS]);
export const ADVANCED_CLASS_ART_KEYS = Object.freeze(Object.values(ADVANCED_CLASSES).flatMap(forms => forms.map(form => form.id)));
export const LEGACY_CHARACTER_ART_KEYS = Object.freeze(Object.keys(legacyManifest.units));

// 최초 이미지 제작 계획의 silvan 철자를 저장·전투의 canonical sylvan과 연결한다.
function canonicalize(key) {
  return typeof key === 'string' ? key === 'silvan' ? 'sylvan' : key.replace(/^silvan__form([01])$/, 'sylvan__form$1') : null;
}

function makeIdentity(key, baseId) {
  const [effect, weapon] = baseProfiles[baseId];
  const assetId = key.replace(/^sylvan(?=__form[01]$|$)/, 'silvan');
  const baseAssetId = baseId === 'sylvan' ? 'silvan' : baseId;
  const map = EXPANSION_ALLY_ART_KEYS.includes(baseId) || EXPANSION_ENEMY_ART_KEYS.includes(baseId)
    ? `/art/characters-v3/map/${baseAssetId}.webp` : `/art/map-sprites-v4/${baseId}.webp`;
  return Object.freeze({ key, baseId, assetId, effect, weapon, caster: weapon === 'cast', ranged: weapon === 'bow', map });
}

const identities = Object.fromEntries([
  ...EXPANSION_BASE_ART_KEYS.map(key => [key, makeIdentity(key, key)]),
  ...Object.entries(ADVANCED_CLASSES).flatMap(([baseId, forms]) => forms.map(form => [form.id, makeIdentity(form.id, baseId)])),
]);
export const EXPANSION_ART_REGISTRY = Object.freeze(identities);

export function getExpansionArtIdentity(key) {
  const canonical = canonicalize(key);
  return canonical && Object.hasOwn(EXPANSION_ART_REGISTRY, canonical) ? EXPANSION_ART_REGISTRY[canonical] : null;
}

export function isKnownCharacterArtKey(key) {
  return Boolean(getExpansionArtIdentity(key) || LEGACY_CHARACTER_ART_KEYS.includes(key));
}

export function getGameCharacterArtKey(unit) {
  if (!unit) return null;
  if (unit.type === 'ally') {
    const forms = Object.hasOwn(ADVANCED_CLASSES, unit.id) ? ADVANCED_CLASSES[unit.id] : [];
    if (forms.some(form => form.id === unit.advancedClass)) return unit.advancedClass;
    return isKnownCharacterArtKey(unit.id) ? canonicalize(unit.id) : null;
  }
  for (const key of [unit.artId, unit.spriteKey, unit.id]) if (isKnownCharacterArtKey(key)) return canonicalize(key);
  return null;
}
