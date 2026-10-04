import enemyManifest from '../../public/art/enemies-v3/manifest.json' with { type: 'json' };
import bossManifest from '../../public/art/bosses-v1/manifest.json' with { type: 'json' };
import mapManifest from '../../public/art/map-sprites-v4/manifest.json' with { type: 'json' };
import combatFrameMetrics from './combatFrameMetrics.json' with { type: 'json' };
import { getPaintedVisualProfile } from './unitVisuals.js';
import { getDuelPlan, getWeaponMotion } from './duelChoreography.js';
import { directDuelPerformance } from './duelPerformance.js';
import { getCharacterArt, getCharacterFrameStyle, getCharacterSkillPose } from './characterArt.js';

export function getCombatTiming(scene) {
  const skill = scene.mode === 'skill' || Boolean(scene.outcome?.heal || scene.outcome?.guard);
  return { skill, lead: skill ? .24 : 0, action: skill ? .76 : 1, impact: skill ? .62 : .5, durationScale: skill ? 1.45 : 1 };
}

export function getCombatChoreography(key,scene){
  const presentation = getCombatPresentation(key, scene);
  const weapon = getWeaponMotion(key, getCombatPresentation(key, {outcome:{hit:true}}));
  const plan = getDuelPlan(key, scene, presentation, weapon);
  const redesignedSkill = plan.skill ? getCharacterSkillPose(key, plan.id.slice(key.length + 1)) : null;
  return directDuelPerformance(redesignedSkill ? { ...plan, skillPose: redesignedSkill } : plan, weapon, presentation, scene);
}

export function getSkillPalette(effect) {
  return { fire: '#ff9a57', ice: '#9ceaff', lightning: '#ffe77e', shadow: '#c4a0ee', holy: '#fff0a0', heal: '#9ce6a6', guard: '#86dfe7', poison: '#badd73', music: '#f7b7dd', arrow: '#bfe2a1' }[effect] || '#f4d18c';
}

export function getCombatScale(key) { return mapManifest[key]?.combatScale || 1; }

export function getCombatFrameStyle(key, pose) {
  const redesigned = getCharacterFrameStyle(Object.hasOwn(weapons, key) ? key : 'raider', pose);
  if (redesigned) return redesigned;
  const metrics = combatFrameMetrics[key]?.[pose];
  if (!metrics) return { '--combat-sprite-scale': getCombatScale(key) };
  const visibleFraction = key === 'wolf' ? 0.45 : 0.703125;
  // Frames in each authored row share body scale. A raised weapon must not shrink the actor.
  const reference = combatFrameMetrics[key].recover;
  const scale = visibleFraction * reference.height / (reference.bottom - reference.top + 1);
  return { '--combat-sprite-scale': scale, '--combat-foot-offset': `${100 * scale * (0.9375 - (metrics.bottom + 1) / metrics.height)}%` };
}

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
  const redesigned = getCharacterArt(Object.hasOwn(weapons, key) ? key : 'raider');
  if (redesigned) return redesigned.motion[pose === 'action' ? 'strike' : 'recover'];
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
  const redesigned = getCharacterArt(Object.hasOwn(weapons, key) ? key : 'raider');
  if (redesigned) return redesigned.motion[combatMotionPoses.includes(pose) ? pose : 'recover'];
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
  if (getCombatTiming(scene).skill) paths.push(getPaintedVisualProfile(attackerKey)?.portrait || getCombatSprite(attackerKey));
  const choreography=getCombatChoreography(attackerKey,scene);
  if(choreography.skillPose) paths.push(choreography.skillPose.src);
  if(choreography.effects.some(effect=>['flame','embers','dragon','phoenix'].includes(effect.shape))) paths.push(getCombatEffect('fire'));
  return Promise.all(paths.map(src => {
    if (!loaded.has(src)) {
      const img = new Image();
      img.src = src;
      loaded.set(src, img.decode().catch(() => loaded.delete(src)));
    }
    return loaded.get(src);
  }));
}
