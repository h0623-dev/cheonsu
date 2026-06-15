import { stages } from "../data/stages.js";
import { EQUIPMENT } from "../data/equipment.js";

export function clone(data) {
  return JSON.parse(JSON.stringify(data));
}


export function makeAlly(unit) {
  return {
    ...unit,
    level: unit.level || 1,
    exp: unit.exp || 0,
    baseAtk: unit.baseAtk || unit.atk,
    baseDef: unit.baseDef || unit.def,
    baseSkillBonus: unit.baseSkillBonus ?? unit.skillBonus ?? 0,
    skillLevel: unit.skillLevel || 0,
    equipment: unit.equipment || { weapon: null, armor: null },
    gearEnhance: unit.gearEnhance || {},
  };
}






export function getGearEnhanceBonus(gear, level = 0) {
  if (!gear || !level) return { atk: 0, def: 0 };

  const safeLevel = Math.max(0, Math.min(5, Number(level) || 0));

  return {
    atk: gear.atk > 0 ? safeLevel : 0,
    def: gear.def > 0 ? safeLevel : 0,
  };
}


export function applyEquipmentStats(unit) {
  if (unit.type !== "ally") return unit;

  const baseAtk = unit.baseAtk ?? unit.atk;
  const baseDef = unit.baseDef ?? unit.def;
  const gearEnhance = unit.gearEnhance || {};

  const weapon = unit.equipment?.weapon ? EQUIPMENT[unit.equipment.weapon] : null;
  const armor = unit.equipment?.armor ? EQUIPMENT[unit.equipment.armor] : null;

  const weaponEnhance = weapon ? getGearEnhanceBonus(weapon, gearEnhance[weapon.id] || 0) : { atk: 0, def: 0 };
  const armorEnhance = armor ? getGearEnhanceBonus(armor, gearEnhance[armor.id] || 0) : { atk: 0, def: 0 };

  const atkBonus =
    (weapon?.atk || 0) +
    (armor?.atk || 0) +
    weaponEnhance.atk +
    armorEnhance.atk;
  const defBonus =
    (weapon?.def || 0) +
    (armor?.def || 0) +
    weaponEnhance.def +
    armorEnhance.def;

  return {
    ...unit,
    gearEnhance,
    baseAtk,
    baseDef,
    atk: baseAtk + atkBonus,
    def: baseDef + defBonus,
  };
}


export function applyEquipmentToParty(party) {
  return party.map((u) => applyEquipmentStats(makeAlly(u)));
}



export function getInitialParty() {
  const initialAllyIds = ["hero", "bram", "lina", "aria"];

  return clone(
    stages[0].units
      .filter((u) => u.type === "ally" && initialAllyIds.includes(u.id))
      .map(makeAlly)
  ).map(applyEquipmentStats);
}


function getSpawnPositions(stage) {
  const map = stage?.map || [[]];
  const h = map.length || 8;
  const w = map[0]?.length || 8;

  return [
    { x: 0, y: h - 3 },
    { x: 1, y: h - 3 },
    { x: 2, y: h - 3 },
    { x: 3, y: h - 3 },
    { x: 4, y: h - 3 },
    { x: 0, y: h - 2 },
    { x: 1, y: h - 2 },
    { x: 2, y: h - 2 },
    { x: 3, y: h - 2 },
    { x: 4, y: h - 2 },
    { x: 0, y: h - 1 },
    { x: 1, y: h - 1 },
    { x: 2, y: h - 1 },
    { x: 3, y: h - 1 },
    { x: 4, y: h - 1 },
  ].filter((p) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < h);
}

function pickFreeSpawn(stage, used) {
  const spawns = getSpawnPositions(stage);

  return spawns.find((p) => !used.has(`${p.x},${p.y}`)) || spawns[0] || { x: 0, y: 0 };
}


export function mergePartyIntoStage(stage, party) {
  const currentParty = applyEquipmentToParty((party || []).map(makeAlly));
  const stageUnits = clone(stage.units);
  const used = new Set();

  const merged = stageUnits
    .map((unit) => {
      if (unit.type !== "ally") {
        used.add(`${unit.x},${unit.y}`);
        return unit;
      }

      const saved = currentParty.find((p) => p.id === unit.id);

      if (!saved) return null;

      const nextUnit = applyEquipmentStats({
        ...unit,
        ...saved,
        x: unit.x,
        y: unit.y,
        hp: saved.maxHp,
        maxHp: saved.maxHp,
        atk: saved.baseAtk ?? saved.atk,
        def: saved.baseDef ?? saved.def,
        baseAtk: saved.baseAtk ?? saved.atk,
        baseDef: saved.baseDef ?? saved.def,
        baseSkillBonus: saved.baseSkillBonus ?? saved.skillBonus ?? unit.skillBonus ?? 0,
        skillLevel: saved.skillLevel || 0,
        skillBonus: saved.skillBonus ?? unit.skillBonus ?? 0,
        moved: false,
        acted: false,
        guard: false,
        skillCooldown: 0,
        supportUsed: false,
        status: [],
      });

      used.add(`${nextUnit.x},${nextUnit.y}`);
      return nextUnit;
    })
    .filter(Boolean);

  for (const ally of currentParty) {
    if (merged.some((unit) => unit.id === ally.id)) continue;

    const spawn = pickFreeSpawn(stage, used);
    const nextUnit = applyEquipmentStats({
      ...ally,
      x: spawn.x,
      y: spawn.y,
      hp: ally.maxHp,
      moved: false,
      acted: false,
      guard: false,
      skillCooldown: 0,
      supportUsed: false,
      status: [],
    });

    used.add(`${nextUnit.x},${nextUnit.y}`);
    merged.push(nextUnit);
  }

  return merged;
}


export function mergePartyFromUnits(prevParty, currentUnits) {
  const allies = currentUnits.filter((u) => u.type === "ally").map(makeAlly).map(applyEquipmentStats);
  return prevParty.map((unit) => allies.find((ally) => ally.id === unit.id) || unit);
}


export function grantExp(units, attackerId, expAmount) {
  let messages = [];
  const updated = units.map((unit) => {
    if (unit.id !== attackerId || unit.type !== "ally") return unit;
    let nextExp = (unit.exp || 0) + expAmount;
    let nextUnit = { ...unit, exp: nextExp };
    messages.push(`${unit.name} EXP +${expAmount}`);
    if (nextExp >= 100) {
      const oldBaseAtk = nextUnit.baseAtk ?? nextUnit.atk;
      const oldBaseDef = nextUnit.baseDef ?? nextUnit.def;
      nextUnit = {
        ...nextUnit,
        level: (unit.level || 1) + 1,
        exp: nextExp - 100,
        maxHp: unit.maxHp + 2,
        hp: Math.min(unit.maxHp + 2, unit.hp + 2),
        baseAtk: oldBaseAtk + 1,
        baseDef: oldBaseDef + 1,
      };
      nextUnit = applyEquipmentStats(nextUnit);
      messages.push(`${unit.name} 레벨 업! Lv.${nextUnit.level}`);
    }
    return nextUnit;
  });
  return { units: updated, messages };
}
