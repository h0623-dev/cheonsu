import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUnlockedStageIds, createVictoryCheckpoint, writeProgressSave } from '../src/engine/campaignProgress.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { getSkill, getSupportSkillCandidates, applySupportSkill } from '../src/data/skills.js';
import { TOWN_ENTRANCE, TOWN_FACILITIES, TOWN_MAP, getTownPath } from '../src/engine/townMovement.js';
import { combatUnitIds, combatMotionPoses, getCombatFrameStyle } from '../src/data/combatArt.js';
import metrics from '../src/data/combatFrameMetrics.json' with { type: 'json' };
import { stages } from '../src/data/stages.js';

test('stage progression ignores old testing unlocks and preserves cleared-stage evidence', () => {
  assert.deepEqual(getUnlockedStageIds(), [1]);
  assert.deepEqual(getUnlockedStageIds([1]), [1, 2]);
  assert.deepEqual(getUnlockedStageIds([1, 2]), [1, 2, 3]);
  assert.deepEqual(getUnlockedStageIds([5, 99, -1]), [1, 2, 3, 4, 5, 6]);
  assert.equal(getUnlockedStageIds([30]).length, 30);
  const legacy = normalizeSaveData({ unlockedStages: stages.map(stage => stage.id), clearedStages: [1], selectedStage: stages[4], screen: 'battle' });
  assert.deepEqual(legacy.unlockedStages, [1, 2]);
  assert.equal(legacy.selectedStage.id, 5, 'an existing in-progress battle survives migration');
});

test('victory checkpoint settles first-clear rewards once and replay retains XP only', () => {
  const data = { selectedStage: { id: 1, reward: { gear: ['chainArmor'] } }, clearedStages: [], stageRewardClaimed: false,
    gold: 100, inventory: { potion: 2 }, gearInventory: [], supportPoints: { hero_lina: 0 }, exploration: { claimed: ['kept'] },
    battleLoot: { gold: 30, items: { remedy: 1 }, gear: ['ironSword'] } };
  const settlement = { party: [{ id: 'hero', exp: 90 }], reward: { gold: 230, potion: 3 }, careerStats: { victories: 1 }, stageMastery: { 1: 'S' }, message: '클리어' };
  const first = createVictoryCheckpoint(data, settlement);
  assert.equal(first.checkpoint.gold, 330);
  assert.deepEqual(first.checkpoint.inventory, { potion: 5, remedy: 1 });
  assert.deepEqual(first.checkpoint.unlockedStages, [1, 2]);
  assert.equal(first.checkpoint.screen, 'camp');
  assert.deepEqual(first.checkpoint.exploration, data.exploration);
  const replay = createVictoryCheckpoint({ ...first.checkpoint, battleLoot: data.battleLoot }, { ...settlement, party: [{ id: 'hero', exp: 120 }] });
  assert.deepEqual(replay.reward, { gold: 0, potion: 0 });
  for (const key of ['gold', 'inventory', 'gearInventory', 'supportPoints']) assert.deepEqual(replay.checkpoint[key], first.checkpoint[key]);
  assert.equal(replay.checkpoint.party[0].exp, 120);
});

test('save quota failure preserves previous primary; backup failure never masks a successful save', () => {
  const entries = new Map([['cheonsu_v01_save', 'old']]);
  const storage = { getItem: key => entries.get(key), setItem: () => { throw new Error('quota'); } };
  assert.throws(() => writeProgressSave(storage, { gold: 100 }), /quota/);
  assert.equal(entries.get('cheonsu_v01_save'), 'old');
  storage.setItem = (key, value) => { if (key !== 'cheonsu_v01_save') throw new Error('quota'); entries.set(key, value); };
  assert.deepEqual(writeProgressSave(storage, { gold: 100 }), { backupOk: false });
  assert.equal(JSON.parse(entries.get('cheonsu_v01_save')).gold, 100);
});

const ally = (id, extra = {}) => ({ id, type: 'ally', x: 4, y: 4, hp: 20, maxHp: 40, def: 3, status: [], ...extra });
test('manual healing targets only chosen allies, never silently falls back to lowest HP', () => {
  const actor = ally('aria'); const skill = getSkill(actor, 'light');
  const units = [actor, ally('hero', { hp: 1 }), ally('lina', { hp: 30 }), ally('bram', { x: 10 }), ally('dead', { hp: 0 })];
  const result = applySupportSkill(actor, skill, units, ['lina', 'hero']);
  assert.deepEqual(result.targets.map(unit => unit.id), ['lina']);
  assert.equal(result.units.find(unit => unit.id === 'hero').hp, 1);
  assert.equal(result.units.find(unit => unit.id === 'lina').hp, 40);
  assert.deepEqual(applySupportSkill(actor, skill, units, []).units, units);
  assert.equal(applySupportSkill(actor, skill, units, ['bram', 'dead', 'missing']).targets.length, 0);
});
test('multi-target support respects selection, target cap, range, duplicates and self-only guards', () => {
  const actor = ally('aria'); const skill = getSkill(actor, 'sanctuary');
  const units = [actor, ally('hero'), ally('lina'), ally('bram'), ally('leon')];
  assert.equal(getSupportSkillCandidates(actor, skill, units).length, 5);
  assert.deepEqual(applySupportSkill(actor, skill, units, ['lina', 'lina', 'bram', 'hero', 'leon']).targets.map(unit => unit.id), ['lina', 'bram', 'hero']);
  const hero = ally('hero'); const guard = getSkill(hero, 'oath');
  const guardUnits = [hero, ally('bram', { x: 5 })];
  assert.equal(applySupportSkill(hero, guard, guardUnits, ['bram']).targets.length, 0);
  assert.equal(applySupportSkill(hero, guard, guardUnits, ['hero']).units[0].guard, true);
});
test('all village facilities are connected by walkable consecutive steps', () => {
  for (const start of [TOWN_ENTRANCE, ...TOWN_FACILITIES]) for (const target of TOWN_FACILITIES) {
    const path = getTownPath(start, target);
    if (start.x === target.x && start.y === target.y) { assert.equal(path.length, 0); continue; }
    assert.ok(path.length > 0);
    assert.equal(path.at(-1).x, target.x); assert.equal(path.at(-1).y, target.y);
    let previous = start;
    for (const cell of path) { assert.equal(TOWN_MAP[cell.y][cell.x], 'plain'); assert.equal(Math.abs(cell.x - previous.x) + Math.abs(cell.y - previous.y), 1); previous = cell; }
  }
  assert.deepEqual(getTownPath(TOWN_ENTRANCE, { x: 0, y: 0 }), []);
  assert.deepEqual(getTownPath(TOWN_ENTRANCE, { x: -1, y: 12 }), []);
});
test('every combat pose shares a visible-height and foot baseline across allies, enemies and bosses', () => {
  for (const key of combatUnitIds) for (const pose of combatMotionPoses) {
    const frame = metrics[key][pose]; const style = getCombatFrameStyle(key, pose);
    const scale = style['--combat-sprite-scale'];
    const height = (frame.bottom - frame.top + 1) / frame.height * scale;
    assert.ok(Math.abs(height - (key === 'wolf' ? .45 : .703125)) < .00001, `${key}/${pose}`);
    const foot = .9375 + ((frame.bottom + 1) / frame.height - .9375) * scale + parseFloat(style['--combat-foot-offset']) / 100;
    assert.ok(Math.abs(foot - .9375) < .00001, `${key}/${pose}: baseline`);
  }
});
