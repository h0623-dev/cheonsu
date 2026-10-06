import { ADVANCED_CLASSES, getAdvancedClassDefinition, NEW_ALLY_TEMPLATES } from '../data/advancedClasses.js';
import { applyEquipmentStats } from './partyEngine.js';

export const ADVANCED_PROMOTION_GATE = 31;
export const ADVANCED_PROMOTION_MASTERY = 3;
export const ADVANCED_CHANGE_COST = 300;

function count(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function getAdvancedPromotionForms(unit) {
  return unit?.type !== 'enemy' && unit?.type !== 'boss' && Object.hasOwn(ADVANCED_CLASSES, unit?.id)
    ? ADVANCED_CLASSES[unit.id] : [];
}

export const getAdvancedClass = getAdvancedClassDefinition;

export function getAdvancedMastery(unit, battleRecord) {
  return Math.min(ADVANCED_PROMOTION_MASTERY, Math.max(count(unit?.advancedMastery), count(battleRecord?.skillsUsed)));
}

// 인장을 소모품 목록에 섞지 않는다. 첫 클리어 기록과 캐릭터별 소모 기록이 원장이다.
export function getAdvancedSealBalance(party = [], clearedStages = []) {
  const cleared = new Set(clearedStages.filter(id => Number.isInteger(id) && id >= 31 && id <= 50));
  const earned = cleared.has(ADVANCED_PROMOTION_GATE) ? 3 + [...cleared].filter(id => id > 31).length : 0;
  const spentIds = new Set(party.filter(unit => unit?.type === 'ally' &&
    (unit.advancedClassSealUsed === true || getAdvancedClass(unit))).map(unit => unit.id));
  return { earned, spent: spentIds.size, available: Math.max(0, earned - spentIds.size) };
}

export function canAdvancedPromote(unit, formId, { party = [], clearedStages = [], gold = 0, mastery = getAdvancedMastery(unit) } = {}) {
  const form = getAdvancedPromotionForms(unit).find(candidate => candidate.id === formId);
  if (!form) return { ok: false, reason: '이 동료가 선택할 수 없는 전직입니다.' };
  if (!clearedStages.includes(ADVANCED_PROMOTION_GATE)) return { ok: false, reason: '31장 첫 클리어 후 해금됩니다.' };
  if (!unit.promoted) return { ok: false, reason: '먼저 기존 상급 전직을 완료해 주세요.' };
  if (unit.advancedClass === formId) return { ok: false, reason: '현재 선택한 전직입니다.' };
  const current = getAdvancedClass(unit);
  if (!current && getAdvancedMastery({ advancedMastery: mastery }) < ADVANCED_PROMOTION_MASTERY) {
    return { ok: false, reason: `스킬 숙련 ${getAdvancedMastery({ advancedMastery: mastery })}/${ADVANCED_PROMOTION_MASTERY} · 성공한 스킬 사용 3회 필요` };
  }
  const sealCost = current || unit.advancedClassSealUsed ? 0 : 1;
  const goldCost = current && count(unit.advancedClassChanges) > 0 ? ADVANCED_CHANGE_COST : 0;
  if (getAdvancedSealBalance(party, clearedStages).available < sealCost) return { ok: false, reason: '전직인장 1개가 필요합니다.' };
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < goldCost) return { ok: false, reason: `${goldCost}G가 필요합니다.` };
  return { ok: true, reason: current ? goldCost ? `분기 변경 ${goldCost}G` : '첫 분기 변경 무료' : '전직인장 1개 · 골드 무료', sealCost, goldCost, form, changing: Boolean(current) };
}

export function applyAdvancedPromotion(unit, formId, context = {}) {
  const check = canAdvancedPromote(unit, formId, context);
  if (!check.ok) return { ok: false, unit, goldCost: 0, sealCost: 0, message: check.reason };
  const previous = getAdvancedClass(unit);
  const storedBonus = unit.advancedClassBonus;
  const storedBonusValid = previous && storedBonus && ['hp', 'atk', 'def', 'move'].every(key =>
    typeof storedBonus[key] === 'number' && Number.isFinite(storedBonus[key]) && storedBonus[key] >= 0 && storedBonus[key] <= 20);
  const oldBonus = storedBonusValid ? storedBonus : previous?.bonuses || { hp: 0, atk: 0, def: 0, move: 0 };
  const nextBonus = check.form.bonuses;
  const equipmentOnly = applyEquipmentStats({ ...unit, baseAtk: 0, baseDef: 0 });
  const baseAtk = unit.baseAtk ?? ((unit.atk ?? 0) - equipmentOnly.atk);
  const baseDef = unit.baseDef ?? ((unit.def ?? 0) - equipmentOnly.def);
  const maxHp = Math.max(1, (unit.maxHp ?? unit.hp ?? 1) + nextBonus.hp - oldBonus.hp);
  const promoted = applyEquipmentStats({
    ...unit,
    advancedClass: check.form.id,
    advancedClassBonus: { ...nextBonus },
    advancedClassSealUsed: true,
    advancedClassChanges: count(unit.advancedClassChanges) + (check.changing ? 1 : 0),
    advancedMastery: Math.max(getAdvancedMastery(unit), getAdvancedMastery({ advancedMastery: context.mastery })),
    maxHp,
    // 분기 변경으로 회복하거나 쓰러진 동료를 부활시키지 않는다.
    hp: Math.max(0, Math.min(unit.hp ?? 0, maxHp)),
    baseAtk: baseAtk + nextBonus.atk - oldBonus.atk,
    baseDef: baseDef + nextBonus.def - oldBonus.def,
    move: Math.max(1, (unit.move ?? 1) + nextBonus.move - oldBonus.move),
    activeSkillId: check.form.skill.id,
    skill: check.form.skill.name,
    skillType: check.form.skill.type,
    skillBonus: (check.form.skill.bonus || 0) + (unit.skillLevel || 0) * 2,
    skillRange: check.form.skill.range,
    skillSpec: check.form.skill,
  });
  return { ok: true, unit: promoted, goldCost: check.goldCost, sealCost: check.sealCost,
    message: `${unit.name} ${check.changing ? '분기 변경' : '최상위 전직'} 완료: ${check.form.name}. 기존 성장·장비·습득 기술은 유지됩니다.` };
}

export function createExpansionRecruit(id, referenceParty = []) {
  if (!Object.hasOwn(NEW_ALLY_TEMPLATES, id)) return null;
  const template = NEW_ALLY_TEMPLATES[id];
  const levels = referenceParty.filter(unit => unit?.type === 'ally' && Number.isFinite(unit.level) && unit.level > 0)
    .map(unit => Math.floor(unit.level)).sort((a, b) => a - b);
  const level = levels.length ? levels[Math.floor((levels.length - 1) / 2)] : 1;
  const growth = level - 1;
  return applyEquipmentStats({ ...template,
    type: 'ally', level, exp: 0, hp: template.hp + growth * 2, maxHp: template.maxHp + growth * 2,
    baseAtk: template.atk + growth, baseDef: template.def + growth,
    equipment: { weapon: null, armor: null }, moved: false, acted: false, guard: false,
  });
}
