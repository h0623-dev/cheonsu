import { connectedGround } from './formations.js';
import { deploymentDepth, getBattlefieldPlan } from '../data/battlefieldPlans.js';

const MAX_DEPLOY_COUNT = 15;
const UNSAFE_IDS = new Set(['__proto__', 'prototype', 'constructor']);
const UNSAFE_TERRAIN = new Set(['fire', 'ice', 'dark', 'rune', 'trap', 'water', 'swamp']);
const key = ({ x, y }) => `${x},${y}`;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSafeId = id => typeof id === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id) && !UNSAFE_IDS.has(id);
const isPoint = value => isRecord(value) && Object.hasOwn(value, 'x') && Object.hasOwn(value, 'y')
  && Number.isInteger(value.x) && Number.isInteger(value.y)
  && value.x >= 0 && value.y >= 0 && value.x <= 127 && value.y <= 127;
const point = ({ x, y }) => ({ x, y });
const emptyDraft = stageId => ({ stageId, placements: {} });

/** Reuse the same connected ground, rear band and seven-cell separation as formations. */
export function getDeploymentCells(stage, actualFinalUnits = []) {
  const map = stage?.map;
  if (!Array.isArray(map) || !map.length || !Array.isArray(map[0]) || !map[0].length) return [];
  const height = map.length, width = map[0].length;
  if (!map.every(row => Array.isArray(row) && row.length === width && row.every(tile => typeof tile === 'string'))
    || !Array.isArray(actualFinalUnits)) return [];
  const enemies = actualFinalUnits.filter(unit => unit && unit.type !== 'ally');
  if (enemies.some(unit => !isPoint(unit))) return [];
  const direction = stage.terrainRevision >= 3 ? getBattlefieldPlan(stage.id).direction : 'south';
  return connectedGround(map).filter(cell => !UNSAFE_TERRAIN.has(map[cell.y][cell.x])
    && deploymentDepth(cell.x / Math.max(1, width - 1), cell.y / Math.max(1, height - 1), direction) >= .57
    && enemies.every(enemy => distance(cell, enemy) >= 7))
    .sort((a, b) => a.y - b.y || a.x - b.x).map(point);
}

/** Saved drafts are optional and never change live battle units during migration. */
export function sanitizeDeploymentDraft(raw, stageId) {
  const targetStageId = Number.isInteger(stageId) && stageId >= 1 && stageId <= 30 ? stageId : null;
  const result = emptyDraft(targetStageId);
  if (!targetStageId || !isRecord(raw) || !Object.hasOwn(raw, 'stageId') || raw.stageId !== targetStageId
    || !Object.hasOwn(raw, 'placements') || !isRecord(raw.placements)) return result;
  for (const [id, cell] of Object.entries(raw.placements)) {
    if (isSafeId(id) && isPoint(cell)) result.placements[id] = point(cell);
  }
  return result;
}

function allowedCellKeys(cells) {
  return new Set(Array.isArray(cells) ? cells.filter(isPoint).map(key) : []);
}

function currentCells(stage, units, suppliedCells) {
  const actual = getDeploymentCells(stage, units);
  if (suppliedCells == null) return actual;
  const supplied = allowedCellKeys(suppliedCells);
  return actual.filter(cell => supplied.has(key(cell)));
}

/** Keep valid manual choices before filling new members from their actual automatic positions. */
export function reconcileDeploymentPlacements(draft, stage, units, ids, cells) {
  const allies = new Map((Array.isArray(units) ? units : []).filter(unit => unit?.type === 'ally' && isSafeId(unit.id))
    .map(unit => [unit.id, unit]));
  const chosen = [...new Set((Array.isArray(ids) ? ids : []).filter(id => isSafeId(id) && allies.has(id)))];
  const available = currentCells(stage, units, cells);
  const allowed = allowedCellKeys(available), occupied = new Set(), placements = {};
  const saved = sanitizeDeploymentDraft(draft, stage?.id).placements;
  for (const id of chosen) {
    const cell = saved[id];
    if (!Object.hasOwn(saved, id) || !allowed.has(key(cell)) || occupied.has(key(cell))) continue;
    placements[id] = point(cell);
    occupied.add(key(cell));
  }
  for (const id of chosen) {
    if (Object.hasOwn(placements, id)) continue;
    const automatic = allies.get(id);
    if (!isPoint(automatic) || !allowed.has(key(automatic)) || occupied.has(key(automatic))) continue;
    placements[id] = point(automatic);
    occupied.add(key(automatic));
  }
  // Reserve other members' safe automatic cells before repairing a hazardous or occupied one.
  for (const id of chosen) {
    if (Object.hasOwn(placements, id)) continue;
    const automatic = allies.get(id);
    const free = available.filter(cell => !occupied.has(key(cell)));
    const selected = free.sort((a, b) => (isPoint(automatic) ? distance(a, automatic) - distance(b, automatic) : 0)
      || a.y - b.y || a.x - b.x)[0];
    if (!selected) continue;
    placements[id] = point(selected);
    occupied.add(key(selected));
  }
  return placements;
}

/** The optional owned IDs allow an unplaced ally to enter an empty cell. */
export function placeDeploymentUnit(placements, unitId, cell, cells, allowedIds) {
  const fail = reason => ({ ok: false, placements, reason });
  if (!isRecord(placements) || Object.entries(placements).some(([id, value]) => !isSafeId(id) || !isPoint(value))) {
    return fail('배치 정보를 다시 확인해 주세요.');
  }
  const owned = Array.isArray(allowedIds) ? allowedIds : allowedIds == null ? Object.keys(placements) : [];
  if (!isSafeId(unitId) || !owned.includes(unitId)) return fail('보유한 아군을 선택해 주세요.');
  if (Object.keys(placements).some(id => !owned.includes(id))) return fail('보유한 아군의 배치 정보를 확인해 주세요.');
  const allowed = allowedCellKeys(cells);
  if (!isPoint(cell) || !allowed.has(key(cell))) return fail('표시된 배치 가능 칸을 선택해 주세요.');
  const source = Object.hasOwn(placements, unitId) ? placements[unitId] : null;
  const occupant = Object.entries(placements).find(([id, value]) => id !== unitId && key(value) === key(cell));
  if (occupant && !source) return fail('빈 배치 칸을 선택해 주세요.');
  if (source && !allowed.has(key(source))) return fail('기존 배치 위치를 다시 확인해 주세요.');
  const next = Object.fromEntries(Object.entries(placements).map(([id, value]) => [id, point(value)]));
  next[unitId] = point(cell);
  if (occupant) next[occupant[0]] = point(source);
  return { ok: true, placements: next, reason: occupant ? '두 동료의 위치를 바꿨습니다.' : '배치 위치를 지정했습니다.' };
}

/** Validate again against the actual battlefield before entering the first turn. */
export function validateDeploymentPlacements(stage, units, ids, placements, cells) {
  const fail = reason => ({ ok: false, reason });
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_DEPLOY_COUNT) return fail('출전 인원은 1명 이상, 최대 15명입니다.');
  if (ids.some(id => !isSafeId(id)) || new Set(ids).size !== ids.length) return fail('출전 명단을 다시 확인해 주세요.');
  if (!ids.includes('hero')) return fail('카일을 반드시 출전시켜 주세요.');
  const actualUnits = Array.isArray(units) ? units : [];
  const allies = actualUnits.filter(unit => unit?.type === 'ally');
  if (ids.some(id => allies.filter(unit => unit.id === id).length !== 1)) return fail('보유한 아군만 출전할 수 있습니다.');
  if (!isRecord(placements) || Object.keys(placements).some(id => !isSafeId(id) || !ids.includes(id))) return fail('선택하지 않은 캐릭터의 배치가 포함되어 있습니다.');
  const allowed = allowedCellKeys(currentCells(stage, actualUnits, cells)), occupied = new Set();
  for (const id of ids) {
    if (!Object.hasOwn(placements, id) || !isPoint(placements[id])) return fail('모든 출전 캐릭터를 배치해 주세요.');
    const cell = placements[id], cellKey = key(cell);
    if (!allowed.has(cellKey)) return fail('배치 가능 범위 안에 동료를 배치해 주세요.');
    if (occupied.has(cellKey)) return fail('동료의 배치 위치가 겹칩니다.');
    occupied.add(cellKey);
  }
  return { ok: true, reason: '배치를 완료했습니다.' };
}

/** Only ally coordinates change; enemies, equipment, HP and action flags remain intact. */
export function applyDeploymentPlacements(units, placements) {
  return (Array.isArray(units) ? units : []).map(unit => {
    if (unit?.type !== 'ally' || !isSafeId(unit.id) || !isRecord(placements)
      || !Object.hasOwn(placements, unit.id) || !isPoint(placements[unit.id])) return unit;
    const cell = placements[unit.id];
    return unit.x === cell.x && unit.y === cell.y ? unit : { ...unit, x: cell.x, y: cell.y };
  });
}
