import { applyEquipmentStats } from './partyEngine.js';
import { ORDINARY_PROMOTION_ATTACK_BONUS } from '../data/skills.js';

export const ORDINARY_PROMOTION_BONUSES = Object.freeze({ hp: 5, atk: 2, def: 2, skillBonus: ORDINARY_PROMOTION_ATTACK_BONUS });

const titles = Object.freeze({
  hero: '천룡기사', bram: '호국기사', lina: '홍염명궁', aria: '성무녀',
  leon: '질풍창기사', sera: '암영자', noah: '군략가', yuna: '월광무녀',
  rakan: '야왕', miho: '환영도사', teo: '정밀명궁', irene: '빙결현자',
  kaz: '섬광닌자', ella: '별빛악사', jin: '용검성', luka: '여명기사',
  baekho: '백호장군', mare: '청해창수', harin: '호흡선사', edan: '공방기장', sylvan: '녹음현자',
});

export function getPromotionTitle(unit) {
  return Object.hasOwn(titles, unit?.id) ? titles[unit.id] : '상급 병과';
}

export function getPromotionCost(unit) {
  const level = Number.isFinite(unit?.level) ? Math.max(1, unit.level) : 1;
  return 900 + Math.max(0, level - 3) * 120;
}

export function canPromoteUnit(unit, gold) {
  if (!unit || unit.type !== 'ally') return { ok: false, reason: '전직할 동료가 없습니다.' };
  if (unit.promoted) return { ok: false, reason: '이미 전직했습니다.' };
  if (!Number.isFinite(unit.level) || unit.level < 3) return { ok: false, reason: 'Lv.3 이상 필요' };
  if (!Number.isFinite(gold) || gold < getPromotionCost(unit)) return { ok: false, reason: '골드 부족' };
  return { ok: true, reason: '전직 가능' };
}

// 실행 조건은 구매 처리에서 확인한다. 순수 변환이므로 잠긴 전직도 미리 볼 수 있다.
export function promoteAllyUnit(unit) {
  if (!unit || unit.type !== 'ally' || unit.promoted) return unit;
  const equipmentOnly = applyEquipmentStats({ ...unit, baseAtk: 0, baseDef: 0 });
  const baseAtk = unit.baseAtk ?? ((unit.atk ?? 0) - equipmentOnly.atk);
  const baseDef = unit.baseDef ?? ((unit.def ?? 0) - equipmentOnly.def);
  const oldMaxHp = unit.maxHp ?? unit.baseHP ?? unit.hp ?? 1;
  const maxHp = Math.max(1, oldMaxHp + ORDINARY_PROMOTION_BONUSES.hp);
  const hp = unit.hp ?? oldMaxHp;
  return applyEquipmentStats({
    ...unit,
    promoted: true,
    classTitle: getPromotionTitle(unit),
    maxHp,
    hp: hp > 0 ? Math.min(maxHp, hp + ORDINARY_PROMOTION_BONUSES.hp) : 0,
    baseAtk: baseAtk + ORDINARY_PROMOTION_BONUSES.atk,
    baseDef: baseDef + ORDINARY_PROMOTION_BONUSES.def,
    // 구저장 필드를 유지하되 실제 기술 위력은 getUnitSkills에서 한 번만 계산한다.
    skillBonus: (unit.skillBonus || 0) + ORDINARY_PROMOTION_BONUSES.skillBonus,
    skillCooldown: 0,
  });
}

export function getOrdinaryPromotionPreview(unit) {
  if (!unit || unit.type !== 'ally') return null;
  const next = promoteAllyUnit(unit);
  const before = { hp: unit.maxHp ?? unit.hp ?? 1, atk: unit.atk ?? 0, def: unit.def ?? 0, move: unit.move ?? 1 };
  const after = { hp: next.maxHp ?? next.hp ?? 1, atk: next.atk ?? 0, def: next.def ?? 0, move: next.move ?? 1 };
  return { before, after, delta: Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]])) };
}
