// 전투 선택과 별개인 마을 이동 캐릭터. 구저장에는 카일을 기본값으로 사용한다.
export function normalizeTownWalkerId(id, party = []) {
  const allies = (Array.isArray(party) ? party : []).filter(unit => unit?.type === 'ally');
  if (typeof id === 'string' && allies.some(unit => unit.id === id)) return id;
  return allies.find(unit => unit.id === 'hero')?.id || allies[0]?.id || null;
}
