import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  applyExpansionEnemyIdentity, createExpansionEnemy, createExpansionExtraEnemy, getExpansionEnemyKeys,
  isExpansionEnemyKey, consumeExpansionEnemyAttackBoost, createExpansionBossHazards,
} from '../src/data/expansionEnemies.js';
import { withStageEnemyLevel } from '../src/engine/enemyProgression.js';
import { canAttackTarget, canCounter, getAttackTiles } from '../src/engine/movement.js';
import { applySkillStatusAfterHit } from '../src/engine/statusEngine.js';
import { calculateDamage, calculateHit, calculateCrit, getCombatAffinity, getUnitCombatClass } from '../src/engine/combat.js';
import { NEW_TERRAIN_IDS, getNewTerrainPolicy, getNewTerrainCombatModifiers } from '../src/data/terrainPolicy.js';
import { isMonsterArtId } from '../src/data/monsterEnemies.js';
import { getBattleOutcome, spendAction } from '../src/engine/battleOutcome.js';
import { stages } from '../src/data/stages.js';

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const part = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
const factorySource = [
  part('function getStageEnemySquadTemplates(', 'function inActiveMap('),
  part('function createLargeExtraEnemy(', 'function expandStageForLargeBattle('),
  part('function createReinforcementUnit(', 'function getReinforcementSpawnPositions('),
  part('function createBossPatternHazards(', 'function expandMapToLarge('),
].join('\n');
const factory = vm.runInNewContext(`${factorySource}\n({getStageEnemySquadTemplates,applyStageEnemyIdentity,createLargeExtraEnemy,createReinforcementUnit,createBossPatternHazards})`, {
  applyExpansionEnemyIdentity, createExpansionEnemy, createExpansionExtraEnemy, getExpansionEnemyKeys,
  isExpansionEnemyKey, createExpansionBossHazards, withStageEnemyLevel,
});
const map = Array.from({ length: 8 }, () => Array(8).fill('plain'));
const hero = { id: 'hero', type: 'ally', name: '카일', hp: 80, maxHp: 80, atk: 30, def: 15, move: 3, range: 1, x: 5, y: 3 };

test('actual App terrain tactics apply cover, route and magic modifiers without changing base stats', () => {
  const source = part('function getSide(', 'function applyBattleTactics(');
  const getTactics = vm.runInNewContext(`${source}\ncreateBattleTactics`, {
    getNewTerrainCombatModifiers, getUnitCombatClass, getAttackTiles,
  });
  const attacker = { ...hero, id: 'aria', x: 0, y: 0 };
  const defender = { ...createExpansionEnemy(31, 'crab_guard'), x: 1, y: 0 };
  for (const tile of NEW_TERRAIN_IDS) {
    const policy = getNewTerrainPolicy(tile);
    const offensive = getTactics(attacker, defender, [attacker, defender], [[tile, 'plain']]);
    const defensive = getTactics(attacker, defender, [attacker, defender], [['plain', tile]]);
    assert.equal(offensive.hitMod, policy.effect === 'route' || policy.effect === 'magic' ? 3 : 0);
    assert.equal(offensive.damageMod, policy.effect === 'magic' ? 1 : 0);
    assert.equal(defensive.hitMod, policy.effect === 'cover' ? -3 : 0);
    assert.equal(defensive.damageMod, policy.effect === 'cover' ? -2 : 0);
    assert.equal(offensive.critMod, 0);
  }
  assert.equal(attacker.atk, hero.atk);
  assert.equal(defender.def, createExpansionEnemy(31, 'crab_guard').def);
  const legacyHill = getTactics(attacker, defender, [attacker, defender], [['hill', 'plain']]);
  assert.equal(legacyHill.hitMod, 6);
  assert.equal(legacyHill.critMod, 3);
});

test('actual App sprite getters read promoted art keys and preserve legacy boss artwork', () => {
  const source = part('function getAllyVisualProfile(', 'function getStageMapArt(');
  const readProfile = key => key ? Object.fromEntries(['battle', 'map', 'portrait', 'cutscene'].map(kind => [kind, `/art/${key}/${kind}.webp`])) : null;
  const visual = vm.runInNewContext(`${source}\n({getUnitSprite,getUnitPortrait,getCutsceneUnitSprite,getBattleMapUnitSprite,getEnemySpriteKey})`, {
    getGameCharacterArtKey: unit => unit.type === 'ally' ? unit.advancedClass || unit.id : unit.artId || unit.spriteKey || null,
    getPaintedVisualProfile: readProfile, getBossSpriteKey: () => 'boss_abyss', isExpansionEnemyKey, isMonsterArtId,
    ENEMY_VARIANT_KEYS: new Set(['void_knight', 'raider']), ALLY_VISUAL_PROFILES: {}, directionArt: {},
    getFacingArt: () => ({ rear: true }),
  });
  const promoted = { ...hero, advancedClass: 'hero-form-a' };
  assert.equal(visual.getUnitSprite(promoted), '/art/hero-form-a/battle.webp');
  assert.equal(visual.getUnitPortrait(promoted), '/art/hero-form-a/portrait.webp');
  assert.equal(visual.getCutsceneUnitSprite(promoted), '/art/hero-form-a/cutscene.webp');
  assert.equal(visual.getBattleMapUnitSprite(promoted, 'up'), '/art/hero-form-a/map.webp');
  const newBoss = createExpansionEnemy(50, 'oath_guardian');
  assert.equal(visual.getEnemySpriteKey(newBoss), 'oath_guardian');
  assert.equal(visual.getUnitSprite(newBoss), '/art/oath_guardian/battle.webp');
  const oldBoss = { type: 'boss', id: 'boss', name: '흑천 가론', spriteKey: 'void_knight' };
  assert.equal(visual.getEnemySpriteKey(oldBoss), 'boss_abyss');
  assert.equal(visual.getUnitSprite(oldBoss), '/art/boss_abyss/battle.webp');
});

test('actual App factories keep 31–50 species and use the same curve for initial, large and reinforcement enemies', () => {
  assert.equal(stages.filter(item => item.id > 30).length, 20);
  for (const stage of stages.filter(item => item.id > 30)) {
    assert.deepEqual(structuredClone(factory.getStageEnemySquadTemplates(stage).map(unit => unit.artId)), getExpansionEnemyKeys(stage));
    for (const original of stage.units.filter(unit => unit.type !== 'ally')) {
      const assigned = factory.applyStageEnemyIdentity(original, stage);
      assert.equal(assigned.artId, original.artId);
      assert.equal(assigned.maxHp, original.maxHp);
      assert.equal(assigned.level, original.level);
      assert.equal(assigned.name, original.name);
    }
    for (let index = 1; index <= 4; index += 1) {
      const extra = factory.createLargeExtraEnemy(stage, index, 3, 1);
      const reinforcement = factory.createReinforcementUnit('raider', stage, 3, index, 2, 1);
      for (const unit of [extra, reinforcement]) {
        assert.ok(getExpansionEnemyKeys(stage).includes(unit.artId));
        const template = createExpansionEnemy(stage, unit.artId);
        assert.equal(unit.maxHp, template.maxHp);
        assert.equal(unit.atk, template.atk);
        assert.equal(unit.def, template.def);
      }
      assert.equal(reinforcement.id, `reinforce-${stage.id}-3-${index}`);
      assert.equal(reinforcement.isReinforcement, true);
    }
  }
});

const attackSource = part('  const resolveEnemyAttack =', '  const executeEnemyTurn =');
function createAttackHarness(units, playback) {
  let observed = units;
  const events = [];
  const api = vm.runInNewContext(`${attackSource}\nresolveEnemyAttack`, {
    activeMap: map, canAttackTarget, canCounter, calculateDamage, calculateHit, calculateCrit, getCombatAffinity,
    consumeExpansionEnemyAttackBoost, spendAction, applySkillStatusAfterHit,
    getBattleOutcome, selectedStage: { units },
    scrollBattleMapToCell: () => {}, applyPassiveToPreview: value => value, applyBattleTactics: value => value,
    createBattleTactics: () => ({}), rollCombat: () => ({ hit: true, crit: false, damage: 9 }),
    showCombatCutscene: (...args) => playback(...args, () => observed),
    addBattleStats: value => events.push({ type: 'stats', value }), addUnitBattleStats: () => {},
    awardEnemyExperience: current => ({ units: current, messages: [] }), registerLootDrop: () => [],
    makeAttackLog: () => '공격', setUnits: value => { observed = value; events.push({ type: 'units' }); },
    setLogs: () => events.push({ type: 'logs' }), playSfx: () => {}, showDefeatDirecting: () => {},
    declareDefeat: () => events.push({ type: 'defeat' }),
  });
  return { attack: api, events, getUnits: () => observed };
}

test('actual enemy attack updates HP and consumes inspiration at contact, before cutscene completion', async () => {
  const attacker = createExpansionEnemy(32, 'eel_archer', { id: 'archer', x: 3, y: 3 });
  attacker.status = [{ type: 'inspire', power: 3, turns: 2 }];
  const initial = [attacker, hero];
  let contacts = 0;
  const harness = createAttackHarness(initial, async (_scene, _outcome, onImpact, getUnits) => {
    assert.equal(getUnits().find(unit => unit.id === 'hero').hp, 80);
    onImpact(); contacts += 1;
    assert.equal(getUnits().find(unit => unit.id === 'hero').hp, 71);
    assert.equal(getUnits().find(unit => unit.id === 'archer').status.some(status => status.type === 'inspire'), false);
    return true;
  });
  const result = await harness.attack(attacker, hero, 'skill', initial);
  assert.equal(contacts, 1);
  assert.equal(result.attacked, true);
  assert.equal(result.units.find(unit => unit.id === 'hero').hp, 71);
  assert.equal(initial[1].hp, 80);
});

test('actual enemy attack stops stale post-processing when cutscene is cancelled before or after contact', async () => {
  const attacker = createExpansionEnemy(32, 'eel_archer', { id: 'archer', x: 3, y: 3 });
  for (const contacted of [false, true]) {
    const initial = [attacker, hero];
    const harness = createAttackHarness(initial, async (_scene, _outcome, onImpact) => {
      if (contacted) onImpact();
      return false;
    });
    const result = await harness.attack(attacker, hero, 'skill', initial);
    assert.equal(result.cancelled, true);
    assert.equal(harness.getUnits().find(unit => unit.id === 'hero').hp, contacted ? 71 : 80);
    assert.equal(harness.events.some(event => event.type === 'logs' || event.type === 'defeat'), false);
  }
});

test('actual counterattack applies its own damage at its own contact and cancellation skips old logs', async () => {
  const attacker = createExpansionEnemy(31, 'crab_guard', { id: 'crab', x: 4, y: 3 });
  for (const cancelCounter of [false, true]) {
    const initial = [attacker, hero];
    let sceneCount = 0;
    const harness = createAttackHarness(initial, async (scene, _outcome, onImpact, getUnits) => {
      sceneCount += 1;
      if (scene.mode === 'counter') {
        assert.equal(getUnits().find(unit => unit.id === 'crab').hp, attacker.hp);
        onImpact();
        assert.equal(getUnits().find(unit => unit.id === 'crab').hp, attacker.hp - 9);
        return !cancelCounter;
      }
      onImpact(); return true;
    });
    const result = await harness.attack(attacker, hero, 'attack', initial);
    assert.equal(sceneCount, 2);
    assert.equal(result.cancelled, cancelCounter ? true : undefined);
    assert.equal(harness.getUnits().find(unit => unit.id === 'hero').hp, 71);
    assert.equal(harness.getUnits().find(unit => unit.id === 'crab').hp, attacker.hp - 9);
    if (cancelCounter) assert.equal(harness.events.some(event => event.type === 'logs'), false);
  }
});
