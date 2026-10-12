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
