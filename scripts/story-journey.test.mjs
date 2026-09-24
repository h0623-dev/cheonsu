import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_SCENES, STORY_ARCS } from '../src/data/storyScenes.js';
import { distributeBattleFormations } from '../src/engine/formations.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { stages } from '../src/data/stages.js';

const recruitAt = { 레온: 2, 세라: 4, 노아: 6, 유나: 8, 라칸: 10, 미호: 12, 테오: 14, 아이린: 16, 카즈: 18, 엘라: 20, 진: 22, 루카: 24, 백호: 26 };
const speakers = new Set(['카일', '브람', '리나', '아리아', '흑천 가론', ...Object.keys(recruitAt)]);
test('all 30 stages have authored intros and endings, valid cast, and progression-correct recruits', () => {
  assert.equal(STORY_ARCS.length, 5);
  assert.deepEqual(Object.keys(STORY_SCENES).map(Number), stages.map(stage => stage.id));
  const lines = [];
  for (const stage of stages) for (const type of ['intro', 'clear']) {
    const scene = STORY_SCENES[stage.id][type];
    assert.ok(scene.length >= 3 && scene.length <= 6);
    for (const line of scene) {
      assert.ok(speakers.has(line.speaker));
      assert.ok(line.text.length >= 10 && line.text.length < 135);
      assert.ok(!/ACT|다음 전투는 더 신중하게|돌파 완료/.test(line.text));
      if (recruitAt[line.speaker]) assert.ok(stage.id >= recruitAt[line.speaker] + (type === 'intro' ? 1 : 0));
      lines.push(line.text);
    }
  }
  assert.equal(new Set(lines).size, lines.length, 'No repeated placeholder dialogue');
  for (const [name, stageId] of Object.entries(recruitAt)) assert.ok(STORY_SCENES[stageId].clear.some(line => line.speaker === name));
});

test('formation fallback on small maps remains unique, immutable and connected', () => {
  const map = Array.from({ length: 6 }, () => Array(6).fill('plain'));
  const units = [{ id: 'hero', type: 'ally', x: 0, y: 0 }, { id: 'boss', type: 'boss', x: 0, y: 0 }];
  const copy = structuredClone(units);
  const result = distributeBattleFormations({ id: 2, map }, units);
  assert.deepEqual(units, copy);
  assert.notDeepEqual(result[0], result[1]);
  assert.equal(new Set(result.map(u => `${u.x},${u.y}`)).size, units.length);
  const island = [['plain','block','plain','plain'], ['block','block','plain','plain'], ['block','block','plain','plain']];
  assert.ok(distributeBattleFormations({ id: 1, map: island }, units).every(u => u.x >= 2));
});

test('legacy in-progress saves keep original terrain, positions and action flags', () => {
  const stage = structuredClone(stages[0]);
  const units = stage.units.map((u, index) => ({ ...u, x: index, y: 2, acted: true }));
  const saved = normalizeSaveData({ screen: 'battle', selectedStage: stage, units }, '1.99.133');
  assert.deepEqual(saved.selectedStage.map, stage.map);
  assert.deepEqual(saved.units.map(({id,x,y,acted}) => ({id,x,y,acted})), units.map(({id,x,y,acted}) => ({id,x,y,acted})));
});
