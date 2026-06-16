import { useEffect, useMemo, useRef, useState } from "react";
import { stages } from "./data/stages.js";
import { EQUIPMENT } from "./data/equipment.js";
import { STATUS_INFO } from "./data/statuses.js";
import { SUPPORT_PAIRS, SUPPORT_RANK_THRESHOLDS } from "./data/supports.js";
import { STORY_SCENES } from "./data/storyScenes.js";
import {
  clone,
  applyEquipmentStats,
  applyEquipmentToParty,
  getInitialParty,
  mergePartyIntoStage,
  mergePartyFromUnits,
  grantExp,
  getGearEnhanceBonus,
} from "./engine/partyEngine.js";
import {
  getSupportRank,
  getSupportNext,
  getUnitNameById,
} from "./engine/supportEngine.js";
import { normalizeSaveData } from "./engine/saveEngine.js";
import { getMoveTiles, getAttackTiles, findMovePath, getUnitMoveTrait } from "./engine/movement.js";
import { getTargetInRange, moveEnemyToward, getAITypeLabel } from "./engine/enemyAI.js";
import {
  DEFAULT_UPDATE_MANIFEST_URL,
  compareVersions,
  fetchUpdateManifest,
} from "./engine/updateEngine.js";
import { getStageRoundLimit } from "./engine/stageRules.js";
import {
  getStatusText,
  applySkillStatusAfterHit,
  processTurnStartStatuses,
  processTerrainStartEffects,
} from "./engine/statusEngine.js";
import {
  calculateDamage,
  calculateHit,
  calculateCrit,
  rollCombat,
  triggerBossPhases,
  createBossHazards,
  resolveHazards,
  getCombatAffinity,
  getUnitCombatClass,
  getCombatClassLabel,
} from "./engine/combat.js";
import { isNativeCapacitorRuntime } from "./engine/runtime.js";
import "./index.css";

const SAVE_KEY = "cheonsu_v01_save";
const SAVE_VERSION = "1.99.114";
const SAVE_BACKUP_KEY = "cheonsu_v01_auto_backup";
const SAVE_PREVIOUS_KEY = "cheonsu_v01_previous_backup";
const FEEDBACK_KEY = "cheonsu_v01_feedback_reports";
const CRASH_LOG_KEY = "cheonsu_v01_crash_logs";
const QA_FIX_HISTORY_KEY = "cheonsu_v01_qa_fix_history";
const QA_RELEASE_ARCHIVE_KEY = "cheonsu_v01_qa_release_archive";
const UPDATE_MANIFEST_URL_KEY = "cheonsu_update_manifest_url";
const PLAYTEST_UNLOCK_ALL_STAGES = true;
const PLAYTEST_STORY_CAN_SKIP = PLAYTEST_UNLOCK_ALL_STAGES;
const ALL_STAGE_IDS = stages.map((stage) => stage.id);
const getPlaytestUnlockedStageIds = (stageIds = [1]) =>
  PLAYTEST_UNLOCK_ALL_STAGES ? ALL_STAGE_IDS : stageIds;
const MAP_ZOOM_STEPS = ["fit", "normal", "large", "xl"];
const MAP_ZOOM_LABELS = {
  fit: "자동",
  normal: "100%",
  large: "130%",
  xl: "170%",
};

function getManualSaveSlotKey(slot) {
  return `cheonsu_v01_manual_slot_${slot}`;
}

function loadUpdateManifestUrl() {
  try {
    return localStorage.getItem(UPDATE_MANIFEST_URL_KEY) || DEFAULT_UPDATE_MANIFEST_URL;
  } catch {
    return DEFAULT_UPDATE_MANIFEST_URL;
  }
}

function createIdleUpdateState() {
  return {
    status: "idle",
    message: "최신 버전 정보를 아직 확인하지 않았습니다.",
    latest: null,
    checkedAt: null,
  };
}

function getSaveSummary(raw) {
  try {
    const data = JSON.parse(raw || "{}");
    const date = data.savedAt ? new Date(data.savedAt) : null;
    const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "시간 없음";

    return {
      ok: true,
      version: data.version || "unknown",
      stage: data.selectedStage?.title || data.currentStageId || "미진행",
      screen: data.screen || "-",
      dateText,
    };
  } catch {
    return {
      ok: false,
      version: "-",
      stage: "손상됨",
      screen: "-",
      dateText: "읽기 실패",
    };
  }
}


function getSaveHealthReport() {
  const keys = {
    current: SAVE_KEY,
    autoBackup: SAVE_BACKUP_KEY,
    previous: SAVE_PREVIOUS_KEY,
  };

  const entries = Object.entries(keys).map(([id, key]) => {
    const raw = localStorage.getItem(key);
    const summary = raw ? getSaveSummary(raw) : null;

    return {
      id,
      key,
      exists: Boolean(raw),
      size: raw ? raw.length : 0,
      summary,
    };
  });

  const manualSlots = [1, 2, 3].map((slot) => {
    const key = getManualSaveSlotKey(slot);
    const raw = localStorage.getItem(key);
    const summary = raw ? getSaveSummary(raw) : null;

    return {
      slot,
      key,
      exists: Boolean(raw),
      size: raw ? raw.length : 0,
      summary,
    };
  });

  const totalSize =
    entries.reduce((sum, entry) => sum + entry.size, 0) +
    manualSlots.reduce((sum, entry) => sum + entry.size, 0);

  const validCount =
    entries.filter((entry) => entry.summary?.ok).length +
    manualSlots.filter((entry) => entry.summary?.ok).length;

  const warnings = [];
  if (!entries.find((entry) => entry.id === "current")?.exists) warnings.push("현재 저장 데이터가 없습니다.");
  if (!entries.find((entry) => entry.id === "autoBackup")?.exists) warnings.push("자동 백업이 없습니다.");
  if (totalSize > 4_000_000) warnings.push("저장 데이터가 커지고 있습니다. 오래된 슬롯 정리를 권장합니다.");

  return {
    entries,
    manualSlots,
    totalSize,
    validCount,
    warnings,
  };
}

function formatBytes(size = 0) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${Math.round((size / 1024 / 1024) * 10) / 10}MB`;
}


function getBestRecoverableSave() {
  const candidates = [
    { label: "현재 저장", key: SAVE_KEY },
    { label: "자동 백업", key: SAVE_BACKUP_KEY },
    { label: "이전 저장", key: SAVE_PREVIOUS_KEY },
    { label: "수동 슬롯 1", key: getManualSaveSlotKey(1) },
    { label: "수동 슬롯 2", key: getManualSaveSlotKey(2) },
    { label: "수동 슬롯 3", key: getManualSaveSlotKey(3) },
  ];

  return candidates
    .map((candidate) => {
      const raw = localStorage.getItem(candidate.key);
      const summary = raw ? getSaveSummary(raw) : null;
      let time = 0;
      try {
        const data = JSON.parse(raw || "{}");
        time = data.savedAt ? new Date(data.savedAt).getTime() : 0;
      } catch {
        time = 0;
      }
      return { ...candidate, raw, summary, time };
    })
    .filter((candidate) => candidate.raw && candidate.summary?.ok)
    .sort((a, b) => b.time - a.time)[0] || null;
}

function getSaveRecoverySuggestion() {
  const current = localStorage.getItem(SAVE_KEY);
  const currentSummary = current ? getSaveSummary(current) : null;
  const best = getBestRecoverableSave();

  if (currentSummary?.ok) {
    return { status: "ok", label: "현재 저장 데이터가 정상입니다.", best };
  }

  if (best) {
    return { status: "recoverable", label: `${best.label}에서 복구할 수 있습니다.`, best };
  }

  return { status: "empty", label: "복구 가능한 저장 데이터가 없습니다.", best: null };
}


function buildSaveExportBundle() {
  const keys = [
    ["current", SAVE_KEY],
    ["autoBackup", SAVE_BACKUP_KEY],
    ["previous", SAVE_PREVIOUS_KEY],
    ["manual1", getManualSaveSlotKey(1)],
    ["manual2", getManualSaveSlotKey(2)],
    ["manual3", getManualSaveSlotKey(3)],
  ];

  return {
    type: "cheonsu-save-bundle",
    version: SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    saves: keys.reduce((acc, [name, key]) => {
      const value = localStorage.getItem(key);
      if (value) acc[name] = value;
      return acc;
    }, {}),
  };
}

function parseSaveImportBundle(text) {
  try {
    const data = JSON.parse(String(text || ""));
    if (!data || data.type !== "cheonsu-save-bundle" || typeof data.saves !== "object") return null;
    return data;
  } catch {
    return null;
  }
}


function loadFeedbackReports() {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFeedbackReports(reports) {
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(reports || []));
}


function loadCrashLogs() {
  try {
    const raw = localStorage.getItem(CRASH_LOG_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCrashLogs(logs) {
  localStorage.setItem(CRASH_LOG_KEY, JSON.stringify((logs || []).slice(0, 50)));
}


function loadQaFixHistory() {
  try {
    const raw = localStorage.getItem(QA_FIX_HISTORY_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQaFixHistory(history) {
  localStorage.setItem(QA_FIX_HISTORY_KEY, JSON.stringify((history || []).slice(0, 100)));
}

function createQaFixHistoryEntry(item, status) {
  return {
    id: `${Date.now()}-${Math.random()}`,
    feedbackId: item?.id || "",
    title: item?.title || "피드백",
    type: item?.type || "bug",
    status,
    priority: getFeedbackPriority(item),
    priorityLabel: getFeedbackPriorityLabel(getFeedbackPriority(item)),
    createdAt: new Date().toISOString(),
  };
}


function getQaChangelogEntries(history = []) {
  const byDate = {};

  (history || []).forEach((item) => {
    const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "날짜 없음";
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(item);
  });

  return Object.entries(byDate)
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
      fixed: items.filter((item) => item.status === "fixed").length,
      later: items.filter((item) => item.status === "later").length,
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function createQaChangelogText(history = []) {
  const groups = getQaChangelogEntries(history);

  return [
    "천수 QA 변경 기록",
    `총 처리 ${history.length}개`,
    "",
    ...groups.flatMap((group) => [
      `## ${group.date} · 해결 ${group.fixed} / 보류 ${group.later}`,
      ...group.items.map((item) => `- [${item.status === "fixed" ? "해결" : "보류"}] ${item.title} (${item.priorityLabel} ${item.priority})`),
      "",
    ]),
    `빌드 v${SAVE_VERSION}`,
  ].join("\\n");
}


function createPublicPatchNotesFromQa(history = [], feedbackReports = []) {
  const fixed = (history || []).filter((item) => item.status === "fixed");
  const later = (history || []).filter((item) => item.status === "later");
  const open = (feedbackReports || []).filter((item) => item.status === "open");

  return [
    `천수 ${SAVE_VERSION} QA 반영 노트`,
    "",
    "이번 업데이트 요약",
    `- 해결된 항목: ${fixed.length}개`,
    `- 보류된 항목: ${later.length}개`,
    `- 남은 확인 항목: ${open.length}개`,
    "",
    "해결된 항목",
    ...(fixed.length
      ? fixed.slice(0, 20).map((item) => `- ${item.title} (${item.priorityLabel} ${item.priority})`)
      : ["- 아직 해결된 항목이 없습니다."]),
    "",
    "보류된 항목",
    ...(later.length
      ? later.slice(0, 12).map((item) => `- ${item.title}`)
      : ["- 보류된 항목이 없습니다."]),
    "",
    "다음 점검 대상",
    ...(open.length
      ? open.slice(0, 10).map((item) => `- ${item.title}`)
      : ["- 현재 열린 피드백이 없습니다."]),
    "",
    `빌드: ${SAVE_VERSION}`,
  ].join("\\n");
}

function normalizeQaReleaseArchiveItem(item) {
  if (!item || typeof item !== "object") return null;

  const text = typeof item.text === "string" ? item.text : "";
  if (!text.trim()) return null;

  return {
    id: typeof item.id === "string" ? item.id : `qa-release-${Date.now()}-${Math.random()}`,
    version: typeof item.version === "string" ? item.version : SAVE_VERSION,
    title: typeof item.title === "string" && item.title.trim() ? item.title : `천수 ${SAVE_VERSION} QA 반영 노트`,
    text,
    fixedCount: Number.isFinite(item.fixedCount) ? Math.max(0, Math.floor(item.fixedCount)) : 0,
    laterCount: Number.isFinite(item.laterCount) ? Math.max(0, Math.floor(item.laterCount)) : 0,
    openCount: Number.isFinite(item.openCount) ? Math.max(0, Math.floor(item.openCount)) : 0,
    favorite: Boolean(item.favorite),
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
  };
}

function loadQaReleaseArchive() {
  try {
    const raw = localStorage.getItem(QA_RELEASE_ARCHIVE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed)
      ? parsed.map(normalizeQaReleaseArchiveItem).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function saveQaReleaseArchive(items) {
  localStorage.setItem(
    QA_RELEASE_ARCHIVE_KEY,
    JSON.stringify((items || []).map(normalizeQaReleaseArchiveItem).filter(Boolean).slice(0, 50))
  );
}

function createQaReleaseArchiveEntry(history = [], feedbackReports = []) {
  const fixed = (history || []).filter((item) => item.status === "fixed");
  const later = (history || []).filter((item) => item.status === "later");
  const open = (feedbackReports || []).filter((item) => item.status === "open");
  const createdAt = new Date().toISOString();

  return {
    id: `qa-release-${Date.now()}-${Math.random()}`,
    version: SAVE_VERSION,
    title: `천수 ${SAVE_VERSION} QA 반영 노트`,
    text: createPublicPatchNotesFromQa(history, feedbackReports),
    fixedCount: fixed.length,
    laterCount: later.length,
    openCount: open.length,
    favorite: false,
    createdAt,
  };
}

function getQaReleaseArchiveStats(items = []) {
  return {
    total: items.length,
    favorite: items.filter((item) => item.favorite).length,
    latest: items[0] || null,
  };
}

function createCrashLogEntry({ message, stack, screen, source = "runtime" }) {
  return {
    id: `${Date.now()}-${Math.random()}`,
    version: SAVE_VERSION,
    screen,
    source,
    message: message || "알 수 없는 오류",
    stack: stack || "",
    createdAt: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
}


function createFeedbackFromCrashLog(log) {
  return {
    id: `crash-feedback-${log.id || Date.now()}`,
    type: "bug",
    status: "open",
    title: `[오류] ${String(log.message || "런타임 오류").slice(0, 48)}`,
    desc: [
      `화면: ${log.screen || "-"}`,
      `발생: ${log.createdAt || "-"}`,
      `버전: ${log.version || SAVE_VERSION}`,
      "",
      log.message || "",
      "",
      String(log.stack || "").slice(0, 900),
    ].join("\\n"),
    createdAt: new Date().toISOString(),
  };
}

function getFeedbackStatusLabel(status) {
  return {
    open: "확인 필요",
    fixed: "해결",
    later: "보류",
  }[status] || "확인 필요";
}


function getFeedbackPriority(item) {
  if (!item) return 0;
  let score = 0;
  if (item.status === "open") score += 50;
  if (item.type === "bug") score += 35;
  if (item.type === "balance") score += 20;
  if (item.type === "ui") score += 15;
  if (String(item.title || "").includes("오류") || String(item.desc || "").includes("Error")) score += 20;
  if (String(item.desc || "").length > 300) score += 5;
  return score;
}

function getFeedbackPriorityLabel(score) {
  if (score >= 85) return "긴급";
  if (score >= 60) return "높음";
  if (score >= 35) return "보통";
  return "낮음";
}


function getQaFixTemplate(item) {
  const title = String(item?.title || "");
  const desc = String(item?.desc || "");
  if (title.includes("오류") || desc.includes("ReferenceError") || desc.includes("TypeError")) {
    return ["1. 오류 화면/콘솔 메시지 재현", "2. 관련 함수/상태값 null 보호 추가", "3. 오류 보호 모드에서 복구 확인", "4. 저장 후 이어하기 확인"];
  }
  if (item?.type === "ui") return ["1. 모바일/PC 양쪽 화면 확인", "2. 텍스트 줄바꿈/버튼 크기 조정", "3. 380px 이하 화면 재확인"];
  if (item?.type === "balance") return ["1. 난이도 표준 기준으로 3회 테스트", "2. 승률/피해량/턴 수 비교", "3. 보상/적 체력 조정 후 재검증"];
  return ["1. 재현 조건 정리", "2. 원인 후보 확인", "3. 수정 후 동일 조건 재테스트"];
}

function buildQaFixPlan(item) {
  if (!item) return "";
  return [
    `QA 수정 계획: ${item.title}`,
    `유형: ${getFeedbackTypeLabel(item.type)} / 상태: ${getFeedbackStatusLabel(item.status)}`,
    `우선순위: ${getFeedbackPriorityLabel(getFeedbackPriority(item))} (${getFeedbackPriority(item)})`,
    "",
    ...getQaFixTemplate(item),
    "",
    "원본 내용:",
    item.desc || "-",
  ].join("\\n");
}

function getQaPriorityBoard(reports = []) {
  const items = (reports || [])
    .map((item) => ({
      ...item,
      priorityScore: getFeedbackPriority(item),
      priorityLabel: getFeedbackPriorityLabel(getFeedbackPriority(item)),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    urgent: items.filter((item) => item.priorityScore >= 85),
    high: items.filter((item) => item.priorityScore >= 60 && item.priorityScore < 85),
    normal: items.filter((item) => item.priorityScore < 60),
    all: items,
  };
}

function getFeedbackTypeLabel(type) {
  return {
    bug: "버그",
    balance: "밸런스",
    ui: "UI",
    idea: "아이디어",
  }[type] || "버그";
}


function getPlaytestInsight({ careerStats, clearedStages, feedbackReports, settings }) {
  const career = normalizeCareerStats(careerStats);
  const feedback = Array.isArray(feedbackReports) ? feedbackReports : [];
  const battles = Math.max(1, career.battles || 0);
  const winRate = career.battles ? Math.round(((career.victories || 0) / battles) * 100) : 0;
  const avgDamage = career.battles ? Math.round((career.totalDamageDealt || 0) / battles) : 0;
  const avgTaken = career.battles ? Math.round((career.totalDamageTaken || 0) / battles) : 0;
  const avgKills = career.battles ? Math.round(((career.totalKills || 0) / battles) * 10) / 10 : 0;
  const openBugs = feedback.filter((item) => item.type === "bug" && item.status !== "fixed").length;
  const balanceNotes = feedback.filter((item) => item.type === "balance" && item.status !== "fixed").length;
  const progressRate = Math.round(((clearedStages?.length || 0) / stages.length) * 100);

  let recommendation = "표준 밸런스를 유지해도 좋습니다.";
  let recommendedPreset = "standard";

  if (career.battles >= 3 && winRate < 45) {
    recommendation = "승률이 낮습니다. 영웅담 프리셋으로 완화 테스트를 권장합니다.";
    recommendedPreset = "heroic";
  } else if (career.battles >= 3 && winRate > 85 && avgTaken < avgDamage * 0.35) {
    recommendation = "전투가 쉬울 수 있습니다. 대군전 또는 보스전 프리셋 테스트를 권장합니다.";
    recommendedPreset = "swarm";
  } else if (balanceNotes >= 2) {
    recommendation = "밸런스 피드백이 누적되었습니다. 보스전/대군전 프리셋 비교 테스트를 권장합니다.";
    recommendedPreset = "bossRush";
  } else if (openBugs > 0) {
    recommendation = "미해결 버그가 있습니다. 신규 콘텐츠보다 안정화 점검을 먼저 권장합니다.";
  }

  return {
    battles: career.battles || 0,
    victories: career.victories || 0,
    winRate,
    avgDamage,
    avgTaken,
    avgKills,
    progressRate,
    openBugs,
    balanceNotes,
    recommendation,
    recommendedPreset,
    currentDifficulty: settings?.difficulty || "normal",
    currentBalance: settings?.balancePreset || "standard",
  };
}

function getFeedbackTypeCounts(feedbackReports) {
  const counts = { bug: 0, balance: 0, ui: 0, idea: 0 };

  (feedbackReports || []).forEach((item) => {
    if (counts[item.type] !== undefined) counts[item.type] += 1;
  });

  return counts;
}


const ACHIEVEMENTS = [
  {
    id: "firstClear",
    title: "첫 승리",
    desc: "첫 스테이지를 클리어",
    reward: { gold: 300, potion: 1 },
    check: ({ clearedStages }) => (clearedStages || []).length >= 1,
  },
  {
    id: "fiveClears",
    title: "붉은 국경 돌파",
    desc: "5개 스테이지 클리어",
    reward: { gold: 600, hiPotion: 1 },
    check: ({ clearedStages }) => (clearedStages || []).length >= 5,
  },
  {
    id: "bossHunter",
    title: "보스 사냥꾼",
    desc: "보스 스테이지 1개 이상 클리어",
    reward: { gold: 800, guardCharm: 1 },
    check: ({ clearedStages }) => (clearedStages || []).some((id) => id % 6 === 0),
  },
  {
    id: "fullSquad",
    title: "대부대 지휘관",
    desc: "동료 10명 이상 확보",
    reward: { gold: 700, powerCharm: 1 },
    check: ({ party }) => (party || []).length >= 10,
  },
  {
    id: "veteran",
    title: "베테랑 기사단",
    desc: "누적 전투 10회",
    reward: { gold: 900, potion: 2 },
    check: ({ careerStats }) => (careerStats?.battles || 0) >= 10,
  },
  {
    id: "mvpCollector",
    title: "영웅의 기록",
    desc: "MVP 기록 3회 이상",
    reward: { gold: 800, hiPotion: 1 },
    check: ({ careerStats }) =>
      Object.values(careerStats?.mvpCounts || {}).reduce((sum, value) => sum + (value || 0), 0) >= 3,
  },
  {
    id: "blacksmith",
    title: "제련 입문",
    desc: "강화 장비 3개 이상 보유",
    reward: { gold: 500, powerCharm: 1 },
    check: ({ gearEnhance }) => Object.values(gearEnhance || {}).filter((level) => level > 0).length >= 3,
  },
  {
    id: "qaTester",
    title: "테스터의 눈",
    desc: "피드백 3개 이상 등록",
    reward: { gold: 400, remedy: 1 },
    check: ({ feedbackReports }) => (feedbackReports || []).length >= 3,
  },
];

function getAchievementProgress(achievement, context) {
  const claimed = (context.claimedAchievements || []).includes(achievement.id);
  const completed = achievement.check(context);

  return {
    ...achievement,
    claimed,
    completed,
    claimable: completed && !claimed,
  };
}

function getAchievementRewardText(reward = {}) {
  const parts = [];
  if (reward.gold) parts.push(`${reward.gold}G`);
  if (reward.potion) parts.push(`회복약 ${reward.potion}`);
  if (reward.hiPotion) parts.push(`큰 회복약 ${reward.hiPotion}`);
  if (reward.remedy) parts.push(`정화약 ${reward.remedy}`);
  if (reward.powerCharm) parts.push(`공격 부적 ${reward.powerCharm}`);
  if (reward.guardCharm) parts.push(`수호 부적 ${reward.guardCharm}`);
  return parts.join(" · ") || "보상 없음";
}


function getChallengeDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getDailyChallengePool() {
  return [
    {
      id: "clearAny",
      title: "오늘의 출격",
      desc: "전투 1회 승리",
      reward: { gold: 350, potion: 1 },
      check: ({ careerStats }) => (careerStats?.victories || 0) >= 1,
    },
    {
      id: "dealDamage",
      title: "공세 유지",
      desc: "누적 가한 피해 300 이상",
      reward: { gold: 450, powerCharm: 1 },
      check: ({ careerStats }) => (careerStats?.totalDamageDealt || 0) >= 300,
    },
    {
      id: "survive",
      title: "수호 진형",
      desc: "전직 동료 1명 이상 또는 동료 6명 이상 확보",
      reward: { gold: 300, guardCharm: 1 },
      check: ({ party }) => (party || []).some((unit) => unit.promoted) || (party || []).length >= 6,
    },
    {
      id: "prep",
      title: "철저한 준비",
      desc: "소모품 6개 이상 보유",
      reward: { gold: 250, hiPotion: 1 },
      check: ({ inventory }) => getTotalItemCount(inventory) >= 6,
    },
    {
      id: "qa",
      title: "테스터 정신",
      desc: "피드백 1개 이상 등록",
      reward: { gold: 250, remedy: 1 },
      check: ({ feedbackReports }) => (feedbackReports || []).length >= 1,
    },
  ];
}

function getDailyChallengesForDate(dateKey = getChallengeDateKey()) {
  const pool = getDailyChallengePool();
  const seed = dateKey
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return [0, 1, 2].map((offset) => pool[(seed + offset * 2) % pool.length]);
}

function getWeeklyChallenges() {
  return [
    {
      id: "weeklyBoss",
      title: "주간 보스 토벌",
      desc: "보스 스테이지 1개 클리어",
      reward: { gold: 1200, hiPotion: 2, guardCharm: 1 },
      check: ({ clearedStages }) => (clearedStages || []).some((id) => id % 6 === 0),
    },
    {
      id: "weeklySquad",
      title: "부대 확장",
      desc: "동료 10명 이상 확보",
      reward: { gold: 1000, powerCharm: 1 },
      check: ({ party }) => (party || []).length >= 10,
    },
    {
      id: "weeklyForge",
      title: "제련 주간",
      desc: "강화 장비 2개 이상 보유",
      reward: { gold: 900, remedy: 1 },
      check: ({ gearEnhance }) => Object.values(gearEnhance || {}).filter((level) => level > 0).length >= 2,
    },
  ];
}

function getChallengeRewardText(reward = {}) {
  return getAchievementRewardText(reward);
}

function getChallengeProgress(challenge, context, claimedChallenges = []) {
  const completed = challenge.check(context);
  const claimed = claimedChallenges.includes(challenge.id);
  return {
    ...challenge,
    completed,
    claimed,
    claimable: completed && !claimed,
  };
}


function normalizeDailyLoginData(data) {
  const raw = data && typeof data === "object" && !Array.isArray(data) ? data : {};

  return {
    claimedDates: Array.isArray(raw.claimedDates)
      ? raw.claimedDates.filter((date) => typeof date === "string")
      : [],
    lastClaimedDate: typeof raw.lastClaimedDate === "string" ? raw.lastClaimedDate : "",
    totalClaims:
      typeof raw.totalClaims === "number" && Number.isFinite(raw.totalClaims)
        ? Math.max(0, Math.floor(raw.totalClaims))
        : 0,
  };
}

function getDailyLoginReward(dayIndex = 0) {
  const rewards = [
    { gold: 300, potion: 1 },
    { gold: 350, remedy: 1 },
    { gold: 400, hiPotion: 1 },
    { gold: 500, powerCharm: 1 },
    { gold: 500, guardCharm: 1 },
    { gold: 650, hiPotion: 1, remedy: 1 },
    { gold: 900, powerCharm: 1, guardCharm: 1 },
  ];

  return rewards[dayIndex % rewards.length];
}

function getDailyLoginRewardText(reward = {}) {
  return getAchievementRewardText(reward);
}

function getDailyLoginStatus(data, today = getChallengeDateKey()) {
  const normalized = normalizeDailyLoginData(data);
  const claimedDates = [...new Set(normalized.claimedDates)];
  const claimedToday = claimedDates.includes(today);
  const nextIndex = normalized.totalClaims % 7;

  return {
    ...normalized,
    claimedDates,
    claimedToday,
    nextIndex,
    nextReward: getDailyLoginReward(nextIndex),
    cycleDay: nextIndex + 1,
  };
}


function getCurrentSeasonInfo(date = new Date()) {
  const month = date.getMonth() + 1;
  const seasons = {
    spring: {
      id: "spring",
      title: "새싹 원정",
      icon: "🌱",
      desc: "동료 성장과 보급 보상이 강화됩니다.",
      reward: { gold: 500, potion: 2 },
    },
    summer: {
      id: "summer",
      title: "불꽃 토벌",
      icon: "🔥",
      desc: "공격 부적과 전투 보상이 강화됩니다.",
      reward: { gold: 600, powerCharm: 1 },
    },
    autumn: {
      id: "autumn",
      title: "황혼 수확",
      icon: "🍂",
      desc: "전리품과 장비 준비에 유리한 기간입니다.",
      reward: { gold: 700, hiPotion: 1 },
    },
    winter: {
      id: "winter",
      title: "설야 수호",
      icon: "❄️",
      desc: "수호 부적과 회복 보상이 강화됩니다.",
      reward: { gold: 650, guardCharm: 1 },
    },
  };

  if ([3, 4, 5].includes(month)) return seasons.spring;
  if ([6, 7, 8].includes(month)) return seasons.summer;
  if ([9, 10, 11].includes(month)) return seasons.autumn;
  return seasons.winter;
}

function normalizeEventData(data) {
  const raw = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return {
    claimedSeasonIds: Array.isArray(raw.claimedSeasonIds)
      ? raw.claimedSeasonIds.filter((id) => typeof id === "string")
      : [],
    lastClaimedAt: typeof raw.lastClaimedAt === "string" ? raw.lastClaimedAt : "",
  };
}

function getSeasonMissionProgress(season, context) {
  const missions = [
    {
      id: `${season.id}-clear`,
      title: "시즌 출격",
      desc: "스테이지 1개 이상 클리어",
      reward: { gold: 400, potion: 1 },
      completed: (context.clearedStages || []).length >= 1,
    },
    {
      id: `${season.id}-party`,
      title: "기사단 정비",
      desc: "동료 6명 이상 확보",
      reward: { gold: 350, remedy: 1 },
      completed: (context.party || []).length >= 6,
    },
    {
      id: `${season.id}-record`,
      title: "전투 기록",
      desc: "누적 전투 3회 이상",
      reward: { gold: 450, hiPotion: 1 },
      completed: (context.careerStats?.battles || 0) >= 3,
    },
  ];

  return missions;
}


function getCodexEntries({ party, clearedStages, settings }) {
  const partyEntries = (party || []).map((unit) => ({
    id: `unit-${unit.id}`,
    category: "동료",
    title: unit.name,
    subtitle: `${getUnitDisplayClass(unit)} · ${getUnitPassiveDef(unit).name}`,
    desc: `${unit.skill} / ${getUnitPassiveDef(unit).desc}`,
    unlocked: true,
    icon: unit.icon || "👤",
  }));

  const stageEntries = stages.map((stage) => {
    const mission = getStageMissionOrder(stage);
    const cleared = (clearedStages || []).includes(stage.id);

    return {
      id: `stage-${stage.id}`,
      category: "스테이지",
      title: `${stage.id}. ${stage.title}`,
      subtitle: `${mission.type} · ${mission.title}`,
      desc: cleared ? stage.desc : "아직 완전히 조사되지 않은 지역입니다.",
      unlocked: cleared || stage.id === 1,
      icon: stage.id % 6 === 0 ? "👹" : "🗺️",
    };
  });

  const systemEntries = [
    { id: "sys-battle", category: "시스템", title: "전투 컷씬", subtitle: "용의기사풍 사이드뷰 연출", desc: "공격, 스킬, 협공, 반격, 회복, FINISH 연출이 표시됩니다.", unlocked: true, icon: "⚔️" },
    { id: "sys-auto", category: "시스템", title: "자동 전투 전략", subtitle: getAutoBattleModeConfig(settings?.autoBattleMode).label, desc: "안전, 공격, 보스 집중, 파밍 모드로 자동 전투 판단을 변경할 수 있습니다.", unlocked: true, icon: "🤖" },
    { id: "sys-boss", category: "시스템", title: "보스 패턴", subtitle: "2페이즈 장판", desc: "십자 파동, 암흑 직선, 흑성 낙뢰, 붕괴 장판 등 보스 패턴이 등장합니다.", unlocked: true, icon: "☠️" },
    { id: "sys-growth", category: "시스템", title: "캠프 성장", subtitle: "훈련 / 스킬 / 전직 / 장비", desc: "캠프에서 동료 성장과 장비, 보급, 파견을 관리할 수 있습니다.", unlocked: true, icon: "🏕️" },
  ];

  return [...partyEntries, ...stageEntries, ...systemEntries];
}

function getCodexCategories(entries) {
  return ["전체", ...Array.from(new Set((entries || []).map((entry) => entry.category)))];
}

function filterCodexEntries(entries, category, query) {
  const q = String(query || "").trim().toLowerCase();

  return (entries || []).filter((entry) => {
    const categoryOk = category === "전체" || entry.category === category;
    const queryOk = !q || `${entry.title} ${entry.subtitle} ${entry.desc} ${entry.category}`.toLowerCase().includes(q);

    return categoryOk && queryOk;
  });
}


const PLAYER_TITLES = [
  {
    id: "rookie",
    name: "신입 지휘관",
    desc: "기본 칭호",
    condition: "처음부터 사용 가능",
    unlocked: () => true,
  },
  {
    id: "firstVictory",
    name: "첫 승리의 기사",
    desc: "첫 승리를 거둔 지휘관",
    condition: "1개 스테이지 클리어",
    unlocked: ({ clearedStages }) => (clearedStages || []).length >= 1,
  },
  {
    id: "bossHunter",
    name: "보스 사냥꾼",
    desc: "강적을 쓰러뜨린 지휘관",
    condition: "보스 스테이지 클리어",
    unlocked: ({ clearedStages }) => (clearedStages || []).some((id) => id % 6 === 0),
  },
  {
    id: "squadCommander",
    name: "대부대 지휘관",
    desc: "많은 동료를 이끄는 지휘관",
    condition: "동료 10명 이상 확보",
    unlocked: ({ party }) => (party || []).length >= 10,
  },
  {
    id: "masterTactician",
    name: "전술의 달인",
    desc: "전투 기록이 뛰어난 지휘관",
    condition: "누적 승리 10회",
    unlocked: ({ careerStats }) => (careerStats?.victories || 0) >= 10,
  },
  {
    id: "tester",
    name: "검증자",
    desc: "QA와 피드백을 남긴 지휘관",
    condition: "피드백 3개 이상 등록",
    unlocked: ({ feedbackReports }) => (feedbackReports || []).length >= 3,
  },
  {
    id: "collector",
    name: "기록 수집가",
    desc: "도감을 많이 해금한 지휘관",
    condition: "도감 20개 이상 해금",
    unlocked: ({ unlockedCodexCount }) => (unlockedCodexCount || 0) >= 20,
  },
];

function getUnlockedPlayerTitles(context) {
  return PLAYER_TITLES.map((title) => ({
    ...title,
    isUnlocked: title.unlocked(context),
  }));
}

function getPlayerTitleName(titleId, context) {
  const title = getUnlockedPlayerTitles(context).find((item) => item.id === titleId && item.isUnlocked);
  return title?.name || "신입 지휘관";
}

function getCommanderLevel(context) {
  const cleared = context.clearedStages?.length || 0;
  const battles = context.careerStats?.battles || 0;
  const achievements = context.claimedAchievements?.length || 0;
  const codex = context.unlockedCodexCount || 0;
  return Math.max(1, Math.floor(1 + cleared * 0.7 + battles * 0.25 + achievements * 0.8 + codex * 0.05));
}

function getCommanderExpProgress(context) {
  const level = getCommanderLevel(context);
  const currentScore =
    (context.clearedStages?.length || 0) * 70 +
    (context.careerStats?.battles || 0) * 25 +
    (context.claimedAchievements?.length || 0) * 80 +
    (context.unlockedCodexCount || 0) * 5;
  const currentLevelBase = (level - 1) * 100;
  const nextLevelBase = level * 100;
  const progress = Math.max(0, Math.min(100, ((currentScore - currentLevelBase) / Math.max(1, nextLevelBase - currentLevelBase)) * 100));

  return Math.round(progress);
}

function createCommanderShareText(context) {
  const title = getPlayerTitleName(context.selectedPlayerTitle, context);
  const level = getCommanderLevel(context);
  const battles = context.careerStats?.battles || 0;
  const victories = context.careerStats?.victories || 0;
  const winRate = battles ? Math.round((victories / Math.max(1, battles)) * 100) : 0;

  return [
    "천수 기사단 지휘관 카드",
    `칭호: ${title}`,
    `레벨: ${level}`,
    `캠페인: ${context.clearedStages?.length || 0}/${stages.length}`,
    `전투: ${battles}회 / 승률 ${winRate}%`,
    `동료: ${context.party?.length || 0}명`,
    `업적: ${context.claimedAchievements?.length || 0}개`,
    `도감: ${context.unlockedCodexCount || 0}개 해금`,
    `빌드: v${context.version}`,
  ].join("\\n");
}



const PROFILE_FRAMES = [
  {
    id: "classic",
    name: "기본 문장",
    desc: "천수 기사단 기본 프로필 프레임",
    icon: "⚔️",
    className: "frame-classic",
    unlocked: () => true,
  },
  {
    id: "forest",
    name: "그림자 숲",
    desc: "그림자 숲 지역을 돌파한 지휘관",
    icon: "🌲",
    className: "frame-forest",
    unlocked: ({ clearedStages }) => (clearedStages || []).some((id) => id >= 7),
  },
  {
    id: "fort",
    name: "요새의 증표",
    desc: "보스 스테이지를 클리어한 지휘관",
    icon: "🏰",
    className: "frame-fort",
    unlocked: ({ clearedStages }) => (clearedStages || []).some((id) => id % 6 === 0),
  },
  {
    id: "ice",
    name: "설야의 결정",
    desc: "빙결 계곡에 도달한 지휘관",
    icon: "❄️",
    className: "frame-ice",
    unlocked: ({ clearedStages }) => (clearedStages || []).some((id) => id >= 18),
  },
  {
    id: "dark",
    name: "흑야 왕좌",
    desc: "최종 지역에 도달한 지휘관",
    icon: "🌑",
    className: "frame-dark",
    unlocked: ({ clearedStages }) => (clearedStages || []).some((id) => id >= 25),
  },
  {
    id: "tester",
    name: "검증자의 인장",
    desc: "QA 피드백을 3개 이상 등록",
    icon: "🧪",
    className: "frame-tester",
    unlocked: ({ feedbackReports }) => (feedbackReports || []).length >= 3,
  },
];

function getUnlockedProfileFrames(context) {
  return PROFILE_FRAMES.map((frame) => ({
    ...frame,
    isUnlocked: frame.unlocked(context),
  }));
}

function getSelectedProfileFrame(frameId, context) {
  return (
    getUnlockedProfileFrames(context).find((frame) => frame.id === frameId && frame.isUnlocked) ||
    PROFILE_FRAMES[0]
  );
}




function getEventRewardText(reward = {}) {
  return getAchievementRewardText(reward);
}













function canCounter(attacker, defender, activeMap) {
  if (!attacker || !defender) return false;
  if (defender.hp <= 0 || defender.acted) return false;

  const counterTiles = getAttackTiles(defender, "attack", activeMap);

  return counterTiles.some(
    (tile) => tile.x === attacker.x && tile.y === attacker.y
  );
}


function clampBattleValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getSide(unit) {
  return unit?.type === "ally" ? "ally" : "enemy";
}

function isSameSide(a, b) {
  return getSide(a) === getSide(b);
}

function getTileAt(unit, activeMap) {
  return activeMap?.[unit?.y]?.[unit?.x] || "plain";
}

function createBattleTactics(attacker, defender, units, activeMap) {
  const labels = [];
  let damageMod = 0;
  let hitMod = 0;
  let critMod = 0;

  const attackerTile = getTileAt(attacker, activeMap);
  const defenderTile = getTileAt(defender, activeMap);
  const attackerClass = getUnitCombatClass(attacker);

  if (attackerTile === "hill") {
    hitMod += 6;
    critMod += 3;
    labels.push("고지 공격");
  }

  if (attackerTile === "road") {
    hitMod += 3;
    labels.push("진격로");
  }

  if (["dark", "forest"].includes(attackerTile) && ["dagger", "bow"].includes(attackerClass)) {
    critMod += 4;
    labels.push("은폐 공격");
  }

  if (["fire", "ice", "dark", "rune"].includes(attackerTile) && attackerClass === "magic") {
    damageMod += 1;
    hitMod += 3;
    labels.push("주술 지형");
  }

  if (["forest"].includes(defenderTile)) {
    hitMod -= 6;
    labels.push("적 숲 은폐");
  }

  if (["fort", "gate"].includes(defenderTile)) {
    damageMod -= 2;
    hitMod -= 3;
    labels.push("적 엄폐");
  }

  if (["water", "swamp", "ice", "trap"].includes(defenderTile)) {
    hitMod += 4;
    labels.push("적 불안정");
  }

  const pressureCount = (units || []).filter((unit) => {
    if (!unit || unit.id === attacker.id) return false;
    if (unit.hp <= 0) return false;
    if (!isSameSide(unit, attacker)) return false;

    const tiles = getAttackTiles(unit, "attack", activeMap);
    return tiles.some((tile) => tile.x === defender.x && tile.y === defender.y);
  }).length;

  if (pressureCount >= 1) {
    damageMod += 1;
    hitMod += 3;
    labels.push("연계 압박");
  }

  if (pressureCount >= 2) {
    damageMod += 1;
    critMod += 3;
    labels.push("포위");
  }

  return {
    labels,
    damageMod,
    hitMod,
    critMod,
    pressureCount,
  };
}

function applyBattleTactics(preview, tactics) {
  return {
    ...preview,
    damage: Math.max(1, preview.damage + (tactics?.damageMod || 0)),
    hit: Math.round(clampBattleValue(preview.hit + (tactics?.hitMod || 0), 25, 98)),
    crit: Math.round(clampBattleValue(preview.crit + (tactics?.critMod || 0), 0, 45)),
    tactics,
  };
}

function getTacticsText(tactics) {
  if (!tactics || !tactics.labels || tactics.labels.length === 0) {
    return "없음";
  }

  return tactics.labels.join(" · ");
}

function getTacticsLogText(tactics) {
  if (!tactics || !tactics.labels || tactics.labels.length === 0) {
    return "";
  }

  const parts = [];

  if (tactics.damageMod) parts.push(`피해 ${tactics.damageMod > 0 ? "+" : ""}${tactics.damageMod}`);
  if (tactics.hitMod) parts.push(`명중 ${tactics.hitMod > 0 ? "+" : ""}${tactics.hitMod}`);
  if (tactics.critMod) parts.push(`치명 ${tactics.critMod > 0 ? "+" : ""}${tactics.critMod}`);

  return ` · 전술 ${tactics.labels.join("/")}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}


function getUnitPassiveDef(unit) {
  const defs = {
    hero: { name: "천수의 깃발", desc: "아군 협공/명중 보조" },
    bram: { name: "수호의 맹세", desc: "주변 아군 피해 감소" },
    lina: { name: "화염 각인", desc: "화염/마법 스킬 피해 증가" },
    aria: { name: "성빛의 가호", desc: "회복량 증가" },
    leon: { name: "고지 사격", desc: "언덕에서 명중/치명 증가" },
    sera: { name: "처형자", desc: "약해진 적에게 추가 피해" },
    noah: { name: "전술 지휘", desc: "주변 아군 명중 증가" },
    yuna: { name: "달빛 기도", desc: "회복과 지원 강화" },
    rakan: { name: "야수의 분노", desc: "보스에게 추가 피해" },
    miho: { name: "환영 추격", desc: "약해진 적 추격 강화" },
    teo: { name: "분쇄자", desc: "방어 높은 적에게 추가 피해" },
    irene: { name: "빙결 숙련", desc: "빙결 스킬 피해 증가" },
    kaz: { name: "섬광 암살", desc: "치명타와 처형 강화" },
    ella: { name: "별빛 공명", desc: "마법 스킬 치명 증가" },
    jin: { name: "용검의 집중", desc: "검격 치명 증가" },
    luka: { name: "천리안", desc: "장거리 공격 강화" },
    baekho: { name: "백호 위압", desc: "보스와 야수전 강화" },
  };

  return defs[unit?.id] || { name: "기본 전술", desc: "특성 없음" };
}

function distanceBetweenUnits(a, b) {
  if (!a || !b) return 99;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function hasAliveUnit(units, id) {
  return (units || []).some((unit) => unit.id === id && unit.hp > 0);
}

function getPassiveBattleMods(attacker, defender, units = [], mode = "attack") {
  const labels = [];
  let damageMod = 0;
  let hitMod = 0;
  let critMod = 0;

  const skill = String(attacker?.skill || "");
  const defenderHpRate = defender?.maxHp ? defender.hp / defender.maxHp : 1;

  if (attacker?.id === "hero") {
    hitMod += 3;
    labels.push("천수의 깃발");
  }

  if (attacker?.id === "lina" && mode === "skill" && (skill.includes("파이어") || skill.includes("화염"))) {
    damageMod += 2;
    labels.push("화염 각인");
  }

  if (attacker?.id === "leon" && getTileAt(attacker, window.__CHEONSU_ACTIVE_MAP__ || []) === "hill") {
    hitMod += 5;
    critMod += 5;
    labels.push("고지 사격");
  }

  if (["sera", "miho", "kaz"].includes(attacker?.id) && defenderHpRate <= 0.4) {
    damageMod += 2;
    critMod += 6;
    labels.push("처형자");
  }

  if (["rakan", "baekho"].includes(attacker?.id) && defender?.type === "boss") {
    damageMod += 3;
    labels.push("강적 사냥");
  }

  if (attacker?.id === "teo" && (defender?.def || 0) >= 8) {
    damageMod += 2;
    labels.push("분쇄자");
  }

  if (attacker?.id === "irene" && mode === "skill") {
    damageMod += 2;
    labels.push("빙결 숙련");
  }

  if (attacker?.id === "ella" && mode === "skill") {
    damageMod += 1;
    critMod += 5;
    labels.push("별빛 공명");
  }

  if (attacker?.id === "jin") {
    critMod += 5;
    labels.push("용검 집중");
  }

  if (attacker?.id === "luka" && defender && distanceBetweenUnits(attacker, defender) >= 3) {
    damageMod += 2;
    hitMod += 3;
    labels.push("천리안");
  }

  if (attacker?.type === "ally" && hasAliveUnit(units, "noah")) {
    hitMod += 3;
    labels.push("전술 지휘");
  }

  if (defender?.type === "ally" && hasAliveUnit(units, "bram")) {
    const bram = units.find((unit) => unit.id === "bram" && unit.hp > 0);
    if (bram && defender.id !== "bram" && distanceBetweenUnits(bram, defender) <= 3) {
      damageMod -= 2;
      labels.push("수호의 맹세");
    }
  }

  return { damageMod, hitMod, critMod, labels };
}

function applyPassiveToPreview(preview, units = []) {
  const passive = getPassiveBattleMods(preview.attacker, preview.defender, units, preview.mode);

  return {
    ...preview,
    damage: Math.max(1, preview.damage + passive.damageMod),
    hit: Math.round(clampBattleValue(preview.hit + passive.hitMod, 25, 98)),
    crit: Math.round(clampBattleValue(preview.crit + passive.critMod, 0, 50)),
    passive,
  };
}

function getPassiveText(passive) {
  if (!passive || !passive.labels || passive.labels.length === 0) return "없음";
  return [...new Set(passive.labels)].join(" · ");
}

function getPassiveHealBonus(unit) {
  if (!unit) return 0;
  if (unit.id === "aria") return 4;
  if (unit.id === "yuna") return 3;
  return 0;
}

function createCounterPreview(attacker, defender, activeMap, units = []) {
  if (!canCounter(attacker, defender, activeMap)) return null;

  const counterPreview = {
    attacker: defender,
    defender: attacker,
    damage: calculateDamage(defender, attacker, "attack"),
    hit: calculateHit(defender, attacker, "attack"),
    crit: calculateCrit(defender, attacker, "attack"),
    mode: "counter",
    affinity: getCombatAffinity(defender, attacker),
  };

  return applyPassiveToPreview(
    applyBattleTactics(
      counterPreview,
      createBattleTactics(defender, attacker, units, activeMap)
    ),
    units
  );
}



function canAssistAttack(assistUnit, attacker, defender, activeMap) {
  if (!assistUnit || !attacker || !defender) return false;
  if (attacker.type !== "ally") return false;
  if (assistUnit.type !== "ally") return false;
  if (assistUnit.id === attacker.id) return false;
  if (assistUnit.hp <= 0) return false;
  if (assistUnit.supportUsed) return false;
  if (assistUnit.acted) return false;

  const tiles = getAttackTiles(assistUnit, "attack", activeMap);

  return tiles.some((tile) => tile.x === defender.x && tile.y === defender.y);
}

function createAssistPreview(attacker, defender, units, activeMap) {
  if (!attacker || attacker.type !== "ally" || !defender) return null;

  const candidates = units
    .filter((unit) => canAssistAttack(unit, attacker, defender, activeMap))
    .map((unit) => {
      const rawDamage = calculateDamage(unit, defender, "attack");
      const damage = Math.max(1, Math.floor(rawDamage * 0.55));
      const hit = Math.round(Math.max(30, Math.min(95, calculateHit(unit, defender, "attack") - 5)));

      return applyPassiveToPreview(
        applyBattleTactics(
          {
            attacker: unit,
            defender,
            damage,
            hit,
            crit: 0,
            mode: "assist",
            affinity: getCombatAffinity(unit, defender),
          },
          createBattleTactics(unit, defender, units, activeMap)
        ),
        units
      );
    })
    .sort((a, b) => b.damage + b.hit / 100 - (a.damage + a.hit / 100));

  return candidates[0] || null;
}


function getSkillAreaRadius(unit) {
  if (!unit || unit.skillType !== "attack") return 0;

  const skill = String(unit.skill || "");
  const level = getSkillUpgradeLevel(unit);

  if (
    skill.includes("파이어") ||
    skill.includes("화염") ||
    skill.includes("폭발") ||
    skill.includes("파동") ||
    skill.includes("별빛") ||
    skill.includes("백호") ||
    skill.includes("심판") ||
    skill.includes("포효")
  ) {
    return level >= 4 ? 2 : 1;
  }

  if (skill.includes("저격") || skill.includes("관통")) {
    return 0;
  }

  return level >= 5 ? 1 : 0;
}

function getSkillAreaDamageRate(unit) {
  const level = getSkillUpgradeLevel(unit);

  if (level >= 5) return 0.72;
  if (level >= 3) return 0.64;

  return 0.55;
}

function getAreaTargets(attacker, center, units, activeMap) {
  const radius = getSkillAreaRadius(attacker);

  if (!radius || !center) return [];

  const attackerIsAlly = attacker.type === "ally";

  return (units || []).filter((unit) => {
    if (!unit || unit.hp <= 0) return false;
    if (unit.id === center.id) return false;
    if (unit.id === attacker.id) return false;

    if (attackerIsAlly && unit.type === "ally") return false;
    if (!attackerIsAlly && unit.type !== "ally") return false;

    const distance = Math.abs(unit.x - center.x) + Math.abs(unit.y - center.y);

    return distance <= radius;
  });
}

function getAreaSkillLabel(attacker) {
  const radius = getSkillAreaRadius(attacker);

  if (!radius) return "단일";

  return `광역 ${radius}`;
}

function getHealTargetCount(unit) {
  const level = getSkillUpgradeLevel(unit);

  if (level >= 5) return 5;
  if (level >= 3) return 4;
  if (level >= 1) return 2;

  return 1;
}

function makeAttackLog(attacker, defender, mode, outcome, prefix = "") {
  const actionName =
    mode === "skill"
      ? attacker.skill
      : mode === "counter"
      ? "반격"
      : mode === "assist"
      ? "협공"
      : "공격";
  const affinity = getCombatAffinity(attacker, defender);
  const affinityText =
    affinity.state === "advantage"
      ? " · 상성 유리"
      : affinity.state === "disadvantage"
      ? " · 상성 불리"
      : "";

  const tacticsText = getTacticsLogText(outcome.tactics);

  if (!outcome.hit) {
    return `${prefix}${attacker.name} ${actionName} → ${defender.name} 빗나감!${affinityText}${tacticsText}`;
  }

  return `${prefix}${attacker.name} ${actionName} → ${defender.name} ${outcome.damage} 피해${
    outcome.crit ? " · 치명타!" : ""
  }${affinityText}${tacticsText}`;
}



function getInspectUnitKind(unit) {
  if (!unit) return "";

  if (unit.type === "ally") return "아군";
  if (unit.type === "boss") return "보스";

  return "적군";
}

function getInspectUnitRole(unit) {
  if (!unit) return "";

  if (unit.type === "ally") {
    return getSquadRoleLabel(getSquadRole(unit));
  }

  if (unit.type === "boss") {
    return "보스 AI";
  }

  return getAITypeLabel(unit.aiType);
}

function getInspectTerrainLabel(tile) {
  const labels = {
    plain: "평지",
    road: "길",
    gate: "성문",
    fort: "요새",
    forest: "숲",
    hill: "언덕",
    fire: "화염",
    ice: "빙결",
    water: "여울",
    swamp: "늪",
    dark: "흑야",
    rune: "룬",
    trap: "함정",
    block: "절벽",
    wall: "암벽",
    void: "낭떠러지",
  };

  return labels[tile] || "지형";
}


const MAX_DEPLOY_COUNT = 15;
const STAGE_ONE_DEFAULT_DEPLOY_IDS = ["hero", "bram", "lina", "aria"];

const ACTS = [
  { id: 1, title: "ACT 1 · 국경 붕괴", start: 1, end: 6 },
  { id: 2, title: "ACT 2 · 불길과 얼음", start: 7, end: 12 },
  { id: 3, title: "ACT 3 · 그림자 전쟁", start: 13, end: 18 },
  { id: 4, title: "ACT 4 · 흑야의 진실", start: 19, end: 24 },
  { id: 5, title: "ACT 5 · 마지막 천수", start: 25, end: 30 },
];

function getActInfo(stageId) {
  return ACTS.find((act) => stageId >= act.start && stageId <= act.end) || ACTS[0];
}


const LARGE_MAP_SIZE = 13;
const BOARD_PLAYABLE_MIN_ROWS = 26;
const BOARD_PLAYABLE_MAX_ROWS = 30;

const STAGE_MAP_SHAPES = [
  { width: 12, height: 12 },
  { width: 13, height: 12 },
  { width: 14, height: 12 },
  { width: 13, height: 13 },
  { width: 14, height: 13 },
  { width: 13, height: 14 },
];

function normalizeLargeMapSize(size) {
  if (typeof size === "number" && Number.isFinite(size)) {
    const square = Math.max(10, Math.min(18, Math.round(size)));
    return { width: square, height: square };
  }

  return {
    width: Math.max(10, Math.min(18, Math.round(size?.width || LARGE_MAP_SIZE))),
    height: Math.max(10, Math.min(18, Math.round(size?.height || LARGE_MAP_SIZE))),
  };
}

function getLargeBattleMapSize(stage, deployCount = MAX_DEPLOY_COUNT) {
  const stageId = Math.max(1, Math.floor(stage?.id || 1));
  const shape = STAGE_MAP_SHAPES[(stageId - 1) % STAGE_MAP_SHAPES.length];
  const actBonus = Math.min(3, Math.floor((stageId - 1) / 6));
  const terrainTypes = new Set((stage?.map || []).flat()).size;
  const enemyCount = (stage?.units || []).filter((unit) => unit.type !== "ally").length;
  const title = `${stage?.title || ""} ${stage?.desc || ""}`;

  let width = shape.width + actBonus;
  let height = shape.height + actBonus;

  if (deployCount >= 8) width += 1;
  if (deployCount >= 12) height += 1;
  if (enemyCount >= 6) width += 1;
  if (terrainTypes >= 6) height += 1;

  if (/요새|성문|탑|시장/.test(title)) width += 1;
  if (/숲|계곡|여울|습지|늪/.test(title)) height += 1;
  if (/최종|심연|왕좌|가론|마녀|지휘관/.test(title)) {
    width += 1;
    height += 1;
  }

  return normalizeLargeMapSize({ width, height });
}

function normalizeSpawnCandidates(candidates, activeMap) {
  const h = activeMap?.length || LARGE_MAP_SIZE;
  const w = activeMap?.[0]?.length || LARGE_MAP_SIZE;

  return candidates.filter((pos, index, all) =>
    pos.x >= 0 &&
    pos.y >= 0 &&
    pos.x < w &&
    pos.y < h &&
    !isBlockedBattleTile(activeMap[pos.y]?.[pos.x]) &&
    all.findIndex((other) => other.x === pos.x && other.y === pos.y) === index
  );
}

function getLargeAllySpawns(activeMap, stage = null) {
  const h = activeMap?.length || LARGE_MAP_SIZE;
  const w = activeMap?.[0]?.length || LARGE_MAP_SIZE;
  const frontCols = Math.max(5, Math.min(7, Math.floor(w * 0.45)));
  const baseY = Math.max(0, h - 3);
  const formation = getStageFormationKind(stage);
  const candidates = [];

  if (formation === "wedge") {
    candidates.push(
      { x: 2, y: baseY },
      { x: 1, y: baseY + 1 },
      { x: 3, y: baseY + 1 },
      { x: 0, y: baseY + 2 },
      { x: 4, y: baseY + 2 },
      { x: 2, y: baseY + 2 },
    );
  } else if (formation === "column") {
    for (let y = h - 5; y < h; y += 1) {
      candidates.push({ x: 1 + ((y + h) % 2), y });
      candidates.push({ x: 3, y });
    }
  } else if (formation === "split") {
    [h - 4, h - 3, h - 2, h - 1].forEach((y) => {
      candidates.push({ x: 0, y }, { x: Math.min(frontCols, 5), y });
    });
  } else if (formation === "line") {
    for (let x = 0; x < frontCols; x += 1) candidates.push({ x, y: h - 2 });
    for (let x = 1; x < frontCols - 1; x += 1) candidates.push({ x, y: h - 3 });
  } else if (formation === "ambush") {
    candidates.push(
      { x: 0, y: h - 5 },
      { x: 2, y: h - 4 },
      { x: 4, y: h - 4 },
      { x: 1, y: h - 2 },
      { x: 3, y: h - 2 },
      { x: 5, y: h - 3 },
    );
  } else {
    candidates.push(
      { x: 1, y: h - 4 },
      { x: 2, y: h - 4 },
      { x: 0, y: h - 3 },
      { x: 3, y: h - 3 },
      { x: 1, y: h - 2 },
      { x: 4, y: h - 2 },
      { x: 2, y: h - 1 },
    );
  }

  for (let y = h - 5; y < h; y += 1) {
    for (let x = 0; x < frontCols; x += 1) candidates.push({ x, y });
  }

  return normalizeSpawnCandidates(candidates, activeMap);
}

function getLargeEnemySpawns(activeMap, stage = null) {
  const h = activeMap?.length || LARGE_MAP_SIZE;
  const w = activeMap?.[0]?.length || LARGE_MAP_SIZE;
  const columns = Math.max(5, Math.min(8, Math.ceil(w * 0.46)));
  const rows = Math.max(6, Math.min(h - 3, Math.ceil(h * 0.58)));
  const minX = Math.max(0, w - columns);
  const formation = getStageFormationKind(stage);
  const spawns = [];
  const top = 1;
  const mid = Math.floor(h * 0.36);

  if (formation === "wedge") {
    spawns.push(
      { x: w - 3, y: top },
      { x: w - 4, y: top + 1 },
      { x: w - 2, y: top + 1 },
      { x: w - 5, y: top + 2 },
      { x: w - 3, y: top + 2 },
      { x: w - 1, y: top + 2 },
    );
  } else if (formation === "column") {
    for (let y = top; y <= Math.min(h - 5, top + 7); y += 1) {
      spawns.push({ x: w - 2, y });
      if (y % 2 === 0) spawns.push({ x: w - 4, y });
    }
  } else if (formation === "split") {
    for (let y = top; y <= Math.min(h - 5, top + 6); y += 1) {
      spawns.push({ x: w - 2, y }, { x: Math.max(0, w - 7), y });
    }
  } else if (formation === "line") {
    for (let x = w - 1; x >= minX; x -= 1) spawns.push({ x, y: top + 1 });
    for (let x = w - 2; x >= minX + 1; x -= 2) spawns.push({ x, y: top + 3 });
  } else if (formation === "ambush") {
    spawns.push(
      { x: w - 3, y: top },
      { x: w - 5, y: mid },
      { x: w - 2, y: mid + 1 },
      { x: Math.max(0, w - 8), y: mid + 2 },
      { x: w - 4, y: mid + 3 },
      { x: w - 1, y: top + 4 },
    );
  } else {
    spawns.push(
      { x: w - 3, y: top },
      { x: w - 4, y: top + 1 },
      { x: w - 2, y: top + 2 },
      { x: w - 5, y: top + 3 },
      { x: w - 1, y: top + 3 },
      { x: w - 6, y: top + 4 },
    );
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = w - 1; x >= minX; x -= 1) {
      if ((x + y) % 5 === 1) continue;
      spawns.push({ x, y });
    }
  }

  return normalizeSpawnCandidates(spawns, activeMap);
}

const BATTLEFIELD_THEMES = {
  frontier: { id: "frontier", label: "전초 숲길", seed: 11 },
  canyon: { id: "canyon", label: "협곡 매복", seed: 23 },
  fortress: { id: "fortress", label: "요새 돌파", seed: 37 },
  burning: { id: "burning", label: "불타는 전장", seed: 41 },
  frozen: { id: "frozen", label: "빙결 계곡", seed: 53 },
  marsh: { id: "marsh", label: "여울 늪지", seed: 67 },
  shadow: { id: "shadow", label: "흑야 의식", seed: 79 },
  final: { id: "final", label: "종말 전장", seed: 97 },
};

const HAZARD_TERRAIN_TYPES = new Set(["fire", "ice", "water", "dark", "rune", "trap", "swamp"]);
const STRUCTURE_TERRAIN_TYPES = new Set(["road", "fort", "gate"]);
const BLOCKED_TERRAIN_TYPES = new Set(["block", "wall", "void"]);

const FINAL_FRONTIER_TACTICAL_MAP = [
  ["wall", "wall", "forest", "forest", "plain", "road", "wall", "wall", "fort", "fort", "fort", "wall"],
  ["wall", "forest", "forest", "plain", "road", "road", "wall", "fort", "gate", "gate", "fort", "wall"],
  ["wall", "forest", "wall", "plain", "road", "plain", "plain", "fort", "gate", "fort", "fort", "wall"],
  ["wall", "wall", "forest", "road", "road", "plain", "hill", "plain", "fort", "gate", "fort", "wall"],
  ["wall", "wall", "plain", "road", "plain", "block", "plain", "road", "road", "fort", "wall", "wall"],
  ["wall", "forest", "plain", "road", "plain", "hill", "plain", "road", "plain", "plain", "wall", "wall"],
  ["forest", "plain", "plain", "road", "road", "plain", "forest", "road", "plain", "hill", "forest", "block"],
  ["forest", "plain", "block", "plain", "road", "road", "plain", "road", "forest", "plain", "wall", "wall"],
  ["forest", "forest", "plain", "plain", "road", "plain", "plain", "road", "plain", "wall", "wall", "wall"],
  ["block", "forest", "plain", "road", "road", "plain", "hill", "plain", "road", "plain", "forest", "block"],
  ["forest", "plain", "road", "road", "plain", "plain", "plain", "road", "plain", "forest", "forest", "block"],
  ["forest", "plain", "road", "plain", "forest", "plain", "road", "road", "plain", "plain", "forest", "block"],
  ["block", "plain", "road", "plain", "plain", "plain", "road", "plain", "forest", "plain", "block", "forest"],
  ["forest", "plain", "road", "road", "plain", "block", "plain", "road", "plain", "plain", "forest", "forest"],
  ["forest", "forest", "plain", "road", "plain", "plain", "plain", "road", "plain", "forest", "block", "forest"],
  ["forest", "plain", "plain", "road", "road", "plain", "forest", "road", "plain", "plain", "forest", "block"],
  ["block", "forest", "plain", "plain", "road", "plain", "plain", "road", "plain", "block", "forest", "forest"],
  ["forest", "plain", "road", "road", "plain", "plain", "hill", "plain", "road", "plain", "forest", "block"],
];

const FINAL_FRONTIER_ALLY_SPAWNS = [
  { x: 2, y: 14 },
  { x: 3, y: 14 },
  { x: 1, y: 15 },
  { x: 4, y: 15 },
  { x: 2, y: 16 },
  { x: 3, y: 16 },
];

const FINAL_FRONTIER_ENEMY_BY_ID = {
  boss: { x: 8, y: 3 },
  enemy1: { x: 7, y: 5 },
  enemy2: { x: 10, y: 4 },
  enemy3: { x: 9, y: 6 },
};

const FINAL_FRONTIER_EXTRA_ENEMY_SPAWNS = [
  { x: 9, y: 4 },
  { x: 6, y: 5 },
  { x: 10, y: 5 },
  { x: 7, y: 6 },
  { x: 8, y: 6 },
  { x: 10, y: 7 },
  { x: 6, y: 7 },
  { x: 9, y: 8 },
  { x: 7, y: 8 },
  { x: 5, y: 9 },
];

const ACT_ONE_ROUTE_TACTICAL_MAP = [
  ["wall", "wall", "wall", "wall", "fort", "fort", "gate", "gate", "fort", "wall", "wall", "wall"],
  ["wall", "wall", "forest", "fort", "fort", "gate", "road", "gate", "fort", "fort", "wall", "wall"],
  ["wall", "forest", "plain", "fort", "gate", "road", "road", "road", "fort", "gate", "fort", "wall"],
  ["forest", "plain", "hill", "plain", "road", "road", "road", "plain", "fort", "fort", "wall", "forest"],
  ["forest", "block", "plain", "road", "road", "plain", "hill", "road", "road", "fort", "wall", "forest"],
  ["forest", "plain", "plain", "road", "forest", "plain", "plain", "road", "plain", "road", "forest", "block"],
  ["block", "forest", "plain", "road", "plain", "hill", "plain", "road", "forest", "road", "wall", "wall"],
  ["forest", "forest", "plain", "road", "road", "plain", "forest", "road", "plain", "road", "plain", "wall"],
  ["forest", "plain", "block", "plain", "road", "road", "plain", "road", "plain", "road", "forest", "wall"],
  ["forest", "plain", "plain", "plain", "road", "plain", "plain", "road", "forest", "road", "forest", "block"],
  ["block", "forest", "plain", "road", "road", "plain", "hill", "plain", "road", "road", "forest", "block"],
  ["forest", "plain", "road", "road", "plain", "forest", "plain", "road", "plain", "forest", "forest", "block"],
  ["forest", "plain", "road", "plain", "plain", "plain", "road", "road", "plain", "plain", "forest", "block"],
  ["block", "plain", "road", "plain", "forest", "plain", "road", "plain", "forest", "plain", "block", "forest"],
  ["forest", "plain", "road", "road", "plain", "plain", "plain", "road", "plain", "plain", "forest", "forest"],
  ["forest", "forest", "plain", "road", "plain", "hill", "plain", "road", "plain", "forest", "block", "forest"],
  ["forest", "plain", "plain", "road", "road", "plain", "forest", "road", "plain", "plain", "forest", "block"],
  ["block", "forest", "plain", "plain", "road", "plain", "plain", "road", "plain", "block", "forest", "forest"],
  ["forest", "plain", "road", "road", "plain", "forest", "plain", "road", "plain", "plain", "forest", "block"],
  ["forest", "plain", "road", "plain", "plain", "plain", "road", "road", "plain", "forest", "forest", "block"],
  ["block", "plain", "road", "plain", "forest", "plain", "road", "plain", "plain", "plain", "block", "forest"],
  ["forest", "plain", "road", "road", "plain", "plain", "plain", "road", "plain", "forest", "forest", "block"],
  ["forest", "forest", "plain", "road", "plain", "hill", "plain", "road", "plain", "forest", "block", "forest"],
  ["forest", "plain", "road", "road", "plain", "plain", "forest", "road", "plain", "plain", "forest", "block"],
  ["block", "plain", "plain", "road", "road", "plain", "plain", "road", "plain", "block", "forest", "forest"],
  ["forest", "forest", "plain", "plain", "road", "road", "plain", "plain", "forest", "forest", "block", "block"],
];

const ACT_ONE_ROUTE_STAGE_CONFIGS = {
  1: {
    battleTitle: "1장. 국경 출발점",
    battleObjective: "목표: 성채로 향하는 진군로 확보",
    themeLabel: "국경 출발지",
    themeId: "frontier",
    allySpawns: [{ x: 1, y: 23 }, { x: 2, y: 22 }, { x: 3, y: 23 }, { x: 1, y: 24 }, { x: 4, y: 22 }, { x: 2, y: 24 }],
    enemySpawns: [{ x: 5, y: 17 }, { x: 7, y: 16 }, { x: 6, y: 18 }, { x: 8, y: 15 }, { x: 4, y: 16 }, { x: 9, y: 17 }],
    bossSpawn: { x: 7, y: 14 },
    maxEnemies: 5,
  },
  2: {
    battleTitle: "2장. 국경 초소",
    battleObjective: "목표: 초소 방어선 돌파",
    themeLabel: "협곡 진입로",
    themeId: "canyon",
    allySpawns: [{ x: 2, y: 21 }, { x: 3, y: 20 }, { x: 1, y: 21 }, { x: 4, y: 20 }, { x: 2, y: 22 }, { x: 5, y: 21 }],
    enemySpawns: [{ x: 6, y: 14 }, { x: 8, y: 13 }, { x: 7, y: 15 }, { x: 9, y: 12 }, { x: 5, y: 13 }, { x: 10, y: 14 }],
    bossSpawn: { x: 8, y: 12 },
    maxEnemies: 6,
  },
  3: {
    battleTitle: "3장. 성문 외곽",
    battleObjective: "목표: 외곽 수비대 격파",
    themeLabel: "성문 외곽",
    themeId: "fortress",
    allySpawns: [{ x: 3, y: 19 }, { x: 4, y: 18 }, { x: 2, y: 19 }, { x: 5, y: 18 }, { x: 3, y: 20 }, { x: 6, y: 19 }],
    enemySpawns: [{ x: 6, y: 11 }, { x: 8, y: 10 }, { x: 7, y: 12 }, { x: 9, y: 9 }, { x: 5, y: 10 }, { x: 10, y: 11 }],
    bossSpawn: { x: 8, y: 8 },
    maxEnemies: 7,
  },
  4: {
    battleTitle: "4장. 불타는 숲길",
    battleObjective: "목표: 불길 속 전초선 돌파",
    themeLabel: "불타는 숲길",
    themeId: "burning",
    allySpawns: [{ x: 4, y: 17 }, { x: 5, y: 16 }, { x: 3, y: 17 }, { x: 6, y: 16 }, { x: 4, y: 18 }, { x: 7, y: 17 }],
    enemySpawns: [{ x: 6, y: 9 }, { x: 8, y: 8 }, { x: 7, y: 10 }, { x: 9, y: 7 }, { x: 5, y: 8 }, { x: 10, y: 9 }],
    bossSpawn: { x: 8, y: 6 },
    maxEnemies: 7,
  },
  5: {
    battleTitle: "5장. 무너진 성벽",
    battleObjective: "목표: 성벽 방어선 붕괴",
    themeLabel: "무너진 성벽",
    themeId: "fortress",
    allySpawns: [{ x: 4, y: 15 }, { x: 5, y: 14 }, { x: 3, y: 15 }, { x: 6, y: 14 }, { x: 4, y: 16 }, { x: 7, y: 15 }],
    enemySpawns: [{ x: 6, y: 7 }, { x: 8, y: 6 }, { x: 7, y: 8 }, { x: 9, y: 5 }, { x: 5, y: 7 }, { x: 10, y: 6 }],
    bossSpawn: { x: 8, y: 4 },
    maxEnemies: 8,
  },
  6: {
    battleTitle: "6장. 보스의 성",
    battleObjective: "목표: 성채 보스 격파",
    themeLabel: "보스의 성",
    themeId: "fortress",
    allySpawns: [{ x: 4, y: 13 }, { x: 5, y: 12 }, { x: 3, y: 13 }, { x: 6, y: 12 }, { x: 4, y: 14 }, { x: 7, y: 13 }],
    enemySpawns: [{ x: 6, y: 4 }, { x: 8, y: 3 }, { x: 7, y: 5 }, { x: 9, y: 4 }, { x: 5, y: 5 }, { x: 10, y: 3 }],
    bossSpawn: { x: 8, y: 2 },
    maxEnemies: 9,
  },
};

function getStageBattlefieldTheme(stage) {
  const stageId = Math.max(1, Math.floor(stage?.id || 1));
  const text = `${stage?.title || ""} ${stage?.desc || ""} ${stage?.objective || ""}`;

  if (stageId === 30 || /마지막|파멸|성소|천공|수호자|끝없는|왕좌/.test(text)) {
    return BATTLEFIELD_THEMES.final;
  }

  if (/얼어|빙결|얼음|계곡|설혼/.test(text)) return BATTLEFIELD_THEMES.frozen;
  if (/여울|항구|다리|늪|습지|물/.test(text)) return BATTLEFIELD_THEMES.marsh;
  if (/불|화염|재|붉은|혈/.test(text)) return BATTLEFIELD_THEMES.burning;
  if (/성문|요새|관문|왕도|시장|감옥|성벽|탑/.test(text)) return BATTLEFIELD_THEMES.fortress;
  if (/그림자|흑야|암살|밤|심연|기도|저주|달 없는|묘/.test(text)) {
    return BATTLEFIELD_THEMES.shadow;
  }
  if (/협곡|평원|골목/.test(text)) return BATTLEFIELD_THEMES.canyon;
  if (/숲|초소/.test(text)) return BATTLEFIELD_THEMES.frontier;

  if (stageId >= 25) return BATTLEFIELD_THEMES.final;
  if (stageId >= 19) return BATTLEFIELD_THEMES.shadow;
  if (stageId >= 13) return BATTLEFIELD_THEMES.fortress;
  if (stageId >= 7) return BATTLEFIELD_THEMES.marsh;
  return BATTLEFIELD_THEMES.frontier;
}

function getStageTileSeed(stageId, x, y, salt = 0) {
  const value =
    (stageId + 13) * 92821 +
    (x + 5) * 13717 +
    (y + 7) * 27143 +
    (salt + 3) * 65537;
  return Math.abs(value % 1000003);
}

function isLargeMapAllyZone(x, y, width, height) {
  return y >= height - 3 && x <= Math.min(6, width - 1);
}

const STAGE_LAYOUT_KINDS = [
  "frontierBreach",
  "forestPass",
  "canyonAmbush",
  "canyonFork",
  "ridgeSwitchback",
  "fortressGate",
  "gateCourtyard",
  "marketStreets",
  "burningArc",
  "burnScar",
  "frozenRiver",
  "iceBridge",
  "marshBridge",
  "marshIslands",
  "shadowRitual",
  "ritualSpokes",
  "ruinCross",
  "splitFlank",
  "finalCorridor",
  "finalSpiral",
];

const STAGE_FORMATION_KINDS = [
  "wedge",
  "column",
  "split",
  "line",
  "ambush",
  "siege",
];

function pickStageLayout(stageId, layouts) {
  return layouts[(stageId - 1) % layouts.length];
}

function getStageLayoutKind(stage) {
  const stageId = Math.max(1, Math.floor(stage?.id || 1));
  const theme = getStageBattlefieldTheme(stage);

  if (theme.id === "final") return pickStageLayout(stageId, ["finalCorridor", "finalSpiral", "ritualSpokes"]);
  if (theme.id === "shadow") return pickStageLayout(stageId, ["shadowRitual", "splitFlank", "ritualSpokes"]);
  if (theme.id === "fortress") return pickStageLayout(stageId, ["fortressGate", "ruinCross", "gateCourtyard", "marketStreets"]);
  if (theme.id === "burning") return pickStageLayout(stageId, ["burningArc", "burnScar", "frontierBreach"]);
  if (theme.id === "frozen") return pickStageLayout(stageId, ["frozenRiver", "iceBridge", "ridgeSwitchback"]);
  if (theme.id === "marsh") return pickStageLayout(stageId, ["marshBridge", "marshIslands", "splitFlank"]);
  if (theme.id === "canyon") {
    if (stageId === 2) return "canyonAmbush";
    return pickStageLayout(stageId, ["canyonFork", "ridgeSwitchback", "splitFlank"]);
  }

  return STAGE_LAYOUT_KINDS[(stageId - 1) % STAGE_LAYOUT_KINDS.length];
}

function getStageFormationKind(stage) {
  const stageId = Math.max(1, Math.floor(stage?.id || 1));
  return STAGE_FORMATION_KINDS[(stageId - 1) % STAGE_FORMATION_KINDS.length];
}

function getThemeRoadTile(theme, seed) {
  if (theme.id === "frozen" && seed % 5 === 0) return "ice";
  if (theme.id === "marsh" && seed % 4 === 0) return "water";
  if (theme.id === "shadow" && seed % 6 === 0) return "dark";
  return "road";
}

function getThemeBlockTile(theme, seed) {
  if (theme.id === "fortress" || theme.id === "final") return seed % 3 === 0 ? "wall" : "block";
  if (theme.id === "canyon") return "wall";
  if (theme.id === "frozen") return seed % 2 === 0 ? "wall" : "ice";
  if (theme.id === "marsh") return seed % 2 === 0 ? "water" : "swamp";
  return seed % 2 === 0 ? "forest" : "block";
}

function getStageSignatureTile({ stage, theme, tile, x, y, width, height, seed }) {
  const layout = getStageLayoutKind(stage);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const lowerField = y >= Math.floor(height * 0.62);
  const upperField = y <= Math.floor(height * 0.34);
  const bossGate = x >= width - 4 && y <= 4;
  const safeTile = HAZARD_TERRAIN_TYPES.has(tile) ? "plain" : tile;

  if (bossGate) {
    if (layout === "finalCorridor") return seed % 4 === 0 ? "rune" : seed % 3 === 0 ? "dark" : "fort";
    if (layout === "fortressGate" || layout === "ruinCross") return x >= width - 3 || y <= 1 ? "wall" : "fort";
  }

  switch (layout) {
    case "frontierBreach": {
      const roadX = 2 + Math.floor(y / 5);
      if (Math.abs(x - roadX) <= 1 && y >= 2 && y <= height - 3) return getThemeRoadTile(theme, seed);
      if (!lowerField && (x <= 1 || x >= width - 2) && seed % 3 !== 0) return "forest";
      if (upperField && x >= width - 5 && seed % 4 === 0) return "wall";
      break;
    }
    case "forestPass": {
      const laneA = Math.floor(width * 0.25 + Math.sin(y * 0.7) * 1.6);
      const laneB = Math.floor(width * 0.62 - Math.sin(y * 0.5) * 1.2);
      if ((Math.abs(x - laneA) <= 1 || (y > centerY && Math.abs(x - laneB) <= 1)) && y > 1 && y < height - 2) {
        return getThemeRoadTile(theme, seed);
      }
      if ((x <= 2 || x >= width - 3 || seed % 6 === 0) && !lowerField) return "forest";
      if (seed % 17 === 0) return "hill";
      break;
    }
    case "canyonFork": {
      if (Math.abs(x - centerX) <= 1 && y >= 1 && y <= height - 3) return "road";
      if (y === centerY && x >= 2 && x <= width - 3) return "road";
      if (!lowerField && (x <= 2 || x >= width - 3) && seed % 4 !== 0) return getThemeBlockTile(theme, seed);
      if (seed % 13 === 0) return "hill";
      break;
    }
    case "canyonAmbush": {
      const ravineX = Math.floor(width * 0.44 + Math.sin(y * 0.85) * 1.4);
      const upperFork = upperField && y >= 2 && (Math.abs(x - (ravineX - 3)) <= 1 || Math.abs(x - (ravineX + 3)) <= 1);
      const centerPass = Math.abs(x - ravineX) <= 1 && y >= 1 && y <= height - 3;
      const ambushShelf = (y === centerY - 2 || y === centerY + 1) && x >= 2 && x <= width - 3;
      if (centerPass || upperFork || ambushShelf) return "road";
      if (x <= 2 || x >= width - 3) return seed % 5 === 0 ? "hill" : "wall";
      if (!lowerField && seed % 6 === 0) return "trap";
      if (!lowerField && seed % 4 === 0) return "hill";
      if (seed % 13 === 0) return "forest";
      break;
    }
    case "ridgeSwitchback": {
      const band = Math.floor((y / Math.max(1, height - 1)) * 4);
      const leftToRight = band % 2 === 0;
      const pathX = leftToRight
        ? 2 + Math.floor((x + y) % Math.max(3, width - 4))
        : width - 3 - Math.floor((x + y) % Math.max(3, width - 4));
      if (Math.abs(x - pathX) <= 1 || y === Math.floor(height * 0.28) || y === Math.floor(height * 0.62)) return "road";
      if ((x <= 1 || x >= width - 2 || seed % 5 === 0) && !lowerField) return getThemeBlockTile(theme, seed);
      if (seed % 11 === 0) return "hill";
      break;
    }
    case "fortressGate": {
      if (upperField && x >= width - 6) return x >= width - 3 || y <= 1 ? "wall" : "fort";
      if (x === width - 5 && y >= 2 && y <= height - 5) return "road";
      if (y === centerY && x >= 3 && x <= width - 5) return "road";
      if (!lowerField && seed % 9 === 0) return "block";
      break;
    }
    case "gateCourtyard": {
      if (upperField && (x >= width - 6 || y <= 2)) return x === width - 4 || y === 2 ? "gate" : "fort";
      if (x === centerX && y >= 2 && y <= height - 3) return "road";
      if ((x === centerX - 3 || x === centerX + 3) && y >= 4 && y <= centerY + 2) return "fort";
      if (y === centerY && x >= 2 && x <= width - 3) return "road";
      if (seed % 12 === 0) return "block";
      break;
    }
    case "marketStreets": {
      const streetA = x === 2 || x === centerX || x === width - 4;
      const streetB = y === Math.floor(height * 0.34) || y === Math.floor(height * 0.58);
      if ((streetA || streetB) && x > 0 && y > 0 && x < width - 1 && y < height - 2) return "road";
      if (!lowerField && seed % 5 === 0) return seed % 10 === 0 ? "gate" : "fort";
      if (seed % 13 === 0) return "block";
      break;
    }
    case "burningArc": {
      const arcY = Math.floor(height * 0.72 - Math.sin(x / Math.max(1, width - 1) * Math.PI) * height * 0.36);
      if (Math.abs(y - arcY) <= 1) return "road";
      if (!lowerField && (x + y + seed) % 8 === 0) return "fire";
      if (seed % 11 === 0) return "forest";
      break;
    }
    case "burnScar": {
      const scarA = Math.abs(y - (height - 3 - Math.floor(x * 0.72))) <= 1;
      const scarB = Math.abs(y - Math.floor(height * 0.32 + x * 0.24)) <= 1 && x > 2;
      if (scarA || scarB) return seed % 4 === 0 ? "fire" : "road";
      if (!lowerField && seed % 5 === 0) return "fire";
      if (seed % 9 === 0) return "forest";
      break;
    }
    case "frozenRiver": {
      const riverX = Math.floor(width * 0.25 + (y / Math.max(1, height - 1)) * width * 0.48);
      if (Math.abs(x - riverX) <= 1) return y === centerY || y === centerY + 1 ? "road" : "ice";
      if (Math.abs(x - riverX) === 2 && seed % 2 === 0) return "water";
      if (seed % 12 === 0) return "hill";
      break;
    }
    case "iceBridge": {
      if (y === centerY || y === centerY + 1) return x >= 2 && x <= width - 3 ? "road" : "ice";
      if (Math.abs(y - centerY) <= 3 && seed % 3 !== 0) return "ice";
      if (!lowerField && seed % 11 === 0) return "water";
      if (seed % 13 === 0) return "hill";
      break;
    }
    case "marshBridge": {
      if (y === centerY || y === centerY + 1) return x >= 1 && x <= width - 2 ? "road" : safeTile;
      if (!lowerField && (x + y) % 5 === 0) return "water";
      if (!lowerField && seed % 7 === 0) return "swamp";
      break;
    }
    case "marshIslands": {
      const island = ((x - 3) ** 2 + (y - centerY) ** 2 <= 10) || ((x - centerX - 2) ** 2 + (y - centerY + 3) ** 2 <= 12);
      if (island) return seed % 6 === 0 ? "forest" : "plain";
      if (x === centerX || y === centerY + 2) return "road";
      if (!lowerField && seed % 3 !== 0) return seed % 2 === 0 ? "water" : "swamp";
      break;
    }
    case "shadowRitual": {
      const ring = Math.abs(Math.abs(x - centerX) + Math.abs(y - centerY) - 4);
      if (ring === 0 && !lowerField) return seed % 2 === 0 ? "rune" : "dark";
      if (x === centerX && y >= 2 && y <= height - 4) return "road";
      if (seed % 15 === 0) return "trap";
      break;
    }
    case "ritualSpokes": {
      const diagonalA = Math.abs((x - centerX) - (y - centerY)) <= 1;
      const diagonalB = Math.abs((x - centerX) + (y - centerY)) <= 1;
      const ritualCore = Math.abs(x - centerX) + Math.abs(y - centerY) <= 3;
      if (!lowerField && ritualCore) return seed % 2 === 0 ? "rune" : "dark";
      if (!lowerField && (diagonalA || diagonalB || x === centerX || y === centerY)) return seed % 3 === 0 ? "rune" : "road";
      if (seed % 11 === 0) return "trap";
      break;
    }
    case "ruinCross": {
      if (x === centerX || y === centerY) return "road";
      if (!lowerField && (x <= 1 || x >= width - 2 || y <= 1) && seed % 3 !== 0) return "wall";
      if (seed % 8 === 0) return "fort";
      break;
    }
    case "splitFlank": {
      if ((x === 2 || x === width - 4) && y >= 2 && y <= height - 3) return "road";
      if (y === Math.floor(height * 0.46) && x >= 2 && x <= width - 4) return "road";
      if (!lowerField && x >= centerX - 1 && x <= centerX + 1 && seed % 2 === 0) return getThemeBlockTile(theme, seed);
      break;
    }
    case "finalCorridor": {
      if (Math.abs(x - centerX) <= 1 && y >= 1 && y <= height - 3) return y < 5 ? "rune" : "road";
      if (!lowerField && x >= width - 6 && y <= 5) return seed % 3 === 0 ? "dark" : "fort";
      if (!lowerField && (x <= 1 || x >= width - 2) && seed % 2 === 0) return "wall";
      if (seed % 10 === 0) return "rune";
      break;
    }
    case "finalSpiral": {
      const ring = Math.round(Math.hypot(x - centerX, y - centerY));
      const swirl = (ring + Math.floor((Math.atan2(y - centerY, x - centerX) + Math.PI) * 2)) % 5;
      if (!lowerField && swirl <= 1) return seed % 3 === 0 ? "dark" : "rune";
      if (Math.abs(x - centerX) <= 1 && y >= 2 && y <= height - 3) return y <= centerY ? "rune" : "road";
      if (!lowerField && x >= width - 6 && y <= 6) return seed % 2 === 0 ? "fort" : "dark";
      if (seed % 9 === 0) return "fire";
      break;
    }
    default:
      break;
  }

  return null;
}

function decorateLargeBattleMap(largeMap, stage) {
  if (!Array.isArray(largeMap) || !largeMap.length) return largeMap;

  const theme = getStageBattlefieldTheme(stage);
  const stageId = Math.max(1, Math.floor(stage?.id || 1));
  const height = largeMap.length;
  const width = largeMap[0]?.length || 1;

  return largeMap.map((row, y) =>
    row.map((tile, x) => {
      const seed = getStageTileSeed(stageId, x, y, theme.seed);
      const allyZone = isLargeMapAllyZone(x, y, width, height);
      const bossZone = x >= width - 4 && y <= 3;
      const diagonalRoadY = height - 2 - Math.floor((x / Math.max(1, width - 1)) * (height - 4));
      const roadBand = x >= 1 && x <= width - 2 && Math.abs(y - diagonalRoadY) <= (x % 5 === 0 ? 1 : 0);
      const midBand = y === Math.floor(height * 0.52) && x >= 2 && x <= width - 4;

      if (allyZone) {
        if (HAZARD_TERRAIN_TYPES.has(tile)) return x === 2 || y === height - 2 ? "road" : "plain";
        if (tile === "plain" && seed % 19 === 0) return "forest";
        return tile;
      }

      if (bossZone) {
        if (theme.id === "final") return seed % 5 === 0 ? "rune" : seed % 3 === 0 ? "dark" : "fort";
        if (theme.id === "shadow") return seed % 4 === 0 ? "rune" : "dark";
        if (theme.id === "burning") return seed % 4 === 0 ? "fire" : "fort";
        if (theme.id === "frozen") return seed % 3 === 0 ? "ice" : "fort";
        return x === width - 3 || y === 2 ? "gate" : "fort";
      }

      if ((roadBand || midBand) && !HAZARD_TERRAIN_TYPES.has(tile)) {
        if (theme.id === "frozen" && seed % 7 === 0) return "ice";
        if (theme.id === "shadow" && seed % 9 === 0) return "rune";
        if (theme.id === "marsh" && seed % 6 === 0) return "water";
        return "road";
      }

      if (STRUCTURE_TERRAIN_TYPES.has(tile) && seed % 6 !== 0) return tile;

      const signatureTile = getStageSignatureTile({
        stage,
        theme,
        tile,
        x,
        y,
        width,
        height,
        seed,
      });

      if (signatureTile) return signatureTile;

      switch (theme.id) {
        case "frontier":
          if (seed % 10 === 0) return "forest";
          if (seed % 17 === 0) return "hill";
          if (x >= width - 5 && y <= 5 && seed % 13 === 0) return "gate";
          return tile;
        case "canyon":
          if (x <= 1 || x >= width - 2 || seed % 7 === 0) return "hill";
          if (seed % 19 === 0) return "trap";
          if (seed % 11 === 0) return "forest";
          return tile;
        case "fortress":
          if (seed % 8 === 0) return "fort";
          if (seed % 13 === 0) return "gate";
          if (seed % 17 === 0) return "trap";
          if (seed % 5 === 0) return "hill";
          return tile;
        case "burning":
          if (seed % 6 === 0) return "fire";
          if (seed % 9 === 0) return "forest";
          if (seed % 14 === 0) return "hill";
          return tile;
        case "frozen":
          if (seed % 5 === 0) return "ice";
          if (seed % 13 === 0) return "water";
          if (seed % 11 === 0) return "hill";
          return tile;
        case "marsh":
          if (seed % 7 === 0) return "swamp";
          if (seed % 11 === 0) return "water";
          if (seed % 6 === 0) return "forest";
          return tile;
        case "shadow":
          if (seed % 6 === 0) return "dark";
          if (seed % 10 === 0) return "rune";
          if (seed % 14 === 0) return "trap";
          if (seed % 9 === 0) return "forest";
          return tile;
        case "final":
          if (seed % 5 === 0) return "dark";
          if (seed % 7 === 0) return "fire";
          if (seed % 9 === 0) return "rune";
          if (seed % 13 === 0) return "fort";
          return tile;
        default:
          return tile;
      }
    })
  );
}

function getThemedLargeEnemyTemplates(stage) {
  const theme = getStageBattlefieldTheme(stage);
  const stageId = Math.max(1, Math.floor(stage?.id || 1));
  const eliteBonus = Math.floor(stageId / 10);

  const withBonus = (template) => ({
    ...template,
    hp: template.hp + eliteBonus,
    atk: template.atk + Math.floor(eliteBonus / 2),
    def: template.def + Math.floor(eliteBonus / 2),
  });

  const byTheme = {
    frontier: [
      { spriteKey: "sentinel", icon: "🛡️", name: "초소 방패병", aiType: "aggressive", hp: 24, atk: 7, def: 8, move: 1, range: 1, skill: "방패 강타", skillBonus: 2, skillRange: 1 },
      { spriteKey: "ranger", icon: "🏹", name: "숲길 사수", aiType: "archer", hp: 18, atk: 8, def: 3, move: 2, range: 3, skill: "매복 사격", skillBonus: 2, skillRange: 3 },
      { spriteKey: "raider", icon: "🪓", name: "전초 약탈병", aiType: "aggressive", hp: 21, atk: 8, def: 4, move: 2, range: 1, skill: "광폭참", skillBonus: 3, skillRange: 1 },
      { spriteKey: "sniper", icon: "🏹", name: "감시탑 저격수", aiType: "archer", hp: 17, atk: 9, def: 3, move: 2, range: 3, skill: "정밀사격", skillBonus: 3, skillRange: 3 },
    ],
    canyon: [
      { spriteKey: "marauder", icon: "🔱", name: "협곡 투창병", aiType: "aggressive", hp: 22, atk: 9, def: 5, move: 2, range: 2, skill: "긴 창 찌르기", skillBonus: 3, skillRange: 2 },
      { spriteKey: "assassin_elite", icon: "🗡️", name: "절벽 암살자", aiType: "assassin", hp: 18, atk: 10, def: 3, move: 4, range: 1, skill: "그림자 베기", skillBonus: 4, skillRange: 1 },
      { spriteKey: "sniper", icon: "🏹", name: "협곡 저격수", aiType: "archer", hp: 18, atk: 10, def: 3, move: 2, range: 3, skill: "고지 사격", skillBonus: 3, skillRange: 3 },
      { spriteKey: "raider", icon: "🪓", name: "바위길 습격병", aiType: "aggressive", hp: 24, atk: 9, def: 4, move: 3, range: 1, skill: "돌파 베기", skillBonus: 3, skillRange: 1 },
    ],
    fortress: [
      { spriteKey: "sentinel", icon: "🛡️", name: "성벽 수비병", aiType: "aggressive", hp: 28, atk: 8, def: 10, move: 1, range: 1, skill: "철벽 강타", skillBonus: 2, skillRange: 1 },
      { spriteKey: "blackguard", icon: "⚔️", name: "요새 흑기사", aiType: "aggressive", hp: 27, atk: 10, def: 8, move: 2, range: 1, skill: "수호 돌격", skillBonus: 3, skillRange: 1 },
      { spriteKey: "sniper", icon: "🏹", name: "성벽 쇠뇌병", aiType: "archer", hp: 20, atk: 10, def: 5, move: 1, range: 3, skill: "성벽 저격", skillBonus: 3, skillRange: 3 },
      { spriteKey: "warlord", icon: "👑", name: "관문 부장", aiType: "aggressive", hp: 30, atk: 10, def: 9, move: 2, range: 1, skill: "관문 돌격", skillBonus: 4, skillRange: 1 },
    ],
    burning: [
      { spriteKey: "pyromancer", icon: "🔥", name: "화염 술사", aiType: "archer", hp: 20, atk: 11, def: 3, move: 2, range: 2, skill: "화염 폭발", skillBonus: 4, skillRange: 2 },
      { spriteKey: "raider", icon: "🪓", name: "잿불 광전사", aiType: "aggressive", hp: 26, atk: 10, def: 4, move: 2, range: 1, skill: "광폭참", skillBonus: 3, skillRange: 1 },
      { spriteKey: "blackguard", icon: "⚔️", name: "그을린 흑기사", aiType: "aggressive", hp: 28, atk: 10, def: 7, move: 2, range: 1, skill: "흑염 돌격", skillBonus: 4, skillRange: 1 },
      { spriteKey: "cultist", icon: "🔮", name: "재의 사제", aiType: "archer", hp: 22, atk: 10, def: 5, move: 2, range: 2, skill: "잿빛 기도", skillBonus: 3, skillRange: 2 },
    ],
    frozen: [
      { spriteKey: "frost_mage", icon: "❄️", name: "빙결 마도병", aiType: "archer", hp: 21, atk: 10, def: 4, move: 2, range: 2, skill: "빙결 저주", skillBonus: 4, skillRange: 2 },
      { spriteKey: "sentinel", icon: "🛡️", name: "설원 수비병", aiType: "aggressive", hp: 28, atk: 8, def: 9, move: 1, range: 1, skill: "철벽 강타", skillBonus: 2, skillRange: 1 },
      { spriteKey: "ranger", icon: "🏹", name: "설원 추적자", aiType: "archer", hp: 20, atk: 9, def: 4, move: 3, range: 3, skill: "빙판 사격", skillBonus: 3, skillRange: 3 },
      { spriteKey: "blackguard", icon: "⚔️", name: "서리 검병", aiType: "aggressive", hp: 25, atk: 9, def: 7, move: 2, range: 1, skill: "서리 베기", skillBonus: 3, skillRange: 1 },
    ],
    marsh: [
      { spriteKey: "ranger", icon: "🏹", name: "여울 사수", aiType: "archer", hp: 19, atk: 9, def: 4, move: 2, range: 3, skill: "정밀사격", skillBonus: 2, skillRange: 3 },
      { spriteKey: "cultist", icon: "🔮", name: "늪지 사제", aiType: "archer", hp: 22, atk: 10, def: 5, move: 2, range: 2, skill: "암흑 기도", skillBonus: 3, skillRange: 2 },
      { spriteKey: "marauder", icon: "🔱", name: "진흙 창병", aiType: "aggressive", hp: 24, atk: 9, def: 6, move: 2, range: 2, skill: "긴 창 찌르기", skillBonus: 3, skillRange: 2 },
      { spriteKey: "raider", icon: "🪓", name: "늪지 약탈병", aiType: "aggressive", hp: 25, atk: 9, def: 5, move: 2, range: 1, skill: "습격", skillBonus: 3, skillRange: 1 },
    ],
    shadow: [
      { spriteKey: "assassin_elite", icon: "🗡️", name: "흑야 암살자", aiType: "assassin", hp: 20, atk: 11, def: 4, move: 4, range: 1, skill: "그림자 베기", skillBonus: 4, skillRange: 1 },
      { spriteKey: "cultist", icon: "🔮", name: "의식 사제", aiType: "archer", hp: 23, atk: 10, def: 6, move: 2, range: 2, skill: "암흑 기도", skillBonus: 4, skillRange: 2 },
      { spriteKey: "void_knight", icon: "⚔️", name: "공허 기사", aiType: "aggressive", hp: 30, atk: 11, def: 9, move: 2, range: 1, skill: "공허참", skillBonus: 4, skillRange: 1 },
      { spriteKey: "sniper", icon: "🏹", name: "흑야 저격수", aiType: "archer", hp: 21, atk: 11, def: 4, move: 2, range: 3, skill: "암흑 사격", skillBonus: 3, skillRange: 3 },
    ],
    final: [
      { spriteKey: "void_knight", icon: "👹", name: "심연 친위대", aiType: "aggressive", hp: 32, atk: 11, def: 10, move: 2, range: 1, skill: "흑염 돌격", skillBonus: 4, skillRange: 1 },
      { spriteKey: "pyromancer", icon: "🔥", name: "종말 마도사", aiType: "archer", hp: 25, atk: 12, def: 6, move: 2, range: 2, skill: "어둠의 파동", skillBonus: 5, skillRange: 2 },
      { spriteKey: "cultist", icon: "🔮", name: "종말 사제", aiType: "archer", hp: 26, atk: 11, def: 7, move: 2, range: 2, skill: "심연 기도", skillBonus: 5, skillRange: 2 },
      { spriteKey: "warlord", icon: "👑", name: "왕좌 집행관", aiType: "aggressive", hp: 36, atk: 12, def: 11, move: 2, range: 1, skill: "왕좌 강타", skillBonus: 5, skillRange: 1 },
    ],
  };

  return (byTheme[theme.id] || byTheme.frontier).map(withBonus);
}


function inActiveMap(x, y, activeMap) {
  return y >= 0 && y < activeMap.length && x >= 0 && x < activeMap[0].length;
}

function isBlockedBattleTile(tile) {
  return BLOCKED_TERRAIN_TYPES.has(tile);
}

function cloneFinalFrontierMap() {
  return FINAL_FRONTIER_TACTICAL_MAP.map((row) => row.slice());
}

function isActOneRouteStage(stage) {
  const stageId = Math.max(1, Math.floor(stage?.id || 1));
  return stageId >= 1 && stageId <= 6;
}

function getActOneRouteStageConfig(stage) {
  const stageId = Math.max(1, Math.floor(stage?.id || 1));
  return ACT_ONE_ROUTE_STAGE_CONFIGS[stageId] || ACT_ONE_ROUTE_STAGE_CONFIGS[1];
}

function cloneActOneRouteMap(stage) {
  const stageId = Math.max(1, Math.floor(stage?.id || 1));
  const map = ACT_ONE_ROUTE_TACTICAL_MAP.map((row) => row.slice());

  return map.map((row, y) =>
    row.map((tile, x) => {
      const seed = getStageTileSeed(stageId, x, y, 211);
      const topCastle = y <= 4 && x >= 5 && x <= 10;
      const centralAdvance = y >= 7 && y <= 17 && x >= 3 && x <= 8;

      if (stageId >= 6 && topCastle) {
        if (x === 6 || x === 7) return "gate";
        if (seed % 5 === 0) return "fort";
        return tile === "plain" || tile === "forest" ? "fort" : tile;
      }

      if (stageId >= 5 && y <= 8 && x >= 6) {
        if (tile === "plain" && seed % 4 === 0) return "fort";
        if (tile === "forest" && seed % 3 === 0) return "wall";
      }

      if (stageId === 4 && centralAdvance && tile !== "road" && tile !== "gate" && tile !== "fort") {
        if (seed % 5 === 0) return "fire";
        if (seed % 7 === 0) return "hill";
      }

      if (stageId === 3 && y >= 6 && y <= 13 && x >= 5 && x <= 9) {
        if (tile === "plain" && seed % 6 === 0) return "fort";
        if (tile === "forest" && seed % 4 === 0) return "block";
      }

      if (stageId === 2 && y >= 10 && y <= 18) {
        if ((x <= 1 || x >= 10) && tile !== "road") return "wall";
        if (tile === "plain" && seed % 8 === 0) return "hill";
      }

      if (stageId === 1 && y >= 20 && x <= 5 && tile === "forest" && seed % 3 === 0) {
        return "plain";
      }

      return tile;
    })
  );
}

function pickOpenFrontierSpawn(spawns, activeMap, occupied, fallback = { x: 0, y: 0 }) {
  const openSpawn = spawns.find((pos) =>
    inActiveMap(pos.x, pos.y, activeMap) &&
    !isBlockedBattleTile(activeMap[pos.y]?.[pos.x]) &&
    !occupied.has(`${pos.x},${pos.y}`)
  );

  if (openSpawn) return openSpawn;

  return fallback &&
    inActiveMap(fallback.x, fallback.y, activeMap) &&
    !isBlockedBattleTile(activeMap[fallback.y]?.[fallback.x]) &&
    !occupied.has(`${fallback.x},${fallback.y}`)
    ? fallback
    : null;
}

function createActOneRouteBattleStage(stage, deployCount = MAX_DEPLOY_COUNT) {
  const map = cloneActOneRouteMap(stage);
  const config = getActOneRouteStageConfig(stage);
  const occupied = new Set();
  let allyIndex = 0;
  let enemyIndex = 0;

  const positionedUnits = clone(stage.units || []).map((unit) => {
    const normalizedUnit = unit.id === "boss" && unit.type !== "ally"
      ? { ...unit, type: "boss" }
      : unit;

    if (normalizedUnit.type === "ally") {
      const spawn = pickOpenFrontierSpawn(
        config.allySpawns.slice(allyIndex),
        map,
        occupied,
        config.allySpawns[config.allySpawns.length - 1]
      ) || { x: 1, y: map.length - 2 };
      allyIndex += 1;
      occupied.add(`${spawn.x},${spawn.y}`);
      return { ...normalizedUnit, x: spawn.x, y: spawn.y };
    }

    const preferred = normalizedUnit.type === "boss"
      ? config.bossSpawn
      : config.enemySpawns[enemyIndex] || config.enemySpawns[config.enemySpawns.length - 1];
    const spawn = pickOpenFrontierSpawn(
      [preferred, ...config.enemySpawns.slice(enemyIndex)],
      map,
      occupied,
      preferred
    ) || preferred;

    if (normalizedUnit.type !== "boss") enemyIndex += 1;
    occupied.add(`${spawn.x},${spawn.y}`);
    return { ...normalizedUnit, x: spawn.x, y: spawn.y };
  });

  const currentEnemies = positionedUnits.filter((unit) => unit.type !== "ally").length;
  const targetEnemies = Math.max(currentEnemies, Math.min(config.maxEnemies, deployCount + Math.ceil((stage.id || 1) / 2)));
  const extraEnemies = [];

  for (let i = currentEnemies; i < targetEnemies; i += 1) {
    const spawn = pickOpenFrontierSpawn(
      config.enemySpawns.slice(enemyIndex),
      map,
      occupied,
      null
    ) || config.enemySpawns.find((pos) => !occupied.has(`${pos.x},${pos.y}`));

    if (!spawn) break;

    enemyIndex += 1;
    occupied.add(`${spawn.x},${spawn.y}`);
    extraEnemies.push(createLargeExtraEnemy(stage, i - currentEnemies + 1, spawn.x, spawn.y));
  }

  return {
    ...stage,
    title: config.battleTitle || stage.title,
    objective: config.battleObjective || stage.objective,
    map,
    units: [...positionedUnits, ...extraEnemies],
    largeBattle: true,
    battlefieldTheme: config.themeLabel,
    battlefieldThemeId: config.themeId,
    largeMapSize: `${map[0]?.length || 0}x${map.length || 0}`,
    baseMapSize: `${stage.map?.[0]?.length || 0}x${stage.map?.length || 0}`,
    finalConceptLayout: true,
    actRouteBattleMap: true,
  };
}

function createFinalFrontierBattleStage(stage, deployCount = MAX_DEPLOY_COUNT) {
  const map = cloneFinalFrontierMap();
  const occupied = new Set();
  let allyIndex = 0;
  let enemyIndex = 0;

  const positionedUnits = clone(stage.units || []).map((unit) => {
    const normalizedUnit = unit.id === "boss" && unit.type !== "ally"
      ? { ...unit, type: "boss" }
      : unit;

    if (normalizedUnit.type === "ally") {
      const spawn = pickOpenFrontierSpawn(
        FINAL_FRONTIER_ALLY_SPAWNS.slice(allyIndex),
        map,
        occupied,
        FINAL_FRONTIER_ALLY_SPAWNS[FINAL_FRONTIER_ALLY_SPAWNS.length - 1]
      );
      allyIndex += 1;
      occupied.add(`${spawn.x},${spawn.y}`);
      return { ...normalizedUnit, x: spawn.x, y: spawn.y };
    }

    const preferred = FINAL_FRONTIER_ENEMY_BY_ID[normalizedUnit.id];
    const fallback = pickOpenFrontierSpawn(
      FINAL_FRONTIER_EXTRA_ENEMY_SPAWNS.slice(enemyIndex),
      map,
      occupied,
      preferred || { x: 8, y: 3 }
    );
    const preferredOpen =
      preferred &&
      inActiveMap(preferred.x, preferred.y, map) &&
      !isBlockedBattleTile(map[preferred.y]?.[preferred.x]) &&
      !occupied.has(`${preferred.x},${preferred.y}`);
    const spawn = preferredOpen
      ? preferred
      : fallback;

    if (!spawn) return normalizedUnit;

    enemyIndex += 1;
    occupied.add(`${spawn.x},${spawn.y}`);
    return { ...normalizedUnit, x: spawn.x, y: spawn.y };
  });

  const currentEnemies = positionedUnits.filter((unit) => unit.type !== "ally").length;
  const targetEnemies = Math.max(currentEnemies, Math.min(7, deployCount + 2));
  const extraEnemies = [];

  for (let i = currentEnemies; i < targetEnemies; i += 1) {
    const spawn = pickOpenFrontierSpawn(
      FINAL_FRONTIER_EXTRA_ENEMY_SPAWNS.slice(enemyIndex),
      map,
      occupied,
      null
    );
    if (!spawn) break;

    enemyIndex += 1;
    occupied.add(`${spawn.x},${spawn.y}`);
    extraEnemies.push(createLargeExtraEnemy(stage, i - currentEnemies + 1, spawn.x, spawn.y));
  }

  return {
    ...stage,
    map,
    units: [...positionedUnits, ...extraEnemies],
    largeBattle: true,
    battlefieldTheme: getStageBattlefieldTheme(stage).label,
    battlefieldThemeId: getStageBattlefieldTheme(stage).id,
    largeMapSize: `${map[0]?.length || 0}x${map.length || 0}`,
    baseMapSize: `${stage.map?.[0]?.length || 0}x${stage.map?.length || 0}`,
    finalConceptLayout: true,
  };
}

function createBossPatternHazards(units, activeMap, stage, nextRound) {
  const boss = units.find((unit) => unit.type === "boss" && unit.phase2 && unit.hp > 0);
  if (!boss) return { hazards: [], pattern: null };

  const allies = units.filter((unit) => unit.type === "ally" && unit.hp > 0);
  if (!allies.length) return { hazards: [], pattern: null };

  const patternIndex = (nextRound + (stage?.id || 1)) % 4;
  const patterns = [
    {
      id: "cross",
      label: "십자 파동",
      desc: "대상 중심 십자 범위",
      damage: 7,
    },
    {
      id: "line",
      label: "암흑 직선",
      desc: "가장 약한 아군의 행/열 관통",
      damage: 6,
    },
    {
      id: "meteor",
      label: "흑성 낙뢰",
      desc: "여러 아군 위치에 낙뢰",
      damage: 8,
    },
    {
      id: "crush",
      label: "붕괴 장판",
      desc: "아군 밀집 지역 폭발",
      damage: 7,
    },
  ];

  const pattern = patterns[patternIndex];
  const hazards = [];
  const used = new Set();

  const addHazard = (x, y, damage = pattern.damage) => {
    if (!inActiveMap(x, y, activeMap)) return;
    const key = `${x},${y}`;
    if (used.has(key)) return;
    used.add(key);
    hazards.push({
      x,
      y,
      damage,
      pattern: pattern.id,
      label: pattern.label,
    });
  };

  const weakest = [...allies].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];

  if (pattern.id === "cross") {
    addHazard(weakest.x, weakest.y);
    for (let range = 1; range <= 2; range += 1) {
      addHazard(weakest.x + range, weakest.y);
      addHazard(weakest.x - range, weakest.y);
      addHazard(weakest.x, weakest.y + range);
      addHazard(weakest.x, weakest.y - range);
    }
  }

  if (pattern.id === "line") {
    const horizontal = Math.abs(boss.x - weakest.x) >= Math.abs(boss.y - weakest.y);

    if (horizontal) {
      for (let x = 0; x < activeMap[0].length; x += 1) addHazard(x, weakest.y);
    } else {
      for (let y = 0; y < activeMap.length; y += 1) addHazard(weakest.x, y);
    }
  }

  if (pattern.id === "meteor") {
    allies.slice(0, 7).forEach((ally, index) => {
      addHazard(ally.x, ally.y, pattern.damage);
      if (index % 2 === 0) addHazard(ally.x + 1, ally.y, pattern.damage - 1);
      if (index % 3 === 0) addHazard(ally.x, ally.y - 1, pattern.damage - 1);
    });
  }

  if (pattern.id === "crush") {
    const center = allies
      .map((ally) => ({
        ally,
        nearby: allies.filter((other) => Math.abs(other.x - ally.x) + Math.abs(other.y - ally.y) <= 3).length,
      }))
      .sort((a, b) => b.nearby - a.nearby)[0]?.ally || weakest;

    for (let y = center.y - 1; y <= center.y + 1; y += 1) {
      for (let x = center.x - 1; x <= center.x + 1; x += 1) {
        addHazard(x, y);
      }
    }
  }

  return {
    hazards: hazards.slice(0, pattern.id === "line" ? 12 : 10),
    pattern,
  };
}

function expandMapToLarge(baseMap, targetSize = LARGE_MAP_SIZE) {
  const { width, height } = normalizeLargeMapSize(targetSize);
  const sourceMap = baseMap?.length ? baseMap : [["plain"]];
  const h = sourceMap.length;
  const w = sourceMap[0]?.length || 1;
  const hazardTiles = new Set(["fire", "ice", "water", "dark", "rune", "trap"]);

  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      if (y >= height - 3 && x <= Math.min(5, width - 1)) {
        return x === 2 || y === height - 2 ? "road" : "plain";
      }

      const sourceTile = sourceMap[y % h]?.[x % w] || "plain";
      const protectedTile = hazardTiles.has(sourceTile);

      if (y >= height - 4 && x <= Math.min(6, width - 1)) {
        return protectedTile
          ? "plain"
          : sourceTile;
      }

      const diagonalRoadY = height - 2 - Math.floor((x / Math.max(1, width - 1)) * (height - 4));
      const hasDiagonalRoad = x >= 2 && x <= width - 3 && Math.abs(y - diagonalRoadY) <= (x % 4 === 0 ? 1 : 0);
      const hasUpperPatrolRoad = y === 2 && x >= Math.floor(width * 0.48) && x <= width - 2;
      const hasMidRoad = y === Math.floor(height * 0.54) && x >= 2 && x <= width - 4 && x % 2 === 0;

      if (!protectedTile && (hasDiagonalRoad || hasUpperPatrolRoad || hasMidRoad)) {
        return "road";
      }

      if (!protectedTile && x >= width - 3 && y <= 1) {
        return x === width - 2 ? "gate" : "fort";
      }

      if (!protectedTile && sourceTile === "plain" && ((x === width - 2 && y === 3) || (x === width - 4 && y === 1))) {
        return "gate";
      }

      if ((x + y + width + height) % 17 === 0) {
        return sourceTile === "plain" ? "forest" : sourceTile;
      }

      if ((x * 3 + y * 5) % 29 === 0) {
        return sourceTile === "plain" ? "hill" : sourceTile;
      }

      if (!protectedTile && sourceTile === "plain" && x <= 2 && y <= 3 && (x + y) % 2 === 0) {
        return "forest";
      }

      if (!protectedTile && sourceTile === "plain" && x >= width - 4 && y >= 4 && y <= height - 4 && (x + y) % 3 === 0) {
        return "hill";
      }

      return sourceTile;
    })
  );
}

function extendMapForPlayableBoard(baseMap, stage, minRows = BOARD_PLAYABLE_MIN_ROWS) {
  if (!Array.isArray(baseMap) || !baseMap.length || !Array.isArray(baseMap[0])) {
    return baseMap;
  }

  const width = baseMap[0].length;
  const originalHeight = baseMap.length;
  const stageId = Math.max(1, Math.floor(stage?.id || 1));
  const theme = getStageBattlefieldTheme(stage);
  const targetRows = Math.max(
    originalHeight,
    Math.min(BOARD_PLAYABLE_MAX_ROWS, minRows + Math.floor((stageId - 1) / 10))
  );

  if (originalHeight >= targetRows) return baseMap;

  const rows = baseMap.map((row) => row.slice(0, width));
  const safeFromSource = (tile) => (HAZARD_TERRAIN_TYPES.has(tile) ? "plain" : tile || "plain");

  for (let y = originalHeight; y < targetRows; y += 1) {
    const sourceRow = baseMap[(y + stageId) % originalHeight] || baseMap[originalHeight - 1];
    rows.push(
      Array.from({ length: width }, (_, x) => {
        const seed = getStageTileSeed(stageId, x, y, theme.seed + 149);
        const sourceTile = safeFromSource(sourceRow[x % sourceRow.length]);
        const extensionIndex = y - originalHeight;
        const horizontalRoad = extensionIndex % 5 === 1 && x >= 1 && x <= width - 2;
        const verticalRoad = x === Math.max(1, Math.min(width - 2, Math.floor(width * 0.28)));
        const branchRoad = y % 6 === 0 && x >= Math.floor(width * 0.48) && x <= width - 3;
        const allyPracticeGround = y >= targetRows - 4 && x <= Math.min(6, width - 1);

        if (allyPracticeGround) {
          if (x === 1 || y === targetRows - 2 || horizontalRoad) return "road";
          return seed % 8 === 0 ? "forest" : "plain";
        }

        if (horizontalRoad || verticalRoad || branchRoad) return "road";

        switch (theme.id) {
          case "fortress":
            if (seed % 11 === 0) return "fort";
            if (seed % 13 === 0) return "gate";
            if (seed % 5 === 0) return "hill";
            break;
          case "burning":
            if (seed % 10 === 0) return "fire";
            if (seed % 5 === 0) return "forest";
            if (seed % 12 === 0) return "hill";
            break;
          case "frozen":
            if (seed % 7 === 0) return "ice";
            if (seed % 12 === 0) return "hill";
            break;
          case "marsh":
            if (seed % 8 === 0) return "swamp";
            if (seed % 11 === 0) return "water";
            if (seed % 5 === 0) return "forest";
            break;
          case "shadow":
            if (seed % 10 === 0) return "dark";
            if (seed % 13 === 0) return "rune";
            if (seed % 5 === 0) return "forest";
            break;
          case "final":
            if (seed % 9 === 0) return "dark";
            if (seed % 13 === 0) return "rune";
            if (seed % 6 === 0) return "fort";
            break;
          case "canyon":
            if (seed % 5 === 0) return "hill";
            if (seed % 11 === 0) return "forest";
            break;
          default:
            if (seed % 5 === 0) return "forest";
            if (seed % 12 === 0) return "hill";
            break;
        }

        return sourceTile === "gate" || sourceTile === "fort" ? "plain" : sourceTile;
      })
    );
  }

  return rows;
}

function scaleEnemyPosition(unit, fromMap, toMap) {
  const fromH = fromMap?.length || 8;
  const fromW = fromMap?.[0]?.length || 8;
  const toH = toMap?.length || LARGE_MAP_SIZE;
  const toW = toMap?.[0]?.length || LARGE_MAP_SIZE;
  const maxEnemyY = Math.max(0, toH - 5);

  return {
    x: Math.max(0, Math.min(toW - 1, Math.round((unit.x / Math.max(1, fromW - 1)) * (toW - 1)))),
    y: Math.max(0, Math.min(maxEnemyY, Math.round((unit.y / Math.max(1, fromH - 1)) * maxEnemyY))),
  };
}

function createLargeExtraEnemy(stage, index, x, y) {
  const stageId = stage?.id || 1;
  const power = Math.max(0, stageId - 1);
  const baseTemplates = [
    {
      spriteKey: "raider",
      icon: "🪓",
      name: "전열 약탈병",
      aiType: "aggressive",
      hp: 20,
      atk: 8,
      def: 4,
      move: 2,
      range: 1,
      skill: "광폭참",
      skillBonus: 3,
      skillRange: 1,
    },
    {
      spriteKey: "sniper",
      icon: "🏹",
      name: "후열 궁병",
      aiType: "archer",
      hp: 18,
      atk: 8,
      def: 3,
      move: 2,
      range: 3,
      skill: "정밀사격",
      skillBonus: 2,
      skillRange: 3,
    },
    {
      spriteKey: "marauder",
      icon: "🔱",
      name: "전열 창병",
      aiType: "aggressive",
      hp: 22,
      atk: 8,
      def: 5,
      move: 2,
      range: 2,
      skill: "긴 창 찌르기",
      skillBonus: 2,
      skillRange: 2,
    },
    {
      spriteKey: "pyromancer",
      icon: "🔥",
      name: "흑염 마도사",
      aiType: "archer",
      hp: 17,
      atk: 10,
      def: 3,
      move: 2,
      range: 2,
      skill: "다크 플레임",
      skillBonus: 4,
      skillRange: 2,
    },
    {
      spriteKey: "sentinel",
      icon: "🛡️",
      name: "방패 수비병",
      aiType: "aggressive",
      hp: 26,
      atk: 7,
      def: 9,
      move: 1,
      range: 1,
      skill: "철벽 강타",
      skillBonus: 2,
      skillRange: 1,
    },
    {
      spriteKey: "assassin_elite",
      icon: "🗡️",
      name: "그림자 암살자",
      aiType: "assassin",
      hp: 18,
      atk: 10,
      def: 3,
      move: 4,
      range: 1,
      skill: "그림자 베기",
      skillBonus: 4,
      skillRange: 1,
    },
    {
      spriteKey: "cultist",
      icon: "🔮",
      name: "흑야 사제",
      aiType: "archer",
      hp: 20,
      atk: 9,
      def: 5,
      move: 2,
      range: 2,
      skill: "암흑 기도",
      skillBonus: 3,
      skillRange: 2,
    },
  ];
  const templates = [...getThemedLargeEnemyTemplates(stage), ...baseTemplates];
  const template = templates[(stageId + index) % templates.length];
  const hp = template.hp + Math.floor(power * 1.05);
  const atk = template.atk + Math.floor(power / 4);
  const def = template.def + Math.floor(power / 6);

  return {
    id: `large-extra-${stageId}-${index}`,
    x,
    y,
    type: "enemy",
    icon: template.icon,
    name: template.name,
    spriteKey: template.spriteKey,
    aiType: template.aiType,
    hp,
    maxHp: hp,
    atk,
    def,
    move: template.move,
    range: template.range,
    skill: template.skill,
    skillType: "attack",
    skillBonus: template.skillBonus + Math.floor(power / 8),
    skillRange: template.skillRange,
    moved: false,
    acted: false,
    guard: false,
    largeBattleExtra: true,
  };
}

function expandStageForLargeBattle(stage, deployCount = MAX_DEPLOY_COUNT) {
  if (!stage) return stage;
  if (isActOneRouteStage(stage)) return createActOneRouteBattleStage(stage, deployCount);

  const baseMap = stage.map || [];
  const mapSize = getLargeBattleMapSize(stage, deployCount);
  const largeMap = decorateLargeBattleMap(expandMapToLarge(baseMap, mapSize), stage);
  const allySpawns = getLargeAllySpawns(largeMap, stage);
  const enemySpawns = getLargeEnemySpawns(largeMap, stage);
  const hasBoss = (stage.units || []).some((unit) => unit.id === "boss" || unit.type === "boss");
  const occupied = new Set();
  let allyIndex = 0;
  let enemyIndex = hasBoss ? 1 : 0;

  const scaledUnits = clone(stage.units || []).map((unit) => {
    const normalizedUnit = unit.id === "boss" && unit.type !== "ally"
      ? { ...unit, type: "boss" }
      : unit;

    if (normalizedUnit.type === "ally") {
      const spawn = allySpawns[allyIndex] || allySpawns[allySpawns.length - 1] || { x: 0, y: largeMap.length - 1 };
      allyIndex += 1;
      occupied.add(`${spawn.x},${spawn.y}`);
      return {
        ...normalizedUnit,
        x: spawn.x,
        y: spawn.y,
      };
    }

    const scaledPos = scaleEnemyPosition(normalizedUnit, baseMap, largeMap);
    const reservedIndex = normalizedUnit.type === "boss" ? 0 : enemyIndex;
    const spawn = pickOpenFrontierSpawn(
      enemySpawns.slice(reservedIndex),
      largeMap,
      occupied,
      scaledPos
    );
    const pos = spawn || scaledPos;

    if (normalizedUnit.type !== "boss") enemyIndex += 1;
    occupied.add(`${pos.x},${pos.y}`);

    return {
      ...normalizedUnit,
      x: pos.x,
      y: pos.y,
    };
  });

  const currentEnemies = scaledUnits.filter((unit) => unit.type !== "ally").length;
  const bossStageBonus = stage.id % 6 === 0 ? 3 : 0;
  const targetEnemies = Math.max(
    currentEnemies,
    Math.min(26, deployCount + 4 + Math.floor((stage.id || 1) / 4) + bossStageBonus)
  );
  const extraEnemies = [];

  for (let i = currentEnemies; i < targetEnemies; i += 1) {
    const spawn = enemySpawns.slice(enemyIndex).find((pos) => !occupied.has(`${pos.x},${pos.y}`)) ||
      enemySpawns.find((pos) => !occupied.has(`${pos.x},${pos.y}`));
    if (!spawn) break;

    enemyIndex += 1;
    occupied.add(`${spawn.x},${spawn.y}`);
    extraEnemies.push(createLargeExtraEnemy(stage, i - currentEnemies + 1, spawn.x, spawn.y));
  }

  return {
    ...stage,
    map: largeMap,
    units: [...scaledUnits, ...extraEnemies],
    largeBattle: true,
    battlefieldTheme: getStageBattlefieldTheme(stage).label,
    battlefieldThemeId: getStageBattlefieldTheme(stage).id,
    largeMapSize: `${largeMap[0]?.length || 0}x${largeMap.length || 0}`,
    baseMapSize: `${baseMap[0]?.length || 0}x${baseMap.length || 0}`,
  };
}


const TRAINING_TYPES = [
  {
    id: "attack",
    name: "공격 훈련",
    exp: 20,
    stat: "atk",
    desc: "EXP +20 / 기본 공격 +1",
  },
  {
    id: "defense",
    name: "방어 훈련",
    exp: 20,
    stat: "def",
    desc: "EXP +20 / 기본 방어 +1",
  },
  {
    id: "focus",
    name: "집중 훈련",
    exp: 30,
    stat: null,
    desc: "EXP +30",
  },
];

function applyTrainingGrowth(unit, trainingType) {
  if (!trainingType?.stat) return unit;

  const baseAtk = unit.baseAtk ?? unit.atk;
  const baseDef = unit.baseDef ?? unit.def;

  if (trainingType.stat === "atk") {
    return applyEquipmentStats({
      ...unit,
      baseAtk: baseAtk + 1,
      baseDef,
    });
  }

  if (trainingType.stat === "def") {
    return applyEquipmentStats({
      ...unit,
      baseAtk,
      baseDef: baseDef + 1,
    });
  }

  return unit;
}


function getLogType(log) {
  const text = String(log || "");

  if (text.includes("레벨 업") || text.includes("EXP")) return "level";
  if (text.includes("회복") || text.includes("회복약")) return "heal";
  if (
    text.includes("흑염") ||
    text.includes("혈상") ||
    text.includes("방어감소") ||
    text.includes("빙결") ||
    text.includes("상태") ||
    text.includes("위험 타일")
  ) {
    return "status";
  }
  if (
    text.includes("피해") ||
    text.includes("공격") ||
    text.includes("반격") ||
    text.includes("치명타") ||
    text.includes("빗나감")
  ) {
    return "damage";
  }
  if (text.includes("저장") || text.includes("로드") || text.includes("이어하기")) return "system";
  if (text.includes("아군 턴") || text.includes("적 턴") || text.includes("행동 완료")) return "turn";

  return "normal";
}

function getLogIcon(log) {
  const type = getLogType(log);

  if (type === "damage") {
    if (String(log).includes("치명타")) return "💥";
    if (String(log).includes("빗나감")) return "💨";
    return "⚔️";
  }

  if (type === "heal") return "🟢";
  if (type === "level") return "⭐";
  if (type === "status") return "✨";
  if (type === "system") return "💾";
  if (type === "turn") return "🔁";

  return "•";
}

function renderLogText(log) {
  return String(log || "");
}

const LOG_FILTERS = [
  { id: "all", label: "전체" },
  { id: "combat", label: "전투" },
  { id: "damage", label: "피해" },
  { id: "movement", label: "이동" },
  { id: "status", label: "상태" },
];

function getLogCategory(log) {
  const text = String(log || "");
  const type = getLogType(log);

  if (type === "damage" || type === "heal") return "combat";
  if (
    text.includes("이동") ||
    text.includes("접근") ||
    text.includes("미니맵") ||
    text.includes("선택됨") ||
    text.includes("위치")
  ) {
    return "movement";
  }
  if (
    type === "status" ||
    type === "turn" ||
    type === "system" ||
    type === "level" ||
    text.includes("턴") ||
    text.includes("상태") ||
    text.includes("시야") ||
    text.includes("속도") ||
    text.includes("컷씬")
  ) {
    return "status";
  }

  return "combat";
}

function matchesLogFilter(log, filterId) {
  if (filterId === "all") return true;
  if (filterId === "damage") return getLogType(log) === "damage";

  return getLogCategory(log) === filterId;
}

function isImportantLog(log) {
  const text = String(log || "");

  return [
    "치명타",
    "레벨 업",
    "승리",
    "패배",
    "보스",
    "각성",
    "위험",
    "쓰러",
    "자동 전투",
  ].some((keyword) => text.includes(keyword));
}



const ENEMY_VARIANT_KEYS = new Set([
  "raider",
  "marauder",
  "assassin_elite",
  "sniper",
  "ranger",
  "pyromancer",
  "frost_mage",
  "cultist",
  "sentinel",
  "blackguard",
  "warlord",
  "void_knight",
]);

function getEnemySpriteKey(unit) {
  if (!unit || unit.type === "ally") return null;
  if (ENEMY_VARIANT_KEYS.has(unit.spriteKey)) return unit.spriteKey;

  const text = `${unit.id || ""} ${unit.name || ""} ${unit.skill || ""}`;

  if (text.includes("늑대") || text.includes("야수")) return "wolf";
  if (unit.type === "boss") {
    if (text.includes("가론") || text.includes("심연") || text.includes("공허") || text.includes("최종")) return "void_knight";
    if (text.includes("빙") || text.includes("얼음") || text.includes("설원") || text.includes("서리")) return "frost_mage";
    if (text.includes("화염") || text.includes("흑염") || text.includes("혈") || text.includes("잿") || text.includes("불")) return "pyromancer";
    if (text.includes("마도") || text.includes("마녀") || text.includes("사제") || text.includes("주술")) return "cultist";
    return "warlord";
  }

  if (text.includes("가론") || text.includes("심연") || text.includes("공허")) return "void_knight";
  if (text.includes("단장") || text.includes("장군") || text.includes("집행관") || text.includes("왕좌")) return "warlord";
  if (text.includes("빙") || text.includes("얼음") || text.includes("설원") || text.includes("서리")) return "frost_mage";
  if (text.includes("화염") || text.includes("흑염") || text.includes("혈") || text.includes("잿") || text.includes("불")) return "pyromancer";
  if (text.includes("사제") || text.includes("주술") || text.includes("의식") || text.includes("저주")) return "cultist";
  if (text.includes("암살") || text.includes("그림자") || text.includes("추적")) return "assassin_elite";
  if (text.includes("저격") || text.includes("쇠뇌") || text.includes("사수")) return "sniper";
  if (text.includes("궁병")) return "ranger";
  if (text.includes("투창") || text.includes("창병") || text.includes("창")) return "marauder";
  if (text.includes("방패") || text.includes("수비") || text.includes("감시")) return "sentinel";
  if (text.includes("기사") || text.includes("흑기사") || text.includes("검병")) return "blackguard";
  if (text.includes("약탈") || text.includes("습격") || text.includes("광전")) return "raider";

  return "raider";
}

function getUnitSprite(unit) {
  if (!unit) return null;

  const byId = {
    hero: "/sprites/units/kyle.png",
    bram: "/sprites/units/bram.png",
    lina: "/sprites/units/lina.png",
    aria: "/sprites/units/aria.png",
    leon: "/sprites/units/leon.png",
    sera: "/sprites/units/sera.png",
    noah: "/sprites/units/aria.png",
    yuna: "/sprites/units/aria.png",
    rakan: "/sprites/units/bram.png",
    miho: "/sprites/units/sera.png",
    teo: "/sprites/units/kyle.png",
    irene: "/sprites/units/lina.png",
    kaz: "/sprites/units/sera.png",
    ella: "/sprites/units/aria.png",
    jin: "/sprites/units/kyle.png",
    luka: "/sprites/units/leon.png",
    baekho: "/sprites/units/bram.png",
  };

  if (byId[unit.id]) return byId[unit.id];

  const enemySpriteKey = getEnemySpriteKey(unit);
  if (enemySpriteKey && enemySpriteKey !== "wolf") return `/sprites/enemies/${enemySpriteKey}.png`;

  if (unit.type === "boss") {
    if (unit.name?.includes("가론")) return "/sprites/enemies/garon.png";
    if (unit.name?.includes("마도사") || unit.name?.includes("마녀")) return "/sprites/enemies/boss_mage.png";
    return "/sprites/enemies/boss_knight.png";
  }

  if (unit.name?.includes("궁병") || unit.name?.includes("투창") || unit.name?.includes("창병")) return "/sprites/enemies/archer.png";
  if (unit.name?.includes("마도사") || unit.name?.includes("마녀") || unit.name?.includes("사제")) return "/sprites/enemies/mage.png";
  if (unit.name?.includes("방패") || unit.name?.includes("수비병")) return "/sprites/enemies/shield.png";
  if (unit.name?.includes("암살자")) return "/sprites/enemies/assassin.png";
  if (unit.name?.includes("늑대")) return "/sprites/enemies/wolf.png";

  return "/sprites/enemies/bandit.png";
}

function getBattleMapUnitSprite(unit) {
  if (!unit) return null;

  const byId = {
    hero: "/sprites/map_units/hero.png",
    bram: "/sprites/map_units/bram.png",
    lina: "/sprites/map_units/lina.png",
    aria: "/sprites/map_units/aria.png",
    leon: "/sprites/map_units/leon.png",
    sera: "/sprites/map_units/sera.png",
    noah: "/sprites/map_units/aria.png",
    yuna: "/sprites/map_units/aria.png",
    rakan: "/sprites/map_units/bram.png",
    miho: "/sprites/map_units/sera.png",
    teo: "/sprites/map_units/hero.png",
    irene: "/sprites/map_units/lina.png",
    kaz: "/sprites/map_units/sera.png",
    ella: "/sprites/map_units/aria.png",
    jin: "/sprites/map_units/hero.png",
    luka: "/sprites/map_units/leon.png",
    baekho: "/sprites/map_units/bram.png",
  };

  if (byId[unit.id]) return byId[unit.id];

  const enemySpriteKey = getEnemySpriteKey(unit);
  if (enemySpriteKey && enemySpriteKey !== "wolf") return `/sprites/map_units/${enemySpriteKey}.png`;

  if (unit.type === "boss") {
    if (unit.name?.includes("가론")) return "/sprites/map_units/garon.png";
    if (unit.name?.includes("마도사") || unit.name?.includes("마녀")) return "/sprites/map_units/boss_mage.png";
    return "/sprites/map_units/boss_knight.png";
  }

  if (unit.name?.includes("궁병") || unit.name?.includes("투창") || unit.name?.includes("창병")) return "/sprites/map_units/archer.png";
  if (unit.name?.includes("마도사") || unit.name?.includes("마녀") || unit.name?.includes("사제")) return "/sprites/map_units/mage.png";
  if (unit.name?.includes("방패") || unit.name?.includes("수비병")) return "/sprites/map_units/shield.png";
  if (unit.name?.includes("암살자")) return "/sprites/map_units/assassin.png";
  if (unit.name?.includes("늑대")) return "/sprites/map_units/wolf.png";

  return "/sprites/map_units/bandit.png";
}

function handleBattleMapUnitImageError(event, unit) {
  const img = event.currentTarget;
  const fallbackSrc = getUnitSprite(unit) || getUnitPortrait(unit);

  if (fallbackSrc && img.dataset.fallback !== "true") {
    img.dataset.fallback = "true";
    img.src = fallbackSrc;
    img.classList.add("using-original-unit-fallback");
    return;
  }

  img.style.display = "none";
}


function getUnitPortrait(unit) {
  if (!unit) return null;

  const byId = {
    hero: "/portraits/kyle.png",
    bram: "/portraits/bram.png",
    lina: "/portraits/lina.png",
    aria: "/portraits/aria.png",
    leon: "/portraits/leon.png",
    sera: "/portraits/sera.png",
    noah: "/portraits/aria.png",
    yuna: "/portraits/aria.png",
    rakan: "/portraits/bram.png",
    miho: "/portraits/sera.png",
    teo: "/portraits/kyle.png",
    irene: "/portraits/lina.png",
    kaz: "/portraits/sera.png",
    ella: "/portraits/aria.png",
    jin: "/portraits/kyle.png",
    luka: "/portraits/leon.png",
    baekho: "/portraits/bram.png",
    aria: "/portraits/aria.png",
    leon: "/portraits/leon.png",
  };

  if (byId[unit.id]) return byId[unit.id];

  const enemySpriteKey = getEnemySpriteKey(unit);
  if (enemySpriteKey && enemySpriteKey !== "wolf") return `/sprites/enemies/${enemySpriteKey}.png`;

  if (unit.type === "boss") {
    if (unit.name?.includes("가론")) return "/portraits/garon.png";
    if (unit.name?.includes("마도사") || unit.name?.includes("마녀") || unit.name?.includes("사제")) return "/portraits/mage.png";
    return "/portraits/shield.png";
  }

  if (unit.name?.includes("궁병") || unit.name?.includes("투창") || unit.name?.includes("창병")) return "/portraits/archer.png";
  if (unit.name?.includes("마도사") || unit.name?.includes("마녀") || unit.name?.includes("사제")) return "/portraits/mage.png";
  if (unit.name?.includes("방패") || unit.name?.includes("수비병")) return "/portraits/shield.png";
  if (unit.name?.includes("암살자")) return "/portraits/archer.png";
  if (unit.name?.includes("늑대")) return "/sprites/enemies/wolf.png";

  return "/portraits/bandit.png";
}


function getCutsceneUnitSprite(unit) {
  if (!unit) return null;

  const text = `${unit.id || ""} ${unit.name || ""} ${unit.skill || ""}`;
  const battleById = {
    hero: "/sprites/units/kyle.png",
    bram: "/sprites/units/bram.png",
    lina: "/sprites/units/lina.png",
    aria: "/sprites/units/aria.png",
    leon: "/sprites/units/leon.png",
    sera: "/portraits/sera.png",
    noah: "/sprites/units/aria.png",
    yuna: "/sprites/units/aria.png",
    rakan: "/sprites/units/bram.png",
    miho: "/portraits/sera.png",
    teo: "/sprites/units/kyle.png",
    irene: "/sprites/units/lina.png",
    kaz: "/portraits/sera.png",
    ella: "/sprites/units/aria.png",
    jin: "/sprites/units/kyle.png",
    luka: "/sprites/units/leon.png",
    baekho: "/sprites/units/bram.png",
  };

  if (battleById[unit.id]) return battleById[unit.id];

  const enemySpriteKey = getEnemySpriteKey(unit);
  if (enemySpriteKey && enemySpriteKey !== "wolf") return `/sprites/enemies/${enemySpriteKey}.png`;

  if (text.includes("늑대") || text.includes("야수") || text.includes("포효")) {
    return "/sprites/classic/units/wolf.png";
  }

  if (text.includes("암살자")) {
    return "/sprites/enemies/bandit.png";
  }

  if (unit.type === "boss") {
    if (unit.name?.includes("가론")) return "/sprites/enemies/garon.png";
    if (unit.name?.includes("마도사") || unit.name?.includes("마녀") || unit.name?.includes("사제")) return "/sprites/enemies/boss_mage.png";
    return "/sprites/enemies/boss_knight.png";
  }

  if (unit.name?.includes("궁병") || unit.name?.includes("투창") || unit.name?.includes("창병")) return "/sprites/enemies/archer.png";
  if (unit.name?.includes("마도사") || unit.name?.includes("마녀") || unit.name?.includes("사제")) return "/sprites/enemies/mage.png";
  if (unit.name?.includes("방패") || unit.name?.includes("수비병")) return "/sprites/enemies/shield.png";

  return "/sprites/enemies/bandit.png";
}


function getStageMapArt(stage) {
  const id = stage?.id || 1;
  return `/maps/stage_${id}.jpg`;
}

function getClassicBattleMapArt(stage) {
  const id = Math.min(30, Math.max(1, Math.floor(stage?.id || 1)));
  if (stage?.actRouteBattleMap || id <= 6) return "/maps/concept/stage_1_frontier_final.png";
  return `/maps/concept/stage_${id}_frontier_final.png`;
}

function isFinalConceptStage(stage) {
  return Boolean(stage?.finalConceptLayout || stage?.largeBattle || Math.floor(stage?.id || 0) >= 1);
}

function getTileImage(tile) {
  const images = {
    plain: "/sprites/classic/tiles/plain.png",
    forest: "/sprites/classic/tiles/forest.png",
    hill: "/sprites/classic/tiles/hill.png",
    fire: "/sprites/classic/tiles/fire.png",
    ice: "/sprites/classic/tiles/ice.png",
    fort: "/sprites/classic/tiles/fort.png",
    gate: "/sprites/classic/tiles/gate.png",
    road: "/sprites/classic/tiles/road.png",
    dark: "/sprites/classic/tiles/dark.png",
    rune: "/sprites/classic/tiles/rune.png",
    trap: "/sprites/classic/tiles/trap.png",
    swamp: "/sprites/classic/tiles/swamp.png",
    water: "/sprites/classic/tiles/water.png",
  };

  return images[tile] || images.plain;
}

function getTerrainVariantClassName(x, y) {
  return `terrain-variant-${(((x + 1) * 7 + (y + 1) * 11) % 4) + 1}`;
}

function getTerrainEdgeClassNames(map, x, y, tile) {
  const edges = [
    ["n", 0, -1],
    ["e", 1, 0],
    ["s", 0, 1],
    ["w", -1, 0],
  ];

  const neighbors = edges.map(([edge, dx, dy]) => ({
    edge,
    tile: map[y + dy]?.[x + dx],
  }));
  const sameCount = neighbors.filter((neighbor) => neighbor.tile === tile).length;
  const classes = [];

  neighbors.forEach((neighbor) => {
    if (neighbor.tile !== tile) {
      classes.push(`terrain-edge-${neighbor.edge}`);
    }

    if (neighbor.tile) {
      classes.push(`terrain-neighbor-${neighbor.edge}-${neighbor.tile}`);
    }
  });

  if (sameCount >= 3) classes.push("terrain-clustered");
  if (sameCount <= 1) classes.push("terrain-isolated");
  if (neighbors.some((neighbor) => neighbor.tile === "road") && tile !== "road") {
    classes.push("terrain-near-road");
  }
  if (neighbors.some((neighbor) => STRUCTURE_TERRAIN_TYPES.has(neighbor.tile)) && !STRUCTURE_TERRAIN_TYPES.has(tile)) {
    classes.push("terrain-near-structure");
  }
  if (neighbors.some((neighbor) => HAZARD_TERRAIN_TYPES.has(neighbor.tile)) && !HAZARD_TERRAIN_TYPES.has(tile)) {
    classes.push("terrain-near-hazard");
  }
  if (["forest", "hill", "plain"].includes(tile) && sameCount >= 2) {
    classes.push("terrain-natural-clump");
  }

  return classes.join(" ");
}

function getTerrainVisualStyle(tile, x, y) {
  const seed = ((x + 3) * 37 + (y + 5) * 53) % 101;
  const scale = 110 + (seed % 5) * 5;
  const rotate = ((seed % 7) - 3) * 2;
  const decalX = 36 + (seed % 29);
  const decalY = 35 + ((seed * 3) % 27);
  const decalScale = (0.9 + (seed % 5) * 0.035).toFixed(2);
  const detailSeed = (seed * 31 + x * 17 + y * 23) % 97;
  const detailX = 18 + (detailSeed % 63);
  const detailY = 18 + ((detailSeed * 5) % 58);
  const detailScale = (0.78 + (detailSeed % 7) * 0.035).toFixed(2);
  const accentX = 20 + ((detailSeed * 7) % 58);
  const accentY = 24 + ((detailSeed * 11) % 52);
  const accentScale = (0.72 + (detailSeed % 5) * 0.04).toFixed(2);

  return {
    "--tile-image": `url(${getTileImage(tile)})`,
    "--terrain-x": `${(seed * 17) % 100}%`,
    "--terrain-y": `${(seed * 29) % 100}%`,
    "--terrain-scale": `${scale}%`,
    "--terrain-rotate": `${rotate}deg`,
    "--decal-x": `${decalX}%`,
    "--decal-y": `${decalY}%`,
    "--decal-scale": decalScale,
    "--detail-x": `${detailX}%`,
    "--detail-y": `${detailY}%`,
    "--detail-scale": detailScale,
    "--accent-x": `${accentX}%`,
    "--accent-y": `${accentY}%`,
    "--accent-scale": accentScale,
    "--accent-rotate": `${((detailSeed % 9) - 4) * 3}deg`,
  };
}



function getSkillMotionEffectType(battleInfo, outcome) {
  if (!battleInfo) return "skill-aura";

  const skillName = String(battleInfo.attacker?.skill || "");
  const mode = battleInfo.mode;

  if (mode !== "skill") {
    if (mode === "counter") return "counter-motion";
    if (mode === "assist") return "assist-motion";
    return "attack-motion";
  }

  if (outcome?.heal || battleInfo.attacker?.skillType === "heal") return "skill-heal-cast";
  if (skillName.includes("불") || skillName.includes("화염") || skillName.includes("재") || skillName.includes("파이어")) return "skill-fire-cast";
  if (skillName.includes("얼음") || skillName.includes("빙")) return "skill-ice-cast";
  if (skillName.includes("어둠") || skillName.includes("그림자") || skillName.includes("흑") || skillName.includes("다크")) return "skill-shadow-cast";
  if (skillName.includes("저격") || skillName.includes("화살") || skillName.includes("궁")) return "skill-arrow-cast";
  if (skillName.includes("수호") || skillName.includes("방패")) return "skill-guard-cast";

  return "skill-aura";
}

function getCombatDirection(attacker, defender) {
  const dx = Math.sign((defender?.x ?? 0) - (attacker?.x ?? 0));
  const dy = Math.sign((defender?.y ?? 0) - (attacker?.y ?? 0));

  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

function getSkillMotionKey(battleInfo, outcome) {
  const skillName = String(battleInfo?.attacker?.skill || "");

  if (outcome?.heal || battleInfo?.attacker?.skillType === "heal") return "heal";
  if (skillName.includes("불") || skillName.includes("화염") || skillName.includes("재") || skillName.includes("파이어") || skillName.includes("플레임")) return "fire";
  if (skillName.includes("얼음") || skillName.includes("빙")) return "ice";
  if (skillName.includes("어둠") || skillName.includes("그림자") || skillName.includes("흑") || skillName.includes("다크") || skillName.includes("암영")) return "shadow";
  if (skillName.includes("저격") || skillName.includes("화살") || skillName.includes("궁") || skillName.includes("사격") || skillName.includes("관통")) return "arrow";
  if (skillName.includes("수호") || skillName.includes("방패") || battleInfo?.attacker?.skillType === "guard") return "guard";
  if (
    skillName.includes("돌격") ||
    skillName.includes("베기") ||
    skillName.includes("참") ||
    skillName.includes("찌르기") ||
    skillName.includes("강타")
  ) {
    return "sword";
  }

  return "aura";
}

function getUnitWeaponMotionKey(unit, battleInfo, outcome) {
  if (!unit) return "sword";
  if (battleInfo?.mode === "skill") return getSkillMotionKey(battleInfo, outcome);

  const text = `${unit.id || ""} ${unit.name || ""} ${unit.skill || ""}`;
  const staffUnitIds = new Set(["lina", "aria", "noah", "yuna", "irene", "ella"]);

  if (text.includes("늑대") || text.includes("야수") || text.includes("포효")) return "bite";
  if (outcome?.heal || unit.skillType === "heal") return "heal";
  if (text.includes("파이어") || text.includes("화염") || text.includes("불꽃") || text.includes("플레임")) return "fire";
  if (text.includes("얼음") || text.includes("빙")) return "ice";
  if (text.includes("어둠") || text.includes("그림자") || text.includes("흑") || text.includes("다크") || text.includes("암영")) return "shadow";
  if (
    staffUnitIds.has(unit.id) ||
    text.includes("마도") ||
    text.includes("마녀") ||
    text.includes("마법") ||
    text.includes("주술") ||
    text.includes("기도") ||
    text.includes("성빛") ||
    text.includes("별빛") ||
    text.includes("달빛")
  ) {
    return "aura";
  }
  if (
    text.includes("궁") ||
    text.includes("활") ||
    text.includes("사격") ||
    text.includes("저격") ||
    text.includes("관통")
  ) {
    return "arrow";
  }
  if (battleInfo?.mode === "skill" && (text.includes("방패") || text.includes("수호") || unit.id === "bram")) return "guard";
  if (!outcome?.hit) return "feint";

  return "sword";
}

function getCombatMotionDuration(battleInfo, outcome) {
  if (battleInfo?.mode === "skill") return 1560;
  if (battleInfo?.mode === "counter") return 1220;
  if (battleInfo?.mode === "assist") return 1220;
  if (!outcome?.hit) return 1040;
  return 1260;
}

function getCombatImpactDelay(battleInfo, outcome) {
  if (battleInfo?.mode === "skill") return 620;
  if (battleInfo?.mode === "counter") return 430;
  if (battleInfo?.mode === "assist") return 460;
  if (!outcome?.hit) return 360;
  return 480;
}

function isRangedCombatMotion(battleInfo) {
  if (!battleInfo?.attacker || !battleInfo?.defender) return false;

  const distance =
    Math.abs((battleInfo.attacker.x ?? 0) - (battleInfo.defender.x ?? 0)) +
    Math.abs((battleInfo.attacker.y ?? 0) - (battleInfo.defender.y ?? 0));
  const range = battleInfo.mode === "skill"
    ? battleInfo.attacker.skillRange || battleInfo.attacker.range || 1
    : battleInfo.attacker.range || 1;

  return distance > 1 || range > 1;
}

function getCombatLaunchEffectType(battleInfo, outcome) {
  if (!battleInfo) return "motion-melee-launch";

  if (battleInfo.mode === "skill") {
    const skillMotion = getSkillMotionKey(battleInfo, outcome);
    return skillMotion === "sword" ? "motion-melee-launch" : `motion-skill-${skillMotion}-launch`;
  }

  if (battleInfo.mode === "counter") return "motion-counter-launch";
  if (battleInfo.mode === "assist") return "motion-assist-launch";
  if (isRangedCombatMotion(battleInfo)) return "motion-arrow-launch";

  return "motion-melee-launch";
}

function getCombatImpactEffectType(battleInfo, outcome) {
  if (!outcome?.hit) return "motion-evade-afterimage";

  if (battleInfo?.mode === "skill") {
    const skillMotion = getSkillMotionKey(battleInfo, outcome);
    if (skillMotion === "sword") return outcome?.crit ? "motion-critical-impact" : "motion-melee-impact";
    return `motion-skill-${skillMotion}-impact`;
  }

  if (outcome?.crit) return "motion-critical-impact";
  if (battleInfo?.mode === "counter") return "motion-counter-impact";
  if (battleInfo?.mode === "assist") return "motion-assist-impact";
  if (isRangedCombatMotion(battleInfo)) return "motion-arrow-impact";

  return "motion-melee-impact";
}

function getEffectType(battle, outcome) {
  if (outcome?.heal) return "heal";
  if (!outcome?.hit) return "miss";

  const skill = battle?.attacker?.skill || "";

  if (outcome.crit) return "crit";

  if (battle?.mode === "skill") {
    if (skill.includes("파이어") || skill.includes("화염") || skill.includes("플레임")) return "fire";
    if (skill.includes("빙결") || skill.includes("얼음")) return "ice";
    if (skill.includes("폭풍") || skill.includes("파동") || skill.includes("다크")) return "shadow";
    return "magic";
  }

  if (battle?.mode === "counter") return "counter";

  return "slash";
}

function getPopupText(outcome) {
  if (!outcome?.hit) return "MISS";
  return outcome.crit ? `CRIT ${outcome.damage}` : String(outcome.damage);
}

function getPopupKind(outcome) {
  if (!outcome?.hit) return "miss";
  if (outcome.crit) return "crit";
  return "damage";
}


function getCutsceneEffectLabel(effectType) {
  const labels = {
    slash: "검격",
    crit: "치명타",
    fire: "화염",
    ice: "빙결",
    shadow: "흑야",
    magic: "마법",
    counter: "반격",
    heal: "회복",
    finish: "마무리",
    miss: "회피",
  };

  return labels[effectType] || "공격";
}

function getCutsceneEffectIcon(effectType) {
  const icons = {
    slash: "⚔",
    crit: "✦",
    fire: "🔥",
    ice: "❄",
    shadow: "◈",
    magic: "✧",
    counter: "↯",
    heal: "✚",
    finish: "★",
    miss: "◇",
  };

  return icons[effectType] || "⚔";
}


function countSeenSupportDialogues(seen) {
  if (!seen || typeof seen !== "object") return 0;

  return Object.values(seen).reduce((sum, value) => {
    return sum + (Array.isArray(value) ? value.length : 0);
  }, 0);
}

function getBestPartyUnit(party) {
  if (!Array.isArray(party) || party.length === 0) return null;

  return [...party].sort((a, b) => {
    const levelDiff = (b.level || 1) - (a.level || 1);
    if (levelDiff !== 0) return levelDiff;

    return (b.exp || 0) - (a.exp || 0);
  })[0];
}

function estimateKillCount(logs) {
  if (!Array.isArray(logs)) return 0;

  return logs.filter((log) => {
    const text = String(log || "");
    return text.includes("EXP +30") || text.includes("EXP +50");
  }).length;
}



const RELEASE_NOTES = [
  {
    title: "전투",
    items: [
      "15인 출전과 12x12 대규모 전장",
      "용의기사풍 사이드뷰 전투 컷씬",
      "속성별 스킬 이펙트, FINISH, 회복, 협공, 반격 컷씬",
      "보스 등장/2페이즈 컷씬과 4종 보스 패턴",
      "자동 전투 전략: 안전/공격/보스 집중/파밍",
    ],
  },
  {
    title: "성장",
    items: [
      "동료 합류와 30스테이지 캠페인",
      "스킬 강화, 전직, 파견, 훈련",
      "캐릭터별 패시브와 MVP 기록",
      "전투 통계와 누적 전적",
      "업적과 보상 수령",
      "일일/주간 도전과 접속 보상",
      "시즌 이벤트와 완료 보상",
      "동료/스테이지/시스템 도감",
      "지휘관 프로필과 칭호 컬렉션",
      "지휘관 공유 카드 복사",
      "프로필 프레임 커스터마이징",
      "포토 모드 / 스냅샷 화면",
      "스냅샷 갤러리와 메모 저장",
      "명예의 전당 랭킹 기록",
      "스테이지 마스터리 / S랭크 기록",
      "마스터리 별 보상 수령",
      "마스터리 재도전 플래너",
      "스테이지별 작전 메모",
      "공략 태그 / 추천 태그",
      "작전 프리셋 빠른 적용",
      "전략 기반 자동 준비",
      "출전 전략 리포트 / 위험 분석",
      "전략 리포트 복사 / 공유",
      "전략 리포트 보관함",
      "전략 보관함 검색/필터/통계",
      "전략 리포트 2개 비교",
      "보관함 전략 재적용",
      "전략 리포트 즐겨찾기",
      "전략 빠른 슬롯 1~4",
      "출전 브리핑 빠른 슬롯 적용",
      "전략 슬롯 이름 변경",
      "전략 슬롯 요약/JSON 복사",
      "전략 슬롯 JSON 가져오기",
      "v1.68.9.8.7.6.5.4.3.2 최종 출격 센터",
    ],
  },
  {
    title: "편의성",
    items: [
      "월드맵형 캠페인 화면",
      "작전 브리핑, 출전 준비도, 최종 출전 확인",
      "원클릭 전투 준비와 자동 장비 추천",
      "출전 프리셋 슬롯, 필터, 정렬",
      "수동 저장 슬롯 3개와 자동 백업",
    ],
  },
  {
    title: "출시 준비",
    items: [
      "로딩 화면과 버전 표시",
      "튜토리얼/도움말",
      "사운드 보드와 볼륨 설정",
      "모바일 UI polish",
    ],
  },
];

const FINAL_MILESTONE_NOTES = [
  {
    version: "1.36",
    title: "전략 가져오기 안정화",
    items: ["전략 슬롯 JSON 가져오기 흐름 정리", "가져온 리포트 보관함 자동 등록"],
  },
  {
    version: "1.37",
    title: "최근 성공 전략 추천",
    items: ["고점 전략/즐겨찾기/빠른 슬롯 우선 추천", "보관함 기반 재적용 강화"],
  },
  {
    version: "1.38",
    title: "실패 전략 분석",
    items: ["주의사항/낮은 점수 리포트 구분", "위험 경고와 전략 리포트 연동"],
  },
  {
    version: "1.39",
    title: "전투 편의성 마무리",
    items: ["자동 준비/자동 장비/자동 전투 전략 흐름 통합", "마스터리 재도전 플래너 연결"],
  },
  {
    version: "1.40",
    title: "전략 시스템 완료",
    items: ["작전 메모/태그/프리셋/리포트/보관함/슬롯 전체 연결", "전략 공유/가져오기 지원"],
  },
  {
    version: "1.41",
    title: "전투 재미 강화 준비",
    items: ["컷씬/FINISH/협공/반격/보스 페이즈 정리", "전투 연출과 사운드 점검"],
  },
  {
    version: "1.42",
    title: "캐릭터 개성 정리",
    items: ["패시브/전직/스킬 강화/장비 강화 흐름 점검", "동료 도감 연결"],
  },
  {
    version: "1.43",
    title: "성장 루프 보강",
    items: ["업적/도전/일일 보상/시즌 이벤트/마스터리 보상 트랙 정리"],
  },
  {
    version: "1.44",
    title: "기록 시스템 정리",
    items: ["기록실/명예의 전당/프로필/칭호/프레임/공유 카드 연결"],
  },
  {
    version: "1.45",
    title: "콘텐츠 회수 구조",
    items: ["도감/갤러리/스냅샷/포토 모드/전략 보관함 정리", "반복 플레이 동기 보강"],
  },
  {
    version: "1.46",
    title: "모바일 UI 정리",
    items: ["주요 카드 반응형 정리", "포토/전략/기록 화면 모바일 대응"],
  },
  {
    version: "1.47",
    title: "세이브 안정화 점검",
    items: ["수동 슬롯/자동 백업/마이그레이션 항목 통합", "신규 저장 필드 복구 대응"],
  },
  {
    version: "1.48",
    title: "최종 QA 루프",
    items: ["QA 체크/피드백 트래커/플레이테스트 리포트/진단 복사 연결"],
  },
  {
    version: "1.49",
    title: "출시 전 polish",
    items: ["로딩/버전/릴리즈 노트/최종 점검 화면 정리", "PWA/캐시 갱신 안내"],
  },
  {
    version: "1.50",
    title: "Release Candidate 2",
    items: ["v1.36~v1.68.9.8.7.6.5.4.3.2 통합 정리", "최종 출격 센터와 출시 체크리스트 추가"],
  },
];

function getFinalRcChecklist() {
  return [
    { id: "newGame", label: "새 게임 시작/초반 튜토리얼 확인" },
    { id: "save", label: "저장/수동 슬롯/자동 백업/복구 확인" },
    { id: "world", label: "월드맵/출전 브리핑/전략 리포트 확인" },
    { id: "battle", label: "전투/컷씬/보스/자동 위임 확인" },
    { id: "camp", label: "캠프/성장/장비/보급/파견 확인" },
    { id: "records", label: "기록/업적/도전/마스터리/명예의 전당 확인" },
    { id: "strategy", label: "전략 보관함/빠른 슬롯/가져오기/재적용 확인" },
    { id: "profile", label: "프로필/칭호/프레임/공유 카드 확인" },
    { id: "photo", label: "포토 모드/갤러리/스냅샷 확인" },
    { id: "qa", label: "QA/피드백/플레이테스트 리포트 확인" },
    { id: "pwa", label: "PWA 설치/캐시 갱신/모바일 화면 확인" },
  ];
}

function getReleaseReadinessScore({
  clearedStages,
  careerStats,
  feedbackReports,
  strategyReportArchive,
  snapshotGallery,
  claimedAchievements,
  stageMastery,
}) {
  let score = 0;
  score += Math.min(20, (clearedStages?.length || 0) * 2);
  score += Math.min(15, (careerStats?.battles || 0) * 2);
  score += Math.min(15, (claimedAchievements?.length || 0) * 3);
  score += Math.min(15, Object.keys(normalizeStageMastery(stageMastery)).length * 2);
  score += Math.min(10, (strategyReportArchive?.length || 0) * 2);
  score += Math.min(10, (snapshotGallery?.length || 0) * 2);
  score += Math.min(15, (feedbackReports?.filter((item) => item.status === "fixed").length || 0) * 3);
  return Math.max(0, Math.min(100, score));
}


function getLaunchFinalChecklist() {
  return [
    { id: "boot", label: "앱 실행 / 첫 화면 / 메뉴 이동" },
    { id: "campaign", label: "캠페인 선택 / 월드맵 / 스토리 진입" },
    { id: "deployment", label: "출전 편성 / 전략 리포트 / 빠른 슬롯" },
    { id: "battle", label: "전투 이동 / 공격 / 스킬 / 턴 종료" },
    { id: "mobile", label: "모바일 하단 액션바 / 아군 / 대상 / 순서 패널" },
    { id: "camp", label: "캠프 성장 / 장비 / 보급 / 파견" },
    { id: "records", label: "업적 / 도전 / 마스터리 / 명예의 전당" },
    { id: "save", label: "저장 점검 / 내보내기 / 복구 / 긴급 백업" },
    { id: "photo", label: "포토 모드 / 스냅샷 / 갤러리" },
    { id: "qa", label: "QA / 오류 보호 / 리포트 복사" },
    { id: "pwa", label: "PWA 설치 / 캐시 갱신 / 새로고침" },
  ];
}

function getLaunchGrade(score, checked, total) {
  const checkRate = total ? Math.round((checked / total) * 100) : 0;
  const finalScore = Math.round(score * 0.65 + checkRate * 0.35);

  if (finalScore >= 90) return { grade: "S", label: "출시 가능" };
  if (finalScore >= 75) return { grade: "A", label: "출시 후보" };
  if (finalScore >= 55) return { grade: "B", label: "추가 QA 권장" };
  return { grade: "C", label: "점검 필요" };
}


function getPostLaunchAudit({ runtimeError, feedbackReports, careerStats, saveHealthReport, releaseReadinessScore }) {
  const feedback = Array.isArray(feedbackReports) ? feedbackReports : [];
  const openBugs = feedback.filter((item) => item.type === "bug" && item.status !== "fixed").length;
  const openFeedback = feedback.filter((item) => item.status !== "fixed").length;
  const battles = careerStats?.battles || 0;
  const saveWarnings = saveHealthReport?.warnings?.length || 0;

  const warnings = [];
  if (runtimeError) warnings.push("현재 런타임 오류 리포트가 존재합니다.");
  if (openBugs > 0) warnings.push(`미해결 버그 피드백 ${openBugs}개`);
  if (saveWarnings > 0) warnings.push(`저장 상태 경고 ${saveWarnings}개`);
  if (battles < 3) warnings.push("전투 플레이테스트 횟수가 아직 적습니다.");
  if (releaseReadinessScore < 70) warnings.push("출시 준비도 점수가 낮습니다.");

  let status = "stable";
  if (warnings.length >= 3 || runtimeError) status = "danger";
  else if (warnings.length > 0) status = "watch";

  return {
    status,
    openBugs,
    openFeedback,
    saveWarnings,
    battles,
    warnings,
  };
}

function getPostLaunchStatusLabel(status) {
  return {
    stable: "안정",
    watch: "관찰 필요",
    danger: "긴급 점검",
  }[status] || "관찰 필요";
}


function getReleaseChecklist() {
  return [
    "새 게임 시작 확인",
    "이어하기/수동 슬롯 저장 확인",
    "캠페인 월드맵에서 스테이지 진입 확인",
    "출전 편성, 원클릭 준비, 자동 장비 확인",
    "전투 이동/공격/스킬/아이템/자동 위임 확인",
    "보스 2페이즈와 장판 패턴 확인",
    "승리 결과, MVP, 누적 기록 확인",
    "캠프 탭, 상점, 제련, 스킬 강화, 전직 확인",
    "모바일 세로 화면 스크롤 확인",
    "PWA 설치/새로고침 후 캐시 갱신 확인",
  ];
}

function getQaChecklist() {
  return [
    { id: "newGame", label: "새 게임 시작", area: "기본" },
    { id: "continue", label: "이어하기 / 수동 슬롯", area: "저장" },
    { id: "world", label: "월드맵 노드 진입", area: "캠페인" },
    { id: "deploy", label: "출전 편성 / 원클릭 준비", area: "출전" },
    { id: "battleMove", label: "이동 / 공격 / 스킬", area: "전투" },
    { id: "cutscene", label: "전투 컷씬 / FINISH", area: "연출" },
    { id: "boss", label: "보스 2페이즈 / 장판", area: "보스" },
    { id: "auto", label: "자동 위임 / 전략 모드", area: "자동" },
    { id: "camp", label: "캠프 탭 / 성장 / 장비", area: "캠프" },
    { id: "records", label: "MVP / 누적 기록", area: "기록" },
    { id: "pwa", label: "PWA 설치 / 캐시 갱신", area: "PWA" },
    { id: "mobile", label: "모바일 세로 스크롤", area: "UI" },
  ];
}

function createDiagnosticsReport({
  version,
  screen,
  selectedStage,
  party,
  units,
  gold,
  inventory,
  clearedStages,
  unlockedStages,
  settings,
  pwaStatus,
}) {
  return {
    version,
    screen,
    stage: selectedStage
      ? {
          id: selectedStage.id,
          title: selectedStage.title,
          map: selectedStage.map ? `${selectedStage.map[0]?.length || 0}x${selectedStage.map.length}` : "-",
        }
      : null,
    partyCount: party?.length || 0,
    unitCount: units?.length || 0,
    allyCount: units?.filter((unit) => unit.type === "ally").length || 0,
    enemyCount: units?.filter((unit) => unit.type !== "ally").length || 0,
    gold,
    inventory,
    cleared: `${clearedStages?.length || 0}`,
    unlocked: `${unlockedStages?.length || 0}`,
    settings,
    pwaStatus,
    userAgent: navigator.userAgent,
    time: new Date().toISOString(),
  };
}


const TUTORIAL_GUIDES = [
  {
    id: "deploy",
    title: "출전 편성",
    icon: "🧭",
    desc: "작전 브리핑을 확인하고 최대 15명의 동료를 편성합니다.",
    tips: [
      "탱커 2명, 힐러 1~2명, 원거리 2명 이상이면 안정적입니다.",
      "원클릭 전투 준비를 누르면 역할/장비/보급을 한 번에 정리합니다.",
      "보스전은 힐러와 수호 부적을 더 챙기는 게 좋습니다.",
    ],
  },
  {
    id: "battle",
    title: "전투 조작",
    icon: "⚔️",
    desc: "이동, 공격, 스킬, 아이템, 부대 명령으로 전투를 진행합니다.",
    tips: [
      "아군을 선택한 뒤 파란 칸으로 이동하고, 붉은 칸의 적을 공격합니다.",
      "전투 예측창에서 피해량, 명중률, 반격, 협공을 확인하세요.",
      "모바일에서는 하단 아군/대상/순서 버튼으로 필요한 패널을 하나씩 열어 확인합니다.",
      "아이템이나 턴종료를 누르면 열린 패널이 자동으로 닫혀 전장을 가리지 않습니다.",
      "시야 버튼으로 전술 타일 강조와 배경맵 아트 가시성을 전환할 수 있습니다.",
      "부대 명령의 추천 공격/자동 접근/턴 위임으로 조작 피로를 줄일 수 있습니다.",
    ],
  },
  {
    id: "terrain",
    title: "지형과 상성",
    icon: "🌲",
    desc: "지형, 병과 타입, 패시브에 따라 명중률과 피해량이 달라집니다.",
    tips: [
      "숲은 회피에 유리하고, 언덕은 원거리 명중/치명에 유리합니다.",
      "마법/룬 지형은 마법 계열에게 유리합니다.",
      "전투 예측창의 전술 보정과 패시브 항목을 확인하세요.",
    ],
  },
  {
    id: "boss",
    title: "보스전",
    icon: "👹",
    desc: "보스는 2페이즈와 장판 패턴을 사용합니다.",
    tips: [
      "보스 HP가 낮아지면 2페이즈 컷씬과 함께 패턴이 강화됩니다.",
      "위험 칸에 표시된 숫자는 다음 폭발 피해입니다.",
      "보스 집중 자동 전략을 사용하면 보스 공격 우선도가 올라갑니다.",
    ],
  },
  {
    id: "camp",
    title: "캠프 관리",
    icon: "🏕️",
    desc: "전투 사이에 동료 성장, 장비, 보급, 저장을 관리합니다.",
    tips: [
      "성장 탭에서 훈련/스킬강화/전직을 관리합니다.",
      "장비 탭에서 자동 장착과 제련을 사용할 수 있습니다.",
      "보급 탭에서 다음 전투 전 아이템을 보충하세요.",
    ],
  },
];

function getTutorialGuide(id) {
  return TUTORIAL_GUIDES.find((guide) => guide.id === id) || TUTORIAL_GUIDES[0];
}

function getBattleGuideHint({
  turn,
  selected,
  mode,
  selectedSkillCooldown,
  readyCount,
  enemyCount,
  mobileTargetPanelOpen,
  mobileAllyPanelOpen,
  mobileTurnPanelOpen,
}) {
  const safeReadyCount = Math.max(0, Number(readyCount) || 0);
  const safeEnemyCount = Math.max(0, Number(enemyCount) || 0);

  if (turn !== "ally") {
    return {
      tone: "enemy",
      title: "적 턴 관찰",
      desc: "적 행동이 끝나면 다음 아군 턴에서 위치와 공격 대상을 다시 정하세요.",
      meta: `남은 적 ${safeEnemyCount}명`,
      actionLabel: mobileTurnPanelOpen ? "순서 닫기" : "순서 보기",
      actionType: "turn",
    };
  }

  if (!selected) {
    return {
      tone: "select",
      title: "1. 아군 선택",
      desc: "맵의 아군을 누르거나 하단 아군 버튼에서 행동할 동료를 고르세요.",
      meta: `행동 가능 ${safeReadyCount}명`,
      actionLabel: mobileAllyPanelOpen ? "아군 닫기" : "아군 열기",
      actionType: "ally",
    };
  }

  if (selected.acted) {
    return {
      tone: "select",
      title: "다음 아군 선택",
      desc: `${selected.name}은 행동을 마쳤습니다. 남은 행동 가능 아군을 선택하세요.`,
      meta: `행동 가능 ${safeReadyCount}명`,
      actionLabel: mobileAllyPanelOpen ? "아군 닫기" : "아군 열기",
      actionType: "ally",
    };
  }

  if (mode === "move" && !selected.moved) {
    return {
      tone: "move",
      title: "2. 이동 위치 선택",
      desc: `${selected.name}을 파란 칸으로 이동시킨 뒤 공격, 스킬, 대기 중 하나를 결정하세요.`,
      meta: "파란 칸 이동 가능",
      actionLabel: "이동 모드",
      actionType: "move",
    };
  }

  if (mode === "skill" && selectedSkillCooldown > 0) {
    return {
      tone: "action",
      title: "스킬 재사용 대기",
      desc: `${selected.name}의 스킬은 ${selectedSkillCooldown}턴 뒤 사용할 수 있습니다. 공격이나 아이템으로 마무리하세요.`,
      meta: `쿨다운 ${selectedSkillCooldown}턴`,
      actionLabel: "공격 전환",
      actionType: "attack",
    };
  }

  if (mode === "attack" || mode === "skill") {
    return {
      tone: "target",
      title: "3. 대상 선택",
      desc: "붉은 칸의 적을 누르거나 하단 대상 버튼에서 공격 가능한 적을 확인하세요.",
      meta: mode === "skill" ? "스킬 대상 확인" : "공격 대상 확인",
      actionLabel: mobileTargetPanelOpen ? "대상 닫기" : "대상 열기",
      actionType: "target",
    };
  }

  return {
    tone: "action",
    title: "4. 행동 마무리",
    desc: `${selected.name}의 이동이 끝났습니다. 공격, 스킬, 아이템, 대기 중 하나를 선택하세요.`,
    meta: `남은 적 ${safeEnemyCount}명`,
    actionLabel: "공격 전환",
    actionType: "attack",
  };
}


const MAP_VISIBILITY_MODES = [
  {
    id: "balanced",
    label: "균형",
    desc: "전장 아트와 전술 타일을 함께 보여줍니다.",
  },
  {
    id: "art",
    label: "아트",
    desc: "배경맵 아트를 더 선명하게 보고 타일 색을 줄입니다.",
  },
  {
    id: "tactical",
    label: "전술",
    desc: "이동, 공격, 위험 타일을 가장 선명하게 강조합니다.",
  },
];

function getMapVisibilityMode(modeId) {
  return MAP_VISIBILITY_MODES.find((mode) => mode.id === modeId) || MAP_VISIBILITY_MODES[0];
}

function getNextMapVisibilityModeId(modeId) {
  const index = MAP_VISIBILITY_MODES.findIndex((mode) => mode.id === modeId);

  return MAP_VISIBILITY_MODES[(index + 1 + MAP_VISIBILITY_MODES.length) % MAP_VISIBILITY_MODES.length].id;
}


const PHOTO_THEME_OPTIONS = [
  { id: "classic", label: "클래식", desc: "기본 천수 금빛 프레임" },
  { id: "battle", label: "전투", desc: "붉은 전장 스냅샷" },
  { id: "forest", label: "숲", desc: "그림자 숲 감성" },
  { id: "royal", label: "왕좌", desc: "보스전과 프로필에 어울리는 고급 프레임" },
];

function getPhotoThemeConfig(id) {
  return PHOTO_THEME_OPTIONS.find((theme) => theme.id === id) || PHOTO_THEME_OPTIONS[0];
}

function getNextPhotoThemeId(currentId) {
  const ids = PHOTO_THEME_OPTIONS.map((theme) => theme.id);
  const index = ids.indexOf(currentId);
  return ids[(index + 1 + ids.length) % ids.length];
}

function createSnapshotEntry({ screen, selectedStage, selectedPlayerTitleName, commanderLevel, photoTheme, note = "" }) {
  return {
    id: `${Date.now()}-${Math.random()}`,
    screen,
    stageId: selectedStage?.id || null,
    stageTitle: selectedStage?.title || "",
    title:
      screen === "battle"
        ? `전투 스냅샷 · ${selectedStage?.title || "전장"}`
        : screen === "profile"
        ? `프로필 스냅샷 · ${selectedPlayerTitleName}`
        : screen === "codex"
        ? "도감 스냅샷"
        : screen === "campaign"
        ? "월드맵 스냅샷"
        : "천수 스냅샷",
    subtitle:
      screen === "profile"
        ? `Lv.${commanderLevel} · ${selectedPlayerTitleName}`
        : selectedStage?.title || "천수 기록",
    note,
    photoTheme,
    createdAt: new Date().toISOString(),
  };
}

function getSnapshotScreenLabel(screen) {
  return {
    battle: "전투",
    profile: "프로필",
    codex: "도감",
    campaign: "월드맵",
    release: "출시노트",
  }[screen] || "기록";
}


function getHallOfFameEntries({
  party,
  careerStats,
  clearedStages,
  claimedAchievements,
  snapshotGallery,
  unlockedCodexCount,
  stageMastery,
}) {
  const career = normalizeCareerStats(careerStats);
  const mvpEntries = Object.entries(career.mvpCounts || {})
    .map(([unitId, count]) => {
      const unit = (party || []).find((member) => member.id === unitId);
      return {
        id: `mvp-${unitId}`,
        type: "MVP",
        title: unit?.name || unitId,
        subtitle: `${count}회 MVP`,
        score: count * 100,
        icon: unit?.icon || "🏅",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const milestones = [
    {
      id: "campaign",
      type: "캠페인",
      title: "캠페인 진행",
      subtitle: `${clearedStages?.length || 0}/${stages.length}장 클리어`,
      score: (clearedStages?.length || 0) * 10,
      icon: "🗺️",
    },
    {
      id: "battle",
      type: "전투",
      title: "전투 기록",
      subtitle: `${career.battles || 0}전 ${career.victories || 0}승`,
      score: (career.victories || 0) * 12 + (career.battles || 0) * 2,
      icon: "⚔️",
    },
    {
      id: "damage",
      type: "전투",
      title: "최고 피해",
      subtitle: `${career.bestDamageDealt || 0} 최고 피해`,
      score: career.bestDamageDealt || 0,
      icon: "💥",
    },
    {
      id: "achievements",
      type: "수집",
      title: "업적 수집",
      subtitle: `${claimedAchievements?.length || 0}개 수령`,
      score: (claimedAchievements?.length || 0) * 30,
      icon: "🏆",
    },
    {
      id: "codex",
      type: "수집",
      title: "도감 해금",
      subtitle: `${unlockedCodexCount || 0}개 해금`,
      score: unlockedCodexCount || 0,
      icon: "📖",
    },
    {
      id: "snapshots",
      type: "기록",
      title: "스냅샷 기록",
      subtitle: `${snapshotGallery?.length || 0}개 저장`,
      score: (snapshotGallery?.length || 0) * 15,
      icon: "📸",
    },
    {
      id: "mastery",
      type: "마스터리",
      title: "스테이지 마스터리",
      subtitle: `${getMasterySummary(stageMastery).totalStars}개 별 획득`,
      score: getMasterySummary(stageMastery).totalStars * 8,
      icon: "⭐",
    },
  ];

  return [...mvpEntries, ...milestones].sort((a, b) => b.score - a.score);
}

function createHallOfFameShareText(context) {
  const entries = getHallOfFameEntries(context).slice(0, 8);
  return [
    "천수 명예의 전당",
    `캠페인: ${context.clearedStages?.length || 0}/${stages.length}`,
    `전투: ${context.careerStats?.battles || 0}회`,
    `업적: ${context.claimedAchievements?.length || 0}개`,
    "",
    ...entries.map((entry, index) => `${index + 1}. [${entry.type}] ${entry.title} - ${entry.subtitle}`),
    "",
    `빌드 v${context.version}`,
  ].join("\\n");
}

function createDefaultSettings() {
  return {
    soundOn: true,
    effectsOn: true,
    shakeOn: true,
    logLines: 6,
    difficulty: "normal",
    battleSpeed: "normal",
    cutsceneMode: "full",
    autoBattleMode: "safe",
    autoUseSkills: true,
    autoUseItems: true,
    musicOn: true,
    sfxVolume: 80,
    balancePreset: "standard",
    photoTheme: "classic",
    photoWatermark: true,
  };
}




const BATTLE_SPEED_OPTIONS = [
  {
    id: "normal",
    label: "보통",
    desc: "연출을 충분히 보여줍니다.",
    allyStepMs: 175,
    enemyStepMs: 190,
    enemyDelayMs: 700,
    stepGapMs: 35,
  },
  {
    id: "fast",
    label: "빠름",
    desc: "대규모 전투를 빠르게 진행합니다.",
    allyStepMs: 95,
    enemyStepMs: 105,
    enemyDelayMs: 350,
    stepGapMs: 18,
  },
  {
    id: "turbo",
    label: "초고속",
    desc: "파밍과 반복 전투용 속도입니다.",
    allyStepMs: 45,
    enemyStepMs: 55,
    enemyDelayMs: 140,
    stepGapMs: 8,
  },
];

function getBattleSpeedConfig(id) {
  return BATTLE_SPEED_OPTIONS.find((option) => option.id === id) || BATTLE_SPEED_OPTIONS[0];
}

function getNextBattleSpeedId(currentId) {
  const ids = BATTLE_SPEED_OPTIONS.map((option) => option.id);
  const index = ids.indexOf(currentId);
  return ids[(index + 1 + ids.length) % ids.length];
}

const CUTSCENE_OPTIONS = [
  {
    id: "full",
    label: "전체",
    desc: "만화 컷처럼 준비, 타격, 회수를 충분히 보여줍니다.",
    duration: 2860,
  },
  {
    id: "fast",
    label: "빠름",
    desc: "핵심 타격감만 남긴 짧은 전투 컷씬입니다.",
    duration: 1820,
  },
  {
    id: "off",
    label: "끄기",
    desc: "컷씬 없이 맵 이펙트만 표시합니다.",
    duration: 0,
  },
];

function getCutsceneConfig(id) {
  return CUTSCENE_OPTIONS.find((option) => option.id === id) || CUTSCENE_OPTIONS[0];
}

function getNextCutsceneModeId(currentId) {
  const ids = CUTSCENE_OPTIONS.map((option) => option.id);
  const index = ids.indexOf(currentId);
  return ids[(index + 1 + ids.length) % ids.length];
}

const AUTO_BATTLE_MODE_OPTIONS = [
  {
    id: "safe",
    label: "안전",
    desc: "생존과 회복을 우선합니다.",
  },
  {
    id: "attack",
    label: "공격",
    desc: "처치와 피해량을 우선합니다.",
  },
  {
    id: "boss",
    label: "보스 집중",
    desc: "보스와 강적을 우선 공격합니다.",
  },
  {
    id: "farm",
    label: "파밍",
    desc: "빠른 처치와 전리품 회수를 우선합니다.",
  },
];

function getAutoBattleModeConfig(id) {
  return AUTO_BATTLE_MODE_OPTIONS.find((option) => option.id === id) || AUTO_BATTLE_MODE_OPTIONS[0];
}

function getNextAutoBattleModeId(currentId) {
  const ids = AUTO_BATTLE_MODE_OPTIONS.map((option) => option.id);
  const index = ids.indexOf(currentId);
  return ids[(index + 1 + ids.length) % ids.length];
}

const DIFFICULTY_OPTIONS = [
  {
    id: "story",
    label: "스토리",
    desc: "전투보다 스토리 진행을 우선",
    hp: 0.82,
    atk: 0.82,
    def: 0.88,
    reward: 0.9,
  },
  {
    id: "normal",
    label: "보통",
    desc: "기본 밸런스",
    hp: 1,
    atk: 1,
    def: 1,
    reward: 1,
  },
  {
    id: "hard",
    label: "어려움",
    desc: "적이 단단하고 보상이 증가",
    hp: 1.18,
    atk: 1.12,
    def: 1.08,
    reward: 1.18,
  },
  {
    id: "nightmare",
    label: "흑야",
    desc: "장편 캠페인 도전용",
    hp: 1.34,
    atk: 1.22,
    def: 1.16,
    reward: 1.38,
  },
];

function getDifficultyConfig(id) {
  return DIFFICULTY_OPTIONS.find((option) => option.id === id) || DIFFICULTY_OPTIONS[1];
}

const BALANCE_PRESET_OPTIONS = [
  {
    id: "standard",
    label: "표준",
    desc: "기본 전술 밸런스",
    hp: 1,
    atk: 1,
    def: 1,
    reward: 1,
  },
  {
    id: "heroic",
    label: "영웅담",
    desc: "아군이 활약하기 쉬운 체감",
    hp: 0.92,
    atk: 0.94,
    def: 0.96,
    reward: 0.95,
  },
  {
    id: "swarm",
    label: "대군전",
    desc: "적이 조금 더 버티는 장기전",
    hp: 1.12,
    atk: 0.98,
    def: 1.04,
    reward: 1.08,
  },
  {
    id: "bossRush",
    label: "보스전",
    desc: "보스와 강적 압박 강화",
    hp: 1.08,
    atk: 1.08,
    def: 1.03,
    reward: 1.12,
  },
];

function getBalancePresetConfig(id) {
  return BALANCE_PRESET_OPTIONS.find((option) => option.id === id) || BALANCE_PRESET_OPTIONS[0];
}


function scaleDifficultyStat(value, multiplier, min = 1) {
  return Math.max(min, Math.round((value || min) * multiplier));
}

function applyDifficultyToUnit(unit, difficultyId, balancePresetId = "standard") {
  if (!unit || unit.type === "ally") return unit;

  const config = getDifficultyConfig(difficultyId);
  const balance = getBalancePresetConfig(balancePresetId);
  const appliedId = `${config.id}:${balance.id}`;

  if (unit.difficultyApplied === appliedId) {
    return unit;
  }

  const baseMaxHp = unit.baseMaxHp ?? unit.maxHp ?? unit.hp ?? 1;
  const baseAtk = unit.baseAtkDifficulty ?? unit.atk ?? 1;
  const baseDef = unit.baseDefDifficulty ?? unit.def ?? 0;
  const bossBonus = unit.type === "boss" && balance.id === "bossRush" ? 1.10 : 1;
  const scaledMaxHp = scaleDifficultyStat(baseMaxHp, config.hp * balance.hp * bossBonus, 1);
  const scaledAtk = scaleDifficultyStat(baseAtk, config.atk * balance.atk * bossBonus, 1);
  const scaledDef = scaleDifficultyStat(baseDef, config.def * balance.def, 0);

  return {
    ...unit,
    baseMaxHp,
    baseAtkDifficulty: baseAtk,
    baseDefDifficulty: baseDef,
    maxHp: scaledMaxHp,
    hp: Math.min(scaledMaxHp, scaledDifficultyHp(unit, baseMaxHp, scaledMaxHp)),
    atk: scaledAtk,
    def: scaledDef,
    difficultyApplied: appliedId,
  };
}

function scaledDifficultyHp(unit, baseMaxHp, scaledMaxHp) {
  if (!unit || !unit.maxHp) return scaledMaxHp;

  const hpRate = Math.max(0.01, Math.min(1, (unit.hp || unit.maxHp) / unit.maxHp));

  if (unit.difficultyApplied) {
    return Math.round(scaledMaxHp * hpRate);
  }

  if ((unit.hp || unit.maxHp) >= baseMaxHp) {
    return scaledMaxHp;
  }

  return Math.round(scaledMaxHp * hpRate);
}

function applyDifficultyToUnits(units, difficultyId, balancePresetId = "standard") {
  return (units || []).map((unit) => applyDifficultyToUnit(unit, difficultyId, balancePresetId));
}

function getDifficultyRewardGold(value, difficultyId, balancePresetId = "standard") {
  const config = getDifficultyConfig(difficultyId);
  const balance = getBalancePresetConfig(balancePresetId);
  return Math.max(0, Math.round((value || 0) * config.reward * balance.reward));
}

let cheonsuAudioContext = null;

function getCheonsuAudioContext() {
  if (typeof window === "undefined") return null;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!cheonsuAudioContext) {
    cheonsuAudioContext = new AudioContextClass();
  }

  if (cheonsuAudioContext.state === "suspended") {
    cheonsuAudioContext.resume().catch(() => {});
  }

  return cheonsuAudioContext;
}

function playTone(ctx, { freq = 440, start = 0, duration = 0.08, type = "sine", gain = 0.035, detune = 0 }) {
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, now + start);
  oscillator.detune.setValueAtTime(detune, now + start);

  volume.gain.setValueAtTime(0.0001, now + start);
  volume.gain.exponentialRampToValueAtTime(gain, now + start + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

  oscillator.connect(volume);
  volume.connect(ctx.destination);

  oscillator.start(now + start);
  oscillator.stop(now + start + duration + 0.02);
}

function playCheonsuSfx(type, enabled = true, volume = 1) {
  if (!enabled) return;

  const ctx = getCheonsuAudioContext();
  if (!ctx) return;

  const presets = {
    confirm: [
      { freq: 520, start: 0, duration: 0.055, type: "triangle", gain: 0.032 },
      { freq: 780, start: 0.055, duration: 0.075, type: "triangle", gain: 0.028 },
    ],
    save: [
      { freq: 660, start: 0, duration: 0.06, type: "sine", gain: 0.026 },
      { freq: 880, start: 0.06, duration: 0.10, type: "sine", gain: 0.022 },
    ],
    start: [
      { freq: 196, start: 0, duration: 0.12, type: "sawtooth", gain: 0.022 },
      { freq: 392, start: 0.08, duration: 0.12, type: "triangle", gain: 0.025 },
      { freq: 784, start: 0.16, duration: 0.16, type: "triangle", gain: 0.022 },
    ],
    turn: [
      { freq: 330, start: 0, duration: 0.08, type: "triangle", gain: 0.022 },
      { freq: 440, start: 0.07, duration: 0.08, type: "triangle", gain: 0.020 },
    ],
    slash: [
      { freq: 220, start: 0, duration: 0.055, type: "sawtooth", gain: 0.035 },
      { freq: 110, start: 0.035, duration: 0.065, type: "square", gain: 0.020 },
    ],
    counter: [
      { freq: 180, start: 0, duration: 0.055, type: "square", gain: 0.030 },
      { freq: 360, start: 0.04, duration: 0.075, type: "triangle", gain: 0.024 },
    ],
    fire: [
      { freq: 130, start: 0, duration: 0.13, type: "sawtooth", gain: 0.027 },
      { freq: 520, start: 0.035, duration: 0.12, type: "triangle", gain: 0.024 },
      { freq: 780, start: 0.075, duration: 0.10, type: "sine", gain: 0.018 },
    ],
    ice: [
      { freq: 980, start: 0, duration: 0.075, type: "sine", gain: 0.022 },
      { freq: 1240, start: 0.055, duration: 0.10, type: "triangle", gain: 0.018 },
    ],
    magic: [
      { freq: 440, start: 0, duration: 0.08, type: "triangle", gain: 0.020 },
      { freq: 660, start: 0.05, duration: 0.10, type: "triangle", gain: 0.022 },
      { freq: 990, start: 0.11, duration: 0.11, type: "sine", gain: 0.018 },
    ],
    shadow: [
      { freq: 90, start: 0, duration: 0.15, type: "sawtooth", gain: 0.030 },
      { freq: 180, start: 0.06, duration: 0.14, type: "square", gain: 0.018 },
    ],
    crit: [
      { freq: 160, start: 0, duration: 0.055, type: "square", gain: 0.040 },
      { freq: 720, start: 0.045, duration: 0.105, type: "sawtooth", gain: 0.030 },
      { freq: 1080, start: 0.095, duration: 0.11, type: "triangle", gain: 0.024 },
    ],
    miss: [
      { freq: 260, start: 0, duration: 0.06, type: "sine", gain: 0.016, detune: -40 },
      { freq: 210, start: 0.045, duration: 0.07, type: "sine", gain: 0.014, detune: -120 },
    ],
    heal: [
      { freq: 523, start: 0, duration: 0.08, type: "sine", gain: 0.022 },
      { freq: 659, start: 0.06, duration: 0.08, type: "sine", gain: 0.021 },
      { freq: 784, start: 0.12, duration: 0.12, type: "sine", gain: 0.018 },
    ],
    guard: [
      { freq: 150, start: 0, duration: 0.08, type: "square", gain: 0.028 },
      { freq: 300, start: 0.05, duration: 0.08, type: "triangle", gain: 0.020 },
    ],
    hazard: [
      { freq: 80, start: 0, duration: 0.18, type: "sawtooth", gain: 0.036 },
      { freq: 160, start: 0.055, duration: 0.14, type: "square", gain: 0.026 },
      { freq: 60, start: 0.12, duration: 0.20, type: "sawtooth", gain: 0.030 },
    ],
    phase: [
      { freq: 70, start: 0, duration: 0.22, type: "sawtooth", gain: 0.034 },
      { freq: 140, start: 0.10, duration: 0.20, type: "square", gain: 0.028 },
      { freq: 280, start: 0.22, duration: 0.18, type: "sawtooth", gain: 0.022 },
    ],
    boss: [
      { freq: 55, start: 0, duration: 0.26, type: "sawtooth", gain: 0.038 },
      { freq: 110, start: 0.12, duration: 0.22, type: "square", gain: 0.030 },
      { freq: 220, start: 0.28, duration: 0.18, type: "triangle", gain: 0.024 },
    ],
    equip: [
      { freq: 420, start: 0, duration: 0.05, type: "triangle", gain: 0.024 },
      { freq: 630, start: 0.05, duration: 0.07, type: "triangle", gain: 0.022 },
      { freq: 315, start: 0.10, duration: 0.08, type: "sine", gain: 0.018 },
    ],
    item: [
      { freq: 560, start: 0, duration: 0.06, type: "sine", gain: 0.022 },
      { freq: 700, start: 0.06, duration: 0.08, type: "sine", gain: 0.020 },
    ],
    loot: [
      { freq: 660, start: 0, duration: 0.06, type: "triangle", gain: 0.024 },
      { freq: 990, start: 0.07, duration: 0.08, type: "triangle", gain: 0.024 },
      { freq: 1320, start: 0.15, duration: 0.12, type: "sine", gain: 0.018 },
    ],
    finish: [
      { freq: 130, start: 0, duration: 0.06, type: "square", gain: 0.040 },
      { freq: 520, start: 0.055, duration: 0.10, type: "sawtooth", gain: 0.032 },
      { freq: 1040, start: 0.14, duration: 0.16, type: "triangle", gain: 0.026 },
    ],
    levelup: [
      { freq: 523, start: 0, duration: 0.06, type: "triangle", gain: 0.024 },
      { freq: 659, start: 0.06, duration: 0.06, type: "triangle", gain: 0.024 },
      { freq: 784, start: 0.12, duration: 0.08, type: "triangle", gain: 0.024 },
      { freq: 1046, start: 0.20, duration: 0.14, type: "sine", gain: 0.020 },
    ],
    menu: [
      { freq: 392, start: 0, duration: 0.045, type: "sine", gain: 0.018 },
      { freq: 494, start: 0.045, duration: 0.055, type: "sine", gain: 0.016 },
    ],
    victory: [
      { freq: 392, start: 0, duration: 0.10, type: "triangle", gain: 0.026 },
      { freq: 523, start: 0.09, duration: 0.10, type: "triangle", gain: 0.026 },
      { freq: 784, start: 0.18, duration: 0.18, type: "triangle", gain: 0.024 },
    ],
    defeat: [
      { freq: 220, start: 0, duration: 0.12, type: "triangle", gain: 0.024 },
      { freq: 165, start: 0.10, duration: 0.14, type: "triangle", gain: 0.022 },
      { freq: 110, start: 0.22, duration: 0.22, type: "sine", gain: 0.020 },
    ],
  };

  const sequence = presets[type] || presets.confirm;
  const safeVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  sequence.forEach((tone) =>
    playTone(ctx, {
      ...tone,
      gain: (tone.gain || 0.02) * safeVolume,
    })
  );
}

function playCheonsuJingle(type, enabled = true, volume = 1) {
  if (!enabled) return;

  const ctx = getCheonsuAudioContext();
  if (!ctx) return;

  const jingles = {
    camp: [
      { freq: 196, start: 0, duration: 0.18, type: "sine", gain: 0.012 },
      { freq: 247, start: 0.18, duration: 0.18, type: "sine", gain: 0.012 },
      { freq: 294, start: 0.36, duration: 0.22, type: "sine", gain: 0.010 },
    ],
    battle: [
      { freq: 110, start: 0, duration: 0.16, type: "sawtooth", gain: 0.014 },
      { freq: 220, start: 0.12, duration: 0.16, type: "triangle", gain: 0.012 },
      { freq: 330, start: 0.24, duration: 0.18, type: "triangle", gain: 0.010 },
    ],
    world: [
      { freq: 262, start: 0, duration: 0.16, type: "sine", gain: 0.012 },
      { freq: 330, start: 0.16, duration: 0.16, type: "sine", gain: 0.012 },
      { freq: 392, start: 0.32, duration: 0.22, type: "sine", gain: 0.010 },
    ],
  };

  const safeVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  (jingles[type] || jingles.world).forEach((tone) =>
    playTone(ctx, {
      ...tone,
      gain: (tone.gain || 0.01) * safeVolume,
    })
  );
}



function getStoryPortrait(speaker) {
  const portraits = {
    카일: "/portraits/kyle.png",
    브람: "/portraits/bram.png",
    리나: "/portraits/lina.png",
    아리아: "/portraits/aria.png",
    레온: "/portraits/leon.png",
    세라: "/portraits/sera.png",
    "흑천 가론": "/portraits/garon.png",
    가론: "/portraits/garon.png",
  };

  return portraits[speaker] || "/portraits/kyle.png";
}


function getStageSpeedLimit(stage) {
  const stageId = stage?.id || 1;
  return Math.max(5, 7 + Math.floor(stageId / 2));
}



function getWorldRegionInfo(stageId) {
  const act = getActInfo(stageId);
  const regionThemes = {
    1: { name: "붉은 국경", icon: "🏕️", image: "/ui/stage-select/act-1.png", tone: "region-border", desc: "천수 기사단이 처음 집결한 국경 지대" },
    2: { name: "그림자 숲", icon: "🌲", image: "/ui/stage-select/act-2.png", tone: "region-forest", desc: "안개와 암살자가 숨어드는 검은 숲" },
    3: { name: "무너진 요새", icon: "🏰", image: "/ui/stage-select/act-3.png", tone: "region-fort", desc: "옛 왕국의 성벽과 보스가 버티는 전장" },
    4: { name: "빙결 계곡", icon: "❄️", image: "/ui/stage-select/act-4.png", tone: "region-ice", desc: "빙결과 저주가 흐르는 북부 협곡" },
    5: { name: "흑야 왕좌", icon: "🌑", image: "/ui/stage-select/act-5.png", tone: "region-dark", desc: "붉은 달 아래 최종 결전으로 향하는 땅" },
  };
  return { act, ...(regionThemes[act?.id] || regionThemes[1]) };
}

function getStageNodeClass(stage, clearedStages, unlockedStages) {
  if (clearedStages.includes(stage.id)) return "cleared";
  if (unlockedStages.includes(stage.id)) return "unlocked";
  return "locked";
}

function getStageNodeType(stage) {
  if (stage.id % 6 === 0) return "boss";
  if (stage.id % 2 === 0) return "recruit";
  if (getReinforcementRounds(stage).length > 0) return "danger";
  return "normal";
}


function getStageMissionOrder(stage) {
  const id = stage?.id || 1;
  const boss = id % 6 === 0;

  if (boss) {
    return {
      id: "bossSlayer",
      title: "적장 격파",
      desc: "보스가 쓰러진 상태로 클리어",
      reward: { gold: 420 + id * 35, potion: 1 },
      type: "보스전",
    };
  }

  if (id % 5 === 0) {
    return {
      id: "survive",
      title: "전선 유지",
      desc: "8라운드 이내, 아군 10명 이상 생존",
      reward: { gold: 280 + id * 35, potion: 1 },
      type: "생존전",
    };
  }

  if (id % 4 === 0) {
    return {
      id: "breakthrough",
      title: "돌파 작전",
      desc: "7라운드 이내 클리어",
      reward: { gold: 340 + id * 30, potion: 0 },
      type: "돌파전",
    };
  }

  if (id % 3 === 0) {
    return {
      id: "protectHero",
      title: "지휘관 보호",
      desc: "카일 HP 70% 이상 유지",
      reward: { gold: 260 + id * 30, potion: 1 },
      type: "보호전",
    };
  }

  if (id % 2 === 0) {
    return {
      id: "noItem",
      title: "보급 절약",
      desc: "회복약 보너스 목표와 함께 안정 클리어",
      reward: { gold: 220 + id * 25, potion: 1 },
      type: "보급전",
    };
  }

  return {
    id: "sweep",
    title: "소탕 작전",
    desc: "모든 적 격파",
    reward: { gold: 220 + id * 25, potion: 0 },
    type: "소탕전",
  };
}

function evaluateStageMissionOrder(stage, round, units) {
  const mission = getStageMissionOrder(stage);
  const hero = units.find((unit) => unit.id === "hero");
  const heroHpRate = hero && hero.maxHp ? hero.hp / hero.maxHp : 0;
  const aliveAllies = units.filter((unit) => unit.type === "ally" && unit.hp > 0).length;
  let met = true;

  if (mission.id === "bossSlayer") {
    met = true;
  }

  if (mission.id === "survive") {
    met = round <= 8 && aliveAllies >= Math.min(10, units.filter((unit) => unit.type === "ally").length);
  }

  if (mission.id === "breakthrough") {
    met = round <= 7;
  }

  if (mission.id === "protectHero") {
    met = heroHpRate >= 0.7;
  }

  if (mission.id === "noItem") {
    met = heroHpRate >= 0.5;
  }

  if (mission.id === "sweep") {
    met = true;
  }

  return {
    ...mission,
    met,
  };
}

function evaluateTacticalGoals(stage, round, units) {
  const hero = units.find((unit) => unit.id === "hero");
  const allies = units.filter((unit) => unit.type === "ally");
  const aliveAllies = allies.filter((unit) => unit.hp > 0).length;
  const totalAllies = allies.length;
  const heroHpRate = hero && hero.maxHp ? hero.hp / hero.maxHp : 0;
  const speedLimit = getStageSpeedLimit(stage);

  const goals = [
    {
      id: "speed",
      title: "속전속결",
      desc: `${speedLimit}라운드 이내 클리어`,
      met: round <= speedLimit,
      reward: { gold: 180 + (stage?.id || 1) * 40, potion: 0 },
    },
    {
      id: "allAlive",
      title: "전원 생존",
      desc: "출전 아군 전원 생존",
      met: aliveAllies >= totalAllies,
      reward: { gold: 0, potion: 1 },
    },
    {
      id: "heroGuard",
      title: "천수 수호",
      desc: "카일 HP 50% 이상 유지",
      met: heroHpRate >= 0.5,
      reward: { gold: 220, potion: 0 },
    },
  ];

  const missionGoal = evaluateStageMissionOrder(stage, round, units);
  goals.push({
    id: `mission-${missionGoal.id}`,
    title: missionGoal.title,
    desc: missionGoal.desc,
    met: missionGoal.met,
    reward: missionGoal.reward,
  });

  const total = goals.reduce(
    (sum, goal) => {
      if (!goal.met) return sum;

      return {
        gold: sum.gold + (goal.reward.gold || 0),
        potion: sum.potion + (goal.reward.potion || 0),
      };
    },
    { gold: 0, potion: 0 }
  );

  return { goals, total };
}

function calculateClearSummary(stage, round, units) {
  const hero = units.find((unit) => unit.id === "hero");
  const heroHpRate = hero && hero.maxHp ? hero.hp / hero.maxHp : 0;
  const aliveAllies = units.filter((unit) => unit.type === "ally" && unit.hp > 0).length;
  const totalAllies = units.filter((unit) => unit.type === "ally").length;
  const tactical = evaluateTacticalGoals(stage, round, units);

  let rank = "B";

  if (round <= 5 && heroHpRate >= 0.7 && aliveAllies >= totalAllies) {
    rank = "S";
  } else if (round <= 8 && heroHpRate >= 0.45) {
    rank = "A";
  } else if (heroHpRate < 0.25) {
    rank = "C";
  }

  return {
    stageTitle: stage?.title || "전투",
    rank,
    round,
    heroHp: hero?.hp || 0,
    heroMaxHp: hero?.maxHp || 0,
    aliveAllies,
    tacticalGoals: tactical.goals,
    missionOrder: getStageMissionOrder(stage),
    bonusReward: tactical.total,
  };
}

function getClearRankText(rank) {
  const text = {
    S: "완벽한 승리",
    A: "훌륭한 승리",
    B: "전술적 승리",
    C: "아슬아슬한 승리",
  };

  return text[rank] || text.B;
}


function getRankValue(rank) {
  return { S: 4, A: 3, B: 2, C: 1 }[rank] || 0;
}

function getRankStars(rank) {
  const value = getRankValue(rank);
  return "★".repeat(value) + "☆".repeat(Math.max(0, 4 - value));
}

function normalizeStageMastery(mastery) {
  const raw = mastery && typeof mastery === "object" && !Array.isArray(mastery) ? mastery : {};
  const result = {};

  Object.entries(raw).forEach(([stageId, value]) => {
    if (!value || typeof value !== "object") return;

    result[stageId] = {
      bestRank: typeof value.bestRank === "string" ? value.bestRank : "C",
      bestRound:
        typeof value.bestRound === "number" && Number.isFinite(value.bestRound)
          ? Math.max(1, Math.floor(value.bestRound))
          : 99,
      clears:
        typeof value.clears === "number" && Number.isFinite(value.clears)
          ? Math.max(0, Math.floor(value.clears))
          : 0,
      lastClearedAt: typeof value.lastClearedAt === "string" ? value.lastClearedAt : "",
    };
  });

  return result;
}

function updateStageMasteryRecord(stageMastery, stage, summary) {
  if (!stage || !summary) return normalizeStageMastery(stageMastery);

  const current = normalizeStageMastery(stageMastery);
  const key = String(stage.id);
  const prev = current[key];
  const nextRank = summary.rank || "C";
  const nextRound = summary.round || 99;
  const prevRankValue = getRankValue(prev?.bestRank);
  const nextRankValue = getRankValue(nextRank);
  const betterRank = nextRankValue > prevRankValue;
  const sameRankFaster = nextRankValue === prevRankValue && nextRound < (prev?.bestRound || 99);

  return {
    ...current,
    [key]: {
      bestRank: betterRank || sameRankFaster ? nextRank : prev?.bestRank || nextRank,
      bestRound: betterRank || sameRankFaster ? nextRound : prev?.bestRound || nextRound,
      clears: (prev?.clears || 0) + 1,
      lastClearedAt: new Date().toISOString(),
    },
  };
}

function getMasterySummary(stageMastery) {
  const records = Object.values(normalizeStageMastery(stageMastery));
  const mastered = records.filter((record) => record.bestRank === "S").length;
  const totalStars = records.reduce((sum, record) => sum + getRankValue(record.bestRank), 0);
  const totalClears = records.reduce((sum, record) => sum + (record.clears || 0), 0);

  return { mastered, totalStars, totalClears };
}


function getMasteryRewardMilestones() {
  return [
    { id: "stars5", title: "별빛 입문", desc: "마스터리 별 5개 달성", stars: 5, reward: { gold: 500, potion: 1 } },
    { id: "stars10", title: "전술 수련", desc: "마스터리 별 10개 달성", stars: 10, reward: { gold: 800, hiPotion: 1 } },
    { id: "stars20", title: "전장 숙련", desc: "마스터리 별 20개 달성", stars: 20, reward: { gold: 1200, powerCharm: 1 } },
    { id: "stars40", title: "천수의 전략가", desc: "마스터리 별 40개 달성", stars: 40, reward: { gold: 1800, guardCharm: 1, hiPotion: 1 } },
    { id: "sRank3", title: "완벽주의자", desc: "S랭크 3개 달성", sRanks: 3, reward: { gold: 1000, remedy: 1 } },
    { id: "sRank6", title: "무결의 지휘관", desc: "S랭크 6개 달성", sRanks: 6, reward: { gold: 1600, powerCharm: 1, guardCharm: 1 } },
  ];
}

function getMasteryRewardProgress(stageMastery, claimedMasteryRewards = []) {
  const summary = getMasterySummary(stageMastery);
  return getMasteryRewardMilestones().map((milestone) => {
    const completed =
      (milestone.stars ? summary.totalStars >= milestone.stars : true) &&
      (milestone.sRanks ? summary.mastered >= milestone.sRanks : true);
    const claimed = (claimedMasteryRewards || []).includes(milestone.id);
    return { ...milestone, completed, claimed, claimable: completed && !claimed };
  });
}

function getRewardTextGeneric(reward = {}) {
  return getAchievementRewardText(reward);
}



function normalizeStageNotes(notes) {
  const raw = notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
  const result = {};
  Object.entries(raw).forEach(([stageId, value]) => {
    if (typeof value === "string") result[stageId] = value.slice(0, 500);
  });
  return result;
}
function getDefaultStrategyNote(stage) {
  if (!stage) return "";
  const mission = getStageMissionOrder(stage);
  if (stage.id % 6 === 0) return "보스 2페이즈 장판을 피하면서 힐러 2명과 수호 부적을 준비.";
  if (mission.id === "breakthrough") return "이동력이 높은 동료와 원거리 딜러를 앞세워 빠른 라운드 클리어 목표.";
  if (mission.id === "protectHero") return "카일 HP 70% 이상 유지. 브람/힐러를 카일 주변에 배치.";
  if (mission.id === "survive") return "전열 탱커 2명 이상, 힐러 1~2명 편성. 무리한 돌진 금지.";
  return "탱커 2명, 힐러 1명, 원거리 2명 이상으로 안정 편성.";
}
function getStageNote(notes, stage) {
  const raw = normalizeStageNotes(notes);
  return raw[String(stage?.id || "")] || "";
}


const STRATEGY_TAGS = [
  { id: "tank2", label: "탱커2", desc: "전열 탱커 2명 이상" },
  { id: "healer2", label: "힐러2", desc: "힐러 2명 이상" },
  { id: "ranged", label: "원거리", desc: "원거리 화력 확보" },
  { id: "boss", label: "보스집중", desc: "보스 우선 공격" },
  { id: "hazard", label: "장판회피", desc: "위험 칸 우선 회피" },
  { id: "speed", label: "속전", desc: "빠른 라운드 클리어" },
  { id: "guard", label: "카일보호", desc: "카일 HP 유지" },
  { id: "items", label: "보급", desc: "회복약/부적 준비" },
];

function normalizeStageNoteTags(tags) {
  const raw = tags && typeof tags === "object" && !Array.isArray(tags) ? tags : {};
  const validIds = new Set(STRATEGY_TAGS.map((tag) => tag.id));
  const result = {};

  Object.entries(raw).forEach(([stageId, value]) => {
    if (!Array.isArray(value)) return;
    result[stageId] = [...new Set(value.filter((id) => validIds.has(id)))];
  });

  return result;
}

function getStageTags(tags, stage) {
  const raw = normalizeStageNoteTags(tags);
  return raw[String(stage?.id || "")] || [];
}

function getStrategyTagLabel(id) {
  return STRATEGY_TAGS.find((tag) => tag.id === id)?.label || id;
}

function getDefaultStrategyTags(stage) {
  if (!stage) return ["tank2", "healer2", "ranged"];
  const mission = getStageMissionOrder(stage);
  const result = ["tank2", "ranged"];

  if (stage.id % 6 === 0) result.push("healer2", "boss", "hazard", "items");
  if (mission.id === "breakthrough") result.push("speed");
  if (mission.id === "protectHero") result.push("guard", "healer2");
  if (mission.id === "survive") result.push("healer2", "items");

  return [...new Set(result)].slice(0, 6);
}


const STRATEGY_TAG_PRESETS = [
  {
    id: "safe",
    label: "안정 공략",
    desc: "탱커/힐러/보급 중심",
    tags: ["tank2", "healer2", "items", "guard"],
  },
  {
    id: "rush",
    label: "속전 공략",
    desc: "빠른 클리어와 원거리 압박",
    tags: ["speed", "ranged", "tank2"],
  },
  {
    id: "boss",
    label: "보스 공략",
    desc: "보스 집중과 장판 회피",
    tags: ["boss", "hazard", "healer2", "items"],
  },
  {
    id: "farm",
    label: "파밍 공략",
    desc: "안정 클리어와 보급 유지",
    tags: ["tank2", "ranged", "items"],
  },
];

function getStrategyTagPreset(id) {
  return STRATEGY_TAG_PRESETS.find((preset) => preset.id === id) || STRATEGY_TAG_PRESETS[0];
}

function getRecommendedPresetForStage(stage) {
  if (!stage) return "safe";
  const mission = getStageMissionOrder(stage);

  if (stage.id % 6 === 0) return "boss";
  if (mission.id === "breakthrough") return "rush";
  if (mission.id === "noItem") return "farm";
  return "safe";
}

function getStrategyTagsText(tags = []) {
  return tags.map(getStrategyTagLabel).join(" · ") || "태그 없음";
}


function getDeployPresetForStrategyPreset(presetId) {
  const mapping = {
    safe: "guard",
    rush: "attack",
    boss: "guard",
    farm: "balanced",
  };

  return mapping[presetId] || "balanced";
}

function getAutoBattleModeForStrategyPreset(presetId) {
  const mapping = {
    safe: "safe",
    rush: "attack",
    boss: "boss",
    farm: "farm",
  };

  return mapping[presetId] || "safe";
}

function getStrategyPresetFromTags(tags = []) {
  const tagSet = new Set(tags || []);

  if (tagSet.has("boss") || tagSet.has("hazard")) return "boss";
  if (tagSet.has("speed")) return "rush";
  if (tagSet.has("items") && tagSet.has("tank2")) return "farm";

  return "safe";
}


function getStrategyReadinessReport({ party, deployedIds, stage, stageNoteTags, inventory, gearInventory }) {
  const tags = getStageTags(stageNoteTags, stage);
  const presetId = getStrategyPresetFromTags(tags.length ? tags : getDefaultStrategyTags(stage));
  const preset = getStrategyTagPreset(presetId);
  const readiness = getDeploymentReadiness(party, deployedIds, stage);
  const enemies = getStageEnemySummary(stage, Math.max(1, deployedIds?.length || MAX_DEPLOY_COUNT));
  const supplyItems = getRecommendedSupplyItems(stage);
  const equippedCount = countEquippedUnits(party, deployedIds);
  const warnings = [];
  const strengths = [];

  if (readiness.counts.tank >= 2) strengths.push("전열 안정");
  else warnings.push("탱커 2명 이상 권장");

  if (readiness.counts.healer >= 1) strengths.push("회복 담당 확보");
  else warnings.push("힐러 없음");

  if (readiness.counts.ranged >= 2) strengths.push("원거리 화력 확보");
  else if (enemies.total >= 10) warnings.push("원거리 화력 부족");

  if (tags.includes("boss") && readiness.counts.healer < 2) warnings.push("보스 공략은 힐러 2명 권장");
  if (tags.includes("hazard")) strengths.push("장판 회피 계획 있음");
  if (tags.includes("speed")) strengths.push("속전 목표 설정");
  if (tags.includes("items") && supplyItems.some((itemId) => getItemCount(inventory, itemId) <= 0)) {
    warnings.push("추천 보급품 일부 부족");
  }

  if (equippedCount >= Math.min(deployedIds.length, 8)) strengths.push("장비 준비 양호");
  else warnings.push("장비 장착 인원 부족");

  const score =
    readiness.power -
    readiness.threatScore * 12 +
    strengths.length * 18 -
    warnings.length * 16 +
    equippedCount * 2;

  let grade = "C";
  let label = "위험";
  if (score >= 420 && warnings.length <= 1) {
    grade = "S";
    label = "완벽";
  } else if (score >= 300 && warnings.length <= 2) {
    grade = "A";
    label = "안정";
  } else if (score >= 180) {
    grade = "B";
    label = "보통";
  }

  return {
    preset,
    tags,
    readiness,
    enemies,
    equippedCount,
    strengths: strengths.slice(0, 4),
    warnings: warnings.slice(0, 5),
    score: Math.max(0, Math.round(score)),
    grade,
    label,
  };
}

function createStrategyReportText({ stage, report, note, deployedIds, party, settings }) {
  const deployedNames = (party || [])
    .filter((unit) => (deployedIds || []).includes(unit.id))
    .map((unit) => unit.name)
    .join(", ");

  return [
    "천수 출전 전략 리포트",
    `스테이지: ${stage?.title || "-"}`,
    `작전: ${getStageMissionOrder(stage).type} · ${getStageMissionOrder(stage).title}`,
    `전략: ${report?.preset?.label || "-"}`,
    `등급: ${report?.grade || "-"} (${report?.label || "-"})`,
    `전략 점수: ${report?.score || 0}`,
    `태그: ${getStrategyTagsText(report?.tags || [])}`,
    `출전: ${deployedNames || "없음"}`,
    `장비 준비: ${report?.equippedCount || 0}명`,
    `자동 전투: ${getAutoBattleModeConfig(settings?.autoBattleMode).label}`,
    "",
    "강점",
    ...(report?.strengths?.length ? report.strengths.map((item) => `- ${item}`) : ["- 없음"]),
    "",
    "주의사항",
    ...(report?.warnings?.length ? report.warnings.map((item) => `- ${item}`) : ["- 없음"]),
    "",
    "작전 메모",
    note || "-",
    "",
    `빌드 v${SAVE_VERSION}`,
  ].join("\\n");
}


function createStrategyReportArchiveEntry({ stage, report, note, deployedIds, party, settings }) {
  return {
    id: `${Date.now()}-${Math.random()}`,
    stageId: stage?.id || null,
    stageTitle: stage?.title || "",
    mission: `${getStageMissionOrder(stage).type} · ${getStageMissionOrder(stage).title}`,
    preset: report?.preset?.label || "",
    grade: report?.grade || "C",
    label: report?.label || "",
    score: report?.score || 0,
    tags: report?.tags || [],
    deployedNames: (party || [])
      .filter((unit) => (deployedIds || []).includes(unit.id))
      .map((unit) => unit.name),
    autoBattleMode: getAutoBattleModeConfig(settings?.autoBattleMode).label,
    strengths: report?.strengths || [],
    warnings: report?.warnings || [],
    note: note || "",
    createdAt: new Date().toISOString(),
  };
}

function createStrategyArchiveText(entries = []) {
  return [
    "천수 전략 리포트 보관함",
    `총 ${entries.length}개`,
    "",
    ...entries.slice(0, 20).flatMap((entry, index) => [
      `${index + 1}. ${entry.stageTitle} / ${entry.preset} / ${entry.grade} ${entry.label}`,
      `점수 ${entry.score} · 태그 ${getStrategyTagsText(entry.tags)}`,
      `출전 ${entry.deployedNames?.join(", ") || "-"}`,
      entry.note ? `메모 ${entry.note}` : "메모 -",
      "",
    ]),
    `빌드 v${SAVE_VERSION}`,
  ].join("\\n");
}

function getStrategyArchiveFilterLabel(filter) {
  return {
    all: "전체",
    favorite: "즐겨찾기",
    high: "S/A",
    warning: "주의 있음",
    boss: "보스",
    recent: "최근",
  }[filter] || "전체";
}

function filterStrategyArchive(entries = [], filter = "all", query = "", favoriteIds = []) {
  const q = String(query || "").trim().toLowerCase();
  const favoriteSet = new Set(favoriteIds || []);

  return (entries || [])
    .filter((entry) => {
      if (filter === "favorite" && !favoriteSet.has(entry.id)) return false;
      if (filter === "high" && !["S", "A"].includes(entry.grade)) return false;
      if (filter === "warning" && !(entry.warnings || []).length) return false;
      if (filter === "boss" && !(entry.tags || []).includes("boss")) return false;
      return true;
    })
    .filter((entry) => {
      if (!q) return true;
      return [
        entry.stageTitle,
        entry.mission,
        entry.preset,
        entry.grade,
        entry.label,
        entry.note,
        ...(entry.deployedNames || []),
        ...(entry.tags || []).map(getStrategyTagLabel),
      ].join(" ").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (filter === "recent") {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      return (b.score || 0) - (a.score || 0);
    });
}

function getStrategyArchiveStats(entries = [], favoriteIds = []) {
  const total = entries.length;
  const best = [...entries].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const bossCount = entries.filter((entry) => (entry.tags || []).includes("boss")).length;
  const warningCount = entries.filter((entry) => (entry.warnings || []).length).length;
  const highCount = entries.filter((entry) => ["S", "A"].includes(entry.grade)).length;
  const favoriteSet = new Set(favoriteIds || []);
  const favoriteCount = entries.filter((entry) => favoriteSet.has(entry.id)).length;

  return {
    total,
    best,
    bossCount,
    warningCount,
    highCount,
    favoriteCount,
  };
}

function compareStrategyReports(a, b) {
  if (!a || !b) return null;

  const aTags = new Set(a.tags || []);
  const bTags = new Set(b.tags || []);
  const addedTags = [...bTags].filter((tag) => !aTags.has(tag));
  const removedTags = [...aTags].filter((tag) => !bTags.has(tag));
  const scoreDiff = (b.score || 0) - (a.score || 0);
  const gradeDiff = getRankValue(b.grade) - getRankValue(a.grade);

  return {
    from: a,
    to: b,
    scoreDiff,
    gradeDiff,
    addedTags,
    removedTags,
    sameStage: a.stageId === b.stageId,
    warningDiff: (b.warnings || []).length - (a.warnings || []).length,
    strengthDiff: (b.strengths || []).length - (a.strengths || []).length,
  };
}


function getPresetIdFromLabel(label = "") {
  const found = STRATEGY_TAG_PRESETS.find((preset) => preset.label === label);
  return found?.id || "safe";
}

function getStrategyArchiveReapplySummary(entry) {
  if (!entry) return "적용할 전략 리포트가 없습니다.";
  const tags = getStrategyTagsText(entry.tags || []);
  return `${entry.stageTitle} · ${entry.preset} · ${entry.grade}등급 · ${tags}`;
}

function normalizeStrategyQuickSlots(slots) {
  const raw = slots && typeof slots === "object" && !Array.isArray(slots) ? slots : {};
  const result = {};

  [1, 2, 3, 4].forEach((slot) => {
    const value = raw[String(slot)];
    if (typeof value === "string") {
      result[String(slot)] = value;
    }
  });

  return result;
}


function normalizeStrategyQuickSlotNames(names) {
  const raw = names && typeof names === "object" && !Array.isArray(names) ? names : {};
  const result = {};

  [1, 2, 3, 4].forEach((slot) => {
    const value = raw[String(slot)];
    if (typeof value === "string") {
      result[String(slot)] = value.slice(0, 24);
    }
  });

  return result;
}

function getQuickSlotDisplayName(slot, entry, names) {
  const normalized = normalizeStrategyQuickSlotNames(names);
  return normalized[String(slot)] || entry?.preset || `전략 슬롯 ${slot}`;
}


function createQuickSlotShareText(strategyReportArchive, quickSlots, quickSlotNames) {
  const lines = ["천수 전략 빠른 슬롯"];
  const normalized = normalizeStrategyQuickSlots(quickSlots);

  [1, 2, 3, 4].forEach((slot) => {
    const entry = getStrategyQuickSlotEntry(strategyReportArchive, normalized, slot);
    const displayName = getQuickSlotDisplayName(slot, entry, quickSlotNames);

    if (entry) {
      lines.push(
        `S${slot}. ${displayName}`,
        `- 스테이지: ${entry.stageTitle}`,
        `- 전략: ${entry.preset} / ${entry.grade} / ${entry.score}`,
        `- 태그: ${getStrategyTagsText(entry.tags || [])}`,
        `- 메모: ${entry.note || "-"}`,
      );
    } else {
      lines.push(`S${slot}. 비어 있음`);
    }
  });

  lines.push(`빌드 v${SAVE_VERSION}`);
  return lines.join("\\n");
}

function getQuickSlotExportData(strategyReportArchive, quickSlots, quickSlotNames) {
  const normalized = normalizeStrategyQuickSlots(quickSlots);

  return {
    version: SAVE_VERSION,
    names: normalizeStrategyQuickSlotNames(quickSlotNames),
    slots: [1, 2, 3, 4].reduce((acc, slot) => {
      const entry = getStrategyQuickSlotEntry(strategyReportArchive, normalized, slot);
      if (entry) {
        acc[String(slot)] = entry;
      }
      return acc;
    }, {}),
  };
}


function normalizeImportedStrategySlotData(raw) {
  let data = raw;

  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!data || typeof data !== "object") return null;

  const slots = data.slots && typeof data.slots === "object" ? data.slots : {};
  const names = normalizeStrategyQuickSlotNames(data.names);
  const entries = [];
  const quickSlots = {};

  [1, 2, 3, 4].forEach((slot) => {
    const entry = slots[String(slot)];
    if (!entry || typeof entry !== "object") return;

    const id = typeof entry.id === "string" ? entry.id : `import-${Date.now()}-${slot}`;

    entries.push({
      ...entry,
      id,
      importedAt: new Date().toISOString(),
    });
    quickSlots[String(slot)] = id;
  });

  return {
    entries,
    quickSlots,
    names,
  };
}

function getStrategyQuickSlotEntry(strategyReportArchive, quickSlots, slot) {
  const normalized = normalizeStrategyQuickSlots(quickSlots);
  const id = normalized[String(slot)];
  return (strategyReportArchive || []).find((entry) => entry.id === id) || null;
}


function getMatchingQuickSlotsForStage(strategyReportArchive, quickSlots, stage) {
  return [1, 2, 3, 4]
    .map((slot) => ({
      slot,
      entry: getStrategyQuickSlotEntry(strategyReportArchive, quickSlots, slot),
    }))
    .filter(({ entry }) => entry && (!stage || entry.stageId === stage.id));
}

function getAnyQuickSlotEntries(strategyReportArchive, quickSlots) {
  return [1, 2, 3, 4]
    .map((slot) => ({
      slot,
      entry: getStrategyQuickSlotEntry(strategyReportArchive, quickSlots, slot),
    }))
    .filter(({ entry }) => entry);
}
function createStrategyCompareText(compare) {
  if (!compare) return "비교할 전략 리포트가 없습니다.";

  return [
    "천수 전략 리포트 비교",
    `기준: ${compare.from.stageTitle} / ${compare.from.preset} / ${compare.from.grade}`,
    `비교: ${compare.to.stageTitle} / ${compare.to.preset} / ${compare.to.grade}`,
    `점수 변화: ${compare.scoreDiff >= 0 ? "+" : ""}${compare.scoreDiff}`,
    `등급 변화: ${compare.gradeDiff >= 0 ? "+" : ""}${compare.gradeDiff}`,
    `추가 태그: ${getStrategyTagsText(compare.addedTags)}`,
    `제거 태그: ${getStrategyTagsText(compare.removedTags)}`,
    `주의사항 변화: ${compare.warningDiff >= 0 ? "+" : ""}${compare.warningDiff}`,
    `강점 변화: ${compare.strengthDiff >= 0 ? "+" : ""}${compare.strengthDiff}`,
    "",
    "비교 기준 메모",
    compare.from.note || "-",
    "",
    "비교 대상 메모",
    compare.to.note || "-",
    "",
    `빌드 v${SAVE_VERSION}`,
  ].join("\\n");
}


function getMasteryPlannerItems({ stages, stageMastery, clearedStages, unlockedStages }) {
  const mastery = normalizeStageMastery(stageMastery);

  return (stages || [])
    .filter((stage) => (unlockedStages || []).includes(stage.id))
    .map((stage) => {
      const record = mastery[String(stage.id)];
      const cleared = (clearedStages || []).includes(stage.id);
      const rankValue = getRankValue(record?.bestRank);
      const missingStars = Math.max(0, 4 - rankValue);
      const mission = getStageMissionOrder(stage);
      const threat = getStageThreatLevel(stage, MAX_DEPLOY_COUNT);
      let priority = 0;
      let reason = "";

      if (!cleared) {
        priority = 120 + stage.id;
        reason = "미클리어 스테이지입니다.";
      } else if (!record) {
        priority = 90 + stage.id;
        reason = "클리어 기록은 있지만 마스터리 기록이 없습니다.";
      } else if (record.bestRank !== "S") {
        priority = missingStars * 20 + Math.max(0, 10 - record.bestRound);
        reason = `${record.bestRank}랭크 기록. S랭크까지 별 ${missingStars}개 남았습니다.`;
      } else {
        priority = Math.max(1, 20 - (record.bestRound || 99));
        reason = "이미 S랭크입니다. 라운드 단축에 도전할 수 있습니다.";
      }

      return {
        stage,
        record,
        cleared,
        mission,
        threat,
        missingStars,
        priority,
        reason,
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);
}

function getMasteryPlannerSummary(stageMastery, clearedStages) {
  const summary = getMasterySummary(stageMastery);
  const clearedCount = clearedStages?.length || 0;
  const maxStars = clearedCount * 4;
  const completion = maxStars ? Math.round((summary.totalStars / maxStars) * 100) : 0;

  return {
    ...summary,
    maxStars,
    completion,
  };
}



function getStageThreatLevel(stage, deployCount = MAX_DEPLOY_COUNT) {
  if (!stage) return { level: "일반", score: 0, className: "threat-normal" };

  const previewStage = expandStageForLargeBattle(stage, deployCount);
  const enemies = (previewStage.units || []).filter((unit) => unit.type !== "ally");
  const boss = enemies.find((unit) => unit.type === "boss");
  const reinforcementCount = getReinforcementRounds(stage).length;
  const score =
    enemies.length +
    reinforcementCount * 4 +
    (boss ? 8 : 0) +
    Math.floor((stage.id || 1) / 4);

  if (score >= 34) return { level: "악몽", score, className: "threat-nightmare" };
  if (score >= 26) return { level: "위험", score, className: "threat-hard" };
  if (score >= 18) return { level: "주의", score, className: "threat-warning" };

  return { level: "일반", score, className: "threat-normal" };
}

function getStageEnemySummary(stage, deployCount = MAX_DEPLOY_COUNT) {
  if (!stage) return { total: 0, boss: null, ranged: 0, melee: 0, magic: 0 };

  const previewStage = expandStageForLargeBattle(stage, deployCount);
  const enemies = (previewStage.units || []).filter((unit) => unit.type !== "ally");
  const boss = enemies.find((unit) => unit.type === "boss");

  return {
    total: enemies.length,
    boss,
    ranged: enemies.filter((unit) => (unit.range || 1) >= 2).length,
    melee: enemies.filter((unit) => (unit.range || 1) <= 1).length,
    magic: enemies.filter((unit) =>
      String(unit.name || "").includes("마도사") ||
      String(unit.name || "").includes("사제") ||
      String(unit.skill || "").includes("플레임") ||
      String(unit.skill || "").includes("기도")
    ).length,
  };
}

function getRecommendedFormationForStage(stage) {
  if (!stage) return "balanced";

  const title = `${stage.title || ""} ${stage.desc || ""}`;
  const bossStage = stage.id % 6 === 0;

  if (bossStage || title.includes("왕좌") || title.includes("성") || title.includes("요새")) {
    return "guard";
  }

  if (title.includes("숲") || title.includes("그림자") || title.includes("시장")) {
    return "attack";
  }

  if (title.includes("항구") || title.includes("여울") || title.includes("탑")) {
    return "range";
  }

  return "balanced";
}

function getStageBriefingTips(stage) {
  if (!stage) return [];

  const text = `${stage.title || ""} ${stage.desc || ""}`;
  const tips = [];

  if (stage.id % 6 === 0) {
    tips.push("보스전입니다. 2페이즈 장판 패턴에 대비하세요.");
  }

  if (getReinforcementRounds(stage).length > 0) {
    tips.push(`증원 예고: ${getReinforcementRounds(stage).join(" / ")}라운드`);
  }

  if (text.includes("숲") || text.includes("그림자")) {
    tips.push("숲/흑야 지형이 많습니다. 암살/척후/주술 감응 동료가 유리합니다.");
  }

  if (text.includes("여울") || text.includes("항구")) {
    tips.push("여울 지형은 중장갑에게 불리합니다. 원거리 편성을 고려하세요.");
  }

  if (text.includes("탑") || text.includes("룬") || text.includes("왕좌")) {
    tips.push("마법/룬 지형이 예상됩니다. 회복과 정화약을 준비하세요.");
  }

  if (!tips.length) {
    tips.push("균형 편성으로 전열/후열/지원 역할을 고르게 배치하세요.");
  }

  return tips.slice(0, 3);
}


function getRecommendedSupplyItems(stage) {
  if (!stage) return ["potion"];

  const text = `${stage.title || ""} ${stage.desc || ""}`;
  const items = ["potion"];

  if (stage.id >= 7 || stage.id % 6 === 0) {
    items.push("hiPotion");
  }

  if (
    text.includes("탑") ||
    text.includes("룬") ||
    text.includes("흑야") ||
    text.includes("재") ||
    text.includes("빙결") ||
    text.includes("화염")
  ) {
    items.push("remedy");
  }

  if (stage.id % 6 === 0 || text.includes("왕좌") || text.includes("보스")) {
    items.push("guardCharm");
    items.push("powerCharm");
  }

  if (text.includes("시장") || text.includes("숲") || text.includes("그림자")) {
    items.push("powerCharm");
  }

  return [...new Set(items)].slice(0, 4);
}

function getSupplyNeedText(inventory, itemId) {
  const count = getItemCount(inventory, itemId);

  if (itemId === "potion") {
    return count >= 5 ? "충분" : `권장 ${Math.max(0, 5 - count)}개 추가`;
  }

  if (itemId === "hiPotion") {
    return count >= 2 ? "충분" : `권장 ${Math.max(0, 2 - count)}개 추가`;
  }

  return count >= 1 ? "보유" : "1개 이상 권장";
}


function getDeploymentRoleCounts(party, deployedIds) {
  const ids = new Set(deployedIds || []);
  const deployed = (party || []).filter((unit) => ids.has(unit.id));
  const counts = { total: deployed.length, tank: 0, healer: 0, ranged: 0, assassin: 0, fighter: 0, support: 0 };

  deployed.forEach((unit) => {
    const role = getUnitRole(unit);
    if (role === "탱커") counts.tank += 1;
    if (role === "힐러") counts.healer += 1;
    if (role === "원거리" || role === "저격") counts.ranged += 1;
    if (role === "암살") counts.assassin += 1;
    if (role === "근접") counts.fighter += 1;
    if (role === "전술") counts.support += 1;
  });

  return counts;
}

function getDeploymentPowerScore(party, deployedIds) {
  const ids = new Set(deployedIds || []);
  return (party || [])
    .filter((unit) => ids.has(unit.id))
    .reduce((sum, unit) => (
      sum +
      (unit.level || 1) * 12 +
      (unit.maxHp || unit.hp || 0) * 0.55 +
      (unit.atk || 0) * 4.4 +
      (unit.def || 0) * 3.5 +
      (unit.move || 0) * 3 +
      getSkillUpgradeLevel(unit) * 9 +
      (unit.promoted ? 30 : 0)
    ), 0);
}

function getDeploymentReadiness(party, deployedIds, stage) {
  const counts = getDeploymentRoleCounts(party, deployedIds);
  const power = Math.round(getDeploymentPowerScore(party, deployedIds));
  const threat = getStageThreatLevel(stage, Math.max(1, deployedIds?.length || MAX_DEPLOY_COUNT));
  const enemySummary = getStageEnemySummary(stage, Math.max(1, deployedIds?.length || MAX_DEPLOY_COUNT));
  const warnings = [];

  if (counts.total < 8) warnings.push("출전 인원이 적습니다.");
  if (counts.tank < 2) warnings.push("전열 탱커가 부족합니다.");
  if (counts.healer < 1) warnings.push("회복 담당이 없습니다.");
  if (counts.ranged < 2 && enemySummary.total >= 12) warnings.push("후열 원거리 화력이 부족합니다.");
  if (stage?.id % 6 === 0 && counts.healer < 2) warnings.push("보스전은 회복 담당 2명 이상을 권장합니다.");

  let grade = "C", label = "위험", className = "readiness-c";
  if (power >= threat.score * 28 && warnings.length <= 1) {
    grade = "A"; label = "안정"; className = "readiness-a";
  } else if (power >= threat.score * 21 && warnings.length <= 2) {
    grade = "B"; label = "보통"; className = "readiness-b";
  }
  if (counts.total >= 12 && counts.tank >= 2 && counts.healer >= 1 && counts.ranged >= 2 && power >= threat.score * 30) {
    grade = "S"; label = "완벽"; className = "readiness-s";
  }

  return { grade, label, className, power, threatScore: threat.score, warnings, counts };
}

function getAutoFillDeploymentIds(party, currentIds, maxCount = MAX_DEPLOY_COUNT) {
  const current = [...new Set(currentIds || [])];
  const available = party || [];
  const hasRole = (ids, predicate) => ids.some((id) => {
    const unit = available.find((member) => member.id === id);
    return unit && predicate(unit);
  });

  const addBestByRole = (ids, predicate) => {
    if (ids.length >= maxCount || hasRole(ids, predicate)) return ids;
    const candidate = available
      .filter((unit) => !ids.includes(unit.id))
      .filter(predicate)
      .sort((a, b) => {
        const scoreA = (a.level || 1) * 8 + (a.atk || 0) + (a.def || 0) + (a.maxHp || a.hp || 0) * 0.12;
        const scoreB = (b.level || 1) * 8 + (b.atk || 0) + (b.def || 0) + (b.maxHp || b.hp || 0) * 0.12;
        return scoreB - scoreA;
      })[0];
    return candidate ? [...ids, candidate.id] : ids;
  };

  let ids = current;
  if (!ids.includes("hero") && available.some((unit) => unit.id === "hero")) ids.unshift("hero");
  ids = addBestByRole(ids, (unit) => getUnitRole(unit) === "탱커");
  ids = addBestByRole(ids, (unit) => getUnitRole(unit) === "힐러");
  ids = addBestByRole(ids, (unit) => ["원거리", "저격"].includes(getUnitRole(unit)));
  ids = addBestByRole(ids, (unit) => ["근접", "암살"].includes(getUnitRole(unit)));

  const rest = available
    .filter((unit) => !ids.includes(unit.id))
    .sort((a, b) => scoreDeployUnit(b, null, "balanced") - scoreDeployUnit(a, null, "balanced"))
    .map((unit) => unit.id);

  return [...ids, ...rest].slice(0, maxCount);
}

function getDeployPresetIds(party, stage, type = "balanced", maxCount = MAX_DEPLOY_COUNT) {
  return getRecommendedDeployment(party, stage, type, maxCount);
}




function getGearScoreForUnit(unit, gear, enhanceLevel = 0) {
  if (!unit || !gear || !gear.allowed?.includes(unit.id)) return -9999;
  const role = getUnitRole(unit);
  const enhanceBonus = getGearEnhanceBonus(gear, enhanceLevel);
  const atk = (gear.atk || 0) + (enhanceBonus.atk || 0);
  const def = (gear.def || 0) + (enhanceBonus.def || 0);
  let score = atk * 10 + def * 9;
  if (role === "탱커") score += def * 10 + atk * 2;
  if (role === "힐러") score += def * 8 + atk * 2;
  if (role === "원거리" || role === "저격") score += atk * 9 + def * 2;
  if (role === "암살") score += atk * 11;
  if (role === "근접") score += atk * 7 + def * 5;
  if (role === "전술") score += atk * 5 + def * 5;
  if (gear.id === "fireStaff" && unit.skillType === "attack") score += 8;
  if (gear.id === "mageRobe" && ["힐러", "전술", "원거리"].includes(role)) score += 8;
  if (gear.id === "chainArmor" && ["탱커", "근접"].includes(role)) score += 10;
  if (gear.id === "hunterBow" && ["원거리", "저격"].includes(role)) score += 12;
  if (gear.id === "shadowDagger" && role === "암살") score += 12;
  return score;
}

function autoEquipParty(party, gearInventory, gearEnhance = {}, onlyDeployedIds = null) {
  const targetIds = onlyDeployedIds ? new Set(onlyDeployedIds) : null;
  const gearIds = [...new Set(gearInventory || [])];
  const usedBySlot = { weapon: new Set(), armor: new Set() };
  return applyEquipmentToParty((party || []).map((unit) => {
    if (unit.type !== "ally") return unit;
    if (targetIds && !targetIds.has(unit.id)) return unit;
    const nextEquipment = { ...(unit.equipment || { weapon: null, armor: null }) };
    ["weapon", "armor"].forEach((slot) => {
      const candidates = gearIds
        .map((gearId) => EQUIPMENT[gearId])
        .filter((gear) => gear && gear.slot === slot && gear.allowed.includes(unit.id))
        .filter((gear) => !usedBySlot[slot].has(gear.id))
        .sort((a, b) => getGearScoreForUnit(unit, b, getGearEnhanceLevel(gearEnhance, b.id)) - getGearScoreForUnit(unit, a, getGearEnhanceLevel(gearEnhance, a.id)));
      if (candidates[0]) {
        nextEquipment[slot] = candidates[0].id;
        usedBySlot[slot].add(candidates[0].id);
      }
    });
    return { ...unit, equipment: nextEquipment, gearEnhance: normalizeGearEnhance(gearEnhance) };
  }));
}

function countEquippedUnits(party, deployedIds = null) {
  const ids = deployedIds ? new Set(deployedIds) : null;
  return (party || []).filter((unit) => (!ids || ids.has(unit.id)) && Boolean(unit.equipment?.weapon || unit.equipment?.armor)).length;
}


function getFinalDeployWarnings(party, deployedIds, stage, inventory = {}, gearInventory = []) {
  const warnings = [];
  const readiness = getDeploymentReadiness(party, deployedIds, stage);
  const supplyItems = getRecommendedSupplyItems(stage);
  const equippedCount = countEquippedUnits(party, deployedIds);
  const counts = readiness.counts;

  if (readiness.grade === "C") warnings.push("출전 준비도가 낮습니다.");
  if (counts.total < 8) warnings.push("출전 인원이 적어 대규모 전투에서 불리합니다.");
  if (counts.tank < 2) warnings.push("탱커가 부족합니다.");
  if (counts.healer < 1) warnings.push("힐러가 없습니다.");
  if (stage?.id % 6 === 0 && counts.healer < 2) warnings.push("보스전은 힐러 2명을 권장합니다.");
  if (equippedCount < Math.min(deployedIds.length, 5)) warnings.push("장비를 장착한 출전 동료가 적습니다.");

  for (const itemId of supplyItems) {
    const count = getItemCount(inventory, itemId);
    if (itemId === "potion" && count < 3) warnings.push("회복약이 부족합니다.");
    if (itemId === "hiPotion" && count < 1) warnings.push("큰 회복약을 1개 이상 권장합니다.");
    if (itemId === "remedy" && count < 1) warnings.push("정화약을 1개 이상 권장합니다.");
    if (itemId === "guardCharm" && count < 1) warnings.push("보스전 대비 수호 부적을 권장합니다.");
  }

  return [...new Set(warnings)].slice(0, 5);
}

function getFinalDeploySummary(party, deployedIds, stage, inventory, gearInventory) {
  const readiness = getDeploymentReadiness(party, deployedIds, stage);
  const warnings = getFinalDeployWarnings(party, deployedIds, stage, inventory, gearInventory);

  return {
    readiness,
    warnings,
    canStart: deployedIds.length > 0,
    safeStart: warnings.length === 0 || readiness.grade !== "C",
  };
}


function getRecommendedSupplyPurchasePlan(stage, inventory, gold) {
  const itemIds = getRecommendedSupplyItems(stage);
  const plan = [];
  let remainingGold = gold || 0;

  const desiredCounts = {
    potion: 5,
    hiPotion: stage?.id >= 7 || stage?.id % 6 === 0 ? 2 : 1,
    remedy: 1,
    powerCharm: stage?.id % 6 === 0 ? 1 : 0,
    guardCharm: stage?.id % 6 === 0 ? 1 : 0,
  };

  itemIds.forEach((itemId) => {
    const item = ITEM_DEFS[itemId];
    if (!item) return;

    const desired = desiredCounts[itemId] ?? 1;
    const current = getItemCount(inventory, itemId);
    let need = Math.max(0, desired - current);

    while (need > 0 && remainingGold >= item.price) {
      plan.push(itemId);
      remainingGold -= item.price;
      need -= 1;
    }
  });

  return {
    items: plan,
    cost: plan.reduce((sum, itemId) => sum + (ITEM_DEFS[itemId]?.price || 0), 0),
    remainingGold,
  };
}

function getDeployFilterLabel(filter) {
  return ({ all:"전체", selected:"출전", tank:"탱커", healer:"힐러", ranged:"원거리", assassin:"암살", promoted:"전직" })[filter] || "전체";
}
function getDeploySortLabel(sort) {
  return ({ default:"기본", level:"레벨", power:"전력", role:"역할", name:"이름" })[sort] || "기본";
}
function getDeployUnitPower(unit) {
  if (!unit) return 0;
  return Math.round((unit.level||1)*12+(unit.maxHp||unit.hp||0)*0.45+(unit.atk||0)*4.3+(unit.def||0)*3.6+(unit.move||0)*2.5+getSkillUpgradeLevel(unit)*10+(unit.promoted?28:0));
}
function filterDeployUnits(party, deployedIds, filter) {
  const ids = new Set(deployedIds || []);
  return (party || []).filter((unit) => {
    const role = getUnitRole(unit);
    if (filter === "selected") return ids.has(unit.id);
    if (filter === "tank") return role === "탱커";
    if (filter === "healer") return role === "힐러";
    if (filter === "ranged") return role === "원거리" || role === "저격";
    if (filter === "assassin") return role === "암살";
    if (filter === "promoted") return Boolean(unit.promoted);
    return true;
  });
}
function sortDeployUnits(units, sort) {
  const roleOrder = { 탱커:0, 근접:1, 암살:2, 힐러:3, 원거리:4, 저격:5, 전술:6 };
  return [...(units || [])].sort((a,b) => {
    if (sort === "level") return (b.level||1)-(a.level||1) || getDeployUnitPower(b)-getDeployUnitPower(a);
    if (sort === "power") return getDeployUnitPower(b)-getDeployUnitPower(a);
    if (sort === "role") return (roleOrder[getUnitRole(a)] ?? 9) - (roleOrder[getUnitRole(b)] ?? 9);
    if (sort === "name") return String(a.name||"").localeCompare(String(b.name||""), "ko");
    if (a.id === "hero") return -1;
    if (b.id === "hero") return 1;
    return 0;
  });
}

function getRolePresetIds(party, currentIds, roleGroup, maxCount = MAX_DEPLOY_COUNT) {
  const current = [...new Set(currentIds || [])];
  const available = party || [];
  const roleMap = {
    tank: ["탱커", "근접"],
    healer: ["힐러", "전술"],
    ranged: ["원거리", "저격"],
    assassin: ["암살", "근접"],
    magic: ["원거리", "전술", "힐러"],
  };
  const roles = roleMap[roleGroup] || [];
  let ids = current;

  if (!ids.includes("hero") && available.some((unit) => unit.id === "hero")) {
    ids.unshift("hero");
  }

  const candidates = available
    .filter((unit) => !ids.includes(unit.id))
    .filter((unit) => roles.includes(getUnitRole(unit)))
    .sort((a, b) => scoreDeployUnit(b, null, "balanced") - scoreDeployUnit(a, null, "balanced"))
    .map((unit) => unit.id);

  return [...ids, ...candidates].slice(0, maxCount);
}

function getDeploySlotKey(slot) {
  return `cheonsu_deploy_preset_slot_${slot}_v1`;
}


const RECRUIT_BY_STAGE = {
  2: "leon",
  4: "sera",
  6: "noah",
  8: "yuna",
  10: "rakan",
  12: "miho",
  14: "teo",
  16: "irene",
  18: "kaz",
  20: "ella",
  22: "jin",
  24: "luka",
  26: "baekho",
};

function createRecruitAlly(id) {
  const recruits = {
    aria: { id: "aria", icon: "🕊️", name: "아리아", hp: 20, maxHp: 20, atk: 6, def: 4, move: 3, range: 1, skill: "성빛 치유", skillType: "heal", skillBonus: 0, skillRange: 3 },
    leon: { id: "leon", icon: "🏹", name: "레온", hp: 22, maxHp: 22, atk: 8, def: 4, move: 3, range: 2, skill: "관통 사격", skillType: "attack", skillBonus: 3, skillRange: 3 },
    sera: { id: "sera", icon: "🗡️", name: "세라", hp: 21, maxHp: 21, atk: 10, def: 3, move: 4, range: 1, skill: "암영 베기", skillType: "attack", skillBonus: 5, skillRange: 1 },
    noah: { id: "noah", icon: "📜", name: "노아", hp: 23, maxHp: 23, atk: 7, def: 5, move: 3, range: 2, skill: "전술 명령", skillType: "attack", skillBonus: 2, skillRange: 2 },
    yuna: { id: "yuna", icon: "🌙", name: "유나", hp: 22, maxHp: 22, atk: 8, def: 5, move: 3, range: 2, skill: "달빛 회복", skillType: "heal", skillBonus: 0, skillRange: 3 },
    rakan: { id: "rakan", icon: "🐺", name: "라칸", hp: 36, maxHp: 36, atk: 11, def: 7, move: 3, range: 1, skill: "야수 돌격", skillType: "attack", skillBonus: 4, skillRange: 1 },
    miho: { id: "miho", icon: "🦊", name: "미호", hp: 24, maxHp: 24, atk: 10, def: 4, move: 4, range: 1, skill: "환영 베기", skillType: "attack", skillBonus: 4, skillRange: 1 },
    teo: { id: "teo", icon: "⚒️", name: "테오", hp: 32, maxHp: 32, atk: 12, def: 6, move: 2, range: 1, skill: "분쇄", skillType: "attack", skillBonus: 5, skillRange: 1 },
    irene: { id: "irene", icon: "❄️", name: "아이린", hp: 23, maxHp: 23, atk: 11, def: 4, move: 3, range: 2, skill: "빙결창", skillType: "attack", skillBonus: 4, skillRange: 2 },
    kaz: { id: "kaz", icon: "🥷", name: "카즈", hp: 25, maxHp: 25, atk: 12, def: 3, move: 4, range: 1, skill: "순간참", skillType: "attack", skillBonus: 5, skillRange: 1 },
    ella: { id: "ella", icon: "🔮", name: "엘라", hp: 22, maxHp: 22, atk: 12, def: 3, move: 3, range: 2, skill: "별빛 폭발", skillType: "attack", skillBonus: 5, skillRange: 2 },
    jin: { id: "jin", icon: "🐉", name: "진", hp: 34, maxHp: 34, atk: 13, def: 7, move: 3, range: 1, skill: "용검", skillType: "attack", skillBonus: 5, skillRange: 1 },
    luka: { id: "luka", icon: "🎯", name: "루카", hp: 24, maxHp: 24, atk: 12, def: 4, move: 3, range: 3, skill: "저격", skillType: "attack", skillBonus: 5, skillRange: 4 },
    baekho: { id: "baekho", icon: "🐯", name: "백호", hp: 40, maxHp: 40, atk: 14, def: 8, move: 3, range: 1, skill: "백호 포효", skillType: "attack", skillBonus: 6, skillRange: 1 },
  };

  const base = recruits[id];

  if (!base) return null;

  return applyEquipmentStats({
    ...base,
    x: 0,
    y: 0,
    type: "ally",
    level: 1,
    exp: 0,
    moved: false,
    acted: false,
    guard: false,
    equipment: { weapon: null, armor: null },
    baseAtk: base.atk,
    baseDef: base.def,
  });
}

function getRecruitName(id) {
  return createRecruitAlly(id)?.name || "";
}

function applyRecruitProgress(party, clearedStages) {
  let nextParty = [...(party || [])];

  for (const [stageId, recruitId] of Object.entries(RECRUIT_BY_STAGE)) {
    if (!clearedStages?.includes(Number(stageId))) continue;
    if (nextParty.some((unit) => unit.id === recruitId)) continue;

    const recruit = createRecruitAlly(recruitId);
    if (recruit) nextParty.push(recruit);
  }

  return applyEquipmentToParty(nextParty);
}


function getUnitRole(unit) {
  if (!unit) return "미정";

  if (unit.skillType === "heal") return "힐러";
  if ((unit.def || 0) >= 9 || unit.id === "bram" || unit.id === "baekho") return "탱커";
  if ((unit.range || 1) >= 3 || unit.id === "luka") return "저격";
  if ((unit.range || 1) >= 2 || unit.id === "leon" || unit.id === "lina") return "원거리";
  if ((unit.move || 3) >= 4 || ["sera", "miho", "kaz"].includes(unit.id)) return "암살";
  if (["noah"].includes(unit.id)) return "전술";
  return "근접";
}

function getUnitRoleClass(unit) {
  const role = getUnitRole(unit);

  const map = {
    힐러: "role-healer",
    탱커: "role-tank",
    저격: "role-ranger",
    원거리: "role-ranger",
    암살: "role-assassin",
    전술: "role-tactician",
    근접: "role-fighter",
  };

  return map[role] || "role-fighter";
}

function scoreDeployUnit(unit, stage, type = "balanced") {
  const role = getUnitRole(unit);
  const stageText = `${stage?.title || ""} ${stage?.desc || ""} ${stage?.objective || ""}`;
  let score = 0;

  if (unit.id === "hero") score += 999;
  score += (unit.level || 1) * 7;
  score += (unit.atk || 0) * 1.4;
  score += (unit.def || 0) * 1.15;
  score += (unit.maxHp || unit.hp || 0) * 0.18;
  score += (unit.move || 3) * 2;
  score += (unit.range || 1) * 2.4;

  if (type === "balanced") {
    if (["힐러", "탱커", "원거리", "저격"].includes(role)) score += 24;
  }

  if (type === "attack") {
    score += (unit.atk || 0) * 2.2;
    if (["암살", "저격", "원거리", "근접"].includes(role)) score += 22;
  }

  if (type === "guard") {
    score += (unit.def || 0) * 2.2 + (unit.maxHp || unit.hp || 0) * 0.25;
    if (["탱커", "힐러"].includes(role)) score += 26;
  }

  if (type === "range") {
    score += (unit.range || 1) * 9;
    if (["원거리", "저격", "힐러", "전술"].includes(role)) score += 24;
  }

  if (stageText.includes("숲") || stageText.includes("암살") || stageText.includes("그림자")) {
    if (["암살", "원거리", "힐러"].includes(role)) score += 10;
  }

  if (stageText.includes("요새") || stageText.includes("성") || stageText.includes("왕좌")) {
    if (["탱커", "저격", "힐러"].includes(role)) score += 10;
  }

  if (stageText.includes("불") || stageText.includes("화염") || stageText.includes("재")) {
    if (["힐러", "원거리", "전술"].includes(role)) score += 10;
  }

  if (stageText.includes("얼음") || stageText.includes("빙결")) {
    if (["원거리", "힐러", "저격"].includes(role)) score += 10;
  }

  return score;
}

function getRecommendedDeployment(party, stage, type = "balanced", maxCount = 5) {
  const available = Array.isArray(party) ? party : [];
  const hero = available.find((unit) => unit.id === "hero");
  const others = available.filter((unit) => unit.id !== "hero");

  const selected = [];

  if (hero) selected.push(hero);

  const rolePriority = {
    balanced: ["탱커", "힐러", "원거리", "암살", "저격", "전술", "근접"],
    attack: ["암살", "저격", "원거리", "근접", "전술", "탱커", "힐러"],
    guard: ["탱커", "힐러", "전술", "원거리", "근접", "저격", "암살"],
    range: ["저격", "원거리", "힐러", "전술", "탱커", "암살", "근접"],
  }[type] || [];

  for (const role of rolePriority) {
    if (selected.length >= maxCount) break;

    const candidate = others
      .filter((unit) => !selected.some((picked) => picked.id === unit.id))
      .filter((unit) => getUnitRole(unit) === role)
      .sort((a, b) => scoreDeployUnit(b, stage, type) - scoreDeployUnit(a, stage, type))[0];

    if (candidate) selected.push(candidate);
  }

  const rest = available
    .filter((unit) => !selected.some((picked) => picked.id === unit.id))
    .sort((a, b) => scoreDeployUnit(b, stage, type) - scoreDeployUnit(a, stage, type));

  return [...selected, ...rest].slice(0, maxCount).map((unit) => unit.id);
}

function getDeployPresetLabel(type) {
  const labels = {
    balanced: "균형 편성",
    attack: "공격 편성",
    guard: "안정 편성",
    range: "원거리 편성",
  };

  return labels[type] || labels.balanced;
}

function getDeployHint(type, stage) {
  const stageName = stage?.title || "이번 전투";

  const hints = {
    balanced: `${stageName}: 탱커/힐러/원거리/딜러를 고르게 배치합니다.`,
    attack: `${stageName}: 빠른 클리어와 보스 압박을 우선합니다.`,
    guard: `${stageName}: 생존과 전술 목표 '전원 생존'을 우선합니다.`,
    range: `${stageName}: 궁수/마법/힐러 중심으로 안전 거리를 확보합니다.`,
  };

  return hints[type] || hints.balanced;
}

function getFormationPriority(unit, formation = "front") {
  const role = getUnitRole(unit);

  const orders = {
    front: {
      탱커: 0,
      근접: 1,
      암살: 2,
      전술: 3,
      원거리: 4,
      저격: 5,
      힐러: 6,
    },
    rear: {
      힐러: 0,
      저격: 1,
      원거리: 2,
      전술: 3,
      암살: 4,
      근접: 5,
      탱커: 6,
    },
    balanced: {
      탱커: 0,
      근접: 1,
      힐러: 2,
      원거리: 3,
      암살: 4,
      저격: 5,
      전술: 6,
    },
  };

  return (orders[formation] || orders.front)[role] ?? 9;
}

function sortDeploymentByFormation(party, deployedIds, formation = "front") {
  const available = (party || []).filter((unit) => deployedIds.includes(unit.id));

  return available
    .sort((a, b) => {
      const priority = getFormationPriority(a, formation) - getFormationPriority(b, formation);
      if (priority !== 0) return priority;

      const levelDiff = (b.level || 1) - (a.level || 1);
      if (levelDiff !== 0) return levelDiff;

      return (b.atk || 0) + (b.def || 0) - ((a.atk || 0) + (a.def || 0));
    })
    .map((unit) => unit.id);
}

function getFormationLabel(formation) {
  const labels = {
    front: "전열 정렬",
    rear: "후열 정렬",
    balanced: "균형 정렬",
  };

  return labels[formation] || labels.front;
}

function getSquadRole(unit) {
  const role = getUnitRole(unit);

  if (["탱커", "근접", "암살"].includes(role)) return "front";
  if (["원거리", "저격"].includes(role)) return "rear";
  if (["힐러", "전술"].includes(role)) return "support";

  return "front";
}

function getSquadRoleLabel(role) {
  const labels = {
    front: "전열",
    rear: "후열",
    support: "지원",
  };

  return labels[role] || "전열";
}

function isUnitReady(unit) {
  return unit?.type === "ally" && unit.hp > 0 && !unit.acted;
}




function waitForMove(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function getReinforcementRounds(stage) {
  const stageId = stage?.id || 1;

  if (stageId <= 2) return [];
  if (stageId <= 6) return [4];

  if (stageId % 6 === 0) return [3, 5, 7];

  return [3, 5];
}

function getReinforcementKind(stageId, round, index) {
  const kinds = ["raider", "archer", "mage", "lancer", "assassin", "shield", "priest"];
  return kinds[(stageId + round + index) % kinds.length];
}

function createReinforcementUnit(kind, stage, round, index, x, y) {
  const stageId = stage?.id || 1;
  const power = Math.max(0, stageId - 4);
  const id = `reinforce-${stageId}-${round}-${index}`;

  const templates = {
    raider: {
      icon: "🪓",
      name: "증원 약탈병",
      aiType: "aggressive",
      hp: 22,
      atk: 9,
      def: 4,
      move: 2,
      range: 1,
      skill: "광폭참",
      skillBonus: 3,
      skillRange: 1,
    },
    archer: {
      icon: "🏹",
      name: "증원 궁병",
      aiType: "archer",
      hp: 20,
      atk: 9,
      def: 3,
      move: 2,
      range: 3,
      skill: "정밀사격",
      skillBonus: 2,
      skillRange: 3,
    },
    mage: {
      icon: "🔥",
      name: "증원 마도사",
      aiType: "archer",
      hp: 19,
      atk: 11,
      def: 3,
      move: 2,
      range: 2,
      skill: "다크 플레임",
      skillBonus: 4,
      skillRange: 2,
    },
    lancer: {
      icon: "🔱",
      name: "증원 창병",
      aiType: "aggressive",
      hp: 24,
      atk: 10,
      def: 5,
      move: 2,
      range: 2,
      skill: "긴 창 찌르기",
      skillBonus: 2,
      skillRange: 2,
    },
    assassin: {
      icon: "🗡️",
      name: "증원 암살자",
      aiType: "assassin",
      hp: 20,
      atk: 11,
      def: 3,
      move: 4,
      range: 1,
      skill: "그림자 베기",
      skillBonus: 4,
      skillRange: 1,
    },
    shield: {
      icon: "🛡️",
      name: "증원 방패병",
      aiType: "aggressive",
      hp: 30,
      atk: 8,
      def: 10,
      move: 1,
      range: 1,
      skill: "철벽 강타",
      skillBonus: 2,
      skillRange: 1,
    },
    priest: {
      icon: "🔮",
      name: "증원 사제",
      aiType: "archer",
      hp: 22,
      atk: 10,
      def: 5,
      move: 2,
      range: 2,
      skill: "암흑 기도",
      skillBonus: 3,
      skillRange: 2,
    },
  };

  const template = templates[kind] || templates.raider;
  const hp = template.hp + Math.floor(power * 1.15);
  const atk = template.atk + Math.floor(power / 3);
  const def = template.def + Math.floor(power / 5);

  return {
    id,
    x,
    y,
    type: "enemy",
    icon: template.icon,
    name: template.name,
    aiType: template.aiType,
    hp,
    maxHp: hp,
    atk,
    def,
    move: template.move,
    range: template.range,
    skill: template.skill,
    skillType: "attack",
    skillBonus: template.skillBonus + Math.floor(power / 6),
    skillRange: template.skillRange,
    moved: false,
    acted: false,
    guard: false,
    isReinforcement: true,
  };
}

function getReinforcementSpawnPositions(activeMap) {
  const height = activeMap?.length || 8;
  const width = activeMap?.[0]?.length || 8;

  return [
    { x: width - 1, y: 0 },
    { x: width - 2, y: 0 },
    { x: width - 1, y: 1 },
    { x: width - 3, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: width - 1, y: 2 },
    { x: 0, y: 1 },
  ].filter((pos) => pos.x >= 0 && pos.y >= 0 && pos.x < width && pos.y < height);
}

function createStageReinforcements(stage, nextRound, units, activeMap) {
  const stageId = stage?.id || 1;
  const rounds = getReinforcementRounds(stage);

  if (!rounds.includes(nextRound)) {
    return { units, messages: [], spawned: [] };
  }

  const alreadySpawned = units.some((unit) =>
    String(unit.id || "").startsWith(`reinforce-${stageId}-${nextRound}-`)
  );

  if (alreadySpawned) {
    return { units, messages: [], spawned: [] };
  }

  const occupied = new Set(units.map((unit) => `${unit.x},${unit.y}`));
  const positions = getReinforcementSpawnPositions(activeMap);
  const bossWave = stageId % 6 === 0;
  const count = bossWave && nextRound >= 5 ? 3 : nextRound >= 5 ? 2 : 1;
  const spawned = [];

  for (let index = 0; index < count; index += 1) {
    const pos = positions.find((candidate) => !occupied.has(`${candidate.x},${candidate.y}`));

    if (!pos) break;

    const kind = getReinforcementKind(stageId, nextRound, index);
    const unit = createReinforcementUnit(kind, stage, nextRound, index + 1, pos.x, pos.y);

    spawned.push(unit);
    occupied.add(`${pos.x},${pos.y}`);
  }

  if (spawned.length === 0) {
    return { units, messages: [], spawned: [] };
  }

  const names = spawned.map((unit) => unit.name).join(", ");

  return {
    units: [...units, ...spawned],
    messages: [`🚨 적 증원 도착! ${names}`],
    spawned,
  };
}


function getPromotionTitle(unit) {
  const titles = {
    hero: "천룡기사",
    bram: "호국기사",
    lina: "주술대사",
    aria: "성무녀",
    leon: "저격수",
    sera: "암영자",
    noah: "군략가",
    yuna: "월광무녀",
    rakan: "야왕",
    miho: "환영검사",
    teo: "파성장인",
    irene: "빙결현자",
    kaz: "섬광닌자",
    ella: "별빛술사",
    jin: "용검성",
    luka: "천리안",
    baekho: "백호장군",
  };

  return titles[unit?.id] || "상급 병과";
}

function getPromotionCost(unit) {
  const level = unit?.level || 1;
  return 900 + Math.max(0, level - 3) * 120;
}

function canPromoteUnit(unit, gold) {
  if (!unit) return { ok: false, reason: "동료가 없습니다." };
  if (unit.promoted) return { ok: false, reason: "이미 전직했습니다." };
  if ((unit.level || 1) < 3) return { ok: false, reason: "Lv.3 이상 필요" };
  if (gold < getPromotionCost(unit)) return { ok: false, reason: "골드 부족" };

  return { ok: true, reason: "전직 가능" };
}

function promoteAllyUnit(unit) {
  if (!unit || unit.promoted) return unit;

  const baseAtk = unit.baseAtk ?? unit.atk ?? 1;
  const baseDef = unit.baseDef ?? unit.def ?? 0;

  return applyEquipmentStats({
    ...unit,
    promoted: true,
    classTitle: getPromotionTitle(unit),
    maxHp: (unit.maxHp || unit.hp || 1) + 5,
    hp: Math.min((unit.maxHp || unit.hp || 1) + 5, (unit.hp || unit.maxHp || 1) + 5),
    baseAtk: baseAtk + 2,
    baseDef: baseDef + 2,
    skillBonus: (unit.skillBonus || 0) + 1,
    skillCooldown: 0,
  });
}

function getUnitDisplayClass(unit) {
  if (!unit) return "";
  return unit.promoted ? unit.classTitle || getPromotionTitle(unit) : "기본 병과";
}


const ITEM_DEFS = {
  potion: {
    id: "potion",
    name: "회복약",
    price: 150,
    type: "heal",
    power: 10,
    desc: "HP 10 회복",
  },
  hiPotion: {
    id: "hiPotion",
    name: "큰 회복약",
    price: 380,
    type: "heal",
    power: 22,
    desc: "HP 22 회복",
  },
  remedy: {
    id: "remedy",
    name: "정화약",
    price: 260,
    type: "cleanse",
    power: 0,
    desc: "상태이상 전부 제거",
  },
  powerCharm: {
    id: "powerCharm",
    name: "공격 부적",
    price: 420,
    type: "power",
    power: 2,
    desc: "이번 전투 동안 공격 +2",
  },
  guardCharm: {
    id: "guardCharm",
    name: "수호 부적",
    price: 420,
    type: "guard",
    power: 2,
    desc: "이번 전투 동안 방어 +2 / 수호",
  },
};

function createDefaultInventory() {
  return {
    potion: 3,
    hiPotion: 1,
    remedy: 1,
    powerCharm: 0,
    guardCharm: 0,
  };
}

function normalizeBattleInventory(inventory) {
  const defaults = createDefaultInventory();
  const raw = inventory && typeof inventory === "object" ? inventory : {};

  return Object.fromEntries(
    Object.keys(defaults).map((key) => [
      key,
      typeof raw[key] === "number" && Number.isFinite(raw[key])
        ? Math.max(0, raw[key])
        : defaults[key],
    ])
  );
}

function getItemCount(inventory, itemId) {
  const raw = inventory && typeof inventory === "object" ? inventory : {};
  const count = raw[itemId];

  return typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0;
}

function getTotalItemCount(inventory) {
  return Object.keys(ITEM_DEFS).reduce((sum, key) => sum + getItemCount(inventory, key), 0);
}


function createEmptyLoot() {
  return {
    gold: 0,
    items: {},
    gear: [],
  };
}

function isLootEmpty(loot) {
  if (!loot) return true;

  return (
    !(loot.gold > 0) &&
    Object.values(loot.items || {}).every((count) => !count) &&
    !(loot.gear || []).length
  );
}

function mergeLoot(base, addition) {
  const result = {
    gold: (base?.gold || 0) + (addition?.gold || 0),
    items: { ...(base?.items || {}) },
    gear: [...(base?.gear || [])],
  };

  for (const [itemId, count] of Object.entries(addition?.items || {})) {
    result.items[itemId] = (result.items[itemId] || 0) + count;
  }

  for (const gearId of addition?.gear || []) {
    if (!result.gear.includes(gearId)) {
      result.gear.push(gearId);
    }
  }

  return result;
}

function addLootItem(loot, itemId, count = 1) {
  return {
    ...loot,
    items: {
      ...(loot.items || {}),
      [itemId]: ((loot.items || {})[itemId] || 0) + count,
    },
  };
}

function addLootGear(loot, gearId) {
  if (!gearId) return loot;

  return {
    ...loot,
    gear: [...new Set([...(loot.gear || []), gearId])],
  };
}

function formatLoot(loot) {
  if (isLootEmpty(loot)) return "";

  const parts = [];

  if (loot.gold > 0) {
    parts.push(`${loot.gold}G`);
  }

  for (const [itemId, count] of Object.entries(loot.items || {})) {
    if (!count) continue;

    parts.push(`${ITEM_DEFS[itemId]?.name || itemId} x${count}`);
  }

  for (const gearId of loot.gear || []) {
    parts.push(EQUIPMENT[gearId]?.name || gearId);
  }

  return parts.join(", ");
}

function normalizeLoot(loot) {
  if (!loot || typeof loot !== "object") return createEmptyLoot();

  return {
    gold:
      typeof loot.gold === "number" && Number.isFinite(loot.gold)
        ? Math.max(0, loot.gold)
        : 0,
    items:
      loot.items && typeof loot.items === "object" && !Array.isArray(loot.items)
        ? Object.fromEntries(
            Object.entries(loot.items)
              .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
              .map(([key, value]) => [key, Math.max(0, value)])
          )
        : {},
    gear: Array.isArray(loot.gear)
      ? loot.gear.filter((gearId) => typeof gearId === "string")
      : [],
  };
}

function rollEnemyLoot(enemy, stage, difficultyId = "normal") {
  if (!enemy || enemy.type === "ally") return createEmptyLoot();

  const stageId = stage?.id || 1;
  const difficultyBonus = difficultyId === "nightmare" ? 0.12 : difficultyId === "hard" ? 0.06 : 0;
  const bossBonus = enemy.type === "boss" ? 0.75 : 0;
  const reinforcementPenalty = enemy.isReinforcement ? -0.09 : 0;
  const baseChance = 0.22 + Math.min(0.16, stageId * 0.004) + bossBonus + difficultyBonus + reinforcementPenalty;
  const dropChance = Math.max(0.08, Math.min(0.95, baseChance));
  const loot = createEmptyLoot();

  if (Math.random() > dropChance) {
    return loot;
  }

  const goldBase = enemy.type === "boss" ? 120 + stageId * 18 : 25 + stageId * 5;
  const goldVariance = enemy.type === "boss" ? 80 : 25;
  loot.gold = goldBase + Math.floor(Math.random() * goldVariance);

  const itemRoll = Math.random();

  if (enemy.type === "boss") {
    if (itemRoll < 0.30) {
      return addLootItem(loot, "hiPotion", 1);
    }

    if (itemRoll < 0.55) {
      return addLootItem(loot, "remedy", 1);
    }

    if (itemRoll < 0.76) {
      return addLootItem(loot, "powerCharm", 1);
    }

    if (itemRoll < 0.92) {
      return addLootItem(loot, "guardCharm", 1);
    }

    const bossGear = stageId % 4 === 0 ? "chainArmor" : stageId % 3 === 0 ? "shadowDagger" : "hunterBow";
    return addLootGear(loot, bossGear);
  }

  if (String(enemy.name || "").includes("사제") || String(enemy.name || "").includes("마도사")) {
    return addLootItem(loot, itemRoll < 0.55 ? "remedy" : "hiPotion", 1);
  }

  if (String(enemy.name || "").includes("궁병") || String(enemy.name || "").includes("저격")) {
    return addLootItem(loot, itemRoll < 0.5 ? "powerCharm" : "potion", 1);
  }

  if (String(enemy.name || "").includes("방패") || String(enemy.name || "").includes("수비")) {
    return addLootItem(loot, itemRoll < 0.5 ? "guardCharm" : "potion", 1);
  }

  return addLootItem(loot, itemRoll < 0.68 ? "potion" : "hiPotion", 1);
}


const MAX_GEAR_ENHANCE = 5;

function normalizeGearEnhance(enhance) {
  if (!enhance || typeof enhance !== "object" || Array.isArray(enhance)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(enhance)
      .filter(([gearId, level]) => EQUIPMENT[gearId] && typeof level === "number" && Number.isFinite(level))
      .map(([gearId, level]) => [gearId, Math.max(0, Math.min(MAX_GEAR_ENHANCE, Math.floor(level)))])
  );
}

function getGearEnhanceLevel(enhance, gearId) {
  const raw = normalizeGearEnhance(enhance)[gearId] || 0;
  return Math.max(0, Math.min(MAX_GEAR_ENHANCE, raw));
}

function getGearEnhanceCost(gearId, level) {
  const gear = EQUIPMENT[gearId];

  if (!gear) return 999999;

  const nextLevel = level + 1;
  const slotCost = gear.slot === "weapon" ? 260 : 220;
  const rarityCost =
    gear.id === "shadowDagger" || gear.id === "hunterBow" || gear.id === "fireStaff"
      ? 80
      : 0;

  return slotCost * nextLevel + rarityCost * nextLevel;
}

function getGearEnhanceText(gear, level) {
  if (!gear) return "";

  const bonus = getGearEnhanceBonus(gear, level);

  const parts = [];

  if (bonus.atk) parts.push(`공격 +${bonus.atk}`);
  if (bonus.def) parts.push(`방어 +${bonus.def}`);

  return parts.length ? parts.join(" / ") : "추가 보너스 없음";
}


const MAX_SKILL_LEVEL = 5;

function getSkillUpgradeLevel(unit) {
  return Math.max(0, Math.min(MAX_SKILL_LEVEL, unit?.skillLevel || 0));
}

function getSkillBaseBonus(unit) {
  return unit?.baseSkillBonus ?? unit?.skillBonus ?? 0;
}

function getSkillUpgradeCost(unit) {
  const level = getSkillUpgradeLevel(unit);
  const promotedAdd = unit?.promoted ? 140 : 0;
  return 520 + level * 310 + promotedAdd;
}

function getSkillUpgradeEffectText(unit, nextLevel = getSkillUpgradeLevel(unit)) {
  if (!unit) return "";

  const level = Math.max(0, Math.min(MAX_SKILL_LEVEL, nextLevel));

  if (unit.skillType === "heal") {
    return `회복량 +${level * 3} / 대상 ${getHealTargetCount(unit)}명${level >= 4 ? " / 쿨다운 -1" : ""}`;
  }

  if (unit.skillType === "guard") {
    return `수호 강화 +${level}${level >= 4 ? " / 쿨다운 -1" : ""}`;
  }

  return `스킬 위력 +${level}${getSkillAreaRadius(unit) ? ` / ${getAreaSkillLabel(unit)}` : ""}${level >= 4 ? " / 쿨다운 -1" : ""}`;
}

function upgradeSkillUnit(unit) {
  if (!unit) return unit;

  const level = getSkillUpgradeLevel(unit);
  const nextLevel = Math.min(MAX_SKILL_LEVEL, level + 1);
  const baseSkillBonus = getSkillBaseBonus(unit);

  return {
    ...unit,
    baseSkillBonus,
    skillLevel: nextLevel,
    skillBonus:
      unit.skillType === "attack"
        ? baseSkillBonus + nextLevel
        : unit.skillBonus ?? baseSkillBonus,
    skillCooldown: 0,
  };
}


const DISPATCH_TYPES = [
  {
    id: "scout",
    name: "정찰 파견",
    exp: 25,
    gold: 140,
    potion: 0,
    desc: "EXP +25 / 140G",
  },
  {
    id: "training",
    name: "수련 파견",
    exp: 45,
    gold: 0,
    potion: 0,
    desc: "EXP +45",
  },
  {
    id: "supply",
    name: "보급 파견",
    exp: 20,
    gold: 240,
    potion: 1,
    desc: "EXP +20 / 240G / 회복약 +1",
  },
  {
    id: "relic",
    name: "유적 조사",
    exp: 30,
    gold: 90,
    potion: 0,
    desc: "EXP +30 / 90G / 낮은 확률로 장비 획득",
  },
];

function getDispatchBonusGear(typeId, unit) {
  if (typeId !== "relic") return null;

  const roll = Math.random();

  if (roll > 0.24) return null;

  if (unit?.id === "leon" || unit?.id === "luka") return "hunterBow";
  if (unit?.id === "sera" || unit?.id === "kaz" || unit?.id === "miho") return "shadowDagger";
  if (unit?.skillType === "heal" || unit?.skillType === "attack") return "mageRobe";

  return "chainArmor";
}




function createDefaultCareerStats() {
  return {
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
}

function normalizeCareerStats(stats) {
  const defaults = createDefaultCareerStats();
  const raw = stats && typeof stats === "object" && !Array.isArray(stats) ? stats : {};

  return {
    ...defaults,
    ...Object.fromEntries(
      Object.entries(raw).filter(([, value]) => typeof value !== "object" || Array.isArray(value))
    ),
    mvpCounts:
      raw.mvpCounts && typeof raw.mvpCounts === "object" && !Array.isArray(raw.mvpCounts)
        ? Object.fromEntries(
            Object.entries(raw.mvpCounts)
              .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
              .map(([key, value]) => [key, Math.max(0, value)])
          )
        : {},
  };
}

function mergeCareerStats(careerStats, battleStats, mvpUnitId, won = true) {
  const current = normalizeCareerStats(careerStats);
  const battle = normalizeBattleStats(battleStats);
  const mvpCounts = { ...(current.mvpCounts || {}) };

  if (mvpUnitId) {
    mvpCounts[mvpUnitId] = (mvpCounts[mvpUnitId] || 0) + 1;
  }

  return {
    ...current,
    battles: current.battles + 1,
    victories: current.victories + (won ? 1 : 0),
    defeats: current.defeats + (won ? 0 : 1),
    totalDamageDealt: current.totalDamageDealt + battle.damageDealt,
    totalDamageTaken: current.totalDamageTaken + battle.damageTaken,
    totalHealingDone: current.totalHealingDone + battle.healingDone,
    totalKills: current.totalKills + battle.kills,
    totalAssists: current.totalAssists + battle.assists,
    totalLootDrops: current.totalLootDrops + battle.lootDrops,
    bestDamageDealt: Math.max(current.bestDamageDealt || 0, battle.damageDealt),
    bestKills: Math.max(current.bestKills || 0, battle.kills),
    mvpCounts,
  };
}

function createDefaultUnitBattleStats() {
  return {};
}

function normalizeUnitBattleStats(stats) {
  const raw = stats && typeof stats === "object" && !Array.isArray(stats) ? stats : {};
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

function getUnitBattleScore(stats) {
  if (!stats) return 0;

  return (
    (stats.damageDealt || 0) +
    (stats.healingDone || 0) * 0.85 +
    (stats.kills || 0) * 55 +
    (stats.assists || 0) * 28 +
    (stats.counters || 0) * 18 +
    (stats.skillsUsed || 0) * 8 +
    (stats.itemsUsed || 0) * 4 -
    (stats.damageTaken || 0) * 0.25
  );
}

function createDefaultBattleStats() {
  return {
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
}

function normalizeBattleStats(stats) {
  const defaults = createDefaultBattleStats();
  const raw = stats && typeof stats === "object" ? stats : {};

  return Object.fromEntries(
    Object.keys(defaults).map((key) => [
      key,
      typeof raw[key] === "number" && Number.isFinite(raw[key])
        ? Math.max(0, raw[key])
        : defaults[key],
    ])
  );
}

export default function App() {
  useEffect(() => {
    const nativeClassName = "native-capacitor-app";
    const isNativeApp = isNativeCapacitorRuntime();
    document.documentElement.classList.toggle(nativeClassName, isNativeApp);
    document.body.classList.toggle(nativeClassName, isNativeApp);

    const checkStandalone = () =>
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;

    const refreshPwaStatus = () => {
      setPwaStatus((prev) => ({
        ...prev,
        online: navigator.onLine,
        serviceWorker: "serviceWorker" in navigator,
        standalone: checkStandalone(),
      }));
    };

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setPwaStatus((prev) => ({
        ...prev,
        installable: true,
      }));
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setPwaStatus((prev) => ({
        ...prev,
        installed: true,
        installable: false,
        standalone: true,
      }));
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", refreshPwaStatus);
    window.addEventListener("offline", refreshPwaStatus);

    refreshPwaStatus();

    if (import.meta.env.PROD && "serviceWorker" in navigator && !isNativeCapacitorRuntime()) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then(() => {
            setPwaStatus((prev) => ({
              ...prev,
              serviceWorker: true,
            }));
          })
          .catch(() => {
            setPwaStatus((prev) => ({
              ...prev,
              serviceWorker: false,
            }));
          });
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", refreshPwaStatus);
      window.removeEventListener("offline", refreshPwaStatus);
      document.documentElement.classList.remove(nativeClassName);
      document.body.classList.remove(nativeClassName);
    };
  }, []);

  const [screen, setScreen] = useState("menu");
  const [storyScene, setStoryScene] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [deploymentStage, setDeploymentStage] = useState(null);
  const [campaignView, setCampaignView] = useState("world");
  const [finalDeployCheckOpen, setFinalDeployCheckOpen] = useState(false);
  const [deployedIds, setDeployedIds] = useState(STAGE_ONE_DEFAULT_DEPLOY_IDS);
  const [deployFilter, setDeployFilter] = useState("all");
  const [deploySort, setDeploySort] = useState("default");
  const [deploymentHint, setDeploymentHint] = useState("균형 편성을 추천합니다.");
  const [party, setParty] = useState(getInitialParty());
  const [units, setUnits] = useState(clone(stages[0].units));
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [inspectedUnitId, setInspectedUnitId] = useState(null);
  const [mode, setMode] = useState("move");
  const [turn, setTurn] = useState("ally");
  const [turnPhaseBanner, setTurnPhaseBanner] = useState(null);
  const [round, setRound] = useState(1);
  const [battle, setBattle] = useState(null);
  const [battleResolving, setBattleResolving] = useState(false);
  const [combatCutscene, setCombatCutscene] = useState(null);
  const [bossCutscene, setBossCutscene] = useState(null);
  const [result, setResult] = useState(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [campTab, setCampTab] = useState("party");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [codexCategory, setCodexCategory] = useState("전체");
  const [codexQuery, setCodexQuery] = useState("");
  const [selectedPlayerTitle, setSelectedPlayerTitle] = useState("rookie");
  const [selectedProfileFrame, setSelectedProfileFrame] = useState("classic");
  const [tutorialGuideId, setTutorialGuideId] = useState("deploy");
  const [qaChecked, setQaChecked] = useState({});
  const [bugNote, setBugNote] = useState("");
  const [bugType, setBugType] = useState("bug");
  const [feedbackReports, setFeedbackReports] = useState(() => loadFeedbackReports());
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [equipmentUnitId, setEquipmentUnitId] = useState("hero");
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [trainingUsed, setTrainingUsed] = useState(false);
  const [dispatchUsed, setDispatchUsed] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportPoints, setSupportPoints] = useState({
    hero_lina: 0,
    hero_bram: 0,
    lina_bram: 0,
  });
  const [supportDialoguesSeen, setSupportDialoguesSeen] = useState({});
  const [activeSupportScene, setActiveSupportScene] = useState(null);
  const [gold, setGold] = useState(300);
  const [stageRewardClaimed, setStageRewardClaimed] = useState(false);
  const [unlockedStages, setUnlockedStages] = useState(() => getPlaytestUnlockedStageIds([1]));
  const playableStageIds = PLAYTEST_UNLOCK_ALL_STAGES ? ALL_STAGE_IDS : unlockedStages;
  const [clearedStages, setClearedStages] = useState([]);
  const [gearInventory, setGearInventory] = useState(["ironSword", "leatherArmor", "fireStaff", "mageRobe"]);
  const [gearEnhance, setGearEnhance] = useState({});
  const [inventory, setInventory] = useState(createDefaultInventory());
  const [battleLoot, setBattleLoot] = useState(createEmptyLoot());
  const [battleStats, setBattleStats] = useState(createDefaultBattleStats());
  const [unitBattleStats, setUnitBattleStats] = useState(createDefaultUnitBattleStats());
  const [careerStats, setCareerStats] = useState(createDefaultCareerStats());
  const [stageMastery, setStageMastery] = useState({});
  const [stageNotes, setStageNotes] = useState({});
  const [stageNoteTags, setStageNoteTags] = useState({});
  const [strategyReportArchive, setStrategyReportArchive] = useState([]);
  const [strategyFavoriteIds, setStrategyFavoriteIds] = useState([]);
  const [strategyQuickSlots, setStrategyQuickSlots] = useState({});
  const [strategyQuickSlotNames, setStrategyQuickSlotNames] = useState({});
  const [strategyArchiveFilter, setStrategyArchiveFilter] = useState("all");
  const [strategyArchiveQuery, setStrategyArchiveQuery] = useState("");
  const [strategySlotImportText, setStrategySlotImportText] = useState("");
  const [finalRcChecked, setFinalRcChecked] = useState({});
  const [launchChecked, setLaunchChecked] = useState({});
  const [compareStrategyIds, setCompareStrategyIds] = useState([]);
  const [claimedMasteryRewards, setClaimedMasteryRewards] = useState([]);
  const [claimedAchievements, setClaimedAchievements] = useState([]);
  const [claimedChallenges, setClaimedChallenges] = useState([]);
  const [dailyLoginData, setDailyLoginData] = useState(() => normalizeDailyLoginData({}));
  const [eventData, setEventData] = useState(() => normalizeEventData({}));
  const [campMessage, setCampMessage] = useState("모닥불이 조용히 타오른다. 동료들이 다음 전투를 준비하고 있다.");
  const [logs, setLogs] = useState(["전투 시작.", "아군을 선택하세요."]);
  const [logFilter, setLogFilter] = useState("all");
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem("cheonsu_settings_v1");
      return raw ? { ...createDefaultSettings(), ...JSON.parse(raw) } : createDefaultSettings();
    } catch {
      return createDefaultSettings();
    }
  });
  const [installPrompt, setInstallPrompt] = useState(null);
  const [appLoading, setAppLoading] = useState(true);
  const [runtimeError, setRuntimeError] = useState(null);
  const [crashLogs, setCrashLogs] = useState(() => loadCrashLogs());
  const [qaFixHistory, setQaFixHistory] = useState(() => loadQaFixHistory());
  const [qaReleaseArchive, setQaReleaseArchive] = useState(() => loadQaReleaseArchive());
  const [saveHealthRefreshKey, setSaveHealthRefreshKey] = useState(0);
  const [saveImportText, setSaveImportText] = useState("");
  const [photoMode, setPhotoMode] = useState(false);
  const [snapshotGallery, setSnapshotGallery] = useState([]);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [pwaStatus, setPwaStatus] = useState({
    serviceWorker: false,
    installable: false,
    installed: false,
    standalone: false,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
  });
  const [updateManifestUrl, setUpdateManifestUrl] = useState(loadUpdateManifestUrl);
  const [updateCheck, setUpdateCheck] = useState(createIdleUpdateState);
  const [phaseBanner, setPhaseBanner] = useState(null);
  const [stageBanner, setStageBanner] = useState(null);
  const [lastClearSummary, setLastClearSummary] = useState(null);
  const [hazards, setHazards] = useState([]);
  const [turnBusy, setTurnBusy] = useState(false);
  const [autoBattleEnabled, setAutoBattleEnabled] = useState(false);
  const [visualEffects, setVisualEffects] = useState([]);
  const [damagePopups, setDamagePopups] = useState([]);
  const [movingUnit, setMovingUnit] = useState(null);
  const [moveUndo, setMoveUndo] = useState(null);
  const [actionMotion, setActionMotion] = useState(null);
  const [mapZoom, setMapZoom] = useState("fit");
  const [mapVisibility, setMapVisibility] = useState("tactical");
  const [battleCompact, setBattleCompact] = useState(true);
  const [mobileBattlePanelOpen, setMobileBattlePanelOpen] = useState(false);
  const [mobileTargetPanelOpen, setMobileTargetPanelOpen] = useState(false);
  const [mobileAllyPanelOpen, setMobileAllyPanelOpen] = useState(false);
  const [mobileTurnPanelOpen, setMobileTurnPanelOpen] = useState(false);
  const [battleGuideHidden, setBattleGuideHidden] = useState(false);
  const [battleHudHidden, setBattleHudHidden] = useState(false);
  const [battleSettingsOpen, setBattleSettingsOpen] = useState(false);
  const [cameraFocus, setCameraFocus] = useState(null);
  const battleMapShellRef = useRef(null);
  const battleMapPanRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    dragging: false,
  });
  const suppressBattleMapClickRef = useRef(false);
  const [screenShake, setScreenShake] = useState(false);

  const closeMobileCombatPanels = () => {
    setMobileBattlePanelOpen(false);
    setMobileTargetPanelOpen(false);
    setMobileAllyPanelOpen(false);
    setMobileTurnPanelOpen(false);
  };

  const toggleMobileCombatPanel = (panel) => {
    setMobileBattlePanelOpen((prev) => (panel === "quick" ? !prev : false));
    setMobileTargetPanelOpen((prev) => (panel === "target" ? !prev : false));
    setMobileAllyPanelOpen((prev) => (panel === "ally" ? !prev : false));
    setMobileTurnPanelOpen((prev) => (panel === "turn" ? !prev : false));
  };

  const setBattleModeFromMobile = (nextMode) => {
    const activeUnit = selected;

    if (!activeUnit) {
      setMobileBattlePanelOpen(false);
      setMobileTargetPanelOpen(false);
      setMobileAllyPanelOpen(true);
      setMobileTurnPanelOpen(false);
      setLogs((p) => ["먼저 행동할 아군을 선택하세요.", ...p]);
      return;
    }

    if (turn !== "ally" || turnBusy || movingUnit || result || activeUnit.acted) {
      setLogs((p) => [`${activeUnit.name}은 지금 명령을 받을 수 없습니다.`, ...p]);
      return;
    }

    if (nextMode === "move" && activeUnit.moved) {
      setMode("attack");
      setMobileBattlePanelOpen(false);
      setMobileTargetPanelOpen(true);
      setMobileAllyPanelOpen(false);
      setMobileTurnPanelOpen(false);
      setLogs((p) => [`${activeUnit.name}은 이미 이동했습니다. 공격 또는 대기를 선택하세요.`, ...p]);
      return;
    }

    if (nextMode === "skill") {
      if (selectedSkillCooldown > 0) {
        setLogs((p) => [
          `${activeUnit.name}의 ${activeUnit.skill}은 ${selectedSkillCooldown}턴 후 사용할 수 있습니다.`,
          ...p,
        ]);
        return;
      }

      if (activeUnit.skillType !== "attack") {
        closeMobileCombatPanels();
        void activateSkill();
        return;
      }
    }

    setMode(nextMode);
    setMobileBattlePanelOpen(false);
    setMobileAllyPanelOpen(false);
    setMobileTurnPanelOpen(false);

    if (nextMode === "attack" || nextMode === "skill") {
      setMobileTargetPanelOpen(true);
      setLogs((p) => [
        `${activeUnit.name} ${nextMode === "skill" ? activeUnit.skill : "공격"} 대상 선택.`,
        ...p,
      ]);
      playSfx(nextMode === "skill" ? "magic" : "confirm");
      return;
    }

    setMobileTargetPanelOpen(false);
    setLogs((p) => [`${activeUnit.name} 이동 모드. 파란 칸을 선택하세요.`, ...p]);
    playSfx("confirm");
  };

  const activeStage = selectedStage || stages[0];
  const activeMissionOrder = getStageMissionOrder(activeStage);
  const activeBattlefieldTheme = activeStage?.battlefieldTheme
    ? {
        id: activeStage.battlefieldThemeId || getStageBattlefieldTheme(activeStage).id,
        label: activeStage.battlefieldTheme,
      }
    : getStageBattlefieldTheme(activeStage);
  const activeRoundLimit = getStageRoundLimit(activeStage);
  const activeBaseMap = activeStage?.map?.length ? activeStage.map : stages[0].map;
  const activeMap = useMemo(
    () => extendMapForPlayableBoard(activeBaseMap, activeStage),
    [activeBaseMap, activeStage]
  );
  window.__CHEONSU_ACTIVE_MAP__ = activeMap;
  const enemiesAlive = units.filter((unit) => unit.type !== "ally" && unit.hp > 0);
  const alliesAlive = units.filter((unit) => unit.type === "ally" && unit.hp > 0);
  const activeBoss = enemiesAlive.find((unit) => unit.type === "boss");
  const bossHpRate =
    activeBoss && activeBoss.maxHp
      ? Math.max(0, Math.min(100, (activeBoss.hp / activeBoss.maxHp) * 100))
      : 0;
  const nextReinforcementRound = getReinforcementRounds(activeStage).find(
    (reinforceRound) => reinforceRound >= round
  );
  const selected = units.find((u) => u.id === selectedUnit);
  const inspectedUnit = units.find((u) => u.id === inspectedUnitId);
  const viewedUnit = inspectedUnit || selected;
  const showPostMoveCommandMenu = Boolean(
    turn === "ally" &&
    selected &&
    selected.type === "ally" &&
    selected.moved &&
    !selected.acted &&
    !turnBusy &&
    !movingUnit &&
    !battle &&
    !result
  );
  const canUndoMove = Boolean(showPostMoveCommandMenu && moveUndo?.unitId === selected?.id);
  const moveTiles = getMoveTiles(selected, units, activeMap).filter(
    (tile) => !isBlockedBattleTile(activeMap[tile.y]?.[tile.x])
  );
  const attackTiles = getAttackTiles(selected, mode, activeMap).filter(
    (tile) => !isBlockedBattleTile(activeMap[tile.y]?.[tile.x])
  );
  const enemyThreatTileKeys = useMemo(() => {
    if (mapVisibility === "art") return new Set();

    const keys = new Set();

    units
      .filter((unit) => unit.type !== "ally" && unit.hp > 0)
      .forEach((enemy) => {
      const origins = [
        { x: enemy.x, y: enemy.y },
        ...getMoveTiles(enemy, units, activeMap).slice(0, 18),
      ];

      origins.forEach((origin) => {
        getAttackTiles({ ...enemy, x: origin.x, y: origin.y, acted: false }, "attack", activeMap)
          .forEach((tile) => keys.add(`${tile.x},${tile.y}`));
      });
    });

    return keys;
  }, [activeMap, mapVisibility, units]);

  const mobileTargetList =
    selected
      ? enemiesAlive
          .slice()
          .sort((a, b) => {
            const aInRange = attackTiles.some((tile) => tile.x === a.x && tile.y === a.y);
            const bInRange = attackTiles.some((tile) => tile.x === b.x && tile.y === b.y);
            if (aInRange !== bInRange) return aInRange ? -1 : 1;

            const aDistance = Math.abs(selected.x - a.x) + Math.abs(selected.y - a.y);
            const bDistance = Math.abs(selected.x - b.x) + Math.abs(selected.y - b.y);
            return aDistance - bDistance || a.hp - b.hp;
          })
          .slice(0, 12)
      : enemiesAlive.slice().sort((a, b) => a.hp - b.hp).slice(0, 8);

  const mobileMoveDestinationList =
    selected && mode === "move"
      ? moveTiles
          .slice()
          .sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x)
          .slice(0, 9)
      : [];

  const mobileAllyList = alliesAlive
    .slice()
    .sort((a, b) => Number(a.acted) - Number(b.acted) || a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp));

  const mobileTurnOrderList = units
    .filter((unit) => unit.hp > 0)
    .slice()
    .sort((a, b) => {
      const typePriority = turn === "ally"
        ? (a.type === "ally" ? 0 : 1) - (b.type === "ally" ? 0 : 1)
        : (a.type !== "ally" ? 0 : 1) - (b.type !== "ally" ? 0 : 1);
      if (typePriority !== 0) return typePriority;
      return Number(a.acted) - Number(b.acted) || a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp);
    });
  const equipmentUnit = party.find((u) => u.id === equipmentUnitId) || party[0];

  const openTutorial = (guideId = "deploy") => {
    setTutorialGuideId(guideId);
    setTutorialOpen(true);
    playSfx("confirm");
  };

  const activeTutorialGuide = getTutorialGuide(tutorialGuideId);

  const saveHealthReport = getSaveHealthReport();
  const saveRecoverySuggestion = getSaveRecoverySuggestion();




  const deploymentPreviewStage = deploymentStage
    ? expandStageForLargeBattle(deploymentStage, Math.max(1, deployedIds.length || MAX_DEPLOY_COUNT))
    : null;
  const deploymentEnemySummary = deploymentStage
    ? getStageEnemySummary(deploymentStage, Math.max(1, deployedIds.length || MAX_DEPLOY_COUNT))
    : null;
  const deploymentThreat = deploymentStage
    ? getStageThreatLevel(deploymentStage, Math.max(1, deployedIds.length || MAX_DEPLOY_COUNT))
    : null;
  const recommendedFormationType = getRecommendedFormationForStage(deploymentStage);
  const recommendedFormationLabel = getDeployPresetLabel(recommendedFormationType);
  const deploymentTips = getStageBriefingTips(deploymentStage);
  const deploymentSupplyItems = getRecommendedSupplyItems(deploymentStage);
  const deploymentReadiness = deploymentStage
    ? getDeploymentReadiness(party, deployedIds, deploymentStage)
    : null;
  const deploymentStrategyReport = deploymentStage
    ? getStrategyReadinessReport({
        party,
        deployedIds,
        stage: deploymentStage,
        stageNoteTags,
        inventory,
        gearInventory,
      })
    : null;

  const deploymentMatchingQuickSlots = deploymentStage
    ? getMatchingQuickSlotsForStage(strategyReportArchive, strategyQuickSlots, deploymentStage)
    : [];
  const deploymentAnyQuickSlots = getAnyQuickSlotEntries(strategyReportArchive, strategyQuickSlots);
  const stageMapAtlas = useMemo(
    () =>
      stages.map((stage) => {
        const previewStage = expandStageForLargeBattle(stage, MAX_DEPLOY_COUNT);

        return {
          stage,
          previewStage,
          mission: getStageMissionOrder(stage),
          threat: getStageThreatLevel(stage, MAX_DEPLOY_COUNT),
          enemySummary: getStageEnemySummary(stage, MAX_DEPLOY_COUNT),
        };
      }),
    []
  );

  const visibleStrategyArchive = filterStrategyArchive(
    strategyReportArchive,
    strategyArchiveFilter,
    strategyArchiveQuery,
    strategyFavoriteIds
  );
  const strategyArchiveStats = getStrategyArchiveStats(strategyReportArchive, strategyFavoriteIds);
  const strategyQuickSlotEntries = [1, 2, 3, 4].map((slot) => ({
    slot,
    entry: getStrategyQuickSlotEntry(strategyReportArchive, strategyQuickSlots, slot),
  }));
  const strategyCompareResult =
    compareStrategyIds.length === 2
      ? compareStrategyReports(
          strategyReportArchive.find((entry) => entry.id === compareStrategyIds[0]),
          strategyReportArchive.find((entry) => entry.id === compareStrategyIds[1])
        )
      : null;
  const displayedDeployUnits = sortDeployUnits(
    filterDeployUnits(party, deployedIds, deployFilter),
    deploySort
  );
  const deployedEquippedCount = countEquippedUnits(party, deployedIds);
  const finalDeploySummary = deploymentStage
    ? getFinalDeploySummary(party, deployedIds, deploymentStage, inventory, gearInventory)
    : null;
  const campPromotedCount = party.filter((unit) => unit.promoted).length;
  const campSkillUpgradeTotal = party.reduce((sum, unit) => sum + getSkillUpgradeLevel(unit), 0);
  const campEnhancedGearCount = Object.values(gearEnhance).filter((level) => level > 0).length;
  const deploymentSupplyPurchasePlan = deploymentStage
    ? getRecommendedSupplyPurchasePlan(deploymentStage, inventory, gold)
    : { items: [], cost: 0, remainingGold: gold };
  const playtestInsight = getPlaytestInsight({
    careerStats,
    clearedStages,
    feedbackReports,
    settings,
  });

  const releaseReadinessScore = getReleaseReadinessScore({
    clearedStages,
    careerStats,
    feedbackReports,
    strategyReportArchive,
    snapshotGallery,
    claimedAchievements,
    stageMastery,
  });
  const finalRcChecklist = getFinalRcChecklist();
  const finalRcCheckedCount = Object.values(finalRcChecked).filter(Boolean).length;

  const launchChecklist = getLaunchFinalChecklist();
  const launchCheckedCount = Object.values(launchChecked).filter(Boolean).length;
  const launchGrade = getLaunchGrade(releaseReadinessScore, launchCheckedCount, launchChecklist.length);

  const postLaunchAudit = getPostLaunchAudit({
    runtimeError,
    feedbackReports,
    careerStats,
    saveHealthReport,
    releaseReadinessScore,
  });

  const crashLogStats = {
    total: crashLogs.length,
    runtime: crashLogs.filter((log) => log.source === "runtime").length,
    promise: crashLogs.filter((log) => log.source === "promise").length,
    latest: crashLogs[0] || null,
  };

  const qaPriorityBoard = getQaPriorityBoard(feedbackReports);
  const qaFixHistoryStats = {
    total: qaFixHistory.length,
    fixed: qaFixHistory.filter((item) => item.status === "fixed").length,
    later: qaFixHistory.filter((item) => item.status === "later").length,
    latest: qaFixHistory[0] || null,
  };
  const qaChangelogEntries = getQaChangelogEntries(qaFixHistory);
  const currentQaReleaseNoteText = createPublicPatchNotesFromQa(qaFixHistory, feedbackReports);
  const qaReleaseArchiveStats = getQaReleaseArchiveStats(qaReleaseArchive);
  const feedbackTypeCounts = getFeedbackTypeCounts(feedbackReports);
  const achievementContext = {
    clearedStages,
    party,
    careerStats,
    gearEnhance,
    feedbackReports,
    claimedAchievements,
  };
  const achievementProgress = ACHIEVEMENTS.map((achievement) =>
    getAchievementProgress(achievement, achievementContext)
  );
  const claimableAchievementCount = achievementProgress.filter((achievement) => achievement.claimable).length;
  const dailyChallengeDateKey = getChallengeDateKey();
  const dailyChallengeProgress = getDailyChallengesForDate(dailyChallengeDateKey).map((challenge) =>
    getChallengeProgress(
      { ...challenge, id: `${dailyChallengeDateKey}-${challenge.id}` },
      { ...achievementContext, inventory },
      claimedChallenges
    )
  );
  const weeklyChallengeProgress = getWeeklyChallenges().map((challenge) =>
    getChallengeProgress(
      { ...challenge, id: `weekly-${challenge.id}` },
      { ...achievementContext, inventory },
      claimedChallenges
    )
  );
  const claimableChallengeCount = [...dailyChallengeProgress, ...weeklyChallengeProgress].filter((challenge) => challenge.claimable).length;
  const dailyLoginStatus = getDailyLoginStatus(dailyLoginData, dailyChallengeDateKey);
  const seasonInfo = getCurrentSeasonInfo();
  const normalizedEventData = normalizeEventData(eventData);
  const seasonClaimed = normalizedEventData.claimedSeasonIds.includes(seasonInfo.id);
  const seasonMissions = getSeasonMissionProgress(seasonInfo, {
    clearedStages,
    party,
    careerStats,
  });
  const completedSeasonMissionCount = seasonMissions.filter((mission) => mission.completed).length;
  const codexEntries = getCodexEntries({ party, clearedStages, settings });
  const codexCategories = getCodexCategories(codexEntries);
  const visibleCodexEntries = filterCodexEntries(codexEntries, codexCategory, codexQuery);
  const unlockedCodexCount = codexEntries.filter((entry) => entry.unlocked).length;
  const profileContext = {
    clearedStages,
    party,
    careerStats,
    feedbackReports,
    claimedAchievements,
    unlockedCodexCount,
  };
  const unlockedPlayerTitles = getUnlockedPlayerTitles(profileContext);
  const commanderLevel = getCommanderLevel(profileContext);
  const commanderProgress = getCommanderExpProgress(profileContext);
  const selectedPlayerTitleName = getPlayerTitleName(selectedPlayerTitle, profileContext);
  const unlockedProfileFrames = getUnlockedProfileFrames(profileContext);
  const activeProfileFrame = getSelectedProfileFrame(selectedProfileFrame, profileContext);
  const hallOfFameEntries = getHallOfFameEntries({
    party,
    careerStats,
    clearedStages,
    claimedAchievements,
    snapshotGallery,
    unlockedCodexCount,
    stageMastery,
  });


  const battleSpeedConfig = getBattleSpeedConfig(settings.battleSpeed);
  const cutsceneConfig = getCutsceneConfig(settings.cutsceneMode);
  const autoBattleModeConfig = getAutoBattleModeConfig(settings.autoBattleMode);
  const balancePresetConfig = getBalancePresetConfig(settings.balancePreset);
  const mapVisibilityConfig = getMapVisibilityMode(mapVisibility);
  const photoThemeConfig = getPhotoThemeConfig(settings.photoTheme);
  const mapZoomIndex = Math.max(0, MAP_ZOOM_STEPS.indexOf(mapZoom));
  const mapZoomLabel = MAP_ZOOM_LABELS[mapZoom] || MAP_ZOOM_LABELS.fit;
  const canZoomOut = mapZoomIndex > 0;
  const canZoomIn = mapZoomIndex < MAP_ZOOM_STEPS.length - 1;

  const setBattleMapZoomPreservingView = (nextZoom) => {
    const shell = battleMapShellRef.current;
    const centerRatio = shell
      ? {
          x: shell.scrollWidth > 0 ? (shell.scrollLeft + shell.clientWidth / 2) / shell.scrollWidth : 0.5,
          y: shell.scrollHeight > 0 ? (shell.scrollTop + shell.clientHeight / 2) / shell.scrollHeight : 0.5,
        }
      : { x: 0.5, y: 0.5 };

    setMapZoom(nextZoom);

    window.setTimeout(() => {
      const nextShell = battleMapShellRef.current;

      if (!nextShell) return;

      nextShell.scrollTo({
        left: Math.max(0, nextShell.scrollWidth * centerRatio.x - nextShell.clientWidth / 2),
        top: Math.max(0, nextShell.scrollHeight * centerRatio.y - nextShell.clientHeight / 2),
        behavior: "auto",
      });
    }, 60);
  };

  const changeBattleMapZoom = (direction) => {
    const currentIndex = Math.max(0, MAP_ZOOM_STEPS.indexOf(mapZoom));
    const nextIndex = Math.max(0, Math.min(MAP_ZOOM_STEPS.length - 1, currentIndex + direction));
    const nextZoom = MAP_ZOOM_STEPS[nextIndex];

    if (!nextZoom || nextZoom === mapZoom) return;

    setBattleMapZoomPreservingView(nextZoom);
    playSfx("confirm");
  };

  const resetBattleMapZoom = () => {
    setBattleMapZoomPreservingView("fit");
    playSfx("confirm");
  };

  const cycleMapVisibility = () => {
    const nextId = getNextMapVisibilityModeId(mapVisibility);
    const nextConfig = getMapVisibilityMode(nextId);

    setMapVisibility(nextId);
    playSfx("confirm");

    if (screen === "battle") {
      setLogs((p) => [`전장 시야 변경: ${nextConfig.label} · ${nextConfig.desc}`, ...p]);
    }
  };

  const cycleCutsceneMode = () => {
    const nextId = getNextCutsceneModeId(settings.cutsceneMode);

    updateSetting("cutsceneMode", nextId);
    playSfx("confirm");

    if (screen === "battle") {
      setLogs((p) => [`전투 컷씬 변경: ${getCutsceneConfig(nextId).label}`, ...p]);
    }
  };

  const cycleAutoBattleMode = () => {
    const nextId = getNextAutoBattleModeId(settings.autoBattleMode);

    updateSetting("autoBattleMode", nextId);
    playSfx("confirm");

    if (screen === "battle") {
      setLogs((p) => [`자동 전투 전략 변경: ${getAutoBattleModeConfig(nextId).label}`, ...p]);
    }
  };

  const cycleBattleSpeed = () => {
    const nextId = getNextBattleSpeedId(settings.battleSpeed);

    updateSetting("battleSpeed", nextId);
    playSfx("confirm");

    if (screen === "battle") {
      setLogs((p) => [`전투 속도 변경: ${getBattleSpeedConfig(nextId).label}`, ...p]);
    }
  };


  const getBattleMapGridMetrics = (mapElement) => {
    const styles = window.getComputedStyle(mapElement);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const paddingBottom = parseFloat(styles.paddingBottom) || 0;
    const rect = mapElement.getBoundingClientRect();

    return {
      rect,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      gridScrollWidth: Math.max(1, mapElement.scrollWidth - paddingLeft - paddingRight),
      gridScrollHeight: Math.max(1, mapElement.scrollHeight - paddingTop - paddingBottom),
      gridRectWidth: Math.max(1, rect.width - paddingLeft - paddingRight),
      gridRectHeight: Math.max(1, rect.height - paddingTop - paddingBottom),
    };
  };

  const scrollBattleMapToCell = (x, y, behavior = "smooth") => {
    const shell = battleMapShellRef.current;

    if (!shell || !activeMap?.length || !activeMap[0]?.length) return;

    const mapElement = shell.querySelector(".battle-map");

    if (!mapElement) return;

    const cols = activeMap[0].length;
    const rows = activeMap.length;
    const metrics = getBattleMapGridMetrics(mapElement);
    const cellWidth = metrics.gridScrollWidth / cols;
    const cellHeight = metrics.gridScrollHeight / rows;
    const targetLeft = Math.max(
      0,
      metrics.paddingLeft + x * cellWidth - shell.clientWidth / 2 + cellWidth / 2
    );
    const targetTop = Math.max(
      0,
      metrics.paddingTop + y * cellHeight - shell.clientHeight / 2 + cellHeight / 2
    );

    shell.scrollTo({
      left: targetLeft,
      top: targetTop,
      behavior,
    });

    const focusId = `${x}-${y}-${Date.now()}`;
    setCameraFocus({ id: focusId, x, y });

    setTimeout(() => {
      setCameraFocus((current) => (current?.id === focusId ? null : current));
    }, 900);
  };

  const focusUnitOnMap = (unit, behavior = "smooth") => {
    if (!unit) return;

    if (mapZoom === "fit") {
      setMapZoom("normal");
      setTimeout(() => scrollBattleMapToCell(unit.x, unit.y, behavior), 80);
      return;
    }

    scrollBattleMapToCell(unit.x, unit.y, behavior);
  };

  const getBattleMapTileFromPointerEvent = (event) => {
    const shell = battleMapShellRef.current;
    const mapElement = shell?.querySelector(".battle-map");

    if (!shell || !mapElement || !activeMap?.length || !activeMap[0]?.length) return null;

    const metrics = getBattleMapGridMetrics(mapElement);
    const { rect } = metrics;

    if (rect.width <= 0 || rect.height <= 0) return null;

    const localX = event.clientX - rect.left - metrics.paddingLeft;
    const localY = event.clientY - rect.top - metrics.paddingTop;

    if (event.clientX < rect.left || event.clientY < rect.top || event.clientX > rect.right || event.clientY > rect.bottom) {
      return null;
    }

    const clampedX = Math.min(metrics.gridRectWidth - 0.01, Math.max(0, localX));
    const clampedY = Math.min(metrics.gridRectHeight - 0.01, Math.max(0, localY));

    const x = Math.min(
      activeMap[0].length - 1,
      Math.max(0, Math.floor((clampedX / metrics.gridRectWidth) * activeMap[0].length))
    );
    const y = Math.min(
      activeMap.length - 1,
      Math.max(0, Math.floor((clampedY / metrics.gridRectHeight) * activeMap.length))
    );

    return { x, y };
  };

  const resetBattleMapPan = () => {
    battleMapPanRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      scrollLeft: 0,
      scrollTop: 0,
      dragging: false,
    };
  };

  const handleBattleMapPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    const shell = battleMapShellRef.current;

    if (!shell) return;

    battleMapPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: shell.scrollLeft,
      scrollTop: shell.scrollTop,
      dragging: false,
    };
  };

  const handleBattleMapPointerMove = (event) => {
    const pan = battleMapPanRef.current;
    const shell = battleMapShellRef.current;

    if (!shell || pan.pointerId !== event.pointerId) return;

    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;

    if (!pan.dragging && Math.abs(dx) + Math.abs(dy) > 14) {
      pan.dragging = true;
      shell.classList.add("is-panning");

      try {
        shell.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort; native scroll remains available.
      }
    }

    if (!pan.dragging) return;

    event.preventDefault();
    shell.scrollLeft = pan.scrollLeft - dx;
    shell.scrollTop = pan.scrollTop - dy;
  };

  const handleBattleMapPointerEnd = (event) => {
    const pan = battleMapPanRef.current;

    if (pan.pointerId !== event.pointerId) return;

    if (pan.dragging) {
      suppressBattleMapClickRef.current = true;
      window.setTimeout(() => {
        suppressBattleMapClickRef.current = false;
      }, 120);
    } else {
      const tile = getBattleMapTileFromPointerEvent(event);

      if (tile && handleBattleTilePress(tile.x, tile.y, "pointer")) {
        suppressBattleMapClickRef.current = true;
        window.setTimeout(() => {
          suppressBattleMapClickRef.current = false;
        }, 80);
      }
    }

    event.currentTarget.classList.remove("is-panning");

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore missing capture in older WebViews.
    }

    resetBattleMapPan();
  };



  const applyGearEnhanceToParty = (sourceParty = party, enhancement = gearEnhance) => {
    const normalized = normalizeGearEnhance(enhancement);

    return applyEquipmentToParty(
      (sourceParty || []).map((unit) => ({
        ...unit,
        gearEnhance: normalized,
      }))
    );
  };



  const getSkillCooldownValue = (unit) => Math.max(0, unit?.skillCooldown || 0);

  const getSkillCooldownTurns = (unit) => {
    if (!unit) return 2;

    const skillLevel = getSkillUpgradeLevel(unit);
    const cooldownReduction = skillLevel >= 4 ? 1 : 0;
    let baseCooldown = 2;

    const heavySkillNames = ["저격", "백호 포효", "별빛 폭발", "재의 심판", "어둠의 파동"];

    if (heavySkillNames.some((name) => String(unit.skill || "").includes(name))) {
      baseCooldown = 3;
    }

    return Math.max(1, baseCooldown - cooldownReduction);
  };

  const applySkillCooldown = (sourceUnits, unitId, cooldown = 2) => {
    return sourceUnits.map((unit) =>
      unit.id === unitId
        ? {
            ...unit,
            skillCooldown: cooldown,
          }
        : unit
    );
  };

  const decrementSkillCooldowns = (sourceUnits) => {
    return sourceUnits.map((unit) => {
      if (unit.type !== "ally") return unit;

      return {
        ...unit,
        skillCooldown: Math.max(0, (unit.skillCooldown || 0) - 1),
      };
    });
  };

  const selectedSkillCooldown = getSkillCooldownValue(selected);
  const readyAllyCount = units.filter(isUnitReady).length;
  const battleGuideHint = getBattleGuideHint({
    turn,
    selected,
    mode,
    selectedSkillCooldown,
    readyCount: readyAllyCount,
    enemyCount: enemiesAlive.length,
    mobileTargetPanelOpen,
    mobileAllyPanelOpen,
    mobileTurnPanelOpen,
  });
  const visibleBattleLogs = logs
    .filter((log) => matchesLogFilter(log, logFilter))
    .slice(0, settings.logLines);
  const logFilterCounts = LOG_FILTERS.reduce((counts, filter) => {
    counts[filter.id] = logs.filter((log) => matchesLogFilter(log, filter.id)).length;
    return counts;
  }, {});
  const viewedSkillCooldown = getSkillCooldownValue(viewedUnit);
  const viewedTerrain = viewedUnit ? activeMap?.[viewedUnit.y]?.[viewedUnit.x] || "plain" : "plain";
  const viewedHpRate =
    viewedUnit && viewedUnit.maxHp
      ? Math.max(0, Math.min(100, (viewedUnit.hp / viewedUnit.maxHp) * 100))
      : 0;
  const viewedResourceMax = viewedUnit
    ? Math.max(
        1,
        Number(
          viewedUnit.maxMp ??
            viewedUnit.maxMana ??
            viewedUnit.maxSp ??
            getSkillCooldownTurns(viewedUnit)
        ) || 1
      )
    : 1;
  const viewedResourceValue = viewedUnit
    ? Math.max(
        0,
        Math.min(
          viewedResourceMax,
          Number(
            viewedUnit.mp ??
              viewedUnit.mana ??
              viewedUnit.sp ??
              viewedResourceMax - viewedSkillCooldown
          ) || 0
        )
      )
    : 0;
  const viewedResourceRate = viewedResourceMax
    ? Math.max(0, Math.min(100, (viewedResourceValue / viewedResourceMax) * 100))
    : 0;
  const viewedResourceLabel =
    viewedUnit && (viewedUnit.maxMp != null || viewedUnit.maxMana != null || viewedUnit.mp != null || viewedUnit.mana != null)
      ? "MP"
      : "SP";

  const runBattleGuideAction = () => {
    switch (battleGuideHint.actionType) {
      case "ally":
        playSfx("confirm");
        toggleMobileCombatPanel("ally");
        break;
      case "target":
        playSfx("confirm");
        toggleMobileCombatPanel("target");
        break;
      case "turn":
        playSfx("confirm");
        toggleMobileCombatPanel("turn");
        break;
      case "move":
        playSfx("confirm");
        setBattleModeFromMobile("move");
        break;
      case "attack":
        playSfx("confirm");
        setBattleModeFromMobile("attack");
        break;
      default:
        openTutorial("battle");
        break;
    }
  };

  const addBattleStats = (delta) => {
    setBattleStats((prev) => {
      const next = normalizeBattleStats(prev);

      for (const [key, value] of Object.entries(delta || {})) {
        next[key] = Math.max(0, (next[key] || 0) + (Number(value) || 0));
      }

      return next;
    });
  };

  const addUnitBattleStats = (unitId, delta) => {
    if (!unitId) return;

    setUnitBattleStats((prev) => {
      const normalized = normalizeUnitBattleStats(prev);
      const current = normalized[unitId] || {
        damageDealt: 0,
        damageTaken: 0,
        healingDone: 0,
        kills: 0,
        assists: 0,
        counters: 0,
        skillsUsed: 0,
        itemsUsed: 0,
      };
      const next = { ...current };

      for (const [key, value] of Object.entries(delta || {})) {
        next[key] = Math.max(0, (next[key] || 0) + (Number(value) || 0));
      }

      return {
        ...normalized,
        [unitId]: next,
      };
    });
  };

  const getBattleMvp = () => {
    const normalized = normalizeUnitBattleStats(unitBattleStats);

    return Object.entries(normalized)
      .map(([unitId, stats]) => {
        const unit =
          party.find((member) => member.id === unitId) ||
          units.find((member) => member.id === unitId);

        return {
          unitId,
          unit,
          stats,
          score: getUnitBattleScore(stats),
        };
      })
      .filter((entry) => entry.unit && entry.score > 0)
      .sort((a, b) => b.score - a.score)[0] || null;
  };

  const getTopBattleUnits = () => {
    const normalized = normalizeUnitBattleStats(unitBattleStats);

    return Object.entries(normalized)
      .map(([unitId, stats]) => {
        const unit =
          party.find((member) => member.id === unitId) ||
          units.find((member) => member.id === unitId);

        return {
          unitId,
          unit,
          stats,
          score: getUnitBattleScore(stats),
        };
      })
      .filter((entry) => entry.unit && entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  };

  const battleMvp = getBattleMvp();
  const topBattleUnits = getTopBattleUnits();



  const registerLootDrop = (enemy) => {
    const loot = rollEnemyLoot(enemy, selectedStage, settings.difficulty);
    const lootText = formatLoot(loot);

    if (!lootText) return [];

    setBattleLoot((prev) => mergeLoot(prev, loot));
    addBattleStats({ lootDrops: 1 });
    playSfx("loot");

    return [`🎁 전리품 획득: ${lootText}`];
  };



  useEffect(() => {
    localStorage.setItem("cheonsu_settings_v1", JSON.stringify(settings));
  }, [settings]);

  const bestPartyUnit = getBestPartyUnit(party);
  const supportSeenCount = countSeenSupportDialogues(supportDialoguesSeen);
  const estimatedKillCount = estimateKillCount(logs);
  const completedRate = Math.round((clearedStages.length / stages.length) * 100);
  const masterySummary = getMasterySummary(stageMastery);
  const masteryRewardProgress = getMasteryRewardProgress(stageMastery, claimedMasteryRewards);
  const claimableMasteryRewardCount = masteryRewardProgress.filter((reward) => reward.claimable).length;
  const masteryPlannerItems = getMasteryPlannerItems({
    stages,
    stageMastery,
    clearedStages,
    unlockedStages: playableStageIds,
  });
  const masteryPlannerSummary = getMasteryPlannerSummary(stageMastery, clearedStages);

  useEffect(() => {
    const timer = setTimeout(() => setAppLoading(false), 900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleError = (event) => {
      const entry = createCrashLogEntry({
        message: event?.message || event?.error?.message || "알 수 없는 오류",
        stack: event?.error?.stack || "",
        screen,
        source: "runtime",
      });
      setRuntimeError({
        message: entry.message,
        stack: entry.stack,
        time: new Date().toLocaleString(),
      });
      setCrashLogs((prev) => {
        const next = [entry, ...prev].slice(0, 50);
        saveCrashLogs(next);
        return next;
      });
    };

    const handleRejection = (event) => {
      const reason = event?.reason;
      const entry = createCrashLogEntry({
        message: reason?.message || String(reason || "Promise 오류"),
        stack: reason?.stack || "",
        screen,
        source: "promise",
      });
      setRuntimeError({
        message: entry.message,
        stack: entry.stack,
        time: new Date().toLocaleString(),
      });
      setCrashLogs((prev) => {
        const next = [entry, ...prev].slice(0, 50);
        saveCrashLogs(next);
        return next;
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);


  useEffect(() => {
    if (
      autoBattleEnabled &&
      screen === "battle" &&
      turn === "ally" &&
      !turnBusy &&
      !movingUnit &&
      !battle &&
      !battleResolving &&
      !result &&
      units.some(isUnitReady)
    ) {
      const timer = setTimeout(() => commandAutoBattleTurn(), 320);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [autoBattleEnabled, screen, turn, turnBusy, movingUnit, battle, battleResolving, result, units]);


  const resetSaveData = () => {
    const ok = window.confirm("저장 데이터를 초기화할까요? 이 작업은 되돌릴 수 없습니다.");
    if (!ok) return;

    localStorage.removeItem(SAVE_KEY);
    playSfx("miss");
    setCampMessage("저장 데이터가 초기화되었습니다.");
    alert("저장 데이터가 초기화되었습니다.");
    setScreen("promo");
  };

  const updateSetting = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));

    if (key === "soundOn" && value) {
      playCheonsuSfx("confirm", true, settings.sfxVolume / 100);
    }
  };

  const saveUpdateManifestUrl = (nextUrl = updateManifestUrl) => {
    const normalizedUrl = String(nextUrl || "").trim() || DEFAULT_UPDATE_MANIFEST_URL;
    setUpdateManifestUrl(normalizedUrl);

    try {
      localStorage.setItem(UPDATE_MANIFEST_URL_KEY, normalizedUrl);
    } catch {
      // Local storage can fail in private or restricted WebView contexts.
    }

    setUpdateCheck(createIdleUpdateState());
    playSfx("confirm");
  };

  const resetUpdateManifestUrl = () => {
    saveUpdateManifestUrl(DEFAULT_UPDATE_MANIFEST_URL);
  };

  const checkForAppUpdate = async () => {
    const url = String(updateManifestUrl || "").trim() || DEFAULT_UPDATE_MANIFEST_URL;

    saveUpdateManifestUrl(url);
    setUpdateCheck({
      status: "checking",
      message: "최신 버전 정보를 확인하는 중입니다.",
      latest: null,
      checkedAt: null,
    });

    try {
      const latest = await fetchUpdateManifest(url);
      const comparison = compareVersions(latest.version, SAVE_VERSION);
      const checkedAt = new Date().toLocaleString();

      if (comparison > 0) {
        setUpdateCheck({
          status: "available",
          message: `새 버전 v${latest.version}을 설치할 수 있습니다.`,
          latest,
          checkedAt,
        });
        playSfx(latest.required ? "boss" : "confirm");
        return;
      }

      setUpdateCheck({
        status: "current",
        message: `현재 v${SAVE_VERSION}이 최신 버전입니다.`,
        latest,
        checkedAt,
      });
      playSfx("confirm");
    } catch (error) {
      setUpdateCheck({
        status: "error",
        message: error?.message || "업데이트 확인에 실패했습니다.",
        latest: null,
        checkedAt: new Date().toLocaleString(),
      });
      playSfx("miss");
    }
  };

  const openUpdateDownload = () => {
    const url = updateCheck.latest?.apkUrl;

    if (!url) {
      alert("다운로드 링크가 아직 없습니다.");
      return;
    }

    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = url;
    }
  };

  const copyUpdateDownloadLink = async () => {
    const url = updateCheck.latest?.apkUrl || updateManifestUrl;

    try {
      await navigator.clipboard.writeText(url);
      playSfx("confirm");
      alert("업데이트 링크를 복사했습니다.");
    } catch {
      playSfx("miss");
      alert(url);
    }
  };

  const playSfx = (type) => {
    playCheonsuSfx(type, settings.soundOn, settings.sfxVolume / 100);
  };

  const playMusicCue = (type) => {
    playCheonsuJingle(type, settings.musicOn, settings.sfxVolume / 100);
  };

  const copyRuntimeError = async () => {
    if (!runtimeError) return;

    const text = JSON.stringify(
      {
        version: SAVE_VERSION,
        screen,
        error: runtimeError,
        userAgent: navigator.userAgent,
        time: new Date().toISOString(),
      },
      null,
      2
    );

    try {
      await navigator.clipboard.writeText(text);
      alert("오류 리포트를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const copyCrashLogs = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            version: SAVE_VERSION,
            logs: crashLogs,
            time: new Date().toISOString(),
          },
          null,
          2
        )
      );
      alert("오류 기록 전체를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const clearCrashLogs = () => {
    const ok = window.confirm("오류 기록을 모두 지울까요?");
    if (!ok) return;
    setCrashLogs([]);
    saveCrashLogs([]);
    alert("오류 기록을 비웠습니다.");
  };

  const convertCrashLogToFeedback = (log) => {
    if (!log) return;

    const feedback = createFeedbackFromCrashLog(log);
    const nextReports = [feedback, ...feedbackReports];
    setFeedbackReports(nextReports);
    saveFeedbackReports(nextReports);
    alert("오류 기록을 QA 피드백으로 등록했습니다.");
    setScreen("qa");
  };

  const convertAllCrashLogsToFeedback = () => {
    if (!crashLogs.length) {
      alert("등록할 오류 기록이 없습니다.");
      return;
    }

    const ok = window.confirm(`오류 기록 ${crashLogs.length}개를 QA 피드백으로 등록할까요?`);
    if (!ok) return;

    const feedbacks = crashLogs.map(createFeedbackFromCrashLog);
    const existingIds = new Set(feedbackReports.map((item) => item.id));
    const merged = [
      ...feedbacks.filter((item) => !existingIds.has(item.id)),
      ...feedbackReports,
    ];

    setFeedbackReports(merged);
    saveFeedbackReports(merged);
    alert("오류 기록을 QA 피드백으로 등록했습니다.");
    setScreen("qa");
  };

  const recoverToMenu = () => {
    setRuntimeError(null);
    setBattle(null);
    setBattleResolving(false);
    setResult(null);
    setCombatCutscene(null);
    setBossCutscene(null);
    setTurnBusy(false);
    setMovingUnit(null);
    setScreen("menu");
  };

  const copyPostLaunchAudit = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            version: SAVE_VERSION,
            audit: postLaunchAudit,
            readiness: releaseReadinessScore,
            launchGrade,
            saveHealth: saveHealthReport,
            time: new Date().toISOString(),
          },
          null,
          2
        )
      );
      alert("출시 후 점검 리포트를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const copyQaPriorityBoard = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            version: SAVE_VERSION,
            urgent: qaPriorityBoard.urgent,
            high: qaPriorityBoard.high,
            normalCount: qaPriorityBoard.normal.length,
            time: new Date().toISOString(),
          },
          null,
          2
        )
      );
      alert("QA 우선순위 보드를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const togglePhotoMode = () => {
    setPhotoMode((prev) => !prev);
    playSfx("confirm");
  };

  const cyclePhotoTheme = () => {
    const nextId = getNextPhotoThemeId(settings.photoTheme);
    updateSetting("photoTheme", nextId);
    playSfx("confirm");
  };

  const saveCurrentSnapshot = () => {
    const entry = createSnapshotEntry({
      screen,
      selectedStage,
      selectedPlayerTitleName,
      commanderLevel,
      photoTheme: settings.photoTheme,
      note: snapshotNote,
    });

    setSnapshotGallery((prev) => [entry, ...prev].slice(0, 30));
    setSnapshotNote("");
    playSfx("save");
    alert("스냅샷 기록을 갤러리에 저장했습니다.");
  };

  const deleteSnapshotEntry = (id) => {
    setSnapshotGallery((prev) => prev.filter((entry) => entry.id !== id));
    playSfx("miss");
  };

  const copySnapshotGallery = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshotGallery, null, 2));
      playSfx("save");
      alert("스냅샷 갤러리 목록을 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const copyHallOfFame = async () => {
    const text = createHallOfFameShareText({
      party,
      careerStats,
      clearedStages,
      claimedAchievements,
      snapshotGallery,
      unlockedCodexCount,
      version: SAVE_VERSION,
    });

    try {
      await navigator.clipboard.writeText(text);
      playSfx("save");
      alert("명예의 전당 요약을 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const handleInstallPWA = async () => {
    playSfx("confirm");

    if (pwaStatus.standalone || pwaStatus.installed) {
      alert("이미 앱처럼 실행 중입니다.");
      return;
    }

    if (!installPrompt) {
      alert("현재 브라우저에서는 자동 설치 버튼을 사용할 수 없습니다. Chrome 메뉴의 '앱 설치' 또는 '홈 화면에 추가'를 사용해 주세요.");
      return;
    }

    installPrompt.prompt();

    try {
      const choice = await installPrompt.userChoice;

      setInstallPrompt(null);
      setPwaStatus((prev) => ({
        ...prev,
        installable: false,
        installed: choice.outcome === "accepted",
      }));
    } catch {
      setInstallPrompt(null);
    }
  };


  const pushVisualEffect = (effect) => {
    if (!settings.effectsOn) return;

    const id = `${Date.now()}-${Math.random()}`;
    const nextEffect = { id, ...effect };

    setVisualEffects((prev) => [...prev, nextEffect]);

    setTimeout(() => {
      setVisualEffects((prev) => prev.filter((item) => item.id !== id));
    }, effect.duration || 720);
  };

  const pushDamagePopup = (popup) => {
    if (!settings.effectsOn) return;

    const id = `${Date.now()}-${Math.random()}`;
    const nextPopup = { id, ...popup };

    setDamagePopups((prev) => [...prev, nextPopup]);

    setTimeout(() => {
      setDamagePopups((prev) => prev.filter((item) => item.id !== id));
    }, popup.duration || 900);
  };

  const triggerScreenShake = (strong = false) => {
    if (!settings.shakeOn) return;

    setScreenShake(strong ? "strong" : "normal");

    setTimeout(() => {
      setScreenShake(false);
    }, strong ? 520 : 320);
  };

  const triggerUnitActionMotion = (battleInfo, outcome) => {
    if (!settings.effectsOn || !battleInfo?.attacker || !battleInfo?.defender) return;

    const rawDx = Math.sign((battleInfo.defender.x ?? 0) - (battleInfo.attacker.x ?? 0));
    const rawDy = Math.sign((battleInfo.defender.y ?? 0) - (battleInfo.attacker.y ?? 0));
    const direction = Math.abs(rawDx) >= Math.abs(rawDy)
      ? rawDx >= 0 ? "right" : "left"
      : rawDy >= 0 ? "down" : "up";
    const type = battleInfo.mode === "skill"
      ? "skill"
      : battleInfo.mode === "counter"
      ? "counter"
      : battleInfo.mode === "assist"
      ? "assist"
      : outcome?.hit
      ? "attack"
      : "miss";
    const duration = getCombatMotionDuration(battleInfo, outcome);
    const id = `${battleInfo.attacker.id}-${Date.now()}-${Math.random()}`;

    setActionMotion({
      id,
      attackerId: battleInfo.attacker.id,
      dx: rawDx || 0,
      dy: rawDy || 0,
      direction,
      motionKey: getUnitWeaponMotionKey(battleInfo.attacker, battleInfo, outcome),
      type,
      duration,
    });

    setTimeout(() => {
      setActionMotion((current) => (current?.id === id ? null : current));
    }, duration + 80);
  };

  const triggerCombatVisual = (battleInfo, outcome, delay = 0) => {
    if (!battleInfo?.defender) return;

    setTimeout(() => {
      const type = getEffectType(battleInfo, outcome);
      const direction = getCombatDirection(battleInfo.attacker, battleInfo.defender);
      const motionKey = getUnitWeaponMotionKey(battleInfo.attacker, battleInfo, outcome);
      const motionDuration = getCombatMotionDuration(battleInfo, outcome);
      const impactDelay = getCombatImpactDelay(battleInfo, outcome);
      playSfx(type);

      if (battleInfo.attacker) {
        triggerUnitActionMotion(battleInfo, outcome);
        pushVisualEffect({
          x: battleInfo.attacker.x,
          y: battleInfo.attacker.y,
          type: `weapon-${motionKey}-field`,
          direction,
          duration: motionDuration,
        });
        pushVisualEffect({
          x: battleInfo.attacker.x,
          y: battleInfo.attacker.y,
          type: getCombatLaunchEffectType(battleInfo, outcome),
          direction,
          duration: motionDuration,
        });
        pushVisualEffect({
          x: battleInfo.attacker.x,
          y: battleInfo.attacker.y,
          type: getSkillMotionEffectType(battleInfo, outcome),
          direction,
          duration: Math.max(980, motionDuration - 160),
        });
      }

      setTimeout(() => {
        pushVisualEffect({
          x: battleInfo.defender.x,
          y: battleInfo.defender.y,
          type: `weapon-${motionKey}-strike`,
          direction,
          duration: Math.max(900, motionDuration - impactDelay + 160),
        });
        pushVisualEffect({
          x: battleInfo.defender.x,
          y: battleInfo.defender.y,
          type: getCombatImpactEffectType(battleInfo, outcome),
          direction,
          duration: Math.max(900, motionDuration - impactDelay),
        });

        pushVisualEffect({
          x: battleInfo.defender.x,
          y: battleInfo.defender.y,
          type,
          direction,
        });

        pushVisualEffect({
          x: battleInfo.defender.x,
          y: battleInfo.defender.y,
          type: outcome?.hit ? "impact-ring" : "evade-ring",
          direction,
          duration: 860,
        });

        pushDamagePopup({
          x: battleInfo.defender.x,
          y: battleInfo.defender.y,
          text: getPopupText(outcome),
          kind: getPopupKind(outcome),
          duration: 1200,
        });

        if (outcome?.crit || type === "shadow" || type === "fire") {
          pushVisualEffect({
            x: battleInfo.defender.x,
            y: battleInfo.defender.y,
            type: outcome?.crit ? "crit-burst" : `${type}-burst`,
            direction,
            duration: 980,
          });
          triggerScreenShake(Boolean(outcome?.crit));
        }

        if (battleInfo.defender?.type === "boss" && outcome?.hit) {
          pushVisualEffect({
            x: battleInfo.defender.x,
            y: battleInfo.defender.y,
            type: "boss-hit-burst",
            direction,
            duration: 980,
          });
          triggerScreenShake(true);
        }
      }, impactDelay);
    }, delay);
  };

  const triggerHazardVisuals = (currentHazards, targetUnits) => {
    if (!currentHazards || currentHazards.length === 0) return;

    playSfx("hazard");

    const hazardSet = new Set(currentHazards.map((h) => `${h.x},${h.y}`));
    const victims = targetUnits.filter(
      (unit) => unit.type === "ally" && hazardSet.has(`${unit.x},${unit.y}`)
    );

    currentHazards.forEach((hazard, index) => {
      pushVisualEffect({
        x: hazard.x,
        y: hazard.y,
        type: hazard.pattern || "hazard",
        duration: 920,
      });

      if (index === 0) triggerScreenShake(true);
    });

    victims.forEach((unit) => {
      const hazard = currentHazards.find((h) => `${h.x},${h.y}` === `${unit.x},${unit.y}`);
      pushDamagePopup({
        x: unit.x,
        y: unit.y,
        text: String(hazard?.damage || 6),
        kind: "hazard",
        duration: 1000,
      });
    });
  };


  const animateUnitMove = async (unit, toX, toY, duration = 260, frame = 0) => {
    if (!unit) return;

    if (unit.x === toX && unit.y === toY) {
      return;
    }

    setMovingUnit({
      id: unit.id,
      frame: `${unit.id}-${frame}-${Date.now()}`,
      unit,
      from: { x: unit.x, y: unit.y },
      to: { x: toX, y: toY },
      dx: toX - unit.x,
      dy: toY - unit.y,
      direction:
        Math.abs(toX - unit.x) >= Math.abs(toY - unit.y)
          ? toX - unit.x >= 0
            ? "right"
            : "left"
          : toY - unit.y >= 0
          ? "down"
          : "up",
      duration,
    });

    await waitForMove(duration);
  };

  const animateUnitMovePath = async (unit, path, stepDuration = 185) => {
    if (!unit || !path || path.length === 0) return;

    playSfx(unit.type === "ally" ? "confirm" : "turn");

    let current = { ...unit };

    for (let index = 0; index < path.length; index += 1) {
      const step = path[index];

      await animateUnitMove(
        current,
        step.x,
        step.y,
        Math.max(135, stepDuration),
        index
      );

      current = {
        ...current,
        x: step.x,
        y: step.y,
      };

      await waitForMove(battleSpeedConfig.stepGapMs);
    }

    return current;
  };

  const moveSelectedUnitTo = async (x, y, moveTileInfo = null) => {
    if (turn !== "ally" || turnBusy || movingUnit || battle || result) return;

    const movingAlly = units.find((unit) => unit.id === selectedUnit);
    const targetInfo =
      moveTileInfo ||
      getMoveTiles(movingAlly, units, activeMap).find((tile) => tile.x === x && tile.y === y);
    const occupied = units.some((unit) => unit.id !== movingAlly?.id && unit.x === x && unit.y === y);

    if (!movingAlly || movingAlly.type !== "ally") {
      setLogs((prev) => ["먼저 이동할 아군을 선택하세요.", ...prev]);
      return;
    }

    if (movingAlly.acted || movingAlly.moved) {
      setLogs((prev) => [`${movingAlly.name}은 이번 턴에 더 이상 이동할 수 없습니다.`, ...prev]);
      return;
    }

    if (!targetInfo || occupied) {
      setLogs((prev) => [`${movingAlly.name}이 이동할 수 없는 칸입니다.`, ...prev]);
      return;
    }

    setTurnBusy(true);
    closeMobileCombatPanels();

    try {
      const stayingInPlace = movingAlly.x === x && movingAlly.y === y;
      const movePath = stayingInPlace ? [] : findMovePath(movingAlly, x, y, units, activeMap);

      if (!stayingInPlace) {
        await animateUnitMovePath(
          movingAlly,
          movePath.length ? movePath : [{ x, y }],
          battleSpeedConfig.allyStepMs
        );
      }

      setUnits((prev) =>
        prev.map((unit) =>
          unit.id === movingAlly.id ? { ...unit, x, y, moved: true } : unit
        )
      );
      setMoveUndo({
        unitId: movingAlly.id,
        from: { x: movingAlly.x, y: movingAlly.y },
        to: { x, y },
        round,
      });
      setSelectedUnit(movingAlly.id);
      setInspectedUnitId(null);
      setMode("attack");
      scrollBattleMapToCell(x, y, "smooth");

      const traitNote = targetInfo?.traitBonus
        ? ` (${getUnitMoveTrait(movingAlly).name} 효과)`
        : targetInfo?.traitPenalty
        ? " (지형 불리)"
        : "";

      setLogs((prev) => [
        stayingInPlace
          ? `${movingAlly.name} 제자리 이동 완료. 공격, 스킬 또는 대기를 선택하세요.`
          : `${movingAlly.name} 이동 완료. 이동력 ${targetInfo?.cost || 1}/${movingAlly.move || "-"} 사용${traitNote}. 공격 또는 대기를 선택하세요.`,
        ...prev,
      ]);
    } finally {
      setMovingUnit(null);
      setTurnBusy(false);
    }
  };

  const undoSelectedMove = () => {
    if (!selected || !canUndoMove || turnBusy || movingUnit || battle || result) return;

    const originOccupied = units.some(
      (unit) =>
        unit.id !== selected.id &&
        unit.hp > 0 &&
        unit.x === moveUndo.from.x &&
        unit.y === moveUndo.from.y
    );

    if (originOccupied) {
      setLogs((prev) => [`${selected.name}의 원래 위치가 막혀 이동을 취소할 수 없습니다.`, ...prev]);
      playSfx("miss");
      return;
    }

    setUnits((prev) =>
      prev.map((unit) =>
        unit.id === selected.id
          ? { ...unit, x: moveUndo.from.x, y: moveUndo.from.y, moved: false }
          : unit
      )
    );
    setSelectedUnit(selected.id);
    setInspectedUnitId(null);
    setMode("move");
    setMoveUndo(null);
    closeMobileCombatPanels();
    scrollBattleMapToCell(moveUndo.from.x, moveUndo.from.y, "smooth");
    playSfx("confirm");
    setLogs((prev) => [`${selected.name} 이동 취소. 다시 이동할 수 있습니다.`, ...prev]);
  };

  const selectBattleAllyForAction = (unit, sourceLabel = "선택") => {
    if (!unit || unit.type !== "ally") return false;

    setSelectedUnit(unit.id);
    setInspectedUnitId(null);
    setMode(unit.moved ? "attack" : "move");
    focusUnitOnMap(unit);
    setLogs((prev) => [`${unit.name} ${sourceLabel}.`, ...prev]);
    return true;
  };

  const inspectBattleUnit = (unit, sourceLabel = "확인") => {
    if (!unit) return false;

    setInspectedUnitId(unit.id);
    focusUnitOnMap(unit);
    setLogs((prev) => [
      `${sourceLabel}: ${unit.name} · HP ${unit.hp}/${unit.maxHp} · ${unit.type === "ally" && unit.acted ? "행동 완료" : getInspectUnitRole(unit)}`,
      ...prev,
    ]);
    return true;
  };

  const handleBattleTilePress = (x, y, source = "click") => {
    if (turn !== "ally" || turnBusy || movingUnit || battle || result) return false;

    const tileType = activeMap[y]?.[x];
    const unit = units.find((candidate) => candidate.x === x && candidate.y === y);
    const moveTileInfo = moveTiles.find((tile) => tile.x === x && tile.y === y);
    const movable = mode === "move" && selectedUnit && Boolean(moveTileInfo);
    const attackable =
      (mode === "attack" || mode === "skill") &&
      selectedUnit &&
      attackTiles.some((tile) => tile.x === x && tile.y === y);

    if (unit?.type === "ally" && unit.id === selectedUnit && movable && !unit.acted && !unit.moved) {
      void moveSelectedUnitTo(x, y, moveTileInfo);
      return true;
    }

    if (unit?.type === "ally" && !unit.acted) {
      selectBattleAllyForAction(unit, "선택됨");
      return true;
    }

    if (unit?.type === "ally") {
      inspectBattleUnit(unit, unit.acted ? "행동 완료 아군 확인" : "아군 확인");
      return true;
    }

    if (selected && unit && unit.type !== "ally" && attackable) {
      setInspectedUnitId(unit.id);
      focusUnitOnMap(unit);
      openBattle(selected, unit, mode === "skill" ? "skill" : "attack");
      return true;
    }

    if (unit && unit.type !== "ally") {
      inspectBattleUnit(unit, `${unit.name} 확인`);
      return true;
    }

    if (selectedUnit && mode === "move" && isBlockedBattleTile(tileType)) {
      playSfx("miss");
      setLogs((prev) => [`${getInspectTerrainLabel(tileType)}: 이동할 수 없는 지형입니다.`, ...prev]);
      return false;
    }

    if (selectedUnit && movable && !unit) {
      void moveSelectedUnitTo(x, y, moveTileInfo);
      return true;
    }

    if (source === "pointer" && selectedUnit && mode === "move") {
      setLogs((prev) => [`이동 가능한 파란 칸을 선택하세요. 현재 위치: ${x + 1},${y + 1}`, ...prev]);
    }

    return false;
  };

  const handleBattleUnitPress = (event, unit) => {
    event.stopPropagation();

    if (!unit) return;

    handleBattleTilePress(unit.x, unit.y, "unit");
  };

  const clearVisuals = () => {
    setVisualEffects([]);
    setDamagePopups([]);
    setMovingUnit(null);
    setScreenShake(false);
  };


  const showStageBanner = (banner, duration = 1650) => {
    const id = `${Date.now()}-${Math.random()}`;
    setStageBanner({ id, ...banner });

    setTimeout(() => {
      setStageBanner((current) => (current?.id === id ? null : current));
    }, duration);
  };

  const showVictoryDirecting = (summary) => {
    setLastClearSummary(summary);
    showStageBanner(
      {
        type: "clear",
        label: `RANK ${summary.rank}`,
        title: summary.stageTitle,
        subtitle: getClearRankText(summary.rank),
      },
      1900
    );
  };

  const showDefeatDirecting = () => {
    showStageBanner(
      {
        type: "defeat",
        label: "DEFEAT",
        title: selectedStage?.title || "전투 실패",
        subtitle: "카일이 쓰러졌습니다.",
      },
      1600
    );
  };

  const showBossCutscene = (boss, type = "intro", duration = 1850) => {
    if (!boss) return;

    const id = `${Date.now()}-${Math.random()}`;
    const isPhase = type === "phase2";

    setBossCutscene({
      id,
      boss,
      type,
      label: isPhase ? "PHASE 2" : "BOSS",
      title: isPhase ? `${boss.name} 각성` : `${boss.name} 등장`,
      subtitle: isPhase
        ? `${boss.skill || "어둠의 파동"}이 전장을 뒤덮습니다.`
        : "강력한 적장이 전장에 모습을 드러냈습니다.",
    });

    playSfx(isPhase ? "phase" : "boss");
    triggerScreenShake(true);

    setTimeout(() => {
      setBossCutscene((current) => (current?.id === id ? null : current));
    }, duration);
  };

  const showTurnPhaseBanner = (side, nextRound = round) => {
    const isAlly = side === "ally";
    const id = `${Date.now()}-${Math.random()}`;

    setTurnPhaseBanner({
      id,
      side,
      label: isAlly ? "PLAYER PHASE" : "ENEMY PHASE",
      title: isAlly ? "아군 턴" : "적군 턴",
      subtitle: isAlly
        ? `${nextRound}라운드 · 지휘를 시작하세요`
        : `${nextRound}라운드 · 적의 행동이 시작됩니다`,
    });

    window.setTimeout(() => {
      setTurnPhaseBanner((current) => (current?.id === id ? null : current));
    }, 1350);
  };


  const newGame = () => {
    playSfx("start");
    const freshParty = getInitialParty();
    setSelectedStage(null);
    setDeploymentStage(null);
    setFinalDeployCheckOpen(false);
    setBattleLoot(createEmptyLoot());
    setBattleStats(createDefaultBattleStats());
    setUnitBattleStats(createDefaultUnitBattleStats());
    setCareerStats(createDefaultCareerStats());
    setStageMastery({});
    setStageNotes({});
    setStageNoteTags({});
    setStrategyReportArchive([]);
    setStrategyFavoriteIds([]);
    setStrategyQuickSlots({});
    setStrategyQuickSlotNames({});
    setClaimedMasteryRewards([]);
    setClaimedAchievements([]);
    setClaimedChallenges([]);
    setSelectedPlayerTitle("rookie");
    setSelectedProfileFrame("classic");
    setSnapshotGallery([]);
    setDailyLoginData(normalizeDailyLoginData({}));
    setEventData(normalizeEventData({}));
    setDeployedIds(STAGE_ONE_DEFAULT_DEPLOY_IDS);
    setDeployFilter("all");
    setDeploySort("default");
    setDeploymentHint("균형 편성을 추천합니다.");
    setGearEnhance({});
    const enhancedFreshParty = applyGearEnhanceToParty(freshParty, {});
    setParty(enhancedFreshParty);
    setUnits(mergePartyIntoStage(stages[0], enhancedFreshParty));
    setSelectedUnit(null);
    setInspectedUnitId(null);
    setMode("move");
    setTurn("ally");
    setRound(1);
    setStoryScene(null);
    setBattle(null);
    setBattleResolving(false);
    setCombatCutscene(null);
    setBossCutscene(null);
    setResult(null);
    setPhaseBanner(null);
    setStageBanner(null);
    setTurnPhaseBanner(null);
    setLastClearSummary(null);
    setBattleLoot(createEmptyLoot());
    setBattleStats(createDefaultBattleStats());
    setUnitBattleStats(createDefaultUnitBattleStats());
    setHazards([]);
    setTurnBusy(false);
    setMovingUnit(null);
    setMoveUndo(null);
    clearVisuals();
    setItemOpen(false);
    setShopOpen(false);
    setCampTab("party");
    setEquipmentOpen(false);
    setForgeOpen(false);
    setTrainingOpen(false);
    setDispatchOpen(false);
    setSkillOpen(false);
    setPromoteOpen(false);
    setTrainingUsed(false);
    setSupportOpen(false);
    setSupportPoints({
      hero_lina: 0,
      hero_bram: 0,
      lina_bram: 0,
    });
    setSupportDialoguesSeen({});
    setActiveSupportScene(null);
    setGold(300);
    setStageRewardClaimed(false);
    setUnlockedStages(getPlaytestUnlockedStageIds([1]));
    setClearedStages([]);
    setGearInventory(["ironSword", "leatherArmor", "fireStaff", "mageRobe"]);
    setInventory(createDefaultInventory());
    setCampMessage("모닥불이 조용히 타오른다. 동료들이 다음 전투를 준비하고 있다.");
    setLogs(["새 게임 시작.", "스테이지를 선택하세요."]);
    setLogFilter("all");
    setScreen("campaign");
  };

  const beginStageBattle = (stage) => {
    if (!playableStageIds.includes(stage.id)) return;
    playSfx("start");
    setStoryScene(null);
    const chosenParty = deployedIds.length
      ? deployedIds
          .map((id) => party.find((unit) => unit.id === id))
          .filter(Boolean)
      : party;
    const battleParty = chosenParty.length ? chosenParty : party.slice(0, MAX_DEPLOY_COUNT);
    const battleStage = expandStageForLargeBattle(stage, battleParty.length);
    setSelectedStage(battleStage);
    const stagedUnits = mergePartyIntoStage(
      battleStage,
      applyGearEnhanceToParty(battleParty, gearEnhance)
    );
    const battleUnits = applyDifficultyToUnits(stagedUnits, settings.difficulty, settings.balancePreset);
    const openingAlly = battleUnits.find((unit) => unit.id === "hero" && unit.type === "ally") ||
      battleUnits.find((unit) => unit.type === "ally");

    setUnits(battleUnits);
    setSelectedUnit(openingAlly?.id || null);
    setInspectedUnitId(null);
    setMode("move");
    setMapVisibility("tactical");
    setTurn("ally");
    setRound(1);
    setBattle(null);
    setBattleResolving(false);
    setCombatCutscene(null);
    setBossCutscene(null);
    setResult(null);
    setPhaseBanner(null);
    setStageBanner(null);
    setTurnPhaseBanner(null);
    setLastClearSummary(null);
    setHazards([]);
    setTurnBusy(false);
    setMoveUndo(null);
    setAutoBattleEnabled(false);
    setBattleGuideHidden(false);
    closeMobileCombatPanels();
    clearVisuals();
    setItemOpen(false);
    setShopOpen(false);
    setCampTab("party");
    setEquipmentOpen(false);
    setTrainingOpen(false);
    setSupportOpen(false);
    setActiveSupportScene(null);
    setStageRewardClaimed(false);
    setCampMessage("모닥불이 조용히 타오른다. 동료들이 다음 전투를 준비하고 있다.");
    setLogs([
      openingAlly
        ? `${openingAlly.name} 선택. 파란 범위 안에서 이동할 위치를 고르세요.`
        : "아군을 선택하세요.",
      `${battleStage.title} 대규모 전투 시작.`,
    ]);
    setLogFilter("all");
    setScreen("battle");
    showTurnPhaseBanner("ally", 1);
    playMusicCue("battle");
    showStageBanner(
      {
        type: "start",
        label: `STAGE ${battleStage.id}`,
        title: battleStage.title,
        subtitle: `${battleStage.objective} · ${battleStage.map[0].length}x${battleStage.map.length} 대형 전장`,
      },
      1700
    );

    const bossUnit = battleStage.units.find((unit) => unit.type === "boss");
    if (bossUnit) {
      setTimeout(() => showBossCutscene(bossUnit, "intro", 1850), 720);
    }
  };

  const openStoryScene = (stage, type, onComplete) => {
    const lines = STORY_SCENES[stage?.id]?.[type] || [];

    if (!lines.length) {
      if (onComplete === "battle") {
        beginStageBattle(stage);
      }

      if (onComplete === "camp") {
        finishGoCamp();
      }

      return;
    }

    playSfx("confirm");
    setSelectedStage(stage);
    setStoryScene({
      stage,
      type,
      lines,
      index: 0,
      onComplete,
    });
    setScreen("story");
  };


  const getManualSlotSummary = (slot) => {
    const raw = localStorage.getItem(getManualSaveSlotKey(slot));
    return raw ? getSaveSummary(raw) : null;
  };

  const saveManualSlot = (slot) => {
    const raw = localStorage.getItem(SAVE_KEY);

    if (!raw) {
      saveGame();
      const saved = localStorage.getItem(SAVE_KEY);

      if (saved) {
        localStorage.setItem(getManualSaveSlotKey(slot), saved);
        playSfx("save");
        alert(`수동 저장 슬롯 ${slot}에 저장했습니다.`);
      }

      return;
    }

    localStorage.setItem(getManualSaveSlotKey(slot), raw);
    playSfx("save");
    alert(`수동 저장 슬롯 ${slot}에 저장했습니다.`);
  };

  const loadManualSlot = (slot) => {
    const raw = localStorage.getItem(getManualSaveSlotKey(slot));

    if (!raw) {
      alert(`수동 저장 슬롯 ${slot}이 비어 있습니다.`);
      return;
    }

    const currentRaw = localStorage.getItem(SAVE_KEY);
    if (currentRaw) {
      localStorage.setItem(SAVE_PREVIOUS_KEY, currentRaw);
    }

    localStorage.setItem(SAVE_KEY, raw);
    playSfx("confirm");
    continueGame();
  };

  const restoreAutoBackup = (key = SAVE_BACKUP_KEY) => {
    const raw = localStorage.getItem(key);

    if (!raw) {
      alert("복구할 백업 저장이 없습니다.");
      return;
    }

    const currentRaw = localStorage.getItem(SAVE_KEY);
    if (currentRaw) {
      localStorage.setItem(SAVE_PREVIOUS_KEY, currentRaw);
    }

    localStorage.setItem(SAVE_KEY, raw);
    playSfx("confirm");
    continueGame();
  };

  const exportSaveToClipboard = async () => {
    const raw = localStorage.getItem(SAVE_KEY);

    if (!raw) {
      alert("내보낼 저장 데이터가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(raw);
      playSfx("save");
      alert("현재 저장 데이터를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    }
  };

  const copyDiagnosticsReport = async () => {
    const report = createDiagnosticsReport({
      version: SAVE_VERSION,
      screen,
      selectedStage,
      party,
      units,
      gold,
      inventory,
      clearedStages,
      unlockedStages,
      settings,
      pwaStatus,
    });

    const text = JSON.stringify(
      {
        ...report,
        note: bugNote || "",
      },
      null,
      2
    );

    try {
      await navigator.clipboard.writeText(text);
      playSfx("save");
      alert("진단 리포트를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    }
  };


  const addFeedbackReport = () => {
    const text = bugNote.trim();

    if (!text) {
      alert("버그 메모 또는 개선 의견을 먼저 입력해 주세요.");
      return;
    }

    const report = {
      id: `${Date.now()}-${Math.random()}`,
      type: bugType,
      status: "open",
      note: text,
      screen,
      version: SAVE_VERSION,
      stage: selectedStage?.title || "",
      createdAt: new Date().toISOString(),
    };

    const nextReports = [report, ...feedbackReports].slice(0, 50);
    setFeedbackReports(nextReports);
    saveFeedbackReports(nextReports);
    setBugNote("");
    playSfx("save");
  };

  const updateFeedbackStatus = (id, status) => {
    const nextReports = feedbackReports.map((report) =>
      report.id === id ? { ...report, status } : report
    );
    setFeedbackReports(nextReports);
    saveFeedbackReports(nextReports);
  };

  const clearFeedbackReports = () => {
    const ok = window.confirm("등록한 피드백 기록을 모두 지울까요?");
    if (!ok) return;

    setFeedbackReports([]);
    saveFeedbackReports([]);
    playSfx("miss");
  };

  const copyFeedbackReports = async () => {
    const text = JSON.stringify(feedbackReports, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      playSfx("save");
      alert("피드백 목록을 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };


  const copyPlaytestReport = async () => {
    const report = {
      version: SAVE_VERSION,
      playtestInsight,
      feedbackTypeCounts,
      careerStats,
      clearedStages,
      settings,
      createdAt: new Date().toISOString(),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      playSfx("save");
      alert("플레이테스트 리포트를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const applyRecommendedBalancePreset = () => {
    updateSetting("balancePreset", playtestInsight.recommendedPreset);
    playSfx("confirm");
    alert(`${getBalancePresetConfig(playtestInsight.recommendedPreset).label} 프리셋을 적용했습니다.`);
  };

  const claimAchievementReward = (achievementId) => {
    const achievement = achievementProgress.find((item) => item.id === achievementId);

    if (!achievement || !achievement.claimable) return;

    const reward = achievement.reward || {};

    setGold((prev) => prev + (reward.gold || 0));

    setInventory((prev) => {
      const next = normalizeBattleInventory(prev);
      ["potion", "hiPotion", "remedy", "powerCharm", "guardCharm"].forEach((key) => {
        if (reward[key]) {
          next[key] = getItemCount(next, key) + reward[key];
        }
      });
      return next;
    });

    setClaimedAchievements((prev) => [...new Set([...prev, achievementId])]);
    playSfx("victory");
    setCampMessage(`업적 달성: ${achievement.title}. 보상 ${getAchievementRewardText(reward)} 획득.`);
  };


  const claimMasteryReward = (rewardId) => {
    const masteryReward = masteryRewardProgress.find((item) => item.id === rewardId);
    if (!masteryReward || !masteryReward.claimable) return;

    const reward = masteryReward.reward || {};
    setGold((prev) => prev + (reward.gold || 0));

    setInventory((prev) => {
      const next = normalizeBattleInventory(prev);
      ["potion", "hiPotion", "remedy", "powerCharm", "guardCharm"].forEach((key) => {
        if (reward[key]) next[key] = getItemCount(next, key) + reward[key];
      });
      return next;
    });

    setClaimedMasteryRewards((prev) => [...new Set([...prev, rewardId])]);
    playSfx("victory");
    setCampMessage(`마스터리 보상: ${masteryReward.title}. ${getRewardTextGeneric(reward)} 획득.`);
  };


  const updateStageNote = (stageId, text) => {
    setStageNotes((prev) => ({
      ...normalizeStageNotes(prev),
      [String(stageId)]: String(text || "").slice(0, 500),
    }));
  };

  const applyDefaultStageNote = (stage) => {
    if (!stage) return;
    updateStageNote(stage.id, getDefaultStrategyNote(stage));
    playSfx("confirm");
  };

  const clearStageNote = (stageId) => {
    setStageNotes((prev) => {
      const next = { ...normalizeStageNotes(prev) };
      delete next[String(stageId)];
      return next;
    });
    playSfx("miss");
  };

  const toggleStageTag = (stageId, tagId) => {
    setStageNoteTags((prev) => {
      const normalized = normalizeStageNoteTags(prev);
      const key = String(stageId);
      const current = normalized[key] || [];
      const nextTags = current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId];

      return {
        ...normalized,
        [key]: nextTags,
      };
    });
  };

  const applyDefaultStageTags = (stage) => {
    if (!stage) return;

    setStageNoteTags((prev) => ({
      ...normalizeStageNoteTags(prev),
      [String(stage.id)]: getDefaultStrategyTags(stage),
    }));
    playSfx("confirm");
  };

  const clearStageTags = (stageId) => {
    setStageNoteTags((prev) => {
      const next = { ...normalizeStageNoteTags(prev) };
      delete next[String(stageId)];
      return next;
    });
    playSfx("miss");
  };

  const applyStrategyPreset = (stage, presetId = "safe") => {
    if (!stage) return;

    const preset = getStrategyTagPreset(presetId);

    setStageNoteTags((prev) => ({
      ...normalizeStageNoteTags(prev),
      [String(stage.id)]: preset.tags,
    }));

    if (!getStageNote(stageNotes, stage)) {
      updateStageNote(stage.id, `${preset.label}: ${preset.desc}`);
    }

    playSfx("confirm");
  };

  const applyStrategyPresetPreparation = (stage, presetId = null) => {
    if (!stage) return;

    const resolvedPresetId =
      presetId ||
      getStrategyPresetFromTags(getStageTags(stageNoteTags, stage)) ||
      getRecommendedPresetForStage(stage);
    const formationType = getDeployPresetForStrategyPreset(resolvedPresetId);
    const autoMode = getAutoBattleModeForStrategyPreset(resolvedPresetId);
    const formationIds = getDeployPresetIds(party, stage, formationType, MAX_DEPLOY_COUNT);
    const finalIds = getAutoFillDeploymentIds(party, formationIds, MAX_DEPLOY_COUNT);

    applyStrategyPreset(stage, resolvedPresetId);
    setDeployedIds(finalIds);
    setParty((prev) => autoEquipParty(prev, gearInventory, gearEnhance, finalIds));
    updateSetting("autoBattleMode", autoMode);
    setDeploymentHint(
      `${getStrategyTagPreset(resolvedPresetId).label} 기준으로 태그, 편성, 장비, 자동 전투 전략을 맞췄습니다.`
    );
    playSfx("victory");
  };


  const copyCurrentStrategyReport = async () => {
    if (!deploymentStage || !deploymentStrategyReport) return;

    const text = createStrategyReportText({
      stage: deploymentStage,
      report: deploymentStrategyReport,
      note: getStageNote(stageNotes, deploymentStage),
      deployedIds,
      party,
      settings,
    });

    try {
      await navigator.clipboard.writeText(text);
      playSfx("save");
      alert("출전 전략 리포트를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };


  const saveCurrentStrategyReportToArchive = () => {
    if (!deploymentStage || !deploymentStrategyReport) return;

    const entry = createStrategyReportArchiveEntry({
      stage: deploymentStage,
      report: deploymentStrategyReport,
      note: getStageNote(stageNotes, deploymentStage),
      deployedIds,
      party,
      settings,
    });

    setStrategyReportArchive((prev) => [entry, ...prev].slice(0, 50));
    playSfx("save");
    alert("전략 리포트를 보관함에 저장했습니다.");
  };

  const deleteStrategyReportArchiveEntry = (id) => {
    setStrategyReportArchive((prev) => prev.filter((entry) => entry.id !== id));
    setStrategyFavoriteIds((prev) => prev.filter((item) => item !== id));
    playSfx("miss");
  };

  const toggleStrategyFavorite = (id) => {
    setStrategyFavoriteIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
    playSfx("confirm");
  };

  const applyBestFavoriteStrategy = () => {
    const favoriteSet = new Set(strategyFavoriteIds || []);
    const bestFavorite = strategyReportArchive
      .filter((entry) => favoriteSet.has(entry.id))
      .sort((a, b) => (b.score || 0) - (a.score || 0))[0];

    if (!bestFavorite) {
      alert("즐겨찾기한 전략 리포트가 없습니다.");
      return;
    }

    applyArchivedStrategyReport(bestFavorite);
  };

  const assignStrategyQuickSlot = (slot, entryId) => {
    setStrategyQuickSlots((prev) => ({
      ...normalizeStrategyQuickSlots(prev),
      [String(slot)]: entryId,
    }));
    playSfx("confirm");
  };

  const clearStrategyQuickSlot = (slot) => {
    setStrategyQuickSlots((prev) => {
      const next = { ...normalizeStrategyQuickSlots(prev) };
      delete next[String(slot)];
      return next;
    });
    playSfx("miss");
  };

  const renameStrategyQuickSlot = (slot, name) => {
    setStrategyQuickSlotNames((prev) => ({
      ...normalizeStrategyQuickSlotNames(prev),
      [String(slot)]: String(name || "").slice(0, 24),
    }));
  };

  const clearStrategyQuickSlotName = (slot) => {
    setStrategyQuickSlotNames((prev) => {
      const next = { ...normalizeStrategyQuickSlotNames(prev) };
      delete next[String(slot)];
      return next;
    });
    playSfx("miss");
  };

  const copyQuickSlotSummary = async () => {
    try {
      await navigator.clipboard.writeText(
        createQuickSlotShareText(strategyReportArchive, strategyQuickSlots, strategyQuickSlotNames)
      );
      playSfx("save");
      alert("전략 빠른 슬롯 요약을 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const copyQuickSlotExportJson = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          getQuickSlotExportData(strategyReportArchive, strategyQuickSlots, strategyQuickSlotNames),
          null,
          2
        )
      );
      playSfx("save");
      alert("전략 빠른 슬롯 JSON을 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const importQuickSlotJson = () => {
    const imported = normalizeImportedStrategySlotData(strategySlotImportText);

    if (!imported || !imported.entries.length) {
      alert("가져올 수 있는 전략 슬롯 JSON이 아닙니다.");
      return;
    }

    setStrategyReportArchive((prev) => {
      const ids = new Set(prev.map((entry) => entry.id));
      const nextEntries = imported.entries.map((entry) =>
        ids.has(entry.id)
          ? {
              ...entry,
              id: `${entry.id}-import-${Date.now()}`,
            }
          : entry
      );

      return [...nextEntries, ...prev].slice(0, 80);
    });

    const actualSlots = {};
    imported.entries.forEach((entry, index) => {
      const slot = String(index + 1);
      actualSlots[slot] = entry.id;
    });

    setStrategyQuickSlots((prev) => ({
      ...normalizeStrategyQuickSlots(prev),
      ...actualSlots,
    }));
    setStrategyQuickSlotNames((prev) => ({
      ...normalizeStrategyQuickSlotNames(prev),
      ...imported.names,
    }));
    setStrategySlotImportText("");
    setFinalRcChecked({});
    playSfx("save");
    alert("전략 빠른 슬롯을 가져왔습니다.");
  };

  const pasteQuickSlotJsonFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setStrategySlotImportText(text);
      playSfx("confirm");
    } catch {
      alert("클립보드 읽기에 실패했습니다.");
    }
  };

  const clearAllStrategyQuickSlots = () => {
    const ok = window.confirm("전략 빠른 슬롯 1~4를 모두 비울까요?");
    if (!ok) return;
    setStrategyQuickSlots({});
    setStrategyQuickSlotNames({});
    playSfx("miss");
  };

  const copyStrategyReportArchive = async () => {
    try {
      await navigator.clipboard.writeText(createStrategyArchiveText(strategyReportArchive));
      playSfx("save");
      alert("전략 리포트 보관함을 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const toggleStrategyComparePick = (id) => {
    setCompareStrategyIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id].slice(-2);
    });
  };

  const copyStrategyCompare = async () => {
    if (!strategyCompareResult) {
      alert("비교할 리포트 2개를 선택해 주세요.");
      return;
    }

    try {
      await navigator.clipboard.writeText(createStrategyCompareText(strategyCompareResult));
      playSfx("save");
      alert("전략 비교 리포트를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const applyArchivedStrategyReport = (entry) => {
    if (!entry) return;

    const targetStage =
      stages.find((stage) => stage.id === entry.stageId) ||
      selectedStage ||
      stages[0];

    setSelectedStage(targetStage);
    setDeploymentStage(targetStage);
    setScreen("deployment");

    setStageNoteTags((prev) => ({
      ...normalizeStageNoteTags(prev),
      [String(targetStage.id)]: entry.tags || [],
    }));

    if (entry.note) {
      updateStageNote(targetStage.id, entry.note);
    }

    const presetId = getPresetIdFromLabel(entry.preset);
    const formationType = getDeployPresetForStrategyPreset(presetId);
    const autoMode = getAutoBattleModeForStrategyPreset(presetId);
    const formationIds = getDeployPresetIds(party, targetStage, formationType, MAX_DEPLOY_COUNT);
    const finalIds = getAutoFillDeploymentIds(party, formationIds, MAX_DEPLOY_COUNT);

    setDeployedIds(finalIds);
    setParty((prev) => autoEquipParty(prev, gearInventory, gearEnhance, finalIds));
    updateSetting("autoBattleMode", autoMode);
    setDeploymentHint(`보관함 전략 재적용: ${getStrategyArchiveReapplySummary(entry)}`);
    playSfx("confirm");
  };

  const applyBestComparedStrategy = () => {
    if (!strategyCompareResult) {
      alert("비교할 리포트 2개를 먼저 선택해 주세요.");
      return;
    }

    const better =
      (strategyCompareResult.to.score || 0) >= (strategyCompareResult.from.score || 0)
        ? strategyCompareResult.to
        : strategyCompareResult.from;

    applyArchivedStrategyReport(better);
  };

  const claimChallengeReward = (challengeId) => {
    const challenge = [...dailyChallengeProgress, ...weeklyChallengeProgress].find((item) => item.id === challengeId);

    if (!challenge || !challenge.claimable) return;

    const reward = challenge.reward || {};
    setGold((prev) => prev + (reward.gold || 0));

    setInventory((prev) => {
      const next = normalizeBattleInventory(prev);
      ["potion", "hiPotion", "remedy", "powerCharm", "guardCharm"].forEach((key) => {
        if (reward[key]) {
          next[key] = getItemCount(next, key) + reward[key];
        }
      });
      return next;
    });

    setClaimedChallenges((prev) => [...new Set([...prev, challengeId])]);
    playSfx("victory");
    setCampMessage(`도전 과제 완료: ${challenge.title}. 보상 ${getChallengeRewardText(reward)} 획득.`);
  };

  const claimDailyLoginReward = () => {
    if (dailyLoginStatus.claimedToday) return;

    const reward = dailyLoginStatus.nextReward || {};
    const today = dailyChallengeDateKey;

    setGold((prev) => prev + (reward.gold || 0));

    setInventory((prev) => {
      const next = normalizeBattleInventory(prev);
      ["potion", "hiPotion", "remedy", "powerCharm", "guardCharm"].forEach((key) => {
        if (reward[key]) {
          next[key] = getItemCount(next, key) + reward[key];
        }
      });
      return next;
    });

    setDailyLoginData((prev) => {
      const normalized = normalizeDailyLoginData(prev);
      return {
        claimedDates: [...new Set([...normalized.claimedDates, today])],
        lastClaimedDate: today,
        totalClaims: normalized.totalClaims + 1,
      };
    });

    playSfx("victory");
    setCampMessage(`일일 접속 보상 ${getDailyLoginRewardText(reward)} 획득.`);
  };

  const claimSeasonReward = () => {
    if (seasonClaimed) return;
    if (completedSeasonMissionCount < seasonMissions.length) {
      alert("시즌 미션을 모두 완료해야 시즌 보상을 받을 수 있습니다.");
      return;
    }

    const reward = seasonInfo.reward || {};
    setGold((prev) => prev + (reward.gold || 0));

    setInventory((prev) => {
      const next = normalizeBattleInventory(prev);
      ["potion", "hiPotion", "remedy", "powerCharm", "guardCharm"].forEach((key) => {
        if (reward[key]) {
          next[key] = getItemCount(next, key) + reward[key];
        }
      });
      return next;
    });

    setEventData((prev) => {
      const normalized = normalizeEventData(prev);
      return {
        claimedSeasonIds: [...new Set([...normalized.claimedSeasonIds, seasonInfo.id])],
        lastClaimedAt: new Date().toISOString(),
      };
    });

    playSfx("victory");
    setCampMessage(`${seasonInfo.title} 시즌 보상 ${getEventRewardText(reward)} 획득.`);
  };

  const resetAppCacheGuide = () => {
    if (isNativeCapacitorRuntime()) {
      alert("앱 버전은 새 APK 설치 시 함께 갱신됩니다.");
      return;
    }

    const ok = window.confirm("앱 캐시를 새로고침합니다. 이후 Ctrl+F5 또는 브라우저 새로고침을 한 번 더 해주세요.");
    if (!ok) return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.update());
      });
    }

    playSfx("confirm");
    alert("캐시 갱신 요청을 보냈습니다. 새로고침해 주세요.");
  };

  const clearManualSlots = () => {
    const ok = window.confirm("수동 저장 슬롯 1~3을 모두 비울까요?");
    if (!ok) return;

    [1, 2, 3].forEach((slot) => localStorage.removeItem(getManualSaveSlotKey(slot)));
    playSfx("miss");
    alert("수동 저장 슬롯을 비웠습니다.");
  };

  const copySaveHealthReport = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            version: SAVE_VERSION,
            screen,
            report: getSaveHealthReport(),
            time: new Date().toISOString(),
          },
          null,
          2
        )
      );
      playSfx("save");
      alert("저장 상태 리포트를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const forceSaveBackupNow = () => {
    saveGame();
    setSaveHealthRefreshKey((prev) => prev + 1);
    alert("현재 상태 저장과 자동 백업을 갱신했습니다.");
  };

  const clearBrokenSaveEntries = () => {
    const ok = window.confirm("손상된 저장 슬롯만 정리할까요?");
    if (!ok) return;

    const allKeys = [
      SAVE_KEY,
      SAVE_BACKUP_KEY,
      SAVE_PREVIOUS_KEY,
      getManualSaveSlotKey(1),
      getManualSaveSlotKey(2),
      getManualSaveSlotKey(3),
    ];

    allKeys.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      if (!getSaveSummary(raw).ok) {
        localStorage.removeItem(key);
      }
    });

    setSaveHealthRefreshKey((prev) => prev + 1);
    playSfx("miss");
    alert("손상된 저장 항목 정리를 완료했습니다.");
  };

  const copySaveExportBundle = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildSaveExportBundle(), null, 2));
      playSfx("save");
      alert("저장 데이터 묶음을 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const pasteSaveImportBundle = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setSaveImportText(text);
      playSfx("confirm");
    } catch {
      alert("클립보드 읽기에 실패했습니다.");
    }
  };

  const importSaveBundle = () => {
    const bundle = parseSaveImportBundle(saveImportText);
    if (!bundle) {
      alert("가져올 수 있는 천수 저장 데이터 묶음이 아닙니다.");
      return;
    }

    const ok = window.confirm("가져온 저장 데이터로 현재 저장/백업/수동 슬롯을 덮어쓸까요?");
    if (!ok) return;

    const map = {
      current: SAVE_KEY,
      autoBackup: SAVE_BACKUP_KEY,
      previous: SAVE_PREVIOUS_KEY,
      manual1: getManualSaveSlotKey(1),
      manual2: getManualSaveSlotKey(2),
      manual3: getManualSaveSlotKey(3),
    };

    Object.entries(map).forEach(([name, key]) => {
      const value = bundle.saves?.[name];
      if (typeof value === "string" && getSaveSummary(value).ok) {
        localStorage.setItem(key, value);
      }
    });

    setSaveImportText("");
    setSaveHealthRefreshKey((prev) => prev + 1);
    playSfx("save");
    alert("저장 데이터 묶음을 가져왔습니다. 이어하기를 다시 눌러 확인해 주세요.");
  };

  const recoverBestSaveToCurrent = () => {
    const best = getBestRecoverableSave();
    if (!best) {
      alert("복구 가능한 저장 데이터가 없습니다.");
      return;
    }

    const ok = window.confirm(`${best.label} 데이터를 현재 저장으로 복구할까요?`);
    if (!ok) return;

    const current = localStorage.getItem(SAVE_KEY);
    if (current) {
      localStorage.setItem(SAVE_PREVIOUS_KEY, current);
    }

    localStorage.setItem(SAVE_KEY, best.raw);
    setSaveHealthRefreshKey((prev) => prev + 1);
    playSfx("save");
    alert(`${best.label}에서 현재 저장으로 복구했습니다. 이어하기를 눌러 확인해 주세요.`);
  };

  const createEmergencyBackup = () => {
    const current = localStorage.getItem(SAVE_KEY);
    if (!current || !getSaveSummary(current).ok) {
      alert("현재 저장 데이터가 없거나 손상되어 긴급 백업을 만들 수 없습니다.");
      return;
    }

    localStorage.setItem(SAVE_BACKUP_KEY, current);
    localStorage.setItem(SAVE_PREVIOUS_KEY, current);
    setSaveHealthRefreshKey((prev) => prev + 1);
    playSfx("save");
    alert("현재 저장을 자동 백업/이전 저장에 동시에 복사했습니다.");
  };


  const startStage = (stage) => {
    if (!playableStageIds.includes(stage.id)) return;

    const availableIds = party.map((unit) => unit.id);
    const current = deployedIds.filter((id) => availableIds.includes(id));
    const recommended = getRecommendedDeployment(party, stage, "balanced", MAX_DEPLOY_COUNT);
    const stageOneDefaultDeploy = stage.id === 1
      ? STAGE_ONE_DEFAULT_DEPLOY_IDS.filter((id) => availableIds.includes(id))
      : [];
    const initialDeploy = stageOneDefaultDeploy.length >= 4
      ? [...new Set([...stageOneDefaultDeploy, ...current])].slice(0, MAX_DEPLOY_COUNT)
      : current.length
      ? current.slice(0, MAX_DEPLOY_COUNT)
      : recommended.length
      ? recommended
      : availableIds.slice(0, MAX_DEPLOY_COUNT);

    playSfx("confirm");
    setDeploymentStage(stage);
    setSelectedStage(stage);
    setDeployedIds(initialDeploy);
    setDeploymentHint(getDeployHint("balanced", stage));
    setScreen("deployment");
  };

  const toggleDeployUnit = (unitId) => {
    if (unitId === "hero") {
      setDeploymentHint("카일은 주인공이므로 반드시 출전합니다.");
      return;
    }

    setDeployedIds((prev) => {
      if (prev.includes(unitId)) {
        setDeploymentHint("출전 명단에서 제외했습니다.");
        return prev.filter((id) => id !== unitId);
      }

      if (prev.length >= MAX_DEPLOY_COUNT) {
        setDeploymentHint(`최대 ${MAX_DEPLOY_COUNT}명까지 출전할 수 있습니다.`);
        setCampMessage(`최대 ${MAX_DEPLOY_COUNT}명까지 출전할 수 있습니다.`);
        return prev;
      }

      setDeploymentHint("출전 명단에 추가했습니다.");
      return [...prev, unitId];
    });
  };

  const applyDeployPreset = (type) => {
    const ids = getRecommendedDeployment(party, deploymentStage || selectedStage, type, MAX_DEPLOY_COUNT);

    if (!ids.length) return;

    playSfx("confirm");
    setDeployedIds(ids);
    setDeploymentHint(getDeployHint(type, deploymentStage || selectedStage));
  };

  const saveDeploymentPreset = (slot = 1) => {
    localStorage.setItem(getDeploySlotKey(slot), JSON.stringify(deployedIds));
    localStorage.setItem("cheonsu_deploy_preset_v1", JSON.stringify(deployedIds));
    playSfx("save");
    setDeploymentHint(`출전 편성을 슬롯 ${slot}에 저장했습니다.`);
  };

  const loadDeploymentPreset = (slot = 1) => {
    try {
      const raw =
        localStorage.getItem(getDeploySlotKey(slot)) ||
        localStorage.getItem("cheonsu_deploy_preset_v1");

      if (!raw) {
        setDeploymentHint(`슬롯 ${slot}에 저장된 출전 편성이 없습니다.`);
        return;
      }

      const availableIds = party.map((unit) => unit.id);
      const ids = JSON.parse(raw)
        .filter((id) => availableIds.includes(id))
        .slice(0, MAX_DEPLOY_COUNT);

      if (!ids.includes("hero") && availableIds.includes("hero")) {
        ids.unshift("hero");
      }

      setDeployedIds([...new Set(ids)].slice(0, MAX_DEPLOY_COUNT));
      playSfx("confirm");
      setDeploymentHint(`슬롯 ${slot} 출전 편성을 불러왔습니다.`);
    } catch {
      setDeploymentHint("출전 편성을 불러오지 못했습니다.");
    }
  };

  const applyRoleFill = (roleGroup, label) => {
    const ids = getRolePresetIds(party, deployedIds, roleGroup, MAX_DEPLOY_COUNT);
    setDeployedIds(ids);
    playSfx("confirm");
    setDeploymentHint(`${label} 역할을 중심으로 출전 명단을 보강했습니다.`);
  };

  const clearDeploymentExceptHero = () => {
    const hero = party.find((unit) => unit.id === "hero");
    setDeployedIds(hero ? ["hero"] : []);
    playSfx("miss");
    setDeploymentHint("카일을 제외한 출전 명단을 비웠습니다.");
  };

  const selectAllDeployment = () => {
    const ids = party.map((unit) => unit.id).slice(0, MAX_DEPLOY_COUNT);
    setDeployedIds(ids);
    playSfx("confirm");
    setDeploymentHint(`보유 동료를 최대 ${MAX_DEPLOY_COUNT}명까지 선택했습니다.`);
  };

  const applyFormationOrder = (formation) => {
    setDeployedIds((prev) => {
      const sorted = sortDeploymentByFormation(party, prev, formation);

      if (!sorted.includes("hero") && party.some((unit) => unit.id === "hero")) {
        sorted.unshift("hero");
      }

      return [...new Set(sorted)].slice(0, MAX_DEPLOY_COUNT);
    });

    playSfx("confirm");
    setDeploymentHint(`${getFormationLabel(formation)} 완료. 전열은 맵 위쪽, 후열은 맵 아래쪽에 배치됩니다.`);
  };

  const applyAutoFillDeployment = () => {
    const ids = getAutoFillDeploymentIds(party, deployedIds, MAX_DEPLOY_COUNT);
    setDeployedIds(ids);
    playSfx("confirm");
    setDeploymentHint("부족한 역할을 기준으로 출전 명단을 자동 보강했습니다.");
  };

  const autoEquipDeployedUnits = () => {
    setParty((prev) => autoEquipParty(prev, gearInventory, gearEnhance, deployedIds));
    playSfx("equip");
    setDeploymentHint("현재 출전 동료에게 역할에 맞는 장비를 자동 장착했습니다.");
  };

  const autoEquipAllUnits = () => {
    setParty((prev) => autoEquipParty(prev, gearInventory, gearEnhance, null));
    playSfx("equip");
    setDeploymentHint("전체 동료에게 사용 가능한 최적 장비를 자동 장착했습니다.");
  };

  const applyOneClickPreparation = () => {
    if (!deploymentStage) return;

    const filledIds = getAutoFillDeploymentIds(party, deployedIds, MAX_DEPLOY_COUNT);
    const purchasePlan = getRecommendedSupplyPurchasePlan(deploymentStage, inventory, gold);

    setDeployedIds(filledIds);
    setParty((prev) => autoEquipParty(prev, gearInventory, gearEnhance, filledIds));

    if (purchasePlan.items.length > 0) {
      setGold((prev) => Math.max(0, prev - purchasePlan.cost));
      setInventory((prev) => {
        const nextInventory = normalizeBattleInventory(prev);

        purchasePlan.items.forEach((itemId) => {
          nextInventory[itemId] = getItemCount(nextInventory, itemId) + 1;
        });

        return nextInventory;
      });
    }

    playSfx("victory");
    setDeploymentHint(
      `원클릭 준비 완료: 출전 보강, 자동 장비, 추천 보급 ${purchasePlan.items.length}개 구매.`
    );
  };

  const confirmDeployment = () => {
    if (!deploymentStage) return;

    if (deployedIds.length === 0) {
      alert("최소 1명은 출전해야 합니다.");
      return;
    }

    localStorage.setItem("cheonsu_last_deploy_v1", JSON.stringify(deployedIds));
    setFinalDeployCheckOpen(false);
    openStoryScene(deploymentStage, "intro", "battle");
  };

  const startDeploymentAfterFinalCheck = () => {
    if (!deploymentStage) return;

    localStorage.setItem("cheonsu_last_deploy_v1", JSON.stringify(deployedIds));
    setFinalDeployCheckOpen(false);
    openStoryScene(deploymentStage, "intro", "battle");
  };

  const completeStoryScene = () => {
    if (!storyScene) {
      setScreen("menu");
      return;
    }

    const action = storyScene.onComplete;
    const stage = storyScene.stage;

    setStoryScene(null);

    if (action === "battle") {
      beginStageBattle(stage);
      return;
    }

    if (action === "camp") {
      finishGoCamp();
      return;
    }

    setScreen("menu");
  };

  const nextStoryLine = () => {
    if (!storyScene) return;

    if (storyScene.index < storyScene.lines.length - 1) {
      playSfx("confirm");
      setStoryScene((prev) => ({
        ...prev,
        index: prev.index + 1,
      }));
      return;
    }

    completeStoryScene();
  };

  const skipStoryScene = () => {
    completeStoryScene();
  };

  const saveGame = () => {
    if (!selectedStage && screen !== "campaign") return;
    if (screen === "battle" && turn !== "ally") {
      setLogs((p) => ["적 턴에는 저장할 수 없습니다.", ...p]);
      return;
    }
    const saveData = {
      version: SAVE_VERSION,
      screen,
      selectedStage,
      currentStageId: selectedStage?.id || null,
      party,
      units,
      selectedUnit,
      deployedIds,
      mode,
      turn,
      round,
      inventory,
      battleLoot,
      battleStats,
      unitBattleStats,
      careerStats,
      stageMastery,
      stageNotes,
      stageNoteTags,
      strategyReportArchive,
      strategyFavoriteIds,
      strategyQuickSlots,
      strategyQuickSlotNames,
      finalRcChecked,
      claimedMasteryRewards,
      claimedAchievements,
      claimedChallenges,
      selectedPlayerTitle,
      selectedProfileFrame,
      snapshotGallery,
      dailyLoginData,
      eventData,
      gearInventory,
      gearEnhance,
      gold,
      logs,
      campMessage,
      stageRewardClaimed,
      unlockedStages,
      clearedStages,
      hazards,
      supportPoints,
      supportDialoguesSeen,
      trainingUsed,
      dispatchUsed,
      savedAt: new Date().toISOString(),
    };
    const previousRaw = localStorage.getItem(SAVE_KEY);
    if (previousRaw) {
      localStorage.setItem(SAVE_PREVIOUS_KEY, previousRaw);
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    localStorage.setItem(SAVE_BACKUP_KEY, JSON.stringify(saveData));
    playSfx("save");
    if (screen === "camp") setCampMessage("저장 완료. 다음 전투를 준비할 수 있다.");
    if (screen === "battle") setLogs((p) => ["저장 완료.", ...p]);
  };

  const continueGame = () => {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      alert("저장된 데이터가 없습니다.");
      return;
    }

    try {
      const migratedData = normalizeSaveData(JSON.parse(raw), SAVE_VERSION);

      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          ...migratedData,
          savedAt: new Date().toISOString(),
        })
      );

      const restoredGearEnhance = normalizeGearEnhance(migratedData.gearEnhance);
      const restoredBaseParty = migratedData.party || [];
      const starterBackfill = getInitialParty().filter(
        (starter) => !restoredBaseParty.some((unit) => unit.id === starter.id)
      );
      const restoredParty = applyGearEnhanceToParty(
        applyRecruitProgress([...restoredBaseParty, ...starterBackfill], migratedData.clearedStages),
        restoredGearEnhance
      );

      const availableDeployIds = restoredParty.map((unit) => unit.id);
      const restoredDeployedIds = (migratedData.deployedIds || availableDeployIds)
        .filter((id) => availableDeployIds.includes(id))
        .slice(0, MAX_DEPLOY_COUNT);

      setSelectedStage(migratedData.selectedStage);
      setDeploymentStage(null);
      setGearEnhance(restoredGearEnhance);
      setDeployedIds(restoredDeployedIds.length ? restoredDeployedIds : availableDeployIds.slice(0, MAX_DEPLOY_COUNT));
      setDeploymentHint("저장된 출전 편성을 불러왔습니다.");
      setParty(restoredParty);
      setUnits(migratedData.units);
      setSelectedUnit(migratedData.selectedUnit);
      setMode(migratedData.mode);
      setTurn(migratedData.turn);
      setRound(migratedData.round);
      setInventory(normalizeBattleInventory(migratedData.inventory));
      setBattleLoot(normalizeLoot(migratedData.battleLoot));
      setBattleStats(normalizeBattleStats(migratedData.battleStats));
      setUnitBattleStats(normalizeUnitBattleStats(migratedData.unitBattleStats));
      setCareerStats(normalizeCareerStats(migratedData.careerStats));
      setStageMastery(normalizeStageMastery(migratedData.stageMastery));
      setStageNotes(normalizeStageNotes(migratedData.stageNotes));
      setStageNoteTags(normalizeStageNoteTags(migratedData.stageNoteTags));
      setStrategyReportArchive(Array.isArray(migratedData.strategyReportArchive) ? migratedData.strategyReportArchive : []);
      setStrategyFavoriteIds(Array.isArray(migratedData.strategyFavoriteIds) ? migratedData.strategyFavoriteIds : []);
      setStrategyQuickSlots(normalizeStrategyQuickSlots(migratedData.strategyQuickSlots));
      setStrategyQuickSlotNames(normalizeStrategyQuickSlotNames(migratedData.strategyQuickSlotNames));
      setFinalRcChecked(migratedData.finalRcChecked && typeof migratedData.finalRcChecked === "object" ? migratedData.finalRcChecked : {});
      setLaunchChecked(migratedData.launchChecked && typeof migratedData.launchChecked === "object" ? migratedData.launchChecked : {});
      setClaimedMasteryRewards(Array.isArray(migratedData.claimedMasteryRewards) ? migratedData.claimedMasteryRewards : []);
      setClaimedAchievements(Array.isArray(migratedData.claimedAchievements) ? migratedData.claimedAchievements : []);
      setClaimedChallenges(Array.isArray(migratedData.claimedChallenges) ? migratedData.claimedChallenges : []);
      setSelectedPlayerTitle(typeof migratedData.selectedPlayerTitle === "string" ? migratedData.selectedPlayerTitle : "rookie");
      setSelectedProfileFrame(typeof migratedData.selectedProfileFrame === "string" ? migratedData.selectedProfileFrame : "classic");
      setSnapshotGallery(Array.isArray(migratedData.snapshotGallery) ? migratedData.snapshotGallery : []);
      setDailyLoginData(normalizeDailyLoginData(migratedData.dailyLoginData));
      setEventData(normalizeEventData(migratedData.eventData));
      setGearInventory(migratedData.gearInventory);
      setSupportPoints(migratedData.supportPoints);
      setSupportDialoguesSeen(migratedData.supportDialoguesSeen || {});
      setActiveSupportScene(null);
      setTrainingUsed(migratedData.trainingUsed);
      setDispatchUsed(Boolean(migratedData.dispatchUsed));
      setGold(migratedData.gold);
      setLogs([
        `세이브 데이터 v${migratedData.version} 로드 완료.`,
        ...migratedData.logs,
      ].slice(0, 8));
      setCampMessage(migratedData.campMessage);
      setStageRewardClaimed(migratedData.stageRewardClaimed);
      setUnlockedStages(getPlaytestUnlockedStageIds(migratedData.unlockedStages));
      setClearedStages(migratedData.clearedStages);
      setStoryScene(null);
      setBattle(null);
      setBattleResolving(false);
      setResult(null);
      setPhaseBanner(null);
      setStageBanner(null);
      setTurnPhaseBanner(null);
      setLastClearSummary(null);
      setHazards(migratedData.hazards);
      setTurnBusy(false);
      setMoveUndo(null);
      clearVisuals();
      setItemOpen(false);
      setShopOpen(false);
      setEquipmentOpen(false);
      setForgeOpen(false);
      setTrainingOpen(false);
      setDispatchOpen(false);
      setSkillOpen(false);
      setPromoteOpen(false);
      setSupportOpen(false);
      playSfx("confirm");
      setScreen(migratedData.screen);
    } catch (error) {
      console.error("Save load failed:", error);
      alert("저장 데이터를 불러오지 못했습니다. 새 게임으로 다시 시작해 주세요.");
    }
  };

  const openBattle = (attacker, defender, battleMode = "attack") => {
    const preview = applyPassiveToPreview(
      applyBattleTactics(
        {
          attacker,
          defender,
          damage: calculateDamage(attacker, defender, battleMode),
          hit: calculateHit(attacker, defender, battleMode),
          crit: calculateCrit(attacker, defender, battleMode),
          mode: battleMode,
          affinity: getCombatAffinity(attacker, defender),
        },
        createBattleTactics(attacker, defender, units, activeMap)
      ),
      units
    );
    const counter = createCounterPreview(attacker, defender, activeMap, units);
    const assist =
      battleMode === "assist"
        ? null
        : createAssistPreview(attacker, defender, units, activeMap);
    const aoeTargets =
      battleMode === "skill" ? getAreaTargets(attacker, defender, units, activeMap) : [];

    setBattle({
      ...preview,
      aoeTargets,
      assist,
      counter,
    });
  };

  const resolveEnemyAttack = async (enemyUnit, targetUnit, enemyMode, sourceUnits, logPrefix = "") => {
    let workingUnits = [...sourceUnits];
    const attacker = workingUnits.find((u) => u.id === enemyUnit?.id);
    const target = workingUnits.find((u) => u.id === targetUnit?.id && u.type === "ally" && u.hp > 0);

    if (!attacker || !target) {
      return { units: workingUnits, attacked: false, defeated: false };
    }

    scrollBattleMapToCell(target.x, target.y, "smooth");
    const baseDamage = calculateDamage(attacker, target, enemyMode);
    const hit = calculateHit(attacker, target, enemyMode);
    const crit = calculateCrit(attacker, target, enemyMode);
    const enemyPreview = applyPassiveToPreview(
      applyBattleTactics(
        {
          attacker,
          defender: target,
          damage: baseDamage,
          hit,
          crit,
          mode: enemyMode,
        },
        createBattleTactics(attacker, target, workingUnits, activeMap)
      ),
      workingUnits
    );
    const outcome = rollCombat(enemyPreview);
    await showCombatCutscene(enemyPreview, outcome);

    let statusMessages = [];
    let counterMessages = [];
    let expMessages = [];

    if (outcome.hit) {
      addBattleStats({ damageTaken: outcome.damage });
      addUnitBattleStats(target.id, { damageTaken: outcome.damage });
      workingUnits = workingUnits
        .map((u) =>
          u.id === target.id ? { ...u, hp: Math.max(0, u.hp - outcome.damage) } : u
        )
        .filter((u) => u.hp > 0);

      const targetStillAlive = workingUnits.some((u) => u.id === target.id);

      if (targetStillAlive) {
        const statusResult = applySkillStatusAfterHit(
          attacker,
          target.id,
          enemyMode,
          workingUnits
        );
        workingUnits = statusResult.units;
        statusMessages = statusResult.messages;
      }

      const counterActor = workingUnits.find((u) => u.id === target.id);
      const counterTarget = workingUnits.find((u) => u.id === attacker.id);

      if (counterActor && counterTarget && canCounter(counterTarget, counterActor, activeMap)) {
        const counterPreview = applyBattleTactics(
          {
            attacker: counterActor,
            defender: counterTarget,
            damage: calculateDamage(counterActor, counterTarget, "attack"),
            hit: calculateHit(counterActor, counterTarget, "attack"),
            crit: calculateCrit(counterActor, counterTarget, "attack"),
            mode: "counter",
            affinity: getCombatAffinity(counterActor, counterTarget),
          },
          createBattleTactics(counterActor, counterTarget, workingUnits, activeMap)
        );
        const counterOutcome = rollCombat(counterPreview);
        await showCombatCutscene(counterPreview, counterOutcome);
        let counterKilled = false;

        if (counterOutcome.hit) {
          addBattleStats({ counters: 1, damageDealt: counterOutcome.damage });
          addUnitBattleStats(counterActor.id, { counters: 1, damageDealt: counterOutcome.damage });
          workingUnits = workingUnits
            .map((u) => {
              if (u.id === counterTarget.id) {
                const hp = Math.max(0, u.hp - counterOutcome.damage);
                if (hp === 0) counterKilled = true;
                return { ...u, hp };
              }
              return u;
            })
            .filter((u) => u.hp > 0);
        }

        counterMessages.push(
          makeAttackLog(counterActor, counterTarget, "counter", counterOutcome, "↩ ")
        );

        if (counterKilled && counterActor.type === "ally") {
          const expAmount = counterTarget.type === "boss" ? 50 : 30;
          const expResult = grantExp(workingUnits, counterActor.id, expAmount);
          workingUnits = expResult.units;
          expMessages = [
            ...expResult.messages,
            ...registerLootDrop(counterTarget),
          ];
        }
      }
    }

    setUnits(workingUnits);
    setLogs((p) => [
      makeAttackLog(attacker, target, enemyMode, outcome, logPrefix),
      ...statusMessages,
      ...counterMessages,
      ...expMessages,
      ...p,
    ]);

    if (!workingUnits.some((u) => u.id === "hero")) {
      playSfx("defeat");
      showDefeatDirecting();
      setResult("defeat");
      return { units: workingUnits, attacked: true, defeated: true };
    }

    return { units: workingUnits, attacked: true, defeated: false };
  };

  const executeEnemyTurn = async (startUnits) => {
    let workingUnits = [...startUnits];
    const enemies = workingUnits.filter((u) => u.type !== "ally");
    for (const enemy of enemies) {
      const freshEnemy = workingUnits.find((u) => u.id === enemy.id);
      if (!freshEnemy) continue;
      const allies = workingUnits.filter((u) => u.type === "ally");
      if (allies.length === 0) { setUnits(workingUnits); playSfx("defeat"); showDefeatDirecting(); setResult("defeat"); return; }
      const enemyUsesSkill = freshEnemy.skillType === "attack";
      const enemyMode = enemyUsesSkill ? "skill" : "attack";
      const target = getTargetInRange(freshEnemy, allies, enemyMode, activeMap);
      if (target) {
        const attackResult = await resolveEnemyAttack(freshEnemy, target, enemyMode, workingUnits);
        workingUnits = attackResult.units;
        if (attackResult.defeated) {
          return;
        }
        continue;
      }

      const movedEnemy = moveEnemyToward(freshEnemy, allies, workingUnits, activeMap);
      const didMove = movedEnemy.x !== freshEnemy.x || movedEnemy.y !== freshEnemy.y;

      if (didMove) {
        const enemyPath = findMovePath(
          freshEnemy,
          movedEnemy.x,
          movedEnemy.y,
          workingUnits,
          activeMap
        );

        scrollBattleMapToCell(freshEnemy.x, freshEnemy.y, "smooth");

        await animateUnitMovePath(
          freshEnemy,
          enemyPath.length ? enemyPath : [{ x: movedEnemy.x, y: movedEnemy.y }],
          battleSpeedConfig.enemyStepMs
        );

        scrollBattleMapToCell(movedEnemy.x, movedEnemy.y, "smooth");
      }

      workingUnits = workingUnits.map((u) => u.id === freshEnemy.id ? movedEnemy : u);
      setUnits(workingUnits);
      if (didMove) setMovingUnit(null);

      const movedFreshEnemy = workingUnits.find((u) => u.id === freshEnemy.id);
      const postMoveAllies = workingUnits.filter((u) => u.type === "ally");
      const postMoveTarget = movedFreshEnemy
        ? getTargetInRange(movedFreshEnemy, postMoveAllies, enemyMode, activeMap)
        : null;

      if (postMoveTarget) {
        if (didMove) {
          await new Promise((resolve) => window.setTimeout(resolve, Math.min(220, battleSpeedConfig.enemyDelayMs)));
        }

        const attackResult = await resolveEnemyAttack(
          movedFreshEnemy,
          postMoveTarget,
          enemyMode,
          workingUnits,
          didMove ? "이동 후 " : ""
        );
        workingUnits = attackResult.units;
        if (attackResult.defeated) {
          return;
        }
        continue;
      }

      setLogs((p) => [
        didMove
          ? `${freshEnemy.name} 이동. (${getAITypeLabel(freshEnemy.aiType)})`
          : `${freshEnemy.name} 대기. 사거리 내 대상 없음.`,
        ...p,
      ]);
    }
    const allyStatusResult = processTurnStartStatuses(workingUnits, "ally");
    const allyTerrainResult = processTerrainStartEffects(allyStatusResult.units, "ally", activeMap);
    workingUnits = allyTerrainResult.units;

    const allyStartMessages = [
      ...allyStatusResult.messages,
      ...allyTerrainResult.messages,
    ];

    if (allyStartMessages.length > 0) {
      setLogs((p) => [...allyStartMessages, ...p]);
    }

    if (!workingUnits.some((u) => u.id === "hero")) {
      setUnits(workingUnits);
      setResult("defeat");
      return;
    }

    const nextRound = round + 1;
    const bossPatternResult = createBossPatternHazards(
      workingUnits,
      activeMap,
      selectedStage,
      nextRound
    );
    const nextHazards = bossPatternResult.hazards;

    if (nextHazards.length > 0) {
      setHazards(nextHazards);
      showStageBanner(
        {
          type: "boss-pattern",
          label: "BOSS PATTERN",
          title: bossPatternResult.pattern?.label || "어둠의 파동",
          subtitle: bossPatternResult.pattern?.desc || "위험 칸을 피하세요.",
        },
        1550
      );
    }

    const reinforcementResult = createStageReinforcements(
      selectedStage,
      nextRound,
      workingUnits,
      activeMap
    );
    workingUnits = applyDifficultyToUnits(reinforcementResult.units, settings.difficulty, settings.balancePreset);

    if (reinforcementResult.messages.length > 0) {
      playSfx("phase");
      showStageBanner(
        {
          type: "reinforce",
          label: "REINFORCE",
          title: "적 증원 도착",
          subtitle: reinforcementResult.spawned.map((unit) => unit.name).join(", "),
        },
        1450
      );
    }

    const resetUnits = decrementSkillCooldowns(workingUnits).map((u) => {
      const guardBoost = u.skillGuardBoost || 0;

      return {
        ...u,
        def: guardBoost ? Math.max(0, u.def - guardBoost) : u.def,
        skillGuardBoost: 0,
        acted: false,
        moved: false,
        guard: false,
        supportUsed: false,
      };
    });
    setUnits(resetUnits);
    playSfx("turn");
    setTurn("ally");
    setRound((r) => r + 1);
    showTurnPhaseBanner("ally", nextRound);
    setMoveUndo(null);
    setLogs((p) => [
      "아군 턴 시작.",
      ...reinforcementResult.messages,
      ...(nextHazards.length > 0
        ? [`⚠️ ${bossPatternResult.pattern?.label || "어둠의 파동"} 예고! 위험 칸을 피하세요.`]
        : []),
      ...p,
    ]);
    setTurnBusy(false);
  };

  const runEnemyTurn = (nextUnits) => {
    if (turnBusy || result) return;

    setTurnBusy(true);
    playSfx("turn");
    setTurn("enemy");
    showTurnPhaseBanner("enemy", round);
    setSelectedUnit(null);
    setMode("move");
    setMoveUndo(null);

    triggerHazardVisuals(hazards, nextUnits);
    const hazardResult = resolveHazards(nextUnits, hazards);
    setHazards([]);

    if (!hazardResult.units.some((u) => u.id === "hero")) {
      setUnits(hazardResult.units);
      setLogs((p) => ["적 턴 시작.", ...hazardResult.messages, ...p]);
      playSfx("defeat");
      showDefeatDirecting();
      setResult("defeat");
      setTurnBusy(false);
      return;
    }

    const statusResult = processTurnStartStatuses(hazardResult.units, "enemy");
    const terrainResult = processTerrainStartEffects(statusResult.units, "enemy", activeMap);
    const phaseResult = triggerBossPhases(terrainResult.units);
    const processedUnits = phaseResult.units;
    const enemiesLeft = processedUnits.filter((u) => u.type !== "ally");

    if (phaseResult.messages.length > 0) {
      const phaseBoss = phaseResult.units.find((unit) => unit.type === "boss" && unit.phase2 && unit.hp > 0);
      setPhaseBanner("보스 2페이즈");
      playSfx("phase");
      triggerScreenShake(true);
      if (phaseBoss) {
        showBossCutscene(phaseBoss, "phase2", 1900);
      }
      setTimeout(() => setPhaseBanner(null), 1400);
    }

    setUnits(processedUnits);
    setLogs((p) => [
      "적 턴 시작.",
      ...hazardResult.messages,
      ...phaseResult.messages,
      ...statusResult.messages,
      ...terrainResult.messages,
      ...p,
    ]);

    if (enemiesLeft.length === 0) {
      const summary = calculateClearSummary(selectedStage, round, processedUnits);
      playSfx("victory");
      showVictoryDirecting(summary);
      setResult("victory");
      setTurnBusy(false);
      return;
    }

    if (round >= activeRoundLimit) {
      playSfx("defeat");
      showDefeatDirecting();
      setLogs((p) => [`라운드 제한 ${activeRoundLimit}R을 넘겼습니다. 작전 실패.`, ...p]);
      setResult("defeat");
      setTurnBusy(false);
      return;
    }

    setTimeout(() => executeEnemyTurn(processedUnits), battleSpeedConfig.enemyDelayMs);
  };

  const selectNextReadyAlly = (preferredRole = null) => {
    if (turn !== "ally" || turnBusy || movingUnit || result) return;

    const readyAllies = units.filter((unit) => {
      if (!isUnitReady(unit)) return false;
      if (!preferredRole) return true;

      return getSquadRole(unit) === preferredRole;
    });

    const fallbackReadyAllies = units.filter(isUnitReady);
    const candidates = readyAllies.length ? readyAllies : fallbackReadyAllies;

    if (!candidates.length) {
      setLogs((p) => ["행동 가능한 아군이 없습니다.", ...p]);
      return;
    }

    const currentIndex = candidates.findIndex((unit) => unit.id === selectedUnit);
    const nextUnit = candidates[(currentIndex + 1 + candidates.length) % candidates.length];

    setSelectedUnit(nextUnit.id);
    setMode(nextUnit.moved ? "attack" : "move");
    focusUnitOnMap(nextUnit);
    playSfx("confirm");
    setLogs((p) => [
      `${nextUnit.name} 선택됨. (${getSquadRoleLabel(getSquadRole(nextUnit))})`,
      ...p,
    ]);
  };

  const commandGuardSquad = () => {
    if (turn !== "ally" || turnBusy || movingUnit || result) return;

    const guardedRoles = ["front"];
    const guardedUnits = units.map((unit) => {
      if (!isUnitReady(unit)) return unit;
      if (!guardedRoles.includes(getSquadRole(unit))) return unit;

      return {
        ...unit,
        guard: true,
        acted: true,
        moved: true,
      };
    });

    const guardedCount = guardedUnits.filter(
      (unit) =>
        unit.type === "ally" &&
        unit.guard &&
        unit.acted &&
        units.find((before) => before.id === unit.id && !before.acted)
    ).length;

    if (!guardedCount) {
      setLogs((p) => ["수호 태세를 취할 전열 동료가 없습니다.", ...p]);
      return;
    }

    setUnits(guardedUnits);
    setSelectedUnit(null);
    setMode("move");
    setMoveUndo(null);
    playSfx("guard");
    setLogs((p) => [`전열 수호 명령. ${guardedCount}명이 방어 태세를 취했습니다.`, ...p]);

    const allies = guardedUnits.filter((unit) => unit.type === "ally");
    if (allies.every((unit) => unit.acted)) {
      runEnemyTurn(guardedUnits);
    }
  };

  const commandAllWait = () => {
    if (turn !== "ally" || turnBusy || movingUnit || battle || result) return;

    const readyCount = units.filter(isUnitReady).length;
    const alliesLeft = units.some((unit) => unit.type === "ally" && unit.hp > 0);
    const enemiesLeft = units.some((unit) => unit.type !== "ally" && unit.hp > 0);

    if (!readyCount) {
      if (alliesLeft && enemiesLeft) {
        setSelectedUnit(null);
        setMode("move");
        playSfx("turn");
        setLogs((p) => ["행동 가능한 아군이 없어 적 턴으로 넘깁니다.", ...p]);
        runEnemyTurn(units);
        return;
      }

      setLogs((p) => ["행동 가능한 아군이 없습니다.", ...p]);
      return;
    }

    const waitedUnits = units.map((unit) =>
      isUnitReady(unit)
        ? {
            ...unit,
            acted: true,
            moved: true,
          }
        : unit
    );

    setUnits(waitedUnits);
    setSelectedUnit(null);
    setMode("move");
    setMoveUndo(null);
    playSfx("turn");
    setLogs((p) => [`전원 대기. 남은 아군 ${readyCount}명이 행동을 종료했습니다.`, ...p]);
    runEnemyTurn(waitedUnits);
  };

  const endAllyTurn = commandAllWait;

  const commandSupportFocus = () => {
    if (turn !== "ally" || turnBusy || movingUnit || result) return;

    const injured = units
      .filter((unit) => unit.type === "ally" && unit.hp > 0 && unit.hp < unit.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];

    const supportUnit = units.find(
      (unit) => isUnitReady(unit) && unit.skillType === "heal" && getSkillCooldownValue(unit) === 0
    );

    if (supportUnit && injured) {
      setSelectedUnit(supportUnit.id);
      setMode("move");
      focusUnitOnMap(supportUnit);
      playSfx("heal");
      setLogs((p) => [
        `지원 집중: ${supportUnit.name} 선택됨. 회복 대상 추천: ${injured.name}`,
        ...p,
      ]);
      return;
    }

    selectNextReadyAlly("support");
  };

  const createAutoBattlePreview = (attacker, defender, battleMode = "attack") => {
    return applyPassiveToPreview(
      applyBattleTactics(
        {
          attacker,
          defender,
          damage: calculateDamage(attacker, defender, battleMode),
          hit: calculateHit(attacker, defender, battleMode),
          crit: calculateCrit(attacker, defender, battleMode),
          mode: battleMode,
          affinity: getCombatAffinity(attacker, defender),
        },
        createBattleTactics(attacker, defender, units, activeMap)
      ),
      units
    );
  };

  const scoreAutoBattleOption = (attacker, defender, battleMode = "attack") => {
    const preview = createAutoBattlePreview(attacker, defender, battleMode);
    const expectedDamage = preview.damage * (preview.hit / 100);
    const killScore = preview.damage >= defender.hp ? 120 : 0;
    const bossScore = defender.type === "boss" ? 45 : 0;
    const lowHpScore = defender.hp <= defender.maxHp * 0.35 ? 25 : 0;
    const affinityScore =
      preview.affinity?.state === "advantage"
        ? 24
        : preview.affinity?.state === "disadvantage"
        ? -18
        : 0;
    const tacticScore = (preview.tactics?.damageMod || 0) * 8 + (preview.tactics?.hitMod || 0) * 0.6;
    const areaScore =
      battleMode === "skill"
        ? getAreaTargets(attacker, defender, units, activeMap).length * 18
        : 0;
    const cooldownPenalty = battleMode === "skill" ? 8 : 0;
    const hpRate = attacker.maxHp ? attacker.hp / attacker.maxHp : 1;
    const riskPenalty =
      settings.autoBattleMode === "safe" && hpRate < 0.45
        ? 42
        : settings.autoBattleMode === "safe" && preview.affinity?.state === "disadvantage"
        ? 22
        : 0;
    const modeBonus =
      settings.autoBattleMode === "attack"
        ? expectedDamage * 0.55 + killScore * 0.25
        : settings.autoBattleMode === "boss"
        ? (defender.type === "boss" ? 95 : 0)
        : settings.autoBattleMode === "farm"
        ? killScore * 0.35 + lowHpScore * 1.5
        : preview.affinity?.state === "advantage"
        ? 12
        : 0;

    return {
      attacker,
      defender,
      mode: battleMode,
      preview,
      score:
        expectedDamage +
        killScore +
        bossScore +
        lowHpScore +
        affinityScore +
        tacticScore +
        areaScore -
        cooldownPenalty -
        riskPenalty +
        modeBonus,
    };
  };

  const findBestRecommendedAttack = () => {
    const readyAllies = units.filter((unit) => isUnitReady(unit));
    const enemies = units.filter((unit) => unit.type !== "ally" && unit.hp > 0);
    const options = [];

    for (const ally of readyAllies) {
      const attackTiles = getAttackTiles(ally, "attack", activeMap);

      for (const enemy of enemies) {
        if (attackTiles.some((tile) => tile.x === enemy.x && tile.y === enemy.y)) {
          options.push(scoreAutoBattleOption(ally, enemy, "attack"));
        }
      }

      if (settings.autoUseSkills && ally.skillType === "attack" && getSkillCooldownValue(ally) === 0) {
        const skillTiles = getAttackTiles(ally, "skill", activeMap);

        for (const enemy of enemies) {
          if (skillTiles.some((tile) => tile.x === enemy.x && tile.y === enemy.y)) {
            options.push(scoreAutoBattleOption(ally, enemy, "skill"));
          }
        }
      }
    }

    return options.sort((a, b) => b.score - a.score)[0] || null;
  };

  const commandRecommendedAttack = () => {
    if (turn !== "ally" || turnBusy || movingUnit || result) return;

    const best = findBestRecommendedAttack();

    if (!best) {
      setLogs((p) => ["추천 가능한 공격이 없습니다. 자동 접근을 사용해 전열을 밀어 올려보세요.", ...p]);
      return;
    }

    setSelectedUnit(best.attacker.id);
    setMode(best.mode);
    focusUnitOnMap(best.defender);
    playSfx("confirm");
    setLogs((p) => [
      `AI 추천: ${best.attacker.name} → ${best.defender.name} ${best.mode === "skill" ? best.attacker.skill : "공격"} · 예상 피해 ${best.preview.damage} / 명중 ${best.preview.hit}%`,
      ...p,
    ]);
    openBattle(best.attacker, best.defender, best.mode);
  };

  const getClosestEnemy = (unit) => {
    return units
      .filter((target) => target.type !== "ally" && target.hp > 0)
      .sort((a, b) => {
        const da = Math.abs(unit.x - a.x) + Math.abs(unit.y - a.y);
        const db = Math.abs(unit.x - b.x) + Math.abs(unit.y - b.y);

        if (da !== db) return da - db;

        return a.hp - b.hp;
      })[0];
  };

  const commandAutoAdvance = () => {
    if (turn !== "ally" || turnBusy || movingUnit || result) return;

    const actor =
      selected && isUnitReady(selected)
        ? selected
        : units.find((unit) => isUnitReady(unit));

    if (!actor) {
      setLogs((p) => ["자동 접근할 아군이 없습니다.", ...p]);
      return;
    }

    const target = getClosestEnemy(actor);

    if (!target) {
      setLogs((p) => ["접근할 적이 없습니다.", ...p]);
      return;
    }

    const attackTiles = getAttackTiles(actor, "attack", activeMap);

    if (attackTiles.some((tile) => tile.x === target.x && tile.y === target.y)) {
      setSelectedUnit(actor.id);
      setMode("attack");
      focusUnitOnMap(target);
      setLogs((p) => [`${actor.name}은 이미 ${target.name}을 공격할 수 있습니다.`, ...p]);
      openBattle(actor, target, "attack");
      return;
    }

    const availableTiles = getMoveTiles(actor, units, activeMap);

    if (!availableTiles.length) {
      setLogs((p) => [`${actor.name}은 이동할 수 없습니다.`, ...p]);
      return;
    }

    const bestTile = [...availableTiles].sort((a, b) => {
      const da = Math.abs(a.x - target.x) + Math.abs(a.y - target.y);
      const db = Math.abs(b.x - target.x) + Math.abs(b.y - target.y);

      if (da !== db) return da - db;

      return (a.cost || 0) - (b.cost || 0);
    })[0];

    const movePath = findMovePath(actor, bestTile.x, bestTile.y, units, activeMap);

    (async () => {
      await animateUnitMovePath(
        actor,
        movePath.length ? movePath : [{ x: bestTile.x, y: bestTile.y }],
        battleSpeedConfig.allyStepMs
      );

      setUnits((prev) =>
        prev.map((unit) =>
          unit.id === actor.id
            ? { ...unit, x: bestTile.x, y: bestTile.y, moved: true }
            : unit
        )
      );
      setMovingUnit(null);
      setSelectedUnit(actor.id);
      setMode("attack");
      scrollBattleMapToCell(bestTile.x, bestTile.y, "smooth");
      setLogs((p) => [
        `AI 접근: ${actor.name}이 ${target.name} 쪽으로 이동. 공격 또는 대기를 선택하세요.`,
        ...p,
      ]);
    })();
  };


  const findBestAutoAttackForUnit = (actor) => {
    if (!actor || !isUnitReady(actor)) return null;

    const enemies = units.filter((unit) => unit.type !== "ally" && unit.hp > 0);
    const options = [];
    const attackTiles = getAttackTiles(actor, "attack", activeMap);

    enemies.forEach((enemy) => {
      if (attackTiles.some((tile) => tile.x === enemy.x && tile.y === enemy.y)) {
        options.push(scoreAutoBattleOption(actor, enemy, "attack"));
      }
    });

    if (settings.autoUseSkills && actor.skillType === "attack" && getSkillCooldownValue(actor) === 0) {
      const skillTiles = getAttackTiles(actor, "skill", activeMap);

      enemies.forEach((enemy) => {
        if (skillTiles.some((tile) => tile.x === enemy.x && tile.y === enemy.y)) {
          options.push(scoreAutoBattleOption(actor, enemy, "skill"));
        }
      });
    }

    return options.sort((a, b) => b.score - a.score)[0] || null;
  };

  const commandAutoBattleTurn = async () => {
    if (turn !== "ally" || turnBusy || movingUnit || result || battle) return;

    if (settings.autoUseItems) {
      const criticalAlly = units
        .filter((unit) => unit.type === "ally" && unit.hp > 0 && unit.hp < unit.maxHp * 0.32 && !unit.acted)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];

      if (criticalAlly && getItemCount(inventory, "potion") > 0) {
        setSelectedUnit(criticalAlly.id);
        setInspectedUnitId(null);
        focusUnitOnMap(criticalAlly);
        setLogs((p) => [`자동 전투: ${criticalAlly.name}에게 회복약 사용 권장.`, ...p]);
        setItemOpen(true);
        return;
      }
    }

    const readyActors = units.filter(isUnitReady);

    if (!readyActors.length) {
      setLogs((p) => ["자동 전투: 행동 가능한 아군이 없습니다.", ...p]);
      return;
    }

    const actor = readyActors[0];
    const attackOption = findBestAutoAttackForUnit(actor);

    if (attackOption) {
      setSelectedUnit(actor.id);
      setMode(attackOption.mode);
      focusUnitOnMap(attackOption.defender);
      playSfx("confirm");
      setLogs((p) => [
        `자동 전투: ${actor.name} → ${attackOption.defender.name} ${attackOption.mode === "skill" ? actor.skill : "공격"}`,
        ...p,
      ]);
      openBattle(actor, attackOption.defender, attackOption.mode);
      return;
    }

    const target = getClosestEnemy(actor);

    if (!target) {
      setLogs((p) => ["자동 전투: 접근할 적이 없습니다.", ...p]);
      return;
    }

    const availableTiles = getMoveTiles(actor, units, activeMap);

    if (!availableTiles.length) {
      const waitedUnits = units.map((unit) =>
        unit.id === actor.id ? { ...unit, acted: true, moved: true } : unit
      );
      setUnits(waitedUnits);
      setLogs((p) => [`자동 전투: ${actor.name} 대기.`, ...p]);

      if (waitedUnits.filter((unit) => unit.type === "ally").every((unit) => unit.acted)) {
        runEnemyTurn(waitedUnits);
      }
      return;
    }

    const bestTile = [...availableTiles].sort((a, b) => {
      const da = Math.abs(a.x - target.x) + Math.abs(a.y - target.y);
      const db = Math.abs(b.x - target.x) + Math.abs(b.y - target.y);
      if (da !== db) return da - db;
      return (a.cost || 0) - (b.cost || 0);
    })[0];

    const movePath = findMovePath(actor, bestTile.x, bestTile.y, units, activeMap);
    setTurnBusy(true);

    await animateUnitMovePath(
      actor,
      movePath.length ? movePath : [{ x: bestTile.x, y: bestTile.y }],
      battleSpeedConfig.allyStepMs
    );

    const movedUnits = units.map((unit) =>
      unit.id === actor.id
        ? { ...unit, x: bestTile.x, y: bestTile.y, acted: true, moved: true }
        : unit
    );

    setUnits(movedUnits);
    setMovingUnit(null);
    setSelectedUnit(null);
    setMode("move");
    scrollBattleMapToCell(bestTile.x, bestTile.y, "smooth");
    setTurnBusy(false);
    setLogs((p) => [`자동 전투: ${actor.name}이 ${target.name} 쪽으로 이동 후 대기.`, ...p]);

    if (movedUnits.filter((unit) => unit.type === "ally").every((unit) => unit.acted)) {
      runEnemyTurn(movedUnits);
    }
  };

  const toggleAutoBattleDelegate = () => {
    setAutoBattleEnabled((prev) => !prev);
    playSfx("confirm");
    setLogs((p) => [
      `자동 위임 ${autoBattleEnabled ? "해제" : "설정"} · 전략 ${autoBattleModeConfig.label}`,
      ...p,
    ]);
  };

  const getReadyCountByRole = (role) =>
    units.filter((unit) => isUnitReady(unit) && getSquadRole(unit) === role).length;

  const markActed = (unitId, sourceUnits = units) => {
    if (turnBusy || result) return;

    setMoveUndo(null);
    const actedUnits = sourceUnits.map((u) => u.id === unitId ? { ...u, acted: true, moved: true } : u);
    setUnits(actedUnits);
    setSelectedUnit(null);
    setMode("move");
    const allies = actedUnits.filter((u) => u.type === "ally");
    if (allies.every((u) => u.acted)) {
      setLogs((p) => ["모든 아군 행동 완료.", ...p]);
      runEnemyTurn(actedUnits);
    }
  };

  const showCombatCutscene = async (battleInfo, outcome) => {
    if (!battleInfo?.attacker || !battleInfo?.defender) return;
    if (settings.cutsceneMode === "off") {
      return;
    }

    const cutsceneId = `${Date.now()}-${Math.random()}`;
    const effectType = getEffectType(battleInfo, outcome);
    const motionKey = getUnitWeaponMotionKey(battleInfo.attacker, battleInfo, outcome);
    const defenderPostHp = outcome?.heal
      ? Math.min(battleInfo.defender.maxHp || battleInfo.defender.hp, battleInfo.defender.hp + (outcome.damage || 0))
      : outcome?.hit
      ? Math.max(0, battleInfo.defender.hp - (outcome.damage || 0))
      : battleInfo.defender.hp;
    const finish = outcome?.hit && !outcome?.heal && defenderPostHp <= 0;
    const attackerPostHp = battleInfo.attacker.hp;

    setCombatCutscene({
      id: cutsceneId,
      attacker: battleInfo.attacker,
      defender: battleInfo.defender,
      attackerPostHp,
      defenderPostHp,
      mode: battleInfo.mode,
      effectType: finish ? "finish" : effectType,
      effectLabel: finish ? getCutsceneEffectLabel("finish") : getCutsceneEffectLabel(effectType),
      effectIcon: finish ? getCutsceneEffectIcon("finish") : getCutsceneEffectIcon(effectType),
      motionKey,
      durationMs: finish ? cutsceneConfig.duration + 360 : cutsceneConfig.duration,
      finish,
      outcome,
      title:
        outcome?.heal
          ? "회복"
          : finish
          ? "FINISH"
          : battleInfo.mode === "skill"
          ? battleInfo.attacker.skill
          : battleInfo.mode === "counter"
          ? "반격"
          : battleInfo.mode === "assist"
          ? "협공"
          : "공격",
    });

    playSfx(finish ? "finish" : outcome?.crit ? "crit" : outcome?.hit ? effectType : "miss");

    await waitForMove(settings.effectsOn ? (finish ? cutsceneConfig.duration + 360 : cutsceneConfig.duration) : 120);

    setCombatCutscene((current) => (current?.id === cutsceneId ? null : current));
  };

  const resolveBattle = async () => {
    if (!battle || battleResolving) return;

    setBattleResolving(true);
    setBattle(null);
    setMoveUndo(null);

    const outcome = rollCombat(battle);
    await showCombatCutscene(battle, outcome);
    triggerCombatVisual(battle, outcome);

    if (outcome.hit) {
      addBattleStats({
        damageDealt: battle.attacker.type === "ally" ? outcome.damage : 0,
        damageTaken: battle.attacker.type === "ally" ? 0 : outcome.damage,
        skillsUsed: battle.mode === "skill" && battle.attacker.type === "ally" ? 1 : 0,
      });

      if (battle.attacker.type === "ally") {
        addUnitBattleStats(battle.attacker.id, {
          damageDealt: outcome.damage,
          skillsUsed: battle.mode === "skill" ? 1 : 0,
        });
      }

      if (battle.defender.type === "ally") {
        addUnitBattleStats(battle.defender.id, { damageTaken: outcome.damage });
      }
    }

    let defenderDied = false;

    let nextUnits = units
      .map((u) => {
        if (u.id === battle.defender.id && outcome.hit) {
          const hp = Math.max(0, u.hp - outcome.damage);
          if (hp === 0) defenderDied = true;
          return { ...u, hp, hitFlash: Date.now() };
        }
        return u;
      })
      .filter((u) => u.hp > 0);

    if (defenderDied) {
      pushVisualEffect({
        x: battle.defender.x,
        y: battle.defender.y,
        type: "ko-burst",
        duration: 900,
      });
      pushDamagePopup({
        x: battle.defender.x,
        y: battle.defender.y,
        text: "KO",
        kind: "crit",
        duration: 1000,
      });
      playSfx("finish");
    }

    if (battle.mode === "skill" && battle.attacker.type === "ally") {
      nextUnits = applySkillCooldown(
        nextUnits,
        battle.attacker.id,
        getSkillCooldownTurns(battle.attacker)
      );
    }

    let statusMessages = [];
    if (outcome.hit && !defenderDied) {
      const statusResult = applySkillStatusAfterHit(
        battle.attacker,
        battle.defender.id,
        battle.mode,
        nextUnits
      );
      nextUnits = statusResult.units;
      statusMessages = statusResult.messages;
    }

    let areaMessages = [];
    let areaExpMessages = [];
    let areaLootMessages = [];

    if (
      outcome.hit &&
      battle.mode === "skill" &&
      battle.aoeTargets &&
      battle.aoeTargets.length > 0
    ) {
      const areaTargets = battle.aoeTargets
        .map((target) => nextUnits.find((unit) => unit.id === target.id))
        .filter(Boolean);

      for (const areaTarget of areaTargets) {
        const rawAreaDamage = calculateDamage(battle.attacker, areaTarget, "skill");
        const areaDamage = Math.max(
          1,
          Math.floor(rawAreaDamage * getSkillAreaDamageRate(battle.attacker))
        );
        let areaKilled = false;

        nextUnits = nextUnits
          .map((unit) => {
            if (unit.id === areaTarget.id) {
              const hp = Math.max(0, unit.hp - areaDamage);
              if (hp === 0) areaKilled = true;
              return { ...unit, hp };
            }

            return unit;
          })
          .filter((unit) => unit.hp > 0);

        triggerCombatVisual(
          {
            attacker: battle.attacker,
            defender: areaTarget,
            mode: "skill",
          },
          {
            hit: true,
            crit: false,
            damage: areaDamage,
            tactics: null,
          },
          180 + areaMessages.length * 120
        );

        addBattleStats({ damageDealt: areaDamage });
        addUnitBattleStats(battle.attacker.id, { damageDealt: areaDamage });
        areaMessages.push(
          `💥 광역 피해 → ${areaTarget.name} ${areaDamage} 피해`
        );

        if (areaKilled && battle.attacker.type === "ally") {
          const expAmount = areaTarget.type === "boss" ? 50 : 30;
          const expResult = grantExp(nextUnits, battle.attacker.id, expAmount);
          nextUnits = expResult.units;
          areaExpMessages = [...areaExpMessages, ...expResult.messages];
          areaLootMessages = [...areaLootMessages, ...registerLootDrop(areaTarget)];
          addBattleStats({ kills: 1 });
          addUnitBattleStats(battle.attacker.id, { kills: 1 });
        }
      }
    }

    let expMessages = [];
    let lootMessages = [];
    if (outcome.hit && defenderDied && battle.attacker.type === "ally") {
      const expAmount = battle.defender.type === "boss" ? 50 : 30;
      const expResult = grantExp(nextUnits, battle.attacker.id, expAmount);
      nextUnits = expResult.units;
      expMessages = expResult.messages;
      lootMessages = registerLootDrop(battle.defender);
      addBattleStats({ kills: 1 });
      addUnitBattleStats(battle.attacker.id, { kills: 1 });
    }

    let assistMessages = [];
    let assistExpMessages = [];

    if (outcome.hit && !defenderDied && battle.assist && battle.attacker.type === "ally") {
      const assistActor = nextUnits.find((unit) => unit.id === battle.assist.attacker.id);
      const assistTarget = nextUnits.find((unit) => unit.id === battle.defender.id);

      if (assistActor && assistTarget && canAssistAttack(assistActor, battle.attacker, assistTarget, activeMap)) {
        const freshAssist = applyBattleTactics(
          {
            attacker: assistActor,
            defender: assistTarget,
            damage: Math.max(1, Math.floor(calculateDamage(assistActor, assistTarget, "attack") * 0.55)),
            hit: Math.round(Math.max(30, Math.min(95, calculateHit(assistActor, assistTarget, "attack") - 5))),
            crit: 0,
            mode: "assist",
            affinity: getCombatAffinity(assistActor, assistTarget),
          },
          createBattleTactics(assistActor, assistTarget, nextUnits, activeMap)
        );
        const assistOutcome = rollCombat(freshAssist);
        await showCombatCutscene(freshAssist, assistOutcome);
        triggerCombatVisual(freshAssist, assistOutcome, 360);

        let assistKilled = false;

        if (assistOutcome.hit) {
          addBattleStats({ assists: 1, damageDealt: assistOutcome.damage });
          addUnitBattleStats(assistActor.id, { assists: 1, damageDealt: assistOutcome.damage });
          nextUnits = nextUnits
            .map((unit) => {
              if (unit.id === assistTarget.id) {
                const hp = Math.max(0, unit.hp - assistOutcome.damage);
                if (hp === 0) assistKilled = true;
                return { ...unit, hp };
              }

              if (unit.id === assistActor.id) {
                return { ...unit, supportUsed: true };
              }

              return unit;
            })
            .filter((unit) => unit.hp > 0);
        } else {
          nextUnits = nextUnits.map((unit) =>
            unit.id === assistActor.id ? { ...unit, supportUsed: true } : unit
          );
        }

        assistMessages.push(
          makeAttackLog(assistActor, assistTarget, "assist", assistOutcome, "🤝 ")
        );

        if (assistKilled) {
          defenderDied = true;
          const expAmount = assistTarget.type === "boss" ? 50 : 30;
          const expResult = grantExp(nextUnits, assistActor.id, expAmount);
          nextUnits = expResult.units;
          assistExpMessages = [
            ...expResult.messages,
            ...registerLootDrop(assistTarget),
          ];
        }
      }
    }

    let counterMessages = [];
    let counterExpMessages = [];
    let attackerDiedFromCounter = false;

    if (outcome.hit && !defenderDied && battle.counter) {
      const counterActor = nextUnits.find((u) => u.id === battle.defender.id);
      const counterTarget = nextUnits.find((u) => u.id === battle.attacker.id);

      if (counterActor && counterTarget && canCounter(counterTarget, counterActor, activeMap)) {
        const freshCounter = applyBattleTactics(
          {
            attacker: counterActor,
            defender: counterTarget,
            damage: calculateDamage(counterActor, counterTarget, "attack"),
            hit: calculateHit(counterActor, counterTarget, "attack"),
            crit: calculateCrit(counterActor, counterTarget, "attack"),
            mode: "counter",
            affinity: getCombatAffinity(counterActor, counterTarget),
          },
          createBattleTactics(counterActor, counterTarget, nextUnits, activeMap)
        );
        const counterOutcome = rollCombat(freshCounter);
        triggerCombatVisual(freshCounter, counterOutcome, 260);
        let counterKilled = false;

        if (counterOutcome.hit) {
          nextUnits = nextUnits
            .map((u) => {
              if (u.id === counterTarget.id) {
                const hp = Math.max(0, u.hp - counterOutcome.damage);
                if (hp === 0) counterKilled = true;
                return { ...u, hp };
              }
              return u;
            })
            .filter((u) => u.hp > 0);
        }

        counterMessages.push(
          makeAttackLog(counterActor, counterTarget, "counter", counterOutcome, "↩ ")
        );

        if (counterKilled) {
          attackerDiedFromCounter = true;
          if (counterActor.type === "ally") {
            const expAmount = counterTarget.type === "boss" ? 50 : 30;
            const expResult = grantExp(nextUnits, counterActor.id, expAmount);
            nextUnits = expResult.units;
            counterExpMessages = [
              ...expResult.messages,
              ...registerLootDrop(counterTarget),
            ];
          }
        }
      }
    }

    const phaseResult = triggerBossPhases(nextUnits);
    nextUnits = phaseResult.units;

    if (phaseResult.messages.length > 0) {
      setPhaseBanner("보스 2페이즈");
      playSfx("phase");
      triggerScreenShake(true);
      setTimeout(() => setPhaseBanner(null), 1400);
    }

    setLogs((p) => [
      makeAttackLog(battle.attacker, battle.defender, battle.mode, outcome),
      ...(battle.mode === "skill" && battle.attacker.type === "ally"
        ? [`${battle.attacker.name} ${battle.attacker.skill} 쿨다운 ${getSkillCooldownTurns(battle.attacker)}턴 발생`]
        : []),
      ...statusMessages,
      ...areaMessages,
      ...areaExpMessages,
      ...areaLootMessages,
      ...expMessages,
      ...lootMessages,
      ...assistMessages,
      ...assistExpMessages,
      ...counterMessages,
      ...counterExpMessages,
      ...phaseResult.messages,
      ...p,
    ]);

    setBattle(null);
    setBattleResolving(false);

    const enemiesLeft = nextUnits.filter((u) => u.type !== "ally");
    const heroAlive = nextUnits.some((u) => u.id === "hero");
    const attackerAlive = nextUnits.some((u) => u.id === battle.attacker.id);

    if (!heroAlive) {
      setUnits(nextUnits);
      playSfx("defeat");
      showDefeatDirecting();
      setResult("defeat");
      return;
    }

    if (enemiesLeft.length === 0) {
      const summary = calculateClearSummary(selectedStage, round, nextUnits);
      setUnits(nextUnits);
      setParty((prev) => mergePartyFromUnits(prev, nextUnits));
      playSfx("victory");
      showVictoryDirecting(summary);
      setResult("victory");
      return;
    }

    if (attackerDiedFromCounter || !attackerAlive) {
      setUnits(nextUnits);
      setSelectedUnit(null);
      setMode("move");
      setMoveUndo(null);
      return;
    }

    markActed(battle.attacker.id, nextUnits);
  };

  const waitUnit = () => {
    if (!selected || selected.acted || turn !== "ally" || turnBusy || movingUnit || result) return;
    setLogs((p) => [`${selected.name} 대기.`, ...p]);
    markActed(selected.id);
  };

  const activateSkill = async () => {
    if (!selected || selected.acted || turn !== "ally" || turnBusy || movingUnit || result) return;

    if (selectedSkillCooldown > 0) {
      setLogs((p) => [
        `${selected.name}의 ${selected.skill}은 ${selectedSkillCooldown}턴 후 사용 가능합니다.`,
        ...p,
      ]);
      return;
    }

    if (selected.skillType === "heal") {
      const injuredAllies = units
        .filter((unit) => unit.type === "ally" && unit.hp > 0 && unit.hp < unit.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);

      const targets = injuredAllies.slice(0, getHealTargetCount(selected));

      if (!targets.length) {
        setLogs((p) => [`${selected.name}: 회복할 아군이 없습니다.`, ...p]);
        return;
      }

      const healPower = 14 + getSkillUpgradeLevel(selected) * 3 + getPassiveHealBonus(selected);
      const healSummary = targets.map((target) => {
        const healAmount = Math.min(healPower, target.maxHp - target.hp);
        return `${target.name} +${healAmount}`;
      });
      const targetIds = new Set(targets.map((target) => target.id));
      const healedUnits = units.map((unit) =>
        targetIds.has(unit.id)
          ? { ...unit, hp: Math.min(unit.maxHp, unit.hp + healPower) }
          : unit
      );

      const cooldownUnits = applySkillCooldown(
        healedUnits,
        selected.id,
        getSkillCooldownTurns(selected)
      );

      const totalHealDone = targets.reduce((sum, target) => sum + Math.min(healPower, target.maxHp - target.hp), 0);
      addBattleStats({ healingDone: totalHealDone, skillsUsed: 1 });
      addUnitBattleStats(selected.id, { healingDone: totalHealDone, skillsUsed: 1 });
      await showCombatCutscene(
        { attacker: selected, defender: targets[0], mode: "heal" },
        { hit: true, heal: true, damage: totalHealDone, crit: false }
      );
      playSfx("heal");
      setLogs((p) => [
        `${selected.name} 스킬 사용: ${selected.skill} → ${healSummary.join(", ")} 회복 · 쿨다운 ${getSkillCooldownTurns(selected)}턴`,
        ...p,
      ]);
      markActed(selected.id, cooldownUnits);
      return;
    }

    if (selected.skillType === "guard") {
      const guardBonus = getSkillUpgradeLevel(selected);
      const guardedUnits = applySkillCooldown(
        units.map((u) =>
          u.id === selected.id
            ? {
                ...u,
                guard: true,
                def: u.def + guardBonus,
                skillGuardBoost: guardBonus,
              }
            : u
        ),
        selected.id,
        getSkillCooldownTurns(selected)
      );
      playSfx("guard");
      setLogs((p) => [
        `${selected.name} 스킬 사용: ${selected.skill}. 받는 피해가 감소합니다.${guardBonus ? ` 방어 +${guardBonus}` : ""} · 쿨다운 ${getSkillCooldownTurns(selected)}턴`,
        ...p,
      ]);
      markActed(selected.id, guardedUnits);
      return;
    }
    if (selected.skillType === "attack") {
      playSfx("magic");
      setMode("skill");
      setMobileBattlePanelOpen(false);
      setMobileTargetPanelOpen(true);
      setMobileAllyPanelOpen(false);
      setMobileTurnPanelOpen(false);
      setLogs((p) => [
        `${selected.name} 스킬 준비: ${selected.skill} · 사용 후 쿨다운 ${getSkillCooldownTurns(selected)}턴`,
        ...p,
      ]);
    }
  };

  const openItem = () => {
    if (!selected || selected.acted || turn !== "ally" || turnBusy || movingUnit || result) return;
    playSfx("confirm");
    setItemOpen(true);
  };

  const consumeBattleItem = (itemId) => {
    if (!selected || selected.acted || turn !== "ally" || turnBusy || movingUnit || result) return;

    const item = ITEM_DEFS[itemId];

    if (!item) return;

    if (getItemCount(inventory, itemId) <= 0) {
      setLogs((p) => [`${item.name}이 없습니다.`, ...p]);
      setItemOpen(false);
      return;
    }

    let nextUnits = units;
    let message = "";
    let sfx = "confirm";

    if (item.type === "heal") {
      if (selected.hp >= selected.maxHp) {
        setLogs((p) => [`${selected.name}의 HP가 이미 가득 찼습니다.`, ...p]);
        setItemOpen(false);
        return;
      }

      const healAmount = Math.min(item.power, selected.maxHp - selected.hp);
      nextUnits = units.map((unit) =>
        unit.id === selected.id
          ? { ...unit, hp: Math.min(unit.maxHp, unit.hp + item.power) }
          : unit
      );
      message = `${selected.name} ${item.name} 사용. HP ${healAmount} 회복.`;
      sfx = "heal";
    }

    if (item.type === "cleanse") {
      if (!selected.status || selected.status.length === 0) {
        setLogs((p) => [`${selected.name}에게 제거할 상태이상이 없습니다.`, ...p]);
        setItemOpen(false);
        return;
      }

      nextUnits = units.map((unit) =>
        unit.id === selected.id ? { ...unit, status: [] } : unit
      );
      message = `${selected.name} ${item.name} 사용. 상태이상 제거.`;
      sfx = "heal";
    }

    if (item.type === "power") {
      if (selected.itemPowerBoost) {
        setLogs((p) => [`${selected.name}은 이미 공격 부적 효과를 받고 있습니다.`, ...p]);
        setItemOpen(false);
        return;
      }

      nextUnits = units.map((unit) =>
        unit.id === selected.id
          ? {
              ...unit,
              atk: unit.atk + item.power,
              itemPowerBoost: item.power,
            }
          : unit
      );
      message = `${selected.name} ${item.name} 사용. 이번 전투 동안 공격 +${item.power}.`;
      sfx = "phase";
    }

    if (item.type === "guard") {
      if (selected.itemGuardBoost) {
        setLogs((p) => [`${selected.name}은 이미 수호 부적 효과를 받고 있습니다.`, ...p]);
        setItemOpen(false);
        return;
      }

      nextUnits = units.map((unit) =>
        unit.id === selected.id
          ? {
              ...unit,
              def: unit.def + item.power,
              guard: true,
              itemGuardBoost: item.power,
            }
          : unit
      );
      message = `${selected.name} ${item.name} 사용. 이번 전투 동안 방어 +${item.power} / 수호.`;
      sfx = "guard";
    }

    setInventory((prev) => ({
      ...normalizeBattleInventory(prev),
      [itemId]: Math.max(0, getItemCount(prev, itemId) - 1),
    }));
    playSfx(sfx);
    setLogs((p) => [message, ...p]);
    setItemOpen(false);
    markActed(selected.id, nextUnits);
  };

  const finishGoCamp = () => {
    playSfx("confirm");
    setResult(null); setBattle(null); setBattleResolving(false); setItemOpen(false); setShopOpen(false); setEquipmentOpen(false); setForgeOpen(false); setTrainingOpen(false); setDispatchOpen(false); setSkillOpen(false); setPromoteOpen(false); setSupportOpen(false); setSelectedUnit(null); setMode("move"); setTrainingUsed(false); setDispatchUsed(false);
    const stageId = selectedStage?.id;
    const alreadyCleared = clearedStages.includes(stageId);
    const recruitId = !alreadyCleared ? RECRUIT_BY_STAGE[stageId] : null;
    const recruitUnit = recruitId ? createRecruitAlly(recruitId) : null;

    setParty((prev) => {
      const merged = mergePartyFromUnits(prev, units);

      if (!recruitUnit || merged.some((unit) => unit.id === recruitUnit.id)) {
        return applyGearEnhanceToParty(merged, gearEnhance);
      }

      return applyGearEnhanceToParty([...merged, recruitUnit], gearEnhance);
    });

    const nextStage = stages.find((s) => s.id === stageId + 1);
    const reward = selectedStage?.reward || { gold: 500, potion: 2 };
    if (stageId && !alreadyCleared) {
      setClearedStages((prev) => [...prev, stageId]);
      if (nextStage) setUnlockedStages((prev) => prev.includes(nextStage.id) ? prev : [...prev, nextStage.id]);
      const bonusReward = lastClearSummary?.bonusReward || { gold: 0, potion: 0 };
      const rewardGold = getDifficultyRewardGold(reward.gold, settings.difficulty);
      const bonusGold = getDifficultyRewardGold(bonusReward.gold || 0, settings.difficulty);
      if (selectedStage && lastClearSummary) {
      setStageMastery((prev) => updateStageMasteryRecord(prev, selectedStage, lastClearSummary));
    }

    const currentLoot = normalizeLoot(battleLoot);
      setGold((prev) => prev + rewardGold + bonusGold + (currentLoot.gold || 0));
      setInventory((prev) => {
        const nextInventory = {
          ...normalizeBattleInventory(prev),
          potion:
            getItemCount(prev, "potion") +
            (reward.potion || 0) +
            (bonusReward.potion || 0),
        };

        for (const [itemId, count] of Object.entries(currentLoot.items || {})) {
          nextInventory[itemId] = getItemCount(nextInventory, itemId) + count;
        }

        return nextInventory;
      });
      if (reward.gear || currentLoot.gear?.length) {
        setGearInventory((prev) => [
          ...new Set([...prev, ...(reward.gear || []), ...(currentLoot.gear || [])]),
        ]);
      }
      setCareerStats((prev) =>
        mergeCareerStats(prev, battleStats, battleMvp?.unitId || null, true)
      );
      setStageRewardClaimed(true);
      setSupportPoints((prev) => ({
        hero_lina: (prev.hero_lina || 0) + 5,
        hero_bram: (prev.hero_bram || 0) + 5,
        lina_bram: (prev.lina_bram || 0) + 5,
      }));
      const bonusText =
        lastClearSummary?.bonusReward &&
        ((lastClearSummary.bonusReward.gold || 0) > 0 || (lastClearSummary.bonusReward.potion || 0) > 0)
          ? ` 전술 보너스: ${bonusGold || 0}G, 회복약 ${lastClearSummary.bonusReward.potion || 0}개 추가 획득.`
          : "";
      const recruitText =
        recruitUnit && !party.some((unit) => unit.id === recruitUnit.id)
          ? ` 새 동료 ${recruitUnit.name}이(가) 합류했다.`
          : "";
      const lootText = formatLoot(currentLoot)
        ? ` 전리품 정산: ${formatLoot(currentLoot)}.`
        : "";
      setCampMessage(`${selectedStage?.title} 클리어! ${rewardGold}G와 회복약 ${reward.potion || 0}개를 획득했다. 난이도: ${getDifficultyConfig(settings.difficulty).label}.${bonusText}${lootText}${recruitText} ${reward.gear ? "희귀 장비도 획득했다. " : ""}${nextStage ? `${nextStage.title}이 해금되었다.${nextStage.id === 4 ? ' 야영진 근처에서 무녀 아리아가 부상자를 돌보고 있다.' : nextStage.id === 5 ? ' 멀리 무너진 요새에서 전투의 북소리가 들려온다.' : nextStage.id === 6 ? ' 차가운 바람이 설혼 계곡의 저주를 실어온다.' : ''}` : "현재 공개된 모든 장을 클리어했다."}`);
    } else {
      setCampMessage(`${selectedStage?.title} 전투가 끝났다. 이미 클리어한 장이라 추가 보상은 없다.`);
    }
    setBattleLoot(createEmptyLoot());
    setScreen("camp");
  };


  const copyCommanderShareCard = async () => {
    const text = createCommanderShareText({
      ...profileContext,
      selectedPlayerTitle,
      version: SAVE_VERSION,
    });

    try {
      await navigator.clipboard.writeText(text);
      playSfx("save");
      alert("지휘관 공유 카드를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const goCamp = () => {
    openStoryScene(selectedStage, "clear", "camp");
  };

  const goNextBattle = () => { setCampMessage("다음 전투를 선택하세요."); setScreen("campaign"); };

  const buyItem = (itemId) => {
    const item = ITEM_DEFS[itemId];

    if (!item) return;

    if (gold < item.price) {
      setCampMessage("골드가 부족합니다.");
      return;
    }

    setGold((prev) => prev - item.price);
    setInventory((prev) => ({
      ...normalizeBattleInventory(prev),
      [itemId]: getItemCount(prev, itemId) + 1,
    }));
    playSfx("confirm");
    setCampMessage(`${item.name} 1개를 구매했습니다.`);
  };

  const buyGear = (gearId, price) => {
    if (gearInventory.includes(gearId)) { setCampMessage("이미 보유한 장비입니다."); return; }
    if (gold < price) { setCampMessage("골드가 부족합니다."); return; }
    setGold((prev) => prev - price);
    setGearInventory((prev) => [...prev, gearId]);
    setCampMessage(`${EQUIPMENT[gearId].name}을 구매했습니다.`);
  };

  const equipGear = (gearId) => {
    const gear = EQUIPMENT[gearId];
    if (!gear || !equipmentUnit) return;
    if (!gear.allowed.includes(equipmentUnit.id)) { setCampMessage(`${equipmentUnit.name}은 ${gear.name}을 장착할 수 없습니다.`); return; }
    setParty((prev) =>
      applyGearEnhanceToParty(
        prev.map((unit) =>
          unit.id === equipmentUnit.id
            ? {
                ...unit,
                equipment: {
                  ...(unit.equipment || { weapon: null, armor: null }),
                  [gear.slot]: gearId,
                },
              }
            : unit
        ),
        gearEnhance
      )
    );
    setCampMessage(`${equipmentUnit.name}이 ${gear.name}을 장착했습니다.`);
  };

  const unequipGear = (slot) => {
    if (!equipmentUnit) return;
    setParty((prev) =>
      applyGearEnhanceToParty(
        prev.map((unit) =>
          unit.id === equipmentUnit.id
            ? {
                ...unit,
                equipment: {
                  ...(unit.equipment || { weapon: null, armor: null }),
                  [slot]: null,
                },
              }
            : unit
        ),
        gearEnhance
      )
    );
    setCampMessage(`${equipmentUnit.name}의 ${slot === "weapon" ? "무기" : "방어구"}를 해제했습니다.`);
  };


  const trainUnit = (unitId, trainingTypeId) => {
    if (trainingUsed) {
      setCampMessage("이번 캠프에서는 이미 훈련을 진행했습니다.");
      return;
    }

    const trainingType = TRAINING_TYPES.find((type) => type.id === trainingTypeId);
    const target = party.find((u) => u.id === unitId);

    if (!target || !trainingType) return;

    const grownParty = party.map((unit) =>
      unit.id === unitId ? applyTrainingGrowth(unit, trainingType) : unit
    );

    const expResult = grantExp(grownParty, unitId, trainingType.exp);

    setParty(applyGearEnhanceToParty(expResult.units, gearEnhance));
    setTrainingUsed(true);
    setCampMessage(
      `${target.name} ${trainingType.name} 완료. ${trainingType.desc}. ${expResult.messages.join(" / ")}`
    );
  };

  const addSupport = (pairId) => {
    const pair = SUPPORT_PAIRS.find((p) => p.id === pairId);
    if (!pair) return;

    const current = supportPoints[pairId] || 0;
    const next = Math.min(120, current + 10);

    setSupportPoints((prev) => ({
      ...prev,
      [pairId]: next,
    }));

    const rank = getSupportRank(next);
    const nextNeed = getSupportNext(next);
    setCampMessage(
      `${pair.title} 교류 완료. 호감도 ${current} → ${next}. 현재 랭크 ${rank}${
        nextNeed > 0 ? ` / 다음까지 ${nextNeed}` : " / MAX"
      }`
    );
  };

  const isSupportDialogueSeen = (pairId, rank) => {
    return (supportDialoguesSeen[pairId] || []).includes(rank);
  };

  const openSupportDialogue = (pairId, rank) => {
    const pair = SUPPORT_PAIRS.find((p) => p.id === pairId);
    const points = supportPoints[pairId] || 0;
    const required = SUPPORT_RANK_THRESHOLDS[rank] || 999;

    if (!pair || !pair.dialogues?.[rank]) return;

    if (points < required) {
      setCampMessage(`${pair.title} ${rank}랭크 대화는 호감도 ${required} 이상 필요합니다.`);
      return;
    }

    setActiveSupportScene({
      pairId,
      rank,
      index: 0,
    });
  };

  const closeSupportDialogue = (completed = false) => {
    if (completed && activeSupportScene) {
      const { pairId, rank } = activeSupportScene;
      const pair = SUPPORT_PAIRS.find((p) => p.id === pairId);

      setSupportDialoguesSeen((prev) => {
        const current = prev[pairId] || [];
        if (current.includes(rank)) return prev;

        return {
          ...prev,
          [pairId]: [...current, rank],
        };
      });

      setCampMessage(`${pair?.title || "지원"} ${rank}랭크 대화를 확인했습니다.`);
    }

    setActiveSupportScene(null);
  };

  const nextSupportLine = () => {
    if (!activeSupportScene) return;

    const pair = SUPPORT_PAIRS.find((p) => p.id === activeSupportScene.pairId);
    const lines = pair?.dialogues?.[activeSupportScene.rank] || [];

    if (activeSupportScene.index >= lines.length - 1) {
      closeSupportDialogue(true);
      return;
    }

    setActiveSupportScene((prev) => ({
      ...prev,
      index: prev.index + 1,
    }));
  };

  const renderSupportScene = () => {
    if (!activeSupportScene) return null;

    const pair = SUPPORT_PAIRS.find((p) => p.id === activeSupportScene.pairId);
    const lines = pair?.dialogues?.[activeSupportScene.rank] || [];
    const line = lines[activeSupportScene.index];

    if (!pair || !line) return null;

    const isLast = activeSupportScene.index >= lines.length - 1;

    return (
      <div className="battle-modal">
        <div className="battle-card support-scene-card">
          <div className="support-scene-title">
            {pair.title} · {activeSupportScene.rank}랭크
          </div>

          <div className="support-scene-stage">
            <div className="support-portrait">
              {line.speaker.slice(0, 1)}
            </div>

            <div className="support-dialogue-box">
              <div className="support-speaker">{line.speaker}</div>
              <div className="support-line">{line.text}</div>
            </div>
          </div>

          <div className="support-progress">
            {activeSupportScene.index + 1} / {lines.length}
          </div>

          <div className="battle-buttons">
            <button onClick={() => closeSupportDialogue(false)}>나가기</button>
            <button onClick={nextSupportLine}>{isLast ? "완료" : "다음"}</button>
          </div>
        </div>
      </div>
    );
  };

  const promoteUnit = (unitId) => {
    const target = party.find((unit) => unit.id === unitId);
    const check = canPromoteUnit(target, gold);

    if (!check.ok) {
      setCampMessage(`${target?.name || "동료"} 전직 불가: ${check.reason}`);
      return;
    }

    const cost = getPromotionCost(target);

    setGold((prev) => Math.max(0, prev - cost));
    setParty((prev) =>
      applyGearEnhanceToParty(
        prev.map((unit) => (unit.id === unitId ? promoteAllyUnit(unit) : unit)),
        gearEnhance
      )
    );

    playSfx("phase");
    setCampMessage(
      `${target.name} 전직 완료! ${getPromotionTitle(target)}이(가) 되었습니다. 최대 HP +5, 공격 +2, 방어 +2, 스킬 위력 +1`
    );
  };

  const upgradeSkill = (unitId) => {
    const target = party.find((unit) => unit.id === unitId);

    if (!target) return;

    const level = getSkillUpgradeLevel(target);

    if (level >= MAX_SKILL_LEVEL) {
      setCampMessage(`${target.name}의 ${target.skill}은 이미 최대 강화입니다.`);
      return;
    }

    const cost = getSkillUpgradeCost(target);

    if (gold < cost) {
      setCampMessage(`${target.name}의 스킬 강화에는 ${cost}G가 필요합니다.`);
      return;
    }

    setGold((prev) => Math.max(0, prev - cost));
    setParty((prev) =>
      applyGearEnhanceToParty(
        prev.map((unit) => (unit.id === unitId ? upgradeSkillUnit(unit) : unit)),
        gearEnhance
      )
    );
    playSfx("phase");
    setCampMessage(`${target.name} ${target.skill} +${level + 1} 강화 완료! ${getSkillUpgradeEffectText(target, level + 1)}`);
  };

  const renderSkillUpgradeModal = () => {
    if (!skillOpen) return null;

    return (
      <div className="battle-modal">
        <div className="battle-card equipment-card skill-upgrade-card">
          <div className="battle-title">스킬 강화</div>
          <div className="result-sub">
            동료의 고유 스킬을 강화합니다. 최대 +{MAX_SKILL_LEVEL}까지 강화할 수 있습니다.
          </div>

          <div className="forge-gold-box">
            보유 골드 <strong>{gold}G</strong>
          </div>

          <div className="skill-upgrade-list">
            {party.map((unit) => {
              const level = getSkillUpgradeLevel(unit);
              const maxed = level >= MAX_SKILL_LEVEL;
              const cost = getSkillUpgradeCost(unit);

              return (
                <div className={`skill-upgrade-entry ${maxed ? "maxed" : ""}`} key={unit.id}>
                  <div className="skill-upgrade-head">
                    <img src={getUnitPortrait(unit)} alt={unit.name} onError={(event) => { event.currentTarget.style.display = "none"; }} />
                    <div>
                      <strong>
                        {unit.name} · {unit.skill} +{level}
                      </strong>
                      <span>{getUnitDisplayClass(unit)} · {unit.skillType === "heal" ? "회복" : unit.skillType === "guard" ? "수호" : "공격"} 스킬</span>
                    </div>
                  </div>

                  <div className="skill-upgrade-effect">
                    <div>
                      <span>현재</span>
                      <strong>{getSkillUpgradeEffectText(unit, level)}</strong>
                    </div>
                    <div>
                      <span>다음</span>
                      <strong>{maxed ? "최대 강화" : getSkillUpgradeEffectText(unit, level + 1)}</strong>
                    </div>
                  </div>

                  <div className="promotion-footer">
                    <span>{maxed ? "더 이상 강화할 수 없습니다." : `강화 비용 ${cost}G`}</span>
                    <button disabled={maxed || gold < cost} onClick={() => upgradeSkill(unit.id)}>
                      {maxed ? "MAX" : "강화"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button className="result-btn second" onClick={() => setSkillOpen(false)}>
            닫기
          </button>
        </div>
      </div>
    );
  };

  const renderPromotionModal = () => {
    if (!promoteOpen) return null;

    return (
      <div className="battle-modal">
        <div className="battle-card equipment-card promotion-card">
          <div className="battle-title">전직</div>
          <div className="result-sub">
            Lv.3 이상 동료를 상급 병과로 전직시킬 수 있습니다.
          </div>

          <div className="promotion-list">
            {party.map((unit) => {
              const check = canPromoteUnit(unit, gold);
              const cost = getPromotionCost(unit);

              return (
                <div
                  className={`promotion-entry ${unit.promoted ? "promoted" : ""}`}
                  key={unit.id}
                >
                  <div className="promotion-unit-head">
                    <img src={getUnitPortrait(unit)} alt={unit.name} onError={(event) => { event.currentTarget.style.display = "none"; }} />
                    <div>
                      <strong>
                        {unit.name} Lv.{unit.level}
                      </strong>
                      <span>
                        {unit.promoted ? getUnitDisplayClass(unit) : `전직 후: ${getPromotionTitle(unit)}`}
                      </span>
                    </div>
                  </div>

                  <div className="promotion-stat-preview">
                    <div>
                      <span>HP</span>
                      <strong>{unit.maxHp} → {unit.promoted ? unit.maxHp : unit.maxHp + 5}</strong>
                    </div>
                    <div>
                      <span>공격</span>
                      <strong>{unit.atk} → {unit.promoted ? unit.atk : unit.atk + 2}</strong>
                    </div>
                    <div>
                      <span>방어</span>
                      <strong>{unit.def} → {unit.promoted ? unit.def : unit.def + 2}</strong>
                    </div>
                  </div>

                  <div className="promotion-footer">
                    <span>{unit.promoted ? "전직 완료" : `비용 ${cost}G · ${check.reason}`}</span>
                    <button disabled={!check.ok} onClick={() => promoteUnit(unit.id)}>
                      {unit.promoted ? "완료" : "전직"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            className="result-btn second"
            onClick={() => setPromoteOpen(false)}
          >
            닫기
          </button>
        </div>
      </div>
    );
  };

  const dispatchUnit = (unitId, dispatchTypeId) => {
    if (dispatchUsed) {
      setCampMessage("이번 캠프에서는 이미 파견을 진행했습니다.");
      return;
    }

    const target = party.find((unit) => unit.id === unitId);
    const dispatchType = DISPATCH_TYPES.find((type) => type.id === dispatchTypeId);

    if (!target || !dispatchType) return;

    const expResult = grantExp(party, unitId, dispatchType.exp);
    const bonusGear = getDispatchBonusGear(dispatchType.id, target);

    setParty(applyGearEnhanceToParty(expResult.units, gearEnhance));
    setGold((prev) => prev + dispatchType.gold);

    if (dispatchType.potion) {
      setInventory((prev) => ({
        ...normalizeBattleInventory(prev),
        potion: getItemCount(prev, "potion") + dispatchType.potion,
      }));
    }

    if (bonusGear) {
      setGearInventory((prev) => [...new Set([...prev, bonusGear])]);
    }

    setDispatchUsed(true);
    playSfx(bonusGear ? "victory" : "confirm");

    const rewardParts = [];
    if (dispatchType.gold) rewardParts.push(`${dispatchType.gold}G`);
    if (dispatchType.potion) rewardParts.push(`회복약 ${dispatchType.potion}개`);
    if (bonusGear) rewardParts.push(`${EQUIPMENT[bonusGear]?.name || bonusGear}`);

    setCampMessage(
      `${target.name} ${dispatchType.name} 완료. ${expResult.messages.join(" / ")}${
        rewardParts.length ? ` / 보상: ${rewardParts.join(", ")}` : ""
      }`
    );
  };

  const renderDispatchModal = () => {
    if (!dispatchOpen) return null;

    return (
      <div className="battle-modal">
        <div className="battle-card equipment-card dispatch-card">
          <div className="battle-title">파견</div>
          <div className="result-sub">
            캠프당 1회, 동료를 파견해 경험치와 보상을 얻습니다.
          </div>

          <div className="dispatch-used-box">
            {dispatchUsed
              ? "이번 캠프에서는 이미 파견을 진행했습니다."
              : "파견할 동료와 임무를 선택하세요."}
          </div>

          <div className="dispatch-list">
            {party.map((unit) => (
              <div className="dispatch-entry" key={unit.id}>
                <div className="dispatch-unit-head">
                  <img src={getUnitPortrait(unit)} alt={unit.name} onError={(event) => { event.currentTarget.style.display = "none"; }} />
                  <div>
                    <strong>
                      {unit.name} Lv.{unit.level} · {getUnitDisplayClass(unit)}
                    </strong>
                    <span>
                      EXP {unit.exp} · {unit.skill}+{getSkillUpgradeLevel(unit)}
                    </span>
                  </div>
                </div>

                <div className="dispatch-type-grid">
                  {DISPATCH_TYPES.map((dispatchType) => (
                    <button
                      key={dispatchType.id}
                      disabled={dispatchUsed}
                      onClick={() => dispatchUnit(unit.id, dispatchType.id)}
                    >
                      <strong>{dispatchType.name}</strong>
                      <small>{dispatchType.desc}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button className="result-btn second" onClick={() => setDispatchOpen(false)}>
            닫기
          </button>
        </div>
      </div>
    );
  };

  const renderTrainingModal = () => {
    if (!trainingOpen) return null;

    return (
      <div className="battle-modal">
        <div className="battle-card equipment-card training-card">
          <div className="battle-title">훈련</div>
          <div className="result-sub">
            캠프당 1회, 동료와 훈련 종류를 선택하세요.
          </div>

          <div className="training-list advanced-training-list">
            {party.map((unit) => (
              <div className="training-entry" key={unit.id}>
                <div className="training-entry-head">
                  <strong>
                    {unit.icon} {unit.name} · Lv.{unit.level} · {getUnitDisplayClass(unit)}
                  </strong>
                  <span>
                    EXP {unit.exp} · {getUnitDisplayClass(unit)} · 공격 {unit.atk} / 방어 {unit.def}
                  </span>
                </div>

                <div className="training-type-grid">
                  {TRAINING_TYPES.map((trainingType) => (
                    <button
                      key={trainingType.id}
                      disabled={trainingUsed}
                      onClick={() => trainUnit(unit.id, trainingType.id)}
                    >
                      <strong>{trainingType.name}</strong>
                      <small>{trainingType.desc}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {trainingUsed && (
            <div className="training-used-note">
              이번 캠프에서는 이미 훈련을 진행했습니다.
            </div>
          )}

          <button
            className="result-btn second"
            onClick={() => setTrainingOpen(false)}
          >
            닫기
          </button>
        </div>
      </div>
    );
  };

  const renderSupportModal = () => {
    if (!supportOpen) return null;

    return (
      <div className="battle-modal">
        <div className="battle-card equipment-card">
          <div className="battle-title">지원 대화</div>
          <div className="result-sub">
            교류로 호감도를 올리고, C/B/A 랭크 대화를 해금하세요.
          </div>

          <div className="support-list">
            {SUPPORT_PAIRS.map((pair) => {
              const points = supportPoints[pair.id] || 0;
              const rank = getSupportRank(points);
              const next = getSupportNext(points);

              return (
                <div className="support-entry" key={pair.id}>
                  <div className="support-entry-head">
                    <strong>{pair.title}</strong>
                    <span>
                      랭크 {rank} · 호감도 {points}{" "}
                      {next > 0 ? `/ 다음까지 ${next}` : "/ MAX"}
                    </span>
                    <small>{pair.text}</small>
                  </div>

                  <div className="support-action-row">
                    <button onClick={() => addSupport(pair.id)}>교류 +10</button>

                    {["C", "B", "A"].map((supportRank) => {
                      const required = SUPPORT_RANK_THRESHOLDS[supportRank];
                      const unlocked = points >= required;
                      const seen = isSupportDialogueSeen(pair.id, supportRank);

                      return (
                        <button
                          key={supportRank}
                          disabled={!unlocked}
                          className={seen ? "support-seen-btn" : ""}
                          onClick={() => openSupportDialogue(pair.id, supportRank)}
                        >
                          {supportRank} 대화 {seen ? "다시보기" : unlocked ? "보기" : "잠김"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            className="result-btn second"
            onClick={() => setSupportOpen(false)}
          >
            닫기
          </button>
        </div>
      </div>
    );
  };

  const upgradeGear = (gearId) => {
    const gear = EQUIPMENT[gearId];
    if (!gear) return;

    const currentLevel = getGearEnhanceLevel(gearEnhance, gearId);

    if (currentLevel >= MAX_GEAR_ENHANCE) {
      setCampMessage(`${gear.name}은 이미 최대 강화입니다.`);
      return;
    }

    const cost = getGearEnhanceCost(gearId, currentLevel);

    if (gold < cost) {
      setCampMessage(`골드가 부족합니다. ${gear.name} +${currentLevel + 1} 강화에는 ${cost}G가 필요합니다.`);
      return;
    }

    const nextEnhance = normalizeGearEnhance({
      ...gearEnhance,
      [gearId]: currentLevel + 1,
    });

    setGold((prev) => Math.max(0, prev - cost));
    setGearEnhance(nextEnhance);
    setParty((prev) => applyGearEnhanceToParty(prev, nextEnhance));
    playSfx("phase");
    setCampMessage(`${gear.name} +${currentLevel + 1} 강화 성공! ${getGearEnhanceText(gear, currentLevel + 1)}`);
  };

  const renderForgeModal = () => {
    if (!forgeOpen) return null;

    return (
      <div className="battle-modal">
        <div className="battle-card equipment-card forge-card">
          <div className="battle-title">제련소</div>
          <div className="result-sub">
            장비를 강화해 영구 보너스를 얻습니다. 최대 +{MAX_GEAR_ENHANCE}까지 강화할 수 있습니다.
          </div>

          <div className="forge-gold-box">
            보유 골드 <strong>{gold}G</strong>
          </div>

          <div className="forge-list">
            {gearInventory.map((gearId) => {
              const gear = EQUIPMENT[gearId];
              if (!gear) return null;

              const level = getGearEnhanceLevel(gearEnhance, gearId);
              const nextCost = getGearEnhanceCost(gearId, level);
              const maxed = level >= MAX_GEAR_ENHANCE;
              const bonusText = getGearEnhanceText(gear, level);
              const nextBonusText = maxed
                ? "최대 강화"
                : getGearEnhanceText(gear, level + 1);

              return (
                <div className={`forge-entry ${maxed ? "maxed" : ""}`} key={gearId}>
                  <div>
                    <strong>
                      {gear.name} +{level}
                    </strong>
                    <span>{gear.desc}</span>
                    <small>
                      현재: {bonusText} {maxed ? "" : `→ 다음: ${nextBonusText}`}
                    </small>
                  </div>
                  <button disabled={maxed || gold < nextCost} onClick={() => upgradeGear(gearId)}>
                    {maxed ? "MAX" : `${nextCost}G`}
                  </button>
                </div>
              );
            })}
          </div>

          <button className="result-btn second" onClick={() => setForgeOpen(false)}>
            닫기
          </button>
        </div>
      </div>
    );
  };

  const renderEquipmentModal = () => {
    if (!equipmentOpen) return null;
    const weapon = equipmentUnit?.equipment?.weapon ? EQUIPMENT[equipmentUnit.equipment.weapon] : null;
    const armor = equipmentUnit?.equipment?.armor ? EQUIPMENT[equipmentUnit.equipment.armor] : null;
    return (
      <div className="battle-modal">
        <div className="battle-card equipment-card">
          <div className="battle-title">장비</div>
          <div className="equipment-unit-tabs">
            {party.map((unit) => (
              <button key={unit.id} className={equipmentUnitId === unit.id ? "active-tab" : ""} onClick={() => setEquipmentUnitId(unit.id)}>
                {unit.icon} {unit.name}
              </button>
            ))}
          </div>
          <div className="battle-stats">
            <div>병과 <strong>{getUnitDisplayClass(equipmentUnit)}</strong></div>
            <div>현재 능력 <strong>공격 {equipmentUnit.atk} / 방어 {equipmentUnit.def}</strong></div>
            <div>
              무기{" "}
              <strong>
                {weapon ? `${weapon.name} +${getGearEnhanceLevel(gearEnhance, weapon.id)}` : "없음"}
              </strong>
            </div>
            <div>
              방어구{" "}
              <strong>
                {armor ? `${armor.name} +${getGearEnhanceLevel(gearEnhance, armor.id)}` : "없음"}
              </strong>
            </div>
          </div>
          <div className="equipment-list">
            {gearInventory.map((gearId) => {
              const gear = EQUIPMENT[gearId];
              const canUse = gear.allowed.includes(equipmentUnit.id);
              return (
                <button key={gearId} disabled={!canUse} onClick={() => equipGear(gearId)}>
                  {gear.name} +{getGearEnhanceLevel(gearEnhance, gearId)} · {gear.desc} · {getGearEnhanceText(gear, getGearEnhanceLevel(gearEnhance, gearId))}
                </button>
              );
            })}
          </div>
          <div className="battle-buttons">
            <button onClick={() => unequipGear("weapon")}>무기 해제</button>
            <button onClick={() => unequipGear("armor")}>방어구 해제</button>
          </div>
          <button className="result-btn second" onClick={() => setEquipmentOpen(false)}>닫기</button>
        </div>
      </div>
    );
  };

  const copyQaFixPlan = async (item) => {
    try {
      await navigator.clipboard.writeText(buildQaFixPlan(item));
      alert("QA 수정 계획을 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const updateFeedbackStatusQuick = (id, status) => {
    const target = feedbackReports.find((item) => item.id === id);
    const nextReports = feedbackReports.map((item) =>
      item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item
    );

    setFeedbackReports(nextReports);
    saveFeedbackReports(nextReports);

    if (target) {
      const entry = createQaFixHistoryEntry(target, status);
      setQaFixHistory((prev) => {
        const next = [entry, ...prev].slice(0, 100);
        saveQaFixHistory(next);
        return next;
      });
    }
  };

  const markTopQaFixed = () => {
    const target = qaPriorityBoard.urgent[0] || qaPriorityBoard.high[0];
    if (!target) {
      alert("처리할 긴급/높은 우선순위 항목이 없습니다.");
      return;
    }
    updateFeedbackStatusQuick(target.id, "fixed");
    alert(`처리 완료 표시: ${target.title}`);
  };

  const copyQaFixHistory = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            version: SAVE_VERSION,
            stats: qaFixHistoryStats,
            history: qaFixHistory,
            time: new Date().toISOString(),
          },
          null,
          2
        )
      );
      alert("QA 처리 이력을 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const copyQaChangelog = async () => {
    try {
      await navigator.clipboard.writeText(createQaChangelogText(qaFixHistory));
      alert("QA 변경 기록을 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const copyPublicPatchNotesFromQa = async () => {
    try {
      await navigator.clipboard.writeText(createPublicPatchNotesFromQa(qaFixHistory, feedbackReports));
      alert("QA 반영 노트를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const saveCurrentQaReleaseNote = () => {
    const entry = createQaReleaseArchiveEntry(qaFixHistory, feedbackReports);
    const next = [entry, ...qaReleaseArchive].slice(0, 50);
    setQaReleaseArchive(next);
    saveQaReleaseArchive(next);
    alert("현재 QA 반영 노트를 보관함에 저장했습니다.");
  };

  const copyQaReleaseArchiveItem = async (item) => {
    try {
      await navigator.clipboard.writeText(item.text);
      alert("보관된 반영 노트를 클립보드에 복사했습니다.");
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const deleteQaReleaseArchiveItem = (id) => {
    const ok = window.confirm("이 반영 노트를 보관함에서 삭제할까요?");
    if (!ok) return;

    const next = qaReleaseArchive.filter((item) => item.id !== id);
    setQaReleaseArchive(next);
    saveQaReleaseArchive(next);
  };

  const toggleQaReleaseArchiveFavorite = (id) => {
    const next = qaReleaseArchive.map((item) =>
      item.id === id ? { ...item, favorite: !item.favorite } : item
    );
    setQaReleaseArchive(next);
    saveQaReleaseArchive(next);
  };

  const clearQaReleaseArchive = () => {
    const ok = window.confirm("QA 반영 노트 보관함을 모두 비울까요?");
    if (!ok) return;

    setQaReleaseArchive([]);
    saveQaReleaseArchive([]);
  };

  const clearQaFixHistory = () => {
    const ok = window.confirm("QA 처리 이력을 모두 비울까요?");
    if (!ok) return;

    setQaFixHistory([]);
    saveQaFixHistory([]);
    alert("QA 처리 이력을 비웠습니다.");
  };

  return (
    <div className={`app ${screenShake ? `screen-shake-${screenShake}` : ""}`}>
      <div className="overlay" />
      {phaseBanner && <div className="phase-banner">{phaseBanner}</div>}
      {stageBanner && (
        <div className={`stage-directing-banner stage-banner-${stageBanner.type}`}>
          <div className="stage-banner-label">{stageBanner.label}</div>
          <div className="stage-banner-title">{stageBanner.title}</div>
          <div className="stage-banner-subtitle">{stageBanner.subtitle}</div>
        </div>
      )}
      {turnPhaseBanner && (
        <div className={`turn-phase-banner turn-phase-${turnPhaseBanner.side}`}>
          <div className="turn-phase-label">{turnPhaseBanner.label}</div>
          <div className="turn-phase-title">{turnPhaseBanner.title}</div>
          <div className="turn-phase-subtitle">{turnPhaseBanner.subtitle}</div>
        </div>
      )}
      {turnBusy && <div className="turn-busy-banner">{turn === "enemy" ? "적 행동 중..." : "이동 처리 중..."}</div>}
      {bossCutscene && (
        <div className={`boss-cutscene-overlay boss-${bossCutscene.type}`}>
          <div className="boss-cutscene-card">
            <div className="boss-cutscene-bg">
              <div className="boss-red-moon" />
              <div className="boss-aura" />
            </div>

            <div className="boss-cutscene-label">{bossCutscene.label}</div>

            <div className="boss-cutscene-stage">
              <img src={getUnitPortrait(bossCutscene.boss)} alt={bossCutscene.boss.name} />
              <div className="boss-cutscene-flare" />
            </div>

            <div className="boss-cutscene-info">
              <h2>{bossCutscene.title}</h2>
              <p>{bossCutscene.subtitle}</p>

              <div className="boss-stat-row">
                <span>HP {bossCutscene.boss.hp}/{bossCutscene.boss.maxHp}</span>
                <span>공격 {bossCutscene.boss.atk}</span>
                <span>방어 {bossCutscene.boss.def}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {combatCutscene && (
        <div className="combat-cutscene-overlay dk-cutscene-overlay dk-final-vs-overlay">
          <div
            className={`combat-cutscene-card dk-cutscene-card dk-final-vs-card dk-effect-${combatCutscene.effectType || "slash"} dk-motion-${combatCutscene.motionKey || "sword"} ${combatCutscene.finish ? "finish-cutscene" : ""} ${combatCutscene.outcome?.heal ? "heal-cutscene" : ""} ${combatCutscene.outcome?.crit ? "crit-cutscene" : ""} ${!combatCutscene.outcome?.hit ? "miss-cutscene" : ""}`}
            style={{
              "--dk-cutscene-ms": `${combatCutscene.durationMs || cutsceneConfig.duration || 1800}ms`,
              "--dk-cutscene-bg-art": `url("${getClassicBattleMapArt(activeStage)}")`,
            }}
          >
            <div className="dk-cutscene-bg">
              <div className="dk-moon" />
              <div className="dk-horizon" />
              <div className="dk-floor" />
            </div>

            <div className="combat-cutscene-title dk-cutscene-title">
              <span className="dk-action-name">{combatCutscene.title}</span>
              <span className="dk-effect-badge">
                {combatCutscene.effectIcon} {combatCutscene.effectLabel}
              </span>
              <span className="dk-result-tag">
                {combatCutscene.outcome?.heal
                  ? `HEAL · ${combatCutscene.outcome.damage}`
                  : combatCutscene.finish
                  ? `FINISH · ${combatCutscene.outcome.damage}`
                  : combatCutscene.outcome?.hit
                  ? combatCutscene.outcome?.crit
                    ? `CRITICAL · ${combatCutscene.outcome.damage}`
                    : `${combatCutscene.outcome.damage} DAMAGE`
                  : "MISS"}
              </span>
            </div>

            <div className="dk-duel-stage">
              <div className="dk-duel-sidewash dk-duel-sidewash-ally" />
              <div className="dk-duel-sidewash dk-duel-sidewash-enemy" />
              <img className="dk-duel-cutin dk-duel-cutin-attacker" src={getUnitPortrait(combatCutscene.attacker)} alt="" aria-hidden="true" />
              <img className="dk-duel-cutin dk-duel-cutin-defender" src={getUnitPortrait(combatCutscene.defender)} alt="" aria-hidden="true" />
              <div className="dk-duel-clash-crest">
                <span>VS</span>
              </div>
              <div className="dk-duel-action-line">
                <span>{combatCutscene.attacker.name}</span>
                <b>{combatCutscene.title}</b>
                <span>{combatCutscene.defender.name}</span>
              </div>
              <div className="dk-fighter dk-attacker">
                <div className="dk-platform" />
                <span className="dk-fighter-afterimage" />
                <span className="dk-cast-aura" />
                <div className={`dk-fighter-rig dk-attacker-rig dk-unit-${combatCutscene.attacker.id || "unit"}`}>
                  <img className="dk-character-body" src={getCutsceneUnitSprite(combatCutscene.attacker)} alt={combatCutscene.attacker.name} />
                  <span className="dk-cutscene-weapon" />
                  <span className="dk-cutscene-trail" />
                </div>
              </div>

              <div className="dk-fighter dk-defender">
                <div className="dk-platform" />
                <span className="dk-hit-guard" />
                <div className={`dk-fighter-rig dk-defender-rig dk-unit-${combatCutscene.defender.id || "unit"}`}>
                  <img className="dk-character-body" src={getCutsceneUnitSprite(combatCutscene.defender)} alt={combatCutscene.defender.name} />
                </div>
              </div>

              <div className="dk-impact-layer">
                <div className="dk-motion-projectile" />
                <div className="dk-motion-spell-ring" />
                <div className="dk-motion-impact-flash" />
                <div className="dk-finish-beam" />
                <div className="cutscene-slash dk-slash" />
                <div className="dk-spark dk-spark-a" />
                <div className="dk-spark dk-spark-b" />
                <div className="dk-effect-orb dk-orb-a" />
                <div className="dk-effect-orb dk-orb-b" />
                <div className="dk-effect-orb dk-orb-c" />
                <b>{combatCutscene.outcome?.heal ? `+${combatCutscene.outcome.damage}` : combatCutscene.outcome?.hit ? combatCutscene.outcome.damage : "MISS"}</b>
              </div>
            </div>

            <div className="dk-status-row">
              <div className="dk-status-panel attacker-panel">
                <strong>{combatCutscene.attacker.name}</strong>
                <span>{getCombatClassLabel(getUnitCombatClass(combatCutscene.attacker))} · {combatCutscene.attacker.skill}</span>
                <div className="dk-hpbar">
                  <i style={{ width: `${combatCutscene.attacker.maxHp ? Math.max(0, Math.min(100, ((combatCutscene.attackerPostHp ?? combatCutscene.attacker.hp) / combatCutscene.attacker.maxHp) * 100)) : 0}%` }} />
                </div>
                <small>HP {combatCutscene.attackerPostHp ?? combatCutscene.attacker.hp}/{combatCutscene.attacker.maxHp}</small>
              </div>

              <div className="dk-vs-mark">VS</div>

              <div className="dk-status-panel defender-panel">
                <strong>{combatCutscene.defender.name}</strong>
                <span>{getCombatClassLabel(getUnitCombatClass(combatCutscene.defender))} · {getInspectUnitKind(combatCutscene.defender)}</span>
                <div className="dk-hpbar enemy">
                  <i
                    className="dk-hp-before"
                    style={{ width: `${combatCutscene.defender.maxHp ? Math.max(0, Math.min(100, (combatCutscene.defender.hp / combatCutscene.defender.maxHp) * 100)) : 0}%` }}
                  />
                  <i
                    className="dk-hp-after"
                    style={{ width: `${combatCutscene.defender.maxHp ? Math.max(0, Math.min(100, ((combatCutscene.defenderPostHp ?? combatCutscene.defender.hp) / combatCutscene.defender.maxHp) * 100)) : 0}%` }}
                  />
                </div>
                <small>
                  HP {combatCutscene.defenderPostHp ?? combatCutscene.defender.hp}/{combatCutscene.defender.maxHp}
                  {combatCutscene.outcome?.heal && combatCutscene.outcome.damage ? ` (+${combatCutscene.outcome.damage})` : combatCutscene.outcome?.hit && combatCutscene.outcome.damage ? ` (-${combatCutscene.outcome.damage})` : ""}
                </small>
              </div>
            </div>

            <div className="dk-skill-caption">{combatCutscene.attacker.name}의 {combatCutscene.title}</div>
            <div className="dk-touch-hint">전투 컷씬 진행 중</div>
          </div>
        </div>
      )}




      {tutorialOpen && (
        <div className="battle-modal tutorial-modal">
          <div className="battle-card tutorial-card">
            <div className="tutorial-title-row">
              <div className="tutorial-icon">{activeTutorialGuide.icon}</div>
              <div>
                <div className="battle-title">{activeTutorialGuide.title}</div>
                <div className="result-sub">{activeTutorialGuide.desc}</div>
              </div>
            </div>

            <div className="tutorial-tab-row">
              {TUTORIAL_GUIDES.map((guide) => (
                <button
                  key={guide.id}
                  className={tutorialGuideId === guide.id ? "selected" : ""}
                  onClick={() => setTutorialGuideId(guide.id)}
                >
                  {guide.icon} {guide.title}
                </button>
              ))}
            </div>

            <div className="tutorial-tip-list">
              {activeTutorialGuide.tips.map((tip, index) => (
                <div key={index}>
                  <span>{index + 1}</span>
                  <p>{tip}</p>
                </div>
              ))}
            </div>

            <div className="tutorial-quick-grid">
              <button onClick={() => setTutorialGuideId("deploy")}>출전 편성</button>
              <button onClick={() => setTutorialGuideId("battle")}>전투 조작</button>
              <button onClick={() => setTutorialGuideId("boss")}>보스전</button>
              <button onClick={() => setTutorialGuideId("camp")}>캠프 관리</button>
            </div>

            <button className="result-btn second" onClick={() => setTutorialOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
      {screen === "story" && storyScene && (
        <div className={`story-screen story-${storyScene.type}`}>
          <div className="story-bg">
            <img
              src={`/maps/stage_${storyScene.stage?.id || 1}.jpg`}
              alt={storyScene.stage?.title || "스토리 배경"}
            />
            <div className="story-bg-vignette" />
          </div>

          <div className="story-header">
            <div>
              <div className="screen-kicker">
                {storyScene.type === "intro" ? "전투 전야" : "전투 이후"}
              </div>
              <h1>{storyScene.stage?.title}</h1>
            </div>
            {PLAYTEST_STORY_CAN_SKIP && (
              <button className="back-btn story-skip-btn" onClick={skipStoryScene}>
                {storyScene.onComplete === "battle" ? "바로 전투" : "건너뛰기"}
              </button>
            )}
          </div>

          <div className="story-character-stage">
            <img
              src={getStoryPortrait(storyScene.lines[storyScene.index]?.speaker)}
              alt={storyScene.lines[storyScene.index]?.speaker}
            />
          </div>

          <div className="story-dialogue-panel" onClick={nextStoryLine}>
            <div className="story-speaker">
              {storyScene.lines[storyScene.index]?.speaker}
            </div>
            <div className="story-line">
              {storyScene.lines[storyScene.index]?.text}
            </div>
            <div className="story-footer">
              <span>
                {storyScene.index + 1} / {storyScene.lines.length}
              </span>
              <button onClick={(event) => {
                event.stopPropagation();
                nextStoryLine();
              }}>
                {storyScene.index >= storyScene.lines.length - 1 ? "계속" : "다음"}
              </button>
            </div>
          </div>
        </div>
      )}


      {screen === "pwa" && (
        <div className="pwa-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">천수 앱 설치</div>
              <h1>PWA 점검</h1>
            </div>
            <button className="back-btn" onClick={() => setScreen("promo")}>
              뒤로
            </button>
          </div>

          <div className="pwa-hero-card">
            <div className="pwa-icon">天</div>
            <div>
              <strong>천수를 앱처럼 설치</strong>
              <span>
                홈 화면에 추가하면 전체화면에 가까운 독립 실행 모드로 플레이할 수 있습니다.
              </span>
            </div>
          </div>

          <div className="pwa-status-grid">
            <div className="pwa-status-box">
              <span>서비스워커</span>
              <strong>{pwaStatus.serviceWorker ? "지원" : "미지원"}</strong>
            </div>
            <div className="pwa-status-box">
              <span>설치 가능</span>
              <strong>{pwaStatus.installable ? "가능" : "대기/수동"}</strong>
            </div>
            <div className="pwa-status-box">
              <span>실행 상태</span>
              <strong>{pwaStatus.standalone ? "앱 모드" : "브라우저"}</strong>
            </div>
            <div className="pwa-status-box">
              <span>네트워크</span>
              <strong>{pwaStatus.online ? "온라인" : "오프라인"}</strong>
            </div>
          </div>

          <div className="pwa-install-card">
            <h2>설치 방법</h2>
            <p>
              Chrome/Edge에서는 아래 버튼으로 설치할 수 있습니다. 버튼이 작동하지 않으면 브라우저 메뉴에서
              <b> 앱 설치</b> 또는 <b>홈 화면에 추가</b>를 선택하세요.
            </p>
            <button className="pwa-install-btn" onClick={handleInstallPWA}>
              천수 설치하기
            </button>
          </div>

          <div className="pwa-checklist">
            <h2>출시 전 PWA 체크</h2>
            <div>앱 이름: 천수</div>
            <div>표시 방식: standalone</div>
            <div>화면 방향: portrait</div>
            <div>아이콘: 192 / 512 / maskable</div>
            <div>오프라인 캐시: 기본 페이지 및 주요 이미지</div>
          </div>

          <div className="records-actions">
            <button onClick={() => setScreen("promo")}>홍보 페이지</button>
            <button onClick={() => setScreen("menu")}>메인 메뉴</button>
          </div>
        </div>
      )}

      {screen === "hall" && (
        <div className="hall-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Hall of Fame</div>
              <h1>명예의 전당</h1>
              <span className="settings-version-label">천수 기사단의 주요 기록</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              메뉴
            </button>
          </div>

          <div className="hall-hero-card">
            <div className="hall-crown">👑</div>
            <div>
              <strong>{selectedPlayerTitleName}</strong>
              <span>
                캠페인 {clearedStages.length}/{stages.length} · 전투 {careerStats.battles || 0}회 · 업적 {claimedAchievements.length}개
              </span>
            </div>
          </div>

          <div className="hall-rank-list">
            {hallOfFameEntries.map((entry, index) => (
              <div className={`hall-rank-card rank-${index + 1}`} key={entry.id}>
                <span className="hall-rank-number">{index + 1}</span>
                <div className="hall-rank-icon">{entry.icon}</div>
                <div>
                  <strong>{entry.title}</strong>
                  <small>{entry.type} · {entry.subtitle}</small>
                </div>
                <b>{entry.score}</b>
              </div>
            ))}
          </div>

          <div className="hall-actions">
            <button onClick={copyHallOfFame}>명예의 전당 복사</button>
            <button onClick={() => setScreen("profile")}>프로필</button>
            <button onClick={() => setScreen("records")}>기록</button>
            <button onClick={() => setScreen("planner")}>플래너</button>
            <button onClick={() => setScreen("gallery")}>갤러리</button>
          </div>
        </div>
      )}

      {screen === "gallery" && (
        <div className="gallery-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Snapshot Gallery</div>
              <h1>스냅샷 갤러리</h1>
              <span className="settings-version-label">저장된 스냅샷 {snapshotGallery.length}개</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              메뉴
            </button>
          </div>

          <div className="gallery-guide-card">
            <strong>포토 모드에서 저장 버튼을 누르면 이곳에 기록됩니다.</strong>
            <span>실제 이미지 파일 저장이 아니라, 장면 제목/테마/메모를 모아두는 인게임 스냅샷 앨범입니다.</span>
            <textarea
              value={snapshotNote}
              onChange={(event) => setSnapshotNote(event.target.value)}
              placeholder="다음 스냅샷에 남길 메모를 입력하세요."
            />
            <div>
              <button onClick={() => setScreen("profile")}>프로필 촬영</button>
              <button onClick={() => setScreen("campaign")}>월드맵 촬영</button>
              <button onClick={copySnapshotGallery}>목록 복사</button>
            </div>
          </div>

          <div className="snapshot-grid">
            {snapshotGallery.map((entry) => (
              <div className={`snapshot-card photo-theme-${entry.photoTheme || "classic"}`} key={entry.id}>
                <div className="snapshot-frame">
                  <span>{getSnapshotScreenLabel(entry.screen)}</span>
                  <strong>{entry.title}</strong>
                  <small>{entry.subtitle}</small>
                </div>
                {entry.note && <p>{entry.note}</p>}
                <div className="snapshot-meta">
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  <button onClick={() => deleteSnapshotEntry(entry.id)}>삭제</button>
                </div>
              </div>
            ))}
          </div>

          {!snapshotGallery.length && (
            <div className="gallery-empty">
              아직 저장된 스냅샷이 없습니다. 전투/프로필/도감 화면에서 포토 모드를 켜고 저장해보세요.
            </div>
          )}
        </div>
      )}

      {screen === "profile" && (
        <div className="profile-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Commander Profile</div>
              <h1>지휘관 프로필</h1>
              <span className="settings-version-label">현재 칭호: {selectedPlayerTitleName}</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              메뉴
            </button>
          </div>

          <div className={`profile-hero-card ${activeProfileFrame.className}`}>
            <div className="profile-emblem">{activeProfileFrame.icon}</div>
            <div>
              <strong>{selectedPlayerTitleName}</strong>
              <span>천수 기사단 지휘관 Lv.{commanderLevel}</span>
              <div className="profile-exp-bar">
                <i style={{ width: `${commanderProgress}%` }} />
              </div>
              <small>다음 레벨까지 {100 - commanderProgress}%</small>
            </div>
          </div>

          <div className={`profile-share-card ${activeProfileFrame.className}`}>
            <div className="profile-share-title">지휘관 공유 카드</div>
            <div className="profile-share-lines">
              <span>{selectedPlayerTitleName}</span>
              <strong>Lv.{commanderLevel} 지휘관</strong>
              <small>
                캠페인 {clearedStages.length}/{stages.length} · 전투 {careerStats.battles || 0}회 · 도감 {unlockedCodexCount}개
              </small>
            </div>
            <button onClick={copyCommanderShareCard}>공유 카드 복사</button>
          </div>

          <div className="profile-frame-card">
            <div className="title-collection-head">
              <h2>프로필 프레임</h2>
              <span>{unlockedProfileFrames.filter((frame) => frame.isUnlocked).length} / {PROFILE_FRAMES.length}</span>
            </div>

            <div className="profile-frame-grid">
              {unlockedProfileFrames.map((frame) => (
                <button
                  key={frame.id}
                  disabled={!frame.isUnlocked}
                  className={`${frame.className} ${frame.isUnlocked ? "unlocked" : "locked"} ${activeProfileFrame.id === frame.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedProfileFrame(frame.id);
                    playSfx("confirm");
                  }}
                >
                  <span>{frame.isUnlocked ? frame.icon : "?"}</span>
                  <strong>{frame.isUnlocked ? frame.name : "미해금 프레임"}</strong>
                  <small>{frame.isUnlocked ? frame.desc : frame.desc}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="profile-stat-grid">
            <div><span>클리어</span><strong>{clearedStages.length}</strong></div>
            <div><span>누적 전투</span><strong>{careerStats.battles || 0}</strong></div>
            <div><span>승리</span><strong>{careerStats.victories || 0}</strong></div>
            <div><span>업적 수령</span><strong>{claimedAchievements.length}</strong></div>
            <div><span>도감 해금</span><strong>{unlockedCodexCount}</strong></div>
            <div><span>피드백</span><strong>{feedbackReports.length}</strong></div>
          </div>

          <div className="title-collection-card">
            <div className="title-collection-head">
              <h2>칭호 컬렉션</h2>
              <span>{unlockedPlayerTitles.filter((title) => title.isUnlocked).length} / {PLAYER_TITLES.length}</span>
            </div>

            <div className="title-list-grid">
              {unlockedPlayerTitles.map((title) => (
                <button
                  key={title.id}
                  disabled={!title.isUnlocked}
                  className={`${title.isUnlocked ? "unlocked" : "locked"} ${selectedPlayerTitle === title.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedPlayerTitle(title.id);
                    playSfx("confirm");
                  }}
                >
                  <strong>{title.isUnlocked ? title.name : "미해금 칭호"}</strong>
                  <span>{title.isUnlocked ? title.desc : title.condition}</span>
                  <small>{title.condition}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="profile-actions">
            <button onClick={togglePhotoMode}>포토 모드</button>
            <button onClick={() => setScreen("records")}>기록 보기</button>
            <button onClick={() => setScreen("codex")}>도감 보기</button>
            <button onClick={() => setScreen("analytics")}>플레이테스트</button>
            <button onClick={() => setScreen("campaign")}>월드맵</button>
          </div>
        </div>
      )}

      {screen === "codex" && (
        <div className="codex-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Cheonsu Codex</div>
              <h1>천수 도감</h1>
              <span className="settings-version-label">해금 {unlockedCodexCount} / {codexEntries.length}</span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="back-btn photo-toggle-btn" onClick={togglePhotoMode}>포토</button>
              <button className="back-btn" onClick={() => setScreen("menu")}>
                메뉴
              </button>
            </div>
          </div>

          <div className="codex-search-card">
            <input
              value={codexQuery}
              onChange={(event) => setCodexQuery(event.target.value)}
              placeholder="동료, 스테이지, 시스템을 검색하세요"
            />
            <div className="codex-category-row">
              {codexCategories.map((category) => (
                <button
                  key={category}
                  className={codexCategory === category ? "selected" : ""}
                  onClick={() => setCodexCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="codex-grid">
            {visibleCodexEntries.map((entry) => (
              <div key={entry.id} className={`codex-card ${entry.unlocked ? "unlocked" : "locked"}`}>
                <div className="codex-icon">{entry.unlocked ? entry.icon : "?"}</div>
                <div>
                  <span>{entry.category}</span>
                  <strong>{entry.unlocked ? entry.title : "미해금 항목"}</strong>
                  <em>{entry.unlocked ? entry.subtitle : "진행을 통해 해금됩니다."}</em>
                  <p>{entry.unlocked ? entry.desc : "월드맵을 진행하거나 동료를 합류시키면 상세 정보가 열립니다."}</p>
                </div>
              </div>
            ))}
          </div>

          {!visibleCodexEntries.length && <div className="codex-empty">검색 결과가 없습니다.</div>}
        </div>
      )}

      {screen === "strategyArchive" && (
        <div className="strategy-archive-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Strategy Archive</div>
              <h1>전략 리포트 보관함</h1>
              <span className="settings-version-label">
                저장 {strategyArchiveStats.total}개 · 우수 {strategyArchiveStats.highCount}개
              </span>
            </div>
            <button className="back-btn" onClick={() => setScreen("records")}>
              기록
            </button>
          </div>

          <div className="strategy-archive-stats">
            <div>
              <span>최고 점수</span>
              <strong>{strategyArchiveStats.best?.score || 0}</strong>
            </div>
            <div>
              <span>보스 리포트</span>
              <strong>{strategyArchiveStats.bossCount}</strong>
            </div>
            <div>
              <span>주의 있음</span>
              <strong>{strategyArchiveStats.warningCount}</strong>
            </div>
            <div>
              <span>즐겨찾기</span>
              <strong>{strategyArchiveStats.favoriteCount}</strong>
            </div>
          </div>

          <div className="strategy-quick-slot-panel">
            <div className="strategy-quick-head">
              <strong>전략 빠른 슬롯</strong>
              <span>즐겨 쓰는 전략을 1~4번 슬롯에 고정합니다.</span>
            </div>
            <div className="strategy-quick-actions">
              <button onClick={copyQuickSlotSummary}>요약 복사</button>
              <button onClick={copyQuickSlotExportJson}>JSON 복사</button>
              <button onClick={clearAllStrategyQuickSlots}>전체 비우기</button>
            </div>

            <div className="strategy-import-box">
              <textarea
                value={strategySlotImportText}
                onChange={(event) => setStrategySlotImportText(event.target.value)}
                placeholder="JSON 복사로 내보낸 전략 슬롯 데이터를 붙여넣으세요."
              />
              <div>
                <button onClick={pasteQuickSlotJsonFromClipboard}>클립보드 붙여넣기</button>
                <button onClick={importQuickSlotJson}>JSON 가져오기</button>
              </div>
            </div>

            <div className="strategy-quick-grid">
              {strategyQuickSlotEntries.map(({ slot, entry }) => (
                <div className={`strategy-quick-card ${entry ? "filled" : ""}`} key={slot}>
                  <b>{slot}</b>
                  <div>
                    <strong>{entry ? getQuickSlotDisplayName(slot, entry, strategyQuickSlotNames) : "비어 있음"}</strong>
                    <span>{entry ? `${entry.stageTitle} · ${entry.grade} · ${entry.score}` : "보관함 카드에서 슬롯 지정"}</span>
                    {entry && (
                      <input
                        value={strategyQuickSlotNames[String(slot)] || ""}
                        onChange={(event) => renameStrategyQuickSlot(slot, event.target.value)}
                        placeholder="슬롯 이름"
                      />
                    )}
                  </div>
                  {entry ? (
                    <button onClick={() => applyArchivedStrategyReport(entry)}>적용</button>
                  ) : (
                    <button disabled>대기</button>
                  )}
                  {entry && (
                    <button className="clear-slot-btn" onClick={() => clearStrategyQuickSlot(slot)}>해제</button>
                  )}
                  {entry && (
                    <button className="clear-slot-btn" onClick={() => clearStrategyQuickSlotName(slot)}>이름 삭제</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="strategy-archive-guide">
            <strong>출전 브리핑의 전략 리포트를 저장하면 이곳에 보관됩니다.</strong>
            <span>이전 편성/태그/주의사항을 비교하고, 좋은 전략을 편성 화면에 바로 재적용하세요.</span>
            <input
              value={strategyArchiveQuery}
              onChange={(event) => setStrategyArchiveQuery(event.target.value)}
              placeholder="스테이지, 태그, 출전 동료, 메모 검색"
            />
            <div className="strategy-archive-filter-row">
              {["all", "favorite", "high", "warning", "boss", "recent"].map((filter) => (
                <button
                  key={filter}
                  className={strategyArchiveFilter === filter ? "selected" : ""}
                  onClick={() => setStrategyArchiveFilter(filter)}
                >
                  {getStrategyArchiveFilterLabel(filter)}
                </button>
              ))}
            </div>
            <div>
              <button onClick={() => setScreen("planner")}>마스터리 플래너</button>
              <button onClick={applyBestFavoriteStrategy}>최고 즐겨찾기 적용</button>
              <button onClick={() => navigator.clipboard.writeText(createStrategyArchiveText(visibleStrategyArchive)).then(() => playSfx("save")).catch(() => alert("클립보드 복사에 실패했습니다."))}>
                필터 결과 복사
              </button>
              <button onClick={copyStrategyReportArchive}>전체 복사</button>
              <button onClick={copyStrategyCompare}>비교 복사</button>
              <button onClick={() => setCompareStrategyIds([])}>비교 초기화</button>
            </div>
          </div>

          {strategyCompareResult && (
            <div className="strategy-compare-card">
              <div className="strategy-compare-head">
                <div>
                  <span>전략 비교</span>
                  <strong>
                    {strategyCompareResult.from.stageTitle} → {strategyCompareResult.to.stageTitle}
                  </strong>
                </div>
                <b>{strategyCompareResult.scoreDiff >= 0 ? `+${strategyCompareResult.scoreDiff}` : strategyCompareResult.scoreDiff}</b>
              </div>

              <div className="strategy-compare-grid">
                <div><span>등급 변화</span><strong>{strategyCompareResult.gradeDiff >= 0 ? `+${strategyCompareResult.gradeDiff}` : strategyCompareResult.gradeDiff}</strong></div>
                <div><span>주의 변화</span><strong>{strategyCompareResult.warningDiff >= 0 ? `+${strategyCompareResult.warningDiff}` : strategyCompareResult.warningDiff}</strong></div>
                <div><span>강점 변화</span><strong>{strategyCompareResult.strengthDiff >= 0 ? `+${strategyCompareResult.strengthDiff}` : strategyCompareResult.strengthDiff}</strong></div>
              </div>

              <div className="strategy-compare-tags">
                <div>
                  <strong>추가 태그</strong>
                  <span>{getStrategyTagsText(strategyCompareResult.addedTags)}</span>
                </div>
                <div>
                  <strong>제거 태그</strong>
                  <span>{getStrategyTagsText(strategyCompareResult.removedTags)}</span>
                </div>
              </div>
              <div className="strategy-compare-actions">
                <button onClick={applyBestComparedStrategy}>더 좋은 전략 적용</button>
                <button onClick={() => applyArchivedStrategyReport(strategyCompareResult.from)}>기준 적용</button>
                <button onClick={() => applyArchivedStrategyReport(strategyCompareResult.to)}>비교 적용</button>
              </div>
            </div>
          )}

          <div className="strategy-archive-list">
            {visibleStrategyArchive.map((entry) => (
              <div className={`strategy-archive-card grade-${entry.grade}`} key={entry.id}>
                <div className="archive-grade">{entry.grade}</div>
                <div className="archive-main">
                  <strong>
                    {strategyFavoriteIds.includes(entry.id) ? "★ " : ""}{entry.stageTitle || "전략 리포트"}
                  </strong>
                  <span>{entry.mission} · {entry.preset} · {entry.label}</span>
                  <small>
                    점수 {entry.score} · 자동 {entry.autoBattleMode} · {new Date(entry.createdAt).toLocaleString()}
                  </small>
                  <div className="archive-tags">
                    {(entry.tags || []).map((tagId) => (
                      <em key={tagId}>{getStrategyTagLabel(tagId)}</em>
                    ))}
                  </div>
                  {(entry.strengths || []).length > 0 && (
                    <div className="archive-mini-list good">
                      {(entry.strengths || []).slice(0, 3).map((item) => <span key={item}>✓ {item}</span>)}
                    </div>
                  )}
                  {(entry.warnings || []).length > 0 && (
                    <div className="archive-mini-list warn">
                      {(entry.warnings || []).slice(0, 3).map((item) => <span key={item}>⚠ {item}</span>)}
                    </div>
                  )}
                  {entry.note && <p>{entry.note}</p>}
                </div>
                <div className="archive-actions">
                  <button
                    className={strategyFavoriteIds.includes(entry.id) ? "favorite-on" : ""}
                    onClick={() => toggleStrategyFavorite(entry.id)}
                  >
                    {strategyFavoriteIds.includes(entry.id) ? "★" : "☆"}
                  </button>
                  <button onClick={() => assignStrategyQuickSlot(1, entry.id)}>S1</button>
                  <button onClick={() => assignStrategyQuickSlot(2, entry.id)}>S2</button>
                  <button onClick={() => assignStrategyQuickSlot(3, entry.id)}>S3</button>
                  <button onClick={() => assignStrategyQuickSlot(4, entry.id)}>S4</button>
                  <button
                    className={compareStrategyIds.includes(entry.id) ? "selected-compare" : ""}
                    onClick={() => toggleStrategyComparePick(entry.id)}
                  >
                    비교
                  </button>
                  <button onClick={() => applyArchivedStrategyReport(entry)}>
                    적용
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(createStrategyArchiveText([entry]));
                        playSfx("save");
                        alert("리포트를 복사했습니다.");
                      } catch {
                        alert("클립보드 복사에 실패했습니다.");
                      }
                    }}
                  >
                    복사
                  </button>
                  <button onClick={() => deleteStrategyReportArchiveEntry(entry.id)}>삭제</button>
                </div>
              </div>
            ))}
          </div>

          {!visibleStrategyArchive.length && (
            <div className="strategy-archive-empty">
              표시할 전략 리포트가 없습니다. 검색어나 필터를 확인해 주세요.
            </div>
          )}
        </div>
      )}

      {screen === "planner" && (
        <div className="planner-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Mastery Planner</div>
              <h1>마스터리 플래너</h1>
              <span className="settings-version-label">
                완성도 {masteryPlannerSummary.completion}% · 별 {masteryPlannerSummary.totalStars}/{masteryPlannerSummary.maxStars}
              </span>
            </div>
            <button className="back-btn" onClick={() => setScreen("records")}>
              기록
            </button>
          </div>

          <div className="planner-summary-card">
            <div>
              <span>S랭크</span>
              <strong>{masteryPlannerSummary.mastered}</strong>
            </div>
            <div>
              <span>총 별</span>
              <strong>{masteryPlannerSummary.totalStars}</strong>
            </div>
            <div>
              <span>재클리어</span>
              <strong>{masteryPlannerSummary.totalClears}</strong>
            </div>
          </div>

          <div className="planner-guide-card">
            <strong>추천 기준</strong>
            <span>
              미클리어, 기록 없음, 낮은 랭크, S랭크 도전 가능 스테이지 순서로 추천합니다.
            </span>
          </div>

          <div className="planner-list">
            {masteryPlannerItems.map((item) => (
              <div
                key={item.stage.id}
                className={`planner-card rank-${item.record?.bestRank || "none"} ${item.cleared ? "cleared" : "uncleared"}`}
              >
                <div className="planner-rank">
                  <strong>{item.record?.bestRank || "NEW"}</strong>
                  <span>{item.record ? getRankStars(item.record.bestRank) : "☆☆☆☆"}</span>
                </div>
                <div className="planner-info">
                  <b>STAGE {item.stage.id} · {item.stage.title}</b>
                  <span>{item.mission.type} · {item.mission.title}</span>
                  <small>{item.reason}</small>
                  {item.record && (
                    <em>최고 {item.record.bestRound}R · 클리어 {item.record.clears}회</em>
                  )}
                  <div className="planner-note-preview">
                    <span>메모</span>
                    <textarea
                      value={getStageNote(stageNotes, item.stage)}
                      onChange={(event) => updateStageNote(item.stage.id, event.target.value)}
                      placeholder={getDefaultStrategyNote(item.stage)}
                    />
                    <div>
                      <button onClick={() => applyDefaultStageNote(item.stage)}>추천</button>
                      <button onClick={() => clearStageNote(item.stage.id)}>삭제</button>
                    </div>
                    <div className="planner-tag-preview">
                      {getStageTags(stageNoteTags, item.stage).length
                        ? getStageTags(stageNoteTags, item.stage).map((tagId) => (
                            <span key={tagId}>{getStrategyTagLabel(tagId)}</span>
                          ))
                        : <span>태그 없음</span>}
                    </div>
                    <div>
                      <button onClick={() => applyDefaultStageTags(item.stage)}>추천 태그</button>
                      <button onClick={() => clearStageTags(item.stage.id)}>태그 삭제</button>
                    </div>
                    <div className="planner-preset-mini">
                      {STRATEGY_TAG_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          className={getRecommendedPresetForStage(item.stage) === preset.id ? "recommended" : ""}
                          onClick={() => applyStrategyPreset(item.stage, preset.id)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="planner-action-stack">
                  <button onClick={() => applyStrategyPresetPreparation(item.stage)}>
                    전략 준비
                  </button>
                  <button onClick={() => startStage(item.stage)}>
                    편성
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!masteryPlannerItems.length && (
            <div className="planner-empty">
              해금된 스테이지가 없습니다. 캠페인을 먼저 진행하세요.
            </div>
          )}
        </div>
      )}

      {screen === "records" && (
        <div className="records-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">천수 기록실</div>
              <h1>기록</h1>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              뒤로
            </button>
          </div>

          <div className="record-hero-card">
            <div className="record-percent">{completedRate}%</div>
            <div>
              <strong>캠페인 진행률</strong>
              <span>
                {clearedStages.length} / {stages.length}장 클리어 · 수령 가능 업적 {claimableAchievementCount}개 · 도전 {claimableChallengeCount}개 · 마스터리 {claimableMasteryRewardCount}개
              </span>
            </div>
          </div>

          <div className="record-grid">
            <div className="record-box">
              <span>클리어한 장</span>
              <strong>{clearedStages.length}</strong>
            </div>
            <div className="record-box mastery-record-box">
              <span>S랭크 장</span>
              <strong>{masterySummary.mastered}</strong>
            </div>
            <div className="record-box mastery-record-box">
              <span>마스터리 별</span>
              <strong>{masterySummary.totalStars}</strong>
            </div>
            <div className="record-box">
              <span>해금된 장</span>
              <strong>{unlockedStages.length}</strong>
            </div>
            <div className="record-box">
              <span>현재 골드</span>
              <strong>{gold}G</strong>
            </div>
            <div className="record-box">
              <span>소모품</span>
              <strong>{getTotalItemCount(inventory)}개</strong>
            </div>
            <div className="record-box">
              <span>보유 장비</span>
              <strong>{gearInventory.length}개</strong>
            </div>
            <div className="record-box">
              <span>전직 동료</span>
              <strong>{party.filter((unit) => unit.promoted).length}명</strong>
            </div>
            <div className="record-box">
              <span>강화 장비</span>
              <strong>{Object.values(gearEnhance).filter((level) => level > 0).length}개</strong>
            </div>
            <div className="record-box">
              <span>스킬 강화</span>
              <strong>{party.reduce((sum, unit) => sum + getSkillUpgradeLevel(unit), 0)}단계</strong>
            </div>
            <div className="record-box">
              <span>이번 캠프 파견</span>
              <strong>{dispatchUsed ? "완료" : "가능"}</strong>
            </div>
            <div className="record-box">
              <span>본 지원 대화</span>
              <strong>{supportSeenCount}개</strong>
            </div>
            <div className="record-box">
              <span>처치 기록</span>
              <strong>{estimatedKillCount}회</strong>
            </div>
            <div className="record-box">
              <span>세이브 버전</span>
              <strong>v{SAVE_VERSION}</strong>
            </div>
            <div className="record-box">
              <span>현재 난이도</span>
              <strong>{getDifficultyConfig(settings.difficulty).label}</strong>
            </div>
            <div className="record-box">
              <span>전투 속도</span>
              <strong>{battleSpeedConfig.label}</strong>
            </div>
          </div>

          <div className={`season-event-section season-${seasonInfo.id}`}>
            <div className="season-event-head">
              <div className="season-event-icon">{seasonInfo.icon}</div>
              <div>
                <h2>{seasonInfo.title}</h2>
                <span>{seasonInfo.desc}</span>
              </div>
              <b>{completedSeasonMissionCount}/{seasonMissions.length}</b>
            </div>

            <div className="season-mission-list">
              {seasonMissions.map((mission) => (
                <div className={`season-mission-row ${mission.completed ? "completed" : ""}`} key={mission.id}>
                  <span>{mission.completed ? "✓" : "·"}</span>
                  <div>
                    <strong>{mission.title}</strong>
                    <small>{mission.desc} · 보상 {getEventRewardText(mission.reward)}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="season-final-reward">
              <span>시즌 완료 보상</span>
              <strong>{getEventRewardText(seasonInfo.reward)}</strong>
              <button
                disabled={seasonClaimed || completedSeasonMissionCount < seasonMissions.length}
                onClick={claimSeasonReward}
              >
                {seasonClaimed ? "수령 완료" : "시즌 보상 수령"}
              </button>
            </div>
          </div>

          <div className="daily-login-section">
            <div className="daily-login-head">
              <div>
                <h2>일일 접속 보상</h2>
                <span>
                  누적 수령 {dailyLoginStatus.totalClaims}회 · 오늘 {dailyLoginStatus.claimedToday ? "수령 완료" : "수령 가능"}
                </span>
              </div>
              <button
                disabled={dailyLoginStatus.claimedToday}
                onClick={claimDailyLoginReward}
              >
                {dailyLoginStatus.claimedToday ? "오늘 완료" : "오늘 보상 받기"}
              </button>
            </div>

            <div className="daily-login-calendar">
              {[0, 1, 2, 3, 4, 5, 6].map((index) => {
                const reward = getDailyLoginReward(index);
                const active = index === dailyLoginStatus.nextIndex && !dailyLoginStatus.claimedToday;
                const done = index < dailyLoginStatus.nextIndex || dailyLoginStatus.claimedToday && index <= dailyLoginStatus.nextIndex;

                return (
                  <div
                    key={index}
                    className={`daily-login-day ${active ? "active" : ""} ${done ? "done" : ""}`}
                  >
                    <strong>{index + 1}일차</strong>
                    <span>{getDailyLoginRewardText(reward)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="challenge-section">
            <div className="achievement-head">
              <div>
                <h2>일일 / 주간 도전</h2>
                <span>오늘 {dailyChallengeDateKey} · 수령 가능 {claimableChallengeCount}개</span>
              </div>
              <button
                disabled={!claimableChallengeCount}
                onClick={() =>
                  [...dailyChallengeProgress, ...weeklyChallengeProgress]
                    .filter((item) => item.claimable)
                    .forEach((item) => claimChallengeReward(item.id))
                }
              >
                모두 수령
              </button>
            </div>

            <div className="challenge-subtitle">오늘의 도전</div>
            <div className="challenge-grid">
              {dailyChallengeProgress.map((challenge) => (
                <div
                  key={challenge.id}
                  className={`challenge-card ${challenge.completed ? "completed" : ""} ${challenge.claimed ? "claimed" : ""}`}
                >
                  <div>
                    <strong>{challenge.title}</strong>
                    <span>{challenge.desc}</span>
                    <small>보상: {getChallengeRewardText(challenge.reward)}</small>
                  </div>
                  {challenge.claimed ? (
                    <b>수령 완료</b>
                  ) : challenge.claimable ? (
                    <button onClick={() => claimChallengeReward(challenge.id)}>수령</button>
                  ) : (
                    <em>진행 중</em>
                  )}
                </div>
              ))}
            </div>

            <div className="challenge-subtitle">주간 도전</div>
            <div className="challenge-grid">
              {weeklyChallengeProgress.map((challenge) => (
                <div
                  key={challenge.id}
                  className={`challenge-card weekly ${challenge.completed ? "completed" : ""} ${challenge.claimed ? "claimed" : ""}`}
                >
                  <div>
                    <strong>{challenge.title}</strong>
                    <span>{challenge.desc}</span>
                    <small>보상: {getChallengeRewardText(challenge.reward)}</small>
                  </div>
                  {challenge.claimed ? (
                    <b>수령 완료</b>
                  ) : challenge.claimable ? (
                    <button onClick={() => claimChallengeReward(challenge.id)}>수령</button>
                  ) : (
                    <em>진행 중</em>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="achievement-section">
            <div className="achievement-head">
              <div>
                <h2>업적</h2>
                <span>달성 {achievementProgress.filter((item) => item.completed).length} / {ACHIEVEMENTS.length} · 수령 가능 {claimableAchievementCount}</span>
              </div>
              <button
                disabled={!claimableAchievementCount}
                onClick={() =>
                  achievementProgress
                    .filter((item) => item.claimable)
                    .forEach((item) => claimAchievementReward(item.id))
                }
              >
                모두 수령
              </button>
            </div>

            <div className="achievement-grid">
              {achievementProgress.map((achievement) => (
                <div
                  key={achievement.id}
                  className={`achievement-card ${achievement.completed ? "completed" : ""} ${achievement.claimed ? "claimed" : ""}`}
                >
                  <div>
                    <strong>{achievement.title}</strong>
                    <span>{achievement.desc}</span>
                    <small>보상: {getAchievementRewardText(achievement.reward)}</small>
                  </div>
                  {achievement.claimed ? (
                    <b>수령 완료</b>
                  ) : achievement.claimable ? (
                    <button onClick={() => claimAchievementReward(achievement.id)}>수령</button>
                  ) : (
                    <em>진행 중</em>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="records-section career-record-section">
            <h2>누적 전적</h2>
            <div className="career-grid">
              <div>
                <span>총 전투</span>
                <strong>{careerStats.battles}</strong>
              </div>
              <div>
                <span>승리</span>
                <strong>{careerStats.victories}</strong>
              </div>
              <div>
                <span>누적 피해</span>
                <strong>{careerStats.totalDamageDealt}</strong>
              </div>
              <div>
                <span>누적 회복</span>
                <strong>{careerStats.totalHealingDone}</strong>
              </div>
              <div>
                <span>누적 처치</span>
                <strong>{careerStats.totalKills}</strong>
              </div>
              <div>
                <span>전리품</span>
                <strong>{careerStats.totalLootDrops}</strong>
              </div>
              <div>
                <span>최고 피해</span>
                <strong>{careerStats.bestDamageDealt}</strong>
              </div>
              <div>
                <span>최고 처치</span>
                <strong>{careerStats.bestKills}</strong>
              </div>
            </div>

            <div className="career-mvp-list">
              <h3>MVP 횟수 TOP 5</h3>
              {Object.entries(careerStats.mvpCounts || {}).length ? (
                Object.entries(careerStats.mvpCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([unitId, count]) => {
                    const unit = party.find((member) => member.id === unitId);
                    return (
                      <div key={unitId}>
                        <span>{unit?.name || unitId}</span>
                        <strong>{count}회</strong>
                      </div>
                    );
                  })
              ) : (
                <p>아직 MVP 기록이 없습니다.</p>
              )}
            </div>
          </div>

          <div className="records-section">
            <h2>동료 기록</h2>
            {party.map((unit) => (
              <div className="record-unit-row" key={unit.id}>
                <img src={getUnitPortrait(unit)} alt={unit.name} onError={(event) => { event.currentTarget.style.display = "none"; }} />
                <div>
                  <strong>
                    {unit.name} Lv.{unit.level}
                  </strong>
                  <span>
                    EXP {unit.exp} · 공격 {unit.atk} / 방어 {unit.def}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="records-section">
            <h2>최고 성장 동료</h2>
            {bestPartyUnit ? (
              <div className="record-unit-row highlight-unit">
                <img src={getUnitPortrait(bestPartyUnit)} alt={bestPartyUnit.name} />
                <div>
                  <strong>
                    {bestPartyUnit.name} Lv.{bestPartyUnit.level}
                  </strong>
                  <span>천수 기사단의 핵심 전력</span>
                </div>
              </div>
            ) : (
              <div className="empty-record">아직 기록이 없습니다.</div>
            )}
          </div>

          <div className="records-actions">
            <button onClick={() => setScreen("campaign")}>캠페인 보기</button>
            <button onClick={() => setScreen("promo")}>홍보 페이지</button>
          </div>
        </div>
      )}

      {screen === "saveHealth" && (
        <div className="save-health-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Save Health</div>
              <h1>저장 상태 점검</h1>
              <span className="settings-version-label">총 용량 {formatBytes(saveHealthReport.totalSize)} · 정상 {saveHealthReport.validCount}개</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("settings")}>
              설정
            </button>
          </div>

          <div className="save-health-summary-card">
            <div>
              <span>현재 저장</span>
              <strong>{saveHealthReport.entries.find((entry) => entry.id === "current")?.exists ? "있음" : "없음"}</strong>
            </div>
            <div>
              <span>자동 백업</span>
              <strong>{saveHealthReport.entries.find((entry) => entry.id === "autoBackup")?.exists ? "있음" : "없음"}</strong>
            </div>
            <div>
              <span>수동 슬롯</span>
              <strong>{saveHealthReport.manualSlots.filter((slot) => slot.exists).length}/3</strong>
            </div>
          </div>

          {saveHealthReport.warnings.length > 0 && (
            <div className="save-health-warning-card">
              <strong>주의</strong>
              {saveHealthReport.warnings.map((warning) => (
                <span key={warning}>⚠ {warning}</span>
              ))}
            </div>
          )}

          <div className={`save-recovery-card status-${saveRecoverySuggestion.status}`}>
            <div>
              <strong>자동 복구 제안</strong>
              <span>{saveRecoverySuggestion.label}</span>
              {saveRecoverySuggestion.best && (
                <small>
                  추천 데이터: {saveRecoverySuggestion.best.label} · {saveRecoverySuggestion.best.summary?.stage} · {saveRecoverySuggestion.best.summary?.dateText}
                </small>
              )}
            </div>
            <div className="save-recovery-actions-mini">
              <button disabled={!saveRecoverySuggestion.best} onClick={recoverBestSaveToCurrent}>
                추천 복구
              </button>
              <button onClick={createEmergencyBackup}>
                긴급 백업
              </button>
            </div>
          </div>

          <div className="save-health-list">
            {saveHealthReport.entries.map((entry) => (
              <div className={`save-health-item ${entry.summary?.ok ? "ok" : entry.exists ? "bad" : "empty"}`} key={entry.id}>
                <div>
                  <strong>
                    {entry.id === "current" ? "현재 저장" : entry.id === "autoBackup" ? "자동 백업" : "이전 저장"}
                  </strong>
                  <span>
                    {entry.exists
                      ? `${entry.summary?.stage || "-"} · ${entry.summary?.dateText || "-"}`
                      : "비어 있음"}
                  </span>
                </div>
                <b>{formatBytes(entry.size)}</b>
              </div>
            ))}

            {saveHealthReport.manualSlots.map((slot) => (
              <div className={`save-health-item ${slot.summary?.ok ? "ok" : slot.exists ? "bad" : "empty"}`} key={slot.slot}>
                <div>
                  <strong>수동 슬롯 {slot.slot}</strong>
                  <span>
                    {slot.exists
                      ? `${slot.summary?.stage || "-"} · ${slot.summary?.dateText || "-"}`
                      : "비어 있음"}
                  </span>
                </div>
                <b>{formatBytes(slot.size)}</b>
              </div>
            ))}
          </div>

          <div className="save-bundle-card">
            <h2>저장 데이터 내보내기 / 가져오기</h2>
            <p>
              현재 저장, 자동 백업, 이전 저장, 수동 슬롯 1~3을 하나의 JSON 묶음으로 복사하거나 복구합니다.
            </p>
            <textarea
              value={saveImportText}
              onChange={(event) => setSaveImportText(event.target.value)}
              placeholder="저장 데이터 묶음 JSON을 붙여넣으세요."
            />
            <div className="save-bundle-actions">
              <button onClick={copySaveExportBundle}>저장 묶음 복사</button>
              <button onClick={pasteSaveImportBundle}>클립보드 붙여넣기</button>
              <button onClick={importSaveBundle}>저장 묶음 가져오기</button>
            </div>
          </div>

          <div className="save-health-actions">
            <button onClick={forceSaveBackupNow}>저장/백업 갱신</button>
            <button onClick={copySaveHealthReport}>상태 리포트 복사</button>
            <button onClick={clearBrokenSaveEntries}>손상 항목 정리</button>
            <button onClick={recoverBestSaveToCurrent}>추천 복구</button>
            <button onClick={createEmergencyBackup}>긴급 백업</button>
            <button onClick={() => setSaveHealthRefreshKey((prev) => prev + 1)}>새로고침</button>
          </div>
        </div>
      )}

      {screen === "settings" && (
        <div className="settings-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">천수 환경 설정</div>
              <h1>설정</h1>
              <span className="settings-version-label">현재 버전 v{SAVE_VERSION}</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              뒤로
            </button>
          </div>

          <div className="settings-card">
            <div className="setting-row">
              <div>
                <strong>사운드</strong>
                <span>전투 효과음과 메뉴 효과음을 켜고 끕니다.</span>
              </div>
              <button
                className={settings.soundOn ? "setting-toggle on" : "setting-toggle"}
                onClick={() => updateSetting("soundOn", !settings.soundOn)}
              >
                {settings.soundOn ? "ON" : "OFF"}
              </button>
            </div>

            <div className="setting-row sound-test-row">
              <div>
                <strong>효과음 테스트</strong>
                <span>현재 사운드 설정으로 테스트 효과음을 재생합니다.</span>
              </div>
              <button
                className="setting-test-btn"
                onClick={() => playSfx("confirm")}
              >
                재생
              </button>
            </div>

            <div className="setting-row">
              <div>
                <strong>음악 큐</strong>
                <span>캠프/전투/월드맵 진입 짧은 음악 효과</span>
              </div>
              <button
                className={settings.musicOn ? "setting-toggle on" : "setting-toggle"}
                onClick={() => updateSetting("musicOn", !settings.musicOn)}
              >
                {settings.musicOn ? "ON" : "OFF"}
              </button>
            </div>

            <div className="setting-row vertical-setting sound-volume-row">
              <div>
                <strong>효과음 볼륨</strong>
                <span>현재 {settings.sfxVolume}%</span>
              </div>
              <div className="sound-volume-selector">
                {[40, 60, 80, 100].map((volume) => (
                  <button
                    key={volume}
                    className={settings.sfxVolume === volume ? "selected" : ""}
                    onClick={() => updateSetting("sfxVolume", volume)}
                  >
                    {volume}%
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row vertical-setting sound-board-row">
              <div>
                <strong>사운드 보드</strong>
                <span>전투/스킬/보스/승리 효과음을 미리 들어봅니다.</span>
              </div>
              <div className="sound-board-grid">
                {[
                  ["slash", "검격"],
                  ["fire", "화염"],
                  ["ice", "빙결"],
                  ["shadow", "흑야"],
                  ["heal", "회복"],
                  ["boss", "보스"],
                  ["finish", "FINISH"],
                  ["victory", "승리"],
                ].map(([type, label]) => (
                  <button key={type} onClick={() => playSfx(type)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <div>
                <strong>전투 이펙트</strong>
                <span>베기/마법/피해 숫자 연출</span>
              </div>
              <button
                className={settings.effectsOn ? "setting-toggle on" : "setting-toggle"}
                onClick={() => updateSetting("effectsOn", !settings.effectsOn)}
              >
                {settings.effectsOn ? "ON" : "OFF"}
              </button>
            </div>

            <div className="setting-row">
              <div>
                <strong>화면 흔들림</strong>
                <span>치명타/광역기 흔들림 연출</span>
              </div>
              <button
                className={settings.shakeOn ? "setting-toggle on" : "setting-toggle"}
                onClick={() => updateSetting("shakeOn", !settings.shakeOn)}
              >
                {settings.shakeOn ? "ON" : "OFF"}
              </button>
            </div>

            <div className="setting-row vertical-setting">
              <div>
                <strong>전투 로그 표시 줄 수</strong>
                <span>현재 {settings.logLines}줄 표시</span>
              </div>
              <div className="log-line-selector">
                {[4, 6, 8].map((count) => (
                  <button
                    key={count}
                    className={settings.logLines === count ? "selected" : ""}
                    onClick={() => updateSetting("logLines", count)}
                  >
                    {count}줄
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row vertical-setting difficulty-setting-row">
              <div>
                <strong>난이도</strong>
                <span>
                  현재 {getDifficultyConfig(settings.difficulty).label} · {getDifficultyConfig(settings.difficulty).desc}
                </span>
              </div>
              <div className="difficulty-selector">
                {DIFFICULTY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={settings.difficulty === option.id ? "selected" : ""}
                    onClick={() => updateSetting("difficulty", option.id)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.desc}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row vertical-setting balance-setting-row">
              <div>
                <strong>밸런스 프리셋</strong>
                <span>
                  현재 {balancePresetConfig.label} · {balancePresetConfig.desc}
                </span>
              </div>
              <div className="balance-selector">
                {BALANCE_PRESET_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={settings.balancePreset === option.id ? "selected" : ""}
                    onClick={() => updateSetting("balancePreset", option.id)}
                  >
                    <strong>{option.label}</strong>
                    <small>
                      HP x{option.hp} · ATK x{option.atk} · DEF x{option.def}
                    </small>
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row vertical-setting speed-setting-row">
              <div>
                <strong>전투 속도</strong>
                <span>
                  현재 {battleSpeedConfig.label} · {battleSpeedConfig.desc}
                </span>
              </div>
              <div className="speed-selector">
                {BATTLE_SPEED_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={settings.battleSpeed === option.id ? "selected" : ""}
                    onClick={() => updateSetting("battleSpeed", option.id)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.desc}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row vertical-setting cutscene-setting-row">
              <div>
                <strong>전투 컷씬</strong>
                <span>
                  현재 {cutsceneConfig.label} · {cutsceneConfig.desc}
                </span>
              </div>
              <div className="cutscene-selector">
                {CUTSCENE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={settings.cutsceneMode === option.id ? "selected" : ""}
                    onClick={() => updateSetting("cutsceneMode", option.id)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.desc}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row vertical-setting auto-battle-setting-row">
              <div>
                <strong>자동 전투</strong>
                <span>
                  현재 {autoBattleModeConfig.label} · {autoBattleModeConfig.desc}
                </span>
              </div>
              <div className="auto-battle-selector">
                {AUTO_BATTLE_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={settings.autoBattleMode === option.id ? "selected" : ""}
                    onClick={() => updateSetting("autoBattleMode", option.id)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.desc}</small>
                  </button>
                ))}
              </div>
              <div className="auto-battle-toggle-row">
                <button
                  className={settings.autoUseSkills ? "selected" : ""}
                  onClick={() => updateSetting("autoUseSkills", !settings.autoUseSkills)}
                >
                  스킬 사용 {settings.autoUseSkills ? "ON" : "OFF"}
                </button>
                <button
                  className={settings.autoUseItems ? "selected" : ""}
                  onClick={() => updateSetting("autoUseItems", !settings.autoUseItems)}
                >
                  아이템 제안 {settings.autoUseItems ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-card photo-settings-card">
            <div className="setting-row vertical-setting">
              <div>
                <strong>포토 모드 테마</strong>
                <span>
                  현재 {photoThemeConfig.label} · {photoThemeConfig.desc}
                </span>
              </div>
              <div className="photo-theme-selector">
                {PHOTO_THEME_OPTIONS.map((theme) => (
                  <button
                    key={theme.id}
                    className={settings.photoTheme === theme.id ? "selected" : ""}
                    onClick={() => updateSetting("photoTheme", theme.id)}
                  >
                    <strong>{theme.label}</strong>
                    <small>{theme.desc}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <div>
                <strong>포토 모드 워터마크</strong>
                <span>스냅샷 하단의 빌드/모드 표시를 켜고 끕니다.</span>
              </div>
              <button
                className={settings.photoWatermark ? "setting-toggle on" : "setting-toggle"}
                onClick={() => updateSetting("photoWatermark", !settings.photoWatermark)}
              >
                {settings.photoWatermark ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div className="settings-danger pwa-settings-card">
            <h2>앱 설치 / PWA</h2>
            <div className="setting-mini-info">
              <span>실행 상태</span>
              <strong>{pwaStatus.standalone ? "앱 모드" : "브라우저"}</strong>
            </div>
            <div className="setting-mini-info">
              <span>서비스워커</span>
              <strong>{pwaStatus.serviceWorker ? "지원" : "미지원"}</strong>
            </div>
            <button onClick={() => setScreen("pwa")}>설치 / 점검 화면</button>
          </div>

          <div className="settings-danger app-update-card">
            <h2>앱 업데이트</h2>
            <div className="setting-mini-info">
              <span>현재 버전</span>
              <strong>v{SAVE_VERSION}</strong>
            </div>
            <label className="update-url-field">
              <span>업데이트 정보 URL</span>
              <input
                value={updateManifestUrl}
                onChange={(event) => setUpdateManifestUrl(event.target.value)}
                onBlur={() => saveUpdateManifestUrl()}
                placeholder={DEFAULT_UPDATE_MANIFEST_URL}
              />
            </label>
            <div className={`update-status update-${updateCheck.status}`}>
              <strong>
                {updateCheck.status === "available"
                  ? "업데이트 가능"
                  : updateCheck.status === "current"
                  ? "최신 상태"
                  : updateCheck.status === "checking"
                  ? "확인 중"
                  : updateCheck.status === "error"
                  ? "확인 실패"
                  : "대기"}
              </strong>
              <span>{updateCheck.message}</span>
              {updateCheck.checkedAt && <small>{updateCheck.checkedAt}</small>}
              {updateCheck.latest?.notes?.length > 0 && (
                <ul>
                  {updateCheck.latest.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="update-actions">
              <button disabled={updateCheck.status === "checking"} onClick={checkForAppUpdate}>
                업데이트 확인
              </button>
              <button disabled={!updateCheck.latest?.apkUrl} onClick={openUpdateDownload}>
                다운로드
              </button>
              <button onClick={copyUpdateDownloadLink}>
                링크 복사
              </button>
              <button onClick={resetUpdateManifestUrl}>
                기본값
              </button>
            </div>
          </div>

          <div className="settings-danger save-manager-card">
            <h2>저장 데이터 관리</h2>
            <div className="save-manager-grid">
              {[1, 2, 3].map((slot) => {
                const summary = getManualSlotSummary(slot);

                return (
                  <div className="save-slot-card" key={slot}>
                    <strong>수동 슬롯 {slot}</strong>
                    <span>
                      {summary
                        ? `${summary.stage} · ${summary.dateText}`
                        : "비어 있음"}
                    </span>
                    <div>
                      <button onClick={() => saveManualSlot(slot)}>저장</button>
                      <button onClick={() => loadManualSlot(slot)}>불러오기</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="save-recovery-grid">
              <button onClick={saveGame}>현재 상태 저장</button>
              <button onClick={() => restoreAutoBackup(SAVE_BACKUP_KEY)}>자동 백업 복구</button>
              <button onClick={() => restoreAutoBackup(SAVE_PREVIOUS_KEY)}>이전 저장 복구</button>
              <button onClick={exportSaveToClipboard}>저장 데이터 복사</button>
            </div>

            <button className="danger-btn" onClick={clearManualSlots}>
              수동 슬롯 비우기
            </button>
            <button className="danger-btn" onClick={resetSaveData}>
              현재 저장 데이터 초기화
            </button>
          </div>

          <div className="records-actions">
            <button onClick={() => setScreen("promo")}>홍보 페이지</button>
            <button onClick={() => setScreen("release")}>출시 노트</button>
            <button onClick={() => setScreen("codex")}>도감</button>
            <button onClick={() => setScreen("planner")}>마스터리 플래너</button>
            <button onClick={() => setScreen("strategyArchive")}>전략 보관함</button>
            <button onClick={() => setScreen("profile")}>프로필</button>
            <button onClick={() => setScreen("qa")}>QA 점검</button>
            <button onClick={() => setScreen("finalRc")}>v1.68.9.8.7.6.5.4.3.2 최종 점검</button>
            <button onClick={() => setScreen("analytics")}>플레이테스트</button>
            <button onClick={() => setScreen("campaign")}>캠페인</button>
          </div>
        </div>
      )}

      {screen === "analytics" && (
        <div className="analytics-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Playtest Metrics</div>
              <h1>플레이테스트 리포트</h1>
              <span className="settings-version-label">현재 빌드 v{SAVE_VERSION}</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              메뉴
            </button>
          </div>

          <div className="analytics-hero-card">
            <div className="analytics-score-circle">{playtestInsight.winRate}%</div>
            <div>
              <strong>승률 / 진행률 분석</strong>
              <span>
                전투 {playtestInsight.battles}회 · 승리 {playtestInsight.victories}회 · 캠페인 진행 {playtestInsight.progressRate}%
              </span>
            </div>
          </div>

          <div className="analytics-grid">
            <div><span>평균 가한 피해</span><strong>{playtestInsight.avgDamage}</strong></div>
            <div><span>평균 받은 피해</span><strong>{playtestInsight.avgTaken}</strong></div>
            <div><span>평균 처치</span><strong>{playtestInsight.avgKills}</strong></div>
            <div><span>미해결 버그</span><strong>{playtestInsight.openBugs}</strong></div>
            <div><span>밸런스 메모</span><strong>{playtestInsight.balanceNotes}</strong></div>
            <div><span>현재 밸런스</span><strong>{getBalancePresetConfig(playtestInsight.currentBalance).label}</strong></div>
          </div>

          <div className="analytics-recommend-card">
            <h2>추천 조정</h2>
            <p>{playtestInsight.recommendation}</p>
            <div>
              <span>추천 프리셋</span>
              <strong>{getBalancePresetConfig(playtestInsight.recommendedPreset).label}</strong>
            </div>
            <button onClick={applyRecommendedBalancePreset}>
              추천 프리셋 적용
            </button>
          </div>

          <div className="analytics-feedback-card">
            <h2>피드백 분포</h2>
            <div className="analytics-feedback-grid">
              {["bug", "balance", "ui", "idea"].map((type) => (
                <div key={type}>
                  <span>{getFeedbackTypeLabel(type)}</span>
                  <strong>{feedbackTypeCounts[type]}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="analytics-actions">
            <button onClick={copyPlaytestReport}>리포트 복사</button>
            <button onClick={() => setScreen("qa")}>QA 점검</button>
            <button onClick={() => setScreen("settings")}>밸런스 설정</button>
            <button onClick={() => setScreen("records")}>기록 보기</button>
          </div>
        </div>
      )}

      {screen === "qaReleaseNotes" && (
        <div className="qa-release-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">QA Release Notes</div>
              <h1>QA 반영 노트</h1>
              <span className="settings-version-label">플레이어에게 보여줄 업데이트 요약</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("qaChangelog")}>
              변경 기록
            </button>
          </div>

          <div className="qa-release-hero">
            <div><span>해결</span><strong>{qaFixHistoryStats.fixed}</strong></div>
            <div><span>보류</span><strong>{qaFixHistoryStats.later}</strong></div>
            <div><span>열린 항목</span><strong>{feedbackReports.filter((item) => item.status === "open").length}</strong></div>
            <div><span>보관함</span><strong>{qaReleaseArchiveStats.total}</strong></div>
          </div>

          <div className="qa-release-preview">
            <pre>{currentQaReleaseNoteText}</pre>
          </div>

          <div className="qa-release-actions">
            <button onClick={copyPublicPatchNotesFromQa}>반영 노트 복사</button>
            <button onClick={saveCurrentQaReleaseNote}>현재 노트 저장</button>
            <button onClick={() => setScreen("qaReleaseArchive")}>보관함</button>
            <button onClick={() => setScreen("qaBoard")}>우선순위 보드</button>
            <button onClick={() => setScreen("postLaunch")}>점검 센터</button>
          </div>
        </div>
      )}

      {screen === "qaReleaseArchive" && (
        <div className="qa-release-screen qa-release-archive-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Release Note Archive</div>
              <h1>반영 노트 보관함</h1>
              <span className="settings-version-label">저장 {qaReleaseArchiveStats.total}개 · 즐겨찾기 {qaReleaseArchiveStats.favorite}개</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("qaReleaseNotes")}>
              반영 노트
            </button>
          </div>

          <div className="qa-release-hero">
            <div><span>전체</span><strong>{qaReleaseArchiveStats.total}</strong></div>
            <div><span>즐겨찾기</span><strong>{qaReleaseArchiveStats.favorite}</strong></div>
            <div><span>최근 저장</span><strong>{qaReleaseArchiveStats.latest ? qaReleaseArchiveStats.latest.version : "-"}</strong></div>
          </div>

          <div className="qa-release-actions">
            <button onClick={saveCurrentQaReleaseNote}>현재 노트 저장</button>
            <button onClick={clearQaReleaseArchive} disabled={!qaReleaseArchive.length}>전체 비우기</button>
            <button onClick={() => setScreen("qaChangelog")}>변경 기록</button>
            <button onClick={() => setScreen("qaBoard")}>우선순위 보드</button>
          </div>

          <div className="qa-release-archive-list">
            {[...qaReleaseArchive]
              .sort((a, b) => Number(b.favorite) - Number(a.favorite) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
              .map((item) => (
                <div className={`qa-release-archive-card ${item.favorite ? "favorite" : ""}`} key={item.id}>
                  <div className="qa-release-archive-head">
                    <div>
                      <strong>{item.title}</strong>
                      <span>{new Date(item.createdAt).toLocaleString()} · v{item.version}</span>
                    </div>
                    <button onClick={() => toggleQaReleaseArchiveFavorite(item.id)}>
                      {item.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                    </button>
                  </div>
                  <div className="qa-release-archive-stats">
                    <div><span>해결</span><b>{item.fixedCount}</b></div>
                    <div><span>보류</span><b>{item.laterCount}</b></div>
                    <div><span>열린 항목</span><b>{item.openCount}</b></div>
                  </div>
                  <pre>{item.text}</pre>
                  <div className="qa-release-archive-actions">
                    <button onClick={() => copyQaReleaseArchiveItem(item)}>복사</button>
                    <button onClick={() => deleteQaReleaseArchiveItem(item.id)}>삭제</button>
                  </div>
                </div>
              ))}
          </div>

          {!qaReleaseArchive.length && (
            <div className="qa-release-archive-empty">
              저장된 QA 반영 노트가 없습니다. 현재 노트를 저장해 보관함을 시작하세요.
            </div>
          )}
        </div>
      )}

      {screen === "qaChangelog" && (
        <div className="qa-changelog-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">QA Changelog</div>
              <h1>QA 변경 기록</h1>
              <span className="settings-version-label">날짜별 해결/보류 내역</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("qaHistory")}>
              이력
            </button>
          </div>

          <div className="qa-changelog-hero">
            <div><span>처리</span><strong>{qaFixHistoryStats.total}</strong></div>
            <div><span>해결</span><strong>{qaFixHistoryStats.fixed}</strong></div>
            <div><span>보류</span><strong>{qaFixHistoryStats.later}</strong></div>
          </div>

          <div className="qa-changelog-actions">
            <button onClick={copyQaChangelog}>변경 기록 복사</button>
            <button onClick={() => setScreen("qaReleaseNotes")}>반영 노트</button>
            <button onClick={() => setScreen("qaReleaseArchive")}>보관함</button>
            <button onClick={() => setScreen("qaBoard")}>우선순위 보드</button>
            <button onClick={() => setScreen("postLaunch")}>점검 센터</button>
          </div>

          <div className="qa-changelog-list">
            {qaChangelogEntries.map((group) => (
              <div className="qa-changelog-group" key={group.date}>
                <div className="qa-changelog-date">
                  <strong>{group.date}</strong>
                  <span>해결 {group.fixed} · 보류 {group.later}</span>
                </div>
                {group.items.map((item) => (
                  <div className={`qa-changelog-item status-${item.status}`} key={item.id}>
                    <b>{item.status === "fixed" ? "해결" : "보류"}</b>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{getFeedbackTypeLabel(item.type)} · {item.priorityLabel} {item.priority}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {!qaChangelogEntries.length && (
            <div className="qa-changelog-empty">아직 변경 기록이 없습니다.</div>
          )}
        </div>
      )}

      {screen === "qaHistory" && (
        <div className="qa-history-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">QA Fix History</div>
              <h1>QA 처리 이력</h1>
              <span className="settings-version-label">처리 {qaFixHistoryStats.total}개 · 해결 {qaFixHistoryStats.fixed}개</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("qaBoard")}>
              우선순위
            </button>
          </div>

          <div className="qa-history-summary">
            <div><span>전체</span><strong>{qaFixHistoryStats.total}</strong></div>
            <div><span>해결</span><strong>{qaFixHistoryStats.fixed}</strong></div>
            <div><span>보류</span><strong>{qaFixHistoryStats.later}</strong></div>
          </div>

          <div className="qa-history-actions">
            <button onClick={copyQaFixHistory}>이력 복사</button>
            <button onClick={copyQaChangelog}>변경 기록 복사</button>
            <button onClick={() => setScreen("qaChangelog")}>변경 기록</button>
            <button onClick={() => setScreen("qaReleaseNotes")}>반영 노트</button>
            <button onClick={() => setScreen("qaReleaseArchive")}>보관함</button>
            <button onClick={clearQaFixHistory}>이력 비우기</button>
            <button onClick={() => setScreen("qaBoard")}>우선순위 보드</button>
          </div>

          <div className="qa-history-list">
            {qaFixHistory.map((item) => (
              <div className={`qa-history-card status-${item.status}`} key={item.id}>
                <b>{item.status === "fixed" ? "해결" : item.status === "later" ? "보류" : item.status}</b>
                <div>
                  <strong>{item.title}</strong>
                  <span>{getFeedbackTypeLabel(item.type)} · {item.priorityLabel} {item.priority} · {new Date(item.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          {!qaFixHistory.length && (
            <div className="qa-history-empty">아직 처리 이력이 없습니다.</div>
          )}
        </div>
      )}

      {screen === "qaBoard" && (
        <div className="qa-board-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">QA Priority Board</div>
              <h1>QA 우선순위 보드</h1>
              <span className="settings-version-label">긴급 {qaPriorityBoard.urgent.length}개 · 높음 {qaPriorityBoard.high.length}개</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("qa")}>
              QA
            </button>
          </div>

          <div className="qa-board-summary">
            <div><span>긴급</span><strong>{qaPriorityBoard.urgent.length}</strong></div>
            <div><span>높음</span><strong>{qaPriorityBoard.high.length}</strong></div>
            <div><span>전체</span><strong>{qaPriorityBoard.all.length}</strong></div>
          </div>

          <div className="qa-board-actions">
            <button onClick={copyQaPriorityBoard}>보드 복사</button>
            <button onClick={markTopQaFixed}>최우선 완료</button>
            <button onClick={() => setScreen("qaHistory")}>처리 이력</button>
            <button onClick={() => setScreen("crashLogs")}>오류 기록</button>
            <button onClick={() => setScreen("postLaunch")}>점검 센터</button>
          </div>

          <div className="qa-priority-section urgent">
            <h2>긴급 처리</h2>
            {qaPriorityBoard.urgent.length ? qaPriorityBoard.urgent.map((item) => (
              <div className="qa-priority-card" key={item.id}>
                <b>{item.priorityLabel} · {item.priorityScore}</b>
                <strong>{item.title}</strong>
                <span>{getFeedbackTypeLabel(item.type)} · {getFeedbackStatusLabel(item.status)}</span>
                <p>{item.desc}</p>
                <div className="qa-fix-actions">
                  <button onClick={() => copyQaFixPlan(item)}>수정 계획 복사</button>
                  <button onClick={() => updateFeedbackStatusQuick(item.id, "fixed")}>해결</button>
                  <button onClick={() => updateFeedbackStatusQuick(item.id, "later")}>보류</button>
                </div>
              </div>
            )) : <div className="qa-board-empty">긴급 항목이 없습니다.</div>}
          </div>

          <div className="qa-priority-section high">
            <h2>높은 우선순위</h2>
            {qaPriorityBoard.high.length ? qaPriorityBoard.high.map((item) => (
              <div className="qa-priority-card" key={item.id}>
                <b>{item.priorityLabel} · {item.priorityScore}</b>
                <strong>{item.title}</strong>
                <span>{getFeedbackTypeLabel(item.type)} · {getFeedbackStatusLabel(item.status)}</span>
                <p>{item.desc}</p>
                <div className="qa-fix-actions">
                  <button onClick={() => copyQaFixPlan(item)}>수정 계획 복사</button>
                  <button onClick={() => updateFeedbackStatusQuick(item.id, "fixed")}>해결</button>
                  <button onClick={() => updateFeedbackStatusQuick(item.id, "later")}>보류</button>
                </div>
              </div>
            )) : <div className="qa-board-empty">높은 우선순위 항목이 없습니다.</div>}
          </div>

          <div className="qa-priority-section normal">
            <h2>일반 항목</h2>
            {qaPriorityBoard.normal.slice(0, 8).map((item) => (
              <div className="qa-priority-card compact" key={item.id}>
                <b>{item.priorityLabel} · {item.priorityScore}</b>
                <strong>{item.title}</strong>
                <span>{getFeedbackTypeLabel(item.type)} · {getFeedbackStatusLabel(item.status)}</span>
              </div>
            ))}
            {!qaPriorityBoard.normal.length && <div className="qa-board-empty">일반 항목이 없습니다.</div>}
          </div>
        </div>
      )}

      {screen === "qa" && (
        <div className="qa-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Release QA</div>
              <h1>QA 점검 센터</h1>
              <span className="settings-version-label">현재 빌드 v{SAVE_VERSION}</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              메뉴
            </button>
          </div>

          <div className="qa-summary-card">
            <div>
              <span>체크 완료</span>
              <strong>{Object.values(qaChecked).filter(Boolean).length} / {getQaChecklist().length}</strong>
            </div>
            <div>
              <span>현재 화면</span>
              <strong>{screen}</strong>
            </div>
            <div>
              <span>저장 버전</span>
              <strong>v{SAVE_VERSION}</strong>
            </div>
          </div>

          <div className="qa-checklist-card">
            <h2>출시 전 기능 점검</h2>
            <div className="qa-checklist-grid">
              {getQaChecklist().map((item) => (
                <button
                  key={item.id}
                  className={qaChecked[item.id] ? "checked" : ""}
                  onClick={() =>
                    setQaChecked((prev) => ({
                      ...prev,
                      [item.id]: !prev[item.id],
                    }))
                  }
                >
                  <span>{qaChecked[item.id] ? "✓" : ""}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.area}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="qa-diagnostics-card">
            <h2>버그 리포트 / 진단</h2>

            <div className="feedback-type-row">
              {["bug", "balance", "ui", "idea"].map((type) => (
                <button
                  key={type}
                  className={bugType === type ? "selected" : ""}
                  onClick={() => setBugType(type)}
                >
                  {getFeedbackTypeLabel(type)}
                </button>
              ))}
            </div>

            <textarea
              value={bugNote}
              onChange={(event) => setBugNote(event.target.value)}
              placeholder="버그, 밸런스, UI 개선, 아이디어를 적어주세요. 등록하면 목록에 저장됩니다."
            />
            <div className="qa-actions-grid">
              <button onClick={addFeedbackReport}>피드백 등록</button>
              <button onClick={copyDiagnosticsReport}>진단 리포트 복사</button>
              <button onClick={exportSaveToClipboard}>저장 데이터 복사</button>
              <button onClick={resetAppCacheGuide}>캐시 갱신 요청</button>
              <button onClick={() => setQaChecked({})}>체크 초기화</button>
              <button onClick={copyFeedbackReports}>피드백 복사</button>
            </div>

            <div className="feedback-list-card">
              <div className="feedback-list-head">
                <strong>피드백 목록</strong>
                <span>{feedbackReports.length}개</span>
              </div>

              {feedbackReports.length ? (
                <div className="feedback-list">
                  {feedbackReports.slice(0, 8).map((report) => (
                    <div className={`feedback-item status-${report.status}`} key={report.id}>
                      <div>
                        <strong>{getFeedbackTypeLabel(report.type)}</strong>
                        <span>{new Date(report.createdAt).toLocaleString()} · {report.screen}</span>
                      </div>
                      <p>{report.note}</p>
                      <div className="feedback-status-row">
                        {["open", "fixed", "later"].map((status) => (
                          <button
                            key={status}
                            className={report.status === status ? "selected" : ""}
                            onClick={() => updateFeedbackStatus(report.id, status)}
                          >
                            {getFeedbackStatusLabel(status)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="feedback-empty">아직 등록된 피드백이 없습니다.</div>
              )}

              {feedbackReports.length > 0 && (
                <button className="feedback-clear-btn" onClick={clearFeedbackReports}>
                  피드백 전체 삭제
                </button>
              )}
            </div>
          </div>

          <div className="qa-shortcut-grid">
            <button onClick={() => setScreen("campaign")}>월드맵 테스트</button>
            <button onClick={() => setScreen("settings")}>저장/설정 테스트</button>
            <button onClick={() => setScreen("pwa")}>PWA 테스트</button>
            <button onClick={() => setScreen("release")}>출시 노트</button>
          </div>
        </div>
      )}

      {screen === "crashLogs" && (
        <div className="crash-log-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Crash Logs</div>
              <h1>오류 기록 센터</h1>
              <span className="settings-version-label">최근 오류 최대 50개 저장</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("postLaunch")}>
              점검
            </button>
          </div>

          <div className="crash-log-summary">
            <div><span>전체</span><strong>{crashLogStats.total}</strong></div>
            <div><span>런타임</span><strong>{crashLogStats.runtime}</strong></div>
            <div><span>Promise</span><strong>{crashLogStats.promise}</strong></div>
          </div>

          <div className="crash-log-actions">
            <button onClick={copyCrashLogs}>전체 복사</button>
            <button onClick={convertAllCrashLogsToFeedback}>전체 QA 등록</button>
            <button onClick={clearCrashLogs}>기록 비우기</button>
            <button onClick={() => setScreen("qa")}>QA 센터</button>
          </div>

          <div className="crash-log-list">
            {crashLogs.map((log) => (
              <div className="crash-log-card" key={log.id}>
                <div>
                  <strong>{log.message}</strong>
                  <span>{new Date(log.createdAt).toLocaleString()} · {log.screen} · {log.source}</span>
                </div>
                {log.stack && <pre>{log.stack.slice(0, 700)}</pre>}
                <div className="crash-log-card-actions">
                  <button onClick={() => convertCrashLogToFeedback(log)}>QA 등록</button>
                </div>
              </div>
            ))}
          </div>

          {!crashLogs.length && (
            <div className="crash-log-empty">
              저장된 오류 기록이 없습니다.
            </div>
          )}
        </div>
      )}

      {screen === "postLaunch" && (
        <div className="post-launch-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Post Launch QA</div>
              <h1>출시 후 점검 센터</h1>
              <span className="settings-version-label">v1.68 · 안정화 감시 모드</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              메뉴
            </button>
          </div>

          <div className={`post-launch-hero status-${postLaunchAudit.status}`}>
            <div className="post-launch-status">
              {getPostLaunchStatusLabel(postLaunchAudit.status)}
            </div>
            <div>
              <strong>현재 상태: {getPostLaunchStatusLabel(postLaunchAudit.status)}</strong>
              <span>
                전투 {postLaunchAudit.battles}회 · 미해결 피드백 {postLaunchAudit.openFeedback}개 · 저장 경고 {postLaunchAudit.saveWarnings}개
              </span>
            </div>
          </div>

          <div className="post-launch-grid">
            <div><span>출시 준비도</span><strong>{releaseReadinessScore}%</strong></div>
            <div><span>출시 등급</span><strong>{launchGrade.grade}</strong></div>
            <div><span>미해결 버그</span><strong>{postLaunchAudit.openBugs}</strong></div>
            <div><span>저장 정상</span><strong>{saveHealthReport.validCount}개</strong></div>
            <div><span>오류 기록</span><strong>{crashLogStats.total}</strong></div>
            <div><span>QA 처리</span><strong>{qaFixHistoryStats.total}</strong></div>
          </div>

          <div className="post-launch-warning-card">
            <strong>점검 항목</strong>
            {postLaunchAudit.warnings.length ? (
              postLaunchAudit.warnings.map((warning) => <span key={warning}>⚠ {warning}</span>)
            ) : (
              <span>현재 큰 경고 항목이 없습니다.</span>
            )}
          </div>

          <div className="post-launch-actions">
            <button onClick={() => setScreen("qa")}>QA 센터</button>
            <button onClick={() => setScreen("qaBoard")}>QA 우선순위</button>
            <button onClick={() => setScreen("analytics")}>플레이테스트</button>
            <button onClick={() => setScreen("saveHealth")}>저장 점검</button>
            <button onClick={() => setScreen("launch")}>출시 센터</button>
            <button onClick={() => setScreen("crashLogs")}>오류 기록</button>
            <button onClick={copyPostLaunchAudit}>점검 리포트 복사</button>
            <button onClick={() => setScreen("campaign")}>바로 플레이</button>
          </div>
        </div>
      )}

      {screen === "launch" && (
        <div className="launch-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Final Release Candidate</div>
              <h1>천수 v1.68 출시 센터</h1>
              <span className="settings-version-label">최종 출시 후보 · 안정화 구간 완료</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              메뉴
            </button>
          </div>

          <div className={`launch-hero-card grade-${launchGrade.grade}`}>
            <div className="launch-grade">{launchGrade.grade}</div>
            <div>
              <strong>{launchGrade.label}</strong>
              <span>
                준비도 {releaseReadinessScore}% · 최종 체크 {launchCheckedCount}/{launchChecklist.length}
              </span>
              <div className="launch-progress">
                <i style={{ width: `${Math.min(100, Math.round(releaseReadinessScore * 0.65 + (launchChecklist.length ? (launchCheckedCount / launchChecklist.length) * 100 : 0) * 0.35))}%` }} />
              </div>
            </div>
          </div>

          <div className="launch-summary-grid">
            <div><span>캠페인</span><strong>{clearedStages.length}/{stages.length}</strong></div>
            <div><span>전투</span><strong>{careerStats.battles || 0}</strong></div>
            <div><span>업적</span><strong>{claimedAchievements.length}</strong></div>
            <div><span>전략 리포트</span><strong>{strategyReportArchive.length}</strong></div>
            <div><span>스냅샷</span><strong>{snapshotGallery.length}</strong></div>
            <div><span>피드백</span><strong>{feedbackReports.length}</strong></div>
          </div>

          <div className="launch-check-card">
            <div className="launch-check-head">
              <div>
                <h2>정식 출시 전 최종 체크</h2>
                <span>{launchCheckedCount} / {launchChecklist.length} 완료</span>
              </div>
              <button onClick={() => setLaunchChecked({})}>초기화</button>
            </div>

            <div className="launch-check-list">
              {launchChecklist.map((item) => (
                <button
                  key={item.id}
                  className={launchChecked[item.id] ? "checked" : ""}
                  onClick={() =>
                    setLaunchChecked((prev) => ({
                      ...prev,
                      [item.id]: !prev[item.id],
                    }))
                  }
                >
                  <span>{launchChecked[item.id] ? "✓" : ""}</span>
                  <strong>{item.label}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="launch-actions">
            <button onClick={() => setScreen("campaign")}>플레이 테스트</button>
            <button onClick={() => setScreen("saveHealth")}>저장 점검</button>
            <button onClick={() => setScreen("qa")}>QA 센터</button>
            <button onClick={() => setScreen("analytics")}>플레이테스트 리포트</button>
            <button onClick={() => setScreen("strategyArchive")}>전략 보관함</button>
            <button onClick={() => setScreen("pwa")}>PWA 점검</button>
          </div>
        </div>
      )}

      {screen === "finalRc" && (
        <div className="final-rc-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Release Candidate 2</div>
              <h1>천수 v1.68.9.8.7.6.5.4.3.2 최종 출격 센터</h1>
              <span className="settings-version-label">v1.36부터 v1.68.9.8.7.6.5.4.3.2까지 통합 완료</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              메뉴
            </button>
          </div>

          <div className="final-rc-hero">
            <div className="final-rc-score">{releaseReadinessScore}%</div>
            <div>
              <strong>출시 준비도</strong>
              <span>
                캠페인 {clearedStages.length}/{stages.length} · 전투 {careerStats.battles || 0}회 · 전략 리포트 {strategyReportArchive.length}개
              </span>
              <div className="final-rc-progress"><i style={{ width: `${releaseReadinessScore}%` }} /></div>
            </div>
          </div>

          <div className="final-milestone-grid">
            {FINAL_MILESTONE_NOTES.map((note) => (
              <div className="final-milestone-card" key={note.version}>
                <span>{note.version}</span>
                <strong>{note.title}</strong>
                {note.items.map((item) => (
                  <small key={item}>✓ {item}</small>
                ))}
              </div>
            ))}
          </div>

          <div className="final-check-card">
            <div className="final-check-head">
              <div>
                <h2>최종 QA 체크리스트</h2>
                <span>{finalRcCheckedCount} / {finalRcChecklist.length} 완료</span>
              </div>
              <button onClick={() => setFinalRcChecked({})}>초기화</button>
            </div>

            <div className="final-check-grid">
              {finalRcChecklist.map((item) => (
                <button
                  key={item.id}
                  className={finalRcChecked[item.id] ? "checked" : ""}
                  onClick={() =>
                    setFinalRcChecked((prev) => ({
                      ...prev,
                      [item.id]: !prev[item.id],
                    }))
                  }
                >
                  <span>{finalRcChecked[item.id] ? "✓" : ""}</span>
                  <strong>{item.label}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="final-action-grid">
            <button onClick={() => setScreen("campaign")}>월드맵 테스트</button>
            <button onClick={() => setScreen("planner")}>마스터리 플래너</button>
            <button onClick={() => setScreen("strategyArchive")}>전략 보관함</button>
            <button onClick={() => setScreen("qa")}>QA 센터</button>
            <button onClick={() => setScreen("analytics")}>플레이테스트</button>
            <button onClick={() => setScreen("qaBoard")}>QA 우선순위</button>
            <button onClick={() => setScreen("pwa")}>PWA 점검</button>
          </div>
        </div>
      )}

      {screen === "release" && (
        <div className="release-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">Release Candidate</div>
              <h1>천수 v{SAVE_VERSION}</h1>
              <span className="settings-version-label">출시 후보 빌드</span>
            </div>
            <button className="back-btn" onClick={() => setScreen("menu")}>
              메뉴
            </button>
          </div>

          <div className="release-hero-card">
            <img src="/ui/cheonsu_logo.png" alt="천수" />
            <div>
              <strong>붉은 하늘 아래, 마지막 수호가 시작된다</strong>
              <span>
                30스테이지 캠페인, 15인 대규모 전투, 사이드뷰 컷씬, 보스 패턴,
                캠프 성장, 자동 전투까지 포함한 출시 후보 버전입니다.
              </span>
            </div>
          </div>

          <div className="release-grid">
            {RELEASE_NOTES.map((section) => (
              <div className="release-note-card" key={section.title}>
                <h2>{section.title}</h2>
                {section.items.map((item) => (
                  <div className="release-note-line" key={item}>
                    <span>✓</span>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="release-checklist-card">
            <h2>출시 전 점검 체크리스트</h2>
            <div className="release-checklist-grid">
              {getReleaseChecklist().map((item, index) => (
                <div key={item}>
                  <span>{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="release-actions">
            <button onClick={() => setScreen("campaign")}>캠페인 테스트</button>
            <button onClick={() => setScreen("settings")}>설정/저장 점검</button>
            <button onClick={() => setScreen("pwa")}>PWA 점검</button>
            <button onClick={() => setScreen("qa")}>QA 점검</button>
            <button onClick={() => setScreen("analytics")}>플레이테스트</button>
            <button onClick={() => setScreen("promo")}>홍보 화면</button>
          </div>
        </div>
      )}

      {runtimeError && (
        <div className="runtime-error-overlay">
          <div className="runtime-error-card">
            <div className="runtime-error-title">오류 보호 모드</div>
            <p>
              게임이 멈추는 오류를 감지했습니다. 메뉴로 복구하거나 오류 리포트를 복사할 수 있습니다.
            </p>
            <div className="runtime-error-message">
              <strong>{runtimeError.message}</strong>
              <span>{runtimeError.time}</span>
            </div>
            <div className="runtime-error-actions">
              <button onClick={recoverToMenu}>메뉴로 복구</button>
              <button onClick={copyRuntimeError}>오류 리포트 복사</button>
              <button onClick={() => setRuntimeError(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {screen === "promo" && (
        <div className="promo-screen">
          <div className="promo-poster-wrap">
            <img
              className="promo-poster"
              src="/promo/cheonsu_promo_main.png"
              alt="천수 홍보 이미지"
            />
            <div className="promo-vignette" />
          </div>

          <div className="promo-content">
            <div className="promo-kicker">모바일 전술 SRPG</div>
            <img className="promo-logo" src="/ui/cheonsu_logo.png" alt="천수" />
            <div className="promo-title">붉은 하늘 아래, 마지막 수호가 시작된다</div>

            <div className="promo-tags">
              <span>전술 전투</span>
              <span>캠프 성장</span>
              <span>장편 캠페인</span>
              <span>보스 페이즈</span>
            </div>

            <div className="promo-actions">
              <button className="promo-main-btn" onClick={() => setScreen("menu")}>
                게임 시작
              </button>
              <button className="promo-sub-btn" onClick={continueGame}>
                이어하기
              </button>
            </div>

            <button className="promo-link-btn" onClick={() => setScreen("campaign")}>
              캠페인 바로가기
            </button>
            <button className="promo-link-btn pwa-install-link" onClick={() => setScreen("pwa")}>
              앱 설치 / 점검
            </button>
            <button className="promo-link-btn" onClick={() => setScreen("release")}>
              출시 노트
            </button>
            <button className="promo-link-btn" onClick={() => setScreen("qa")}>
              QA 점검
            </button>
            <button className="promo-link-btn" onClick={() => setScreen("analytics")}>
              플레이테스트 리포트
            </button>
            <div className="promo-version-line">현재 빌드 v{SAVE_VERSION}</div>
          </div>
        </div>
      )}

      {screen === "menu" && (
        <div className="title-container art-menu">
          <img
            className="main-menu-art"
            src="/ui/cheonsu_main_menu_art.png"
            alt="천수 메인 메뉴"
          />

          <div className="main-menu-hit-area">
            <button className="menu-hit-btn" onClick={newGame} aria-label="새 게임">
              새 게임
            </button>
            <button className="menu-hit-btn" onClick={continueGame} aria-label="이어하기">
              이어하기
            </button>
            <button
              className="menu-hit-btn"
              onClick={() => setScreen("records")}
              aria-label="기록"
            >
              기록
            </button>
            <button
              className="menu-hit-btn"
              onClick={() => setScreen("codex")}
              aria-label="도감"
            >
              도감
            </button>
            <button
              className="menu-hit-btn"
              onClick={() => setScreen("profile")}
              aria-label="프로필"
            >
              프로필
            </button>
            <button
              className="menu-hit-btn"
              onClick={() => setScreen("gallery")}
              aria-label="갤러리"
            >
              갤러리
            </button>
            <button
              className="menu-hit-btn"
              onClick={() => setScreen("hall")}
              aria-label="명예의 전당"
            >
              명예
            </button>
            <button
              className="menu-hit-btn"
              onClick={() => setScreen("finalRc")}
              aria-label="v1.68.9.8.7.6.5.4.3.2"
            >
              v1.68.9.8.7.6.5.4.3.2
            </button>
            <button
              className="menu-hit-btn"
              onClick={() => setScreen("settings")}
              aria-label="설정"
            >
              설정
            </button>
            <button
              className="menu-hit-btn"
              onClick={() => openTutorial("deploy")}
              aria-label="도움말"
            >
              도움말
            </button>
            <button
              className="menu-hit-btn"
              onClick={() => setScreen("promo")}
              aria-label="종료"
            >
              종료
            </button>
          </div>

          <button className="promo-small-btn" onClick={() => setScreen("promo")}>
            홍보
          </button>
          <button className="release-small-btn" onClick={() => setScreen("release")}>
            v1.68.9.8.7.6.5.4.3.2
          </button>
          <div className="menu-version-line">BUILD v{SAVE_VERSION}</div>
        </div>
      )}

      {screen === "campaign" && (
        <div className={`campaign-screen campaign-stage-select ${campaignView === "atlas" ? "atlas-mode" : "world-mode"}`}>
          <div className="campaign-header">
            <h1>{campaignView === "atlas" ? "전체 맵" : "월드맵"}</h1>
            <div className="campaign-header-actions">
              <button
                className="back-btn"
                onClick={() => setCampaignView((prev) => (prev === "atlas" ? "world" : "atlas"))}
              >
                {campaignView === "atlas" ? "월드맵" : "전체 맵"}
              </button>
              <button className="back-btn" onClick={() => setScreen("menu")}>뒤로</button>
            </div>
          </div>

          <div className="campaign-progress-card world-progress-card">
            <div>
              <span>총 캠페인</span>
              <strong>{clearedStages.length} / {stages.length}장 클리어</strong>
            </div>
            <div>
              <span>보유 동료</span>
              <strong>{party.length}명</strong>
            </div>
            <div>
              <span>출전 가능</span>
              <strong>최대 {MAX_DEPLOY_COUNT}명</strong>
            </div>
          </div>

          <div className="recruit-rule">
            {PLAYTEST_UNLOCK_ALL_STAGES
              ? "개발 테스트 모드: 모든 스테이지가 열려 있어 바로 편성하고 전투에 들어갈 수 있습니다."
              : "지역을 따라 진군하세요. 보스 스테이지와 동료 합류 스테이지가 월드맵에 표시됩니다."}
          </div>

          {campaignView === "atlas" ? (
            <div className="stage-map-atlas">
              <div className="stage-map-atlas-head">
                <div>
                  <span>전술 지도첩</span>
                  <strong>1~30장 전투 맵 미리보기</strong>
                </div>
                <b>{stageMapAtlas.length}개</b>
              </div>

              <div className="stage-map-legend" aria-label="전체 맵 범례">
                <span className="legend-ally">아군</span>
                <span className="legend-enemy">적</span>
                <span className="legend-boss">보스</span>
                <span className="legend-block">이동불가</span>
              </div>

              <div className="stage-map-card-list">
                {stageMapAtlas.map(({ stage, previewStage, mission, threat, enemySummary }) => {
                  const map = previewStage?.map?.length ? previewStage.map : stage.map || [];
                  const mapWidth = map[0]?.length || 1;
                  const unitPositions = new Map(
                    (previewStage?.units || stage.units || []).map((unit) => [
                      `${unit.x},${unit.y}`,
                      unit,
                    ])
                  );
                  const nodeState = getStageNodeClass(stage, clearedStages, playableStageIds);
                  const nodeType = getStageNodeType(stage);
                  const recruitId = RECRUIT_BY_STAGE[stage.id];
                  const recruitName = recruitId ? getRecruitName(recruitId) : "";
                  const mastery = stageMastery[String(stage.id)];

                  return (
                    <article
                      className={`stage-map-card ${nodeState} node-${nodeType} ${threat.className}`}
                      key={stage.id}
                    >
                      <div className="stage-map-card-head">
                        <div>
                          <span>ACT {Math.ceil(stage.id / 5)} · {mission.type}</span>
                          <strong>{stage.id}장. {stage.title.replace(/^\d+장\.\s*/, "")}</strong>
                          <small>{mission.title}</small>
                        </div>
                        <b>{nodeState === "cleared" ? "CLEAR" : nodeState === "locked" ? "잠김" : "진입"}</b>
                      </div>

                      <button
                        type="button"
                        className="stage-map-preview"
                        onClick={() => startStage(stage)}
                        style={{ gridTemplateColumns: `repeat(${mapWidth}, minmax(0, 1fr))` }}
                        aria-label={`${stage.title} 맵 보기`}
                      >
                        {map.flatMap((row, y) =>
                          row.map((tile, x) => {
                            const unit = unitPositions.get(`${x},${y}`);
                            const blocked = isBlockedBattleTile(tile);
                            const unitClass =
                              unit?.type === "ally"
                                ? "ally"
                                : unit?.type === "boss"
                                ? "boss"
                                : unit
                                ? "enemy"
                                : "";

                            return (
                              <span
                                className={`stage-map-cell mini-${tile} ${blocked ? "mini-blocked" : ""}`}
                                key={`${stage.id}-${x}-${y}`}
                                title={`${x + 1},${y + 1} · ${getInspectTerrainLabel(tile)}`}
                              >
                                {unit && <i className={`stage-map-unit ${unitClass}`} />}
                              </span>
                            );
                          })
                        )}
                      </button>

                      <div className="stage-map-card-foot">
                        <span>전장 {mapWidth}x{map.length || 1}</span>
                        <span>위험도 {threat.level}</span>
                        <span>적 {enemySummary.total}명</span>
                        {enemySummary.boss ? <span>보스 {enemySummary.boss.name}</span> : null}
                        {recruitName ? <span>동료 {recruitName}</span> : null}
                        {mastery ? <span>{mastery.bestRank} {getRankStars(mastery.bestRank)}</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
          <div className="world-map-panel">
            {ACTS.map((act) => {
              const region = getWorldRegionInfo(act.start);
              const actStages = stages.filter(
                (stage) => stage.id >= act.start && stage.id <= act.end
              );
              const actCleared = actStages.filter((stage) =>
                clearedStages.includes(stage.id)
              ).length;

              return (
                <div
                  className={`world-region-card ${region.tone}`}
                  key={act.id}
                  style={{ "--region-art": `url(${region.image})` }}
                >
                  <div className="world-region-head">
                    <div className="region-icon">
                      {region.image ? (
                        <img src={region.image} alt="" aria-hidden="true" />
                      ) : (
                        region.icon
                      )}
                    </div>
                    <div>
                      <span>ACT {act.id}</span>
                      <strong>{region.name}</strong>
                      <small>{region.desc}</small>
                    </div>
                    <b>{actCleared}/{actStages.length}</b>
                  </div>
                  <div className="world-region-progress" aria-label={`ACT ${act.id} 진행률`}>
                    <i style={{ width: `${Math.round((actCleared / Math.max(1, actStages.length)) * 100)}%` }} />
                  </div>

                  <div className="world-path">
                    {actStages.map((stage, index) => {
                      const nodeState = getStageNodeClass(stage, clearedStages, playableStageIds);
                      const nodeType = getStageNodeType(stage);
                      const mission = getStageMissionOrder(stage);
                      const threat = getStageThreatLevel(stage, MAX_DEPLOY_COUNT);
                      const enemySummary = getStageEnemySummary(stage, MAX_DEPLOY_COUNT);
                      const recruitId = RECRUIT_BY_STAGE[stage.id];
                      const recruitName = recruitId ? getRecruitName(recruitId) : "";
                      const mastery = stageMastery[String(stage.id)];

                      return (
                        <button
                          key={stage.id}
                          className={`world-stage-node ${nodeState} node-${nodeType} ${threat.className}`}
                          disabled={!playableStageIds.includes(stage.id)}
                          onClick={() => startStage(stage)}
                          style={{ "--node-index": index }}
                        >
                          <span className="node-number">{stage.id}</span>
                          <div className="node-line" />
                          <div className="node-body">
                            <strong>{stage.title}</strong>
                            <em>
                              {mission.type} · {mission.title}
                              {mastery ? ` · ${mastery.bestRank} ${getRankStars(mastery.bestRank)}` : ""}
                            </em>
                            <small>
                              위험도 {threat.level} · 적 {enemySummary.total}명
                              {recruitName ? ` · 동료 ${recruitName}` : ""}
                              {getStageNote(stageNotes, stage) ? " · 메모 있음" : ""}
                              {getStageTags(stageNoteTags, stage).length ? ` · 태그 ${getStageTags(stageNoteTags, stage).length}` : ""}
                            </small>
                          </div>
                          <i>
                            {nodeState === "cleared"
                              ? (mastery ? mastery.bestRank : "✓")
                              : nodeState === "locked"
                              ? "잠김"
                              : nodeType === "boss"
                              ? "보스"
                              : nodeType === "recruit"
                              ? "동료"
                              : "편성"}
                          </i>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {screen === "deployment" && (
        <div className="deployment-screen deployment-simple-screen">
          <div className="screen-panel-header">
            <div>
              <div className="screen-kicker">출전 편성</div>
              <h1>{deploymentStage?.title || selectedStage?.title}</h1>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="back-btn" onClick={() => openTutorial("deploy")}>
                도움말
              </button>
              <button className="back-btn" onClick={() => setScreen("campaign")}>
                뒤로
              </button>
            </div>
          </div>

          {deploymentStage && deploymentEnemySummary && deploymentThreat && (
            <div className="stage-briefing-card">
              <div className="briefing-head">
                <div>
                  <span>작전 브리핑</span>
                  <strong>{deploymentStage.title}</strong>
                </div>
                <b className={deploymentThreat.className}>{deploymentThreat.level}</b>
              </div>

              <div className="briefing-grid">
                <div>
                  <span>전장</span>
                  <strong>
                    {deploymentPreviewStage?.map?.[0]?.length || "-"}x{deploymentPreviewStage?.map?.length || "-"}
                  </strong>
                </div>
                <div>
                  <span>예상 적</span>
                  <strong>{deploymentEnemySummary.total}명</strong>
                </div>
                <div>
                  <span>원거리/마법</span>
                  <strong>{deploymentEnemySummary.ranged}/{deploymentEnemySummary.magic}</strong>
                </div>
                <div>
                  <span>증원</span>
                  <strong>{getReinforcementRounds(deploymentStage).length ? getReinforcementRounds(deploymentStage).join(" / ") : "없음"}</strong>
                </div>
              </div>

              <div className="briefing-mission-row">
                <span>작전 목표</span>
                <strong>{getStageMissionOrder(deploymentStage).title}</strong>
                <em>{getStageMissionOrder(deploymentStage).desc}</em>
              </div>

              {deploymentEnemySummary.boss && (
                <div className="briefing-boss-row">
                  <span>보스</span>
                  <strong>{deploymentEnemySummary.boss.name}</strong>
                  <em>HP {deploymentEnemySummary.boss.maxHp} · 공격 {deploymentEnemySummary.boss.atk}</em>
                </div>
              )}

              <div className="briefing-recommend">
                추천: <strong>{recommendedFormationLabel}</strong>
                <button onClick={() => applyDeployPreset(recommendedFormationType)}>
                  추천 적용
                </button>
              </div>

              <div className="briefing-tips">
                {deploymentTips.map((tip, index) => (
                  <div key={index}>• {tip}</div>
                ))}
              </div>

              <div className="strategy-note-box">
                <div className="strategy-note-title">
                  <strong>작전 메모</strong>
                  <button onClick={() => applyDefaultStageNote(deploymentStage)}>
                    추천 메모
                  </button>
                </div>
                <textarea
                  value={getStageNote(stageNotes, deploymentStage)}
                  onChange={(event) => updateStageNote(deploymentStage.id, event.target.value)}
                  placeholder="이 스테이지 공략 메모를 적어두세요."
                />
                <div className="strategy-current-tags">
                  현재 태그: {getStrategyTagsText(getStageTags(stageNoteTags, deploymentStage))}
                </div>
                <div className="strategy-tag-row">
                  {STRATEGY_TAGS.map((tag) => {
                    const selected = getStageTags(stageNoteTags, deploymentStage).includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        className={selected ? "selected" : ""}
                        onClick={() => toggleStageTag(deploymentStage.id, tag.id)}
                        title={tag.desc}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
                <div className="strategy-tag-actions">
                  <button onClick={() => applyDefaultStageTags(deploymentStage)}>추천 태그</button>
                  <button onClick={() => clearStageTags(deploymentStage.id)}>태그 삭제</button>
                </div>
                <div className="strategy-preset-row">
                  {STRATEGY_TAG_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={getRecommendedPresetForStage(deploymentStage) === preset.id ? "recommended" : ""}
                      onClick={() => applyStrategyPreset(deploymentStage, preset.id)}
                    >
                      <strong>{preset.label}</strong>
                      <small>{preset.desc}</small>
                    </button>
                  ))}
                </div>
                <div className="strategy-autoprep-card">
                  <div>
                    <strong>전략 기반 자동 준비</strong>
                    <span>
                      태그 프리셋에 맞춰 출전 편성, 장비, 자동 전투 전략을 함께 맞춥니다.
                    </span>
                  </div>
                  <button onClick={() => applyStrategyPresetPreparation(deploymentStage)}>
                    추천 전략 준비
                  </button>
                </div>

                <div className="deployment-quick-slot-card">
                  <div className="deployment-quick-slot-head">
                    <strong>전략 빠른 슬롯</strong>
                    <span>
                      현재 스테이지 일치 {deploymentMatchingQuickSlots.length}개 · 전체 {deploymentAnyQuickSlots.length}개
                    </span>
                  </div>

                  {deploymentAnyQuickSlots.length ? (
                    <>
                    <div className="deployment-quick-actions">
                      <button onClick={copyQuickSlotSummary}>슬롯 요약 복사</button>
                    </div>
                    <div className="deployment-quick-slot-list">
                      {deploymentAnyQuickSlots.map(({ slot, entry }) => (
                        <button
                          key={slot}
                          className={entry.stageId === deploymentStage.id ? "matched" : ""}
                          onClick={() => applyArchivedStrategyReport(entry)}
                        >
                          <b>S{slot}</b>
                          <strong>{getQuickSlotDisplayName(slot, entry, strategyQuickSlotNames)}</strong>
                          <span>{entry.stageTitle} · {entry.grade} · {entry.score}</span>
                        </button>
                      ))}
                    </div>
                    </>
                  ) : (
                    <div className="deployment-quick-empty">
                      전략 보관함에서 리포트를 빠른 슬롯에 등록하면 여기에 표시됩니다.
                    </div>
                  )}
                </div>
              </div>

              {deploymentStrategyReport && (
                <div className={`strategy-report-card report-${deploymentStrategyReport.grade}`}>
                  <div className="strategy-report-head">
                    <div>
                      <span>전략 리포트</span>
                      <strong>{deploymentStrategyReport.preset.label} · {deploymentStrategyReport.label}</strong>
                    </div>
                    <b>{deploymentStrategyReport.grade}</b>
                  </div>

                  <div className="strategy-report-grid">
                    <div><span>전략 점수</span><strong>{deploymentStrategyReport.score}</strong></div>
                    <div><span>출전 장비</span><strong>{deploymentStrategyReport.equippedCount}명</strong></div>
                    <div><span>예상 적</span><strong>{deploymentStrategyReport.enemies.total}명</strong></div>
                    <div><span>위협</span><strong>{deploymentStrategyReport.readiness.threatScore}</strong></div>
                  </div>

                  <div className="strategy-report-tags">
                    {(deploymentStrategyReport.tags.length ? deploymentStrategyReport.tags : getDefaultStrategyTags(deploymentStage)).map((tagId) => (
                      <span key={tagId}>{getStrategyTagLabel(tagId)}</span>
                    ))}
                  </div>

                  <div className="strategy-report-columns">
                    <div>
                      <strong>강점</strong>
                      {deploymentStrategyReport.strengths.length
                        ? deploymentStrategyReport.strengths.map((item) => <span key={item}>✓ {item}</span>)
                        : <span>아직 뚜렷한 강점이 없습니다.</span>}
                    </div>
                    <div>
                      <strong>주의</strong>
                      {deploymentStrategyReport.warnings.length
                        ? deploymentStrategyReport.warnings.map((item) => <span key={item}>⚠ {item}</span>)
                        : <span>큰 위험 요소가 없습니다.</span>}
                    </div>
                  </div>

                  <div className="strategy-report-actions">
                    <button onClick={copyCurrentStrategyReport}>리포트 복사</button>
                    <button onClick={saveCurrentStrategyReportToArchive}>보관함 저장</button>
                    <button onClick={() => applyStrategyPresetPreparation(deploymentStage)}>
                      전략 재정비
                    </button>
                  </div>
                </div>
              )}

              <div className="briefing-supply-box">
                <div className="briefing-supply-title">추천 보급</div>
                <div className="briefing-supply-list">
                  {deploymentSupplyItems.map((itemId) => {
                    const item = ITEM_DEFS[itemId];

                    if (!item) return null;

                    return (
                      <button
                        key={itemId}
                        disabled={gold < item.price}
                        onClick={() => buyItem(itemId)}
                      >
                        <strong>{item.name}</strong>
                        <span>{getItemCount(inventory, itemId)}개 보유 · {getSupplyNeedText(inventory, itemId)}</span>
                        <b>{item.price}G</b>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {deploymentReadiness && (
            <div className={`deployment-readiness-card ${deploymentReadiness.className}`}>
              <div className="readiness-head">
                <div>
                  <span>출전 준비도</span>
                  <strong>{deploymentReadiness.label}</strong>
                </div>
                <b>{deploymentReadiness.grade}</b>
              </div>

              <div className="readiness-score-row">
                <div><span>부대 전력</span><strong>{deploymentReadiness.power}</strong></div>
                <div><span>위협 점수</span><strong>{deploymentReadiness.threatScore}</strong></div>
                <div><span>출전</span><strong>{deploymentReadiness.counts.total}/{MAX_DEPLOY_COUNT}</strong></div>
              </div>

              <div className="readiness-role-grid">
                <div><span>탱커</span><strong>{deploymentReadiness.counts.tank}</strong></div>
                <div><span>힐러</span><strong>{deploymentReadiness.counts.healer}</strong></div>
                <div><span>원거리</span><strong>{deploymentReadiness.counts.ranged}</strong></div>
                <div><span>암살</span><strong>{deploymentReadiness.counts.assassin}</strong></div>
              </div>

              {deploymentReadiness.warnings.length > 0 ? (
                <div className="readiness-warnings">
                  {deploymentReadiness.warnings.map((warning, index) => (
                    <div key={index}>⚠ {warning}</div>
                  ))}
                </div>
              ) : (
                <div className="readiness-ok">출전 구성이 안정적입니다.</div>
              )}

              <button className="readiness-auto-btn" onClick={applyAutoFillDeployment}>
                부족 역할 자동 보강
              </button>
            </div>
          )}

          <div className="deployment-equipment-card">
            <div>
              <span>출전 장비 상태</span>
              <strong>{deployedEquippedCount} / {deployedIds.length || 1}명 장착</strong>
            </div>
            <div className="deployment-equipment-actions">
              <button onClick={autoEquipDeployedUnits}>출전 자동 장착</button>
              <button onClick={autoEquipAllUnits}>전체 자동 장착</button>
            </div>
            <button className="one-click-prepare-btn" onClick={applyOneClickPreparation}>
              원클릭 전투 준비
            </button>
          </div>

          <div className="deployment-rule-card">
            <strong>출전 인원 {deployedIds.length} / {MAX_DEPLOY_COUNT}</strong>
            <span>{deploymentHint}</span>
          </div>

          <div className="deploy-preset-grid">
            {["balanced", "attack", "guard", "range"].map((type) => (
              <button key={type} onClick={() => applyDeployPreset(type)}>
                {getDeployPresetLabel(type)}
              </button>
            ))}
          </div>

          <div className="deploy-save-row deploy-slot-row">
            {[1, 2, 3].map((slot) => (
              <div className="deploy-slot-card" key={slot}>
                <strong>슬롯 {slot}</strong>
                <button onClick={() => saveDeploymentPreset(slot)}>저장</button>
                <button onClick={() => loadDeploymentPreset(slot)}>불러오기</button>
              </div>
            ))}
          </div>

          <div className="deploy-quick-row">
            <button onClick={selectAllDeployment}>전체 선택</button>
            <button onClick={clearDeploymentExceptHero}>카일만</button>
            <button onClick={() => applyRoleFill("tank", "탱커")}>탱커 보강</button>
            <button onClick={() => applyRoleFill("healer", "힐러")}>힐러 보강</button>
            <button onClick={() => applyRoleFill("ranged", "원거리")}>원거리 보강</button>
            <button onClick={() => applyRoleFill("assassin", "암살")}>암살 보강</button>
          </div>

          <div className="formation-order-grid">
            <button onClick={() => applyFormationOrder("front")}>전열 정렬</button>
            <button onClick={() => applyFormationOrder("rear")}>후열 정렬</button>
            <button onClick={() => applyFormationOrder("balanced")}>균형 정렬</button>
          </div>

          <div className="deploy-filter-panel">
            <div className="deploy-filter-head">
              <strong>동료 목록</strong>
              <span>
                {getDeployFilterLabel(deployFilter)} · {getDeploySortLabel(deploySort)} · {displayedDeployUnits.length}명
              </span>
            </div>
            <div className="deploy-filter-row">
              {["all", "selected", "tank", "healer", "ranged", "assassin", "promoted"].map((filter) => (
                <button key={filter} className={deployFilter === filter ? "selected" : ""} onClick={() => setDeployFilter(filter)}>
                  {getDeployFilterLabel(filter)}
                </button>
              ))}
            </div>
            <div className="deploy-sort-row">
              {["default", "level", "power", "role", "name"].map((sort) => (
                <button key={sort} className={deploySort === sort ? "selected" : ""} onClick={() => setDeploySort(sort)}>
                  {getDeploySortLabel(sort)}
                </button>
              ))}
            </div>
          </div>

          <div className="deployment-list">
            {displayedDeployUnits.map((unit) => {
              const selectedDeploy = deployedIds.includes(unit.id);
              const role = getUnitRole(unit);
              const locked = unit.id === "hero";

              return (
                <button
                  className={`deploy-unit-card ${selectedDeploy ? "selected" : ""} ${locked ? "locked-deploy" : ""}`}
                  key={unit.id}
                  onClick={() => toggleDeployUnit(unit.id)}
                >
                  <img src={getUnitPortrait(unit)} alt={unit.name} onError={(event) => { event.currentTarget.style.display = "none"; }} />
                  <div>
                    <strong>
                      {unit.name} Lv.{unit.level}
                      {locked ? " · 필수" : ""}
                    </strong>
                    <span>
                      전력 {getDeployUnitPower(unit)} · {unit.skill}+{getSkillUpgradeLevel(unit)} · {getUnitDisplayClass(unit)} · {getCombatClassLabel(getUnitCombatClass(unit))} 타입 · 이동 {unit.move} · {getUnitMoveTrait(unit).name}
                    </span>
                    <em className={`deploy-role-badge ${getUnitRoleClass(unit)}`}>
                      {role}
                    </em>
                    <small className="deploy-equipment-line">
                      장비: {unit.equipment?.weapon ? EQUIPMENT[unit.equipment.weapon]?.name : "무기 없음"} / {unit.equipment?.armor ? EQUIPMENT[unit.equipment.armor]?.name : "방어구 없음"}
                    </small>
                    <small className="deploy-passive-line">
                      패시브: {getUnitPassiveDef(unit).name} · {getUnitPassiveDef(unit).desc}
                    </small>
                  </div>
                  <b>{selectedDeploy ? "출전" : "대기"}</b>
                </button>
              );
            })}
          </div>

          <div className="deployment-actions">
            <button onClick={() => applyDeployPreset("balanced")}>
              자동 편성
            </button>
            <button className="start-deploy-btn" onClick={confirmDeployment}>
              전투 시작
            </button>
          </div>
        </div>
      )}

      {finalDeployCheckOpen && deploymentStage && finalDeploySummary && (
        <div className="battle-modal">
          <div className="battle-card final-deploy-card">
            <div className="battle-title">최종 출전 확인</div>
            <div className="result-sub">
              전투 시작 전 마지막 점검입니다.
            </div>

            <div className={`final-readiness-rank ${finalDeploySummary.readiness.className}`}>
              <span>준비도</span>
              <strong>{finalDeploySummary.readiness.grade}</strong>
              <em>{finalDeploySummary.readiness.label}</em>
            </div>

            <div className="final-check-grid">
              <div>
                <span>출전</span>
                <strong>{deployedIds.length}/{MAX_DEPLOY_COUNT}</strong>
              </div>
              <div>
                <span>장비</span>
                <strong>{deployedEquippedCount}명</strong>
              </div>
              <div>
                <span>전력</span>
                <strong>{finalDeploySummary.readiness.power}</strong>
              </div>
              <div>
                <span>위협</span>
                <strong>{finalDeploySummary.readiness.threatScore}</strong>
              </div>
            </div>

            <div className="final-supply-summary">
              {deploymentSupplyItems.map((itemId) => {
                const item = ITEM_DEFS[itemId];
                if (!item) return null;
                return (
                  <div key={itemId}>
                    <span>{item.name}</span>
                    <strong>{getItemCount(inventory, itemId)}개</strong>
                  </div>
                );
              })}
            </div>

            <div className="final-prepare-plan">
              <span>자동 준비 예상</span>
              <strong>
                보급 {deploymentSupplyPurchasePlan.items.length}개 · 비용 {deploymentSupplyPurchasePlan.cost}G
              </strong>
              <button onClick={applyOneClickPreparation}>
                원클릭 준비 적용
              </button>
            </div>

            {finalDeploySummary.warnings.length > 0 ? (
              <div className="final-warning-list">
                {finalDeploySummary.warnings.map((warning, index) => (
                  <div key={index}>⚠ {warning}</div>
                ))}
              </div>
            ) : (
              <div className="final-ok-message">
                출전 준비가 안정적입니다.
              </div>
            )}

            <div className="battle-buttons">
              <button onClick={() => setFinalDeployCheckOpen(false)}>돌아가기</button>
              <button className="start-deploy-btn" onClick={startDeploymentAfterFinalCheck}>
                그래도 출전
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "camp" && (
        <div className="camp-screen">
          <div className="camp-header">
            <div>
              <div className="camp-title">야영진</div>
              <div className="camp-sub">{selectedStage?.title || "천수 기사단"}</div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="back-btn" onClick={() => openTutorial("camp")}>도움말</button>
              <button className="back-btn" onClick={() => setScreen("menu")}>메뉴</button>
            </div>
          </div>
          <div className="camp-visual camp-bg-image">
            <div className="camp-fire">🔥</div>
            <div className="camp-moon">붉은 달 아래, 잠시의 휴식</div>
          </div>
          <div className="hud-row">
            <div className="hud-box"><span>골드</span><strong>{gold}G</strong></div>
            <div className="hud-box"><span>소모품</span><strong>{getTotalItemCount(inventory)}개</strong></div>
            <div className="hud-box"><span>장비</span><strong>{gearInventory.length}개</strong></div>
          </div>
          <div className="camp-dashboard-card">
            <div className="camp-dashboard-stat">
              <span>동료</span>
              <strong>{party.length}명</strong>
            </div>
            <div className="camp-dashboard-stat">
              <span>전직</span>
              <strong>{campPromotedCount}명</strong>
            </div>
            <div className="camp-dashboard-stat">
              <span>스킬 강화</span>
              <strong>{campSkillUpgradeTotal}단계</strong>
            </div>
            <div className="camp-dashboard-stat">
              <span>강화 장비</span>
              <strong>{campEnhancedGearCount}개</strong>
            </div>
          </div>

          <div className="camp-message">{campMessage}</div>

          <div className="camp-tab-row">
            {[
              ["party", "동료"],
              ["growth", "성장"],
              ["gear", "장비"],
              ["supply", "보급"],
              ["system", "관리"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={campTab === id ? "selected" : ""}
                onClick={() => setCampTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {campTab === "party" && (
            <div className="camp-tab-panel">
              <div className="camp-character-row upgraded">
                {party.map((unit) => (
                  <div className="camp-character" key={unit.id}>
                    <img src={getUnitPortrait(unit)} alt={unit.name} onError={(event) => { event.currentTarget.style.display = "none"; }} />
                    <div>
                      <strong>{unit.name} Lv.{unit.level} · {getUnitDisplayClass(unit)}</strong>
                      <span>EXP {unit.exp} · 공격 {unit.atk} / 방어 {unit.def} · {getUnitPassiveDef(unit).name}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="camp-menu-grid compact">
                <button className="camp-btn" onClick={() => setSupportOpen(true)}>대화</button>
                <button className="camp-btn" onClick={() => setDispatchOpen(true)}>파견</button>
              </div>
            </div>
          )}

          {campTab === "growth" && (
            <div className="camp-tab-panel">
              <div className="camp-action-grid">
                <button className="camp-btn" onClick={() => setTrainingOpen(true)}>훈련</button>
                <button className="camp-btn" onClick={() => setSkillOpen(true)}>스킬 강화</button>
                <button className="camp-btn" onClick={() => setPromoteOpen(true)}>전직</button>
              </div>
            </div>
          )}

          {campTab === "gear" && (
            <div className="camp-tab-panel">
              <div className="camp-action-grid">
                <button className="camp-btn" onClick={() => setEquipmentOpen(true)}>장비 관리</button>
                <button className="camp-btn" onClick={() => setForgeOpen(true)}>제련소</button>
                <button className="camp-btn" onClick={autoEquipAllUnits}>전체 자동 장착</button>
              </div>
            </div>
          )}

          {campTab === "supply" && (
            <div className="camp-tab-panel">
              <div className="camp-action-grid">
                <button className="camp-btn" onClick={() => setShopOpen(true)}>상점</button>
                <button className="camp-btn" disabled={dailyLoginStatus.claimedToday} onClick={claimDailyLoginReward}>
                  {dailyLoginStatus.claimedToday ? "일일 보상 완료" : "일일 보상"}
                </button>
                <button className="camp-btn" onClick={goNextBattle}>다음 전투</button>
              </div>
              <div className="camp-season-summary">
                <span>{seasonInfo.icon} {seasonInfo.title}</span>
                <strong>{completedSeasonMissionCount}/{seasonMissions.length} 완료</strong>
              </div>
              <div className="camp-supply-summary">
                {Object.values(ITEM_DEFS).map((item) => (
                  <div key={item.id}>
                    <span>{item.name}</span>
                    <strong>{getItemCount(inventory, item.id)}개</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {campTab === "system" && (
            <div className="camp-tab-panel">
              <div className="camp-action-grid">
                <button className="camp-btn" onClick={saveGame}>저장</button>
                <button className="camp-btn" onClick={() => setScreen("records")}>기록</button>
                <button className="camp-btn" onClick={() => setScreen("codex")}>도감</button>
                <button className="camp-btn" onClick={() => setScreen("profile")}>프로필</button>
                <button className="camp-btn" onClick={() => setScreen("gallery")}>갤러리</button>
                <button className="camp-btn" onClick={() => setScreen("hall")}>명예의 전당</button>
                <button className="camp-btn" onClick={() => setScreen("strategyArchive")}>전략 보관함</button>
                <button className="camp-btn" onClick={() => setScreen("menu")}>메뉴</button>
              </div>
            </div>
          )}
          {shopOpen && (
            <div className="battle-modal">
              <div className="battle-card shop-card">
                <div className="battle-title">야영지 상점</div>
                <div className="battle-stats">
                  <div>보유 골드 <strong>{gold}G</strong></div>
                  <div>소모품 <strong>{getTotalItemCount(inventory)}개</strong></div>
                </div>

                <div className="shop-section-title">소모품</div>
                <div className="shop-item-list">
                  {Object.values(ITEM_DEFS).map((item) => (
                    <button key={item.id} onClick={() => buyItem(item.id)}>
                      <strong>{item.name}</strong>
                      <span>{item.desc}</span>
                      <b>{item.price}G</b>
                    </button>
                  ))}
                </div>

                <div className="shop-section-title">장비</div>
                <div className="shop-item-list">
                  <button onClick={() => buyGear("ironSword", 500)}>
                    <strong>철검</strong>
                    <span>카일 계열 기본 무기</span>
                    <b>500G</b>
                  </button>
                  <button onClick={() => buyGear("chainArmor", 800)}>
                    <strong>사슬 갑옷</strong>
                    <span>방어 +2</span>
                    <b>800G</b>
                  </button>
                </div>

                <button className="result-btn second" onClick={() => setShopOpen(false)}>
                  닫기
                </button>
              </div>
            </div>
          )}
          {renderEquipmentModal()}
          {renderForgeModal()}
          {renderTrainingModal()}
          {renderDispatchModal()}
          {renderSkillUpgradeModal()}
          {renderPromotionModal()}
          {renderSupportModal()}
          {renderSupportScene()}
        </div>
      )}

      {screen === "battle" && (
        <div className={`battle-screen battle-final-concept battle-board-only ${isFinalConceptStage(activeStage) ? "final-illustrated-battle" : ""} ${showPostMoveCommandMenu ? "has-post-move-menu" : ""} ${battleHudHidden ? "battle-hud-hidden" : ""} ${battleCompact ? "battle-compact-mode battle-simple-mode" : "battle-detail-mode"}`}>
          <div className="battle-top">
            <div className="battle-title-block">
              <div className="battle-kicker">모바일 전술 SRPG · 천수</div>
              <div className="chapter">{selectedStage?.title}</div>
              <div className="objective">{selectedStage?.objective}</div>
            </div>
            <div className="battle-top-actions">
              {!battleCompact && <button className="back-btn photo-toggle-btn" onClick={togglePhotoMode}>포토</button>}
              {!battleCompact && <button className="back-btn" onClick={() => openTutorial("battle")}>도움말</button>}
              <button className="back-btn" onClick={saveGame}>저장</button>
              <button className="back-btn battle-simple-toggle" onClick={() => setBattleCompact((prev) => !prev)}>
                {battleCompact ? "상세" : "간단"}
              </button>
              <button className="back-btn" onClick={() => setScreen("campaign")}>후퇴</button>
            </div>
          </div>
          <div className={`cinematic-stage-hud ${battleHudHidden ? "hud-collapsed" : ""}`}>
            {battleHudHidden ? (
              <button
                type="button"
                className="cinematic-hud-restore"
                onClick={() => setBattleHudHidden(false)}
              >
                정보 표시
              </button>
            ) : (
              <>
                <div className="cinematic-stage-card">
                  <strong>{selectedStage?.title}</strong>
                  <span>턴 {round} / {activeRoundLimit}</span>
                  <em>승리 조건</em>
                  <b>{activeMissionOrder.title}</b>
                </div>
                <div className="cinematic-stage-actions">
                  <button type="button" onClick={cycleMapVisibility}>위험 범위</button>
                  <button type="button" onClick={() => setBattleHudHidden(true)}>정보 숨김</button>
                  <button
                    type="button"
                    onClick={() => {
                      setBattleSettingsOpen(true);
                      playSfx("confirm");
                    }}
                  >
                    설정
                  </button>
                </div>
              </>
            )}
          </div>
          {battleSettingsOpen && (
            <div className="battle-settings-popover" role="dialog" aria-label="전투 설정">
              <button
                type="button"
                className="battle-settings-scrim"
                aria-label="전투 설정 닫기"
                onClick={() => setBattleSettingsOpen(false)}
              />
              <div className="battle-settings-card">
                <div className="battle-settings-head">
                  <div>
                    <span>전투 설정</span>
                    <strong>{selectedStage?.title}</strong>
                  </div>
                  <button type="button" onClick={() => setBattleSettingsOpen(false)}>
                    닫기
                  </button>
                </div>

                <div className="battle-settings-grid">
                  <button type="button" onClick={() => setBattleCompact((prev) => !prev)}>
                    <span>화면</span>
                    <strong>{battleCompact ? "간단" : "상세"}</strong>
                  </button>
                  <button type="button" onClick={cycleMapVisibility}>
                    <span>위험 범위</span>
                    <strong>{mapVisibilityConfig.label}</strong>
                  </button>
                  <button type="button" onClick={cycleBattleSpeed}>
                    <span>전투 속도</span>
                    <strong>{battleSpeedConfig.label}</strong>
                  </button>
                  <button type="button" onClick={cycleCutsceneMode}>
                    <span>VS 컷씬</span>
                    <strong>{cutsceneConfig.label}</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBattleHudHidden(true);
                      setBattleSettingsOpen(false);
                    }}
                  >
                    <span>상단 정보</span>
                    <strong>숨김</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBattleSettingsOpen(false);
                      openTutorial("battle");
                    }}
                  >
                    <span>도움말</span>
                    <strong>열기</strong>
                  </button>
                </div>

                <div className="battle-settings-section-title">게임 옵션</div>
                <div className="battle-settings-menu">
                  <button type="button" onClick={() => updateSetting("soundOn", !settings.soundOn)}>
                    <span>효과음</span>
                    <strong>{settings.soundOn ? "ON" : "OFF"}</strong>
                  </button>
                  <button type="button" onClick={() => updateSetting("effectsOn", !settings.effectsOn)}>
                    <span>전투 이펙트</span>
                    <strong>{settings.effectsOn ? "ON" : "OFF"}</strong>
                  </button>
                  <button type="button" onClick={() => updateSetting("musicOn", !settings.musicOn)}>
                    <span>음악</span>
                    <strong>{settings.musicOn ? "ON" : "OFF"}</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      saveGame();
                      setBattleSettingsOpen(false);
                    }}
                  >
                    <span>저장</span>
                    <strong>진행 저장</strong>
                  </button>
                </div>

                <div className="battle-settings-section-title">나가기</div>
                <div className="battle-settings-menu battle-settings-exit-menu">
                  <button
                    type="button"
                    onClick={() => {
                      const baseStage = stages.find((stage) => stage.id === activeStage.id) || activeStage;

                      setBattleSettingsOpen(false);
                      setDeploymentStage(baseStage);
                      setSelectedStage(baseStage);
                      setScreen("deployment");
                      playSfx("confirm");
                    }}
                  >
                    <span>대기실</span>
                    <strong>출전 편성</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBattleSettingsOpen(false);
                      setScreen("campaign");
                      playSfx("confirm");
                    }}
                  >
                    <span>월드맵</span>
                    <strong>스테이지 선택</strong>
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setBattleSettingsOpen(false);
                      setScreen("menu");
                      playSfx("cancel");
                    }}
                  >
                    <span>메인</span>
                    <strong>타이틀 메뉴</strong>
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="hud-row classic-hud-row">
            <div className="hud-box"><span>턴</span><strong>{turn === "ally" ? "아군" : "적"}</strong></div>
            <div className="hud-box"><span>라운드</span><strong>{round} / {activeRoundLimit}</strong></div>
            <div className="hud-box"><span>모드</span><strong>{mode === "skill" ? "스킬" : mode === "attack" ? "공격" : "이동"}</strong></div>
          </div>
          <div className="classic-battle-strip">
            <span>{activeMissionOrder.title} · {activeBattlefieldTheme.label}</span>
            <strong>아군 {alliesAlive.length} / 적 {enemiesAlive.length}</strong>
            {activeBoss && <em>{activeBoss.name} HP {activeBoss.hp}/{activeBoss.maxHp}</em>}
          </div>

          <div className="battle-objective-panel">
            <div className="objective-main-row">
              <div>
                <span>승리 조건</span>
                <strong>{activeMissionOrder.type} · {activeMissionOrder.title}</strong>
              </div>
              <div>
                <span>전장 규모</span>
                <strong>{activeMap[0].length}x{activeMap.length}</strong>
              </div>
            </div>

            <div className="objective-stat-grid">
              <div>
                <span>아군 생존</span>
                <strong>{alliesAlive.length}명</strong>
              </div>
              <div>
                <span>남은 적</span>
                <strong>{enemiesAlive.length}명</strong>
              </div>
              <div>
                <span>전술 제한</span>
                <strong>{getStageSpeedLimit(activeStage)}R</strong>
              </div>
              <div>
                <span>다음 증원</span>
                <strong>{nextReinforcementRound ? `${nextReinforcementRound}R` : "없음"}</strong>
              </div>
            </div>

            {activeBoss && (
              <div className={`boss-tracker ${activeBoss.phase2 ? "phase2" : ""}`}>
                <div className="boss-tracker-head">
                  <span>{activeBoss.phase2 ? "2페이즈 보스" : "보스"}</span>
                  <strong>{activeBoss.name}</strong>
                  <em>HP {activeBoss.hp}/{activeBoss.maxHp}</em>
                </div>
                <div className="boss-tracker-bar">
                  <i style={{ width: `${bossHpRate}%` }} />
                </div>
              </div>
            )}

            <div className="tactical-goal-mini">
              주 작전: {activeMissionOrder.desc}
            </div>
            <div className="tactical-goal-mini secondary">
              추가 전술 목표: 속전속결 · 출전 아군 전원 생존 · 카일 HP 50% 이상
            </div>
          </div>

          {!battleGuideHidden && (
            <div className={`battle-guide-panel guide-${battleGuideHint.tone}`}>
              <div className="battle-guide-copy">
                <span>{battleGuideHint.meta}</span>
                <strong>{battleGuideHint.title}</strong>
                <p>{battleGuideHint.desc}</p>
              </div>
              <div className="battle-guide-actions">
                <button className="primary" onClick={runBattleGuideAction}>
                  {battleGuideHint.actionLabel}
                </button>
                <button onClick={() => openTutorial("battle")}>전체 도움말</button>
                <button onClick={() => setBattleGuideHidden(true)}>숨김</button>
              </div>
            </div>
          )}

          {battleGuideHidden && (
            <button className="battle-guide-restore" onClick={() => setBattleGuideHidden(false)}>
              전투 안내 보기
            </button>
          )}

          <div className={`difficulty-condition difficulty-${settings.difficulty}`}>
            난이도: {getDifficultyConfig(settings.difficulty).label} · 밸런스 {balancePresetConfig.label} · 적 HP x{Math.round(getDifficultyConfig(settings.difficulty).hp * balancePresetConfig.hp * 100) / 100} / 공격 x{Math.round(getDifficultyConfig(settings.difficulty).atk * balancePresetConfig.atk * 100) / 100}
          </div>

          <div className="battle-view-controls">
            {[
              ["fit", "전체"],
              ["normal", "표준"],
              ["large", "확대"],
              ["xl", "초확대"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={mapZoom === value ? "active-view-btn" : ""}
                onClick={() => setMapZoom(value)}
              >
                {label}
              </button>
            ))}
            <button
              className="speed-view-btn"
              onClick={cycleBattleSpeed}
            >
              속도 {battleSpeedConfig.label}
            </button>
            <button
              className="map-visibility-btn"
              onClick={cycleMapVisibility}
              title={mapVisibilityConfig.desc}
            >
              시야 {mapVisibilityConfig.label}
            </button>
            <button
              className="cutscene-view-btn"
              onClick={cycleCutsceneMode}
            >
              컷씬 {cutsceneConfig.label}
            </button>
            <button
              className={battleCompact ? "active-view-btn" : ""}
              onClick={() => setBattleCompact((prev) => !prev)}
            >
              패널
            </button>
            <button
              className={mobileBattlePanelOpen ? "active-view-btn mobile-only-btn" : "mobile-only-btn"}
              onClick={() => toggleMobileCombatPanel("quick")}
            >
              빠른패널
            </button>
          </div>

          <div className={`mobile-battle-dock ${mobileBattlePanelOpen ? "open" : ""}`}>
            <button onClick={() => toggleMobileCombatPanel("quick")}>
              {mobileBattlePanelOpen ? "닫기" : "전투패널"}
            </button>
            {mobileBattlePanelOpen && (
              <div className="mobile-battle-dock-body">
                <div>
                  <strong>{viewedUnit ? viewedUnit.name : "유닛 미선택"}</strong>
                  <span>
                    턴 {turn === "ally" ? "아군" : "적"} · 라운드 {round} · 행동 가능 {units.filter(isUnitReady).length}
                  </span>
                  {viewedUnit && (
                    <div className="mobile-unit-mini-hp">
                      <i style={{ width: `${viewedUnit.maxHp ? Math.max(0, Math.min(100, (viewedUnit.hp / viewedUnit.maxHp) * 100)) : 0}%` }} />
                      <b>{viewedUnit.hp}/{viewedUnit.maxHp}</b>
                    </div>
                  )}
                </div>
                <div className="mobile-battle-dock-actions">
                  <button disabled={!selected} onClick={() => setBattleModeFromMobile("move")}>이동</button>
                  <button disabled={!selected} onClick={() => setBattleModeFromMobile("attack")}>공격</button>
                  <button disabled={!selected || selectedSkillCooldown > 0} onClick={() => setBattleModeFromMobile("skill")}>스킬</button>
                  <button onClick={() => focusUnitOnMap(viewedUnit || selected || alliesAlive[0])}>초점</button>
                  <button onClick={() => toggleMobileCombatPanel("ally")}>아군목록</button>
                  <button onClick={() => toggleMobileCombatPanel("target")}>대상목록</button>
                  <button onClick={() => toggleMobileCombatPanel("turn")}>순서</button>
                  <button onClick={cycleMapVisibility}>시야 {mapVisibilityConfig.label}</button>
                  <button onClick={cycleBattleSpeed}>{getBattleSpeedConfig(settings.battleSpeed).label}</button>
                  <button onClick={() => {
                    closeMobileCombatPanels();
                    setItemOpen(true);
                  }}>아이템</button>
                </div>
              </div>
            )}
          </div>

          <div className="mobile-bottom-action-bar">
            <button
              className={mode === "move" ? "active" : ""}
              disabled={!selected}
              onClick={() => setBattleModeFromMobile("move")}
            >
              이동
            </button>
            <button
              className={`compact-extra-action ${mobileAllyPanelOpen ? "active" : ""}`}
              onClick={() => toggleMobileCombatPanel("ally")}
            >
              아군
            </button>
            <button
              className={`compact-extra-action ${mobileTurnPanelOpen ? "active" : ""}`}
              onClick={() => toggleMobileCombatPanel("turn")}
            >
              순서
            </button>
            <button
              className={mode === "attack" ? "active" : ""}
              disabled={!selected}
              onClick={() => setBattleModeFromMobile("attack")}
            >
              공격
            </button>
            <button
              className={`compact-extra-action ${mobileTargetPanelOpen ? "active" : ""}`}
              onClick={() => toggleMobileCombatPanel("target")}
            >
              대상
            </button>
            <button
              className={mode === "skill" ? "active" : ""}
              disabled={!selected || selectedSkillCooldown > 0}
              onClick={() => setBattleModeFromMobile("skill")}
            >
              스킬{selectedSkillCooldown > 0 ? ` ${selectedSkillCooldown}` : ""}
            </button>
            <button onClick={() => {
              closeMobileCombatPanels();
              setItemOpen(true);
            }}>
              아이템
            </button>
            <button onClick={() => {
              closeMobileCombatPanels();
              endAllyTurn();
            }}>
              턴종료
            </button>
          </div>

          {selected && mode === "move" && turn === "ally" && !selected.moved && !selected.acted && (
            <div className="mobile-move-panel">
              <div className="mobile-move-head">
                <strong>{selected.name} 이동 후보</strong>
                <span>파란 칸을 누르거나 아래 목적지를 선택하세요.</span>
              </div>

              {mobileMoveDestinationList.length ? (
                <div className="mobile-move-list">
                  {mobileMoveDestinationList.map((tile) => (
                    <button
                      key={`move-${tile.x}-${tile.y}`}
                      disabled={turnBusy || !!movingUnit}
                      onClick={() => moveSelectedUnitTo(tile.x, tile.y, tile)}
                    >
                      <strong>{tile.x + 1},{tile.y + 1}</strong>
                      <span>{tile.label} · 이동력 {tile.cost}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mobile-move-empty">이동 가능한 칸이 없습니다.</div>
              )}
            </div>
          )}

          {mobileTurnPanelOpen && (
            <div className="mobile-turn-panel">
              <div className="mobile-turn-head">
                <strong>전투 순서 / 상태</strong>
                <span>라운드 {round} · {turn === "ally" ? "아군 턴" : "적 턴"}</span>
              </div>

              <div className="mobile-turn-list">
                {mobileTurnOrderList.map((unit) => {
                  const hpRate = unit.maxHp ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)) : 0;
                  return (
                    <button
                      key={unit.id}
                      className={`${unit.type === "ally" ? "ally" : unit.type === "boss" ? "boss" : "enemy"} ${unit.acted ? "acted" : ""} ${selectedUnit === unit.id || inspectedUnitId === unit.id ? "selected" : ""}`}
                      onClick={() => {
                        if (unit.type === "ally" && turn === "ally" && !unit.acted) {
                          selectBattleAllyForAction(unit, "턴 목록에서 선택됨");
                        } else {
                          inspectBattleUnit(unit, unit.type === "ally" ? "턴 종료 아군 확인" : "턴 목록 확인");
                        }
                        closeMobileCombatPanels();
                      }}
                    >
                      <span className="mobile-turn-type">
                        {unit.type === "ally" ? "A" : unit.type === "boss" ? "B" : "E"}
                      </span>
                      <div>
                        <strong>{unit.name}</strong>
                        <small>
                          {unit.type === "ally" ? "아군" : unit.type === "boss" ? "보스" : "적"} · {unit.acted ? "행동 완료" : "대기"} · {getStatusText(unit.status)}
                        </small>
                        <em>
                          <i style={{ width: `${hpRate}%` }} />
                          <b>{unit.hp}/{unit.maxHp}</b>
                        </em>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mobileAllyPanelOpen && (
            <div className="mobile-ally-panel">
              <div className="mobile-ally-head">
                <strong>아군 선택</strong>
                <span>생존 {alliesAlive.length}명 · 행동 가능 {units.filter(isUnitReady).length}명</span>
              </div>

              <div className="mobile-ally-list">
                {mobileAllyList.map((ally) => {
                  const hpRate = ally.maxHp ? Math.max(0, Math.min(100, (ally.hp / ally.maxHp) * 100)) : 0;

                  return (
                    <button
                      key={ally.id}
                      className={`${ally.acted ? "acted" : ""} ${selectedUnit === ally.id || inspectedUnitId === ally.id ? "selected" : ""}`}
                      onClick={() => {
                        if (turn === "ally" && !ally.acted) {
                          selectBattleAllyForAction(ally, "모바일 패널에서 선택됨");
                        } else {
                          inspectBattleUnit(ally, "행동 완료 아군 확인");
                        }
                        closeMobileCombatPanels();
                      }}
                    >
                      <img
                        src={getUnitSprite(ally)}
                        alt={ally.name}
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                      />
                      <div>
                        <strong>{ally.name} Lv.{ally.level || "-"}</strong>
                        <small>{ally.acted ? "행동 완료" : ally.moved ? "공격 가능" : "이동 가능"} · {ally.skill}</small>
                        <span className="mobile-ally-hp">
                          <i style={{ width: `${hpRate}%` }} />
                          <b>{ally.hp}/{ally.maxHp}</b>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mobileTargetPanelOpen && (
            <div className="mobile-target-panel">
              <div className="mobile-target-head">
                <strong>대상 선택</strong>
                <span>
                  {selected ? `${selected.name} 기준` : "아군을 먼저 선택하세요"} · 표시 {mobileTargetList.length}명
                </span>
              </div>

              {mobileTargetList.length ? (
                <div className="mobile-target-list">
                  {mobileTargetList.map((enemy) => {
                    const inRange = selected && attackTiles.some((tile) => tile.x === enemy.x && tile.y === enemy.y);
                    const targetDistance = selected ? Math.abs(selected.x - enemy.x) + Math.abs(selected.y - enemy.y) : 0;
                    const actionLabel = mode === "skill" ? "스킬 가능" : "공격 가능";
                    return (
                      <button
                        key={enemy.id}
                        className={inRange ? "in-range" : ""}
                        onClick={() => {
                          setInspectedUnitId(enemy.id);
                          focusUnitOnMap(enemy);
                          if (selected && inRange) {
                            closeMobileCombatPanels();
                            openBattle(selected, enemy, mode === "skill" ? "skill" : "attack");
                          } else {
                            setMobileBattlePanelOpen(false);
                            setMobileTargetPanelOpen(true);
                            setMobileAllyPanelOpen(false);
                            setMobileTurnPanelOpen(false);
                            setLogs((p) => [
                              selected
                                ? `${enemy.name}은 사거리 밖입니다. 거리 ${targetDistance}, ${selected.name} 사거리 ${mode === "skill" ? selected.skillRange || selected.range || 1 : selected.range || 1}.`
                                : "먼저 행동할 아군을 선택하세요.",
                              ...p,
                            ]);
                          }
                        }}
                      >
                        <span>{enemy.icon || "⚔️"}</span>
                        <div>
                          <strong>{enemy.name}</strong>
                          <small>HP {enemy.hp}/{enemy.maxHp} · 거리 {targetDistance} · {inRange ? actionLabel : "거리 밖"}</small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mobile-target-empty">표시할 대상이 없습니다.</div>
              )}
            </div>
          )}

          {viewedUnit && (
            <div className={`selected-unit-status-hud hud-${viewedUnit.type}`}>
              <div className="selected-status-face">
                <img
                  src={getUnitPortrait(viewedUnit)}
                  alt={viewedUnit.name}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              </div>
              <div className="selected-status-main">
                <div className="selected-status-head">
                  <strong>
                    {viewedUnit.name}
                    {viewedUnit.type === "ally" ? ` Lv.${viewedUnit.level || 1}` : ""}
                  </strong>
                  <span>{getInspectUnitKind(viewedUnit)} · {getInspectUnitRole(viewedUnit)}</span>
                </div>
                <div className="selected-status-bars">
                  <div className="selected-meter hp-meter">
                    <span>HP</span>
                    <i><b style={{ width: `${viewedHpRate}%` }} /></i>
                    <em>{viewedUnit.hp}/{viewedUnit.maxHp}</em>
                  </div>
                  <div className="selected-meter mp-meter">
                    <span>{viewedResourceLabel}</span>
                    <i><b style={{ width: `${viewedResourceRate}%` }} /></i>
                    <em>{viewedResourceValue}/{viewedResourceMax}</em>
                  </div>
                </div>
                <div className="selected-status-stats">
                  <span>공 {viewedUnit.atk}</span>
                  <span>방 {viewedUnit.def}</span>
                  <span>이 {viewedUnit.move}</span>
                  <span>사 {viewedUnit.range || 1}</span>
                  {viewedUnit.type === "ally" && (
                    <span>{viewedSkillCooldown > 0 ? `스킬 ${viewedSkillCooldown}턴` : "스킬 가능"}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div
            className="battle-zoom-controls"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            aria-label="전장 줌 조절"
          >
            <button
              type="button"
              disabled={!canZoomOut}
              onClick={() => changeBattleMapZoom(-1)}
              aria-label="전장 축소"
            >
              -
            </button>
            <button
              type="button"
              className="battle-zoom-reset"
              onClick={resetBattleMapZoom}
              aria-label="전장 자동 맞춤"
            >
              <span>{mapZoomLabel}</span>
              <small>맞춤</small>
            </button>
            <button
              type="button"
              disabled={!canZoomIn}
              onClick={() => changeBattleMapZoom(1)}
              aria-label="전장 확대"
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="battle-end-turn-float"
            disabled={
              turn !== "ally" ||
              turnBusy ||
              !!movingUnit ||
              !!battle ||
              battleResolving ||
              !!result ||
              !alliesAlive.length ||
              !enemiesAlive.length
            }
            onClick={() => {
              closeMobileCombatPanels();
              endAllyTurn();
            }}
          >
            <span>턴 종료</span>
            <small>{readyAllyCount > 0 ? `${readyAllyCount}명 남음` : "적 턴"}</small>
          </button>

          <div
            ref={battleMapShellRef}
            className={`battle-map-scroll-shell map-zoom-${mapZoom} map-visibility-${mapVisibility} ${isFinalConceptStage(activeStage) ? "final-illustrated-shell" : ""}`}
            style={{
              "--map-cols": activeMap[0].length,
              "--map-rows": activeMap.length,
              "--classic-map-image": `url(${getClassicBattleMapArt(activeStage)})`,
            }}
            onPointerDown={handleBattleMapPointerDown}
            onPointerMove={handleBattleMapPointerMove}
            onPointerUp={handleBattleMapPointerEnd}
            onPointerCancel={handleBattleMapPointerEnd}
          >
          <div
            className={`battle-map expanded-map large-map classic-pixel-map ${isFinalConceptStage(activeStage) ? "final-illustrated-map" : ""}`}
            style={{
              gridTemplateColumns: `repeat(${activeMap[0].length}, var(--battle-tile-size, minmax(0, 1fr)))`,
              "--map-cols": activeMap[0].length,
              "--map-rows": activeMap.length,
              "--classic-map-image": `url(${getClassicBattleMapArt(activeStage)})`,
            }}
          >
            {movingUnit && (
              <div
                className="moving-unit-layer"
                style={{
                  "--cols": activeMap[0].length,
                  "--rows": activeMap.length,
                }}
              >
                <div
                  key={movingUnit.frame}
                  className={`map-moving-unit moving-${movingUnit.direction || "down"} ${
                    movingUnit.unit.type === "ally"
                      ? "ally-moving"
                      : movingUnit.unit.type === "boss"
                      ? "boss-moving"
                      : "enemy-moving"
                  }`}
                  style={{
                    "--from-x": movingUnit.from.x,
                    "--from-y": movingUnit.from.y,
                    "--dx": movingUnit.to.x - movingUnit.from.x,
                    "--dy": movingUnit.to.y - movingUnit.from.y,
                    "--move-duration": `${movingUnit.duration || 460}ms`,
                    "--unit-depth": `${(movingUnit.from.y / Math.max(1, activeMap.length - 1)).toFixed(3)}`,
                    "--unit-depth-scale": `${(
                      (movingUnit.unit.type === "boss" ? 0.94 : 0.84) +
                      (movingUnit.from.y / Math.max(1, activeMap.length - 1)) * (movingUnit.unit.type === "boss" ? 0.22 : 0.24)
                    ).toFixed(3)}`,
                    "--unit-shadow-alpha": `${(0.38 + (movingUnit.from.y / Math.max(1, activeMap.length - 1)) * 0.26).toFixed(3)}`,
                    "--unit-ground-y": `${Math.round(2 + (movingUnit.from.y / Math.max(1, activeMap.length - 1)) * 5)}px`,
                    "--unit-z": `${Math.round((movingUnit.unit.type === "boss" ? 64 : 56) + (movingUnit.from.y / Math.max(1, activeMap.length - 1)) * 18)}`,
                  }}
                >
                  <span className="move-trail move-trail-a" />
                  <span className="move-trail move-trail-b" />
                  <span className="move-step-dust dust-a" />
                  <span className="move-step-dust dust-b" />
                  <span className="move-motion-ring" />
                  <img
                    src={getBattleMapUnitSprite(movingUnit.unit)}
                    alt={movingUnit.unit.name}
                    onError={(event) => handleBattleMapUnitImageError(event, movingUnit.unit)}
                  />
                  <span className="moving-unit-fallback">{movingUnit.unit.icon}</span>
                </div>
              </div>
            )}
            {activeMap.flatMap((row, y) =>
              row.map((tile, x) => {
                const unit = units.find((u) => u.x === x && u.y === y);
                const unitActionMotion = unit && actionMotion?.attackerId === unit.id ? actionMotion : null;
                const tileBlocked = isBlockedBattleTile(tile);
                const moveTileInfo = tileBlocked ? null : moveTiles.find((m) => m.x === x && m.y === y);
                const movable = !tileBlocked && turn === "ally" && mode === "move" && selectedUnit && Boolean(moveTileInfo);
                const attackable = !tileBlocked && turn === "ally" && (mode === "attack" || mode === "skill") && selectedUnit && attackTiles.some((m) => m.x === x && m.y === y);
                const enemyThreat = !tileBlocked && enemyThreatTileKeys.has(`${x},${y}`);
                const hazardInfo = hazards.find((h) => h.x === x && h.y === y);
                const danger = Boolean(hazardInfo);
                const aoePreview = battle?.aoeTargets?.some((target) => target.x === x && target.y === y);
                const cameraFocused = cameraFocus?.x === x && cameraFocus?.y === y;
                const cellEffects = visualEffects.filter((effect) => effect.x === x && effect.y === y);
                const cellPopups = damagePopups.filter((popup) => popup.x === x && popup.y === y);
                const unitSeed = unit ? (x + 1) * 137 + (y + 1) * 83 + unit.id.length * 29 : 0;
                const unitIdleSide = unit ? (unitSeed % 3) - 1 : 0;
                const unitIdleTilt = unit ? (unitSeed % 2 === 0 ? -1 : 1) * (1 + (unitSeed % 3)) : 0;
                const unitDepth = unit ? y / Math.max(1, activeMap.length - 1) : 0.5;
                const unitDepthScale = unit
                  ? (unit.type === "boss" ? 0.94 : 0.84) + unitDepth * (unit.type === "boss" ? 0.22 : 0.24)
                  : 1;
                const unitShadowAlpha = unit ? 0.38 + unitDepth * 0.26 : 0.55;
                const unitFreeMotionStyle = unit ? {
                  "--unit-idle-delay": `${-(unitSeed % 1300)}ms`,
                  "--unit-idle-up": `${-(2 + (unitSeed % 3))}px`,
                  "--unit-idle-down": `${unitSeed % 2}px`,
                  "--unit-idle-side": `${unitIdleSide}px`,
                  "--unit-idle-side-away": `${unitIdleSide * -1}px`,
                  "--unit-idle-tilt": `${unitIdleTilt}deg`,
                  "--unit-idle-tilt-away": `${unitIdleTilt * -1}deg`,
                  "--unit-idle-tilt-soft": `${unitIdleTilt * -0.65}deg`,
                  "--unit-depth": unitDepth.toFixed(3),
                  "--unit-depth-scale": unitDepthScale.toFixed(3),
                  "--unit-shadow-alpha": unitShadowAlpha.toFixed(3),
                  "--unit-ground-y": `${Math.round(2 + unitDepth * 5)}px`,
                  "--unit-z": `${Math.round((unit.type === "boss" ? 64 : 56) + unitDepth * 18)}`,
                } : undefined;
                const isMovingUnit =
                  unit && (movingUnit?.id === unit.id || movingUnit?.unit?.id === unit.id);
                const movingUnitStartsHere =
                  movingUnit && movingUnit.from.x === x && movingUnit.from.y === y;
                const movingOverlayClassName = isMovingUnit ? "moving-overlay-hidden" : "";
                const terrainClassName = [
                  "tile",
                  tile,
                  "terrain-rich-tile",
                  `terrain-${tile}`,
                  getTerrainVariantClassName(x, y),
                  getTerrainEdgeClassNames(activeMap, x, y, tile),
                  movable ? "movable-tile-cell" : "",
                ].filter(Boolean).join(" ");
                return (
                  <div
                    className={terrainClassName}
                    key={`${x}-${y}`}
                    title={getInspectTerrainLabel(tile)}
                    style={getTerrainVisualStyle(tile, x, y)}
                    onClick={() => {
                      if (suppressBattleMapClickRef.current) {
                        suppressBattleMapClickRef.current = false;
                        return;
                      }

                      handleBattleTilePress(x, y);
                    }}>
                    <span className="terrain-decal terrain-decal-a" />
                    <span className="terrain-decal terrain-decal-b" />
                    <span className="terrain-decal terrain-decal-c" />
                    {danger && (
                      <div className={`danger-tile danger-${hazardInfo?.pattern || "wave"}`}>
                        <span>{hazardInfo?.damage || 6}</span>
                      </div>
                    )}
                    {aoePreview && <div className="aoe-preview-tile" />}
                    {cameraFocused && <div className="camera-focus-tile" />}
                    {cellEffects.map((effect) => (
                      <div
                        key={effect.id}
                        className={`combat-effect effect-${effect.type} ${effect.direction ? `effect-dir-${effect.direction}` : ""}`}
                      />
                    ))}
                    {cellPopups.map((popup) => (
                      <div
                        key={popup.id}
                        className={`damage-popup popup-${popup.kind}`}
                      >
                        {popup.text}
                      </div>
                    ))}
                    {movable && (
                      <div
                        className={`move-tile ${moveTileInfo?.stay ? "stay-move-tile" : ""} ${moveTileInfo?.traitBonus ? "trait-bonus-tile" : ""} ${moveTileInfo?.traitPenalty ? "trait-penalty-tile" : ""}`}
                        title={`${moveTileInfo?.label || "지형"} · 이동력 ${moveTileInfo?.cost}`}
                      >
                        <span className="move-cost-badge">
                          {moveTileInfo?.stay ? "제" : moveTileInfo?.cost}
                        </span>
                      </div>
                    )}
                    {movingUnitStartsHere && (
                      <div
                        key={movingUnit.frame}
                        className={`map-moving-unit tile-moving-unit moving-${movingUnit.direction || "down"} ${
                          movingUnit.unit.type === "ally"
                            ? "ally-moving"
                            : movingUnit.unit.type === "boss"
                            ? "boss-moving"
                            : "enemy-moving"
                        }`}
                        style={{
                          "--from-x": 0,
                          "--from-y": 0,
                          "--cols": 1,
                          "--rows": 1,
                          "--dx": movingUnit.to.x - movingUnit.from.x,
                          "--dy": movingUnit.to.y - movingUnit.from.y,
                          "--move-duration": `${movingUnit.duration || 460}ms`,
                          "--unit-depth": `${(movingUnit.from.y / Math.max(1, activeMap.length - 1)).toFixed(3)}`,
                          "--unit-depth-scale": `${(
                            (movingUnit.unit.type === "boss" ? 0.94 : 0.84) +
                            (movingUnit.from.y / Math.max(1, activeMap.length - 1)) * (movingUnit.unit.type === "boss" ? 0.22 : 0.24)
                          ).toFixed(3)}`,
                          "--unit-shadow-alpha": `${(0.38 + (movingUnit.from.y / Math.max(1, activeMap.length - 1)) * 0.26).toFixed(3)}`,
                          "--unit-ground-y": `${Math.round(2 + (movingUnit.from.y / Math.max(1, activeMap.length - 1)) * 5)}px`,
                          "--unit-z": `${Math.round((movingUnit.unit.type === "boss" ? 64 : 56) + (movingUnit.from.y / Math.max(1, activeMap.length - 1)) * 18)}`,
                        }}
                      >
                        <span className="move-trail move-trail-a" />
                        <span className="move-trail move-trail-b" />
                        <span className="move-step-dust dust-a" />
                        <span className="move-step-dust dust-b" />
                        <span className="move-motion-ring" />
                        <img
                          src={getBattleMapUnitSprite(movingUnit.unit)}
                          alt={movingUnit.unit.name}
                          onError={(event) => handleBattleMapUnitImageError(event, movingUnit.unit)}
                        />
                        <span className="moving-unit-fallback">{movingUnit.unit.icon}</span>
                      </div>
                    )}
                    {attackable && (
                      <div className="attack-tile">
                        <span className="attack-target-mark">TARGET</span>
                      </div>
                    )}
                    {enemyThreat && !attackable && (
                      <div className="enemy-threat-tile" />
                    )}
                    {unit && !isMovingUnit && (
                      <>
                        <div
                          className={`unit sprite-unit ${unit.type === "ally" ? "ally-unit" : unit.type === "enemy" ? "enemy-unit" : "boss-unit"} ${!unitActionMotion ? "free-motion-unit" : ""} ${turn === "ally" && unit.type === "ally" && isUnitReady(unit) ? "ready-motion-unit" : ""} ${unit.maxHp && unit.hp / unit.maxHp <= 0.35 ? "wounded-motion-unit" : ""} ${isMovingUnit ? "moving-hidden moving-source-shadow" : ""} ${inspectedUnitId === unit.id ? "inspected-unit" : ""} ${selectedUnit === unit.id ? "selected-unit" : ""} ${unit.phase2 ? "phase2-unit" : ""} ${unit.acted ? "acted-unit" : ""} ${unit.hitFlash ? "hit-flash-unit" : ""} ${unitActionMotion ? `action-motion action-${unitActionMotion.type} action-dir-${unitActionMotion.direction}` : ""}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onPointerUp={(event) => event.stopPropagation()}
                          onClick={(event) => handleBattleUnitPress(event, unit)}
                          style={unitActionMotion ? {
                            ...unitFreeMotionStyle,
                            "--action-dx": unitActionMotion.dx,
                            "--action-dy": unitActionMotion.dy,
                            "--action-step-x": `${unitActionMotion.dx * 7}px`,
                            "--action-step-y": `${unitActionMotion.dy * 7}px`,
                            "--action-back-x": `${unitActionMotion.dx * -3}px`,
                            "--action-back-y": `${unitActionMotion.dy * -3}px`,
                            "--counter-ready-x": `${unitActionMotion.dx * -6}px`,
                            "--counter-ready-y": `${unitActionMotion.dy * -6}px`,
                            "--counter-strike-x": `${unitActionMotion.dx * 9}px`,
                            "--counter-strike-y": `${unitActionMotion.dy * 9}px`,
                            "--assist-step-x": `${unitActionMotion.dx * 7}px`,
                            "--assist-step-y": `${unitActionMotion.dy * 7}px`,
                            "--miss-step-x": `${unitActionMotion.dx * 8}px`,
                            "--miss-step-y": `${unitActionMotion.dy * 8}px`,
                            "--miss-back-x": `${unitActionMotion.dx * -7}px`,
                            "--miss-back-y": `${unitActionMotion.dy * -7}px`,
                            "--action-duration": `${unitActionMotion.duration}ms`,
                          } : unitFreeMotionStyle}
                        >
                          {unitActionMotion && (
                            <>
                              <span className={`unit-action-burst burst-${unitActionMotion.motionKey || "sword"}`} />
                              <span className={`unit-action-weapon weapon-${unitActionMotion.motionKey || "sword"} weapon-dir-${unitActionMotion.direction || "right"}`} />
                            </>
                          )}
                          <img src={getBattleMapUnitSprite(unit)} alt={unit.name} onError={(event) => handleBattleMapUnitImageError(event, unit)} />
                          <span className="unit-emoji-fallback">{unit.icon}</span>
                          <span className={`unit-map-marker ${unit.type === "ally" ? "unit-map-ally" : unit.type === "boss" ? "unit-map-boss" : "unit-map-enemy"}`}>
                            {unit.type === "ally" ? "A" : unit.type === "boss" ? "B" : "E"}
                          </span>
                        </div>
                        <div className={`map-hp-strip ${unit.type === "ally" ? "hp-ally" : unit.type === "boss" ? "hp-boss" : "hp-enemy"} ${movingOverlayClassName}`}>
                          <span style={{ width: `${unit.maxHp ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)) : 0}%` }} />
                        </div>
                        {unit.type !== "ally" && (
                          <div className={`enemy-hp-peek ${movingOverlayClassName}`}>{unit.hp}</div>
                        )}
                        {unit.skillCooldown > 0 && (
                          <div className={`skill-cd-badge ${movingOverlayClassName}`}>CD {unit.skillCooldown}</div>
                        )}
                        {unit.supportUsed && (
                          <div className={`assist-used-badge ${movingOverlayClassName}`}>협</div>
                        )}
                        {unit.status && unit.status.length > 0 && (
                          <div className={`status-badges ${movingOverlayClassName}`}>
                            {unit.status.map((s) => (
                              <span key={s.type}>{STATUS_INFO[s.type]?.icon || "•"}</span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
          </div>

          <div className="mini-map-panel">
            <div className="mini-map-head">
              <strong>전장 미니맵</strong>
              <span>{activeMap[0].length}x{activeMap.length} · 아군 {alliesAlive.length} / 적 {enemiesAlive.length}</span>
            </div>
            <div
              className="mini-map-grid"
              style={{
                gridTemplateColumns: `repeat(${activeMap[0].length}, minmax(0, 1fr))`,
              }}
            >
              {activeMap.flatMap((row, y) =>
                row.map((tile, x) => {
                  const miniUnit = units.find((unit) => unit.x === x && unit.y === y);
                  const miniHazard = hazards.some((hazard) => hazard.x === x && hazard.y === y);
                  const miniSelected = miniUnit && (miniUnit.id === selectedUnit || miniUnit.id === inspectedUnitId);
                  const miniMoveInfo =
                    turn === "ally" && mode === "move" && selectedUnit
                      ? moveTiles.find((moveTile) => moveTile.x === x && moveTile.y === y)
                      : null;
                  const miniStayMove = Boolean(miniMoveInfo) && miniUnit?.id === selectedUnit;
                  const miniMovable = Boolean(miniMoveInfo) && (!miniUnit || miniStayMove);

                  return (
                    <button
                      key={`mini-${x}-${y}`}
                      type="button"
                      className={`mini-map-cell mini-${tile} ${
                        miniUnit
                          ? miniUnit.type === "ally"
                            ? "mini-ally"
                            : miniUnit.type === "boss"
                            ? "mini-boss"
                            : "mini-enemy"
                          : ""
                      } ${miniHazard ? "mini-hazard" : ""} ${miniSelected ? "mini-selected" : ""} ${miniMovable ? "mini-move" : ""}`}
                      onClick={() => {
                        if (miniMovable) {
                          void moveSelectedUnitTo(x, y, miniMoveInfo);
                          return;
                        }

                        if (mapZoom === "fit") setMapZoom("large");

                        setTimeout(() => scrollBattleMapToCell(x, y, "smooth"), 80);

                        if (miniUnit?.type === "ally" && turn === "ally" && !miniUnit.acted) {
                          selectBattleAllyForAction(miniUnit, "미니맵에서 선택됨");
                        } else if (miniUnit) {
                          inspectBattleUnit(miniUnit, miniUnit.type === "ally" ? "미니맵 아군 확인" : "미니맵 확인");
                        } else {
                          setLogs((p) => [`미니맵 위치 이동: (${x + 1}, ${y + 1})`, ...p]);
                        }
                      }}
                      aria-label={miniMovable ? `${x + 1},${y + 1} 이동 가능` : miniUnit ? `${miniUnit.name} 위치` : `${x},${y}`}
                    >
                      {miniUnit && (
                        <span className={`mini-unit-portrait ${miniUnit.type === "ally" ? "mini-unit-ally" : miniUnit.type === "boss" ? "mini-unit-boss" : "mini-unit-enemy"}`}>
                          <img
                            src={getBattleMapUnitSprite(miniUnit)}
                            alt={miniUnit.name}
                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                          />
                          <em>{miniUnit.icon || (miniUnit.type === "ally" ? "🛡️" : miniUnit.type === "boss" ? "👹" : "⚔️")}</em>
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <div className="mini-map-legend">
              <span className="legend-ally">아군</span>
              <span className="legend-move">이동</span>
              <span className="legend-enemy">적</span>
              <span className="legend-boss">보스</span>
              <span className="legend-hazard">위험</span>
            </div>
          </div>

          <div className="squad-command-panel">
            <div className="squad-command-head">
              <strong>부대 명령</strong>
              <span>
                행동 가능 {units.filter(isUnitReady).length}명 · 전열 {getReadyCountByRole("front")} / 후열 {getReadyCountByRole("rear")} / 지원 {getReadyCountByRole("support")}
              </span>
            </div>
            <div className="squad-command-grid">
              <button onClick={() => selectNextReadyAlly()}>
                다음 유닛
              </button>
              <button onClick={() => selectNextReadyAlly("front")}>
                전열 선택
              </button>
              <button onClick={() => selectNextReadyAlly("rear")}>
                후열 선택
              </button>
              <button onClick={commandSupportFocus}>
                지원 집중
              </button>
              <button onClick={commandGuardSquad}>
                전열 수호
              </button>
              <button onClick={commandRecommendedAttack}>
                추천 공격
              </button>
              <button onClick={commandAutoAdvance}>
                자동 접근
              </button>
              <button onClick={commandAutoBattleTurn}>
                턴 위임
              </button>
              <button
                className={autoBattleEnabled ? "active-auto-delegate-btn" : ""}
                onClick={toggleAutoBattleDelegate}
              >
                자동 위임 {autoBattleEnabled ? "ON" : "OFF"}
              </button>
              <button onClick={cycleAutoBattleMode}>
                전략 {autoBattleModeConfig.label}
              </button>
              <button className="danger-squad-btn" onClick={commandAllWait}>
                전원 대기
              </button>
            </div>
          </div>

          {!battle && (
          <div className={`unit-info ${viewedUnit && viewedUnit.type !== "ally" ? "enemy-inspect-info" : ""}`}>
            <div className="portrait image-portrait">
              {viewedUnit ? (
                <img src={getUnitPortrait(viewedUnit)} alt={viewedUnit.name} onError={(event) => { event.currentTarget.style.display = "none"; }} />
              ) : (
                "?"
              )}
            </div>
            <div className="unit-text">
              <div className="unit-name">
                {viewedUnit
                  ? `${viewedUnit.name}${viewedUnit.type === "ally" ? ` Lv.${viewedUnit.level || "-"}` : ""}`
                  : "유닛 선택"}
              </div>

              {viewedUnit ? (
                <>
                  <div className="inspect-badge-row">
                    <span className={`inspect-badge inspect-${viewedUnit.type}`}>
                      {getInspectUnitKind(viewedUnit)}
                    </span>
                    <span className="inspect-badge">
                      {getInspectUnitRole(viewedUnit)}
                    </span>
                    <span className="inspect-badge">
                      {getCombatClassLabel(getUnitCombatClass(viewedUnit))} 타입
                    </span>
                    {viewedUnit.type === "ally" && (
                      <span className="inspect-badge passive-badge">
                        {getUnitPassiveDef(viewedUnit).name}
                      </span>
                    )}
                  </div>

                  <div className="unit-class">
                    {viewedUnit.type === "ally"
                      ? `${viewedUnit.skill} · 스킬 ${viewedSkillCooldown > 0 ? `${viewedSkillCooldown}턴` : "가능"} · 협공 ${viewedUnit.supportUsed ? "사용" : "대기"} · 이동 ${viewedUnit.move} · ${getUnitMoveTrait(viewedUnit).name} · EXP ${viewedUnit.exp || 0} · 상태 ${getStatusText(viewedUnit.status)}`
                      : `${viewedUnit.skill || "기본 공격"} · AI ${getInspectUnitRole(viewedUnit)} · 사거리 ${viewedUnit.range || 1} / 스킬 ${viewedUnit.skillRange || viewedUnit.range || 1} · 상태 ${getStatusText(viewedUnit.status)}`}
                  </div>

                  <div className="hp-bar">
                    <div
                      className={`hp-fill ${viewedUnit.type === "boss" ? "hp-fill-boss" : viewedUnit.type === "ally" ? "hp-fill-ally" : "hp-fill-enemy"}`}
                      style={{ width: `${viewedHpRate}%` }}
                    />
                  </div>
                  <div className="hp-text">
                    HP {viewedUnit.hp} / {viewedUnit.maxHp}
                  </div>

                  <div className="inspect-stat-grid">
                    <div><span>공격</span><strong>{viewedUnit.atk}</strong></div>
                    <div><span>방어</span><strong>{viewedUnit.def}</strong></div>
                    <div><span>이동</span><strong>{viewedUnit.move}</strong></div>
                    <div><span>사거리</span><strong>{viewedUnit.range || 1}</strong></div>
                    <div><span>지형</span><strong>{getInspectTerrainLabel(viewedTerrain)}</strong></div>
                    <div><span>좌표</span><strong>{viewedUnit.x + 1},{viewedUnit.y + 1}</strong></div>
                  </div>
                </>
              ) : (
                <div className="unit-class">아군 또는 적을 눌러 정보를 확인하세요.</div>
              )}
            </div>
          </div>
          )}
          {!battle && showPostMoveCommandMenu && (
          <div className="action-panel post-move-action-panel">
            <button
              className="undo-move-action"
              disabled={!canUndoMove || turnBusy || !!movingUnit || !!result || !selected || selected.acted}
              onClick={undoSelectedMove}
            >
              이동 취소
            </button>
            <button className={mode === "attack" ? "active-action" : ""} disabled={turnBusy || !!movingUnit || !!result || !selected || selected.acted} onClick={() => setBattleModeFromMobile("attack")}>공격</button>
            <button
              className={selectedSkillCooldown > 0 ? "skill-action-btn cooldown" : "skill-action-btn"}
              disabled={turnBusy || !!movingUnit || !!result || !selected || selected.acted}
              onClick={activateSkill}
            >
              {selectedSkillCooldown > 0 ? `스킬 ${selectedSkillCooldown}` : "스킬"}
            </button>
            <button disabled={turnBusy || !!movingUnit || !!result || !selected || selected.acted} onClick={openItem}>아이템</button>
            <button disabled={turnBusy || !!movingUnit || !!result || !selected || selected.acted} onClick={waitUnit}>대기</button>
          </div>
          )}
          {!battle && (
          <div className={`cinematic-command-bar ${canUndoMove ? "has-undo" : ""}`}>
            {canUndoMove && (
              <button className="cmd-undo" disabled={turnBusy || !!movingUnit || !!result} onClick={undoSelectedMove}>
                취소
              </button>
            )}
            <button
              className="cmd-attack"
              disabled={!selected || selected.acted || turn !== "ally" || turnBusy || !!movingUnit || !!result}
              onClick={() => setBattleModeFromMobile("attack")}
            >
              공격
            </button>
            <button
              className="cmd-skill"
              disabled={!selected || selected.acted || selectedSkillCooldown > 0 || turn !== "ally" || turnBusy || !!movingUnit || !!result}
              onClick={activateSkill}
            >
              {selectedSkillCooldown > 0 ? `스킬 ${selectedSkillCooldown}` : "스킬"}
            </button>
            <button
              className="cmd-item"
              disabled={!selected || selected.acted || turn !== "ally" || turnBusy || !!movingUnit || !!result}
              onClick={openItem}
            >
              아이템
            </button>
            <button
              className="cmd-wait"
              disabled={!selected || selected.acted || turn !== "ally" || turnBusy || !!movingUnit || !!result}
              onClick={waitUnit}
            >
              대기
            </button>
          </div>
          )}
          {battleCompact && logs[0] && (
            <div className="simple-battle-log">
              {logs[0]}
            </div>
          )}
          <div className="battle-log-panel">
            <div className="battle-log-head">
              <strong>전투 로그</strong>
              <span>{visibleBattleLogs.length}/{logs.length} 표시</span>
            </div>
            <div className="battle-log-filter-row">
              {LOG_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  className={logFilter === filter.id ? "selected" : ""}
                  onClick={() => setLogFilter(filter.id)}
                >
                  {filter.label}
                  <span>{logFilterCounts[filter.id] || 0}</span>
                </button>
              ))}
            </div>
            <div className="battle-log">
              {visibleBattleLogs.length ? (
                visibleBattleLogs.map((log, i) => (
                  <div
                    key={`${i}-${String(log).slice(0, 16)}`}
                    className={`log-line log-${getLogType(log)} log-category-${getLogCategory(log)} ${i === 0 ? "latest-log" : ""} ${isImportantLog(log) ? "important-log" : ""}`}
                  >
                    <span className="log-icon">{getLogIcon(log)}</span>
                    <span className="log-text">{renderLogText(log)}</span>
                  </div>
                ))
              ) : (
                <div className="log-empty">이 필터에 표시할 로그가 없습니다.</div>
              )}
            </div>
          </div>
          {battle && !battleResolving && !combatCutscene && (
            <div className="battle-modal vs-preview-modal">
              <div
                className={`battle-card vs-preview-card compact-vs-preview-card vs-preview-${battle.mode === "skill" ? "skill" : "attack"} vs-motion-${getUnitWeaponMotionKey(battle.attacker, battle, { hit: true, damage: battle.damage })}`}
              >
                <div className="battle-title vs-preview-title">
                  <span>{battle.mode === "skill" ? "SKILL" : "ATTACK"}</span>
                  <strong>{battle.mode === "skill" ? battle.attacker.skill : "전투 예측"}</strong>
                </div>
                <div className="battle-vs">
                  <span className="vs-preview-speed-lines" />
                  <span className="vs-preview-impact" />
                  <span className="vs-preview-slash" />
                  <span className="vs-preview-spell" />
                  <div className="vs-preview-clash-copy">
                    <span>{battle.mode === "skill" ? "SPECIAL CLASH" : "WEAPON CLASH"}</span>
                    <strong>{battle.damage} DAMAGE</strong>
                  </div>
                  <div className="vs-preview-side vs-preview-attacker">
                    <div className="battle-icon image-battle-icon ally-unit">
                      <img src={getCutsceneUnitSprite(battle.attacker)} alt={battle.attacker.name} />
                    </div>
                    <div className="battle-name">{battle.attacker.name}</div>
                    <div className="vs-preview-unit-role">{getCombatClassLabel(getUnitCombatClass(battle.attacker))} · {getInspectUnitRole(battle.attacker)}</div>
                    <div className="vs-preview-hp-line">
                      <span>HP</span>
                      <strong>{battle.attacker.hp}/{battle.attacker.maxHp}</strong>
                    </div>
                    <div className="vs-preview-hp-bar">
                      <i style={{ width: `${Math.max(0, Math.min(100, Math.round((battle.attacker.hp / Math.max(1, battle.attacker.maxHp)) * 100)))}%` }} />
                    </div>
                  </div>
                  <div className="vs">VS</div>
                  <div className="vs-preview-side vs-preview-defender">
                    <div className="battle-icon image-battle-icon enemy-unit">
                      <img src={getCutsceneUnitSprite(battle.defender)} alt={battle.defender.name} />
                    </div>
                    <div className="battle-name">{battle.defender.name}</div>
                    <div className="vs-preview-unit-role">{getCombatClassLabel(getUnitCombatClass(battle.defender))} · {getInspectUnitRole(battle.defender)}</div>
                    <div className="vs-preview-hp-line">
                      <span>HP</span>
                      <strong>{Math.max(0, battle.defender.hp - battle.damage)}/{battle.defender.maxHp}</strong>
                    </div>
                    <div className="vs-preview-hp-bar enemy">
                      <i style={{ width: `${Math.max(0, Math.min(100, Math.round(((battle.defender.hp - battle.damage) / Math.max(1, battle.defender.maxHp)) * 100)))}%` }} />
                    </div>
                  </div>
                </div>
                <div className="battle-stats compact-battle-stats">
                  <div>피해 <strong>{battle.damage}</strong></div>
                  <div>명중 <strong>{battle.hit}%</strong></div>
                  <div>치명 <strong>{battle.crit}%</strong></div>
                  <div>
                    대상 HP <strong>{battle.defender.hp}→{Math.max(0, battle.defender.hp - battle.damage)} / {battle.defender.maxHp}</strong>
                  </div>
                  {battle.mode === "skill" && battle.attacker.type === "ally" && (
                    <div>
                      쿨다운 <strong>{getSkillCooldownTurns(battle.attacker)}턴</strong>
                    </div>
                  )}
                  {battle.aoeTargets?.length > 0 && (
                    <div>
                      광역 <strong>{battle.aoeTargets.length}명</strong>
                    </div>
                  )}
                  <div>
                    상성 <strong className={`affinity-text affinity-${battle.affinity?.state || "neutral"}`}>
                      {battle.affinity?.label || "보통"}
                    </strong>
                  </div>
                  {battle.assist && (
                    <div>협공 <strong>{battle.assist.damage}</strong></div>
                  )}
                  {battle.counter && (
                    <div>반격 <strong>{battle.counter.damage}</strong></div>
                  )}
                </div>
                <div className="battle-buttons">
                  <button onClick={() => { setBattleResolving(false); setBattle(null); }}>취소</button>
                  <button disabled={battleResolving || !!combatCutscene} onClick={resolveBattle}>{battle.mode === "skill" ? "스킬 실행" : "공격 실행"}</button>
                </div>
              </div>
            </div>
          )}
          {itemOpen && (
            <div className="battle-modal">
              <div className="battle-card item-card">
                <div className="battle-title">아이템</div>
                <div className="result-sub">
                  사용할 아이템을 선택하세요. 아이템 사용 시 행동이 종료됩니다.
                </div>

                <div className="item-list">
                  {Object.values(ITEM_DEFS).map((item) => {
                    const count = getItemCount(inventory, item.id);

                    return (
                      <button
                        key={item.id}
                        disabled={count <= 0}
                        onClick={() => consumeBattleItem(item.id)}
                      >
                        <strong>{item.name}</strong>
                        <span>{item.desc}</span>
                        <b>{count}개</b>
                      </button>
                    );
                  })}
                </div>

                <button className="result-btn second" onClick={() => setItemOpen(false)}>
                  취소
                </button>
              </div>
            </div>
          )}
          {result === "victory" && (
            <div className="battle-modal">
              <div className="result-card">
                <div className="result-title">VICTORY</div>
                <div className="result-sub">전투에서 승리했습니다.</div>
                {lastClearSummary && (
                  <div className={`clear-rank-card rank-${lastClearSummary.rank}`}>
                    <div className="clear-rank-letter">{lastClearSummary.rank}</div>
                    <div>
                      <strong>{getClearRankText(lastClearSummary.rank)}</strong>
                      <span>
                        {lastClearSummary.round}라운드 · 카일 HP {lastClearSummary.heroHp}/{lastClearSummary.heroMaxHp} · 생존 {lastClearSummary.aliveAllies}명
                      </span>
                    </div>
                  </div>
                )}
                {lastClearSummary?.missionOrder && (
                  <div className="mission-result-card">
                    <div className="mission-result-title">주 작전 완료</div>
                    <strong>{lastClearSummary.missionOrder.title}</strong>
                    <span>{lastClearSummary.missionOrder.desc}</span>
                  </div>
                )}
                {lastClearSummary?.tacticalGoals && (
                  <div className="bonus-goal-card">
                    <div className="bonus-goal-title">전술 목표</div>
                    {lastClearSummary.tacticalGoals.map((goal) => (
                      <div
                        className={`bonus-goal-row ${goal.met ? "goal-met" : "goal-failed"}`}
                        key={goal.id}
                      >
                        <span>{goal.met ? "✓" : "×"}</span>
                        <div>
                          <strong>{goal.title}</strong>
                          <small>
                            {goal.desc} · 보상 {goal.reward.gold || 0}G
                            {goal.reward.potion ? ` / 회복약 ${goal.reward.potion}` : ""}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {battleMvp && (
                  <div className="mvp-card">
                    <div className="mvp-title">MVP</div>
                    <div className="mvp-main">
                      <img src={getUnitPortrait(battleMvp.unit)} alt={battleMvp.unit.name} />
                      <div>
                        <strong>{battleMvp.unit.name}</strong>
                        <span>
                          점수 {Math.round(battleMvp.score)} · 피해 {battleMvp.stats.damageDealt} · 회복 {battleMvp.stats.healingDone} · 처치 {battleMvp.stats.kills}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="battle-stats-card">
                  <div className="battle-stats-title">전투 통계</div>
                  <div className="battle-stats-grid">
                    <div><span>가한 피해</span><strong>{battleStats.damageDealt}</strong></div>
                    <div><span>받은 피해</span><strong>{battleStats.damageTaken}</strong></div>
                    <div><span>회복량</span><strong>{battleStats.healingDone}</strong></div>
                    <div><span>처치</span><strong>{battleStats.kills}</strong></div>
                    <div><span>협공</span><strong>{battleStats.assists}</strong></div>
                    <div><span>전리품</span><strong>{battleStats.lootDrops}</strong></div>
                  </div>

                  {topBattleUnits.length > 0 && (
                    <div className="battle-top-units">
                      {topBattleUnits.map((entry, index) => (
                        <div key={entry.unitId}>
                          <span>{index + 1}</span>
                          <strong>{entry.unit.name}</strong>
                          <small>
                            피해 {entry.stats.damageDealt} · 회복 {entry.stats.healingDone} · 처치 {entry.stats.kills}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {!isLootEmpty(battleLoot) && (
                  <div className="loot-card">
                    <div className="loot-title">전리품</div>
                    <div className="loot-line">{formatLoot(battleLoot)}</div>
                  </div>
                )}
                <div className="reward-box">
                  <div>획득 골드: {selectedStage?.reward?.gold || 500}G</div>
                  <div>획득 아이템: 회복약 x{selectedStage?.reward?.potion || 2}</div>
                  {selectedStage?.reward?.gear && (
                    <div>
                      장비 보상:{" "}
                      {selectedStage.reward.gear
                        .map((gearId) => EQUIPMENT[gearId]?.name || gearId)
                        .join(", ")}
                    </div>
                  )}
                  <div>숨겨진 조건: 미달성</div>
                </div>
                <button className="result-btn" onClick={goCamp}>캠프로 이동</button>
              </div>
            </div>
          )}
          {result === "defeat" && (
            <div className="battle-modal">
              <div className="result-card defeat-card">
                <div className="result-title defeat-title">DEFEAT</div>
                <div className="result-sub">카일이 쓰러졌습니다.</div>
                <div className="reward-box"><div>실패 원인: 주인공 사망</div><div>체크포인트: 없음</div></div>
                <button className="result-btn" onClick={() => beginStageBattle(selectedStage)}>재도전</button>
                <button className="result-btn second" onClick={() => setScreen("campaign")}>캠페인으로</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
