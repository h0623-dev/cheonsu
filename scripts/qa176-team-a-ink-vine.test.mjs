import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { stages } from '../src/data/stages.js';
import { getBattlefieldPlan } from '../src/data/battlefieldPlans.js';
import { createBattlefieldTerrain } from '../src/data/stageTerrain.js';
import { distributeBattleFormations } from '../src/engine/formations.js';
import { getInitialParty, mergePartyIntoStage } from '../src/engine/partyEngine.js';
import { applyExpansionEnemyIdentity, createExpansionExtraEnemy, createExpansionEnemy } from '../src/data/expansionEnemies.js';
import { withStageEnemyLevel } from '../src/engine/enemyProgression.js';
import { getEnemyAttackChoice, moveEnemyToward } from '../src/engine/enemyAI.js';
import { getTerrainMoveCost, getUnitMoveRange, getMoveTiles, getUnitMoveTrait } from '../src/engine/movement.js';

const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
const functions = ['expandStageForLargeBattle', 'isActOneRouteStage', 'getLargeAllySpawns', 'getLargeEnemySpawns',
  'normalizeSpawnCandidates', 'getStageFormationKind', 'scaleEnemyPosition', 'pickOpenFrontierSpawn', 'inActiveMap',
  'isBlockedBattleTile', 'applyStageEnemyIdentities', 'applyStageEnemyIdentity', 'createLargeExtraEnemy',
  'spaceBattleFormations', 'getStageBattlefieldTheme'];
const constants = ['MAX_DEPLOY_COUNT', 'LARGE_MAP_SIZE', 'STAGE_FORMATION_KINDS', 'BATTLEFIELD_THEMES', 'BLOCKED_TERRAIN_TYPES'];
const nodes = ast.body.filter(node => node.type === 'FunctionDeclaration' && functions.includes(node.id?.name)
  || node.type === 'VariableDeclaration' && node.declarations.some(entry => constants.includes(entry.id?.name)));
assert.equal(nodes.length, functions.length + constants.length);
const createStage = runInNewContext(`${nodes.map(node => source.slice(node.start, node.end)).join('\n')}\nexpandStageForLargeBattle`, {
  clone: value => JSON.parse(JSON.stringify(value)), createBattlefieldTerrain, distributeBattleFormations,
  applyExpansionEnemyIdentity, createExpansionExtraEnemy, withStageEnemyLevel, getBattlefieldPlan,
});
const stage = createStage(stages[48], 15);
const party = Array.from({ length: 15 }, (_, i) => ({ ...getInitialParty()[0], id: i === 0 ? 'hero' : `qa-ally-${i}` }));
const units = distributeBattleFormations(stage, mergePartyIntoStage(stage, party));
const target = units.find(unit => unit.id === 'hero');
const initial = units.find(unit => unit.id === 'expansion-49-2');
const trace = [];
const expansionRoutes = [];

test('49장 최종 App 전투의 잉크덩굴은 기본 이동력 1을 보존하고 아군까지 실제 추적 가능', () => {
  assert.equal(stage.largeBattle, true);
  assert.equal(initial.artId, 'ink_vine');
  assert.equal(initial.move, 1);
  let current = initial;
  let choice = getEnemyAttackChoice(current, [target], stage.map);
  const visited = new Set();
  for (let turn = 0; turn < 100 && !choice; turn++) {
    const key = `${current.x},${current.y}`;
    const next = moveEnemyToward(current, [target], [current, target], stage.map);
    trace.push({ turn, x: current.x, y: current.y, nextX: next.x, nextY: next.y,
      reachableThisTurn: getMoveTiles(current, [current, target], stage.map).length });
    assert.ok(!visited.has(key), `49장 잉크덩굴 추적 정체 ${key}`);
    visited.add(key);
    current = next;
    choice = getEnemyAttackChoice(current, [target], stage.map);
  }
  assert.ok(choice);
});

for (const stageId of [47, 48, 49, 50]) test(`${stageId}장 최종 전투의 모든 잉크덩굴은 이동력1로 아군 공격위치까지 접근`, () => {
  const currentStage = createStage(stages[stageId - 1], 15);
  const field = distributeBattleFormations(currentStage, mergePartyIntoStage(currentStage, party));
  const ally = field.find(unit => unit.id === 'hero');
  const vines = field.filter(unit => (unit.artId || unit.spriteKey) === 'ink_vine');
  assert.ok(vines.length > 0);
  for (const vine of vines) {
    assert.equal(vine.move, 1);
    const original = JSON.stringify(vine);
    let current = vine, choice = getEnemyAttackChoice(current, [ally], currentStage.map), turns = 0;
    const visited = new Set();
    while (!choice && turns < 100) {
      const key = `${current.x},${current.y}`;
      assert.ok(!visited.has(key), `${stageId}장 ${vine.id} 추적 정체 ${key}`);
      visited.add(key);
      current = moveEnemyToward(current, [ally], [current, ally], currentStage.map);
      choice = getEnemyAttackChoice(current, [ally], currentStage.map);
      turns++;
    }
    assert.ok(choice, `${stageId}장 ${vine.id} 공격 위치 도달`);
    assert.equal(JSON.stringify(vine), original, '기존 전투 유닛 원본 변경 없음');
    expansionRoutes.push({ stage: stageId, id: vine.id, move: vine.move, turns, reachedAttackPosition: true });
  }
});

test('덩굴 부유는 기존·신규 적 잉크덩굴의 여울만 보정하고 타 종/아군/늪/차단물은 유지', () => {
  const vine = createExpansionEnemy(49, 'ink_vine');
  for (const unit of [vine, { ...vine, artId: undefined, spriteKey: 'ink_vine' }, JSON.parse(JSON.stringify(initial))]) {
    assert.equal(getUnitMoveTrait(unit).id, 'vine');
    assert.equal(getTerrainMoveCost('water', unit), 1);
    assert.equal(getUnitMoveRange(unit), 1);
    assert.equal(getTerrainMoveCost('swamp', unit), 3);
    assert.equal(getTerrainMoveCost('oath_rune', unit), 2);
    assert.equal(getTerrainMoveCost('cracked_slab', unit), 2);
    for (const blocked of ['block', 'wall', 'void', 'deep_water', 'deepwater']) {
      assert.equal(getTerrainMoveCost(blocked, unit), Infinity);
    }
  }
  for (const unit of [{ ...vine, artId: 'oath_watcher', spriteKey: 'oath_watcher' },
    { ...vine, expansionEnemy: false }, { ...vine, type: 'ally' }, { ...vine, artId: 'oath_watcher' }]) {
    assert.equal(getTerrainMoveCost('water', unit), 2);
    assert.notEqual(getUnitMoveTrait(unit).id, 'vine');
  }
  for (const id of ['lina', 'hero', 'bram']) {
    const original = getInitialParty().find(unit => unit.id === id);
    assert.equal(getTerrainMoveCost('water', original), id === 'bram' ? 3 : 2);
  }
});

test.after(async () => {
  if (!process.env.CHEONSU_QA_EVIDENCE_DIR) return;
  await mkdir(process.env.CHEONSU_QA_EVIDENCE_DIR, { recursive: true });
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const find = overrides => {
    const queue = [initial], seen = new Set([`${initial.x},${initial.y}`]);
    const blocked = new Set();
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i], distance = Math.abs(cell.x - target.x) + Math.abs(cell.y - target.y);
      if (distance >= 1 && distance <= 2) return { reachable: true, visited: seen.size };
      for (const [dx, dy] of directions) {
        const x = cell.x + dx, y = cell.y + dy, tile = stage.map[y]?.[x];
        if (tile == null || x === target.x && y === target.y) continue;
        const cost = overrides.includes(tile) ? 1 : getTerrainMoveCost(tile, initial);
        if (cost > getUnitMoveRange(initial)) { if (Number.isFinite(cost)) blocked.add(tile); continue; }
        const key = `${x},${y}`;
        if (!seen.has(key)) { seen.add(key); queue.push({ x, y }); }
      }
    }
    return { reachable: false, visited: seen.size, blocked: [...blocked] };
  };
  await writeFile(`${process.env.CHEONSU_QA_EVIDENCE_DIR}/ink-vine-49.json`, JSON.stringify({
    generatedAt: new Date().toISOString(), mode: 'actual-App-expanded-stage-final-formation-isolated-enemy-pursuit',
    stage: 49, terrainRevision: stage.terrainRevision, totalEnemies: units.filter(unit => unit.type !== 'ally').length,
    initial, target, trace, expansionRoutes,
    original: find([]), onlyOathRune: find(['oath_rune']), onlyCrackedSlab: find(['cracked_slab']),
    both: find(['oath_rune', 'cracked_slab']),
  }, null, 2));
});
