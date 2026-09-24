export const WORLD_ART_ROOT = '/art/world-v2';
export const WORLD_BIOMES = ['frontier', 'forest', 'fortress', 'snow', 'citadel'];

export function getWorldBiome(stageId = 1) {
  return WORLD_BIOMES[Math.min(4, Math.max(0, Math.floor((stageId - 1) / 6)))];
}

export function getWorldScene(stageId = 1) {
  return `${WORLD_ART_ROOT}/scenes/${getWorldBiome(stageId)}.webp`;
}

const BASE_GROUND = { frontier: 'grass', forest: 'forest', fortress: 'stone', snow: 'snow', citadel: 'dark' };
const MATERIAL = { plain: 'grass', forest: 'forest', hill: 'rock', fort: 'stone', gate: 'paving', road: 'road', dark: 'dark', rune: 'rune', trap: 'trap', swamp: 'swamp', water: 'water', ice: 'ice', fire: 'fire' };
const BLOCK_PROPS = {
  frontier: ['oak', 'pine', 'rocks', 'maple'],
  forest: ['oak', 'pine', 'oak', 'rocks'],
  fortress: ['wall', 'pillar', 'rocks', 'wall'],
  snow: ['snow-pine', 'ice-crystal', 'snow-pine', 'rocks'],
  citadel: ['dead-tree', 'crystal', 'wall', 'rocks'],
};
const PROP_HEIGHT = { oak: 2.05, pine: 2.15, 'snow-pine': 2.15, 'dead-tree': 1.95, maple: 1.7, wall: 1.1, rocks: 0.92, pillar: 1.5, crystal: 1.2, 'ice-crystal': 1.2, shrub: 0.42, monument: 0.6, crates: 0.52, brazier: 0.55, arch: 1.6, palisade: 1.1 };

function materialFor(tile, biome) {
  if (tile === 'plain') return biome === 'frontier' ? 'road' : BASE_GROUND[biome];
  if (['plain', 'block', 'wall', 'void'].includes(tile)) return BASE_GROUND[biome];
  if (tile === 'forest' && biome === 'snow') return 'snow';
  if (tile === 'road' && biome === 'snow') return 'gravel';
  if (tile === 'road' && ['fortress', 'citadel'].includes(biome)) return 'paving';
  return MATERIAL[tile] || BASE_GROUND[biome];
}

export function getWorldTileVisual(map, x, y, stageId) {
  const tile = map[y][x];
  const biome = getWorldBiome(stageId);
  const material = materialFor(tile, biome);
  let seed = Math.imul(x + 11, 374761393) + Math.imul(y + 7, 668265263) + stageId * 19;
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
  seed = (seed ^ (seed >>> 16)) >>> 0;
  const blocked = ['block', 'wall', 'void'].includes(tile);
  let prop = null;
  if (blocked) {
    prop = BLOCK_PROPS[biome][seed % 4];
    const besideRoute = [[0, -1], [-1, 0], [1, 0]].some(([dx, dy]) => {
      const neighbor = map[y + dy]?.[x + dx];
      return neighbor != null && !['block', 'wall', 'void'].includes(neighbor);
    });
    // Lower blockers along paths keep feet and selectable units visible.
    if (besideRoute && biome !== 'fortress') prop = seed % 3 === 0 ? prop : 'rocks';
  }
  else if (tile === 'forest' || (tile === 'plain' && seed % 19 === 0)) prop = 'shrub';
  else if (tile === 'fort') prop = 'crates';
  else if (tile === 'gate') prop = 'monument';
  // Shared material edges meet squarely; only exposed edges receive a soft corner.
  const same = (dx, dy) => map[y + dy]?.[x + dx] != null && materialFor(map[y + dy][x + dx], biome) === material;
  const corners = [[-1, 0, 0, -1], [1, 0, 0, -1], [1, 0, 0, 1], [-1, 0, 0, 1]]
    .map(([ax, ay, bx, by]) => same(ax, ay) || same(bx, by) ? '0' : '36%').join(' ');
  return {
    material, prop, blocked,
    style: {
      '--ground-image': `url("${WORLD_ART_ROOT}/terrain/${material}.webp")`,
      '--ground-radius': corners,
      '--ground-position': `${(x % 3) * 50}% ${(y % 3) * 50}%`,
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
