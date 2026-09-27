export const UNIT_DIRECTIONS = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
export const isUnitDirection = direction => UNIT_DIRECTIONS.includes(direction);

export function directionTo(from, to, fallback = 'down') {
  const dx = Number(to?.x) - Number(from?.x), dy = Number(to?.y) - Number(from?.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return isUnitDirection(fallback) ? fallback : 'down';
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return UNIT_DIRECTIONS[(octant + 8) % 8];
}

export function getUnitFacing(unit, units = [], overrides = {}) {
  if (!unit) return 'down';
  if (isUnitDirection(overrides[unit.id])) return overrides[unit.id];
  if (isUnitDirection(unit.facing)) return unit.facing;
  const opponents = units.filter(other => other.hp > 0 && (other.type === 'ally') !== (unit.type === 'ally'));
  let nearest;
  for (const other of opponents) if (!nearest || Math.abs(unit.x - other.x) + Math.abs(unit.y - other.y) < Math.abs(unit.x - nearest.x) + Math.abs(unit.y - nearest.y)) nearest = other;
  return directionTo(unit, nearest, unit.type === 'ally' ? 'up' : 'down');
}

export function getFacingArt(direction) {
  return { rear: direction.startsWith('up'), flip: direction.includes('left') ? -1 : 1 };
}

export function withSavedFacings(units, facings) {
  return units.map(unit => ({ ...unit, facing: getUnitFacing(unit, units, facings) }));
}
