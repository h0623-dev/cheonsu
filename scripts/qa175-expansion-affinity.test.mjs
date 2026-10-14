import assert from 'node:assert/strict';
import { createExpansionRecruit, applyAdvancedPromotion, getAdvancedPromotionForms } from '../src/engine/promotionEngine.js';
import { getUnitCombatClass, getCombatClassLabel, getCombatAffinity, calculateDamage, calculateHit, calculateCrit } from '../src/engine/combat.js';
import { getUnitSkills, withSkill } from '../src/data/skills.js';
import { applyEquipmentStats } from '../src/engine/partyEngine.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';

const legacy = { hero: 'sword', bram: 'shield', lina: 'bow', aria: 'magic', leon: 'spear', sera: 'dagger', noah: 'magic', yuna: 'magic', rakan: 'shield', miho: 'magic', teo: 'bow', irene: 'magic', kaz: 'dagger', ella: 'magic', jin: 'sword', luka: 'sword', baekho: 'shield' };
for (const [id, expected] of Object.entries(legacy)) {
  assert.equal(getUnitCombatClass({ id, type: 'ally' }), expected);
  for (const skill of getUnitSkills({ id, type: 'ally' })) assert.equal(getUnitCombatClass(withSkill({ id, type: 'ally' }, skill.id)), expected);
}
for (const id of ['harin', 'edan']) assert.equal(getUnitCombatClass(createExpansionRecruit(id)), 'sword');
for (const [id, expected, label, gear] of [['mare', 'spear', '창', 'mareSpear'], ['sylvan', 'magic', '마법', 'sylvanStaff']]) {
  const recruit = createExpansionRecruit(id);
  const check = unit => {
    assert.equal(getUnitCombatClass(unit), expected);
    assert.equal(getCombatClassLabel(getUnitCombatClass(unit)), label);
    for (const skill of getUnitSkills(unit)) assert.equal(getUnitCombatClass(withSkill(unit, skill.id)), expected);
  };
  check(recruit);
  const equipped = applyEquipmentStats({ ...recruit, equipment: { weapon: gear }, gearEnhance: { [gear]: 5 } });
  check(equipped);
  check(applyEquipmentStats({ ...equipped, equipment: { weapon: null } }));
  const old = { ...equipped }; delete old.baseAtk; delete old.baseDef;
  const restored = normalizeSaveData(JSON.parse(JSON.stringify({ screen: 'camp', currentStageId: 50, party: [old], units: [old] })));
  check(restored.party.find(unit => unit.id === id));
  const ready = { ...recruit, promoted: true, level: 20, advancedMastery: 3 };
  for (const form of getAdvancedPromotionForms(ready)) {
    const result = applyAdvancedPromotion(ready, form.id, { party: [ready], clearedStages: [31], gold: 10000 });
    assert.equal(result.ok, true);
    check(result.unit);
  }
}
const target = id => ({ id, type: 'enemy', atk: 10, def: 5, hp: 30, move: 3, luk: 4 });
const probe = (id, enemyId) => {
  const ally = createExpansionRecruit(id), enemy = target(enemyId);
  return [getCombatAffinity(ally, enemy).state, calculateDamage(ally, enemy), calculateHit(ally, enemy), calculateCrit(ally, enemy)];
};
assert.deepEqual(probe('mare', 'hero'), ['advantage', 10, 95, 8]);
assert.deepEqual(probe('mare', 'bram'), ['advantage', 10, 95, 8]);
assert.deepEqual(probe('mare', 'noah'), ['disadvantage', 6, 79, 0]);
assert.deepEqual(probe('sylvan', 'leon'), ['advantage', 10, 95, 8]);
assert.deepEqual(probe('sylvan', 'bram'), ['advantage', 10, 95, 8]);
assert.deepEqual(probe('sylvan', 'lina'), ['disadvantage', 6, 79, 0]);
console.log('QA175 신규 동료 상성: 생성/스킬/전직/구형저장/장비/피해·명중·치명/기존17명 통과');
