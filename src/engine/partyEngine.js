import { stages } from "../data/stages.js";
import { EQUIPMENT, EQUIPMENT_SLOTS, normalizeEquipmentSlots } from "../data/equipment.js";
import { getSkill, getSkillDisplayName } from '../data/skills.js';

import { restoreAllyWeaponIdentity } from './allyWeaponIdentity.js';

export function clone(data) {
  return JSON.parse(JSON.stringify(data));
}


export function getGearEnhanceBonus(gear, level = 0) {
  if (!gear) return { atk: 0, def: 0 };
  const value = Number(level);
  const safeLevel = Number.isFinite(value) ? Math.max(0, Math.min(5, Math.floor(value))) : 0;
  return {
    atk: gear.atk > 0 ? safeLevel : 0,
    def: gear.def > 0 ? safeLevel : 0,
  };
}

export function getEquipmentBonus(unit) {
  const equipment = normalizeEquipmentSlots(unit?.equipment);
  const enhancements = unit?.gearEnhance || {};
  return EQUIPMENT_SLOTS.reduce((total, slot) => {
    const item = EQUIPMENT[equipment[slot]];
    // A legacy unknown ID stays in the save but cannot become a duplicate bonus in another slot.
    if (!item || item.slot !== slot) return total;
    const enhanced = getGearEnhanceBonus(item, enhancements[item.id]);
    return { atk: total.atk + item.atk + enhanced.atk, def: total.def + item.def + enhanced.def };
  }, { atk: 0, def: 0 });
}

function recoverExistingEquipmentBaseStats(unit) {
  const bonus = getEquipmentBonus(unit);
  const guard = Number.isFinite(unit.skillGuardBoost) ? unit.skillGuardBoost : 0;
  const power = Number.isFinite(unit.itemPowerBoost) ? unit.itemPowerBoost : 0;
  const itemGuard = Number.isFinite(unit.itemGuardBoost) ? unit.itemGuardBoost : 0;
  // Pre-base-stat saves already store the displayed, equipped values in atk/def.
  // Recover the base once, so loading, training and changing promotion never stack the gear.
  return {
    baseAtk: Number.isFinite(unit.baseAtk) ? unit.baseAtk : (Number.isFinite(unit.atk) ? unit.atk : 0) - bonus.atk - power,
    baseDef: Number.isFinite(unit.baseDef) ? unit.baseDef : (Number.isFinite(unit.def) ? unit.def : 0) - bonus.def - guard - itemGuard,
  };
}

export function makeAlly(unit) {
  unit = restoreAllyWeaponIdentity(unit);
  const skill = getSkill(unit, unit.activeSkillId);
  return {
    ...unit,
    ...recoverExistingEquipmentBaseStats(unit),
    skill: getSkillDisplayName(unit),
    ...(skill ? { skillType: skill.type, skillRange: skill.range } : {}),
    level: unit.level || 1,
    exp: unit.exp || 0,
    baseSkillBonus: unit.baseSkillBonus ?? unit.skillBonus ?? 0,
    skillLevel: unit.skillLevel || 0,
    equipment: normalizeEquipmentSlots(unit.equipment),
    gearEnhance: unit.gearEnhance || {},
  };
}

export function applyEquipmentStats(unit) {
  if (unit.type !== "ally") return unit;
  const bonus = getEquipmentBonus(unit);
  const skillGuardBoost = Number.isFinite(unit.skillGuardBoost) ? unit.skillGuardBoost : 0;
  const itemPowerBoost = Number.isFinite(unit.itemPowerBoost) ? unit.itemPowerBoost : 0;
  const itemGuardBoost = Number.isFinite(unit.itemGuardBoost) ? unit.itemGuardBoost : 0;
  // Runtime callers can attach gear to a fresh unit that has never been equipped.
  // Its atk/def are bare stats; legacy equipped totals are recovered by makeAlly/save loading.
  const baseAtk = Number.isFinite(unit.baseAtk) ? unit.baseAtk : (Number.isFinite(unit.atk) ? unit.atk : 0) - itemPowerBoost;
  const baseDef = Number.isFinite(unit.baseDef) ? unit.baseDef : (Number.isFinite(unit.def) ? unit.def : 0) - skillGuardBoost - itemGuardBoost;
  return {
    ...unit,
    equipment: normalizeEquipmentSlots(unit.equipment),
    gearEnhance: unit.gearEnhance || {},
    baseAtk,
    baseDef,
    atk: baseAtk + bonus.atk + itemPowerBoost,
    def: baseDef + bonus.def + skillGuardBoost + itemGuardBoost,
  };
}


export function applyEquipmentToParty(party) {
  return party.map((unit) => applyEquipmentStats({
    ...makeAlly(unit),
    itemPowerBoost: 0,
    itemGuardBoost: 0,
    skillGuardBoost: 0,
    guard: false,
  }));
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
        skillGuardBoost: 0,
        skillCooldown: 0,
        skillCooldowns: {},
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
      skillGuardBoost: 0,
      skillCooldown: 0,
      skillCooldowns: {},
      supportUsed: false,
      status: [],
    });

    used.add(`${nextUnit.x},${nextUnit.y}`);
    merged.push(nextUnit);
  }

  return merged;
}


export function mergePartyFromUnits(prevParty, currentUnits) {
  const allies = currentUnits.filter((unit) => unit.type === "ally");
  return applyEquipmentToParty(prevParty.map((unit) => ({
    ...(allies.find((ally) => ally.id === unit.id) || unit),
    skillCooldown: 0,
    skillCooldowns: {},
  })));
}


export function grantExp(units, attackerId, expAmount) {
  if (!Number.isFinite(expAmount) || expAmount <= 0) return { units, messages: [] };
  let messages = [];
  const updated = units.map((unit) => {
    if (unit.id !== attackerId || unit.type !== "ally") return unit;
    const storedExp = Number(unit.exp);
    let nextExp = (Number.isFinite(storedExp) ? Math.max(0, storedExp) : 0) + expAmount;
    // Experience comes from an existing unit, so old equipped saves need their base recovered first.
    let nextUnit = applyEquipmentStats({ ...unit, ...recoverExistingEquipmentBaseStats(unit), exp: nextExp });
    messages.push(`${unit.name} EXP +${expAmount}`);
    while (nextExp >= 100) {
      const oldBaseAtk = nextUnit.baseAtk ?? nextUnit.atk;
      const oldBaseDef = nextUnit.baseDef ?? (nextUnit.def - (nextUnit.skillGuardBoost || 0));
      nextUnit = {
        ...nextUnit,
        level: (nextUnit.level || 1) + 1,
        exp: nextExp - 100,
        maxHp: nextUnit.maxHp + 2,
        hp: nextUnit.hp > 0 ? Math.min(nextUnit.maxHp + 2, nextUnit.hp + 2) : 0,
        baseAtk: oldBaseAtk + 1,
        baseDef: oldBaseDef + 1,
      };
      nextUnit = applyEquipmentStats(nextUnit);
      nextExp = nextUnit.exp;
      messages.push(`${unit.name} 레벨 업! Lv.${nextUnit.level}`);
    }
    return nextUnit;
  });
  return { units: updated, messages };
}

// Persist only successful advanced mastery; battle HP and temporary effects stay on the field.
export function syncBattleSkillMastery(party, sourceUnits, unitId) {
  const source = sourceUnits.find(unit => unit.id === unitId && unit.type === 'ally');
  const earned = source?.advancedMastery;
  if (!Number.isInteger(earned) || earned < 0 || earned > 3) return party;
  return party.map(unit => unit.id === unitId && unit.type === 'ally'
    ? { ...unit, advancedMastery: Math.max(Number.isInteger(unit.advancedMastery) && unit.advancedMastery >= 0 && unit.advancedMastery <= 3 ? unit.advancedMastery : 0, earned) }
    : unit);
}
