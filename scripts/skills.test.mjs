import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTER_SKILLS, getUnitSkills, getSkill, skillDescription, withSkill,
  getSkillCooldown, applyCooldown, tickCooldowns, getSupportSkillTargets, applySupportSkill,
} from '../src/data/skills.js';
import { calculateDamage, calculateHit, calculateCrit } from '../src/engine/combat.js';
import { getSkillStatus, applySkillStatusAfterHit } from '../src/engine/statusEngine.js';
import {
  makeAlly, applyEquipmentStats, applyEquipmentToParty, mergePartyIntoStage,
  mergePartyFromUnits, grantExp,
} from '../src/engine/partyEngine.js';
import { BATTLE_SPEED_OPTIONS, getBattleSpeedConfig, scaleBattleTime } from '../src/engine/battleSpeed.js';

const characterIds = [
  'hero', 'bram', 'lina', 'aria', 'leon', 'sera', 'noah', 'yuna', 'rakan',
  'miho', 'teo', 'irene', 'kaz', 'ella', 'jin', 'luka', 'baekho',
];
const ally = (id, extra = {}) => ({
  id, name: id, type: 'ally', x: 2, y: 2, hp: 40, maxHp: 40,
  atk: 20, def: 5, skl: 6, spd: 3, luk: 4, skillLevel: 0, status: [], ...extra,
});

test('all 17 characters have two distinct skills with valid descriptions', () => {
  assert.deepEqual(Object.keys(CHARACTER_SKILLS).sort(), [...characterIds].sort());
  const ids = new Set();
  for (const id of characterIds) {
    const skills = getUnitSkills({ id });
    assert.equal(skills.length, 2, id);
    for (const skill of skills) {
      assert.ok(!ids.has(skill.id), skill.id);
      ids.add(skill.id);
      assert.ok(['attack', 'heal', 'guard'].includes(skill.type));
      assert.ok(Number.isInteger(skill.cooldown) && skill.cooldown > 0);
      assert.ok(Number.isInteger(skill.range) && skill.range >= 0);
      assert.ok(skill.name && skill.effect);
      assert.doesNotMatch(skillDescription(skill), /NaN|undefined/);
    }
  }
  assert.equal(ids.size, 34);
  assert.deepEqual(getUnitSkills(null), []);
  assert.equal(getSkill({ id: 'unknown' }), null);
  assert.equal(withSkill(null), null);
});

for (const id of characterIds) {
  for (const skill of CHARACTER_SKILLS[id]) {
    test(`${id}/${skill.id} resolves its own upgraded attack or support effect`, () => {
      const original = ally(id, { skillLevel: 2 });
      const actor = withSkill(original, skill.id);
      assert.equal(actor.activeSkillId, skill.id);
      assert.equal(actor.skillRange, skill.range);
      assert.equal(actor.skillBonus, (skill.bonus ?? 0) + 4);
      assert.equal(actor.skillSpec, skill);
      assert.equal(original.skillSpec, undefined);
      assert.equal(getSkillStatus(actor, 'attack'), null);
      assert.deepEqual(getSkillStatus(actor, 'skill'), skill.status ? { type: skill.status, turns: 2 } : null);

      if (skill.type === 'attack') {
        const defender = ally('target', { type: 'enemy', x: 3, spd: 10 });
        const plain = { ...actor, skillBonus: 0, skillSpec: {} };
        assert.equal(calculateDamage(actor, defender, 'skill') - calculateDamage(plain, defender, 'skill'), skill.bonus + 4);
        assert.equal(calculateHit(actor, defender, 'skill') - calculateHit(plain, defender, 'skill'), skill.accuracy ?? 0);
        assert.equal(calculateCrit(actor, defender, 'skill') - calculateCrit(plain, defender, 'skill'), skill.critical ?? 0);
        assert.equal(calculateHit(actor, defender), calculateHit(plain, defender));
        assert.equal(calculateCrit(actor, defender), calculateCrit(plain, defender));
        const applied = applySkillStatusAfterHit(actor, defender.id, 'skill', [defender]);
        assert.deepEqual(applied.units[0].status, skill.status ? [{ type: skill.status, turns: 2 }] : []);
      } else if (skill.type === 'heal') {
        const hurt = { ...original, hp: 1, status: [{ type: 'burn', turns: 2 }] };
        const result = applySupportSkill(actor, skill, [hurt]);
        assert.equal(result.units[0].hp, 1 + skill.power + 6);
        assert.equal(result.healing, skill.power + 6);
        assert.deepEqual(result.units[0].status, skill.cleanse ? [] : hurt.status);
        assert.equal(hurt.hp, 1);
      } else {
        const first = applySupportSkill(actor, skill, [original]);
        const second = applySupportSkill(actor, skill, first.units);
        assert.equal(first.units[0].def, 5 + skill.defense + 2);
        assert.equal(first.units[0].skillGuardBoost, skill.defense + 2);
        assert.equal(first.units[0].guard, true);
        assert.deepEqual(second.units, first.units);
        assert.equal(original.def, 5);
      }
    });
  }
}

test('both skills independently count down for every character and synchronize the legacy field', () => {
  const enemy = ally('enemy', { type: 'enemy', skillCooldown: 8 });
  for (const id of characterIds) {
    const [first, second] = CHARACTER_SKILLS[id];
    const original = ally(id);
    let units = applyCooldown([original, enemy], id, second.id, second.cooldown);
    assert.equal(getSkillCooldown(units[0], first.id), 0);
    assert.equal(getSkillCooldown(units[0], second.id), second.cooldown);
    units = applyCooldown(units, id, first.id, first.cooldown);
    for (let turn = 0; turn <= Math.max(first.cooldown, second.cooldown) + 1; turn++) {
      assert.equal(getSkillCooldown(units[0], first.id), Math.max(0, first.cooldown - turn));
      assert.equal(getSkillCooldown(units[0], second.id), Math.max(0, second.cooldown - turn));
      assert.equal(units[0].skillCooldown, getSkillCooldown(units[0], first.id));
      assert.equal(units[1], enemy);
      units = tickCooldowns(units);
    }
    assert.equal(original.skillCooldowns, undefined);
  }
});

test('legacy saves migrate only the first skill and preserve its cooldown when the second is used', () => {
  const original = ally('hero', { skillCooldown: '3' });
  assert.equal(getSkillCooldown(original), 3);
  assert.equal(getSkillCooldown(original, 'oath'), 0);
  const [used] = applyCooldown([original], 'hero', 'oath', 2);
  assert.deepEqual(used.skillCooldowns, { gale: 3, oath: 2 });
  const [ticked] = tickCooldowns([original]);
  assert.deepEqual(ticked.skillCooldowns, { gale: 2, oath: 0 });
  assert.equal(ticked.skillCooldown, 2);
  assert.equal(original.skillCooldowns, undefined);
});

test('zero and missing map entries never resurrect a stale legacy cooldown', () => {
  for (const skillCooldowns of [{ gale: 1, oath: 3 }, { gale: 0 }, {}]) {
    const [unit] = tickCooldowns([ally('hero', { skillCooldown: 9, skillCooldowns })]);
    assert.equal(unit.skillCooldown, 0);
    assert.equal(getSkillCooldown(unit), 0);
  }
  for (const value of [undefined, null, NaN, Infinity, -3, 'invalid']) {
    assert.equal(getSkillCooldown(ally('hero', { skillCooldown: value })), 0);
    const [unit] = applyCooldown([ally('hero')], 'hero', 'gale', value);
    assert.equal(getSkillCooldown(unit), 0);
  }
  assert.equal(getSkillCooldown(ally('hero', { skillCooldown: 2, skillCooldowns: [] })), 2);
});

test('allies without new definitions retain working legacy cooldowns without undefined map keys', () => {
  let [unit] = applyCooldown([ally('legacy')], 'legacy', undefined, 3);
  assert.equal(unit.skillCooldowns, undefined);
  for (const remaining of [3, 2, 1, 0, 0]) {
    assert.equal(getSkillCooldown(unit), remaining);
    [unit] = tickCooldowns([unit]);
  }
});

test('healing uses Manhattan range, living allies, lowest HP ratio, and the target limit', () => {
  const actor = ally('aria');
  const skill = getSkill(actor, 'sanctuary');
  const units = [
    actor, ally('wounded', { x: 3, hp: 10 }), ally('edge', { x: 4, hp: 4 }),
    ally('diagonal', { x: 3, y: 3, hp: 20 }), ally('fourth', { y: 0, hp: 30 }),
    ally('outside', { x: 4, y: 3, hp: 1 }), ally('dead', { hp: 0 }),
    ally('enemy', { type: 'enemy', hp: 1 }),
  ];
  assert.deepEqual(getSupportSkillTargets(actor, skill, units).map(unit => unit.id), ['edge', 'wounded', 'diagonal']);
  const result = applySupportSkill(actor, skill, units);
  assert.equal(result.healing, 27);
  for (const id of ['fourth', 'outside', 'dead', 'enemy']) {
    assert.equal(result.units.find(unit => unit.id === id), units.find(unit => unit.id === id));
  }
});

test('cleansing includes full-health allies, removes all statuses, and caps actual healing', () => {
  const actor = ally('aria', { skillLevel: 2 });
  const afflicted = ally('afflicted', { x: 3, status: [{ type: 'burn', turns: 2 }, { type: 'armorBreak', turns: 1 }] });
  const hurt = ally('hurt', { hp: 39, status: [{ type: 'freeze', turns: 2 }] });
  const units = [actor, afflicted, hurt];
  const result = applySupportSkill(actor, getSkill(actor, 'sanctuary'), units);
  assert.deepEqual(result.targets.map(unit => unit.id), ['hurt', 'afflicted']);
  assert.equal(result.healing, 1);
  for (const unit of result.units) {
    assert.equal(unit.hp, 40);
    assert.deepEqual(unit.status, []);
  }
  const ordinary = applySupportSkill(actor, getSkill(actor, 'light'), units);
  assert.deepEqual(ordinary.targets.map(unit => unit.id), ['hurt']);
  assert.deepEqual(ordinary.units[2].status, hurt.status);
  assert.equal(afflicted.status.length, 2);
});

test('guard affects its radius and only the strongest boost applies', () => {
  const actor = ally('noah');
  const ward = getSkill(actor, 'ward');
  const units = [actor, ally('bram', { x: 3 }), ally('diagonal', { x: 3, y: 3 }), ally('dead', { hp: 0 }), ally('enemy', { type: 'enemy' })];
  const first = applySupportSkill(actor, ward, units);
  assert.deepEqual(first.targets.map(unit => unit.id), ['noah', 'bram']);
  const bram = first.units[1];
  const stronger = applySupportSkill(bram, getSkill(bram, 'bulwark'), first.units);
  const weaker = applySupportSkill(actor, ward, stronger.units);
  assert.equal(weaker.units[1].def, 9);
  assert.equal(weaker.units[1].skillGuardBoost, 4);
  for (let index = 2; index < units.length; index++) assert.equal(weaker.units[index], units[index]);
  const attacker = ally('attacker');
  const unguarded = { ...weaker.units[1], guard: false, skillGuardBoost: 0, def: 5 };
  assert.equal(calculateDamage(attacker, unguarded) - calculateDamage(attacker, weaker.units[1]), 8);
});

test('equipment and level-ups preserve a temporary guard without adding it to base defense', () => {
  const actor = ally('hero', { exp: 90 });
  const [guarded] = applySupportSkill(actor, getSkill(actor, 'oath'), [actor]).units;
  assert.equal(makeAlly(guarded).baseDef, 5);
  const equipped = applyEquipmentStats({ ...guarded, equipment: { armor: 'leatherArmor' } });
  assert.equal(equipped.def, 9);
  assert.equal(equipped.baseDef, 5);
  assert.equal(applyEquipmentStats(equipped).def, 9);
  const [leveled] = grantExp([equipped], actor.id, 10).units;
  assert.equal(leveled.baseDef, 6);
  assert.equal(leveled.def, 10);
  assert.equal(leveled.skillGuardBoost, 3);
  const [camp] = applyEquipmentToParty([leveled]);
  assert.equal(camp.def, 7);
  assert.equal(camp.skillGuardBoost, 0);
  assert.equal(camp.guard, false);
  assert.equal(applyEquipmentToParty([camp])[0].def, 7);
  assert.equal(makeAlly(ally('hero', { baseDef: 0, def: 3, skillGuardBoost: 3 })).baseDef, 0);
});

test('camp and both deployment paths clear guard and cooldown state, including missing allies', () => {
  const hero = ally('hero', { hp: 12, def: 8, skillGuardBoost: 3, guard: true, skillCooldown: 2, skillCooldowns: { gale: 2, oath: 3 } });
  const extra = ally('luka', { baseDef: 0, def: 3, skillGuardBoost: 3, guard: true, skillCooldown: 3, skillCooldowns: { radiance: 3 } });
  const stage = { map: Array.from({ length: 8 }, () => Array(8).fill('plain')), units: [ally('hero', { x: 0, y: 5 }), ally('enemy', { type: 'enemy', x: 7, y: 0 })] };
  const camp = mergePartyFromUnits([hero, extra], [hero]);
  const directBattle = mergePartyIntoStage(stage, [hero, extra]);
  const afterCamp = mergePartyIntoStage(stage, camp);
  for (const party of [camp, directBattle, afterCamp]) {
    const allies = party.filter(unit => unit.type === 'ally');
    assert.equal(allies.length, 2);
    assert.deepEqual(allies.map(unit => unit.def), [5, 0]);
    for (const unit of allies) {
      assert.equal(unit.guard, false);
      assert.equal(unit.skillGuardBoost, 0);
      assert.equal(unit.skillCooldown, 0);
      assert.deepEqual(unit.skillCooldowns, {});
    }
  }
  for (const unit of directBattle.filter(unit => unit.type === 'ally')) assert.equal(unit.hp, unit.maxHp);
  assert.deepEqual(directBattle.find(unit => unit.type === 'enemy'), stage.units[1]);
  assert.equal(hero.def, 8);
  assert.equal(hero.skillCooldown, 2);
});

test('skill hit and critical bonuses obey existing limits', () => {
  const actor = ally('hero', { skillSpec: { accuracy: 1000, critical: 1000 } });
  const defender = ally('target');
  assert.equal(calculateHit(actor, defender, 'skill'), 98);
  assert.equal(calculateCrit(actor, defender, 'skill'), 40);
  actor.skillSpec = { accuracy: -1000, critical: -1000 };
  assert.equal(calculateHit(actor, defender, 'skill'), 25);
  assert.equal(calculateCrit(actor, defender, 'skill'), 0);
});

test('battle speed scales every configured delay by exactly 1x, 2x, and 3x', () => {
  assert.deepEqual(BATTLE_SPEED_OPTIONS.map(option => option.multiplier), [1, 2, 3]);
  const base = { allyStepMs: 175, enemyStepMs: 190, enemyDelayMs: 700, stepGapMs: 35 };
  for (const [index, id] of ['normal', 'fast', 'turbo'].entries()) {
    const config = getBattleSpeedConfig(id);
    const multiplier = index + 1;
    assert.equal(config.multiplier, multiplier);
    for (const [key, value] of Object.entries(base)) assert.equal(config[key], value / multiplier);
    for (const duration of [0, 1, 175, 190, 700, 1450]) assert.equal(scaleBattleTime(duration, config), duration / multiplier);
  }
  assert.equal(getBattleSpeedConfig('unknown'), BATTLE_SPEED_OPTIONS[0]);
  assert.equal(scaleBattleTime(700), 700);
});
