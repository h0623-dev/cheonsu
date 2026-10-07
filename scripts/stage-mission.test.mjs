import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { stages } from '../src/data/stages.js';
import { alignMapToArtwork } from '../src/data/battlefieldGround.js';
import { createBattlefieldTerrain } from '../src/data/stageTerrain.js';
import { getBattlefieldPlan } from '../src/data/battlefieldPlans.js';
import { getChapterBossName } from '../src/data/chapterIdentity.js';
import { applyStageMonsterAppearance } from '../src/data/monsterEnemies.js';
import { distributeBattleFormations } from '../src/engine/formations.js';
import { withStageEnemyLevel } from '../src/engine/enemyProgression.js';
import { getBattleOutcome } from '../src/engine/battleOutcome.js';
import { getStageRoundLimit } from '../src/engine/stageRules.js';
import { getStageMission } from '../src/engine/stageMission.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { getInitialParty } from '../src/engine/partyEngine.js';
import { applyExpansionEnemyIdentity, createExpansionEnemy, createExpansionExtraEnemy, getExpansionEnemyKeys } from '../src/data/expansionEnemies.js';

const hero = { id: 'hero', type: 'ally', name: '카일', hp: 20 };
const boss = { id: 'boss', type: 'boss', name: '적 지휘관', hp: 20 };
const guard = { id: 'guard', type: 'enemy', name: '수비병', hp: 10 };
const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const { body } = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
const declares = (node, name) => node.id?.name === name || node.declarations?.some(entry => entry.id.name === name);
const first = body.findIndex(node => declares(node, 'MAX_DEPLOY_COUNT'));
const last = body.findIndex(node => declares(node, 'getLogType'));
const variant = body.find(node => declares(node, 'ENEMY_VARIANT_KEYS'));
assert.ok(first >= 0 && last > first && variant);
const builders = runInNewContext([
  ...body.slice(first, last).map(node => source.slice(node.start, node.end)),
  source.slice(variant.start, variant.end),
  '({ expandStageForLargeBattle })',
].join('\n'), {
  alignMapToArtwork, createBattlefieldTerrain, getBattlefieldPlan, getChapterBossName,
  applyStageMonsterAppearance, distributeBattleFormations, withStageEnemyLevel,
  applyExpansionEnemyIdentity, createExpansionEnemy, createExpansionExtraEnemy, getExpansionEnemyKeys,
  clone: value => JSON.parse(JSON.stringify(value)),
  Math: Object.assign(Object.create(Math), { random: () => { throw new Error('Mission briefing must be deterministic'); } }),
});

test('single-leader briefing states alternative victory paths matching the actual live outcome', () => {
  const stage = { id: 1, units: [hero, boss, guard] };
  const mission = getStageMission(stage);
  assert.deepEqual(mission.victoryConditions, [
    { id: 'leaders', text: '적 대장 「적 지휘관」 섬멸' },
    { id: 'enemies', text: '모든 적 섬멸' },
  ]);
  assert.equal(mission.victoryJoin, '또는');
  assert.match(mission.note, /일반 적이나 증원이 남아 있어도 승리/);
  assert.equal(getBattleOutcome(stage, [hero, guard]), 'victory');
  assert.equal(getBattleOutcome(stage, [hero]), 'victory');
  assert.equal(getBattleOutcome(stage, [hero, boss]), null);
  assert.equal(getBattleOutcome(stage, [guard]), 'defeat', 'Allied annihilation takes priority over killing the commander');
});

test('no-leader stages require every living enemy, including spawned reinforcements, to be removed', () => {
  const stage = { id: 4, units: [hero, guard] };
  const mission = getStageMission(stage);
  assert.deepEqual(mission.bossNames, []);
  assert.deepEqual(mission.victoryConditions, [{ id: 'enemies', text: '모든 적 섬멸' }]);
  const reinforcement = { ...guard, id: 'reinforcement-4-2', isReinforcement: true };
  assert.equal(getBattleOutcome(stage, [hero, reinforcement]), null);
  assert.equal(getBattleOutcome(stage, [hero]), 'victory');
  assert.match(mission.note, /증원까지 모두/);
});

test('all starting leaders must fall, while a newly spawned enemy does not change that objective', () => {
  const second = { ...boss, id: 'second-boss', name: '북문 지휘관' };
  const stage = { id: 2, units: [hero, boss, second, guard] };
  const mission = getStageMission(stage);
  assert.equal(mission.victoryConditions[0].text, '적 대장 전원 섬멸(「적 지휘관」, 「북문 지휘관」)');
  assert.equal(getBattleOutcome(stage, [hero, second, guard]), null);
  assert.equal(getBattleOutcome(stage, [hero, guard, { ...boss, id: 'new-reinforcement-boss' }]), 'victory');
  assert.equal(getBattleOutcome(stage, [second, guard]), 'defeat');
});

test('legacy boss IDs and true boss types share the current predicate without confusing an ally named boss', () => {
  const legacy = { ...boss, type: 'enemy', name: '옛 대장' };
  const commander = { ...boss, id: 'commander', name: '별도 지휘관' };
  assert.deepEqual(getStageMission({ units: [hero, legacy, commander] }).bossNames, ['옛 대장', '별도 지휘관']);
  assert.deepEqual(getStageMission({ units: [hero, { ...legacy, type: 'ally' }, guard] }).bossNames, []);
  assert.equal(getBattleOutcome({ units: [hero, legacy] }, [hero, guard]), 'victory');
});

test('defeat briefing uses OR and includes the exact final allied-turn round deadline', () => {
  const stage = { id: 3, units: [hero, boss, guard], map: Array.from({ length: 18 }, () => Array(16).fill('plain')) };
  const mission = getStageMission(stage);
  assert.equal(mission.roundLimit, getStageRoundLimit(stage));
  assert.equal(mission.defeatJoin, '또는');
  assert.deepEqual(mission.defeatConditions, [
    { id: 'allies', text: '아군 전멸' },
    { id: 'round-limit', text: '24라운드의 아군 턴 종료까지 승리하지 못함' },
  ]);
  assert.equal(getBattleOutcome(stage, []), 'defeat');
  assert.equal(getBattleOutcome(stage, [{ ...hero, hp: 0 }, guard]), 'defeat');
  // Use the actual App end-turn branch to check victory is resolved before the deadline.
  const victoryCheck = source.indexOf('if (getBattleOutcome(selectedStage, processedUnits) === "victory")');
  const deadlineCheck = source.indexOf('if (round >= activeRoundLimit)', victoryCheck);
  assert.ok(victoryCheck >= 0 && deadlineCheck > victoryCheck);
  const endTurnChecks = source.slice(victoryCheck, deadlineCheck + 180);
  assert.ok(endTurnChecks.indexOf('return;') < endTurnChecks.indexOf('if (round >= activeRoundLimit)'));
  assert.equal(getBattleOutcome(stage, [hero]), 'victory', 'Meeting the objective on the last allied turn wins');
  assert.ok(source.includes('(migratedData.round >= restoredRoundLimit && restoredAllyTurnEnded)'), 'Resume preserves that same allied-turn deadline');
});

test('mission deadlines extend the full existing enemy-count and map-size allowance by half, rounding up to at most forty-five rounds', () => {
  for (const [enemies, expected] of [[11, 21], [12, 23], [15, 23], [16, 24], [19, 24], [20, 26]]) {
    const stage = { id: 1, units: [hero, ...Array.from({ length: enemies }, (_, id) => ({ ...guard, id: `guard-${id}` }))] };
    assert.equal(getStageMission(stage).roundLimit, expected);
  }
  for (const [size, expected] of [[13, 21], [14, 23], [15, 23], [16, 24], [32, 24]]) {
    const stage = { id: 1, units: [hero, guard], map: Array.from({ length: size }, () => Array(10).fill('plain')) };
    assert.equal(getStageMission(stage).roundLimit, expected);
  }
  const huge = { id: 31, units: Array.from({ length: 26 }, (_, id) => ({ ...guard, id: `guard-${id}` })),
    map: Array.from({ length: 32 }, () => Array(32).fill('plain')) };
  assert.equal(getStageMission(huge).roundLimit, 45);
  assert.equal(getStageRoundLimit(huge), 45, 'Reading the deadline repeatedly never compounds the extension');
});

test('the extra half applies across all fifty chapter base deadlines', () => {
  const chapterGroups = [[1, 3, 21], [4, 6, 24], [7, 12, 27], [13, 18, 30], [19, 24, 33], [25, 30, 36], [31, 50, 39]];
  for (const [firstChapter, lastChapter, expected] of chapterGroups) {
    for (let chapter = firstChapter; chapter <= lastChapter; chapter++) {
      assert.equal(getStageRoundLimit(chapter), expected, `Chapter ${chapter}`);
    }
  }
});

test('all actual expanded battlefields retain their true commander names and current formation-based deadlines', () => {
  for (const original of stages) for (const count of [4, 15]) {
    const active = JSON.parse(JSON.stringify(builders.expandStageForLargeBattle(original, count)));
    const before = JSON.stringify(active);
    const mission = getStageMission(active);
    const leaders = active.units.filter(unit => unit.type === 'boss' || (unit.id === 'boss' && unit.type !== 'ally'));
    assert.deepEqual(mission.bossNames, Array.from(leaders, unit => unit.name));
    assert.equal(mission.roundLimit, getStageRoundLimit(active));
    assert.ok(mission.victoryConditions[0].text.includes(leaders[0].name));
    assert.ok(mission.defeatConditions.some(condition => condition.text.startsWith(`${getStageRoundLimit(active)}라운드`)));
    assert.deepEqual(mission.defeatConditions.map(condition => condition.id), ['allies', 'round-limit']);
    const protagonist = active.units.find(unit => unit.id === 'hero');
    const survivingAlly = { ...protagonist, id: 'surviving-ally', name: '생존 아군' };
    const survivors = active.units.filter(unit => unit.type === 'enemy');
    assert.equal(getBattleOutcome(active, [protagonist, ...survivors]), 'victory');
    assert.equal(getBattleOutcome(active, [survivingAlly, ...leaders, ...survivors]), null);
    assert.equal(getBattleOutcome(active, [survivingAlly, ...survivors]), 'victory');
    assert.equal(getBattleOutcome(active, survivors), 'defeat');
    assert.equal(JSON.stringify(active), before);
  }
  assert.equal(getStageMission(builders.expandStageForLargeBattle(stages[29], 4)).bossNames[0], '흑야의 잔영');
});

test('saved battles keep their old commander identities, geometry and live state when their mission is read', () => {
  const party = getInitialParty();
  const savedStage = { ...stages[29], terrainRevision: 2,
    units: [party[0], { ...boss, name: '저장된 옛 지휘관' }, guard],
    map: Array.from({ length: 12 }, () => Array(10).fill('road')) };
  const data = { screen: 'battle', selectedStage: savedStage, party,
    units: [party[0], { ...guard, hp: 3, acted: true, moved: true }],
    turn: 'ally', round: 3, clearedStages: [1], exploration: { claimed: ['kept'] } };
  const restored = normalizeSaveData(data, '1.99.162');
  const before = JSON.stringify(restored);
  const mission = getStageMission(restored.selectedStage);
  assert.deepEqual(mission.bossNames, ['저장된 옛 지휘관']);
  assert.equal(mission.roundLimit, getStageRoundLimit(savedStage));
  assert.equal(getBattleOutcome(restored.selectedStage, restored.units), 'victory');
  assert.equal(JSON.stringify(restored), before);
  assert.equal(getStageMission(null).defeatConditions[0].text, '아군 전멸');
});

test('a saved battle past its former deadline keeps its live allies, progress and current round after Kyle falls', () => {
  const party = getInitialParty();
  const savedStage = { ...stages[0], units: [party[0], party[1], boss, guard],
    map: Array.from({ length: 10 }, () => Array(10).fill('plain')) };
  const data = { screen: 'battle', selectedStage: savedStage, party,
    units: [{ ...party[0], hp: 0 }, { ...party[1], hp: 3, acted: true, moved: true }, boss, guard],
    turn: 'ally', round: 15, clearedStages: [1], exploration: { claimed: ['kept'] } };
  const restored = normalizeSaveData(data, '1.99.167');
  const before = JSON.stringify(restored);
  assert.equal(getBattleOutcome(restored.selectedStage, restored.units), null);
  assert.equal(getStageMission(restored.selectedStage).roundLimit, 21);
  assert.equal(restored.round, 15);
  assert.equal(restored.units.find(unit => unit.id === party[1].id).hp, 3);
  assert.equal(restored.units.find(unit => unit.id === party[1].id).acted, true);
  assert.deepEqual(restored.clearedStages, [1]);
  assert.deepEqual(restored.exploration.claimed, ['kept']);
  assert.equal(JSON.stringify(restored), before);
});
