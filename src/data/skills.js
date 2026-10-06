import { DISCOVERY_TECHNIQUES, SECRET_PROMOTIONS } from './discoveries.js';
import { getAdvancedClassDefinition } from './advancedClasses.js';

const attack = (id, name, bonus, range, cooldown, effect, extra = {}) => ({ id, name, type: 'attack', bonus, minRange: 1, range, cooldown, effect, ...extra });
const heal = (id, name, power, targets, range, cooldown, cleanse = false, extra = {}) => ({ id, name, type: 'heal', power, targets, range, cooldown, effect: 'heal', cleanse, ...extra });
const guard = (id, name, defense, radius, cooldown, extra = {}) => ({ id, name, type: 'guard', defense, radius, range: radius, cooldown, effect: 'guard', ...extra });

export const CHARACTER_SKILLS = {
  hero: [attack('gale', '돌풍 베기', 4, 1, 2, 'slash', { status: 'armorBreak' }), guard('oath', '수호의 맹세', 3, 0, 3)],
  bram: [guard('bulwark', '철벽 수호', 4, 0, 2), attack('bash', '방패 강타', 5, 1, 3, 'guard', { status: 'armorBreak' })],
  lina: [attack('ember', '불꽃 화살', 3, 3, 2, 'fire', { minRange: 2, status: 'burn' }), attack('snipe', '정밀 사격', 6, 4, 3, 'arrow', { minRange: 2, accuracy: 15 })],
  aria: [heal('light', '성빛 치유', 16, 1, 3, 2), heal('sanctuary', '성역의 기도', 9, 3, 2, 3, true)],
  leon: [attack('pierce', '관통 찌르기', 4, 2, 2, 'thrust', { status: 'armorBreak' }), attack('charge', '질풍 돌격', 8, 1, 3, 'thrust')],
  sera: [attack('shade', '암영 베기', 4, 1, 2, 'shadow', { status: 'bleed' }), attack('opening', '빈틈 가르기', 6, 1, 3, 'slash', { status: 'armorBreak' })],
  noah: [attack('chain', '낙뢰 사슬', 4, 3, 3, 'lightning', { radius: 1 }), guard('ward', '전술 방벽', 3, 1, 2)],
  yuna: [heal('moon', '달빛 회복', 12, 2, 3, 2), heal('purify', '정화의 기도', 8, 3, 2, 3, true)],
  rakan: [attack('crush', '대지 분쇄', 6, 1, 3, 'heavy', { status: 'armorBreak' }), guard('roar', '불굴의 포효', 5, 0, 2)],
  miho: [attack('foxfire', '여우불', 4, 3, 2, 'fire', { status: 'burn' }), attack('illusion', '환영 폭발', 6, 2, 3, 'shadow', { radius: 1 })],
  teo: [attack('rapid', '삼연사', 5, 3, 2, 'arrow', { minRange: 2 }), attack('breaker', '관통 화살', 3, 4, 3, 'arrow', { minRange: 2, status: 'armorBreak' })],
  irene: [attack('ice-lance', '빙결창', 4, 3, 3, 'ice', { status: 'freeze' }), attack('frost-wave', '서리 파동', 3, 2, 2, 'ice', { radius: 1 })],
  kaz: [attack('ambush', '그림자 습격', 5, 1, 2, 'shadow', { status: 'bleed' }), attack('vital', '급소 찌르기', 8, 1, 3, 'thrust', { accuracy: 15, critical: 10 })],
  ella: [heal('melody', '치유의 선율', 10, 3, 2, 3), attack('resonance', '공명 파동', 5, 3, 2, 'music')],
  jin: [attack('dragon', '용염참', 6, 1, 3, 'fire', { status: 'burn' }), attack('moonblade', '월광참', 3, 2, 2, 'slash', { radius: 1 })],
  luka: [attack('knight-charge', '기사 돌격', 6, 1, 2, 'slash'), guard('radiance', '수호의 빛', 3, 1, 3)],
  baekho: [attack('tiger-fist', '백호권', 6, 1, 2, 'impact', { status: 'armorBreak' }), attack('tiger-roar', '백호 포효', 4, 1, 3, 'heavy', { radius: 1 })],
  mare: [attack('tide-thrust', '해류 찌르기', 4, 2, 2, 'thrust', { special: { push: true } }), guard('water-cover', '물길 엄호', 3, 1, 3, { special: { waterStride: true } })],
  harin: [heal('warm-touch', '온맥수', 12, 1, 1, 2, true), attack('linked-fist', '연환권', 5, 1, 2, 'impact')],
  edan: [attack('breaker-hammer', '파쇄 망치', 5, 1, 2, 'heavy', { status: 'armorBreak' }), guard('folding-barrier', '접이식 방벽 전개', 4, 2, 3)],
  sylvan: [attack('root-snare', '뿌리 얽기', 4, 3, 3, 'nature', { special: { slow: true } }), heal('green-breath', '녹음 숨결', 10, 2, 3, 2, false, { special: { regen: 4 } })],
};
const statusNames = { burn: '화상', bleed: '출혈', freeze: '빙결', armorBreak: '방어 약화' };
export function getUnitSkills(unit) {
  const base = Object.hasOwn(CHARACTER_SKILLS, unit?.id) ? CHARACTER_SKILLS[unit.id] : [];
  if (!unit || (unit.type && unit.type !== 'ally')) return base;
  const learned = Array.isArray(unit.learnedTechniques) ? unit.learnedTechniques : [];
  const promotion = Object.hasOwn(SECRET_PROMOTIONS, unit.id) ? SECRET_PROMOTIONS[unit.id] : null;
  const ids = [...learned, ...(promotion && unit.secretClass === promotion.secretClass ? [promotion.techniqueId] : [])];
  const skills = [...base];
  const advanced = getAdvancedClassDefinition(unit);
  if (advanced) skills.push(advanced.skill.special?.chargeBonus && unit.moved
    ? { ...advanced.skill, bonus: advanced.skill.bonus + advanced.skill.special.chargeBonus } : advanced.skill);
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
export function getSkillDisplayName(unit) {
  return (!unit?.type || unit.type === 'ally') ? getSkill(unit, unit?.activeSkillId)?.name || unit?.skill || '' : unit.skill || '';
}
export function skillDescription(skill, level = 0) {
  const special = skill.special || {};
  const extras = `${special.push ? ' · 안전한 빈칸으로 1칸 밀기(보스 제외)' : ''}${special.slow ? ' · 대상 이동 -1(다음 자기 턴)' : ''}${special.slowAura ? ` · 주변 ${special.slowAura}칸 적 이동 -1` : ''}${special.regen ? ` · 다음 턴 HP ${special.regen} 추가 회복` : ''}${special.waterStride ? ' · 다음 자기 턴 얕은 물/늪 이동 비용 1' : ''}${special.cleanseGuard ? ' · 상태이상 해제' : ''}${special.selfHeal ? ` · 명중 시 자신 HP ${special.selfHeal} 회복` : ''}${special.healNearby ? ` · 명중 시 인접 아군 1명 HP ${special.healNearby} 회복` : ''}${special.chargeBonus ? ` · 이동 후 공격 +${special.chargeBonus}` : ''}`;
  if (skill.type === 'heal') return `HP ${skill.power + level * 3} 회복 · 최대 ${skill.targets}명${skill.cleanse ? ' · 상태이상 해제' : ''}${extras}`;
  if (skill.type === 'guard') return `방어 +${skill.defense + level} · 받는 피해 -4${skill.radius ? ` · 주변 ${skill.radius}칸 아군` : ' · 자신'}${extras}`;
  return `공격 +${skill.bonus + level * 2}${skill.radius ? ` · 주변 ${skill.radius}칸 60% 피해` : ''}${skill.status ? ` · ${statusNames[skill.status]} 2턴` : ''}${skill.accuracy ? ` · 명중 +${skill.accuracy}` : ''}${skill.critical ? ` · 치명 +${skill.critical}` : ''}${extras}`;
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
    const usedValidSkill = unit.type === 'ally' && skills.some(skill => skill.id === skillId) && normalizeCooldown(turns) > 0;
    return { ...unit, ...(usedValidSkill ? { advancedMastery: Math.min(3, Math.max(0, Number(unit.advancedMastery) || 0) + 1) } : {}), skillCooldowns, skillCooldown: skillCooldowns[skills[0].id] ?? 0 };
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
export function isSelfOnlySupportSkill(skill) {
  return Boolean(skill && (skill.type === 'guard' ? skill.radius === 0 : skill.type === 'heal' && skill.range === 0));
}
export function getSupportSkillCandidates(actor, skill, units) {
  const distance = unit => Math.abs(unit.x - actor.x) + Math.abs(unit.y - actor.y);
  const candidates = units.filter(unit => unit.type === 'ally' && unit.hp > 0 &&
    (!isSelfOnlySupportSkill(skill) || unit.id === actor.id) && distance(unit) <= (skill.type === 'guard' ? skill.radius : skill.range));
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
