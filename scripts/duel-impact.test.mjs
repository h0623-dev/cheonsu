import test from 'node:test';
import assert from 'node:assert/strict';
import { createDuelLifecycle } from '../src/engine/duelLifecycle.js';
import { getDuelReach, projectDuelAnchor } from '../src/data/duelContactGeometry.js';
import { getDuelDefenderReaction, getDuelPoseAt, sampleDuelTrack } from '../src/data/duelPerformance.js';
import { combatArtKeys, getCombatChoreography } from '../src/data/combatArt.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { CHARACTER_SKILLS, withSkill } from '../src/data/skills.js';
import { EXPANSION_ENEMY_TEMPLATES } from '../src/data/expansionEnemies.js';

function lifecycle() {
  const jobs = [], calls = [];
  const clock = createDuelLifecycle({ duration: 1800, impact: .5, onImpact: () => calls.push('contact'), onComplete: () => calls.push('complete'), schedule: (callback, at) => { const job = { callback, at }; jobs.push(job); return job; }, cancel: job => { job.cancelled = true; } });
  return { clock, jobs, calls };
}

test('피해는 접촉에서 한 번만, 완료는 접촉 이후 한 번만 반영한다', () => {
  const { clock, jobs, calls } = lifecycle();
  assert.deepEqual(jobs.map(job => job.at), [900, 1800]);
  jobs[0].callback(); clock.hit(); jobs[1].callback(); clock.finish();
  assert.deepEqual(calls, ['contact', 'complete']);
});

test('앱 이탈 및 예약 콜백 취소 후에 피해를 적용하지 않는다', () => {
  const { clock, jobs, calls } = lifecycle();
  clock.cancel();
  for (const job of jobs) { assert.equal(job.cancelled, true); job.callback(); }
  clock.hit(); clock.finish();
  assert.deepEqual(calls, []);
});

test('브라우저가 완료 콜백부터 처리해도 접촉을 중복 적용하지 않는다', () => {
  const { jobs, calls } = lifecycle();
  jobs[1].callback(); jobs[0].callback();
  assert.deepEqual(calls, ['contact', 'complete']);
});

test('접촉 처리에서 앱 이탈하면 완료 콜백을 실행하지 않는다', () => {
  let clock, complete = 0;
  clock = createDuelLifecycle({ duration: 1, impact: .5, onImpact: () => clock.cancel(), onComplete: () => complete++, schedule: () => 0, cancel: () => {} });
  clock.finish();
  assert.equal(complete, 0);
});

test('다른 화면 폭과 아군·적군 위치에서도 실제 무기 끝이 피격점에 도달한다', () => {
  for (const width of [125, 168, 360]) for (const advance of [.94, 1, 1.14]) {
    const input = { attackerLeft: 0, attackerWidth: width, defenderLeft: width * 1.4, defenderWidth: width, tip: [.95, .54], scale: 1.5, footOffset: -.02, body: [9, 1.025, .98], advance };
    const reach = getDuelReach(input);
    const x = projectDuelAnchor(input.tip, { width, scale: input.scale, footOffset: input.footOffset, body: input.body })[0];
    assert.ok(Math.abs(reach * advance + x - (input.defenderLeft + width * .46)) < .00001);
  }
});

test('일반·스킬·연타는 접촉 정지 후 밀리고 회피·지원에는 접촉 정지가 없다', () => {
  for (const [key, mode, skillId] of [['hero', 'attack'], ['sera', 'skill', 'shade'], ['baekho', 'skill', 'tiger-fist']]) {
    const scene = { mode, attacker: { id: key, type: 'ally', activeSkillId: skillId }, outcome: { hit: true } };
    const plan = getCombatChoreography(key, scene);
    assert.ok(plan.contactPause >= .028 && plan.contactPause <= .04);
    const reaction = getDuelDefenderReaction(plan);
    for (const at of plan.contacts) {
      assert.deepEqual(sampleDuelTrack(plan.actor, at), sampleDuelTrack(plan.actor, at + plan.contactPause));
      assert.deepEqual(sampleDuelTrack(reaction.actor, at), sampleDuelTrack(reaction.actor, at + plan.contactPause));
    }
    assert.deepEqual(reaction.actor.at(-1), [1, 0, 0]);
    assert.deepEqual(getDuelDefenderReaction(plan, { support: true }).body, [[0, 0, 1, 1], [1, 0, 1, 1]]);
    assert.ok(getDuelDefenderReaction(plan, { miss: true }).actor.some(([, x]) => x === 12));
    const miss = getCombatChoreography(key, { ...scene, outcome: { hit: false } });
    assert.equal(miss.contactPause, 0);
    assert.deepEqual(miss.afterimages, []);
  }
});

test('활·포격·빙결 투사체의 도착과 실제 접촉 시각을 일치시킨다', () => {
  for (const [key, id] of [['teo','breaker'],['irene','ice-lance'],['lina','snipe']]) {
    const scene = { mode:'skill', attacker:withSkill({ id:key,type:'ally' },id), outcome:{hit:true} };
    const plan = getCombatChoreography(key,scene);
    const shots = plan.effects.filter(effect => ['arrow','ice'].includes(effect.shape) && effect.to[0] > .9);
    assert.ok(shots.length > 0);
    for (const shot of shots) assert.ok(plan.contacts.includes(shot.until));
  }
});

test('42개 최상위 전직은 아트 ID와 canonical ID를 분리하고 선택 기술을 보존한다', () => {
  const forms = Object.values(ADVANCED_CLASSES).flat();
  assert.equal(forms.length,42);
  for (const form of forms) {
    const scene = {mode:'skill',attacker:withSkill({id:form.unitId,type:'ally',advancedClass:form.id},form.skill.id),outcome:{hit:true,heal:form.skill.type==='heal',guard:form.skill.type==='guard'}};
    const saved = structuredClone(scene);
    const plan = getCombatChoreography(form.id,scene);
    assert.equal(plan.name,form.skill.name);
    assert.equal(plan.id,`${form.id}:${form.skill.id}`);
    assert.equal(plan.contacts.at(-1),.62);
    assert.deepEqual(plan.actor.at(-1),[1,0,0,0]);
    assert.deepEqual(scene,saved);
  }
});

test('신규 적의 ID 없는 실제 기술 스펙도 원본을 변경하지 않고 고유 기술로 연출한다', () => {
  for (const [key, template] of Object.entries(EXPANSION_ENEMY_TEMPLATES)) {
    const scene = {mode:'skill',attacker:{id:`stage-31-${key}`,type:template.rank==='boss'?'boss':'enemy',skillSpec:template.skillSpec},outcome:{hit:true}};
    const saved = structuredClone(scene);
    const plan = getCombatChoreography(key,scene);
    assert.equal(plan.id,`${key}:${key}-skill`);
    assert.equal(plan.name,template.skillSpec.name);
    assert.ok(plan.motion.startsWith('technique-'));
    assert.deepEqual(scene,saved);
  }
});

test('109개 전투 아트의 접촉 정지 중에는 공격자가 미끄러지지 않는다', () => {
  assert.equal(combatArtKeys.length, 109);
  for (const key of combatArtKeys) for (const mode of ['attack', 'skill']) {
    const canonical = key.split('__form')[0];
    const form = ADVANCED_CLASSES[canonical]?.find(value => value.id === key);
    const skill = form?.skill || CHARACTER_SKILLS[canonical]?.[0];
    const actor = { id: canonical, type: skill ? 'ally' : 'enemy', ...(form ? { advancedClass: form.id } : {}) };
    const scene = { mode, attacker: mode === 'skill' && skill ? withSkill(actor, skill.id) : actor, outcome: { hit: true, heal: mode === 'skill' && skill?.type === 'heal', guard: mode === 'skill' && skill?.type === 'guard' } };
    if (mode === 'skill' && EXPANSION_ENEMY_TEMPLATES[key]) scene.attacker.skillSpec = EXPANSION_ENEMY_TEMPLATES[key].skillSpec;
    const plan = getCombatChoreography(key, scene);
    if (!plan.moving || !plan.contactPause) continue;
    for (const at of plan.contacts) {
      const first = sampleDuelTrack(plan.actor, at);
      for (const fraction of [.2, .5, .8, 1]) {
        const held = sampleDuelTrack(plan.actor, at + plan.contactPause * fraction);
        held.forEach((value, index) => assert.ok(Math.abs(value - first[index]) < .0001, `${key}/${mode}/${at}: 접촉 정지 ${fraction}`));
      }
    }
  }
});

test('무기 방출과 장식은 준비·기술·회복의 같은 자세 경계를 사용한다', () => {
  const scene = { mode: 'skill', attacker: withSkill({ id: 'sylvan', type: 'ally' }, 'root-snare'), outcome: { hit: true } };
  const plan = getCombatChoreography('sylvan', scene);
  assert.equal(getDuelPoseAt(plan, 0), 'ready');
  assert.equal(getDuelPoseAt(plan, .24), 'windup');
  assert.equal(getDuelPoseAt(plan, plan.releases[0] - .001), 'windup');
  assert.equal(getDuelPoseAt(plan, plan.releases[0]), 'skill');
  assert.equal(getDuelPoseAt(plan, 1), 'ready');
});

test('근접 기술은 고유 준비 자세 뒤 실제 타격 원화로 접촉하고 연타 중 몸통도 멈춘다', () => {
  for (const [key, id] of [['hero','gale'],['mare','tide-thrust'],['harin','linked-fist'],['edan','breaker-hammer'],['baekho','tiger-fist']]) {
    const plan = getCombatChoreography(key, { mode: 'skill', attacker: withSkill({ id: key, type: 'ally' }, id), outcome: { hit: true } });
    assert.equal(plan.contactPose, 'strike');
    assert.ok(plan.poses.some(([, pose]) => pose === 'skill'));
    for (const at of plan.contacts) {
      assert.equal(getDuelPoseAt(plan, at), 'strike');
      const body = sampleDuelTrack(plan.body, at);
      for (const fraction of [.2, .5, .8, 1]) {
        assert.equal(getDuelPoseAt(plan, at + plan.contactPause * fraction), 'strike');
        sampleDuelTrack(plan.body, at + plan.contactPause * fraction).forEach((value, index) => assert.ok(Math.abs(value - body[index]) < .0001, `${key}/${at}: 접촉 중 몸통 정지`));
      }
    }
  }
  const mage = getCombatChoreography('sylvan', { mode: 'skill', attacker: withSkill({ id: 'sylvan', type: 'ally' }, 'root-snare'), outcome: { hit: true } });
  assert.equal(mage.contactPose, 'skill');
});
