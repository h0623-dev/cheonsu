import enemyManifest from '../../public/art/enemies-v3/manifest.json' with { type: 'json' };
import bossManifest from '../../public/art/bosses-v1/manifest.json' with { type: 'json' };
import mapManifest from '../../public/art/map-sprites-v4/manifest.json' with { type: 'json' };

export function getCombatScale(key) { return mapManifest[key]?.combatScale || 1; }

const weapons = {
  boss_commander: 'heavy', boss_frost: 'ice', boss_ember: 'fire', boss_oracle: 'holy', boss_abyss: 'shadow',
  hero: 'slash', bram: 'guard', lina: 'arrow', aria: 'holy', leon: 'thrust', sera: 'shadow',
  noah: 'lightning', yuna: 'holy', rakan: 'heavy', miho: 'fire', teo: 'arrow', irene: 'ice',
  kaz: 'shadow', ella: 'music', jin: 'slash', luka: 'slash', baekho: 'impact',
  raider: 'slash', ranger: 'arrow', sniper: 'arrow', marauder: 'heavy', assassin_elite: 'shadow',
  iron_lancer: 'thrust', plague_doctor: 'poison', beast_tamer: 'claw', storm_mage: 'lightning',
  blade_dancer: 'slash', siege_gunner: 'impact', sentinel: 'guard', blackguard: 'slash',
  warlord: 'heavy', pyromancer: 'fire', frost_mage: 'ice', cultist: 'shadow', void_knight: 'shadow', wolf: 'claw',
};
const casters = new Set(['aria', 'noah', 'yuna', 'miho', 'irene', 'ella', 'plague_doctor', 'storm_mage', 'pyromancer', 'frost_mage', 'cultist']);
export const combatUnitIds = Object.keys(weapons);
export const combatMotionPoses = ['run-a', 'run-b', 'windup', 'strike', 'recover', 'recoil'];
export const combatEffectIds = ['slash', 'thrust', 'arrow', 'heavy', 'guard', 'fire', 'ice', 'lightning', 'shadow', 'holy', 'heal', 'poison', 'music', 'claw', 'impact', 'cast'];

export function getCombatSprite(key, pose = 'ready') {
  if (bossManifest.units[key]) return pose === 'action' ? bossManifest.units[key].motion.strike : bossManifest.units[key].ready;
  if (Object.hasOwn(enemyManifest.units, key)) {
    const enemy = enemyManifest.units[key];
    return pose === 'action' ? enemy.motion.strike : enemy.ready;
  }
  return `/art/combat-v1/units/${Object.hasOwn(weapons, key) ? key : 'raider'}-${pose === 'action' ? 'action' : 'ready'}.webp`;
}
export function getCombatEffect(key) {
  return `/art/combat-v1/effects/${combatEffectIds.includes(key) ? key : 'impact'}.webp`;
}
export function getCombatMotionSprite(key, pose = 'recover') {
  if (bossManifest.units[key]) return bossManifest.units[key].motion[combatMotionPoses.includes(pose) ? pose : 'recover'];
  if (Object.hasOwn(enemyManifest.units, key)) {
    return enemyManifest.units[key].motion[combatMotionPoses.includes(pose) ? pose : 'recover'];
  }
  return `/art/combat-v2/units/${Object.hasOwn(weapons, key) ? key : 'raider'}-${combatMotionPoses.includes(pose) ? pose : 'recover'}.webp`;
}
export function getCombatPresentation(key, scene) {
  const healing = Boolean(scene.outcome?.heal);
  const guarding = Boolean(scene.outcome?.guard);
  const support = healing || guarding;
  let effect = healing ? 'heal' : guarding ? 'guard' : weapons[key] || 'slash';
  if (!support && scene.mode === 'skill') {
    const skillEffect = scene.attacker?.skillSpec?.effect || scene.effectType;
    if (combatEffectIds.includes(skillEffect)) effect = skillEffect;
  }
  const style = support || casters.has(key) || ['boss_frost', 'boss_oracle'].includes(key) ? 'cast' : ['lina', 'teo', 'ranger', 'sniper', 'siege_gunner'].includes(key) ? 'ranged' : 'melee';
  return { effect, style, healing, guarding, support, miss: !support && !scene.outcome?.hit };
}

const loaded = new Map();
export function preloadCombatArt(attackerKey, defenderKey, scene) {
  if (typeof Image === 'undefined') return Promise.resolve();
  const effect = getCombatPresentation(attackerKey, scene).effect;
  const paths = [...combatMotionPoses.map(pose => getCombatMotionSprite(attackerKey, pose)),
    ...['recover', 'recoil', 'run-a'].map(pose => getCombatMotionSprite(defenderKey, pose)),
    getCombatEffect(effect), getCombatEffect('cast'), getCombatEffect('impact')];
  return Promise.all(paths.map(src => {
    if (!loaded.has(src)) {
      const img = new Image();
      img.src = src;
      loaded.set(src, img.decode().catch(() => loaded.delete(src)));
    }
    return loaded.get(src);
  }));
}
