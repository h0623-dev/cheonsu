import { STATUS_INFO } from "../data/gameData";

export function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function inMap(x, y, activeMap) {
  return y >= 0 && y < activeMap.length && x >= 0 && x < activeMap[0].length;
}

export function getMoveTiles(unit, units, activeMap) {
  if (!unit || unit.acted || unit.moved) return [];
  if ((unit.status || []).some((s) => s.type === "freeze")) return [];
  const occupied = new Set(units.map((u) => `${u.x},${u.y}`));
  const result = [];
  const visited = new Set([`${unit.x},${unit.y}`]);
  const queue = [{ x: unit.x, y: unit.y, cost: 0 }];

  while (queue.length) {
    const cur = queue.shift();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      const nextCost = cur.cost + 1;
      if (!inMap(nx, ny, activeMap)) continue;
      if (visited.has(key)) continue;
      if (nextCost > unit.move) continue;
      visited.add(key);
      if (!occupied.has(key)) {
        result.push({ x: nx, y: ny });
        queue.push({ x: nx, y: ny, cost: nextCost });
      }
    }
  }

  return result;
}

export function getAttackTiles(unit, mode, activeMap) {
  if (!unit || unit.acted) return [];
  const range = mode === "skill" ? unit.skillRange || unit.range || 1 : unit.range || 1;
  const result = [];

  for (let y = 0; y < activeMap.length; y++) {
    for (let x = 0; x < activeMap[0].length; x++) {
      const d = Math.abs(unit.x - x) + Math.abs(unit.y - y);
      if (d >= 1 && d <= range) result.push({ x, y });
    }
  }

  return result;
}

function getEnemyAiType(enemy) {
  if (enemy.aiType) return enemy.aiType;
  return enemy.type === "boss" ? "boss" : "aggressive";
}

function sortAlliesByPriority(enemy, allies) {
  const aiType = getEnemyAiType(enemy);
  const withDist = allies.map((ally) => ({ ally, d: distance(enemy, ally) }));

  if (aiType === "assassin") {
    return withDist
      .sort((a, b) => {
        const aLina = a.ally.id === "lina" ? 0 : 1;
        const bLina = b.ally.id === "lina" ? 0 : 1;
        if (aLina !== bLina) return aLina - bLina;
        if (a.d !== b.d) return a.d - b.d;
        return a.ally.hp - b.ally.hp;
      })
      .map((item) => item.ally);
  }

  if (aiType === "boss") {
    return withDist
      .sort((a, b) => {
        if (a.ally.hp !== b.ally.hp) return a.ally.hp - b.ally.hp;
        if (a.d !== b.d) return a.d - b.d;
        return a.ally.id.localeCompare(b.ally.id);
      })
      .map((item) => item.ally);
  }

  return withDist
    .sort((a, b) => a.d - b.d)
    .map((item) => item.ally);
}

export function getTargetInRange(enemy, allies, mode, activeMap) {
  const tiles = getAttackTiles(enemy, mode, activeMap);
  const sortedAllies = sortAlliesByPriority(enemy, allies);
  return sortedAllies.find((ally) => tiles.some((tile) => tile.x === ally.x && tile.y === ally.y));
}

export function canCounterattack(defender, attacker) {
  if (!defender || !attacker) return false;
  if ((defender.hp || 0) <= 0 || (attacker.hp || 0) <= 0) return false;
  const range = defender.range || 1;
  const d = distance(defender, attacker);
  return d >= 1 && d <= range;
}

export function moveEnemyToward(enemy, allies, units, activeMap) {
  const aiType = getEnemyAiType(enemy);
  const target = sortAlliesByPriority(enemy, allies)[0];
  if (!target) return enemy;

  const occupied = new Set(units.map((u) => `${u.x},${u.y}`));
  const candidates = [
    { x: enemy.x + 1, y: enemy.y },
    { x: enemy.x - 1, y: enemy.y },
    { x: enemy.x, y: enemy.y + 1 },
    { x: enemy.x, y: enemy.y - 1 },
  ].filter((p) => inMap(p.x, p.y, activeMap) && !occupied.has(`${p.x},${p.y}`));
  if (candidates.length === 0) return enemy;

  let best;

  if (aiType === "archer") {
    const nearestDist = Math.min(...allies.map((ally) => distance(enemy, ally)));

    if (nearestDist <= 1) {
      // 너무 가까우면 후퇴: 가장 가까운 적과의 최소 거리를 최대화
      best = candidates
        .map((c) => ({
          c,
          nearest: Math.min(...allies.map((ally) => distance(c, ally))),
          toTarget: distance(c, target),
        }))
        .sort((a, b) => {
          if (a.nearest !== b.nearest) return b.nearest - a.nearest;
          return a.toTarget - b.toTarget;
        })[0]?.c;
    } else {
      // 기본은 사거리 2 유지
      best = candidates
        .map((c) => ({
          c,
          rangeGap: Math.abs(distance(c, target) - 2),
          toTarget: distance(c, target),
        }))
        .sort((a, b) => {
          if (a.rangeGap !== b.rangeGap) return a.rangeGap - b.rangeGap;
          return a.toTarget - b.toTarget;
        })[0]?.c;
    }
  } else {
    best = candidates.sort((a, b) => distance(a, target) - distance(b, target))[0];
  }

  return best ? { ...enemy, x: best.x, y: best.y } : enemy;
}

export function getStatusText(statuses) {
  if (!statuses || statuses.length === 0) return "정상";
  return statuses
    .map((s) => `${STATUS_INFO[s.type]?.icon || "•"}${STATUS_INFO[s.type]?.name || s.type}${s.turns}`)
    .join(" ");
}

export function getStatusDefPenalty(unit) {
  return (unit.status || []).some((s) => s.type === "armorBreak") ? 3 : 0;
}

export function addOrRefreshStatus(statuses = [], status) {
  const exists = statuses.some((s) => s.type === status.type);
  if (exists) {
    return statuses.map((s) =>
      s.type === status.type ? { ...s, turns: Math.max(s.turns, status.turns) } : s
    );
  }
  return [...statuses, status];
}

export function getSkillStatus(attacker, mode) {
  if (mode !== "skill") return null;

  if (attacker.id === "lina" || attacker.skill === "파이어볼") {
    return { type: "burn", turns: 2 };
  }

  if (attacker.id === "assassin" || attacker.skill === "그림자 베기") {
    return { type: "bleed", turns: 2 };
  }

  if (attacker.skill === "광폭참" || attacker.skill === "폭풍참") {
    return { type: "armorBreak", turns: 2 };
  }

  if (attacker.id === "icemage" || attacker.skill === "빙결창" || attacker.skill === "절대영도") {
    // turn-start 감소 로직 기준으로 실질 1턴 이동 불가를 위해 2턴으로 부여
    return { type: "freeze", turns: 2 };
  }

  return null;
}

export function applySkillStatusAfterHit(attacker, defenderId, mode, units) {
  const status = getSkillStatus(attacker, mode);
  if (!status) return { units, messages: [] };

  let applied = false;
  const nextUnits = units.map((u) => {
    if (u.id !== defenderId) return u;
    applied = true;
    return { ...u, status: addOrRefreshStatus(u.status || [], status) };
  });

  if (!applied) return { units, messages: [] };

  const info = STATUS_INFO[status.type];
  return {
    units: nextUnits,
    messages: [`${info.icon} ${info.name} 상태가 부여되었습니다.`],
  };
}

export function processTurnStartStatuses(units, side) {
  const messages = [];

  const processed = units
    .map((unit) => {
      const isTargetSide = side === "ally" ? unit.type === "ally" : unit.type !== "ally";

      if (!isTargetSide || !unit.status || unit.status.length === 0) return unit;

      let damage = 0;
      const nextStatuses = [];

      for (const status of unit.status) {
        const info = STATUS_INFO[status.type];

        if (status.type === "burn" || status.type === "bleed") {
          damage += info.damage;
          messages.push(`${unit.name} ${info.icon}${info.name} 피해 ${info.damage}`);
        }

        const nextTurns = status.turns - 1;
        if (nextTurns > 0) {
          nextStatuses.push({ ...status, turns: nextTurns });
        } else {
          messages.push(`${unit.name} ${info.icon}${info.name} 해제`);
        }
      }

      return {
        ...unit,
        hp: Math.max(0, unit.hp - damage),
        status: nextStatuses,
      };
    })
    .filter((unit) => unit.hp > 0);

  return { units: processed, messages };
}

export function processTurnStartTerrain(units, side, activeMap) {
  const messages = [];
  const isTargetSide = side === "ally"
    ? (unit) => unit.type === "ally"
    : (unit) => unit.type !== "ally";

  const processed = units
    .map((unit) => {
      if (!isTargetSide(unit)) return unit;
      if (!inMap(unit.x, unit.y, activeMap)) return unit;
      const tile = activeMap[unit.y][unit.x];
      if (tile === "flame") {
        const damage = 2;
        messages.push(`🔥 화염 지형 → ${unit.name} ${damage} 피해`);
        return {
          ...unit,
          hp: Math.max(0, unit.hp - damage),
        };
      }

      if (tile === "ice") {
        const alreadyFrozen = (unit.status || []).some((s) => s.type === "freeze");
        const nextStatus = addOrRefreshStatus(unit.status || [], { type: "freeze", turns: 2 });
        if (!alreadyFrozen) {
          messages.push(`❄️ 빙결 지형 → ${unit.name} 빙결`);
        }
        return {
          ...unit,
          status: nextStatus,
        };
      }

      return unit;
    })
    .filter((unit) => unit.hp > 0);

  return { units: processed, messages };
}

export function calculateDamage(attacker, defender, mode = "attack") {
  const skillBonus = mode === "skill" ? attacker.skillBonus || 0 : 0;
  const guardReduce = defender.guard ? 4 : 0;
  const armorBreakPenalty = getStatusDefPenalty(defender);
  const effectiveDef = Math.max(0, defender.def - armorBreakPenalty);

  return Math.max(1, attacker.atk + skillBonus - effectiveDef + 4 - guardReduce);
}

function clampRate(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function getHitRate(attacker, defender, mode = "attack") {
  const base = mode === "skill" ? 95 : 88;
  const attackerHit = attacker.hit || 0;
  const defenderEva = defender.eva || 0;
  const guardPenalty = defender.guard ? 8 : 0;
  return clampRate(base + attackerHit - defenderEva - guardPenalty, 35, 100);
}

export function getCritRate(attacker, defender, mode = "attack") {
  const base = mode === "skill" ? 18 : 12;
  const attackerCrit = attacker.crit || 0;
  const defenderCritRes = defender.critRes || 0;
  return clampRate(base + attackerCrit - defenderCritRes, 0, 75);
}

export function isRateSuccess(rate, rng = Math.random) {
  return rng() * 100 < rate;
}

export function getCritDamage(baseDamage) {
  return Math.max(1, Math.ceil(baseDamage * 1.5));
}

export function getBattlePreview(attacker, defender, mode = "attack") {
  const damage = calculateDamage(attacker, defender, mode);
  const critDamage = getCritDamage(damage);
  const hit = getHitRate(attacker, defender, mode);
  const crit = getCritRate(attacker, defender, mode);
  return { damage, critDamage, hit, crit };
}

export function triggerBossPhases(units) {
  const messages = [];

  const updated = units.map((unit) => {
    const shouldPhase =
      unit.type === "boss" &&
      !unit.phase2 &&
      unit.hp > 0 &&
      unit.hp <= Math.ceil(unit.maxHp * 0.5);

    if (!shouldPhase) return unit;

    messages.push(
      `👑 ${unit.name} 2페이즈 진입! 어둠의 파동을 사용하기 시작합니다.`
    );

    return {
      ...unit,
      phase2: true,
      icon: "👹",
      atk: unit.atk + 2,
      def: unit.def + 1,
      range: Math.max(unit.range || 1, 2),
      skill: "어둠의 파동",
      skillBonus: (unit.skillBonus || 0) + 2,
      skillRange: 2,
    };
  });

  return { units: updated, messages };
}

export function createBossHazards(units, activeMap) {
  const boss = units.find((u) => u.type === "boss" && u.phase2 && u.hp > 0);
  if (!boss) return [];

  const allies = units.filter((u) => u.type === "ally" && u.hp > 0);
  const hazards = [];
  const used = new Set();

  const addHazard = (x, y) => {
    if (!inMap(x, y, activeMap)) return;
    const key = `${x},${y}`;
    if (used.has(key)) return;
    used.add(key);
    hazards.push({ x, y });
  };

  for (const ally of allies) {
    addHazard(ally.x, ally.y);

    const dx = boss.x > ally.x ? 1 : boss.x < ally.x ? -1 : 0;
    const dy = boss.y > ally.y ? 1 : boss.y < ally.y ? -1 : 0;

    if (Math.abs(boss.x - ally.x) >= Math.abs(boss.y - ally.y)) {
      addHazard(ally.x + dx, ally.y);
    } else {
      addHazard(ally.x, ally.y + dy);
    }

    if (hazards.length >= 5) break;
  }

  return hazards.slice(0, 5);
}

export function resolveHazards(units, hazards) {
  if (!hazards || hazards.length === 0) {
    return { units, messages: [] };
  }

  const messages = [];
  const hazardSet = new Set(hazards.map((h) => `${h.x},${h.y}`));

  const updated = units
    .map((unit) => {
      if (unit.type !== "ally") return unit;

      if (!hazardSet.has(`${unit.x},${unit.y}`)) return unit;

      const damage = 6;
      messages.push(`☠️ 어둠의 파동 폭발 → ${unit.name} ${damage} 피해`);

      return {
        ...unit,
        hp: Math.max(0, unit.hp - damage),
      };
    })
    .filter((unit) => unit.hp > 0);

  return { units: updated, messages };
}
