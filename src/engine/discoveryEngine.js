import { DISCOVERIES, DISCOVERY_TECHNIQUES, SECRET_PROMOTIONS } from '../data/discoveries.js';
import { isTerrainBlocked } from './movement.js';
import { applyEquipmentStats } from './partyEngine.js';

const cellKey = (x, y) => `${x},${y}`;
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Keep in sync with App's ordinary promotion; route-equivalence tests cover this contract.
const ORDINARY_PROMOTION_BONUSES = Object.freeze({ hp: 5, atk: 2, def: 2, skillBonus: 1 });

function uniqueIds(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((id) => typeof id === 'string' && id.trim().length > 0))]
    : [];
}

/** Normalize saved exploration without restoring spent relics from claimed IDs. */
export function normalizeExploration(raw) {
  return {
    claimed: uniqueIds(raw?.claimed),
    relics: uniqueIds(raw?.relics),
    techniques: uniqueIds(raw?.techniques),
  };
}

/** Use the active expanded map and selectedStage.units, never moving battle units. */
export function getStageDiscoveries(stageId, map, initialUnits = []) {
  const authored = DISCOVERIES.filter((entry) => entry.stageId === Number(stageId));
  if (!authored.length || !Array.isArray(map) || !Array.isArray(initialUnits)) return [];

  const isPassable = (x, y) => Number.isInteger(x) && Number.isInteger(y)
    && typeof map[y]?.[x] === 'string' && !isTerrainBlocked(map[y][x]);
  const occupied = new Set(initialUnits.filter(Boolean).map((unit) => cellKey(unit.x, unit.y)));
  const visited = new Set();
  const reachable = [];
  const spawns = initialUnits.filter((unit) => unit?.type === 'ally' && unit.hp > 0 && isPassable(unit.x, unit.y))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // Multi-source BFS excludes occupied routes as well as occupied destinations.
  for (const spawn of spawns) {
    const key = cellKey(spawn.x, spawn.y);
    if (visited.has(key)) continue;
    visited.add(key);
    reachable.push({ x: spawn.x, y: spawn.y, distance: 0 });
  }
  for (let index = 0; index < reachable.length; index += 1) {
    const cell = reachable[index];
    for (const [dx, dy] of directions) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      const key = cellKey(x, y);
      if (!isPassable(x, y) || visited.has(key) || occupied.has(key)) continue;
      visited.add(key);
      reachable.push({ x, y, distance: cell.distance + 1 });
    }
  }

  const candidates = reachable.filter(({ x, y }) => !occupied.has(cellKey(x, y)));
  if (!candidates.length) return [];
  const maxDistance = candidates.reduce((max, cell) => Math.max(max, cell.distance), 0);
  const width = map.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const entries = [];

  for (const entry of authored) {
    const targetDistance = Math.max(1, Math.round(maxDistance * entry.placement.depth));
    const targetX = (width - 1) * entry.placement.side;
    const cell = candidates.filter(({ x, y }) => !occupied.has(cellKey(x, y)))
      .sort((a, b) => Math.abs(a.distance - targetDistance) - Math.abs(b.distance - targetDistance)
        || Math.abs(a.x - targetX) - Math.abs(b.x - targetX)
        || a.y - b.y || a.x - b.x)[0];
    if (!cell) break;
    occupied.add(cellKey(cell.x, cell.y));
    entries.push({
      id: entry.id, stageId: entry.stageId, x: cell.x, y: cell.y,
      title: entry.title, hint: entry.hint, kind: entry.kind, reward: { ...entry.reward },
    });
  }
  return entries;
}

/** Proximity reveal is derived from live units; it never relocates or claims entries. */
export function getVisibleDiscoveries(entries, liveUnits, progress, radius = 2) {
  if (!Array.isArray(entries) || !Array.isArray(liveUnits) || !Number.isFinite(radius) || radius < 0) return [];
  const claimed = new Set(normalizeExploration(progress).claimed);
  return entries.filter((entry) => entry && Number.isInteger(entry.x) && Number.isInteger(entry.y)
    && !claimed.has(entry.id) && liveUnits.some((unit) => unit?.type === 'ally' && unit.hp > 0
      && Number.isInteger(unit.x) && Number.isInteger(unit.y)
      && Math.abs(unit.x - entry.x) + Math.abs(unit.y - entry.y) <= radius));
}

/** Persist IDs only; the parent skill catalogue resolves their combat specs. */
export function applyDiscoveryUnlocks(unit, progress) {
  if (!unit || unit.type !== 'ally') return unit;
  const promotion = Object.hasOwn(SECRET_PROMOTIONS, unit.id) ? SECRET_PROMOTIONS[unit.id] : null;
  const secretPromotion = promotion && unit.secretClass === promotion.secretClass ? promotion : null;
  const unlocked = [...normalizeExploration(progress).techniques, ...(secretPromotion ? [secretPromotion.techniqueId] : [])].filter((id) =>
    Object.hasOwn(DISCOVERY_TECHNIQUES, id) && DISCOVERY_TECHNIQUES[id].unitId === unit.id);
  if (!unlocked.length) return unit;
  return {
    ...unit,
    ...(secretPromotion ? { classTitle: secretPromotion.classTitle } : {}),
    learnedTechniques: uniqueIds([...uniqueIds(unit.learnedTechniques), ...unlocked]),
  };
}

/** A living ally must occupy the entry; only a successful first claim returns a reward. */
export function claimDiscovery(progress, entry, unit) {
  const nextProgress = normalizeExploration(progress);
  const discovery = DISCOVERIES.find((candidate) => candidate.id === entry?.id
    && candidate.stageId === Number(entry?.stageId));
  const reject = (message) => ({ progress: nextProgress, unit, message, reward: null });
  if (!discovery) return reject('발견 정보를 확인할 수 없습니다.');
  if (nextProgress.claimed.includes(discovery.id)) return reject('이미 조사를 마친 발견입니다.');
  if (!unit || unit.type !== 'ally' || !(unit.hp > 0)) return reject('생존한 아군만 조사할 수 있습니다.');
  if (!Number.isInteger(entry.x) || !Number.isInteger(entry.y) || entry.x < 0 || entry.y < 0
    || unit.x !== entry.x || unit.y !== entry.y) return reject('발견 지점으로 이동해야 조사할 수 있습니다.');

  // Read rewards from authored data, never from a stale or modified map entry.
  const reward = { ...discovery.reward };
  nextProgress.claimed.push(discovery.id);
  if (reward.relicId) nextProgress.relics = uniqueIds([...nextProgress.relics, reward.relicId]);
  if (reward.techniqueId) nextProgress.techniques = uniqueIds([...nextProgress.techniques, reward.techniqueId]);
  const detail = reward.xp ? `경험치 +${reward.xp}`
    : reward.techniqueId ? `${DISCOVERY_TECHNIQUES[reward.techniqueId].name} 해금`
      : `${SECRET_PROMOTIONS[reward.unitId].classTitle} 유물 획득 (전직 조건: ${SECRET_PROMOTIONS[reward.unitId].requiredLevel}레벨 이상)`;
  return {
    progress: nextProgress,
    unit: applyDiscoveryUnlocks(unit, nextProgress),
    message: `${discovery.title}: ${detail}.`,
    reward,
  };
}

/** Bonuses are this unit's actual delta, including any missing ordinary promotion. */
export function getSecretPromotion(unit, progress) {
  if (!unit || unit.type !== 'ally' || !Object.hasOwn(SECRET_PROMOTIONS, unit.id)) return null;
  const promotion = SECRET_PROMOTIONS[unit.id];
  const bonuses = { ...promotion.bonuses, skillBonus: 0 };
  for (const [stat, ordinaryBonus] of Object.entries(ORDINARY_PROMOTION_BONUSES)) {
    bonuses[stat] = unit.secretClass ? 0 : bonuses[stat] + (unit.promoted ? 0 : ordinaryBonus);
  }
  return {
    ...promotion,
    bonuses,
    hasRelic: normalizeExploration(progress).relics.includes(promotion.relicId),
  };
}

export function canSecretPromote(unit, progress) {
  const promotion = getSecretPromotion(unit, progress);
  if (!promotion) return { ok: false, reason: '이 동료는 비밀 전직을 할 수 없습니다.' };
  if (unit.secretClass) return { ok: false, reason: '이미 비밀 전직을 마쳤습니다.' };
  if (!Number.isFinite(Number(unit.level)) || Number(unit.level) < promotion.requiredLevel) {
    return { ok: false, reason: `${promotion.requiredLevel}레벨 이상이 필요합니다.` };
  }
  if (!promotion.hasRelic) return { ok: false, reason: `${promotion.classTitle} 유물이 필요합니다.` };
  return { ok: true, reason: `${promotion.classTitle} 전직이 가능합니다.` };
}

/** Both promotion routes receive ordinary and secret bonuses exactly once. */
export function applySecretPromotion(unit, progress) {
  const nextProgress = normalizeExploration(progress);
  const check = canSecretPromote(unit, nextProgress);
  if (!check.ok) return { unit, progress: nextProgress, message: check.reason };

  const promotion = getSecretPromotion(unit, nextProgress);
  // Recover missing legacy bases without counting equipped gear or guard twice.
  const equipmentOnly = applyEquipmentStats({ ...unit, baseAtk: 0, baseDef: 0 });
  const baseAtk = unit.baseAtk ?? ((unit.atk ?? 0) - equipmentOnly.atk);
  const baseDef = unit.baseDef ?? ((unit.def ?? 0) - equipmentOnly.def);
  const maxHp = (unit.maxHp ?? unit.baseHP ?? unit.hp ?? 1) + promotion.bonuses.hp;
  const hp = unit.hp ?? unit.maxHp ?? unit.baseHP ?? 1;
  const promoted = applyEquipmentStats({
    ...unit,
    promoted: true,
    secretClass: promotion.secretClass,
    classTitle: promotion.classTitle,
    baseHP: maxHp,
    maxHp,
    hp: hp > 0 ? Math.min(maxHp, hp + promotion.bonuses.hp) : 0,
    baseAtk: baseAtk + promotion.bonuses.atk,
    baseDef: baseDef + promotion.bonuses.def,
    skillBonus: (unit.skillBonus || 0) + promotion.bonuses.skillBonus,
    ...(unit.promoted ? {} : { skillCooldown: 0 }),
  });
  nextProgress.relics = nextProgress.relics.filter((id) => id !== promotion.relicId);
  nextProgress.techniques = uniqueIds([...nextProgress.techniques, promotion.techniqueId]);
  return {
    unit: applyDiscoveryUnlocks(promoted, nextProgress),
    progress: nextProgress,
    message: `${unit.name || '동료'}: ${promotion.classTitle} 전직 완료. ${DISCOVERY_TECHNIQUES[promotion.techniqueId].name} 해금.`,
  };
}
