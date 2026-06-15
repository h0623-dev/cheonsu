import { inMap } from "./movement.js";
import { getStatusDefPenalty } from "./statusEngine.js";


export function getUnitCombatClass(unit) {
  if (!unit) return "sword";

  const id = unit.id || "";
  const name = unit.name || "";
  const skill = unit.skill || "";
  const text = `${id} ${name} ${skill}`;

  if (["bram", "rakan", "baekho"].includes(id) || text.includes("방패") || text.includes("수비")) {
    return "shield";
  }

  if (["leon", "luka"].includes(id) || text.includes("궁병") || text.includes("저격") || text.includes("사격") || text.includes("활")) {
    return "bow";
  }

  if (
    ["lina", "aria", "noah", "yuna", "irene", "ella"].includes(id) ||
    text.includes("마도사") ||
    text.includes("마녀") ||
    text.includes("사제") ||
    text.includes("주술") ||
    text.includes("기도") ||
    text.includes("파이어") ||
    text.includes("화염") ||
    text.includes("빙결") ||
    text.includes("룬") ||
    text.includes("심장") ||
    text.includes("대주교")
  ) {
    return "magic";
  }

  if (["sera", "miho", "kaz"].includes(id) || text.includes("암살") || text.includes("그림자") || text.includes("단검")) {
    return "dagger";
  }

  if (text.includes("창병") || text.includes("투창") || text.includes("긴 창")) {
    return "spear";
  }

  if (text.includes("늑대") || text.includes("야수") || text.includes("백호")) {
    return "beast";
  }

  return "sword";
}


export function getCombatClassLabel(type) {
  const labels = {
    sword: "검",
    spear: "창",
    bow: "활",
    magic: "마법",
    dagger: "단검",
    shield: "방패",
    beast: "야수",
  };

  return labels[type] || "검";
}


const ADVANTAGE = {
  sword: ["dagger", "beast"],
  spear: ["sword", "shield"],
  bow: ["magic", "beast"],
  magic: ["shield", "spear"],
  dagger: ["bow", "magic"],
  shield: ["dagger", "bow"],
  beast: ["spear", "magic"],
};


export function getCombatAffinity(attacker, defender) {
  const attackerClass = getUnitCombatClass(attacker);
  const defenderClass = getUnitCombatClass(defender);

  const attackerAdv = ADVANTAGE[attackerClass] || [];
  const defenderAdv = ADVANTAGE[defenderClass] || [];

  if (attackerAdv.includes(defenderClass)) {
    return {
      state: "advantage",
      label: "상성 유리",
      icon: "▲",
      attackerClass,
      defenderClass,
      damageMod: 2,
      hitMod: 8,
      critMod: 5,
    };
  }

  if (defenderAdv.includes(attackerClass)) {
    return {
      state: "disadvantage",
      label: "상성 불리",
      icon: "▼",
      attackerClass,
      defenderClass,
      damageMod: -2,
      hitMod: -8,
      critMod: -4,
    };
  }

  return {
    state: "neutral",
    label: "상성 보통",
    icon: "—",
    attackerClass,
    defenderClass,
    damageMod: 0,
    hitMod: 0,
    critMod: 0,
  };
}


export function calculateDamage(attacker, defender, mode = "attack") {
  const skillBonus = mode === "skill" ? attacker.skillBonus || 0 : 0;
  const guardReduce = defender.guard ? 4 : 0;
  const armorBreakPenalty = getStatusDefPenalty(defender);
  const effectiveDef = Math.max(0, defender.def - armorBreakPenalty);
  const affinity = getCombatAffinity(attacker, defender);

  return Math.max(
    1,
    attacker.atk + skillBonus - effectiveDef + 4 - guardReduce + affinity.damageMod
  );
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

      const hazard = hazards.find((h) => `${h.x},${h.y}` === `${unit.x},${unit.y}`);
      const damage = hazard?.damage || 6;
      const patternText = hazard?.label ? ` ${hazard.label}` : " 어둠의 파동";
      messages.push(`☠️${patternText} 폭발 → ${unit.name} ${damage} 피해`);

      return {
        ...unit,
        hp: Math.max(0, unit.hp - damage),
      };
    })
    .filter((unit) => unit.hp > 0);

  return { units: updated, messages };
}




export function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function calculateHit(attacker, defender, mode = "attack") {
  const skillHitBonus = mode === "skill" ? 7 : 0;
  const attackerFocus = attacker.skl || attacker.atk || 5;
  const defenderAvoid = (defender.spd || defender.move || 3) * 3 + (defender.guard ? 5 : 0);
  const affinity = getCombatAffinity(attacker, defender);

  return Math.round(
    clampNumber(78 + attackerFocus * 2 + skillHitBonus - defenderAvoid + affinity.hitMod, 25, 98)
  );
}

export function calculateCrit(attacker, defender, mode = "attack") {
  const skillCritBonus = mode === "skill" ? 8 : 0;
  const attackerFocus = attacker.skl || attacker.atk || 5;
  const defenderLuck = defender.luk || 4;
  const affinity = getCombatAffinity(attacker, defender);

  return Math.round(
    clampNumber(3 + Math.floor(attackerFocus / 2) + skillCritBonus - defenderLuck + affinity.critMod, 0, 40)
  );
}

export function rollCombat(battlePreview) {
  const hitRoll = Math.random() * 100;
  const hit = hitRoll <= battlePreview.hit;

  if (!hit) {
    return {
      hit: false,
      crit: false,
      damage: 0,
      hitRoll,
      critRoll: null,
      tactics: battlePreview.tactics || null,
    };
  }

  const critRoll = Math.random() * 100;
  const crit = critRoll <= battlePreview.crit;
  const damage = crit ? Math.max(1, Math.floor(battlePreview.damage * 2)) : battlePreview.damage;

  return {
    hit: true,
    crit,
    damage,
    hitRoll,
    critRoll,
    tactics: battlePreview.tactics || null,
  };
}
