import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_SKILLS, getSkill, getUnitSkills, withSkill, skillDescription } from '../src/data/skills.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { DISCOVERY_TECHNIQUES } from '../src/data/discoveries.js';
import { getInitialParty, applyEquipmentStats } from '../src/engine/partyEngine.js';
import { calculateDamage } from '../src/engine/combat.js';
import { applySecretPromotion, getSecretPromotionPreview } from '../src/engine/discoveryEngine.js';
import { applyAdvancedPromotion } from '../src/engine/promotionEngine.js';
import { getPromotionTitle, getPromotionCost, canPromoteUnit, promoteAllyUnit, getOrdinaryPromotionPreview } from '../src/engine/ordinaryPromotion.js';

const hero = extra => ({ ...getInitialParty()[0], level: 5, ...extra });

test('일반 전직은 기존 레벨·비용 조건을 유지하며 비정상 골드와 적을 거부한다', () => {
  assert.equal(getPromotionCost(hero({ level: 3 })), 900);
  assert.equal(getPromotionCost(hero()), 1140);
  assert.equal(canPromoteUnit(hero({ level: 2 }), 5000).ok, false);
  assert.equal(canPromoteUnit(hero(), 1139).ok, false);
  assert.equal(canPromoteUnit(hero(), 1140).ok, true);
  assert.equal(canPromoteUnit(hero({ promoted: true }), 5000).ok, false);
  for (const gold of [NaN, Infinity, '5000', undefined]) assert.equal(canPromoteUnit(hero(), gold).ok, false);
  assert.equal(canPromoteUnit(hero({ type: 'enemy' }), 5000).ok, false);
});

test('일반 전직은 HP 0을 보존하고 생존 동료에게만 최대HP 증가분을 회복한다', () => {
  const fallen = hero({ hp: 0 });
  const after = promoteAllyUnit(fallen);
  assert.equal(after.hp, 0);
  assert.equal(after.maxHp, fallen.maxHp + 5);
  const injured = hero({ hp: 4 });
  assert.equal(promoteAllyUnit(injured).hp, 9);
  assert.equal(promoteAllyUnit(after), after);
  assert.equal(fallen.promoted, undefined);
});

test('구저장 기본치가 없어도 장비·강화·수호를 일반 전직 능력치에 두 번 더하지 않는다', () => {
  const equipped = applyEquipmentStats(hero({
    baseAtk: 15, baseDef: 10,
    equipment: { weapon: 'ironSword', armor: 'chainArmor', accessory: 'copperAccessory2' },
    gearEnhance: { ironSword: 3, chainArmor: 2, copperAccessory2: 2 }, skillGuardBoost: 4,
  }));
  const legacy = { ...equipped };
  delete legacy.baseAtk;
  delete legacy.baseDef;
  const result = promoteAllyUnit(legacy);
  assert.equal(result.baseAtk, 17);
  assert.equal(result.baseDef, 12);
  assert.equal(result.atk, equipped.atk + 2);
  assert.equal(result.def, equipped.def + 2);
  assert.equal(result.atk, 24);
  assert.equal(result.def, 23);
  assert.deepEqual(result.equipment, equipped.equipment);
  assert.deepEqual(result.gearEnhance, equipped.gearEnhance);
  assert.deepEqual(applyEquipmentStats(result), result);
});

test('일반 전직 미리보기는 잠긴 동료도 볼 수 있고 실제 변환과 같은 수치를 반환한다', () => {
  const unit = hero({ level: 1 });
  const preview = getOrdinaryPromotionPreview(unit);
  const next = promoteAllyUnit(unit);
  assert.deepEqual(preview.after, { hp: next.maxHp, atk: next.atk, def: next.def, move: next.move });
  assert.deepEqual(preview.delta, { hp: 5, atk: 2, def: 2, move: 0 });
  assert.deepEqual(getOrdinaryPromotionPreview(next).delta, { hp: 0, atk: 0, def: 0, move: 0 });
  assert.equal(getOrdinaryPromotionPreview(null), null);
});

test('상급 전직 이름은 현재 캐릭터의 활·창·환영·악사·기사 역할을 반영한다', () => {
  for (const [id, title] of Object.entries({ lina: '홍염명궁', leon: '질풍창기사', miho: '환영도사', teo: '정밀명궁', ella: '별빛악사', luka: '여명기사' })) {
    assert.equal(getPromotionTitle({ id }), title);
  }
  assert.equal(getPromotionTitle({ id: 'hero' }), '천룡기사');
});

test('전직 공격 기술 +1은 기본·비전·최상위 기술 표시와 실제 피해에 한 번만 적용한다', () => {
  const original = hero({ skillLevel: 2, learnedTechniques: ['hero-dawn-slash'], advancedClass: 'hero__form0' });
  const promoted = promoteAllyUnit(original);
  const sourceSkills = [CHARACTER_SKILLS.hero[0], DISCOVERY_TECHNIQUES['hero-dawn-slash'], ADVANCED_CLASSES.hero[0].skill];
  for (const skill of sourceSkills) {
    const resolved = getSkill(promoted, skill.id);
    assert.equal(resolved.bonus, skill.bonus + 1);
    assert.ok(skillDescription(resolved, 2).startsWith(`공격 +${skill.bonus + 5}`));
    const actor = withSkill(promoted, skill.id);
    assert.equal(actor.skillBonus, skill.bonus + 5);
    assert.equal(withSkill(actor, skill.id).skillBonus, actor.skillBonus);
    const defender = { id: 'target', type: 'enemy', hp: 100, def: 0, x: 1, y: 0 };
    const plain = { ...actor, skillBonus: actor.skillBonus - 1 };
    assert.equal(calculateDamage(actor, defender, 'skill') - calculateDamage(plain, defender, 'skill'), 1);
  }
  assert.equal(CHARACTER_SKILLS.hero[0].bonus, 4);
  assert.equal(DISCOVERY_TECHNIQUES['hero-dawn-slash'].bonus, 7);
  assert.equal(ADVANCED_CLASSES.hero[0].skill.bonus, 8);
  assert.equal(getSkill(promoted, 'oath'), CHARACTER_SKILLS.hero[1]);
});

test('구저장의 큰 skillBonus 값·비전과 반복 최상위 분기 전환은 전직 위력 보너스를 중첩하지 않는다', () => {
  const progress = { relics: ['dawnblade-relic'], techniques: [], claimed: [] };
  const base = hero({ skillBonus: 999, advancedMastery: 3 });
  const direct = applySecretPromotion(base, progress).unit;
  const ordinaryFirst = applySecretPromotion(promoteAllyUnit(base), progress).unit;
  assert.equal(getSkill(direct, 'gale').bonus, 5);
  assert.deepEqual(getUnitSkills(direct), getUnitSkills(ordinaryFirst));
  let unit = direct;
  for (const formId of ['hero__form0', 'hero__form1', 'hero__form0']) {
    unit = applyAdvancedPromotion(unit, formId, { party: [unit], clearedStages: [31], gold: 5000 }).unit;
    assert.equal(getSkill(unit, 'gale').bonus, 5);
    assert.equal(getSkill(unit, 'hero-dawn-slash').bonus, 8);
    assert.equal(unit.skillBonus, withSkill(unit, unit.activeSkillId).skillBonus);
  }
  const restored = JSON.parse(JSON.stringify(unit));
  assert.equal(getSkill(restored, 'gale').bonus, 5);
});

test('비전 미리보기는 유물 미보유에도 정확한 일반 전직 포함 수치를 보여주며 자원을 소모하지 않는다', () => {
  const unit = hero({ level: 1 });
  const progress = { relics: [], techniques: [], claimed: [] };
  const preview = getSecretPromotionPreview(unit, progress);
  assert.deepEqual(preview.delta, { hp: 13, atk: 5, def: 4, move: 0 });
  assert.deepEqual(progress, { relics: [], techniques: [], claimed: [] });
  const afterOrdinary = getSecretPromotionPreview(promoteAllyUnit(unit), progress);
  assert.deepEqual(afterOrdinary.delta, { hp: 8, atk: 3, def: 2, move: 0 });
  const promoted = applySecretPromotion(hero(), { relics: ['dawnblade-relic'] }).unit;
  assert.deepEqual(getSecretPromotionPreview(promoted, progress).delta, { hp: 0, atk: 0, def: 0, move: 0 });
  assert.equal(getSecretPromotionPreview({ id: 'lina', type: 'ally' }, progress), null);
});
