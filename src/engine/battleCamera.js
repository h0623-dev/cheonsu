export function getTurnCameraTarget(units, side, selectedId) {
  const team = units.filter(unit => unit.hp > 0 && (side === 'ally' ? unit.type === 'ally' : unit.type !== 'ally'));
  if (!team.length) return null;
  if (side === 'ally') return team.find(unit => unit.id === selectedId && !unit.acted) || team.find(unit => unit.id === 'hero' && !unit.acted) || team.find(unit => !unit.acted) || team[0];
  return team.find(unit => !unit.acted) || team[0];
}

export function getCellScrollTarget({ mapLeft, mapTop, cellWidth, cellHeight, x, y, viewportWidth, viewportHeight, topInset = 175, bottomInset = 190 }) {
  // Center inside the visible battlefield, not behind the top HUD or bottom commands.
  const visibleHeight = Math.max(80, viewportHeight - topInset - bottomInset);
  const centerY = Math.min(viewportHeight * 0.6, topInset + visibleHeight / 2);
  return {
    left: Math.max(0, mapLeft + (x + 0.5) * cellWidth - viewportWidth / 2),
    top: Math.max(0, mapTop + (y + 0.7) * cellHeight - centerY),
  };
}
