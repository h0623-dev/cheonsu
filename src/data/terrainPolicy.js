// Expansion terrain shares five readable effects; legacy terrain keeps its own rules.
const definitions = {
  shell_reef: { name: '조개암초', icon: '🛡️', moveCost: 2, effect: 'cover', material: 'rock', legacyTile: 'hill', prop: 'rocks' },
  sluice_bridge: { name: '수문석교', icon: '👣', moveCost: 1, effect: 'route', material: 'paving', legacyTile: 'road' },
  packed_snow: { name: '눈다짐길', icon: '❄️', moveCost: 2, effect: 'rough', material: 'snow', legacyTile: 'plain' },
  hot_spring: { name: '온천석', icon: '♨️', moveCost: 1, effect: 'restore', heal: 2, material: 'water', legacyTile: 'water' },
  power_conduit: { name: '동력도선', icon: '👣', moveCost: 1, effect: 'route', material: 'paving', legacyTile: 'road' },
  resonance_pad: { name: '공명받침', icon: '✨', moveCost: 2, effect: 'magic', material: 'rune', legacyTile: 'rune' },
  star_moss: { name: '별빛이끼', icon: '🌿', moveCost: 1, effect: 'restore', heal: 2, material: 'flowers', legacyTile: 'plain' },
  oath_rune: { name: '봉인문양', icon: '✨', moveCost: 2, effect: 'magic', material: 'rune', legacyTile: 'rune' },
  cracked_slab: { name: '균열석판', icon: '👣', moveCost: 2, effect: 'rough', material: 'stone', legacyTile: 'hill' },
  low_rubble: { name: '낮은 잔해', icon: '🛡️', moveCost: 2, effect: 'cover', material: 'stone', legacyTile: 'fort', prop: 'crates' },
};

export const NEW_TERRAIN_POLICIES = Object.freeze(Object.fromEntries(
  Object.entries(definitions).map(([id, definition]) => [id, Object.freeze({
    id, ...definition, baseMaterial: definition.material, material: id,
  })]),
));
export const NEW_TERRAIN_IDS = Object.freeze(Object.keys(NEW_TERRAIN_POLICIES));

export function getNewTerrainPolicy(tile) {
  return Object.hasOwn(NEW_TERRAIN_POLICIES, tile) ? NEW_TERRAIN_POLICIES[tile] : null;
}

const LEGACY_WARNINGS = Object.freeze({
  fire: '턴 시작 시 피해 2 · 흑염',
  ice: '턴 시작 시 빙결',
  dark: '턴 시작 시 피해 1 · 혈상',
  rune: '턴 시작 시 피해 2 · 혈상',
  trap: '턴 시작 시 피해 4',
  swamp: '턴 시작 시 피해 1',
});

export function getTerrainEffectDescription(tile) {
  const policy = getNewTerrainPolicy(tile);
  if (!policy) return LEGACY_WARNINGS[tile] || '';
  if (policy.effect === 'cover') return '받는 피해 -2 · 상대 명중 -3';
  if (policy.effect === 'route') return '공격 명중 +3';
  if (policy.effect === 'restore') return `턴 시작 시 HP ${policy.heal} 회복 · 양측 동일`;
  if (policy.effect === 'magic') return '마법 공격 피해 +1 · 명중 +3';
  return '추가 지형 효과 없음';
}

const LEGACY_UNSAFE = new Set(['fire', 'ice', 'dark', 'rune', 'trap', 'water', 'swamp']);

export function isDeploymentTerrainUnsafe(tile) {
  const effect = getNewTerrainPolicy(tile)?.effect;
  return LEGACY_UNSAFE.has(tile) || effect === 'restore' || effect === 'magic';
}

/** Applied beside the existing legacy tactics, including regular and counter attacks. */
export function getNewTerrainCombatModifiers(attackerTile, defenderTile, combatClass) {
  const attackerPolicy = getNewTerrainPolicy(attackerTile);
  const defenderPolicy = getNewTerrainPolicy(defenderTile);
  const result = { damageMod: 0, hitMod: 0, critMod: 0, labels: [] };

  if (attackerPolicy?.effect === 'route') {
    result.hitMod += 3;
    result.labels.push(`${attackerPolicy.name} 진격`);
  }
  if (attackerPolicy?.effect === 'magic' && combatClass === 'magic') {
    result.damageMod += 1;
    result.hitMod += 3;
    result.labels.push(`${attackerPolicy.name} 공명`);
  }
  if (defenderPolicy?.effect === 'cover') {
    result.damageMod -= 2;
    result.hitMod -= 3;
    result.labels.push(`${defenderPolicy.name} 엄폐`);
  }
  return result;
}
