import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { getCharacterCollection, filterCharacterCollection, RECRUIT_BY_STAGE } from '../src/data/characterCollection.js';
import { combatUnitIds, getCombatChoreography } from '../src/data/combatArt.js';
import { CHARACTER_SKILLS, withSkill } from '../src/data/skills.js';
import { getImpactParticle } from '../src/data/duelPerformance.js';

test('collection lists all 41 characters; only four starting allies are initially colored', async () => {
  const entries = getCharacterCollection();
  assert.equal(entries.length, 41); assert.equal(new Set(entries.map(e => e.id)).size, 41);
  assert.equal(entries.filter(e => e.kind === 'ally').length, 17);
  assert.equal(entries.filter(e => e.kind === 'enemy').length, 19);
  assert.equal(entries.filter(e => e.kind === 'boss').length, 5);
  assert.deepEqual(entries.filter(e => e.unlocked).map(e => e.id), ['hero', 'bram', 'lina', 'aria']);
  for (const entry of entries) await access(`public${entry.art}`);
});
test('collection uses actual ownership or exact recruit clear evidence, not the highest unlocked stage', () => {
  const state = { party: [{ id: 'miho', level: 9, learnedTechniques: [], equipment: { weapon: 'staff' } }], clearedStages: [2, 8, 30, '26', 999] };
  const before = structuredClone(state), entries = getCharacterCollection(state);
  for (const id of ['leon', 'yuna', 'miho']) assert.ok(entries.find(e => e.id === id).unlocked);
  for (const id of ['sera', 'noah', 'baekho']) assert.equal(entries.find(e => e.id === id).unlocked, false);
  assert.equal(entries.find(e => e.id === 'miho').level, 9);
  assert.deepEqual(state, before);
  assert.equal(Object.keys(RECRUIT_BY_STAGE).length, 13);
});
test('enemy and boss records are colored only after a stage containing that identity is cleared', () => {
  const entries = getCharacterCollection({ clearedStages: [1], encounters: [{ key: 'sentinel', stageId: 1, name: '국경 방패병' }, { key: 'boss_commander', stageId: 1, name: '초소장' }, { key: 'boss_abyss', stageId: 3, name: '흑천 가론' }] });
  assert.ok(entries.find(e => e.id === 'sentinel').unlocked);
  assert.ok(entries.find(e => e.id === 'boss_commander').unlocked);
  assert.equal(entries.find(e => e.id === 'boss_abyss').unlocked, false);
  assert.equal(entries.find(e => e.id === 'boss_abyss').bio, '');
  assert.equal(entries.find(e => e.id === 'leon').skills.length, 0);
});
test('collection filters compose without hiding the uncollected catalog or changing source data', () => {
  const entries = getCharacterCollection();
  assert.equal(filterCharacterCollection(entries, { kind: 'ally', state: 'locked' }).length, 13);
  assert.equal(filterCharacterCollection(entries, { kind: 'ally', state: 'owned', query: ' 리나 ' })[0].id, 'lina');
  assert.equal(filterCharacterCollection(entries, { kind: 'enemy', state: 'owned' }).length, 0);
  assert.equal(filterCharacterCollection(entries, { kind: 'all', query: '없는이름' }).length, 0);
});
test('all allies, enemies and bosses have release-linked physical poses and bounded impact particles', () => {
  for (const id of combatUnitIds) for (const mode of ['attack', 'skill']) {
    const scene = { mode, attacker: { id, type: CHARACTER_SKILLS[id] ? 'ally' : id.startsWith('boss') ? 'boss' : 'enemy' }, outcome: { hit: true } };
    const plan = getCombatChoreography(id, scene);
    assert.ok(plan.body.length >= 8, id);
    assert.equal(plan.impacts.length, plan.contacts.length);
    for (const release of plan.releases) assert.ok(plan.poses.some(([at, pose]) => at === release && ['strike', 'skill'].includes(pose)), `${id}:${mode}: actual release pose`);
    for (const track of [plan.actor, plan.body, plan.poses]) assert.ok(track.every(([at], i) => at >= 0 && at <= 1 && (!i || at > track[i - 1][0])), id);
    for (const impact of plan.impacts) for (let i = 0; i < impact.count; i++) {
      const particle = getImpactParticle(impact, i);
      assert.ok(Object.values(particle).every(Number.isFinite));
      assert.ok(particle.end > impact.at && particle.end <= 1);
      assert.deepEqual(particle, getImpactParticle(impact, i));
    }
    if (plan.moving) assert.ok(plan.footfalls.length >= 3, id);
  }
});
test('every multi-hit skill resets its weapon between releases, while support has no damage burst', () => {
  for (const [id, skills] of Object.entries(CHARACTER_SKILLS)) for (const skill of skills) {
    const scene = { mode: 'skill', attacker: withSkill({ id, type: 'ally' }, skill.id), outcome: { hit: true, heal: skill.type === 'heal', guard: skill.type === 'guard' } };
    const plan = getCombatChoreography(id, scene);
    if (skill.type !== 'attack') assert.equal(plan.impacts.length, 0);
    else for (let i = 1; i < plan.releases.length; i++) {
      assert.ok(plan.poses.some(([at, pose]) => at > plan.releases[i - 1] && at < plan.releases[i] && pose === 'windup'), `${id}:${skill.id}`);
    }
    assert.equal(plan.contacts.at(-1), plan.impact);
  }
});
