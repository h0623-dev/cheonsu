import { CHARACTER_SKILLS, withSkill, getUnitSkills } from '../src/data/skills.js';
import { DISCOVERY_TECHNIQUES } from '../src/data/discoveries.js';
import { combatUnitIds } from '../src/data/combatArt.js';

export const fieldViewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 568, height: 320 }];
export const fieldSkills = Object.entries(CHARACTER_SKILLS).flatMap(([key, skills]) => skills.map(skill => [key, skill]));
fieldSkills.push(...Object.values(DISCOVERY_TECHNIQUES).map(skill => [skill.unitId, skill]));
export { combatUnitIds };
let sequence = 0;
export function fieldProps(key, skillId = null, options = {}) {
  const type = CHARACTER_SKILLS[key] ? 'ally' : key.startsWith('boss_') ? 'boss' : 'enemy';
  const actor = { id: key, artKey: key, name: key, type, x: 5, y: 6, hp: 42, maxHp: 50, learnedTechniques: skillId ? [skillId] : [] };
  const skill = getUnitSkills(actor).find(skill => skill.id === skillId);
  const support = skill && skill.type !== 'attack', self = skill?.type === 'guard' && !skill.radius;
  const ranged = ['lina', 'teo', 'ranger', 'sniper', 'siege_gunner', 'noah', 'irene', 'miho'].includes(key);
  const targetKey = self ? key : support ? key === 'hero' ? 'bram' : 'hero' : type === 'ally' ? 'blackguard' : 'hero';
  const target = self ? actor : { id: targetKey, artKey: targetKey, name: support ? '아군 전사' : '상대 전사', type: support || type !== 'ally' ? 'ally' : 'enemy', x: ranged ? 8 : 6, y: 6, hp: support ? 12 : 30, maxHp: 50 };
  if (options.reverse && !self) target.x = ranged ? 2 : 4;
  if (options.vertical && !self) { target.x = actor.x - 1; target.y = actor.y - 1; }
  const units = [actor, ...(!self ? [target] : []),
    { id: 'near-ally', artKey: 'leon', type: 'ally', name: '아군', x: 4, y: 8, hp: 40, maxHp: 40 },
    { id: 'near-enemy', artKey: 'ranger', type: 'enemy', name: '적군', x: 8, y: 4, hp: 40, maxHp: 40 }];
  const targets = [{ ...target, postHp: support ? 24 : options.finish ? 0 : 18 }];
  if (options.multi) targets.push({ ...units[2], postHp: support ? 50 : 0 });
  const scene = { id: `field-${++sequence}`, mode: skillId ? 'skill' : 'attack', title: skill?.name || '일반 공격',
    attacker: skill ? withSkill(actor, skill.id) : actor, defender: target, defenderPostHp: targets[0].postHp,
    outcome: { hit: !options.miss, damage: 12, heal: skill?.type === 'heal', guard: skill?.type === 'guard', crit: options.crit },
    finish: Boolean(options.finish), durationMs: options.duration || 2400 / (options.speed || 1), stageId: options.stage || 1,
    fieldUnits: units, fieldTargets: targets,
    fieldMap: Array.from({ length: 14 }, (_, y) => Array.from({ length: 14 }, (_, x) => x === 0 || y === 0 || x === 13 || y === 13 ? 'block' : y === 6 || x === 6 ? 'road' : x === 11 ? 'water' : 'plain')) };
  return { scene, attackerKey: key, defenderKey: targetKey, effectsEnabled: options.effects !== false, shakeEnabled: options.shake !== false };
}
