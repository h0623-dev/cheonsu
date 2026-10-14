import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { makeAlly } from '../src/engine/partyEngine.js';
import { getAttackRange, canCounter, getUnitMoveTrait } from '../src/engine/movement.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { createRecruitAlly, createStageSeed } from './qa175-harness.mjs';
import { getSkill } from '../src/data/skills.js';

const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const { body } = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
const node = body.find(entry => entry.id?.name === 'getUnitRole');
const role = runInNewContext(`${source.slice(node.start, node.end)}\ngetUnitRole`);
const map = Array.from({ length: 10 }, () => Array(10).fill('plain'));
const enemy = { id: 'enemy', type: 'enemy', hp: 20, x: 5, y: 4 };

test('실제 신규 테오와 구형 전투 저장 모두 2칸 반격·인접 미반격', () => {
  const recruited = createRecruitAlly('teo');
  const legacy = { ...recruited, icon: '⚒️', range: 1, minRange: 1, move: 2, hp: 7,
    x: 4, y: 4, exp: 36, advancedMastery: 2, skillCooldowns: { rapid: 1 } };
  for (const teo of [{ ...recruited, x: 4, y: 4 }, makeAlly(legacy)]) {
    assert.deepEqual(getAttackRange(teo), { min: 2, max: 2 });
    assert.equal(canCounter(enemy, teo, map), false);
    assert.equal(canCounter({ ...enemy, x: 6 }, teo, map), true);
    assert.equal(getUnitMoveTrait(teo).id, 'ranger');
  }
  const raw = createStageSeed(15);
  const restored = normalizeSaveData({ ...raw, screen: 'battle', party: [...raw.party.filter(unit => unit.id !== 'teo'), legacy], units: [legacy, enemy] }, '1.99.175');
  const teo = restored.units.find(unit => unit.id === 'teo');
  for (const key of ['hp', 'x', 'y', 'exp', 'advancedMastery', 'skillCooldowns']) assert.deepEqual(teo[key], legacy[key]);
  assert.deepEqual(getAttackRange(teo), { min: 2, max: 2 });
});

test('구형 루카·미호·레온의 실제 무기 사거리와 기본 기술 유형을 복구', () => {
  for (const [id, expected] of [['luka', { min: 1, max: 1 }], ['miho', { min: 2, max: 2 }], ['leon', { min: 1, max: 2 }]]) {
    const unit = createRecruitAlly(id);
    const restored = makeAlly({ ...unit, range: id === 'luka' ? 3 : 1, minRange: 9 });
    assert.deepEqual(getAttackRange(restored), expected);
    assert.equal(restored.skillType, getSkill(restored, restored.activeSkillId).type);
    assert.equal(restored.skillRange, getSkill(restored, restored.activeSkillId).range);
  }
});

test('후반 성장으로 방어력이 높아져도 궁수·치유사·검사의 편성 역할이 바뀌지 않음', () => {
  for (const [id, expected] of [['teo', '원거리'], ['miho', '원거리'], ['luka', '근접'], ['leon', '근접'], ['ella', '힐러'], ['harin', '힐러'], ['sylvan', '원거리']]) {
    const unit = createRecruitAlly(id);
    assert.equal(role({ ...unit, level: 50, def: 99 }), expected);
  }
});
