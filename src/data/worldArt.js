import { getBattlefieldPlan } from './battlefieldPlans.js';
import { getNewTerrainPolicy } from './terrainPolicy.js';
export const WORLD_ART_ROOT = '/art/world-v2';
export const WORLD_BIOMES = ['frontier', 'forest', 'fortress', 'snow', 'citadel', 'coast', 'workshop', 'starlight'];

export function getWorldBiome(stageId = 1) {
  return getBattlefieldPlan(stageId).biome;
}

export function getWorldScene(stageId = 1) {
  return `/art/chapters-v1/chapter-${String(getBattlefieldPlan(stageId).id).padStart(2, '0')}.webp`;
}

export function getWorldSceneThumbnail(stageId = 1) {
  return getWorldScene(stageId).replace('.webp', '-thumb.webp');
}

const BASE_GROUND = { frontier: 'grass', forest: 'forest', fortress: 'stone', snow: 'snow', citadel: 'dark', coast: 'paving', workshop: 'stone', starlight: 'paving' };
const GREEN_VEGETATION_BIOMES = new Set(['frontier', 'forest']);
const MATERIAL = { plain: 'grass', forest: 'forest', hill: 'rock', fort: 'stone', gate: 'paving', road: 'road', dark: 'dark', rune: 'rune', trap: 'trap', swamp: 'swamp', water: 'water', ice: 'ice', fire: 'fire' };
const BLOCK_PROPS = {
  frontier: ['oak', 'pine', 'rocks', 'maple'],
  forest: ['oak', 'pine', 'oak', 'rocks'],
  fortress: ['wall', 'pillar', 'rocks', 'wall'],
  snow: ['snow-pine', 'ice-crystal', 'snow-pine', 'rocks'],
  citadel: ['dead-tree', 'crystal', 'wall', 'rocks'],
  coast: ['rocks', 'pillar', 'rocks', 'rocks'],
  workshop: ['wall', 'pillar', 'rocks', 'wall'],
  starlight: ['rocks', 'crystal', 'monument', 'pillar'],
};
// Interior architecture belongs to these authored chapters even when their
// broader biome is snow or citadel. Chapter 26 remains a living forest.
const STAGE_BLOCK_PROPS = {
  12: ['wall', 'pillar', 'rocks', 'pillar'],
  18: ['wall', 'pillar', 'rocks', 'pillar'],
  25: ['wall', 'pillar', 'rocks', 'pillar'],
  30: ['wall', 'pillar', 'rocks', 'pillar'],
  16: ['wall', 'pillar', 'ice-crystal', 'rocks'],
  21: ['wall', 'pillar', 'ice-crystal', 'rocks'],
  40: ['wall', 'pillar', 'ice-crystal', 'rocks'],
  34: ['wall', 'pillar', 'rocks', 'wall'],
};
const PROP_HEIGHT = { oak: 2.05, pine: 2.15, 'snow-pine': 2.15, 'dead-tree': 1.95, maple: 1.7, wall: 1.1, rocks: 0.92, pillar: 1.5, crystal: 1.2, 'ice-crystal': 1.2, shrub: 0.42, monument: 0.6, crates: 0.52, brazier: 0.55, arch: 1.6, palisade: 1.1 };

function materialFor(tile, biome) {
  const expansion = getNewTerrainPolicy(tile);
  if (expansion) return expansion.material;
  if (tile === 'plain') return BASE_GROUND[biome];
  if (['plain', 'block', 'wall', 'void'].includes(tile)) return BASE_GROUND[biome];
  // Saved generic forest cells retain their movement rules while their ground
  // matches the chapter. Authored star moss keeps its own expansion material.
  if (tile === 'forest' && !GREEN_VEGETATION_BIOMES.has(biome)) return BASE_GROUND[biome];
  if (tile === 'road' && biome === 'snow') return 'gravel';
  if (tile === 'road' && ['fortress', 'citadel'].includes(biome)) return 'paving';
  return MATERIAL[tile] || BASE_GROUND[biome];
}

export function getWorldTileVisual(map, x, y, stageId) {
  const tile = map[y][x];
  const biome = getWorldBiome(stageId);
  const material = materialFor(tile, biome);
  const expansion = getNewTerrainPolicy(tile);
  let seed = Math.imul(x + 11, 374761393) + Math.imul(y + 7, 668265263) + stageId * 19;
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
  seed = (seed ^ (seed >>> 16)) >>> 0;
  const blocked = ['block', 'wall', 'void'].includes(tile);
  let prop = null;
  if (blocked) {
    prop = (STAGE_BLOCK_PROPS[stageId] || BLOCK_PROPS[biome])[seed % 4];
    const besideRoute = [[0, -1], [-1, 0], [1, 0]].some(([dx, dy]) => {
      const neighbor = map[y + dy]?.[x + dx];
      return neighbor != null && !['block', 'wall', 'void'].includes(neighbor);
    });
    // Lower blockers along paths keep feet and selectable units visible.
    if (besideRoute && biome !== 'fortress') prop = seed % 3 === 0 ? prop : 'rocks';
  }
  else if (GREEN_VEGETATION_BIOMES.has(biome) && (tile === 'forest' || (tile === 'plain' && seed % 19 === 0))) prop = 'shrub';
  // Fort and gate ground stays traversable; only real discoveries receive
  // container / monument markers, so their rewards remain identifiable.
  else if (expansion?.prop) prop = expansion.prop;
  // Shared material edges meet squarely; only exposed edges receive a soft corner.
  const same = (dx, dy) => map[y + dy]?.[x + dx] != null && materialFor(map[y + dy][x + dx], biome) === material;
  const corners = [[-1, 0, 0, -1], [1, 0, 0, -1], [1, 0, 0, 1], [-1, 0, 0, 1]]
    .map(([ax, ay, bx, by]) => same(ax, ay) || same(bx, by) ? '0' : '36%').join(' ');
  return {
    material, prop, blocked,
    style: {
      '--ground-image': `url("${WORLD_ART_ROOT}/terrain/${material}.webp")`,
      '--ground-radius': corners,
      '--ground-position': expansion ? 'center' : `${(x % 3) * 50}% ${(y % 3) * 50}%`,
      '--ground-size': expansion ? '100% 100%' : '300% 300%',
      '--blend-left': same(-1, 0) ? '0px' : '9px',
      '--blend-right': same(1, 0) ? '0px' : '9px',
      '--blend-top': same(0, -1) ? '0px' : '7px',
      '--blend-bottom': same(0, 1) ? '0px' : '7px',
      '--prop-height': `${(PROP_HEIGHT[prop] || 1) * (0.86 + (seed % 29) / 100)}`,
      '--prop-x': `${blocked ? 38 + seed % 25 : 15}%`,
      '--prop-ground': `${blocked ? 70 : 45}%`,
      '--prop-z': y * 10 + 4,
      '--row-z': y * 10 + 5,
    },
  };
}

export function getWorldMapStyle(stageId) {
  const biome = getWorldBiome(stageId);
  return { '--world-ground': `url("${WORLD_ART_ROOT}/terrain/${BASE_GROUND[biome]}.webp")` };
}
