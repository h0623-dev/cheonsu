import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { getInitialParty, applyEquipmentStats, applyEquipmentToParty } from '../src/engine/partyEngine.js';
import { applyRecruitStartingGrowth, getRecruitStartingLevel } from '../src/engine/recruitmentEngine.js';
import { createExpansionRecruit } from '../src/engine/promotionEngine.js';
import { getSkillDisplayName } from '../src/data/skills.js';
import { RECRUIT_BY_STAGE } from '../src/data/characterCollection.js';

const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
const declarations = ast.body.filter(node => node.type === 'FunctionDeclaration'
  && ['createRecruitAlly', 'applyRecruitProgress'].includes(node.id.name));
const app = runInNewContext(declarations.map(node => source.slice(node.start, node.end)).join('\n')
  + '\n({createRecruitAlly, applyRecruitProgress})', {
  applyEquipmentStats, applyEquipmentToParty, applyRecruitStartingGrowth, createExpansionRecruit,
  getSkillDisplayName, RECRUIT_BY_STAGE,
});
const partyAt = levels => getInitialParty().map((unit, index) => ({ ...unit, level: levels[index] }));

test('신규 합류 기준은 최고 보유 동료의 70% 내림이며 적·비정상 레벨은 제외한다', () => {
  const party = partyAt([20, 9, 7, 15]);
  assert.equal(getRecruitStartingLevel([...party, { type: 'enemy', level: 99 }]), 14);
  assert.equal(getRecruitStartingLevel(partyAt([9, 4, 7, 3])), 6);
  assert.equal(getRecruitStartingLevel([{ type: 'ally', level: 7, hp: 0 }]), 4);
  assert.equal(getRecruitStartingLevel([{ type: 'ally', level: Infinity }]), 1);
  assert.equal(getRecruitStartingLevel([]), 1);
  assert.equal(getRecruitStartingLevel(null), 1);
});

test('기존·확장 모든 신규 동료에게 레벨과 실제 성장 수치를 함께 적용한다', () => {
  const party = partyAt([20, 3, 8, 5]);
  const before = structuredClone(party);
  for (const id of new Set(Object.values(RECRUIT_BY_STAGE))) {
    const original = app.createRecruitAlly(id);
    const joined = app.createRecruitAlly(id, party);
    assert.equal(joined.level, 14, id);
    assert.equal(joined.exp, 0, id);
    assert.equal(joined.hp, joined.maxHp, id);
    assert.equal(joined.maxHp, original.maxHp + 26, id);
    assert.equal(joined.baseAtk, original.baseAtk + 13, id);
    assert.equal(joined.baseDef, original.baseDef + 13, id);
    assert.equal(joined.atk, joined.baseAtk, id);
    assert.equal(joined.def, joined.baseDef, id);
  }
  assert.deepEqual(party, before);
});

test('과거 클리어의 누락 동료 복구도 같은 합류 기준을 쓰며 기존 저레벨 동료는 보존한다', () => {
  const party = partyAt([20, 8, 3, 6]);
  const leon = app.createRecruitAlly('leon');
  const owned = [...party, leon];
  const allStages = Object.keys(RECRUIT_BY_STAGE).map(Number);
  const restored = app.applyRecruitProgress(owned, allStages);
  assert.equal(restored.find(unit => unit.id === 'leon').level, 1);
  for (const unit of restored.filter(unit => !owned.some(member => member.id === unit.id))) {
    assert.equal(unit.level, 14);
  }
  const repeated = app.applyRecruitProgress(restored, allStages);
  assert.equal(repeated.length, restored.length);
  assert.deepEqual(JSON.parse(JSON.stringify(repeated)), JSON.parse(JSON.stringify(restored)));
  assert.equal(party[0].level, 20);
});
