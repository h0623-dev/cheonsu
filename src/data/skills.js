import { DISCOVERY_TECHNIQUES, SECRET_PROMOTIONS } from './discoveries.js';

const attack = (id, name, bonus, range, cooldown, effect, extra = {}) => ({ id, name, type: 'attack', bonus, range, cooldown, effect, ...extra });
const heal = (id, name, power, targets, range, cooldown, cleanse = false) => ({ id, name, type: 'heal', power, targets, range, cooldown, effect: 'heal', cleanse });
const guard = (id, name, defense, radius, cooldown) => ({ id, name, type: 'guard', defense, radius, range: radius, cooldown, effect: 'guard' });

export const CHARACTER_SKILLS = {
  hero: [attack('gale', '돌풍 베기', 4, 1, 2, 'slash', { status: 'armorBreak' }), guard('oath', '수호의 맹세', 3, 0, 3)],
  bram: [guard('bulwark', '철벽 수호', 4, 0, 2), attack('bash', '방패 강타', 5, 1, 3, 'guard', { status: 'armorBreak' })],
  lina: [attack('ember', '불꽃 화살', 3, 3, 2, 'fire', { status: 'burn' }), attack('snipe', '정밀 사격', 6, 4, 3, 'arrow', { accuracy: 15 })],
  aria: [heal('light', '성빛 치유', 16, 1, 3, 2), heal('sanctuary', '성역의 기도', 9, 3, 2, 3, true)],
  leon: [attack('pierce', '관통 찌르기', 4, 2, 2, 'thrust', { status: 'armorBreak' }), attack('charge', '질풍 돌격', 8, 1, 3, 'thrust')],
  sera: [attack('shade', '암영 베기', 4, 1, 2, 'shadow', { status: 'bleed' }), attack('opening', '방어 틈새', 6, 1, 3, 'slash', { status: 'armorBreak' })],
  noah: [attack('chain', '낙뢰 사슬', 4, 3, 3, 'lightning', { radius: 1 }), guard('ward', '전술 방벽', 3, 1, 2)],
  yuna: [heal('moon', '달빛 회복', 12, 2, 3, 2), heal('purify', '정화의 기도', 8, 3, 2, 3, true)],
  rakan: [attack('crush', '대지 분쇄', 6, 1, 3, 'heavy', { status: 'armorBreak' }), guard('roar', '불굴의 포효', 5, 0, 2)],
  miho: [attack('foxfire', '여우불', 4, 3, 2, 'fire', { status: 'burn' }), attack('illusion', '환영 폭발', 6, 2, 3, 'shadow', { radius: 1 })],
  teo: [attack('rapid', '속사', 5, 3, 2, 'arrow'), attack('breaker', '관통 화살', 3, 4, 3, 'arrow', { status: 'armorBreak' })],
  irene: [attack('ice-lance', '빙결창', 4, 3, 3, 'ice', { status: 'freeze' }), attack('frost-wave', '서리 파동', 3, 2, 2, 'ice', { radius: 1 })],
  kaz: [attack('ambush', '그림자 습격', 5, 1, 2, 'shadow', { status: 'bleed' }), attack('vital', '급소 찌르기', 8, 1, 3, 'thrust', { accuracy: 15, critical: 10 })],
  ella: [heal('melody', '치유의 선율', 10, 3, 2, 3), attack('resonance', '공명의 화살', 5, 3, 2, 'music')],
  jin: [attack('dragon', '용검', 6, 1, 3, 'fire', { status: 'burn' }), attack('moonblade', '월광참', 3, 2, 2, 'slash', { radius: 1 })],
  luka: [attack('knight-charge', '기사 돌격', 6, 1, 2, 'slash'), guard('radiance', '수호의 빛', 3, 1, 3)],
  baekho: [attack('tiger-fist', '백호권', 6, 1, 2, 'impact', { status: 'armorBreak' }), attack('tiger-roar', '백호 포효', 4, 1, 3, 'heavy', { radius: 1 })],
};
const statusNames = { burn: '화상', bleed: '출혈', freeze: '빙결', armorBreak: '방어 약화' };
export function getUnitSkills(unit) {
  const base = Object.hasOwn(CHARACTER_SKILLS, unit?.id) ? CHARACTER_SKILLS[unit.id] : [];
  if (!unit || (unit.type && unit.type !== 'ally')) return base;
  const learned = Array.isArray(unit.learnedTechniques) ? unit.learnedTechniques : [];
  const promotion = Object.hasOwn(SECRET_PROMOTIONS, unit.id) ? SECRET_PROMOTIONS[unit.id] : null;
  const ids = [...learned, ...(promotion && unit.secretClass === promotion.secretClass ? [promotion.techniqueId] : [])];
  const skills = [...base];
  const seen = new Set(base.map((skill) => skill.id));
  for (const id of ids) {
    if (typeof id !== 'string' || seen.has(id) || !Object.hasOwn(DISCOVERY_TECHNIQUES, id)) continue;
    const technique = DISCOVERY_TECHNIQUES[id];
    if (technique.unitId !== unit.id) continue;
    seen.add(id);
    skills.push(technique);
  }
  return skills.length === base.length ? base : skills;
}
export function getSkill(unit, id) { const skills = getUnitSkills(unit); return skills.find(skill => skill.id === id) || skills[0] || null; }
export function skillDescription(skill, level = 0) {
  if (skill.type === 'heal') return `HP ${skill.power + level * 3} 회복 · 최대 ${skill.targets}명${skill.cleanse ? ' · 상태이상 해제' : ''}`;
  if (skill.type === 'guard') return `방어 +${skill.defense + level} · 받는 피해 -4${skill.radius ? ` · 주변 ${skill.radius}칸 아군` : ' · 자신'}`;
  return `공격 +${skill.bonus + level * 2}${skill.radius ? ` · 주변 ${skill.radius}칸 60% 피해` : ''}${skill.status ? ` · ${statusNames[skill.status]} 2턴` : ''}${skill.accuracy ? ` · 명중 +${skill.accuracy}` : ''}${skill.critical ? ` · 치명 +${skill.critical}` : ''}`;
}

function normalizeCooldown(value) {
  const turns = Number(value);
  return Number.isFinite(turns) ? Math.max(0, turns) : 0;
}

export function getSkillCooldown(unit, skillId = getUnitSkills(unit)[0]?.id) {
  if (!unit) return 0;
  // Once migrated, the per-skill map is authoritative, including missing or zero entries.
  if (unit.skillCooldowns && typeof unit.skillCooldowns === 'object' && !Array.isArray(unit.skillCooldowns)) return normalizeCooldown(unit.skillCooldowns[skillId]);
  return skillId === getUnitSkills(unit)[0]?.id ? normalizeCooldown(unit.skillCooldown) : 0;
}
export function withSkill(unit, skillId) {
  const skill = getSkill(unit, skillId);
  if (!unit || !skill) return unit;
  return { ...unit, activeSkillId: skill.id, skill: skill.name, skillType: skill.type, skillRange: skill.range,
    skillBonus: (skill.bonus ?? 0) + (unit.skillLevel || 0) * 2, skillSpec: skill };
}
export function applyCooldown(units, unitId, skillId, turns) {
  return units.map(unit => {
    if (unit.id !== unitId) return unit;
    const skills = getUnitSkills(unit);
    if (!skills.length) return { ...unit, skillCooldown: normalizeCooldown(turns) };
    const skillCooldowns = Object.fromEntries(skills.map(skill => [skill.id, getSkillCooldown(unit, skill.id)]));
    skillCooldowns[getSkill(unit, skillId).id] = normalizeCooldown(turns);
    return { ...unit, skillCooldowns, skillCooldown: skillCooldowns[skills[0].id] ?? 0 };
  });
}
export function tickCooldowns(units) {
  return units.map(unit => {
    if (unit.type !== 'ally') return unit;
    const skills = getUnitSkills(unit);
    const legacyCooldown = Math.max(0, normalizeCooldown(unit.skillCooldown) - 1);
    if (!skills.length) return { ...unit, skillCooldown: legacyCooldown };
    const skillCooldowns = Object.fromEntries(skills.map(skill => [skill.id, Math.max(0, getSkillCooldown(unit, skill.id) - 1)]));
    return { ...unit, skillCooldowns, skillCooldown: skillCooldowns[skills[0]?.id] ?? legacyCooldown };
  });
}
export function getSupportSkillCandidates(actor, skill, units) {
  const distance = unit => Math.abs(unit.x - actor.x) + Math.abs(unit.y - actor.y);
  const candidates = units.filter(unit => unit.type === 'ally' && unit.hp > 0 && distance(unit) <= (skill.type === 'guard' ? skill.radius : skill.range));
  if (skill.type === 'guard') return candidates;
  return candidates.filter(unit => unit.hp < unit.maxHp || (skill.cleanse && unit.status?.length));
}
export function getSupportSkillTargets(actor, skill, units, selectedIds) {
  const candidates = getSupportSkillCandidates(actor, skill, units);
  if (selectedIds !== undefined) {
    return [...new Set(selectedIds)].map(id => candidates.find(unit => unit.id === id)).filter(Boolean).slice(0, skill.targets ?? candidates.length);
  }
  if (skill.type === 'guard') return candidates;
  return candidates.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id)).slice(0, skill.targets);
}
export function applySupportSkill(actor, skill, units, selectedIds) {
  const targets = getSupportSkillTargets(actor, skill, units, selectedIds);
  const ids = new Set(targets.map(unit => unit.id));
  const power = (skill.power || 0) + (actor.skillLevel || 0) * 3;
  const nextUnits = units.map(unit => {
    if (!ids.has(unit.id)) return unit;
    if (skill.type === 'heal') return { ...unit, hp: Math.min(unit.maxHp, unit.hp + power), status: skill.cleanse ? [] : unit.status };
    const oldBoost = unit.skillGuardBoost || 0;
    const boost = Math.max(oldBoost, skill.defense + (actor.skillLevel || 0));
    return { ...unit, guard: true, def: unit.def - oldBoost + boost, skillGuardBoost: boost };
  });
  return { units: nextUnits, targets, healing: targets.reduce((sum, unit) => sum + (skill.type === 'heal' ? Math.min(power, unit.maxHp - unit.hp) : 0), 0) };
}
