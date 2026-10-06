import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPANSION_ENEMY_TEMPLATES, EXPANSION_MONSTER_KEYS, EXPANSION_BOSS_KEYS,
  createExpansionEnemy, applyExpansionEnemyIdentity, createExpansionExtraEnemy,
  getExpansionEnemyKeys, resolveExpansionEnemySupport, createExpansionBossHazards, consumeExpansionEnemyAttackBoost,
} from '../src/data/expansionEnemies.js';
import { getExpansionEnemyStats, getStageEnemyLevel, withExpansionEnemyStats } from '../src/engine/enemyProgression.js';
import { getEnemyAttackChoice, moveEnemyToward } from '../src/engine/enemyAI.js';
import { canAttackTarget, canCounter, getUnitMoveRange } from '../src/engine/movement.js';
import { calculateDamage, getUnitCombatClass, triggerBossPhases, resolveHazards } from '../src/engine/combat.js';
import { applySkillStatusAfterHit, processTurnStartStatuses } from '../src/engine/statusEngine.js';
import { getCharacterCollection } from '../src/data/characterCollection.js';

const map = Array.from({ length: 10 }, () => Array(10).fill('plain'));
const hero = { id: 'hero', type: 'ally', name: '카일', hp: 80, maxHp: 80, atk: 30, def: 15, move: 3, x: 5, y: 3 };
const enemy = (stage, key, options = {}) => createExpansionEnemy(stage, key, { id: `${key}-test`, x: 3, y: 3, ...options });

test('all 12 species unlock at their own first chapter, and four bosses have separate identities', () => {
  assert.equal(EXPANSION_MONSTER_KEYS.length, 12);
  assert.equal(EXPANSION_BOSS_KEYS.length, 4);
  for (let stage = 31; stage <= 50; stage += 1) {
    const keys = getExpansionEnemyKeys(stage);
    const first = 31 + Math.floor((stage - 31) / 5) * 5;
    assert.equal(keys.length, Math.min(3, stage - first + 1));
    for (const key of keys) {
      const unit = enemy(stage, key);
      assert.ok(EXPANSION_ENEMY_TEMPLATES[key].firstStage <= stage);
      assert.equal(unit.artId, key);
      assert.equal(unit.spriteKey, key);
      assert.equal(unit.type, 'enemy');
      assert.equal(unit.hp, unit.maxHp);
      assert.ok(unit.maxHp > 0 && unit.atk > 0 && unit.def >= 0);
      assert.equal(unit.expansionStatsStage, stage);
    }
  }
  assert.deepEqual(getExpansionEnemyKeys(30), []);
  for (const key of EXPANSION_BOSS_KEYS) {
    const entry = EXPANSION_ENEMY_TEMPLATES[key];
    const boss = enemy(entry.firstStage, key, { id: 'boss' });
    assert.equal(boss.type, 'boss');
    assert.equal(boss.monsterRank, 'boss');
    assert.equal(boss.level, getStageEnemyLevel(entry.firstStage) + 2);
  }
  assert.throws(() => enemy(31, 'eel_archer'), RangeError);
  assert.throws(() => enemy(30, 'crab_guard'), RangeError);
  assert.throws(() => enemy(51, 'oath_guardian'), RangeError);
});

test('31–50 HP/ATK/DEF really grow once, with stable rank offsets and no legacy rebalance', () => {
  let previous = null;
  for (let stage = 31; stage <= 50; stage += 1) {
    const normal = getExpansionEnemyStats(stage);
    const elite = getExpansionEnemyStats(stage, { rank: 'elite' });
    const boss = getExpansionEnemyStats(stage, { type: 'boss' });
    assert.equal(normal.level, 1 + Math.floor((stage - 1) / 2));
    assert.equal(elite.level, normal.level + 1);
    assert.equal(boss.level, normal.level + 2);
    assert.ok(elite.maxHp > normal.maxHp && boss.maxHp > elite.maxHp);
    if (previous) assert.ok(normal.maxHp > previous.maxHp && normal.atk >= previous.atk && normal.def >= previous.def);
    previous = normal;
  }
  assert.equal(getExpansionEnemyStats(30), null);
  assert.equal(withExpansionEnemyStats({ type: 'enemy', monsterRank: 'elite' }, 31).level, 17);
  assert.equal(withExpansionEnemyStats({ type: 'enemy', monsterRank: 'elite' }, 31).maxHp, getExpansionEnemyStats(31, { rank: 'elite' }).maxHp);
  const legacy = Object.freeze({ id: 'old', type: 'enemy', hp: 3, maxHp: 44, atk: 13, def: 7 });
  assert.strictEqual(withExpansionEnemyStats(legacy, 30), legacy);
  assert.strictEqual(applyExpansionEnemyIdentity(legacy, 30), legacy);
  const live = { ...enemy(48, 'hollow_armor'), hp: 7, acted: true, status: [{ type: 'burn', turns: 1 }] };
  assert.strictEqual(applyExpansionEnemyIdentity(live, 48), live);
  assert.strictEqual(withExpansionEnemyStats(live, 48), live);
  const scaled = { ...live, expansionStatsStage: undefined, difficultyApplied: 'hard:balanced' };
  assert.strictEqual(applyExpansionEnemyIdentity(scaled, 48), scaled);
  assert.strictEqual(withExpansionEnemyStats(scaled, 48), scaled);
});

test('fresh expanded extras use current region species and the same growth as initial enemies', () => {
  for (let stage = 31; stage <= 50; stage += 1) for (let index = 1; index <= 26; index += 1) {
    const extra = createExpansionExtraEnemy(stage, index, index % 8, 1);
    const initial = enemy(stage, extra.artId);
    assert.ok(getExpansionEnemyKeys(stage).includes(extra.artId));
    assert.equal(extra.maxHp, initial.maxHp);
    assert.equal(extra.atk, initial.atk);
    assert.equal(extra.def, initial.def);
    assert.equal(extra.level, initial.level);
    assert.equal(extra.id, `large-extra-${stage}-${index}`);
    assert.equal(extra.largeBattleExtra, true);
  }
});

test('new eel archer attacks/counters at exactly two cells and its AI escapes adjacency', () => {
  const archer = enemy(32, 'eel_archer');
  const near = { ...hero, x: 4 }, far = { ...hero, x: 5 }, beyond = { ...hero, x: 6 };
  assert.equal(getUnitCombatClass(archer), 'bow');
  for (const mode of ['attack', 'skill']) {
    assert.equal(canAttackTarget(archer, near, mode, map), false);
    assert.equal(canAttackTarget(archer, far, mode, map), true);
    assert.equal(canAttackTarget(archer, beyond, mode, map), false);
  }
  assert.equal(canCounter(near, archer, map), false);
  assert.equal(canCounter(far, archer, map), true);
  assert.equal(getEnemyAttackChoice(archer, [near], map), null);
  const moved = moveEnemyToward(archer, [near], [archer, near], map);
  assert.ok(getEnemyAttackChoice(moved, [near], map));
  assert.ok(Math.abs(moved.x - near.x) + Math.abs(moved.y - near.y) === 2);
});

test('support AI heals one actual wounded friend, consumes its action and respects cooldown', () => {
  const healer = enemy(33, 'spore_colony');
  const wounded = { ...enemy(33, 'crab_guard', { id: 'friend', x: 4 }), hp: 9 };
  const other = { ...enemy(33, 'eel_archer', { id: 'other', x: 3, y: 4 }), hp: 20 };
  const before = structuredClone([healer, wounded, other, hero]);
  const result = resolveExpansionEnemySupport(healer, before, 1);
  assert.equal(result.target.id, 'friend');
  assert.ok(result.healing > 0);
  assert.equal(result.units.find(unit => unit.id === 'friend').hp, 9 + result.healing);
  assert.equal(result.units.find(unit => unit.id === 'other').hp, other.hp);
  assert.equal(result.units.find(unit => unit.id === healer.id).acted, true);
  assert.equal(resolveExpansionEnemySupport(result.units[0], result.units, 2), null);
  assert.equal(before[1].hp, 9);
  assert.equal(resolveExpansionEnemySupport(healer, [healer, { ...wounded, hp: 0 }, hero], 1), null);
});

test('bell and armor supports change real damage then expire without mutating base stats', () => {
  const bell = enemy(42, 'bell_keeper');
  const puppet = enemy(42, 'gold_puppet', { id: 'friend', x: 4 });
  const inspired = resolveExpansionEnemySupport(bell, [bell, puppet, hero], 1).units.find(unit => unit.id === 'friend');
  assert.equal(inspired.atk, puppet.atk);
  assert.equal(calculateDamage(inspired, hero), calculateDamage(puppet, hero) + 3);
  const consumed = consumeExpansionEnemyAttackBoost([inspired, hero], inspired.id)[0];
  assert.equal(calculateDamage(consumed, hero), calculateDamage(puppet, hero));
  const expired = processTurnStartStatuses(processTurnStartStatuses([inspired], 'enemy').units, 'enemy').units[0];
  assert.equal(calculateDamage(expired, hero), calculateDamage(puppet, hero));
  assert.equal(expired.atk, puppet.atk);
  const armor = enemy(48, 'hollow_armor');
  const cat = enemy(48, 'eclipse_cat', { id: 'cat', x: 4 });
  const fortified = resolveExpansionEnemySupport(armor, [armor, cat, hero], 1).units.find(unit => unit.id === 'cat');
  assert.equal(fortified.def, cat.def);
  assert.equal(calculateDamage(hero, fortified), Math.max(1, calculateDamage(hero, cat) - 3));
  assert.equal(resolveExpansionEnemySupport(armor, [armor, hero], 1), null);
});

test('new attack statuses alter actual move/attack and expire on their own turn only', () => {
  const archer = enemy(32, 'eel_archer');
  const slowed = applySkillStatusAfterHit(archer, hero.id, 'skill', [archer, hero]).units.find(unit => unit.id === hero.id);
  assert.equal(getUnitMoveRange(slowed), getUnitMoveRange(hero) - 1);
  assert.equal(getUnitMoveRange({ ...slowed, status: [...slowed.status, { type: 'slow', turns: 2, power: 1 }] }), getUnitMoveRange(hero) - 1);
  const oneTurn = processTurnStartStatuses([slowed], 'ally').units[0];
  assert.equal(getUnitMoveRange(oneTurn), getUnitMoveRange(hero) - 1);
  const wrongSide = processTurnStartStatuses([oneTurn], 'enemy').units[0];
  assert.deepEqual(wrongSide.status, oneTurn.status);
  const clean = processTurnStartStatuses([wrongSide], 'ally').units[0];
  assert.equal(getUnitMoveRange(clean), getUnitMoveRange(hero));
  const scroll = enemy(43, 'scroll_spirit');
  const weakened = applySkillStatusAfterHit(scroll, hero.id, 'skill', [scroll, hero]).units.find(unit => unit.id === hero.id);
  assert.equal(weakened.atk, hero.atk);
  assert.equal(calculateDamage(weakened, scroll), Math.max(1, calculateDamage(hero, scroll) - 3));
});

test('four bosses retain their own 2nd-phase skills, hazards and single HP bar', () => {
  for (const key of EXPANSION_BOSS_KEYS) {
    const source = EXPANSION_ENEMY_TEMPLATES[key];
    const boss = { ...enemy(source.firstStage, key, { id: 'boss' }), hp: 10 };
    const phased = triggerBossPhases([boss, hero]);
    const next = phased.units[0];
    assert.equal(next.phase2, true);
    assert.equal(next.artId, key);
    assert.equal(next.hp, 10);
    assert.equal(next.maxHp, boss.maxHp);
    assert.equal(next.skill, source.phaseSkill.name);
    assert.notEqual(next.skill, '어둠의 파동');
    assert.equal(triggerBossPhases(phased.units).messages.length, 0);
    const telegraph = createExpansionBossHazards(phased.units, map, 2);
    assert.ok(telegraph.hazards.length >= 1 && telegraph.hazards.length <= 3);
    assert.equal(telegraph.pattern.label, source.hazardLabel);
    const struck = resolveHazards(phased.units, telegraph.hazards).units.find(unit => unit.id === hero.id);
    assert.equal(struck.hp, hero.hp - 9);
    const safe = { ...hero, x: 0, y: 9 };
    assert.equal(resolveHazards([next, safe], telegraph.hazards).units[1].hp, safe.hp);
  }
  const dead = { ...enemy(50, 'oath_guardian'), hp: 0 };
  assert.equal(createExpansionBossHazards([dead, hero], map, 2).hazards.length, 0);
});

test('Arken alternates defensive turns, and collection unlocks all new enemy records only after clear', () => {
  const judge = enemy(45, 'resonance_judge');
  assert.equal(resolveExpansionEnemySupport(judge, [judge, hero], 1), null);
  const defended = resolveExpansionEnemySupport(judge, [judge, hero], 2);
  assert.equal(defended.target.id, judge.id);
  assert.ok(defended.status.type === 'fortify');
  const nextAttackTurn = processTurnStartStatuses(defended.units, 'enemy').units[0];
  assert.equal(nextAttackTurn.status.some(status => status.type === 'fortify'), false, 'defense expires before the odd-round attack');
  const encounters = [...EXPANSION_MONSTER_KEYS, ...EXPANSION_BOSS_KEYS].map(key => ({
    key, stageId: EXPANSION_ENEMY_TEMPLATES[key].firstStage, name: EXPANSION_ENEMY_TEMPLATES[key].name,
  }));
  const locked = getCharacterCollection({ encounters });
  assert.ok(encounters.every(entry => locked.find(record => record.id === entry.key)?.unlocked === false));
  const complete = getCharacterCollection({ encounters, clearedStages: Array.from({ length: 50 }, (_, index) => index + 1) });
  for (const entry of encounters) {
    const record = complete.find(item => item.id === entry.key);
    assert.equal(record.unlocked, true);
    assert.equal(record.kind, EXPANSION_BOSS_KEYS.includes(entry.key) ? 'boss' : 'enemy');
  }
});
