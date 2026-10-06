import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MONSTER_ENEMIES, MONSTER_STAGE_ROLES, applyStageMonsterAppearance, isMonsterArtId } from '../src/data/monsterEnemies.js';
import { stages as campaignStages } from '../src/data/stages.js';
import { EXPANSION_MONSTER_KEYS, EXPANSION_BOSS_KEYS } from '../src/data/expansionEnemies.js';
import { getUnitCombatClass, calculateDamage } from '../src/engine/combat.js';
import { getAttackRange, canAttackTarget, canCounter } from '../src/engine/movement.js';
import { getEnemyAttackChoice } from '../src/engine/enemyAI.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { getInitialParty } from '../src/engine/partyEngine.js';
import { getCharacterCollection } from '../src/data/characterCollection.js';

const stages = campaignStages.filter(stage => stage.id <= 30);

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const squadSource = app.slice(app.indexOf('const ENEMY_ARCHETYPE_TEMPLATES ='), app.indexOf('function getStageBossSpriteKey'));
const identitySource = app.slice(app.indexOf('function applyStageEnemyIdentity('), app.indexOf('function inActiveMap('));
const createBuilder = appearance => {
  const api = vm.runInNewContext(`${squadSource}\n${identitySource}\n({ getStageEnemySquadTemplates, applyStageEnemyIdentity })`, {
    applyStageMonsterAppearance: appearance,
    getThemedLargeEnemyTemplates: () => [],
    getChapterBossName: (_id, name) => name,
    getStageBossSpriteKey: () => 'boss_commander',
  });
  return {
    getStageEnemySquadTemplates: stage => structuredClone(api.getStageEnemySquadTemplates(stage)),
    applyStageEnemyIdentity: (...args) => structuredClone(api.applyStageEnemyIdentity(...args)),
  };
};
const current = createBuilder(applyStageMonsterAppearance);
const previous = createBuilder(unit => unit);
const battleFields = ['id', 'type', 'x', 'y', 'hp', 'maxHp', 'atk', 'def', 'move', 'range', 'skillRange', 'skillBonus', 'skillType', 'aiType', 'moved', 'acted', 'guard'];
const select = unit => Object.fromEntries(battleFields.map(key => [key, unit[key]]));

test('actual chapter squad slots introduce each species at the approved first chapter', () => {
  const first = {};
  for (const stage of stages) {
    const templates = current.getStageEnemySquadTemplates(stage);
    assert.equal(templates.length, previous.getStageEnemySquadTemplates(stage).length);
    for (const template of templates) if (template.artId) first[template.artId] ??= stage.id;
  }
  assert.deepEqual(first, {
    'kobold-hunter': 4, 'lizard-spearman': 8, 'horned-ogre': 9,
    'rock-spirit': 10, 'skeleton-warrior': 14, 'harpy-scout': 15,
  });
  for (const [id, identity] of Object.entries(MONSTER_ENEMIES).filter(([, entry]) => entry.firstStage <= 30)) assert.equal(first[id], identity.firstStage);
  for (const id of [1, 2, 3]) assert.deepEqual(current.getStageEnemySquadTemplates({ id }), previous.getStageEnemySquadTemplates({ id }));
});

test('new species preserve the original slot stats, IDs, AI, range and story boss', () => {
  for (const stage of stages) for (const [index, original] of stage.units.filter(unit => unit.type !== 'ally').entries()) {
    const before = previous.applyStageEnemyIdentity(original, stage, index);
    const after = current.applyStageEnemyIdentity(original, stage, index);
    assert.deepEqual(select(after), select(before), `${stage.id}/${original.id}: battle values stay unchanged`);
    assert.deepEqual(getAttackRange(after), getAttackRange(before));
    assert.deepEqual(getAttackRange(after, 'skill'), getAttackRange(before, 'skill'));
    if (after.artId === 'kobold-hunter') {
      assert.equal(after.spriteKey, 'ranger');
      assert.equal(after.skill, '정밀 석궁');
      assert.equal(getUnitCombatClass(after), 'bow');
    } else {
      assert.equal(after.spriteKey, before.spriteKey);
      assert.equal(after.skill, before.skill);
      assert.equal(getUnitCombatClass(after), getUnitCombatClass(before));
      const hero = { id: 'hero', type: 'ally', hp: 40, atk: 10, def: 5 };
      assert.equal(calculateDamage(hero, after), calculateDamage(hero, before));
      assert.equal(calculateDamage(after, hero, 'skill'), calculateDamage(before, hero, 'skill'));
    }
    if (original.type === 'boss') assert.deepEqual(after, before);
    if (after.artId) assert.equal(after.type, 'enemy');
  }
  assert.equal(Object.values(MONSTER_ENEMIES).filter(identity => identity.firstStage <= 30 && identity.rank === 'elite').length, 2);
  assert.equal(MONSTER_ENEMIES['horned-ogre'].rank, 'elite');
  assert.equal(MONSTER_ENEMIES['rock-spirit'].rank, 'elite');
});

test('chapter 4 crossbow cannot attack or counter at one cell and keeps its two-cell AI', () => {
  const stage = stages[3];
  const original = stage.units.filter(unit => unit.type === 'enemy')[1];
  const enemy = { ...current.applyStageEnemyIdentity(original, stage, 1), x: 3, y: 3, hp: 20, acted: false, moved: false };
  const map = Array.from({ length: 8 }, () => Array(8).fill('plain'));
  const adjacent = { id: 'hero', type: 'ally', hp: 30, def: 5, x: 4, y: 3 };
  const distant = { ...adjacent, x: 5 };
  assert.equal(enemy.artId, 'kobold-hunter');
  assert.deepEqual(getAttackRange(enemy), { min: 2, max: 2 });
  assert.deepEqual(getAttackRange(enemy, 'skill'), { min: 2, max: 2 });
  assert.equal(canAttackTarget(enemy, adjacent, 'attack', map), false);
  assert.equal(canAttackTarget(enemy, adjacent, 'skill', map), false);
  assert.equal(canCounter(adjacent, enemy, map), false);
  assert.equal(getEnemyAttackChoice(enemy, [adjacent], map), null);
  assert.equal(getEnemyAttackChoice(enemy, [distant], map).target.id, 'hero');
  assert.equal(canCounter(distant, enemy, map), true);
});

test('old live battle saves keep all combat fields and receive no monster appearance on load', () => {
  for (const stageId of [4, 8, 9, 10, 14, 15]) {
    const stage = stages[stageId - 1];
    const old = stage.units.map((unit, index) => unit.type === 'ally' ? { ...unit, x: index, y: 7 } : {
      ...previous.applyStageEnemyIdentity(unit, stage, index - stage.units.filter(candidate => candidate.type === 'ally').length),
      hp: 3, x: 5, y: 1, acted: true, moved: true, guard: true, status: [{ type: 'poison', turns: 2 }],
    });
    for (const unit of old) for (const key of ['artId', 'monsterRank', 'legacySpriteKey', 'legacyName', 'combatIdentityName']) delete unit[key];
    const saved = { version: '1.99.156', screen: 'battle', selectedStage: { ...stage, units: old }, units: old, party: getInitialParty(), round: 4, turn: 'enemy' };
    const snapshot = structuredClone(saved);
    const restored = normalizeSaveData(saved, '1.99.157');
    assert.deepEqual(saved, snapshot);
    assert.deepEqual(restored.selectedStage.units, snapshot.selectedStage.units);
    for (const unit of old.filter(candidate => candidate.type !== 'ally')) {
      const result = restored.units.find(candidate => candidate.id === unit.id);
      assert.deepEqual(result, unit);
      assert.equal(result.artId, undefined);
    }
    assert.equal(restored.round, 4);
    assert.equal(restored.turn, 'enemy');
  }
  const loadSource = app.slice(app.indexOf('const migratedData = normalizeSaveData(savedData'), app.indexOf('setUnits(restoredUnits)', app.indexOf('const migratedData = normalizeSaveData(savedData')));
  assert.ok(!loadSource.includes('applyStageMonsterAppearance'));
});

test('new appearances and original chapter records coexist in the 47-character collection', () => {
  const identity = current.getStageEnemySquadTemplates({ id: 4 }).find(unit => unit.artId === 'kobold-hunter');
  const encounters = [
    { key: identity.artId, stageId: 4, name: identity.name },
    { key: identity.legacySpriteKey, stageId: 4, name: identity.legacyName, archived: true },
  ];
  const snapshot = structuredClone(encounters);
  const entries = getCharacterCollection({ clearedStages: [4], encounters });
  assert.equal(entries.filter(entry => !EXPANSION_MONSTER_KEYS.includes(entry.id) && entry.kind === 'enemy').length, 25);
  assert.equal(entries.filter(entry => !EXPANSION_BOSS_KEYS.includes(entry.id) && entry.kind === 'boss').length, 5);
  assert.equal(entries.find(entry => entry.id === 'kobold-hunter').unlocked, true);
  assert.equal(entries.find(entry => entry.id === 'storm_mage').unlocked, true);
  assert.match(entries.find(entry => entry.id === 'storm_mage').bio, /옛 전장 · 4장 · 검은 번개술사/);
  for (const id of Object.keys(MONSTER_ENEMIES).filter(id => id !== 'kobold-hunter')) assert.equal(entries.find(entry => entry.id === id).unlocked, false);
  assert.deepEqual(encounters, snapshot);
  assert.ok(isMonsterArtId(identity.artId));
  assert.equal(isMonsterArtId('raider'), false);
  for (const [stageId, roles] of Object.entries(MONSTER_STAGE_ROLES)) for (const id of Object.values(roles)) assert.ok(Number(stageId) >= MONSTER_ENEMIES[id].firstStage);
});


test('species names retain the original slot item drop rules', () => {
  const lootSource = app.slice(app.indexOf('function rollEnemyLoot('), app.indexOf('const MAX_GEAR_ENHANCE', app.indexOf('function rollEnemyLoot(')));
  const fixedMath = Object.create(Math);
  fixedMath.random = () => 0;
  const roll = vm.runInNewContext(`${lootSource}\nrollEnemyLoot`, {
    Math: fixedMath,
    createEmptyLoot: () => ({ gold: 0, items: {}, gear: [] }),
    addLootItem: (loot, key, count) => ({ ...loot, items: { ...loot.items, [key]: count } }),
    addLootGear: (loot, key) => ({ ...loot, gear: [key] }),
  });
  for (const stage of stages) {
    const before = previous.getStageEnemySquadTemplates(stage);
    const after = current.getStageEnemySquadTemplates(stage);
    for (const [index, template] of after.entries()) if (template.artId) {
      assert.deepEqual(roll({ ...template, type: 'enemy' }, stage), roll({ ...before[index], type: 'enemy' }, stage));
    }
  }
});
