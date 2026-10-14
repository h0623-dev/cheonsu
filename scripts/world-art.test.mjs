import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { getWorldBiome, getWorldScene, getWorldTileVisual } from '../src/data/worldArt.js';
import { getBattlefieldPlan } from '../src/data/battlefieldPlans.js';
import { createBattlefieldTerrain } from '../src/data/stageTerrain.js';
import { NEW_TERRAIN_IDS } from '../src/data/terrainPolicy.js';
import { stages } from '../src/data/stages.js';

const manifest = JSON.parse(await readFile(new URL('../public/art/world-v2/manifest.json', import.meta.url), 'utf8'));
const types = ['plain', 'block', 'wall', 'void', 'forest', 'hill', 'fort', 'gate', 'road', 'dark', 'rune', 'trap', 'swamp', 'water', 'ice', 'fire', ...NEW_TERRAIN_IDS];

test('Every character and world asset is present in the production folder', async () => {
  assert.equal(Object.keys(manifest.units).length, 36);
  assert.equal(manifest.props.length, 16);
  assert.equal(manifest.terrain.length, 16);
  assert.equal(manifest.scenes.length, 6);
  const paths = Object.values(manifest.units).flatMap(unit => [unit.sprite, unit.portrait]);
  for (const group of ['props', 'terrain', 'scenes']) paths.push(...manifest[group].map(id => `/art/world-v2/${group}/${id}.webp`));
  for (const path of paths) await access(new URL(`../public${path}`, import.meta.url));
});

for (let stage = 1; stage <= stages.length; stage++) {
  test(`Stage ${stage}: all terrain is drawn from actual tile data in the correct biome`, () => {
    const map = Array.from({ length: 4 }, () => [...types]);
    const original = JSON.stringify(map);
    assert.equal(getWorldBiome(stage), getBattlefieldPlan(stage).biome);
    assert.equal(getWorldScene(stage), `/art/chapters-v1/chapter-${String(stage).padStart(2, '0')}.webp`);
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        const visual = getWorldTileVisual(map, x, y, stage);
        assert.ok([...manifest.terrain, ...NEW_TERRAIN_IDS].includes(visual.material));
        if (visual.prop) assert.ok(manifest.props.includes(visual.prop));
        assert.equal(visual.blocked, ['block', 'wall', 'void'].includes(map[y][x]));
        if (visual.blocked) assert.ok(visual.prop, 'Every blocked cell needs a visible obstacle');
        assert.equal(visual.style['--row-z'], y * 10 + 5, 'Objects must sort by ground position');
        assert.deepEqual(visual, getWorldTileVisual(map, x, y, stage), 'No visual jumping during React rerenders');
      }
    }
    assert.equal(JSON.stringify(map), original, 'Art must not change gameplay or stored maps');
  });
}

test('Matching path tiles have no internal fading seams', () => {
  const map = Array.from({ length: 3 }, () => ['road', 'road', 'road']);
  const center = getWorldTileVisual(map, 1, 1, 1);
  for (const edge of ['left', 'right', 'top', 'bottom']) assert.equal(center.style[`--blend-${edge}`], '0px');
});

test('Open grass and the road use visibly different terrain materials', () => {
  const map = [['plain', 'road']];
  assert.notEqual(getWorldTileVisual(map, 0, 0, 1).material, getWorldTileVisual(map, 1, 0, 1).material);
});

test('3장 성문·엄폐 지형은 전리품 상자나 조사물 장식을 생성하지 않는다', () => {
  const map = createBattlefieldTerrain(3);
  let coverCells = 0;
  let gateCells = 0;
  for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
    const tile = map[y][x];
    if (tile !== 'fort' && tile !== 'gate') continue;
    if (tile === 'fort') coverCells += 1;
    else gateCells += 1;
    const visual = getWorldTileVisual(map, x, y, 3);
    assert.equal(visual.material, tile === 'fort' ? 'stone' : 'paving');
    assert.equal(visual.prop, null);
    assert.equal(visual.blocked, false);
  }
  assert.ok(coverCells > 0, '실제 3장 성문 접근로의 엄폐 칸을 포함한다');
  assert.ok(gateCells > 0, '실제 3장 성문을 포함한다');
});

test('전체 50장 지형 장식은 보물 상자를 만들지 않고 실제 차단 지형은 표시한다', () => {
  for (const stage of stages) {
    const map = createBattlefieldTerrain(stage.id);
    const before = JSON.stringify(map);
    for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
      const visual = getWorldTileVisual(map, x, y, stage.id);
      assert.notEqual(visual.prop, 'crates', `${stage.id}장 ${x},${y}`);
      if (visual.blocked) assert.ok(visual.prop, '차단 칸의 지형 장애물은 유지한다');
      if (['fort', 'gate', 'low_rubble'].includes(map[y][x])) assert.equal(visual.prop, null);
    }
    assert.equal(JSON.stringify(map), before, '장식 변경은 저장 지도와 게임 규칙을 바꾸지 않는다');
  }
});

test('기존 저장의 평지·숲은 장별 바닥과 식생에 맞고 별빛이끼는 고유 재질을 유지한다', () => {
  const forestGround = { frontier: 'forest', forest: 'forest', fortress: 'stone', snow: 'snow', citadel: 'dark', coast: 'paving', workshop: 'stone', starlight: 'paving' };
  for (const stage of stages) {
    const biome = getWorldBiome(stage.id);
    const green = ['frontier', 'forest'].includes(biome);
    const map = Array.from({ length: 8 }, () => ['forest', ...Array(19).fill('plain')]);
    for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
      const visual = getWorldTileVisual(map, x, y, stage.id);
      if (!green) assert.notEqual(visual.prop, 'shrub', `${stage.id}장 ${x},${y}: 일반 녹색 풀 제외`);
      if (map[y][x] === 'forest') {
        assert.equal(visual.material, forestGround[biome]);
        assert.equal(visual.prop, green ? 'shrub' : null);
      }
    }
  }
  const starMoss = getWorldTileVisual([['star_moss']], 0, 0, 46);
  assert.equal(starMoss.material, 'star_moss');
  assert.equal(starMoss.prop, null);
});

test('실내·빙굴·창고 차단물은 건축 환경을 따르고 26장 야외 숲의 나무는 유지한다', () => {
  const map = Array.from({ length: 12 }, () => Array(12).fill('block'));
  const chapterProps = {
    12: ['wall', 'pillar', 'rocks'], 18: ['wall', 'pillar', 'rocks'],
    25: ['wall', 'pillar', 'rocks'], 30: ['wall', 'pillar', 'rocks'],
    16: ['wall', 'pillar', 'ice-crystal', 'rocks'],
    21: ['wall', 'pillar', 'ice-crystal', 'rocks'],
    40: ['wall', 'pillar', 'ice-crystal', 'rocks'],
    34: ['wall', 'pillar', 'rocks'],
  };
  for (const [id, allowed] of Object.entries(chapterProps)) {
    const seen = new Set();
    for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
      const visual = getWorldTileVisual(map, x, y, Number(id));
      assert.ok(visual.blocked);
      assert.ok(allowed.includes(visual.prop), `${id}장 ${x},${y}: 실내에 야외 나무를 추가하지 않는다`);
      seen.add(visual.prop);
    }
    assert.deepEqual([...seen].sort(), [...allowed].sort(), `${id}장의 건축 차단물 종류`);
  }
  const forestProps = new Set();
  for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
    const visual = getWorldTileVisual(map, x, y, 26);
    assert.ok(['oak', 'pine', 'rocks'].includes(visual.prop));
    forestProps.add(visual.prop);
  }
  assert.ok(forestProps.has('oak'), '26장 숲의 참나무 유지');
  assert.ok(forestProps.has('pine'), '26장 숲의 소나무 유지');
});

test('Icon and screenshot metadata reference local files with current artwork', async () => {
  const pwa = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  for (const asset of [...pwa.icons, ...pwa.screenshots]) {
    assert.ok(asset.src.startsWith('/art/world-v2/'));
    await access(new URL(`../public${asset.src}`, import.meta.url));
  }
});
