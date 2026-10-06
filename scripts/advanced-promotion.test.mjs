import test from 'node:test';
import assert from 'node:assert/strict';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { getInitialParty, grantExp } from '../src/engine/partyEngine.js';
import { applySecretPromotion } from '../src/engine/discoveryEngine.js';
import { getUnitSkills, getSkill, getSkillDisplayName, applyCooldown, tickCooldowns, applySupportSkill } from '../src/data/skills.js';
import { getAdvancedPromotionForms, getAdvancedClass, getAdvancedSealBalance, getAdvancedMastery, canAdvancedPromote, applyAdvancedPromotion, createExpansionRecruit } from '../src/engine/promotionEngine.js';
import { finalizeExpansionAllySkill } from '../src/engine/expansionAllySkills.js';

const hero = () => ({ ...getInitialParty()[0], promoted: true, level: 6, advancedMastery: 3 });
const context = unit => ({ party: [unit], clearedStages: [31], gold: 10000, mastery: getAdvancedMastery(unit) });
const openMap = Array.from({ length: 6 }, () => Array(6).fill('plain'));
const combatMare = () => ({ ...createExpansionRecruit('mare'), x: 1, y: 2 });
const enemy = (extra = {}) => ({ id: 'e1', name: '적', type: 'enemy', x: 2, y: 2, hp: 20, maxHp: 20, move: 3, ...extra });

test('21명 모두 소유자별 두 상위 분기와 실제 사용 가능한 고유 기술을 가진다', () => {
  assert.equal(Object.keys(ADVANCED_CLASSES).length, 21);
  const all = Object.values(ADVANCED_CLASSES).flat();
  assert.equal(all.length, 42);
  assert.equal(new Set(all.map(form => form.id)).size, 42);
  for (const [id, forms] of Object.entries(ADVANCED_CLASSES)) {
    assert.equal(forms.length, 2);
    for (const [index, form] of forms.entries()) {
      const unit = { id, type: 'ally', advancedClass: form.id };
      assert.equal(form.id, `${id}__form${index}`);
      assert.equal(getAdvancedClass(unit), form);
      assert.equal(getSkill(unit, form.skill.id).id, form.skill.id);
      assert.equal(getUnitSkills(unit).filter(skill => skill.id === form.skill.id).length, 1);
      assert.ok(form.name && form.role && form.drawback);
    }
  }
  assert.equal(getAdvancedClass({ id: 'hero', type: 'ally', advancedClass: 'bram__form0' }), null);
});

test('새 아군은 소유 동료 중앙값 성장으로 합류하며 기존 동료를 변경하지 않는다', () => {
  const party = getInitialParty().map((unit, index) => ({ ...unit, level: [11, 4, 7, 9][index] }));
  const before = structuredClone(party);
  for (const id of ['mare', 'harin', 'edan', 'sylvan']) {
    const joined = createExpansionRecruit(id, party);
    assert.equal(joined.level, 7);
    assert.equal(joined.hp, joined.maxHp);
    assert.equal(joined.type, 'ally');
    assert.equal(getUnitSkills(joined).length, 2);
    assert.ok(joined.baseAtk > createExpansionRecruit(id).baseAtk);
    assert.deepEqual(joined.equipment, { weapon: null, armor: null });
  }
  assert.deepEqual(party, before);
  assert.equal(createExpansionRecruit('missing'), null);
});

test('31장·기존 상급직·숙련 3회 관문을 지키고 다른 캐릭터 분기를 거부한다', () => {
  const unit = hero();
  assert.equal(canAdvancedPromote(unit, 'hero__form0', { ...context(unit), clearedStages: [30] }).ok, false);
  assert.equal(canAdvancedPromote({ ...unit, promoted: false }, 'hero__form0', context(unit)).ok, false);
  assert.equal(canAdvancedPromote(unit, 'hero__form0', { ...context(unit), mastery: 2 }).ok, false);
  assert.equal(canAdvancedPromote(unit, 'bram__form0', context(unit)).ok, false);
  assert.equal(canAdvancedPromote({ ...unit, type: 'enemy' }, 'hero__form0', context(unit)).ok, false);
  assert.equal(canAdvancedPromote(unit, 'hero__form0', context(unit)).ok, true);
});

test('인장은 첫 클리어와 캐릭터별 최초 소모로 계산하며 재도전·중복 기록으로 복제되지 않는다', () => {
  assert.deepEqual(getAdvancedSealBalance([], [31, 31, 32, 32]), { earned: 4, spent: 0, available: 4 });
  assert.equal(getAdvancedSealBalance([], Array.from({ length: 50 }, (_, i) => i + 1)).earned, 22);
  assert.equal(getAdvancedSealBalance([], [32, 40, 50]).earned, 0);
  const used = { ...hero(), advancedClassSealUsed: true };
  assert.deepEqual(getAdvancedSealBalance([used, { ...used }], [31]), { earned: 3, spent: 1, available: 2 });
  const depleted = ['hero', 'bram', 'lina'].map(id => ({ id, type: 'ally', advancedClassSealUsed: true }));
  assert.equal(canAdvancedPromote(hero(), 'hero__form0', { ...context(hero()), party: depleted }).ok, false);
});

test('같은 분기 중복 실행은 실패하고 첫 변경만 무료·그 다음부터 300G', () => {
  const first = applyAdvancedPromotion(hero(), 'hero__form0', context(hero()));
  assert.equal(first.ok, true);
  assert.equal(first.sealCost, 1);
  assert.equal(first.goldCost, 0);
  assert.equal(first.unit.advancedClassChanges, 0);
  assert.equal(applyAdvancedPromotion(first.unit, 'hero__form0', context(first.unit)).ok, false);
  const changed = applyAdvancedPromotion(first.unit, 'hero__form1', context(first.unit));
  assert.equal(changed.goldCost, 0);
  assert.equal(changed.sealCost, 0);
  assert.equal(changed.unit.advancedClassChanges, 1);
  assert.equal(applyAdvancedPromotion(changed.unit, 'hero__form0', { ...context(changed.unit), gold: 299 }).ok, false);
  const returned = applyAdvancedPromotion(changed.unit, 'hero__form0', context(changed.unit));
  assert.equal(returned.goldCost, 300);
  assert.equal(returned.sealCost, 0);
  assert.equal(getAdvancedSealBalance([returned.unit], [31]).spent, 1);
});

test('반복 분기 변경은 능력치를 누적하지 않고 HP를 회복하거나 부활시키지 않는다', () => {
  const original = { ...hero(), hp: 3 };
  let unit = applyAdvancedPromotion(original, 'hero__form0', context(original)).unit;
  const expected = { atk: unit.baseAtk, def: unit.baseDef, maxHp: unit.maxHp, move: unit.move };
  for (let i = 0; i < 20; i++) {
    unit = applyAdvancedPromotion(unit, 'hero__form1', context(unit)).unit;
    unit = applyAdvancedPromotion(unit, 'hero__form0', context(unit)).unit;
  }
  assert.deepEqual({ atk: unit.baseAtk, def: unit.baseDef, maxHp: unit.maxHp, move: unit.move }, expected);
  assert.equal(unit.hp, 3);
  const dead = { ...hero(), hp: 0 };
  assert.equal(applyAdvancedPromotion(dead, 'hero__form0', context(dead)).unit.hp, 0);
});

test('전직 후 레벨 성장·훈련 보정은 분기 변경을 해도 남는다', () => {
  const original = hero();
  let unit = applyAdvancedPromotion(original, 'hero__form0', context(original)).unit;
  unit = grantExp([unit], unit.id, 100).units[0];
  unit = { ...unit, baseAtk: unit.baseAtk + 4, baseDef: unit.baseDef + 3 };
  const switched = applyAdvancedPromotion(unit, 'hero__form1', context(unit)).unit;
  assert.equal(switched.level, original.level + 1);
  assert.equal(switched.baseAtk, original.baseAtk + 1 + 4);
  assert.equal(switched.baseDef, original.baseDef + 1 + 3 + 2);
  assert.equal(switched.maxHp, original.maxHp + 2 + 4);
});

test('일반·비전 전직과 장비·습득 기술·수집·소모품을 보존한다', () => {
  const explored = { relics: ['dawnblade-relic'], techniques: ['lina-phoenix-flare'], claimed: ['old-record'] };
  const secret = applySecretPromotion({ ...getInitialParty()[0], level: 6, advancedMastery: 3 }, explored).unit;
  const withGear = { ...secret, equipment: { weapon: 'ironSword', armor: 'chainMail' },
    collected: ['kept'], learnedTechniques: [...(secret.learnedTechniques || [])], gearEnhance: { ironSword: 2 } };
  const ctx = { ...context(withGear), inventory: { potion: 7, elixir: 2, customItem: 4 }, exploration: explored };
  const before = structuredClone(ctx);
  const result = applyAdvancedPromotion(withGear, 'hero__form0', ctx);
  assert.equal(result.unit.secretClass, 'dawnblade');
  assert.equal(result.unit.classTitle, '여명검사');
  assert.ok(getUnitSkills(result.unit).some(skill => skill.id === 'hero-dawn-slash'));
  assert.deepEqual(result.unit.equipment, withGear.equipment);
  assert.deepEqual(result.unit.gearEnhance, withGear.gearEnhance);
  assert.deepEqual(result.unit.collected, ['kept']);
  assert.deepEqual(ctx, before);
  assert.equal(getSkillDisplayName(result.unit), '여명 회오리참');
});

test('기존 전직 보너스 저장값을 제거하여 배포 후 수치 조정에도 기존 성장을 지킨다', () => {
  const base = hero();
  const historical = { ...base, advancedClass: 'hero__form0', advancedClassSealUsed: true,
    advancedClassBonus: { hp: 5, atk: 4, def: 1, move: 0 },
    maxHp: base.maxHp + 5, baseAtk: base.baseAtk + 4, baseDef: base.baseDef + 1 };
  const changed = applyAdvancedPromotion(historical, 'hero__form1', context(historical)).unit;
  assert.equal(changed.maxHp, base.maxHp + 4);
  assert.equal(changed.baseAtk, base.baseAtk);
  assert.equal(changed.baseDef, base.baseDef + 2);
});

test('최상위 전직 이후 비전 전직을 얻어도 선택 분기와 성장 보정은 그대로 남는다', () => {
  const original = hero();
  const advanced = applyAdvancedPromotion(original, 'hero__form0', context(original)).unit;
  const secret = applySecretPromotion(advanced, { relics: ['dawnblade-relic'], techniques: [], claimed: [] }).unit;
  assert.equal(secret.advancedClass, 'hero__form0');
  assert.equal(secret.secretClass, 'dawnblade');
  assert.equal(secret.baseAtk, advanced.baseAtk + 3);
  assert.equal(secret.baseDef, advanced.baseDef + 2);
  const changed = applyAdvancedPromotion(secret, 'hero__form1', context(secret)).unit;
  assert.equal(changed.baseAtk, original.baseAtk + 3);
  assert.equal(changed.baseDef, original.baseDef + 2 + 2);
  assert.ok(getUnitSkills(changed).some(skill => skill.id === 'hero-dawn-slash'));
  assert.ok(getUnitSkills(changed).some(skill => skill.id === 'hero__form1-skill'));
});

test('실제 유효한 스킬 실행만 숙련에 포함하고 기존 사용 기록도 3회까지 인정한다', () => {
  const unit = getInitialParty()[0];
  let units = applyCooldown([unit], unit.id, 'gale', 2);
  assert.equal(units[0].advancedMastery, 1);
  units = tickCooldowns(units);
  assert.equal(units[0].advancedMastery, 1);
  units = applyCooldown(units, unit.id, 'missing', 3);
  assert.equal(units[0].advancedMastery, 1);
  units = applyCooldown(units, unit.id, 'gale', 0);
  assert.equal(units[0].advancedMastery, 1);
  assert.equal(getAdvancedMastery(unit, { skillsUsed: 25 }), 3);
});

test('이동 후 창술 보너스만 가변이며 기본 카탈로그와 다른 동료 기술은 바꾸지 않는다', () => {
  const unit = { id: 'leon', type: 'ally', advancedClass: 'leon__form0' };
  const id = 'leon__form0-skill';
  assert.equal(getSkill(unit, id).bonus, 9);
  assert.equal(getSkill({ ...unit, moved: true }, id).bonus, 11);
  assert.equal(ADVANCED_CLASSES.leon[0].skill.bonus, 9);
  assert.equal(getUnitSkills({ id: 'leon', type: 'ally' }).length, 2);
});

test('마레 밀기는 명중 시 이동 가능한 빈칸만 사용하며 실패·보스·벽·점유 칸을 거부한다', () => {
  const mare = combatMare();
  const skill = getSkill(mare, 'tide-thrust');
  const pushed = finalizeExpansionAllySkill([mare, enemy()], 'mare', 'e1', skill, openMap);
  assert.equal(pushed.units[1].x, 3);
  const blocked = structuredClone(openMap); blocked[2][3] = 'wall';
  for (const [units, map, hit] of [
    [[mare, enemy()], blocked, true],
    [[mare, enemy(), { id: 'other', x: 3, y: 2, type: 'ally', hp: 10 }], openMap, true],
    [[mare, enemy({ type: 'boss' })], openMap, true],
    [[mare, enemy()], openMap, false],
  ]) assert.equal(finalizeExpansionAllySkill(units, 'mare', 'e1', skill, map, { hit }).units[1].x, 2);
  const deep = structuredClone(openMap); deep[2][3] = 'deepwater';
  assert.equal(finalizeExpansionAllySkill([mare, enemy()], 'mare', 'e1', skill, deep).units[1].x, 2);
});

test('지원 추가 상태는 실제 선택한 생존 아군·사거리 안에만 부여한다', () => {
  const mare = combatMare();
  const near = { ...hero(), x: 2, y: 2, status: [] };
  const far = { ...near, id: 'far', x: 5, y: 5 };
  const dead = { ...near, id: 'dead', x: 1, y: 3, hp: 0 };
  const skill = getSkill(mare, 'water-cover');
  const result = finalizeExpansionAllySkill([mare, near, far, dead], 'mare', null, skill, openMap, { targetIds: ['hero', 'far', 'dead'] });
  assert.ok(result.units[1].status.some(status => status.type === 'waterStride'));
  assert.equal(result.units[2].status.length, 0);
  assert.equal(result.units[3].status.length, 0);
  assert.equal(result.units[0].status, undefined);
});

test('실반 명중 이동 약화·지원 다음 턴 재생은 서로 다른 실제 대상에 적용한다', () => {
  const sylvan = { ...createExpansionRecruit('sylvan'), x: 1, y: 2 };
  const injured = { ...hero(), x: 2, y: 2, hp: 10, status: [] };
  const slowed = finalizeExpansionAllySkill([sylvan, enemy()], 'sylvan', 'e1', getSkill(sylvan, 'root-snare'), openMap);
  assert.deepEqual(slowed.units[1].status, [{ type: 'slow', turns: 2, power: 1 }]);
  const skill = getSkill(sylvan, 'green-breath');
  const supported = applySupportSkill(sylvan, skill, [sylvan, injured], ['hero']);
  const finalized = finalizeExpansionAllySkill(supported.units, 'sylvan', null, skill, openMap, { targetIds: ['hero'] });
  assert.equal(finalized.units[1].hp, 20);
  assert.deepEqual(finalized.units[1].status, [{ type: 'regen', turns: 2, power: 4 }]);
});

test('하린 추가 자기 회복은 실제 명중에서만 발생하고 피해받아 사망한 시전자를 부활시키지 않는다', () => {
  const harin = { ...createExpansionRecruit('harin'), x: 1, y: 2, hp: 10, advancedClass: 'harin__form0' };
  const skill = getSkill(harin, 'harin__form0-skill');
  assert.equal(finalizeExpansionAllySkill([harin, enemy()], 'harin', 'e1', skill, openMap).units[0].hp, 14);
  assert.equal(finalizeExpansionAllySkill([harin, enemy()], 'harin', 'e1', skill, openMap, { hit: false }).units[0].hp, 10);
  assert.equal(finalizeExpansionAllySkill([{ ...harin, hp: 0 }, enemy()], 'harin', 'e1', skill, openMap).units[0].hp, 0);
});

test('서약 성벽은 지원한 아군의 신규 공격 약화를 정화하고 강화 효과는 보존한다', () => {
  const bram = { ...getInitialParty()[1], x: 1, y: 2, advancedClass: 'bram__form1' };
  const status = [{ type: 'attackDown', turns: 2, power: 3 }, { type: 'slow', turns: 2, power: 1 },
    { type: 'fortify', turns: 2, power: 3 }, { type: 'regen', turns: 2, power: 4 }];
  const near = { ...hero(), x: 2, y: 2, status };
  const far = { ...near, id: 'far', x: 5, y: 5 };
  const skill = getSkill(bram, 'bram__form1-skill');
  const result = finalizeExpansionAllySkill([bram, near, far], 'bram', null, skill, openMap, { targetIds: ['hero', 'far'] });
  assert.deepEqual(result.units[1].status, status.slice(2));
  assert.deepEqual(result.units[2].status, status);
  assert.deepEqual(near.status, status);
});

test('명중으로 적을 처치해 제거해도 하린과 아리아의 명중 회복은 생존 아군에게 적용된다', () => {
  const harin = { ...createExpansionRecruit('harin'), x: 1, y: 2, hp: 10, advancedClass: 'harin__form0' };
  const harinSkill = getSkill(harin, 'harin__form0-skill');
  assert.equal(finalizeExpansionAllySkill([harin], 'harin', 'removed-target', harinSkill, openMap, { hit: true }).units[0].hp, 14);
  assert.equal(finalizeExpansionAllySkill([harin], 'harin', 'removed-target', harinSkill, openMap, { hit: false }).units[0].hp, 10);
  assert.equal(finalizeExpansionAllySkill([harin], 'harin', null, harinSkill, openMap, { hit: true }).units[0].hp, 10);
  const aria = { ...getInitialParty()[3], x: 1, y: 2, advancedClass: 'aria__form1' };
  const wounded = { ...hero(), x: 2, y: 2, hp: 10 };
  const ariaSkill = getSkill(aria, 'aria__form1-skill');
  assert.equal(finalizeExpansionAllySkill([aria, wounded], 'aria', 'removed-target', ariaSkill, openMap).units[1].hp, 16);
  assert.equal(finalizeExpansionAllySkill([aria, { ...wounded, hp: 0 }], 'aria', 'removed-target', ariaSkill, openMap).units[1].hp, 0);
});
