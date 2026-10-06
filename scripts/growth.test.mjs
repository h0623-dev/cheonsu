import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAINING_TYPES, trainParty, grantEnemyDefeatExp, syncBattleExperience } from '../src/engine/growthEngine.js';
import { grantExp, getInitialParty, mergePartyFromUnits } from '../src/engine/partyEngine.js';
import { CHARACTER_SKILLS, getSkill, isSelfOnlySupportSkill, applySupportSkill } from '../src/data/skills.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { applySkillStatusAfterHit, processTurnStartStatuses, addOrRefreshStatus } from '../src/engine/statusEngine.js';
import { stages } from '../src/data/stages.js';

const roster = () => getInitialParty().map(unit => ({ ...unit, exp: 0, level: 1, hp: unit.maxHp, acted: false, skillCooldowns: { oath: 2 } }));
const enemy = { id: 'enemy', name: '적', type: 'enemy', hp: 0 };
for (const training of TRAINING_TYPES) test(`whole-party ${training.id} training grows every ally once, including bench`, () => {
  const party = roster();
  const snapshot = structuredClone(party);
  const result = trainParty(party, training.id);
  assert.equal(result.count, party.length);
  for (let index = 0; index < party.length; index++) {
    const before = party[index], after = result.units[index];
    assert.equal(after.exp, training.exp);
    assert.equal(after.baseAtk, before.baseAtk + Number(training.stat === 'atk'));
    assert.equal(after.baseDef, before.baseDef + Number(training.stat === 'def'));
    assert.deepEqual(after.equipment, before.equipment);
    assert.deepEqual(after.skillCooldowns, before.skillCooldowns);
  }
  assert.deepEqual(party, snapshot);
  assert.equal(trainParty(result.units, training.id, result.used).units, result.units);
});
test('training rejects invalid/empty selections and preserves old used-camp saves', () => {
  const party = roster();
  assert.equal(trainParty(party, 'unknown').units, party);
  assert.equal(trainParty([], 'focus').used, false);
  const saved = normalizeSaveData({ party, trainingUsed: true, screen: 'camp', selectedStage: stages[0] });
  assert.equal(trainParty(saved.party, 'attack', saved.trainingUsed).count, 0);
});
test('training stacks level-up growth with training growth, without reviving a fallen unit', () => {
  const party = roster().map(unit => ({ ...unit, exp: 95, hp: 0 }));
  const result = trainParty(party, 'attack');
  for (let i = 0; i < party.length; i++) {
    assert.equal(result.units[i].level, 2); assert.equal(result.units[i].exp, 27);
    assert.equal(result.units[i].baseAtk, party[i].baseAtk + 2);
    assert.equal(result.units[i].baseDef, party[i].baseDef + 1);
    assert.equal(result.units[i].hp, 0);
  }
});
for (const [type, full, shared] of [['enemy', 48, 14], ['boss', 80, 24]]) test(`${type}: killer and deployed shares receive 60% more XP once, bench zero`, () => {
  const party = roster();
  const deployed = ['hero', 'bram', 'lina', 'lina'];
  const result = grantEnemyDefeatExp(party.slice(0, 3), 'hero', { ...enemy, type }, deployed);
  const updated = syncBattleExperience(party, result);
  assert.deepEqual(updated.map(unit => unit.exp), [full, shared, shared, 0]);
  assert.equal(result.rewards.length, 3);
  assert.equal(result.units[0].acted, false);
  assert.deepEqual(result.units[0].skillCooldowns, party[0].skillCooldowns);
});
test('fallen deployed allies receive shares without respawning; save/reload retains all growth', () => {
  const party = roster();
  const deployed = ['hero', 'bram', 'lina'];
  let units = party.slice(0, 2);
  let result = grantEnemyDefeatExp(units, 'hero', enemy, deployed);
  let updated = syncBattleExperience(party, result);
  units = result.units;
  result = grantEnemyDefeatExp(units, 'bram', enemy, deployed);
  updated = syncBattleExperience(updated, result);
  assert.deepEqual(updated.map(unit => unit.exp), [62, 62, 28, 0]);
  assert.deepEqual(result.units.map(unit => unit.id), ['hero', 'bram']);
  const save = normalizeSaveData({ party: updated, units: result.units, deployedIds: deployed, screen: 'battle', selectedStage: stages[0] });
  assert.equal(save.party.find(unit => unit.id === 'lina').exp, 28);
  assert.ok(!save.units.some(unit => unit.id === 'lina'));
  assert.deepEqual(mergePartyFromUnits(updated, result.units).map(unit => unit.exp), [62, 62, 28, 0]);
});
test('AOE/counter sequences preserve live XP and support simultaneous level-ups', () => {
  let party = roster().map(unit => ({ ...unit, exp: 95 }));
  let units = structuredClone(party);
  for (let kill = 0; kill < 4; kill++) {
    const result = grantEnemyDefeatExp(units, 'hero', enemy, party.map(unit => unit.id));
    units = result.units; party = syncBattleExperience(party, result);
  }
  assert.deepEqual(party.map(unit => [unit.level, unit.exp]), [[3, 87], [2, 51], [2, 51], [2, 51]]);
  assert.deepEqual(units.map(unit => [unit.level, unit.exp]), party.map(unit => [unit.level, unit.exp]));
});
test('old in-progress saves use live growth, not stale party growth', () => {
  const party = roster(), units = structuredClone(party);
  units[0].exp = 80;
  const result = grantEnemyDefeatExp(units, 'hero', enemy, party.map(unit => unit.id));
  const updated = syncBattleExperience(party, result);
  assert.equal(updated[0].level, 2); assert.equal(updated[0].exp, 28);
});
test('non-ally kills and non-enemy victims cannot grant XP', () => {
  const units = roster(), ids = units.map(unit => unit.id);
  assert.equal(grantEnemyDefeatExp(units, 'enemy', enemy, ids).rewards.length, 0);
  assert.equal(grantEnemyDefeatExp(units, 'hero', units[1], ids).rewards.length, 0);
});
test('large XP grants handle multiple levels and preserve action/cooldown state', () => {
  const units = roster(); units[0].hp = 0; units[0].acted = true;
  const after = grantExp(units, 'hero', 250).units[0];
  assert.equal(after.level, 3); assert.equal(after.exp, 50); assert.equal(after.hp, 0);
  assert.equal(after.acted, true); assert.deepEqual(after.skillCooldowns, units[0].skillCooldowns);
});
test('only self-scoped support skills bypass targeting, even with allies in the same tile', () => {
  const immediate = Object.values(CHARACTER_SKILLS).flat().filter(isSelfOnlySupportSkill).map(skill => skill.id);
  assert.deepEqual(immediate, ['oath', 'bulwark', 'roar']);
  const actor = { ...roster()[0], x: 2, y: 2 };
  const other = { ...roster()[1], x: 2, y: 2 };
  const result = applySupportSkill(actor, getSkill(actor, 'oath'), [actor, other]);
  assert.deepEqual(result.targets.map(unit => unit.id), ['hero']);
  assert.equal(result.units[1].guard, other.guard);
  assert.ok(!isSelfOnlySupportSkill(getSkill({ id: 'noah' }, 'ward')));
  assert.ok(!isSelfOnlySupportSkill(getSkill({ id: 'aria' }, 'light')));
});
test('burn/bleed finishing blows keep the applying character as killer', () => {
  const lina = { ...roster()[2], skillSpec: { status: 'burn' } };
  const target = { ...enemy, hp: 1, status: [] };
  const applied = applySkillStatusAfterHit(lina, target.id, 'skill', [target]);
  const tick = processTurnStartStatuses(applied.units, 'enemy');
  assert.equal(tick.units.length, 0);
  assert.equal(tick.defeats[0].killerId, 'lina');
  const result = grantEnemyDefeatExp(roster(), tick.defeats[0].killerId, target, roster().map(unit => unit.id));
  assert.deepEqual(result.units.map(unit => unit.exp), [14, 14, 48, 14]);
  assert.equal(processTurnStartStatuses(tick.units, 'enemy').defeats.length, 0);
});
test('terrain refresh removes stale skill attribution and legacy statuses remain compatible', () => {
  const status = addOrRefreshStatus([{ type: 'burn', turns: 2, sourceId: 'lina' }], { type: 'burn', turns: 2 });
  assert.equal(status[0].sourceId, undefined);
  const tick = processTurnStartStatuses([{ ...enemy, hp: 1, status }], 'enemy');
  assert.equal(tick.defeats.length, 0);
});
