import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { stages } from '../src/data/stages.js';
import { getBattleOutcome } from '../src/engine/battleOutcome.js';
const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const { body } = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
const names = ['getStageSpeedLimit', 'getStageMissionOrder', 'getBattleSurvival', 'evaluateStageMissionOrder', 'evaluateTacticalGoals', 'calculateClearSummary'];
const code = names.map(name => {
  const node = body.find(entry => entry.type === 'FunctionDeclaration' && entry.id?.name === name);
  assert.ok(node, name);
  return source.slice(node.start, node.end);
}).join('\n');
const api = runInNewContext(`${code}\n({getStageMissionOrder,evaluateStageMissionOrder,evaluateTacticalGoals,calculateClearSummary})`);
const hero = { id: 'hero', type: 'ally', hp: 100, maxHp: 100 };
const ally = { id: 'lina', type: 'ally', hp: 100, maxHp: 100 };
const enemy = { id: 'enemy', type: 'enemy', hp: 100, maxHp: 100 };
const boss = { id: 'original-boss', type: 'boss', hp: 100, maxHp: 100 };
for (const stage of stages.filter(stage => stage.id <= 50)) {
  const scenario = { ...stage, units: [hero, ally, boss] };
  const complete = api.calculateClearSummary(scenario, 1, [hero, ally], ['hero', 'lina']);
  assert.equal(complete.rank, 'S', `stage ${stage.id} complete`);
  const casualty = api.calculateClearSummary(scenario, 1, [hero], ['hero', 'lina']);
  assert.notEqual(casualty.rank, 'S', `stage ${stage.id} removed casualty`);
  assert.equal(casualty.tacticalGoals.find(goal => goal.id === 'allAlive').met, false);
  assert.equal(api.calculateClearSummary(scenario, 1, [hero, { ...ally, hp: 0 }], ['hero', 'lina']).rank, 'A');
  assert.equal(api.calculateClearSummary(scenario, 1, [], []).tacticalGoals.find(goal => goal.id === 'allAlive').met, false);
  assert.equal(api.calculateClearSummary({ ...stage, units: [hero] }, 1, [hero], ['hero']).rank, 'S');
  const mission = api.getStageMissionOrder(scenario);
  if (mission.id === 'survive') {
    assert.equal(api.evaluateStageMissionOrder(scenario, 1, [hero], ['hero', 'lina']).met, false);
    assert.equal(api.evaluateStageMissionOrder(scenario, 1, [], []).met, false);
    assert.equal(api.evaluateStageMissionOrder(scenario, 9, [hero, ally], ['hero', 'lina']).met, false);
  }
  if (mission.id === 'sweep') assert.equal(api.evaluateStageMissionOrder(scenario, 1, [hero, enemy], ['hero']).met, false);
  if (mission.id === 'bossSlayer') {
    assert.equal(api.evaluateStageMissionOrder(scenario, 1, [hero, boss], ['hero']).met, false);
    assert.equal(api.evaluateStageMissionOrder(scenario, 1, [hero, { ...boss, type: 'enemy' }], ['hero']).met, false);
  }
  assert.notEqual(getBattleOutcome(stage, [ally, enemy]), 'defeat', `stage ${stage.id} Kyle casualty rule`);
}
console.log('QA175 actual App AST: all 50 mission/reward scenarios passed');
