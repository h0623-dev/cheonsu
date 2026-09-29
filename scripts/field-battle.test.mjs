import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFieldBattlePlan, sampleFieldActor, fieldCamera, targetReaction, projectCell } from '../src/engine/fieldBattlePlan.js';
import { fieldProps, fieldSkills, fieldViewports, combatUnitIds } from './field-fixture.mjs';

for (const key of combatUnitIds) for (const mode of ['attack', 'skill']) {
  test(`field ${key} ${mode}: finite pose, return, real map and supported art`, () => {
    const props = fieldProps(key, mode === 'skill' ? fieldSkills.find(([id]) => id === key)?.[1].id || 'enemy-skill' : null);
    const plan = makeFieldBattlePlan(props.scene, props.attackerKey, props.defenderKey);
    assert.equal(plan.supported, true);
    assert.equal(plan.map, props.scene.fieldMap);
    assert.equal(plan.units.length, new Set(props.scene.fieldUnits.map(u => u.id)).size);
    for (let i = 0; i <= 100; i++) {
      const actor = sampleFieldActor(plan, i / 100);
      for (const v of [actor.x, actor.y, actor.lift, actor.lean, actor.squash]) assert.ok(Number.isFinite(v));
      assert.ok(['run-a', 'run-b', 'windup', 'strike', 'recover', 'skill'].includes(actor.pose));
    }
    assert.ok(Math.abs(sampleFieldActor(plan, 1).x - projectCell(props.scene.attacker).x) < .01);
    assert.ok(Math.abs(sampleFieldActor(plan, 1).y - projectCell(props.scene.attacker).y) < .01);
  });
}
for (const [key, skill] of fieldSkills) test(`field skill ${key}:${skill.id} framing and exact identity`, () => {
  const props = fieldProps(key, skill.id, { multi: skill.radius > 0 || skill.targets > 1 });
  const plan = makeFieldBattlePlan(props.scene, key, props.defenderKey);
  assert.equal(plan.name, skill.name);
  assert.equal(plan.skill, true);
  assert.ok(plan.effects.length >= 2);
  for (const viewport of fieldViewports) for (const p of [0, .35, .62, 1]) {
    const camera = fieldCamera(plan, viewport.width, viewport.height, p);
    for (const point of [plan.sourcePoint, ...plan.targets.map(projectCell)]) {
      const x = viewport.width / 2 + (point.x - camera.x) * camera.scale;
      const y = viewport.height / 2 + 8 + (point.y - camera.y) * camera.scale;
      assert.ok(x >= 35 && x <= viewport.width - 35, `${skill.id}: body horizontal fit`);
      assert.ok(y - 130 * camera.scale >= 52 && y <= viewport.height - 65, `${skill.id}: body vertical fit ${viewport.width}x${viewport.height}`);
    }
  }
});
test('field reduced motion, ranged release, dodge and death do not change game data', () => {
  const props = fieldProps('lina');
  const before = structuredClone(props);
  const plan = makeFieldBattlePlan(props.scene, 'lina', props.defenderKey);
  assert.equal(sampleFieldActor(plan, .39).pose, 'strike', 'bow release precedes projectile contact');
  assert.equal(sampleFieldActor(plan, .4, true).pose, 'recover');
  assert.equal(targetReaction({ ...plan, miss: true }, { ...plan.target, postHp: 0 }, 1).alpha, 1);
  assert.equal(targetReaction(plan, { ...plan.target, postHp: 0 }, 1).alpha, 0);
  assert.deepEqual(props, before);
});
