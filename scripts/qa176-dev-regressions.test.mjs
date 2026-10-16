import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { getEnemyAttackChoice, getEnemyTurnOrder, moveEnemyToward, getAITypeLabel } from '../src/engine/enemyAI.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { spendAction } from '../src/engine/battleOutcome.js';
import { createBattleAsyncLifecycle } from '../src/engine/battleAsyncLifecycle.js';
import { resolveExpansionEnemySupport } from '../src/data/expansionEnemies.js';

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const appTree = parse(appSource, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
function appFunction(name) {
  let found;
  function visit(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (node.type === 'VariableDeclarator' && node.id?.name === name) {
      found = appSource.slice(node.init.start, node.init.end);
      return;
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') {
      for (const child of Array.isArray(value) ? value : [value]) visit(child);
    }
  }
  visit(appTree);
  assert.ok(found, `${name} 실제 App 함수`);
  return found;
}

const map = Array.from({ length: 4 }, () => Array(4).fill('plain'));
const hero = { id: 'hero', name: '카일', type: 'ally', x: 1, y: 1, hp: 100, maxHp: 100, atk: 20, def: 5, range: 1, move: 3, acted: true, moved: true };
const soldier = (id, overrides = {}) => ({ id, name: '병사', type: 'enemy', x: 2, y: 1, hp: 10, maxHp: 10, atk: 4, def: 2, range: 1, move: 3, ...overrides });
const completedHealer = () => soldier('done', { acted: true, moved: true,
  expansionEnemy: true, expansionSupport: 'heal', artId: 'spore_sage' });
const stage = { id: 15, title: '저장 복원 회귀 전장', map, units: [hero, soldier('done'), soldier('ready', { x: 1, y: 2 })] };

test('구형 적 턴 저장은 이미 공격한 적을 다시 행동 순서에 넣지 않는다', () => {
  const completed = soldier('done', { acted: true, moved: true });
  const ready = soldier('ready', { x: 1, y: 2, acted: false });
  const restored = normalizeSaveData({ screen: 'battle', selectedStage: stage, party: [hero], units: [hero, completed, ready], turn: 'enemy', round: 4 });
  assert.equal(restored.units.find(unit => unit.id === 'done').acted, true);
  assert.deepEqual(getEnemyTurnOrder(restored.units, map).map(unit => unit.id), ['ready']);
  assert.equal(restored.units.find(unit => unit.id === 'done').hp, 10);
});

function enemyTurnHarness() {
  const attacks = [], supports = [], state = {};
  const context = {
    battleAsyncRef: { current: createBattleAsyncLifecycle() }, getEnemyTurnOrder,
    activeMap: map, selectedStage: stage, round: 4, deployedIds: ['hero'], selectedUnit: null,
    getBattleOutcome: () => null,
    resolveExpansionEnemySupport, getEnemyAttackChoice, moveEnemyToward, getAITypeLabel,
    showCombatCutscene: async (preview, _outcome, impact) => { supports.push(preview.attacker.id); impact(); return true; },
    resolveEnemyAttack: async (enemy, target, mode, units) => {
      attacks.push(enemy.id);
      return { units: spendAction(units, enemy.id), attacked: true, defeated: false };
    },
    processTurnStartStatuses: units => ({ units, messages: [] }),
    processTerrainStartEffects: units => ({ units, messages: [] }),
    createBossPatternHazards: () => ({ hazards: [] }),
    createStageReinforcements: (_stage, _round, units) => ({ units, messages: [], spawned: [] }),
    applyDifficultyToUnits: units => units, settings: {},
    decrementSkillCooldowns: units => units, getTurnCameraTarget: () => null,
    setUnits: units => { state.units = units; },
    setLogs: () => {}, setTurn: turn => { state.turn = turn; }, setRound: callback => { state.round = callback(4); },
    setTurnBusy: busy => { state.busy = busy; }, setMoveUndo: () => {},
    playSfx: () => {}, showTurnPhaseBanner: () => {},
  };
  return { run: runInNewContext(`(${appFunction('executeEnemyTurn')})`, context), attacks, supports, state };
}

test('실제 적 턴 재개는 공격 완료한 지원형 적의 추가 회복을 막고 다음 라운드 행동을 복구한다', async () => {
  const completed = completedHealer();
  const ready = soldier('ready', { x: 1, y: 2, hp: 3, acted: false });
  const h = enemyTurnHarness();
  await h.run([hero, completed, ready]);
  assert.deepEqual(h.attacks, ['ready']);
  assert.deepEqual(h.supports, [], '이미 공격한 적이 회복까지 추가로 사용하면 안 된다');
  assert.equal(h.state.units.find(unit => unit.id === ready.id).hp, 3);
  assert.equal(h.state.turn, 'ally');
  assert.equal(h.state.round, 5);
  assert.equal(h.state.units.every(unit => !unit.acted && !unit.moved), true);
  // Normal following turns still include both enemies; no permanent skip is introduced.
  assert.deepEqual(Array.from(getEnemyTurnOrder(h.state.units, map), unit => unit.id).sort(), ['done', 'ready']);
});

function counterHarness({ counterHit = true, counterDamage = 20 } = {}) {
  const stats = { kills: 0, counters: 0 }, unitStats = {}, rewards = [], drops = [];
  let shown = 0;
  const context = {
    activeMap: map, selectedStage: stage,
    canAttackTarget: () => true, scrollBattleMapToCell: () => {},
    calculateDamage: attacker => attacker.type === 'ally' ? counterDamage : 1,
    calculateHit: () => 100, calculateCrit: () => 0,
    applyPassiveToPreview: preview => preview, applyBattleTactics: preview => preview,
    createBattleTactics: () => ({}), getCombatAffinity: () => ({}),
    rollCombat: preview => ({ hit: preview.mode === 'counter' ? counterHit : true, crit: false, damage: preview.damage }),
    showCombatCutscene: async (_preview, _outcome, impact) => { shown++; impact(); return true; },
    addBattleStats: delta => { for (const [key, value] of Object.entries(delta)) stats[key] = (stats[key] || 0) + value; },
    addUnitBattleStats: (id, delta) => {
      unitStats[id] ||= {};
      for (const [key, value] of Object.entries(delta)) unitStats[id][key] = (unitStats[id][key] || 0) + value;
    },
    applySkillStatusAfterHit: (_attacker, _target, _mode, units) => ({ units, messages: [] }),
    consumeExpansionEnemyAttackBoost: units => units, spendAction,
    setUnits: () => {}, canCounter: () => true,
    awardEnemyExperience: (units, killerId, enemy) => { rewards.push([killerId, enemy.id]); return { units, messages: ['경험치'] }; },
    registerLootDrop: enemy => { drops.push(enemy.id); return ['전리품']; },
    makeAttackLog: () => '', setLogs: () => {}, getBattleOutcome: () => null,
  };
  return { run: runInNewContext(`(${appFunction('resolveEnemyAttack')})`, context), stats, unitStats, rewards, drops, shown: () => shown };
}

test('실제 적 공격의 아군 반격 격파는 경험치·전리품과 함께 총계·개인 격파를 각각 한 번 기록한다', async () => {
  const h = counterHarness(), enemy = soldier('counter-victim');
  const outcome = await h.run(enemy, hero, 'attack', [hero, enemy]);
  assert.equal(outcome.units.some(unit => unit.id === enemy.id), false);
  assert.deepEqual(h.rewards, [['hero', enemy.id]]);
  assert.deepEqual(h.drops, [enemy.id]);
  assert.equal(h.shown(), 2);
  assert.equal(h.stats.kills, 1);
  assert.equal(h.unitStats.hero.kills, 1);
  assert.equal(h.stats.counters, 1);
});

test('실제 반격의 빗나감·비격파는 격파·경험치·전리품을 생성하지 않는다', async () => {
  for (const scenario of [{ counterHit: false }, { counterDamage: 2 }]) {
    const h = counterHarness(scenario), enemy = soldier('survivor');
    const outcome = await h.run(enemy, hero, 'attack', [hero, enemy]);
    assert.ok(outcome.units.some(unit => unit.id === enemy.id && unit.hp > 0));
    assert.equal(h.stats.kills, 0);
    assert.equal(h.unitStats.hero?.kills || 0, 0);
    assert.deepEqual(h.rewards, []);
    assert.deepEqual(h.drops, []);
  }
});
