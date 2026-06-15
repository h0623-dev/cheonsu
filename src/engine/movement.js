export function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}


export function inMap(x, y, activeMap) {
  return y >= 0 && y < activeMap.length && x >= 0 && x < activeMap[0].length;
}


const BLOCKED_TERRAIN_TYPES = new Set(["block", "wall", "void"]);


export function isTerrainBlocked(tile) {
  return BLOCKED_TERRAIN_TYPES.has(tile);
}


function hasFreezeStatus(unit) {
  return (unit.status || []).some((status) => status.type === "freeze");
}


export function getTerrainBaseMoveCost(tile) {
  if (isTerrainBlocked(tile)) return Number.POSITIVE_INFINITY;

  const costs = {
    road: 1,
    gate: 1,
    plain: 1,
    fort: 1,
    trap: 1,

    forest: 2,
    hill: 2,
    fire: 2,
    ice: 2,
    water: 2,
    dark: 2,
    rune: 2,

    swamp: 3,
  };

  return costs[tile] || 1;
}


export function getUnitMoveTrait(unit) {
  const id = unit?.id;

  if (["sera", "miho", "kaz"].includes(id)) {
    return {
      id: "shadow",
      name: "은신 기동",
      desc: "숲 / 흑야 / 함정 이동 비용 -1",
    };
  }

  if (["leon", "luka"].includes(id)) {
    return {
      id: "ranger",
      name: "척후 기동",
      desc: "숲 / 언덕 이동 비용 -1",
    };
  }

  if (["bram", "rakan", "baekho", "teo"].includes(id)) {
    return {
      id: "heavy",
      name: "중장갑 보행",
      desc: "요새 / 성문 이동 비용 -1, 늪 / 여울 비용 +1",
    };
  }

  if (["lina", "aria", "noah", "yuna", "irene", "ella"].includes(id)) {
    return {
      id: "mystic",
      name: "주술 감응",
      desc: "화염 / 빙결 / 흑야 / 룬 이동 비용 -1",
    };
  }

  if (id === "hero" || id === "jin") {
    return {
      id: "leader",
      name: "천수 보행",
      desc: "길 / 평지 이동 안정",
    };
  }

  return {
    id: "normal",
    name: "일반 보행",
    desc: "기본 지형 비용 적용",
  };
}


export function getTerrainMoveCost(tile, unit = null) {
  if (isTerrainBlocked(tile)) return Number.POSITIVE_INFINITY;

  const base = getTerrainBaseMoveCost(tile);
  const trait = getUnitMoveTrait(unit);

  if (trait.id === "shadow" && ["forest", "dark", "trap"].includes(tile)) {
    return Math.max(1, base - 1);
  }

  if (trait.id === "ranger" && ["forest", "hill"].includes(tile)) {
    return Math.max(1, base - 1);
  }

  if (trait.id === "heavy" && ["fort", "gate"].includes(tile)) {
    return Math.max(1, base - 1);
  }

  if (trait.id === "heavy" && ["swamp", "water"].includes(tile)) {
    return base + 1;
  }

  if (trait.id === "mystic" && ["fire", "ice", "dark", "rune"].includes(tile)) {
    return Math.max(1, base - 1);
  }

  return base;
}


export function getTerrainMoveLabel(tile) {
  const labels = {
    road: "길",
    gate: "성문",
    plain: "평지",
    fort: "요새",
    trap: "함정",
    forest: "숲",
    hill: "언덕",
    fire: "화염",
    ice: "빙결",
    water: "여울",
    dark: "흑야",
    rune: "룬",
    swamp: "늪",
    block: "이동 불가",
    wall: "이동 불가",
    void: "이동 불가",
  };

  return labels[tile] || "지형";
}


function sortByCost(queue) {
  queue.sort((a, b) => a.cost - b.cost);
}


export function getMoveTiles(unit, units, activeMap) {
  if (!unit || unit.acted || unit.moved || hasFreezeStatus(unit)) return [];

  const occupied = new Set(
    units
      .filter((u) => u.id !== unit.id)
      .map((u) => `${u.x},${u.y}`)
  );

  const bestCost = new Map();
  const startKey = `${unit.x},${unit.y}`;
  const startTile = activeMap[unit.y]?.[unit.x] || "plain";
  const result = [
    {
      x: unit.x,
      y: unit.y,
      cost: 0,
      tile: startTile,
      tileCost: 0,
      baseTileCost: 0,
      traitBonus: false,
      traitPenalty: false,
      label: "제자리",
      stay: true,
    },
  ];
  const queue = [{ x: unit.x, y: unit.y, cost: 0 }];

  bestCost.set(startKey, 0);

  while (queue.length) {
    sortByCost(queue);
    const cur = queue.shift();

    const curKey = `${cur.x},${cur.y}`;
    if (cur.cost > bestCost.get(curKey)) continue;

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;

      if (!inMap(nx, ny, activeMap)) continue;
      if (occupied.has(key)) continue;

      const tile = activeMap[ny][nx];
      if (isTerrainBlocked(tile)) continue;

      const baseTileCost = getTerrainBaseMoveCost(tile);
      const tileCost = getTerrainMoveCost(tile, unit);
      if (!Number.isFinite(tileCost)) continue;

      const nextCost = cur.cost + tileCost;

      if (nextCost > unit.move) continue;
      if (bestCost.has(key) && bestCost.get(key) <= nextCost) continue;

      bestCost.set(key, nextCost);
      queue.push({ x: nx, y: ny, cost: nextCost });

      const existingIndex = result.findIndex((p) => p.x === nx && p.y === ny);
      const nextTile = {
        x: nx,
        y: ny,
        cost: nextCost,
        tile,
        tileCost,
        baseTileCost,
        traitBonus: tileCost < baseTileCost,
        traitPenalty: tileCost > baseTileCost,
        label: getTerrainMoveLabel(tile),
      };

      if (existingIndex >= 0) {
        result[existingIndex] = nextTile;
      } else {
        result.push(nextTile);
      }
    }
  }

  return result.sort((a, b) => a.cost - b.cost);
}


export function getAttackTiles(unit, mode, activeMap) {
  if (!unit || unit.acted) return [];
  const range = mode === "skill" ? unit.skillRange || unit.range || 1 : unit.range || 1;
  const result = [];
  for (let y = 0; y < activeMap.length; y++) {
    for (let x = 0; x < activeMap[0].length; x++) {
      const d = Math.abs(unit.x - x) + Math.abs(unit.y - y);
      const tile = activeMap[y]?.[x];

      if (isTerrainBlocked(tile)) continue;
      if (d >= 1 && d <= range) result.push({ x, y });
    }
  }
  return result;
}


export function findMovePath(unit, targetX, targetY, units, activeMap) {
  if (!unit || !activeMap || !activeMap.length) return [];

  if (unit.x === targetX && unit.y === targetY) return [];

  const targetKey = `${targetX},${targetY}`;
  const occupied = new Set(
    units
      .filter((u) => u.id !== unit.id)
      .map((u) => `${u.x},${u.y}`)
  );

  if (!inMap(targetX, targetY, activeMap)) return [];
  if (occupied.has(targetKey)) return [];

  const startKey = `${unit.x},${unit.y}`;
  const bestCost = new Map();
  const parent = new Map();
  const queue = [{ x: unit.x, y: unit.y, cost: 0 }];

  bestCost.set(startKey, 0);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (queue.length) {
    sortByCost(queue);
    const cur = queue.shift();
    const curKey = `${cur.x},${cur.y}`;

    if (cur.cost > bestCost.get(curKey)) continue;

    if (cur.x === targetX && cur.y === targetY) {
      break;
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;

      if (!inMap(nx, ny, activeMap)) continue;
      if (occupied.has(key)) continue;

      const tile = activeMap[ny][nx];
      if (isTerrainBlocked(tile)) continue;

      const tileCost = getTerrainMoveCost(tile, unit);
      if (!Number.isFinite(tileCost)) continue;

      const nextCost = cur.cost + tileCost;

      if (bestCost.has(key) && bestCost.get(key) <= nextCost) continue;

      bestCost.set(key, nextCost);
      parent.set(key, curKey);
      queue.push({ x: nx, y: ny, cost: nextCost });
    }
  }

  if (!bestCost.has(targetKey)) return [{ x: targetX, y: targetY }];

  const reversed = [];
  let currentKey = targetKey;

  while (currentKey && currentKey !== startKey) {
    const [x, y] = currentKey.split(",").map(Number);
    reversed.push({
      x,
      y,
      tile: activeMap[y]?.[x],
      cost: bestCost.get(currentKey),
    });
    currentKey = parent.get(currentKey);
  }

  return reversed.reverse();
}
