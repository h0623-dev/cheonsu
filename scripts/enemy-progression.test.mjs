import test from 'node:test';
import assert from 'node:assert/strict';
import { getStageEnemyLevel, withStageEnemyLevel } from '../src/engine/enemyProgression.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { getInitialParty } from '../src/engine/partyEngine.js';
import { stages } from '../src/data/stages.js';

test('campaign enemy levels follow the existing gradual HP growth rather than treating chapter 30 as level 30', () => {
  const anchors = [[1, 1], [2, 1], [3, 2], [6, 3], [10, 5], [12, 6], [18, 9], [24, 12], [30, 15]];
  for (const [chapter, level] of anchors) {
    assert.equal(getStageEnemyLevel(chapter), level);
    assert.equal(getStageEnemyLevel({ id: chapter }, { type: 'enemy' }), level);
    assert.equal(getStageEnemyLevel(chapter, { type: 'enemy', monsterRank: 'elite' }), level + 1);
    assert.equal(getStageEnemyLevel(chapter, { type: 'boss' }), level + 2);
  }
});

test('all 30 chapters have monotonic normal, elite and boss levels independent of difficulty and art names', () => {
  let previous = 0;
  for (const stage of stages) {
    const normal = withStageEnemyLevel({ id: 'enemy', type: 'enemy', name: '일반 적' }, stage);
    const elite = withStageEnemyLevel({ id: 'enemy', type: 'enemy', monsterRank: 'elite' }, stage);
    const boss = withStageEnemyLevel({ id: 'boss', type: 'boss' }, stage);
    assert.ok(normal.level >= previous && normal.level <= previous + 1);
    assert.equal(elite.level, normal.level + 1);
    assert.equal(boss.level, normal.level + 2);
    assert.equal(getStageEnemyLevel(stage, { type: 'enemy', name: '정예라는 이름만 가진 적' }), normal.level);
    previous = normal.level;
  }
});

test('missing enemy level is metadata only: damaged HP, stats, range, AI, equipment and statuses stay exact', () => {
  const unit = Object.freeze({
    id: 'reinforce-24-3-1', type: 'enemy', name: '증원 궁병', hp: 7, maxHp: 60,
    atk: 19, def: 9, baseMaxHp: 51, baseAtkDifficulty: 17, baseDefDifficulty: 8,
    difficultyApplied: 'hard:swarm', move: 2, range: 3, minRange: 3,
    skillRange: 3, skillMinRange: 3, skillBonus: 5, aiType: 'archer',
    status: Object.freeze([{ type: 'burn', turns: 1 }]),
    equipment: Object.freeze({ weapon: null, armor: null }),
    x: 5, y: 7, acted: true, moved: true, guard: false, isReinforcement: true,
  });
  const result = withStageEnemyLevel(unit, stages[23]);
  assert.equal(result.level, 12);
  const { level, ...rest } = result;
  assert.deepEqual(rest, unit);
  assert.notStrictEqual(result, unit);
  assert.strictEqual(result.status, unit.status);
  assert.strictEqual(result.equipment, unit.equipment);
  assert.equal(Object.hasOwn(unit, 'level'), false);
  assert.strictEqual(withStageEnemyLevel(result, stages[29]), result, 'an explicitly assigned level is never recalculated');
  assert.equal(withStageEnemyLevel({ ...unit, hp: 0 }, stages[23]).hp, 0, 'metadata cannot revive a defeated enemy');
});

test('allies, unrelated entities and existing explicit positive levels are preserved by reference', () => {
  for (const unit of [null, undefined, { type: 'ally', level: 9 }, { type: 'neutral' }, { hp: 4 }]) {
    assert.strictEqual(withStageEnemyLevel(unit, 30), unit);
  }
  for (const level of [1, 7, 100]) {
    const unit = Object.freeze({ type: 'boss', level, hp: 3, maxHp: 108 });
    assert.strictEqual(withStageEnemyLevel(unit, 1), unit);
  }
});

test('malformed stage and missing or invalid levels cannot produce NaN or an unbounded campaign label', () => {
  for (const stage of [undefined, null, NaN, Infinity, -5, 0, '30', {}, { id: Infinity }]) {
    assert.equal(getStageEnemyLevel(stage), 1);
  }
  assert.equal(getStageEnemyLevel(31), 15);
  assert.equal(getStageEnemyLevel({ id: 30.9 }, { type: 'boss' }), 17);
  for (const level of [undefined, null, 0, -1, 1.5, NaN, Infinity, '9']) {
    const result = withStageEnemyLevel({ id: 'boss', type: 'boss', level }, 12);
    assert.equal(result.level, 8);
  }
});

test('legacy live battles retain their enemy HP, original level absence, status and action progress when loaded', () => {
  const stage = structuredClone(stages[23]);
  const original = stage.units.find(unit => unit.type !== 'ally');
  const enemy = { ...original, hp: 3, maxHp: 57, atk: 21, def: 11, x: 3, y: 4,
    status: [{ type: 'freeze', turns: 1 }], acted: true, moved: true, guard: true,
    difficultyApplied: 'nightmare:bossRush', baseMaxHp: 40, baseAtkDifficulty: 16, baseDefDifficulty: 9 };
  delete enemy.level;
  const saved = { version: '1.99.160', screen: 'battle', selectedStage: stage,
    party: getInitialParty(), units: [enemy], turn: 'enemy', round: 7,
    clearedStages: Array.from({ length: 23 }, (_, index) => index + 1) };
  const restored = normalizeSaveData(saved, '1.99.161');
  assert.deepEqual(restored.units, [enemy]);
  assert.equal(Object.hasOwn(restored.units[0], 'level'), false);
  assert.equal(restored.turn, 'enemy');
  assert.equal(restored.round, 7);
  assert.deepEqual(saved.units, [enemy]);
});

test('a new saved battle retains its explicit enemy level and damaged combat state on continue', () => {
  const stage = structuredClone(stages[29]);
  const boss = withStageEnemyLevel({ ...stage.units.find(unit => unit.type === 'boss'), hp: 9,
    status: [{ type: 'bleed', turns: 2 }], acted: true }, stage);
  const saved = { version: '1.99.161', screen: 'battle', selectedStage: stage,
    party: getInitialParty(), units: [boss], turn: 'ally', round: 5,
    clearedStages: Array.from({ length: 29 }, (_, index) => index + 1) };
  const restored = normalizeSaveData(saved, '1.99.161');
  assert.deepEqual(restored.units, [boss]);
  assert.equal(restored.units[0].level, 17);
  assert.equal(restored.units[0].hp, 9);
  assert.equal(restored.round, 5);
});
