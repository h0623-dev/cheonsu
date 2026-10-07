import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stages } from '../src/data/stages.js';
import { STORY_SCENES, STORY_ARCS, getStoryArcIndex } from '../src/data/storyScenes.js';
import { CHAPTER_BOSS_NAMES } from '../src/data/chapterIdentity.js';
import { BATTLEFIELD_PLANS, getBattlefieldPlan } from '../src/data/battlefieldPlans.js';
import { createBattlefieldTerrain } from '../src/data/stageTerrain.js';
import { alignMapToArtwork } from '../src/data/battlefieldGround.js';
import { CAMPAIGN_STAGE_COUNT, EXPANSION_REGIONS, EXPANSION_STAGE_DESIGNS } from '../src/data/campaignExpansion.js';
import { EXPANSION_ENEMY_TEMPLATES } from '../src/data/expansionEnemies.js';
import { getNewTerrainPolicy, isDeploymentTerrainUnsafe } from '../src/data/terrainPolicy.js';
import { connectedGround, distributeBattleFormations } from '../src/engine/formations.js';
import { getDeploymentCells, reconcileDeploymentPlacements, validateDeploymentPlacements, applyDeploymentPlacements } from '../src/engine/deploymentEngine.js';
import { getStageMission } from '../src/engine/stageMission.js';
import { getBattleOutcome } from '../src/engine/battleOutcome.js';
import { processTerrainStartEffects } from '../src/engine/statusEngine.js';
import { MUSIC_TRACKS, getMusicTheme } from '../src/data/musicScore.js';
import { getChapterBrief } from '../src/data/chapterBriefs.js';
import { EQUIPMENT } from '../src/data/equipment.js';
import { applyEquipmentStats, getInitialParty } from '../src/engine/partyEngine.js';
import { createVictoryCheckpoint } from '../src/engine/campaignProgress.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';

const baseline = JSON.parse(await readFile(new URL('./fixtures/campaign-30-baseline.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expansion = stages.filter(stage => stage.id >= 31);
const key = ({ x, y }) => `${x},${y}`;

// Fixed pre-change fingerprints catch accidental edits to actual maps, stats,
// rewards, names and dialogue, not merely the number of old chapters.
test('the original 30 chapters retain every authored stat, reward, map and ending', () => {
  assert.equal(hash(stages.slice(0, 30)), baseline.stages);
  assert.equal(hash(Object.fromEntries(Object.entries(STORY_SCENES).filter(([id]) => +id <= 30))), baseline.story);
  assert.equal(hash(STORY_ARCS.slice(0, 5)), baseline.storyArcs);
  assert.equal(hash(Object.fromEntries(Object.entries(CHAPTER_BOSS_NAMES).filter(([id]) => +id <= 30))), baseline.bossNames);
  assert.equal(hash(BATTLEFIELD_PLANS.slice(0, 30)), baseline.plans);
  assert.equal(hash(Array.from({ length: 30 }, (_, i) => createBattlefieldTerrain(i + 1))), baseline.maps);
});

test('50 sequential chapters include four separate five-chapter rebuilding regions', () => {
  assert.equal(CAMPAIGN_STAGE_COUNT, 50);
  assert.deepEqual(stages.map(stage => stage.id), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.equal(expansion.length, 20);
  assert.equal(EXPANSION_REGIONS.length, 4);
  assert.deepEqual(EXPANSION_REGIONS.map(region => region.biome), ['coast', 'snow', 'workshop', 'starlight']);
  assert.equal(new Set(expansion.map(stage => JSON.stringify(stage.map))).size, 20);
  assert.deepEqual(getBattlefieldPlan(50), BATTLEFIELD_PLANS[49]);
  assert.equal(getBattlefieldPlan(99).id, 50);
  assert.notDeepEqual(getBattlefieldPlan(31), getBattlefieldPlan(30));
});

for (const stage of expansion) test(`Expansion ${stage.id}: 15 allies deploy safely, enemies stay reachable and missions match outcomes`, () => {
  const plan = getBattlefieldPlan(stage.id);
  assert.equal(stage.map.length, plan.height);
  assert.ok(stage.map.every(row => row.length === plan.width));
  const walkable = stage.map.flat().filter(tile => !['block', 'wall', 'void'].includes(tile));
  const ground = connectedGround(stage.map), groundKeys = new Set(ground.map(key));
  assert.equal(ground.length, walkable.length, 'No disconnected spawn pockets');
  assert.ok(stage.map.flat().some(tile => getNewTerrainPolicy(tile)), 'New region has its own terrain');
  assert.deepEqual(alignMapToArtwork(stage.map, stage.id), stage.map, 'Old frontier crop never masks a new region');
  const initial = JSON.stringify(stage);
  assert.equal(new Set(stage.units.map(unit => unit.id)).size, stage.units.length);
  assert.equal(new Set(stage.units.map(key)).size, stage.units.length);
  for (const unit of stage.units) {
    assert.ok(groundKeys.has(key(unit)), `${unit.id} is reachable`);
    assert.equal(unit.moved, false);
    assert.equal(unit.acted, false);
    if (unit.type !== 'ally') {
      assert.ok(EXPANSION_ENEMY_TEMPLATES[unit.artId]);
      assert.ok(EXPANSION_ENEMY_TEMPLATES[unit.artId].firstStage <= stage.id);
      assert.equal(unit.hp, unit.maxHp);
      assert.ok(unit.level >= 16);
    }
  }
  const heroes = Array.from({ length: 15 }, (_, i) => ({
    ...stage.units.find(unit => unit.id === 'hero'), id: i === 0 ? 'hero' : `owned-${i}`, type: 'ally',
  }));
  const units = distributeBattleFormations(stage, [...heroes, ...stage.units.filter(unit => unit.type !== 'ally')]);
  const cells = getDeploymentCells(stage, units);
  assert.ok(cells.length >= 15, `All 15 owned allies fit on chapter ${stage.id}`);
  assert.ok(cells.every(cell => !isDeploymentTerrainUnsafe(stage.map[cell.y][cell.x])));
  const ids = heroes.map(unit => unit.id);
  const placements = reconcileDeploymentPlacements(null, stage, units, ids, cells);
  assert.equal(validateDeploymentPlacements(stage, units, ids, placements, cells).ok, true);
  const deployed = applyDeploymentPlacements(units, placements);
  assert.equal(new Set(deployed.map(key)).size, deployed.length);
  assert.deepEqual(processTerrainStartEffects(deployed, 'ally', stage.map).units, deployed, 'Deployment gives neither harm nor free terrain buffs');
  assert.deepEqual(deployed.filter(unit => unit.type !== 'ally'), units.filter(unit => unit.type !== 'ally'));
  const mission = getStageMission(stage), boss = stage.units.find(unit => unit.type === 'boss');
  assert.deepEqual(mission.bossNames, [boss.name]);
  assert.ok(mission.victoryConditions[0].text.includes(boss.name));
  assert.equal(mission.victoryJoin, '또는');
  assert.equal(getBattleOutcome(stage, deployed), null);
  assert.equal(getBattleOutcome(stage, deployed.filter(unit => unit.id !== boss.id)), 'victory');
  assert.equal(getBattleOutcome(stage, deployed.filter(unit => unit.type === 'ally')), 'victory');
  assert.equal(getBattleOutcome(stage, deployed.filter(unit => unit.id !== 'hero')), null);
  assert.equal(getBattleOutcome(stage, deployed.filter(unit => unit.id !== 'hero' && unit.id !== boss.id)), 'victory');
  assert.equal(getBattleOutcome(stage, deployed.filter(unit => unit.type !== 'ally')), 'defeat');
  assert.equal(JSON.stringify(stage), initial, 'Building and deploying never mutates authored chapter data');
});

test('new allies join at 32/37/42/47 and the new finale keeps Garon separate from the old shadow', () => {
  assert.deepEqual(EXPANSION_STAGE_DESIGNS.filter(stage => stage.allyJoin).map(stage => [stage.id, stage.allyJoin]),
    [[32, 'mare'], [37, 'harin'], [42, 'edan'], [47, 'sylvan']]);
  for (const id of [35, 40, 45, 50]) {
    const stage = stages[id - 1], boss = stage.units.find(unit => unit.type === 'boss');
    assert.ok(STORY_SCENES[id].intro.some(line => line.speaker === boss.name));
    assert.ok(STORY_SCENES[id].clear.length >= 3);
  }
  assert.equal(CHAPTER_BOSS_NAMES[28], '흑천 가론');
  assert.equal(CHAPTER_BOSS_NAMES[30], '흑야의 잔영');
  assert.equal(CHAPTER_BOSS_NAMES[50], '첫 맹세 수호체 아스테르');
  assert.ok(STORY_SCENES[30].intro.some(line => line.speaker === '흑천 가론' && line.text.includes('저건 내가 아니다')));
  assert.ok(STORY_SCENES[49].intro.some(line => line.speaker === '흑천 가론' && line.text.includes('내 책임')));
  assert.ok(STORY_SCENES[50].clear.some(line => line.speaker === '카일' && line.text.includes('함께 돌아가자')));
});

test('all expansion chapters have readable context, correct five-chapter story groups and valid music', () => {
  for (const stage of stages) {
    assert.ok(getChapterBrief(stage.id)?.text.length > 25);
    const theme = getMusicTheme('battle', stage.id);
    assert.ok(MUSIC_TRACKS[theme.id], `${stage.id} uses a real soundtrack`);
    assert.equal(getStoryArcIndex(stage.id), stage.id <= 30 ? Math.floor((stage.id - 1) / 6)
      : 5 + Math.floor((stage.id - 31) / 5));
  }
  assert.equal(getMusicTheme('battle', 30).id, 'finale');
  assert.equal(getMusicTheme('battle', 50).id, 'finale');
  for (const stageId of [35, 40, 45]) assert.equal(getMusicTheme('battle', stageId).id, 'boss');
  for (const [stageId, theme] of [[31, 'frontier'], [36, 'snow'], [41, 'fortress'], [46, 'citadel']]) {
    assert.equal(getMusicTheme('battle', stageId).id, theme);
  }
});

test('four recruits receive usable weapons and existing equipment stats never stack or change HP', () => {
  for (const [stageId, unitId, weaponId] of [[32, 'mare', 'mareSpear'], [37, 'harin', 'harinBracers'],
    [42, 'edan', 'edanHammer'], [47, 'sylvan', 'sylvanStaff']]) {
    assert.ok(stages[stageId - 1].reward.gear.includes(weaponId));
    const weapon = EQUIPMENT[weaponId];
    assert.equal(weapon.slot, 'weapon');
    assert.deepEqual(weapon.allowed, [unitId]);
    assert.ok(EQUIPMENT.leatherArmor.allowed.includes(unitId));
    const unit = { id: unitId, type: 'ally', baseAtk: 10, baseDef: 7, atk: 10, def: 7,
      hp: 19, maxHp: 30, equipment: { weapon: weaponId, armor: 'leatherArmor' } };
    const equipped = applyEquipmentStats(unit);
    assert.equal(equipped.atk, 10 + weapon.atk);
    assert.equal(equipped.def, 8 + weapon.def);
    assert.equal(equipped.hp, 19);
    assert.equal(equipped.maxHp, 30);
    assert.deepEqual(applyEquipmentStats(equipped), equipped);
  }
});

test('the 50th chapter grants its real commemorative armor once and preserves it on save and replay', () => {
  const party = getInitialParty();
  const stage = stages[49];
  assert.deepEqual(stage.reward.gear, ['oathCommemorative']);
  const armor = EQUIPMENT.oathCommemorative;
  assert.equal(armor.slot, 'armor');
  assert.equal(armor.allowed.length, 21);
  assert.equal(armor.atk, 1);
  assert.equal(armor.def, 2);
  const data = normalizeSaveData({ selectedStage: stage, party, units: party,
    clearedStages: stages.slice(0, 49).map(entry => entry.id), stageRewardClaimed: false,
    gold: 100, inventory: { potion: 1 }, gearInventory: ['ironSword'],
    battleLoot: { gold: 0, items: {}, gear: [] } }, '1.99.162');
  const settlement = { party, reward: { gold: 1000, potion: 1 }, careerStats: {}, stageMastery: {}, message: '50장 클리어' };
  const first = createVictoryCheckpoint(data, settlement).checkpoint;
  assert.ok(first.gearInventory.includes('oathCommemorative'));
  assert.ok(first.gearInventory.includes('ironSword'));
  assert.ok(first.clearedStages.includes(50));
  const saved = normalizeSaveData(first, '1.99.162');
  assert.deepEqual(saved.gearInventory, first.gearInventory);
  const again = createVictoryCheckpoint(saved, settlement);
  assert.equal(again.replay, true);
  assert.deepEqual(again.checkpoint.gearInventory, first.gearInventory);
  assert.equal(again.checkpoint.gold, first.gold);
  assert.equal(again.checkpoint.gearInventory.filter(id => id === 'oathCommemorative').length, 1);
});
