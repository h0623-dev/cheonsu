import { stages } from "../data/stages.js";
import { DEFAULT_GEAR_INVENTORY } from "../data/equipment.js";
import { DEFAULT_SUPPORT_POINTS, DEFAULT_SUPPORT_DIALOGUES_SEEN } from "../data/supports.js";
import { inMap } from "./movement.js";
import {
  clone,
  getInitialParty,
  mergePartyIntoStage,
  applyEquipmentToParty,
  applyEquipmentStats,
  makeAlly,
} from "./partyEngine.js";

const DEFAULT_INVENTORY = {
  potion: 3,
  hiPotion: 1,
  remedy: 1,
  powerCharm: 0,
  guardCharm: 0,
};

export function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

export function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

export function resolveStageFromSave(data) {
  const savedStage = data?.selectedStage;

  if (
    savedStage &&
    typeof savedStage.id === "number" &&
    Array.isArray(savedStage.map) &&
    Array.isArray(savedStage.units)
  ) {
    return savedStage;
  }

  const stageId = data?.selectedStage?.id || data?.currentStageId || 1;
  return stages.find((stage) => stage.id === stageId) || stages[0];
}

export function normalizeSupportPoints(points) {
  return {
    ...DEFAULT_SUPPORT_POINTS,
    ...safeObject(points, {}),
  };
}

export function normalizeSupportDialoguesSeen(seen) {
  const raw = safeObject(seen, {});
  const result = { ...DEFAULT_SUPPORT_DIALOGUES_SEEN };

  for (const pairId of Object.keys(result)) {
    result[pairId] = Array.isArray(raw[pairId])
      ? raw[pairId].filter((rank) => ["C", "B", "A"].includes(rank))
      : [];
  }

  return result;
}



export function normalizeGearEnhance(enhance) {
  const raw = safeObject(enhance, {});

  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, level]) => typeof level === "number" && Number.isFinite(level))
      .map(([gearId, level]) => [gearId, Math.max(0, Math.min(5, Math.floor(level)))])
  );
}




export function normalizeCareerStats(stats) {
  const defaults = {
    battles: 0,
    victories: 0,
    defeats: 0,
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    totalHealingDone: 0,
    totalKills: 0,
    totalAssists: 0,
    totalLootDrops: 0,
    bestDamageDealt: 0,
    bestKills: 0,
    mvpCounts: {},
  };
  const raw = safeObject(stats, {});

  return {
    ...defaults,
    ...Object.fromEntries(
      Object.entries(raw).filter(([, value]) => typeof value !== "object" || Array.isArray(value))
    ),
    mvpCounts: safeObject(raw.mvpCounts, {}),
  };
}

export function normalizeUnitBattleStats(stats) {
  const raw = safeObject(stats, {});
  const result = {};

  for (const [unitId, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;

    result[unitId] = {
      damageDealt:
        typeof value.damageDealt === "number" && Number.isFinite(value.damageDealt)
          ? Math.max(0, value.damageDealt)
          : 0,
      damageTaken:
        typeof value.damageTaken === "number" && Number.isFinite(value.damageTaken)
          ? Math.max(0, value.damageTaken)
          : 0,
      healingDone:
        typeof value.healingDone === "number" && Number.isFinite(value.healingDone)
          ? Math.max(0, value.healingDone)
          : 0,
      kills:
        typeof value.kills === "number" && Number.isFinite(value.kills)
          ? Math.max(0, value.kills)
          : 0,
      assists:
        typeof value.assists === "number" && Number.isFinite(value.assists)
          ? Math.max(0, value.assists)
          : 0,
      counters:
        typeof value.counters === "number" && Number.isFinite(value.counters)
          ? Math.max(0, value.counters)
          : 0,
      skillsUsed:
        typeof value.skillsUsed === "number" && Number.isFinite(value.skillsUsed)
          ? Math.max(0, value.skillsUsed)
          : 0,
      itemsUsed:
        typeof value.itemsUsed === "number" && Number.isFinite(value.itemsUsed)
          ? Math.max(0, value.itemsUsed)
          : 0,
    };
  }

  return result;
}

export function normalizeBattleStats(stats) {
  const defaults = {
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    kills: 0,
    assists: 0,
    itemsUsed: 0,
    skillsUsed: 0,
    counters: 0,
    lootDrops: 0,
  };
  const raw = safeObject(stats, {});

  return Object.fromEntries(
    Object.keys(defaults).map((key) => [
      key,
      typeof raw[key] === "number" && Number.isFinite(raw[key])
        ? Math.max(0, raw[key])
        : defaults[key],
    ])
  );
}

export function normalizeLoot(loot) {
  const raw = safeObject(loot, {});

  return {
    gold:
      typeof raw.gold === "number" && Number.isFinite(raw.gold)
        ? Math.max(0, raw.gold)
        : 0,
    items: safeObject(raw.items, {}),
    gear: safeArray(raw.gear, []).filter((gearId) => typeof gearId === "string"),
  };
}

export function normalizeInventory(inventory) {
  const raw = safeObject(inventory, {});

  return Object.fromEntries(
    Object.keys(DEFAULT_INVENTORY).map((key) => [
      key,
      typeof raw[key] === "number" && Number.isFinite(raw[key])
        ? Math.max(0, raw[key])
        : DEFAULT_INVENTORY[key],
    ])
  );
}

export function normalizeParty(rawParty) {
  const baseParty = getInitialParty();
  const incoming = safeArray(rawParty, []);

  const merged = baseParty.map((baseUnit) => {
    const saved = incoming.find((unit) => unit?.id === baseUnit.id);
    if (!saved) return baseUnit;

    return {
      ...baseUnit,
      ...saved,
      hp:
        typeof saved.hp === "number" && Number.isFinite(saved.hp)
          ? Math.min(saved.maxHp || baseUnit.maxHp, Math.max(1, saved.hp))
          : baseUnit.hp,
      maxHp:
        typeof saved.maxHp === "number" && Number.isFinite(saved.maxHp)
          ? saved.maxHp
          : baseUnit.maxHp,
      level:
        typeof saved.level === "number" && Number.isFinite(saved.level)
          ? Math.max(1, saved.level)
          : baseUnit.level,
      exp:
        typeof saved.exp === "number" && Number.isFinite(saved.exp)
          ? Math.max(0, saved.exp)
          : baseUnit.exp,
      equipment: {
        weapon: saved.equipment?.weapon || null,
        armor: saved.equipment?.armor || null,
      },
      acted: false,
      moved: false,
      guard: false,
    };
  });

  const extraAllies = incoming
    .filter(
      (unit) =>
        unit?.type === "ally" &&
        typeof unit.id === "string" &&
        !merged.some((baseUnit) => baseUnit.id === unit.id)
    )
    .map((unit) =>
      makeAlly({
        ...unit,
        acted: false,
        moved: false,
        guard: false,
      })
    );

  return applyEquipmentToParty([...merged, ...extraAllies]);
}

export function normalizeUnits(rawUnits, stage, party) {
  const incoming = safeArray(rawUnits, null);

  if (!incoming) {
    return mergePartyIntoStage(stage, party);
  }

  const stageUnits = clone(stage.units);
  const normalized = stageUnits.map((stageUnit) => {
    const saved = incoming.find((unit) => unit?.id === stageUnit.id);
    const base = saved || stageUnit;

    if (stageUnit.type === "ally") {
      const savedPartyUnit = party.find((unit) => unit.id === stageUnit.id);
      const merged = {
        ...stageUnit,
        ...(savedPartyUnit || {}),
        ...base,
        type: "ally",
        acted: Boolean(base.acted),
        moved: Boolean(base.moved),
        guard: Boolean(base.guard),
        status: safeArray(base.status, []),
        x:
          typeof base.x === "number" && Number.isFinite(base.x)
            ? base.x
            : stageUnit.x,
        y:
          typeof base.y === "number" && Number.isFinite(base.y)
            ? base.y
            : stageUnit.y,
      };

      return applyEquipmentStats(makeAlly(merged));
    }

    return {
      ...stageUnit,
      ...base,
      status: safeArray(base.status, []),
      acted: Boolean(base.acted),
      moved: Boolean(base.moved),
      guard: Boolean(base.guard),
    };
  });

  return normalized.filter((unit) => typeof unit.hp !== "number" || unit.hp > 0);
}

export function normalizeSaveData(raw, saveVersion = "0.12") {
  const data = safeObject(raw, {});
  const stage = resolveStageFromSave(data);
  const party = normalizeParty(data.party);
  const units = normalizeUnits(data.units, stage, party);

  const validScreens = ["promo", "menu", "campaign", "deployment", "battle", "camp", "records", "settings", "pwa", "release", "qa", "analytics", "codex", "profile", "gallery", "hall", "planner", "strategyArchive", "finalRc", "saveHealth", "launch", "postLaunch", "crashLogs", "qaBoard", "qaHistory", "qaChangelog", "qaReleaseNotes", "qaReleaseArchive"];
  const validTurns = ["ally", "enemy"];
  const validModes = ["move", "attack", "skill"];

  return {
    version: saveVersion,
    screen: validScreens.includes(data.screen) ? data.screen : "campaign",
    selectedStage: stage,
    currentStageId: stage.id,
    party,
    units,
    selectedUnit:
      typeof data.selectedUnit === "string" &&
      units.some((unit) => unit.id === data.selectedUnit)
        ? data.selectedUnit
        : null,
    deployedIds: safeArray(data.deployedIds, []).filter((id) =>
      typeof id === "string"
    ),
    mode: validModes.includes(data.mode) ? data.mode : "move",
    turn: validTurns.includes(data.turn) ? data.turn : "ally",
    round:
      typeof data.round === "number" && Number.isFinite(data.round)
        ? Math.max(1, data.round)
        : 1,
    inventory: normalizeInventory(data.inventory),
    battleLoot: normalizeLoot(data.battleLoot),
    battleStats: normalizeBattleStats(data.battleStats),
    unitBattleStats: normalizeUnitBattleStats(data.unitBattleStats),
    careerStats: normalizeCareerStats(data.careerStats),
    stageMastery: safeObject(data.stageMastery, {}),
    stageNotes: safeObject(data.stageNotes, {}),
    stageNoteTags: safeObject(data.stageNoteTags, {}),
    strategyReportArchive: safeArray(data.strategyReportArchive, []).filter((entry) => entry && typeof entry === "object"),
    strategyFavoriteIds: safeArray(data.strategyFavoriteIds, []).filter((id) => typeof id === "string"),
    strategyQuickSlots: safeObject(data.strategyQuickSlots, {}),
    strategyQuickSlotNames: safeObject(data.strategyQuickSlotNames, {}),
    finalRcChecked: safeObject(data.finalRcChecked, {}),
    launchChecked: safeObject(data.launchChecked, {}),
    claimedMasteryRewards: safeArray(data.claimedMasteryRewards, []).filter((id) => typeof id === "string"),
    claimedAchievements: safeArray(data.claimedAchievements, []).filter((id) => typeof id === "string"),
    claimedChallenges: safeArray(data.claimedChallenges, []).filter((id) => typeof id === "string"),
    selectedPlayerTitle: typeof data.selectedPlayerTitle === "string" ? data.selectedPlayerTitle : "rookie",
    selectedProfileFrame: typeof data.selectedProfileFrame === "string" ? data.selectedProfileFrame : "classic",
    snapshotGallery: safeArray(data.snapshotGallery, []).filter((entry) => entry && typeof entry === "object"),
    dailyLoginData: safeObject(data.dailyLoginData, {}),
    eventData: safeObject(data.eventData, {}),
    gearInventory: safeArray(data.gearInventory, DEFAULT_GEAR_INVENTORY),
    gearEnhance: normalizeGearEnhance(data.gearEnhance),
    supportPoints: normalizeSupportPoints(data.supportPoints),
    supportDialoguesSeen: normalizeSupportDialoguesSeen(data.supportDialoguesSeen),
    trainingUsed: Boolean(data.trainingUsed),
    dispatchUsed: Boolean(data.dispatchUsed),
    gold:
      typeof data.gold === "number" && Number.isFinite(data.gold)
        ? Math.max(0, data.gold)
        : 300,
    logs: safeArray(data.logs, ["이어하기 완료."]),
    campMessage:
      typeof data.campMessage === "string"
        ? data.campMessage
        : "이어하기 완료.",
    stageRewardClaimed: Boolean(data.stageRewardClaimed),
    unlockedStages: safeArray(data.unlockedStages, [1]).filter((id) =>
      stages.some((stage) => stage.id === id)
    ).length
      ? safeArray(data.unlockedStages, [1]).filter((id) =>
          stages.some((stage) => stage.id === id)
        )
      : [1],
    clearedStages: safeArray(data.clearedStages, []).filter((id) =>
      stages.some((stage) => stage.id === id)
    ),
    hazards: safeArray(data.hazards, []).filter(
      (hazard) =>
        hazard &&
        typeof hazard.x === "number" &&
        typeof hazard.y === "number" &&
        inMap(hazard.x, hazard.y, stage.map)
    ),
    savedAt:
      typeof data.savedAt === "string"
        ? data.savedAt
        : new Date().toISOString(),
  };
}
