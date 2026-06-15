import { distance, inMap, getAttackTiles, getMoveTiles, isTerrainBlocked } from "./movement.js";

function isAlive(unit) {
  return unit && unit.hp > 0;
}

function hasFreezeStatus(unit) {
  return (unit.status || []).some((status) => status.type === "freeze");
}

function getHpRate(unit) {
  if (!unit?.maxHp) return 1;
  return unit.hp / unit.maxHp;
}

function getWeaknessScore(unit) {
  return (unit.hp || 0) + (unit.def || 0) * 2;
}

function sortByDistanceFrom(enemy, units) {
  return [...units].sort((a, b) => distance(enemy, a) - distance(enemy, b));
}

function getTargetPriority(enemy, target) {
  const aiType = enemy.aiType || "aggressive";

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

  const aiType = enemy.aiType || "aggressive";

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
  const tiles = getAttackTiles(enemy, mode, activeMap);

  return allies.filter((ally) =>
    tiles.some((tile) => tile.x === ally.x && tile.y === ally.y)
  );
}

export function getTargetInRange(enemy, allies, mode, activeMap) {
  const targets = getTargetsInRange(enemy, allies, mode, activeMap).filter(isAlive);
  if (targets.length === 0) return null;

  const aiType = enemy.aiType || "aggressive";

  if (aiType === "aggressive") {
    return sortByDistanceFrom(enemy, targets)[0];
  }

  return [...targets].sort((a, b) => {
    const scoreDiff = getTargetPriority(enemy, b) - getTargetPriority(enemy, a);
    if (scoreDiff !== 0) return scoreDiff;
    return distance(enemy, a) - distance(enemy, b);
  })[0];
}

function getOpenAdjacentTiles(unit, units, activeMap) {
  const occupied = new Set(units.map((u) => `${u.x},${u.y}`));

  return [
    { x: unit.x + 1, y: unit.y },
    { x: unit.x - 1, y: unit.y },
    { x: unit.x, y: unit.y + 1 },
    { x: unit.x, y: unit.y - 1 },
  ].filter(
    (p) =>
      inMap(p.x, p.y, activeMap) &&
      !isTerrainBlocked(activeMap[p.y]?.[p.x]) &&
      !occupied.has(`${p.x},${p.y}`)
  );
}

function getOpenMoveTiles(unit, units, activeMap) {
  const moveTiles = getMoveTiles(unit, units, activeMap).filter(
    (tile) => tile.x !== unit.x || tile.y !== unit.y
  );

  return moveTiles.length ? moveTiles : getOpenAdjacentTiles(unit, units, activeMap);
}

function getEnemyAttackMode(enemy) {
  return enemy?.skillType === "attack" ? "skill" : "attack";
}

function canAttackFrom(enemy, tile, allies, activeMap) {
  return Boolean(getTargetInRange({ ...enemy, x: tile.x, y: tile.y }, allies, getEnemyAttackMode(enemy), activeMap));
}

function minDistanceToAllies(tile, allies) {
  if (!allies.length) return 99;
  return Math.min(...allies.map((ally) => distance(tile, ally)));
}

function moveArcher(enemy, allies, units, activeMap) {
  const target = selectAITarget(enemy, allies);
  if (!target) return enemy;

  const candidates = getOpenMoveTiles(enemy, units, activeMap);
  if (candidates.length === 0) return enemy;

  const desiredRange = enemy.range || 2;

  const best = [...candidates].sort((a, b) => {
    const aCanAttack = canAttackFrom(enemy, a, allies, activeMap);
    const bCanAttack = canAttackFrom(enemy, b, allies, activeMap);

    if (aCanAttack !== bCanAttack) return aCanAttack ? -1 : 1;

    const da = distance(a, target);
    const db = distance(b, target);

    const aInRange = da >= 2 && da <= desiredRange;
    const bInRange = db >= 2 && db <= desiredRange;

    if (aInRange !== bInRange) return aInRange ? -1 : 1;

    const aTooClose = minDistanceToAllies(a, allies) <= 1;
    const bTooClose = minDistanceToAllies(b, allies) <= 1;

    if (aTooClose !== bTooClose) return aTooClose ? 1 : -1;

    return Math.abs(da - desiredRange) - Math.abs(db - desiredRange);
  })[0];

  return best ? { ...enemy, x: best.x, y: best.y } : enemy;
}

function moveAssassin(enemy, allies, units, activeMap) {
  const target = selectAITarget(enemy, allies);
  if (!target) return enemy;

  const candidates = getOpenMoveTiles(enemy, units, activeMap);
  if (candidates.length === 0) return enemy;

  const best = [...candidates].sort((a, b) => {
    const aCanAttack = canAttackFrom(enemy, a, allies, activeMap);
    const bCanAttack = canAttackFrom(enemy, b, allies, activeMap);

    if (aCanAttack !== bCanAttack) return aCanAttack ? -1 : 1;

    const da = distance(a, target);
    const db = distance(b, target);

    if (da !== db) return da - db;

    const aNearLina = target.id === "lina" ? 0 : distance(a, target);
    const bNearLina = target.id === "lina" ? 0 : distance(b, target);

    return aNearLina - bNearLina;
  })[0];

  return best ? { ...enemy, x: best.x, y: best.y } : enemy;
}

function moveBoss(enemy, allies, units, activeMap) {
  const target = selectAITarget(enemy, allies);
  if (!target) return enemy;

  const candidates = getOpenMoveTiles(enemy, units, activeMap);
  if (candidates.length === 0) return enemy;

  const preferredRange = enemy.phase2 ? Math.max(enemy.range || 1, 2) : enemy.range || 1;

  const best = [...candidates].sort((a, b) => {
    const aCanAttack = canAttackFrom(enemy, a, allies, activeMap);
    const bCanAttack = canAttackFrom(enemy, b, allies, activeMap);

    if (aCanAttack !== bCanAttack) return aCanAttack ? -1 : 1;

    const da = distance(a, target);
    const db = distance(b, target);

    const aScore =
      Math.abs(da - preferredRange) -
      (target.id === "hero" ? 0.25 : 0) +
      getHpRate(target);

    const bScore =
      Math.abs(db - preferredRange) -
      (target.id === "hero" ? 0.25 : 0) +
      getHpRate(target);

    return aScore - bScore;
  })[0];

  return best ? { ...enemy, x: best.x, y: best.y } : enemy;
}

export function moveEnemyToward(enemy, allies, units, activeMap) {
  if (hasFreezeStatus(enemy)) return enemy;

  const aiType = enemy.aiType || "aggressive";

  if (aiType === "archer") {
    return moveArcher(enemy, allies, units, activeMap);
  }

  if (aiType === "assassin") {
    return moveAssassin(enemy, allies, units, activeMap);
  }

  if (aiType === "boss") {
    return moveBoss(enemy, allies, units, activeMap);
  }

  const target = selectAITarget(enemy, allies);
  if (!target) return enemy;

  const candidates = getOpenMoveTiles(enemy, units, activeMap);
  if (candidates.length === 0) return enemy;

  const best = candidates.sort((a, b) => {
    const aCanAttack = canAttackFrom(enemy, a, allies, activeMap);
    const bCanAttack = canAttackFrom(enemy, b, allies, activeMap);

    if (aCanAttack !== bCanAttack) return aCanAttack ? -1 : 1;

    return distance(a, target) - distance(b, target);
  })[0];
  return best ? { ...enemy, x: best.x, y: best.y } : enemy;
}

export function getAITypeLabel(aiType = "aggressive") {
  const labels = {
    aggressive: "돌격",
    archer: "거리 유지",
    assassin: "후방 침투",
    boss: "보스",
  };

  return labels[aiType] || labels.aggressive;
}
