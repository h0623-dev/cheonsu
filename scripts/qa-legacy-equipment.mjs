// 1.99.170 저장 스키마: 예전 아군 장비에 없던 장신구 칸만 빈 값으로 추가한다.
// 런타임 정규화 함수를 사용하지 않아 능력치·기존 장비·적 데이터의 변화는
// 호출부의 전체 deepEqual에서 그대로 실패한다. 원본 fixture는 변경하지 않는다.
export function withLegacyAccessorySlot(units) {
  return units.map(unit => unit?.type === 'ally' && unit.equipment &&
    typeof unit.equipment === 'object' && !Array.isArray(unit.equipment) &&
    !Object.hasOwn(unit.equipment, 'accessory')
    ? { ...unit, equipment: { ...unit.equipment, accessory: null } }
    : unit);
}

// QA expectations list only approved metadata migrations; growth and battle state stay exact.
// Never derive expected saves by passing fixtures through the game normalization pipeline.
import { getSkill } from '../src/data/skills.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';

const APPROVED_IDENTITIES = Object.freeze({
  teo: { icon: '🏹', range: 2, minRange: 2 },
  luka: { icon: '⚔️', range: 1, minRange: 1 },
  leon: { icon: '🔱', range: 2, minRange: 1 },
  miho: { icon: '🦊', range: 2, minRange: 2 },
  ella: { icon: '🎵' },
});

export function withApprovedAllyMigration(units, { camp = false } = {}) {
  return withLegacyAccessorySlot(units).map(unit => {
    if (unit?.type !== 'ally') return unit;
    const skill = getSkill(unit, unit.activeSkillId);
    const next = { ...unit, ...(APPROVED_IDENTITIES[unit.id] || {}),
      ...(skill ? { skill: skill.name, skillType: skill.type, skillRange: skill.range } : {}),
    };
    if (unit.id === 'teo') {
      const form = Object.hasOwn(ADVANCED_CLASSES, unit.id)
        ? ADVANCED_CLASSES[unit.id].find(candidate => candidate.id === unit.advancedClass) : null;
      const stored = unit.advancedClassBonus;
      const validStored = stored && ['hp', 'atk', 'def', 'move'].every(key =>
        Number.isFinite(stored[key]) && stored[key] >= 0 && stored[key] <= 20);
      const bonus = validStored ? stored.move : form?.bonuses?.move ?? 0;
      next.move = Math.max(unit.move || 0, 3 + bonus);
    }
    for (const key of ['itemPowerBoost', 'itemGuardBoost']) {
      if (camp || !Object.hasOwn(unit, key)) next[key] = 0;
    }
    return next;
  });
}
