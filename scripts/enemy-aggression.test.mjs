import test from 'node:test';
import assert from 'node:assert/strict';
import { getEnemyAttackChoice, getEnemyTurnOrder, moveEnemyToward } from '../src/engine/enemyAI.js';
import { distance, getMoveTiles } from '../src/engine/movement.js';

const makeMap = () => Array.from({ length: 7 }, () => Array(7).fill('plain'));
const soldier = { id: 'enemy', type: 'enemy', aiType: 'aggressive', x: 2, y: 4,
  hp: 30, maxHp: 30, atk: 10, def: 5, move: 1, range: 1, acted: false, moved: false };
const hero = { id: 'hero', type: 'ally', x: 4, y: 4, hp: 50, maxHp: 50, def: 10 };

test('적은 벽 앞에서 왕복하지 않고 멀어지는 방향이라도 열린 공격 경로를 따라 전진한다', () => {
  const map = makeMap();
  for (let y = 1; y < map.length; y++) map[y][3] = 'wall';
  let enemy = { ...soldier };
  for (let turn = 0; turn < 2; turn++) {
    const previous = enemy;
    enemy = moveEnemyToward(enemy, [hero], [enemy, hero], map);
    assert.ok(getMoveTiles(previous, [previous, hero], map).some(tile => tile.x === enemy.x && tile.y === enemy.y));
  }
  assert.deepEqual({ x: enemy.x, y: enemy.y }, { x: 2, y: 2 });
  assert.equal(enemy.move, soldier.move);
  assert.equal(enemy.hp, soldier.hp);
});

test('암살자는 완전히 막힌 우선 표적을 기다리지 않고 도달 가능한 아군을 압박한다', () => {
  const map = makeMap();
  for (const row of map) row[3] = 'wall';
  const nearHero = { ...hero, x: 0, y: 5 };
  const unreachable = { ...hero, id: 'lina', x: 4, y: 3, hp: 10 };
  let enemy = { ...soldier, aiType: 'assassin', y: 3 };
  for (let turn = 0; turn < 3; turn++) {
    enemy = moveEnemyToward(enemy, [unreachable, nearHero], [enemy, unreachable, nearHero], map);
  }
  assert.equal(getEnemyAttackChoice(enemy, [unreachable, nearHero], map)?.target.id, 'hero');
});

test('공격할 수 있는 궁수는 후퇴하지 않으며 인접 상태에서는 정확히 두 칸 사거리로 이동한다', () => {
  const map = makeMap();
  const target = { ...hero, x: 3, y: 2 };
  const archer = { ...soldier, aiType: 'archer', x: 1, y: 2, range: 2, skillType: 'attack', skillRange: 2 };
  assert.equal(moveEnemyToward(archer, [target], [archer, target], map), archer);
  const adjacent = { ...archer, x: 2 };
  const moved = moveEnemyToward(adjacent, [target], [adjacent, target], map);
  assert.equal(distance(moved, target), 2);
  assert.equal(getEnemyAttackChoice(moved, [target], map)?.target.id, 'hero');
});

test('적 행동 순서는 현재 공격 가능한 적과 가까운 전열을 우선하며 원본 배열을 보존한다', () => {
  const map = makeMap();
  const target = { ...hero, x: 5, y: 0 };
  const back = { ...soldier, id: 'back', x: 0, y: 0 };
  const front = { ...soldier, id: 'front', x: 2, y: 0 };
  const attacker = { ...soldier, id: 'attacker', x: 4, y: 0 };
  const units = [back, front, attacker, target];
  assert.deepEqual(getEnemyTurnOrder(units, map).map(unit => unit.id), ['attacker', 'front', 'back']);
  assert.deepEqual(units.map(unit => unit.id), ['back', 'front', 'attacker', 'hero']);
});
