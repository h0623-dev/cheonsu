import { findMovePath } from './movement.js';
import { directionTo } from './unitFacing.js';

export const TOWN_WIDTH = 24;
export const TOWN_HEIGHT = 16;
export const TOWN_STEP_MS = 220;
export const TOWN_ENTRANCE = { x: 11, y: 12 };
export const TOWN_FACILITIES = [
  { id: 'shop', name: '상점', x: 8, y: 5 },
  { id: 'inn', name: '여관', x: 17, y: 5 },
  { id: 'armory', name: '장비점', x: 8, y: 11 },
  { id: 'training', name: '훈련소', x: 16, y: 11 },
  { id: 'gate', name: '출전', x: 11, y: 14 },
];
export const TOWN_MAP = Array.from({ length: TOWN_HEIGHT }, (_, y) =>
  Array.from({ length: TOWN_WIDTH }, (_, x) =>
    ((x >= 10 && x <= 13 && y >= 1 && y <= 15) ||
      (y >= 6 && y <= 7 && x >= 1 && x <= 22) ||
      ((y === 5 || y === 11) && x >= 8 && x <= 17)) ? 'plain' : 'block'));

export function getTownPath(from, to) {
  if (TOWN_MAP[to.y]?.[to.x] !== 'plain') return [];
  const path = findMovePath({ ...from, id: 'walker', type: 'ally', hp: 1 }, to.x, to.y, [], TOWN_MAP);
  let previous = from;
  for (const cell of path) {
    if (Math.abs(cell.x - previous.x) + Math.abs(cell.y - previous.y) !== 1) return [];
    previous = cell;
  }
  return path;
}

// A route keeps the in-flight step until its feet have reached the destination tile.
export function advanceTownRoute(position, route, startedAt) {
  if (!route?.path.length) return { position, route: null, arrived: route?.destination || null };
  const [next, ...remaining] = route.path;
  return {
    position: next,
    direction: directionTo(position, next),
    route: { ...route, path: remaining, startedAt },
    arrived: null,
  };
}

export function stopTownRoute(route) {
  return route ? { ...route, path: [], destination: null } : null;
}

export function getTownStepDelay(route, now) {
  return Math.max(0, TOWN_STEP_MS - Math.max(0, now - route.startedAt));
}
