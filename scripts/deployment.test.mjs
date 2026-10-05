import { withStageEnemyLevel } from '../src/engine/enemyProgression.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { stages } from '../src/data/stages.js';
import { alignMapToArtwork } from '../src/data/battlefieldGround.js';
import { createBattlefieldTerrain } from '../src/data/stageTerrain.js';
import { deploymentDepth, getBattlefieldPlan } from '../src/data/battlefieldPlans.js';
import { getChapterBossName } from '../src/data/chapterIdentity.js';
import { applyStageMonsterAppearance } from '../src/data/monsterEnemies.js';
import { distributeBattleFormations } from '../src/engine/formations.js';
import { applyEquipmentStats, getInitialParty, mergePartyIntoStage } from '../src/engine/partyEngine.js';
import { getSkillDisplayName } from '../src/data/skills.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { processTerrainStartEffects } from '../src/engine/statusEngine.js';
import {
  getDeploymentCells, sanitizeDeploymentDraft, reconcileDeploymentPlacements,
  placeDeploymentUnit, validateDeploymentPlacements, applyDeploymentPlacements,
} from '../src/engine/deploymentEngine.js';

const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const { body } = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
const declares = (node, name) => node.id?.name === name || node.declarations?.some(entry => entry.id.name === name);
const declaration = name => {
  const node = body.find(entry => declares(entry, name));
  assert.ok(node, `Actual App declaration ${name} exists`);
  return source.slice(node.start, node.end);
};
const start = body.findIndex(node => declares(node, 'MAX_DEPLOY_COUNT'));
const end = body.findIndex(node => declares(node, 'getLogType'));
assert.ok(start >= 0 && end > start);
// Exercise App's real terrain, roster, equipment, difficulty and final formation pipeline.
const builders = runInNewContext([
  ...body.slice(start, end).map(node => source.slice(node.start, node.end)),
  ...['ENEMY_VARIANT_KEYS', 'createRecruitAlly', 'DIFFICULTY_OPTIONS', 'BALANCE_PRESET_OPTIONS',
    'getDifficultyConfig', 'getBalancePresetConfig', 'scaleDifficultyStat', 'scaledDifficultyHp',
    'applyDifficultyToUnit', 'applyDifficultyToUnits'].map(declaration),
  '({ expandStageForLargeBattle, createRecruitAlly, applyDifficultyToUnits })',
].join('\n'), {
  alignMapToArtwork, createBattlefieldTerrain, getBattlefieldPlan, applyEquipmentStats,
  distributeBattleFormations, getSkillDisplayName, getChapterBossName, applyStageMonsterAppearance, withStageEnemyLevel,
  clone: value => JSON.parse(JSON.stringify(value)),
  Math: Object.assign(Object.create(Math), { random: () => { throw new Error('Deployment must be deterministic'); } }),
});
const copy = value => JSON.parse(JSON.stringify(value));
const initialParty = getInitialParty();
const fullParty = copy(['hero', 'bram', 'lina', 'aria', 'leon', 'sera', 'noah', 'yuna', 'rakan',
  'miho', 'teo', 'irene', 'kaz', 'ella', 'jin', 'luka', 'baekho']
  .map(id => initialParty.find(unit => unit.id === id) || builders.createRecruitAlly(id)));
const cellKey = ({ x, y }) => `${x},${y}`;
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const setup = (chapter = 1, count = 4) => {
  const party = fullParty.slice(0, count);
  const stage = copy(builders.expandStageForLargeBattle(stages[chapter - 1], count));
  const units = copy(distributeBattleFormations(stage,
    builders.applyDifficultyToUnits(mergePartyIntoStage(stage, party), 'hard', 'bossRush')));
  const ids = party.map(unit => unit.id);
  const cells = getDeploymentCells(stage, units);
  const placements = reconcileDeploymentPlacements(null, stage, units, ids, cells);
  return { stage, units, ids, cells, placements };
};

for (const chapter of stages) test(`Chapter ${chapter.id}: real 1/4/15-unit battles have safe manual deployment and unchanged enemies`, () => {
  for (const count of [1, 4, 15]) {
    const { stage, units, ids, cells, placements } = setup(chapter.id, count);
    freeze(stage); freeze(units); freeze(placements);
    const before = JSON.stringify({ stage, units, placements });
    const allowed = new Set(cells.map(cellKey));
    assert.ok(cells.length >= 15, 'Each actual chapter supports the full deployment limit');
    assert.equal(allowed.size, cells.length);
    for (const cell of cells) {
      assert.ok(!['block', 'wall', 'void', 'fire', 'ice', 'dark', 'rune', 'trap', 'water', 'swamp'].includes(stage.map[cell.y][cell.x]));
      const plan = getBattlefieldPlan(stage.id);
      assert.ok(deploymentDepth(cell.x / (stage.map[0].length - 1), cell.y / (stage.map.length - 1), plan.direction) >= .57);
      assert.ok(units.filter(unit => unit.type !== 'ally')
        .every(unit => Math.abs(unit.x - cell.x) + Math.abs(unit.y - cell.y) >= 7));
    }
    assert.equal(validateDeploymentPlacements(stage, units, ids, placements, cells).ok, true);
    for (const unit of units.filter(unit => unit.type === 'ally')) {
      assert.ok(allowed.has(cellKey(placements[unit.id])));
      if (allowed.has(cellKey(unit))) assert.deepEqual(placements[unit.id], { x: unit.x, y: unit.y }, 'Other safe automatic positions are preserved');
    }
    const prepared = applyDeploymentPlacements(units, placements);
    const effects = processTerrainStartEffects(prepared, 'ally', stage.map);
    assert.deepEqual(effects.units, prepared, 'No starting ally receives terrain damage, bleed or freeze');
    const unused = cells.find(cell => !Object.values(placements).some(value => cellKey(value) === cellKey(cell)));
    const moved = placeDeploymentUnit(placements, 'hero', unused, cells, ids);
    assert.equal(moved.ok, true);
    assert.equal(validateDeploymentPlacements(stage, units, ids, moved.placements, cells).ok, true);
    const started = applyDeploymentPlacements(units, moved.placements);
    assert.deepEqual(started.filter(unit => unit.type !== 'ally'), units.filter(unit => unit.type !== 'ally'));
    assert.deepEqual(started.map(({ x: _x, y: _y, ...unit }) => unit), units.map(({ x: _x, y: _y, ...unit }) => unit));
    assert.deepEqual(getDeploymentCells(stage, units), cells);
    assert.equal(JSON.stringify({ stage, units, placements }), before);
  }
});

test('unrecruited stage templates cannot enter the owned deployment roster', () => {
  const { stage, units, ids, cells, placements } = setup();
  assert.ok(stage.units.some(unit => unit.id === 'leon'));
  assert.equal(units.some(unit => unit.id === 'leon'), false);
  assert.equal(placeDeploymentUnit(placements, 'leon', cells[0], cells, ids).ok, false);
  assert.equal(placeDeploymentUnit(placements, units.find(unit => unit.type === 'boss').id, cells[0], cells, ids).ok, false);
  assert.equal(validateDeploymentPlacements(stage, units, [...ids, 'leon'], { ...placements, leon: cells[0] }, cells).ok, false);
  assert.deepEqual(Object.keys(reconcileDeploymentPlacements(null, stage, units, [...ids, 'leon'], cells)), ids);
});

test('deployment excludes isolated islands, hazardous ground and enemy approach cells', () => {
  const map = Array.from({ length: 14 }, () => Array(14).fill('block'));
  for (let y = 7; y <= 12; y++) for (let x = 4; x <= 12; x++) map[y][x] = 'plain';
  map[11][1] = 'plain';
  ['fire', 'ice', 'dark', 'rune', 'trap', 'water', 'swamp'].forEach((tile, i) => { map[10][5 + i] = tile; });
  const stage = { id: 1, map, terrainRevision: 3 };
  const allowed = new Set(getDeploymentCells(stage, []).map(cellKey));
  assert.equal(allowed.has('1,11'), false, 'Decorative island is never a deployment destination');
  for (let x = 5; x <= 11; x++) assert.equal(allowed.has(`${x},10`), false);
  assert.equal(allowed.has('4,12'), true);
  const enemy = { id: 'enemy', type: 'enemy', x: 12, y: 11 };
  const guarded = getDeploymentCells(stage, [enemy]);
  assert.ok(guarded.length > 0 && guarded.length < allowed.size);
  assert.ok(guarded.every(cell => Math.abs(cell.x - enemy.x) + Math.abs(cell.y - enemy.y) >= 7));
  assert.deepEqual(getDeploymentCells({ map: [[null]] }, []), []);
  assert.deepEqual(getDeploymentCells(stage, [{ ...enemy, x: NaN }]), []);
});

test('legacy terrain revision keeps south deployment instead of changing its historical orientation', () => {
  const stage = { id: 2, terrainRevision: 2, map: Array.from({ length: 14 }, () => Array(14).fill('plain')) };
  const cells = getDeploymentCells(stage, []);
  assert.ok(cells.length > 0 && cells.every(cell => cell.y / 13 >= .57));
  assert.ok(cells.some(cell => cell.x / 13 > .8), 'West-facing modern plan does not rewrite legacy south geometry');
});

test('manual placement, swapping, adding and removal reconcile without shifting unrelated allies', () => {
  const { stage, units, ids, cells, placements } = setup();
  freeze(placements);
  const swapped = placeDeploymentUnit(placements, 'hero', placements.bram, cells, ids);
  assert.equal(swapped.ok, true);
  assert.deepEqual(swapped.placements.hero, placements.bram);
  assert.deepEqual(swapped.placements.bram, placements.hero);
  assert.deepEqual(swapped.placements.lina, placements.lina);
  assert.deepEqual(swapped.placements.aria, placements.aria);
  const keptIds = ids.filter(id => id !== 'aria');
  const draft = { stageId: stage.id, placements: swapped.placements };
  const removed = reconcileDeploymentPlacements(draft, stage, units, keptIds, cells);
  assert.equal(Object.hasOwn(removed, 'aria'), false);
  assert.deepEqual(removed.hero, swapped.placements.hero);
  const added = reconcileDeploymentPlacements({ stageId: stage.id, placements: removed }, stage, units, ids, cells);
  assert.deepEqual(added.hero, removed.hero);
  assert.deepEqual(added.bram, removed.bram);
  assert.deepEqual(added.aria, placements.aria);
  const missingHero = { ...placements }; delete missingHero.hero;
  const occupied = placeDeploymentUnit(missingHero, 'hero', placements.bram, cells, ids);
  assert.equal(occupied.ok, false);
  assert.strictEqual(occupied.placements, missingHero);
  const free = cells.find(cell => !Object.values(missingHero).some(value => cellKey(cell) === cellKey(value)));
  assert.equal(placeDeploymentUnit(missingHero, 'hero', free, cells, ids).ok, true);
  assert.equal(placeDeploymentUnit(missingHero, 'hero', free, cells).ok, false, 'Unknown IDs require an explicit owned roster');
});

test('changed chapter, forbidden coordinates and draft collisions recover only the affected placements', () => {
  const { stage, units, ids, cells, placements } = setup();
  const bogus = { stageId: stage.id, placements: { ...placements, hero: { x: 0, y: 0 }, bram: placements.lina } };
  const recovered = reconcileDeploymentPlacements(bogus, stage, units, ids, cells);
  assert.deepEqual(recovered.bram, placements.lina, 'First valid claimant keeps its manual choice');
  assert.notDeepEqual(recovered.lina, placements.lina, 'A duplicate claim is repaired without overlapping');
  assert.deepEqual(recovered.aria, placements.aria);
  assert.deepEqual(reconcileDeploymentPlacements(bogus, stage, units, ids, cells), recovered);
  assert.equal(validateDeploymentPlacements(stage, units, ids, recovered, cells).ok, true);
  assert.deepEqual(reconcileDeploymentPlacements({ stageId: 2, placements: bogus.placements }, stage, units, ids, cells), placements);
  const restricted = cells.slice(0, 1);
  const shortage = reconcileDeploymentPlacements(null, stage, units, ids, restricted);
  assert.equal(Object.keys(shortage).length, 1);
  assert.equal(validateDeploymentPlacements(stage, units, ids, shortage, restricted).ok, false);
});

test('blocked, enemy, out-of-map and forged supplied cells cannot pass final deployment validation', () => {
  const { stage, units, ids, cells, placements } = setup();
  const forbidden = [{ x: 0, y: 0 }, { x: 127, y: 127 }, { x: 1.5, y: 10 }, { x: -1, y: 10 },
    { x: '1', y: 10 }, ...units.filter(unit => unit.type !== 'ally').map(({ x, y }) => ({ x, y }))];
  for (const cell of forbidden) {
    const result = placeDeploymentUnit(placements, 'hero', cell, cells, ids);
    assert.equal(result.ok, false);
    assert.strictEqual(result.placements, placements);
    assert.equal(validateDeploymentPlacements(stage, units, ids, { ...placements, hero: cell }, [...cells, cell]).ok, false);
  }
  assert.equal(validateDeploymentPlacements(stage, units, ids, { ...placements, bram: placements.hero }, cells).ok, false);
  assert.equal(validateDeploymentPlacements(stage, units, ids, { ...placements, unknown: cells[0] }, cells).ok, false);
  assert.equal(validateDeploymentPlacements(stage, units, ['bram'], { bram: placements.bram }, cells).ok, false);
  assert.equal(validateDeploymentPlacements(stage, units, [...ids, 'hero'], placements, cells).ok, false);
  assert.equal(validateDeploymentPlacements(stage, units, [], {}, cells).ok, false);
  assert.equal(validateDeploymentPlacements(stage, units, fullParty.map(unit => unit.id), placements, cells).ok, false);
});

test('optional draft sanitation rejects inherited data, unsafe object keys and malformed coordinates', () => {
  assert.deepEqual(sanitizeDeploymentDraft(null, 1), { stageId: 1, placements: {} });
  assert.deepEqual(sanitizeDeploymentDraft({ stageId: 2, placements: { hero: { x: 3, y: 12 } } }, 1), { stageId: 1, placements: {} });
  assert.deepEqual(sanitizeDeploymentDraft({ stageId: 1, placements: {} }, undefined), { stageId: null, placements: {} });
  const poisoned = JSON.parse('{"stageId":1,"placements":{"__proto__":{"x":3,"y":12},"constructor":{"x":4,"y":12},"prototype":{"x":5,"y":12},"hero":{"x":3,"y":12},"bram":{"x":3.5,"y":12},"lina":{"x":128,"y":12},"aria":{"x":3,"y":-1}}}');
  assert.deepEqual(sanitizeDeploymentDraft(poisoned, 1), { stageId: 1, placements: { hero: { x: 3, y: 12 } } });
  assert.deepEqual(sanitizeDeploymentDraft(Object.create({ stageId: 1, placements: { hero: { x: 3, y: 12 } } }), 1), { stageId: 1, placements: {} });
  const inherited = Object.create({ hero: { x: 3, y: 12 } });
  inherited.bram = Object.create({ x: 4, y: 12 });
  inherited.lina = { x: 5, y: 12 };
  assert.deepEqual(sanitizeDeploymentDraft({ stageId: 1, placements: inherited }, 1), { stageId: 1, placements: { lina: { x: 5, y: 12 } } });
  assert.equal(Object.prototype.x, undefined);
  assert.equal(Object.prototype.y, undefined);
});

test('moving rejects injected IDs and inherited coordinates without mutating the source', () => {
  const { ids, cells, placements } = setup();
  const before = copy(placements);
  for (const id of ['__proto__', 'constructor', 'prototype', 'enemy', 'unrecruited']) {
    assert.equal(placeDeploymentUnit(placements, id, cells[0], cells, ids).ok, false);
  }
  assert.equal(placeDeploymentUnit(placements, 'hero', Object.create({ x: cells[0].x, y: cells[0].y }), cells, ids).ok, false);
  const poisoned = JSON.parse('{"__proto__":{"x":3,"y":12},"hero":{"x":4,"y":12}}');
  assert.equal(placeDeploymentUnit(poisoned, 'hero', cells[0], cells, ids).ok, false);
  const injected = { ...placements, enemy: cells[0] };
  assert.equal(placeDeploymentUnit(injected, 'hero', cells[0], cells, ids).ok, false);
  assert.deepEqual(placements, before);
  assert.equal(Object.prototype.x, undefined);
});

test('applying coordinates changes no battle stats, action flags, art, inventory or enemy objects', () => {
  const { units, placements, cells } = setup();
  const decorated = units.map(unit => ({ ...unit, hp: 3, acted: true, moved: true, guard: true,
    status: [{ type: 'poison', turns: 2 }], skillCooldowns: { test: 2 }, artId: 'preserved-art',
    equipment: { weapon: 'ironSword', armor: 'leatherArmor' } }));
  freeze(decorated);
  const nextPositions = { ...placements, hero: cells[0], [decorated.find(unit => unit.type !== 'ally').id]: cells[1] };
  const result = applyDeploymentPlacements(decorated, nextPositions);
  assert.deepEqual(result.map(({ x: _x, y: _y, ...unit }) => unit), decorated.map(({ x: _x, y: _y, ...unit }) => unit));
  for (let i = 0; i < decorated.length; i++) if (decorated[i].type !== 'ally') assert.strictEqual(result[i], decorated[i]);
  assert.deepEqual(result.find(unit => unit.id === 'hero').equipment, decorated.find(unit => unit.id === 'hero').equipment);
  assert.deepEqual(applyDeploymentPlacements(decorated, Object.create({ hero: cells[0] })), decorated);
});

test('deployment drafts round-trip while old in-progress saves keep geometry, roster, damage, flags and progress', () => {
  const { stage, units, ids, cells, placements } = setup(4);
  const swapped = placeDeploymentUnit(placements, 'hero', placements.bram, cells, ids).placements;
  const live = units.filter(unit => unit.id !== 'aria').map(unit => ({ ...unit,
    hp: Math.min(unit.maxHp, 3), moved: true, acted: unit.id === 'hero', guard: true,
    status: [{ type: 'poison', turns: 2 }], facing: 'west', skillCooldowns: { firebolt: 2 } }));
  const raw = {
    version: '1.99.159', screen: 'battle', selectedStage: { ...stage, terrainRevision: 2 },
    party: fullParty.slice(0, 4), units: live, deployedIds: ids, turn: 'enemy', round: 6,
    clearedStages: [1, 2, 3], gold: 8123, exploration: { claimed: ['s1-sword-notes'], relics: [], techniques: ['hero-gale'] },
    inventory: { potion: 12 }, gearInventory: ['ironSword'], gearEnhance: { ironSword: 3 },
    supportPoints: { hero_lina: 52 }, stageMastery: { 1: { stars: 4 } },
  };
  freeze(raw);
  const before = JSON.stringify(raw);
  const legacy = normalizeSaveData(raw, '1.99.160');
  assert.deepEqual(legacy.deploymentDraft, { stageId: 4, placements: {} });
  const withDraft = normalizeSaveData({ ...raw, deploymentDraft: { stageId: 4, placements: swapped } }, '1.99.160');
  assert.deepEqual(withDraft.deploymentDraft, { stageId: 4, placements: swapped });
  assert.deepEqual(withDraft.units, legacy.units);
  assert.deepEqual(withDraft.selectedStage.map, raw.selectedStage.map);
  assert.equal(withDraft.selectedStage.terrainRevision, 2);
  assert.equal(withDraft.units.some(unit => unit.id === 'aria'), false, 'An undeployed or fallen ally is not revived');
  for (const unit of live) {
    const restored = withDraft.units.find(candidate => candidate.id === unit.id);
    for (const field of ['x', 'y', 'hp', 'moved', 'acted', 'guard', 'status', 'facing', 'skillCooldowns']) assert.deepEqual(restored[field], unit[field]);
  }
  for (const field of ['turn', 'round', 'clearedStages', 'gold', 'inventory', 'gearInventory', 'gearEnhance', 'supportPoints', 'stageMastery', 'exploration']) {
    assert.deepEqual(withDraft[field], legacy[field]);
  }
  assert.deepEqual(normalizeSaveData(copy(withDraft), '1.99.160').deploymentDraft, withDraft.deploymentDraft);
  assert.equal(JSON.stringify(raw), before);
  const deploy = normalizeSaveData({ ...raw, screen: 'deployment', deploymentDraft: { stageId: 4, placements: swapped } }, '1.99.160');
  assert.equal(deploy.screen, 'deployment');
  assert.deepEqual(reconcileDeploymentPlacements(deploy.deploymentDraft, stage, units, ids, cells), swapped);
  assert.deepEqual(normalizeSaveData({}, '1.99.160').deploymentDraft, { stageId: 1, placements: {} });
});
