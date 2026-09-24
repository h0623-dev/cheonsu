import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { getWorldBiome, getWorldScene, getWorldTileVisual, WORLD_BIOMES } from '../src/data/worldArt.js';

const manifest = JSON.parse(await readFile(new URL('../public/art/world-v2/manifest.json', import.meta.url), 'utf8'));
const types = ['plain', 'block', 'wall', 'void', 'forest', 'hill', 'fort', 'gate', 'road', 'dark', 'rune', 'trap', 'swamp', 'water', 'ice', 'fire'];

test('Every character and world asset is present in the production folder', async () => {
  assert.equal(Object.keys(manifest.units).length, 36);
  assert.equal(manifest.props.length, 16);
  assert.equal(manifest.terrain.length, 16);
  assert.equal(manifest.scenes.length, 6);
  const paths = Object.values(manifest.units).flatMap(unit => [unit.sprite, unit.portrait]);
  for (const group of ['props', 'terrain', 'scenes']) paths.push(...manifest[group].map(id => `/art/world-v2/${group}/${id}.webp`));
  for (const path of paths) await access(new URL(`../public${path}`, import.meta.url));
});

for (let stage = 1; stage <= 30; stage++) {
  test(`Stage ${stage}: all terrain is drawn from actual tile data in the correct biome`, () => {
    const map = Array.from({ length: 4 }, () => [...types]);
    const original = JSON.stringify(map);
    assert.equal(getWorldBiome(stage), WORLD_BIOMES[Math.floor((stage - 1) / 6)]);
    assert.ok(getWorldScene(stage).endsWith(`${getWorldBiome(stage)}.webp`));
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        const visual = getWorldTileVisual(map, x, y, stage);
        assert.ok(manifest.terrain.includes(visual.material));
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
  const map = Array.from({ length: 3 }, () => ['road', 'plain', 'road']);
  const center = getWorldTileVisual(map, 1, 1, 1);
  for (const edge of ['left', 'right', 'top', 'bottom']) assert.equal(center.style[`--blend-${edge}`], '0px');
});

test('Icon and screenshot metadata reference local files with current artwork', async () => {
  const pwa = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  for (const asset of [...pwa.icons, ...pwa.screenshots]) {
    assert.ok(asset.src.startsWith('/art/world-v2/'));
    await access(new URL(`../public${asset.src}`, import.meta.url));
  }
});
