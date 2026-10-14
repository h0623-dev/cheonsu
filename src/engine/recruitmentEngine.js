import { applyEquipmentStats } from './partyEngine.js';

// 합류 순간의 보유 동료만 기준으로 삼는다. 기존 동료의 성장은 변경하지 않는다.
export function getRecruitStartingLevel(referenceParty = []) {
  const highest = (Array.isArray(referenceParty) ? referenceParty : []).reduce((level, unit) =>
    unit?.type === 'ally' && Number.isFinite(unit.level) && unit.level >= 1
      ? Math.max(level, Math.floor(unit.level)) : level, 1);
  return Math.max(1, Math.floor(highest * 7 / 10));
}

// 레벨 1 신규 동료의 원형에 실제 레벨업과 같은 HP +2 / 공격·방어 +1을 적용한다.
export function applyRecruitStartingGrowth(unit, referenceParty = []) {
  if (!unit || unit.type !== 'ally') return unit;
  const level = getRecruitStartingLevel(referenceParty);
  const growth = level - 1;
  const base = applyEquipmentStats(unit);
  const maxHp = (base.maxHp ?? base.hp ?? 1) + growth * 2;
  return applyEquipmentStats({
    ...base, level, exp: 0, maxHp, hp: maxHp,
    baseAtk: base.baseAtk + growth,
    baseDef: base.baseDef + growth,
  });
}
