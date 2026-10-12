import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLEFIELD_PLANS } from '../src/data/battlefieldPlans.js';
import { createBattlefieldTerrain } from '../src/data/stageTerrain.js';
import { getMapAtmosphereLayout, getMapAtmospherePolicy, MAP_ATMOSPHERE_LIMITS } from '../src/engine/mapAtmosphere.js';

test('잔잔한 풀은 숲과 초원의 평지·숲 타일에만 생성된다', () => {
  const map = Array.from({ length: 15 }, () => ['plain', 'road', 'forest', 'water', 'fire', 'block', 'plain', 'hill']);
  const layout = getMapAtmosphereLayout(map, 1);
  assert.ok(layout.grass.length > 0);
  for (const tuft of layout.grass) assert.ok(['plain', 'forest'].includes(map[tuft.y][tuft.x]));
  assert.equal(layout.clouds.length, 2);
});

test('불길과 용암에 인접한 풀은 생성하지 않는다', () => {
  assert.deepEqual(getMapAtmosphereLayout([['plain', 'fire', 'plain']], 1).grass, []);
  assert.deepEqual(getMapAtmosphereLayout([['plain'], ['lava'], ['forest']], 7).grass, []);
});

test('눈·해안·실내의 평지 저장 지형에 녹색 풀을 추가하지 않는다', () => {
  const oldSavedMap = Array.from({ length: 12 }, () => Array(12).fill('plain'));
  for (const stageId of [3, 6, 12, 31, 35, 36, 40, 41, 45, 46, 50]) {
    assert.deepEqual(getMapAtmosphereLayout(oldSavedMap, stageId).grass, [], `${stageId}장`);
  }
});

test('실내·지하 공방에는 구름 그림자를 추가하지 않는다', () => {
  for (const stageId of [12, 16, 18, 21, 22, 25, 26, 30, 34, 41, 42, 43, 44, 45]) {
    assert.equal(getMapAtmospherePolicy(stageId).clouds, false, `${stageId}장`);
  }
  for (const stageId of [1, 7, 31, 35, 36, 40]) assert.equal(getMapAtmospherePolicy(stageId).clouds, true, `${stageId}장`);
});

test('전체 50장에 지도 좌표와 제한된 효과 수를 유지한다', () => {
  for (const stage of BATTLEFIELD_PLANS) {
    const map = createBattlefieldTerrain(stage.id);
    for (const quality of ['normal', 'low']) {
      const layout = getMapAtmosphereLayout(map, stage.id, quality);
      assert.ok(layout.grass.length <= MAP_ATMOSPHERE_LIMITS[quality].grass);
      assert.ok(layout.clouds.length <= MAP_ATMOSPHERE_LIMITS[quality].clouds);
      for (const tuft of layout.grass) {
        assert.ok(tuft.x >= 0 && tuft.x < stage.width);
        assert.ok(tuft.y >= 0 && tuft.y < stage.height);
        assert.ok(tuft.left >= 0 && tuft.left <= 100);
        assert.ok(tuft.top >= 0 && tuft.top <= 100);
      }
    }
  }
});

test('축소 효과 모드는 기존 풀 위치를 유지하고 개수만 줄인다', () => {
  const map = Array.from({ length: 30 }, () => Array(30).fill('plain'));
  const normal = getMapAtmosphereLayout(map, 1);
  const low = getMapAtmosphereLayout(map, 1, 'low');
  assert.equal(normal.grass.length, 24);
  assert.equal(low.grass.length, 12);
  assert.deepEqual(low.grass, normal.grass.slice(0, 12));
  assert.deepEqual(low.clouds, normal.clouds.slice(0, 1));
});

test('카메라 이동·재렌더링 시 풀 위치가 바뀌지 않고 원본 지형을 보존한다', () => {
  const map = createBattlefieldTerrain(1);
  const snapshot = structuredClone(map);
  const first = getMapAtmosphereLayout(map, 1);
  assert.deepEqual(getMapAtmosphereLayout(map, 1), first);
  assert.deepEqual(map, snapshot);
  for (let a = 0; a < first.grass.length; a++) for (let b = a + 1; b < first.grass.length; b++) {
    assert.ok(Math.abs(first.grass[a].x - first.grass[b].x) + Math.abs(first.grass[a].y - first.grass[b].y) >= 3);
  }
});

test('빈 지도와 누락된 저장 지도에는 효과를 생성하지 않는다', () => {
  for (const map of [undefined, null, [], [[]]]) {
    const layout = getMapAtmosphereLayout(map, 1);
    assert.deepEqual(layout.grass, []);
    assert.deepEqual(layout.clouds, []);
  }
});
