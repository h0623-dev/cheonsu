import { STATUS_INFO } from "../data/statuses.js";

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

  if (attacker.id === "lina" || attacker.skill === "파이어볼" || attacker.skill === "다크 플레임" || attacker.skill === "화염 폭발") {
    return { type: "burn", turns: 2 };
  }

  if (attacker.id === "assassin" || attacker.skill === "그림자 베기") {
    return { type: "bleed", turns: 2 };
  }

  if (
    attacker.skill === "혈염" ||
    attacker.skill === "혈염 폭발" ||
    attacker.skill === "암흑 사격" ||
    attacker.skill === "암흑 기도" ||
    attacker.skill === "재의 심판"
  ) {
    return { type: "bleed", turns: 2 };
  }

  if (
    attacker.skill === "빙결탄" ||
    attacker.skill === "얼음 송곳니" ||
    attacker.skill === "빙결 파동"
  ) {
    return { type: "freeze", turns: 2 };
  }

  if (attacker.skill === "광폭참" || attacker.skill === "폭풍참") {
    return { type: "armorBreak", turns: 2 };
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

        if (status.type === "freeze") {
          messages.push(`${unit.name} ${info.icon}${info.name}: 이동 불가`);
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



export function processTerrainStartEffects(units, side, activeMap) {
  const messages = [];

  const processed = units
    .map((unit) => {
      const isTargetSide = side === "ally" ? unit.type === "ally" : unit.type !== "ally";

      if (!isTargetSide) return unit;

      const tile = activeMap?.[unit.y]?.[unit.x];

      if (tile === "fire") {
        const info = STATUS_INFO.burn;
        const damage = 2;
        messages.push(`${unit.name} 🔥화염 지형 피해 ${damage}`);
        messages.push(`${unit.name} ${info.icon}${info.name} 상태가 부여되었습니다.`);

        return {
          ...unit,
          hp: Math.max(0, unit.hp - damage),
          status: addOrRefreshStatus(unit.status || [], { type: "burn", turns: 2 }),
        };
      }

      if (tile === "ice") {
        const info = STATUS_INFO.freeze;
        messages.push(`${unit.name} ${info.icon}${info.name} 지형 효과: 이동 불가`);
        messages.push(`${unit.name} ${info.icon}${info.name} 상태가 부여되었습니다.`);

        return {
          ...unit,
          status: addOrRefreshStatus(unit.status || [], { type: "freeze", turns: 2 }),
        };
      }

      if (tile === "dark" || tile === "rune") {
        const info = STATUS_INFO.bleed;
        const damage = tile === "rune" ? 2 : 1;
        messages.push(`${unit.name} 🌑흑야 지형 피해 ${damage}`);
        messages.push(`${unit.name} ${info.icon}${info.name} 상태가 부여되었습니다.`);

        return {
          ...unit,
          hp: Math.max(0, unit.hp - damage),
          status: addOrRefreshStatus(unit.status || [], { type: "bleed", turns: 2 }),
        };
      }

      if (tile === "trap") {
        const damage = 4;
        messages.push(`${unit.name} ⚠️함정 피해 ${damage}`);

        return {
          ...unit,
          hp: Math.max(0, unit.hp - damage),
        };
      }

      if (tile === "swamp") {
        const damage = 1;
        messages.push(`${unit.name} 🟤늪지 피해 ${damage}`);

        return {
          ...unit,
          hp: Math.max(0, unit.hp - damage),
        };
      }

      if (tile === "water" && unit.type === "ally") {
        messages.push(`${unit.name} 🌊여울 통과: 다음 행동에 주의`);

        return unit;
      }

      return unit;
    })
    .filter((unit) => unit.hp > 0);

  return { units: processed, messages };
}
