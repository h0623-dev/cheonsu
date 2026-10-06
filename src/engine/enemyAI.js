import {
  distance, getAttackTiles, getAttackRange, getMoveTiles, canAttackTarget,
  getTerrainMoveCost, getUnitMoveRange,
} from "./movement.js";

function isAlive(unit) {
  return unit && unit.hp > 0;
}

function hasFreezeStatus(unit) {
  return (unit.status || []).some((status) => status.type === "freeze");
}

function getEnemyAiType(enemy) {
  return enemy.aiType || (enemy.type === "boss" ? "boss" : "aggressive");
}

function getWeaknessScore(unit) {
  return (unit.hp || 0) + (unit.def || 0) * 2;
}

function sortByDistanceFrom(enemy, units) {
  return [...units].sort((a, b) => distance(enemy, a) - distance(enemy, b));
}

function getTargetPriority(enemy, target) {
  const aiType = getEnemyAiType(enemy);

  if (aiType === "assassin") {
    if (target.id === "lina") return 1000;
    if (target.id === "hero") return 200;
    return 500 - getWeaknessScore(target);
  }

  if (aiType === "boss") {
    if (target.id === "hero" && enemy.phase2) return 700;
    return 800 - target.hp;
  }

  if (aiType === "archer") {
    if (target.id === "lina") return 500;
    return 300 - getWeaknessScore(target);
  }

  return 200 - distance(enemy, target);
}

export function selectAITarget(enemy, allies) {
  const aliveAllies = allies.filter(isAlive);
  if (aliveAllies.length === 0) return null;

  const aiType = getEnemyAiType(enemy);

  if (aiType === "aggressive") {
    return sortByDistanceFrom(enemy, aliveAllies)[0];
  }

  return [...aliveAllies].sort((a, b) => {
    const scoreDiff = getTargetPriority(enemy, b) - getTargetPriority(enemy, a);
    if (scoreDiff !== 0) return scoreDiff;
    return distance(enemy, a) - distance(enemy, b);
  })[0];
}

export function getTargetsInRange(enemy, allies, mode, activeMap) {
  return allies.filter((ally) => canAttackTarget(enemy, ally, mode, activeMap));
}

export function getTargetInRange(enemy, allies, mode, activeMap) {
  const targets = getTargetsInRange(enemy, allies, mode, activeMap).filter(isAlive);
  if (targets.length === 0) return null;

  const aiType = getEnemyAiType(enemy);

  if (aiType === "aggressive") {
    return sortByDistanceFrom(enemy, targets)[0];
  }

  return [...targets].sort((a, b) => {
    const scoreDiff = getTargetPriority(enemy, b) - getTargetPriority(enemy, a);
    if (scoreDiff !== 0) return scoreDiff;
    return distance(enemy, a) - distance(enemy, b);
  })[0];
}

function getOpenMoveTiles(unit, units, activeMap) {
  return getMoveTiles(unit, units, activeMap).filter(
    (tile) => tile.x !== unit.x || tile.y !== unit.y
  );
}

export function getEnemyAttackChoice(enemy, allies, activeMap) {
  const modes = getEnemyAttackModes(enemy);
  for (const mode of modes) {
    const target = getTargetInRange(enemy, allies, mode, activeMap);
    if (target) return { mode, target };
  }
  return null;
}

function getEnemyAttackModes(enemy) {
  return (enemy?.skillSpec?.type ?? enemy?.skillType) === "attack"
    ? ["skill", "attack"] : ["attack"];
}

const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const cellKey = (tile) => `${tile.x},${tile.y}`;
const compareRoutes = (a, b) => a.cost - b.cost || b.priority - a.priority;

function pushRoute(queue, entry) {
  let index = queue.length;
  queue.push(entry);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareRoutes(queue[parent], entry) <= 0) break;
    queue[index] = queue[parent];
    index = parent;
  }
  queue[index] = entry;
}

function popRoute(queue) {
  const first = queue[0];
  const last = queue.pop();
  if (queue.length) {
    let index = 0;
    while (index * 2 + 1 < queue.length) {
      let child = index * 2 + 1;
      if (child + 1 < queue.length && compareRoutes(queue[child + 1], queue[child]) < 0) child++;
      if (compareRoutes(last, queue[child]) <= 0) break;
      queue[index] = queue[child];
      index = child;
    }
    queue[index] = last;
  }
  return first;
}

// Find routes to actual attack positions, rather than repeatedly walking toward
// an unreachable target on the other side of a wall. Reverse costs include the
// terrain being entered, just like getMoveTiles; occupied squares stay blocked.
function getPursuitRoutes(enemy, allies, units, activeMap) {
  const occupied = new Set(units.filter(unit => unit.id !== enemy.id).map(cellKey));
  const moveRange = getUnitMoveRange(enemy);
  const routes = new Map();
  const queue = [];
  const isOpen = (x, y) => {
    if (!activeMap[y]?.[x] || occupied.has(`${x},${y}`)) return false;
    const cost = getTerrainMoveCost(activeMap[y][x], enemy);
    return Number.isFinite(cost) && cost <= moveRange;
  };
  const remember = (tile, cost, priority) => {
    const key = cellKey(tile);
    const previous = routes.get(key);
    if (previous && (previous.cost < cost
      || (previous.cost === cost && previous.priority >= priority))) return;
    const entry = { x: tile.x, y: tile.y, cost, priority };
    routes.set(key, entry);
    pushRoute(queue, entry);
  };

  for (const target of allies) {
    const priority = getTargetPriority(enemy, target);
    for (const mode of getEnemyAttackModes(enemy)) {
      // Manhattan attack rings are symmetric around the target.
      const attackPositions = getAttackTiles({ ...enemy, x: target.x, y: target.y }, mode, activeMap);
      for (const tile of attackPositions) {
        if (isOpen(tile.x, tile.y)
          && canAttackTarget({ ...enemy, x: tile.x, y: tile.y }, target, mode, activeMap)) {
          remember(tile, 0, priority);
        }
      }
    }
  }

  while (queue.length) {
    const current = popRoute(queue);
    if (routes.get(cellKey(current)) !== current) continue;
    const cost = current.cost + getTerrainMoveCost(activeMap[current.y][current.x], enemy);
    for (const [dx, dy] of DIRECTIONS) {
      const x = current.x + dx, y = current.y + dy;
      if (isOpen(x, y)) remember({ x, y }, cost, current.priority);
    }
  }
  return routes;
}

// Front-line units act first so the following ranks can use the space they clear.
export function getEnemyTurnOrder(units, activeMap) {
  const allies = units.filter(unit => unit.type === "ally" && isAlive(unit));
  return units.filter(unit => unit.type !== "ally" && isAlive(unit))
    .map(enemy => ({
      enemy,
      canAttack: Boolean(getEnemyAttackChoice(enemy, allies, activeMap)),
      distance: allies.length ? Math.min(...allies.map(ally => distance(enemy, ally))) : 0,
    }))
    .sort((a, b) => Number(b.canAttack) - Number(a.canAttack) || a.distance - b.distance)
    .map(entry => entry.enemy);
}

export function moveEnemyToward(enemy, allies, units, activeMap) {
  if (!isAlive(enemy) || hasFreezeStatus(enemy)) return enemy;
  const livingAllies = allies.filter(isAlive);
  if (!livingAllies.length || getEnemyAttackChoice(enemy, livingAllies, activeMap)) return enemy;

  const candidates = getOpenMoveTiles(enemy, units, activeMap);
  if (candidates.length === 0) return enemy;

  // A legal attack this turn always wins over retreat, preferred distance or
  // pursuing a frail unit elsewhere. Archers still keep their real minimum range.
  const attackMoves = candidates.map(tile => ({
    tile,
    choice: getEnemyAttackChoice({ ...enemy, x: tile.x, y: tile.y }, livingAllies, activeMap),
  })).filter(entry => entry.choice);
  const attackMove = attackMoves.sort((a, b) => {
    const priority = getTargetPriority(enemy, b.choice.target) - getTargetPriority(enemy, a.choice.target);
    if (priority) return priority;
    if (a.choice.mode !== b.choice.mode) return a.choice.mode === "skill" ? -1 : 1;
    const { max } = getAttackRange(enemy, a.choice.mode);
    const aGap = Math.abs(distance(a.tile, a.choice.target) - max);
    const bGap = Math.abs(distance(b.tile, b.choice.target) - max);
    return aGap - bGap || a.tile.cost - b.tile.cost;
  })[0];
  if (attackMove) return { ...enemy, x: attackMove.tile.x, y: attackMove.tile.y };

  const routes = getPursuitRoutes(enemy, livingAllies, units, activeMap);
  const currentRoute = routes.get(cellKey(enemy));
  const best = candidates.map(tile => ({ tile, route: routes.get(cellKey(tile)) }))
    .filter(entry => entry.route && (!currentRoute || entry.route.cost < currentRoute.cost))
    .sort((a, b) => a.route.cost - b.route.cost
      || b.route.priority - a.route.priority || a.tile.cost - b.tile.cost)[0]?.tile;
  return best ? { ...enemy, x: best.x, y: best.y } : enemy;
}

export function getAITypeLabel(aiType = "aggressive") {
  const labels = {
    aggressive: "돌격",
    archer: "사거리 압박",
    assassin: "후방 침투",
    boss: "보스",
  };

  return labels[aiType] || labels.aggressive;
}
