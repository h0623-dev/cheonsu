export function getBattleOutcome(stage, units) {
  const living = units.filter(unit => unit.hp > 0);
  if (!living.some(unit => unit.id === 'hero')) return 'defeat';
  const bosses = (stage?.units || []).filter(unit => unit.type === 'boss' || (unit.id === 'boss' && unit.type !== 'ally'));
  if (bosses.length && bosses.every(boss => !living.some(unit => unit.id === boss.id))) return 'victory';
  return living.some(unit => unit.type !== 'ally') ? null : 'victory';
}

export function spendAction(units, id) {
  return units.map(unit => unit.id === id ? { ...unit, acted: true, moved: true } : unit);
}
