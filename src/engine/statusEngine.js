import { STATUS_INFO } from "../data/statuses.js";
import { getNewTerrainPolicy } from '../data/terrainPolicy.js';

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
      s.type === status.type ? { ...s, ...status, sourceId: status.sourceId, turns: Math.max(s.turns, status.turns) } : s
    );
  }
  return [...statuses, status];
}


export function getSkillStatus(attacker, mode) {
  if (mode !== "skill") return null;
  if (attacker.skillSpec) return attacker.skillSpec.status ? {
    type: attacker.skillSpec.status,
    turns: 2,
    ...(Number.isFinite(attacker.skillSpec.statusPower) ? { power: attacker.skillSpec.statusPower } : {}),
  } : null;

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
    return { ...u, status: addOrRefreshStatus(u.status || [], { ...status, sourceId: attacker.id }) };
  });

  if (!applied) return { units, messages: [] };

  const info = STATUS_INFO[status.type] || { name: status.type, icon: '•', damage: 0 };
  return {
    units: nextUnits,
    messages: [`${info.icon} ${info.name} 상태가 부여되었습니다.`],
  };
}


export function processTurnStartStatuses(units, side) {
  const messages = [];
  const defeats = [];

  const processed = units
    .map((unit) => {
      const isTargetSide = side === "ally" ? unit.type === "ally" : unit.type !== "ally";

      if (!isTargetSide || !unit.status || unit.status.length === 0) return unit;

      let damage = 0;
      let recovery = 0;
      let recoveryInfo = null;
      const nextStatuses = [];

      for (const status of unit.status) {
        const info = STATUS_INFO[status.type] || { name: status.type, icon: '•', damage: 0 };

        if (status.type === "burn" || status.type === "bleed") {
          const previousDamage = damage;
          damage += info.damage;
          if (unit.hp > previousDamage && unit.hp <= damage && status.sourceId) {
            defeats.push({ enemy: unit, killerId: status.sourceId });
          }
          messages.push(`${unit.name} ${info.icon}${info.name} 피해 ${info.damage}`);
        }

        if (status.type === "freeze") {
          messages.push(`${unit.name} ${info.icon}${info.name}: 이동 불가`);
        }

        if (status.type === 'regen' && unit.hp > 0) {
          const power = Number.isFinite(status.power) ? Math.max(0, status.power) : 4;
          const missingHp = Math.max(0, (unit.maxHp ?? unit.hp) - unit.hp);
          recovery = Math.max(recovery, Math.min(power, missingHp));
          recoveryInfo = info;
        }

        const effect = { slow: '이동', attackDown: '공격', fortify: '방어', inspire: '공격' }[status.type];
        if (effect) {
          const power = Number.isFinite(status.power) ? Math.max(1, status.power) : status.type === 'slow' ? 1 : 3;
          const sign = ['slow', 'attackDown'].includes(status.type) ? '-' : '+';
          messages.push(`${unit.name} ${info.icon}${info.name}: ${effect} ${sign}${power}`);
        }
        if (status.type === 'waterStride') {
          messages.push(`${unit.name} ${info.icon}${info.name}: 얕은 물 · 늪 이동 비용 1`);
        }

        const nextTurns = status.type === 'regen' ? 0 : status.turns - 1;
        if (nextTurns > 0) {
          nextStatuses.push({ ...status, turns: nextTurns });
        } else {
          messages.push(`${unit.name} ${info.icon}${info.name} 해제`);
        }
      }

      if (recovery > 0 && unit.hp - damage > 0) {
        messages.push(`${unit.name} ${recoveryInfo.icon}${recoveryInfo.name} 회복 ${recovery}`);
      }

      return {
        ...unit,
        hp: unit.hp > 0 && unit.hp - damage > 0 ? unit.hp - damage + recovery : 0,
        status: nextStatuses,
      };
    })
    .filter((unit) => unit.hp > 0);

  return { units: processed, messages, defeats };
}



export function processTerrainStartEffects(units, side, activeMap) {
  const messages = [];

  const processed = units
    .map((unit) => {
      const isTargetSide = side === "ally" ? unit.type === "ally" : unit.type !== "ally";

      if (!isTargetSide) return unit;

      const tile = activeMap?.[unit.y]?.[unit.x];
      const policy = getNewTerrainPolicy(tile);

      // Only living units of the active side recover, once in their own turn.
      if (policy?.effect === 'restore' && unit.hp > 0) {
        const missingHp = Math.max(0, (unit.maxHp ?? unit.hp) - unit.hp);
        const recovery = Math.min(policy.heal, missingHp);
        if (recovery <= 0) return unit;
        messages.push(`${unit.name} ${policy.icon}${policy.name} 회복 ${recovery}`);
        return { ...unit, hp: unit.hp + recovery };
      }

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
