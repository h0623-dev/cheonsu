import { getBattlefieldPlan } from '../data/battlefieldPlans.js';

// Only vegetation that belongs to this terrain moves. In particular, a saved
// map's generic "plain" tile must not add green grass to snow or stone floors.
const GRASS_BIOMES = new Set(['frontier', 'forest']);
const OPEN_SKY_BIOMES = new Set(['frontier', 'forest', 'snow', 'coast']);
const COVERED_STAGES = new Set([12, 16, 18, 21, 22, 25, 26, 30, 34, 41, 42, 43, 44, 45]);
const GRASS_TILES = new Set(['plain', 'forest']);
const HOT_TILES = new Set(['fire', 'lava']);

export const MAP_ATMOSPHERE_LIMITS = Object.freeze({
  normal: Object.freeze({ grass: 24, clouds: 2 }),
  low: Object.freeze({ grass: 12, clouds: 1 }),
});

export function getMapAtmospherePolicy(stageId) {
  const plan = getBattlefieldPlan(stageId);
  const covered = COVERED_STAGES.has(plan.id);
  return {
    biome: plan.biome,
    grass: !covered && GRASS_BIOMES.has(plan.biome),
    clouds: !covered && OPEN_SKY_BIOMES.has(plan.biome),
  };
}

function cellSeed(x, y, stageId) {
  let seed = Math.imul(x + 13, 374761393) ^ Math.imul(y + 19, 668265263) ^ Math.imul(stageId, 1274126177);
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
  return (seed ^ (seed >>> 16)) >>> 0;
}

export function getMapAtmosphereLayout(map, stageId, quality = 'normal') {
  const policy = getMapAtmospherePolicy(stageId);
  const width = map?.[0]?.length || 0;
  const height = map?.length || 0;
  const budget = MAP_ATMOSPHERE_LIMITS[quality] || MAP_ATMOSPHERE_LIMITS.normal;
  if (!width || !height) return { ...policy, grass: [], clouds: [] };
  const candidates = [];
  if (policy.grass) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (!GRASS_TILES.has(map[y]?.[x])) continue;
      // Tufts do not sprout in flames or lean over an adjacent lava/fire tile.
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => HOT_TILES.has(map[y + dy]?.[x + dx]))) continue;
      const seed = cellSeed(x, y, getBattlefieldPlan(stageId).id);
      candidates.push({ x, y, seed });
    }
  }
  candidates.sort((a, b) => a.seed - b.seed || a.y - b.y || a.x - b.x);
  const grass = [];
  for (const cell of candidates) {
    // Keep motion scattered rather than putting a patch on every selectable cell.
    if (grass.some(other => Math.abs(other.x - cell.x) + Math.abs(other.y - cell.y) < 3)) continue;
    const { x, y, seed } = cell;
    grass.push({
      x, y,
      left: (x + (seed % 2 ? 0.16 : 0.65)) / width * 100,
      top: (y + 0.84) / height * 100,
      duration: 3.8 + seed % 17 / 10,
      delay: -(seed % 43) / 10,
      variant: seed % 3,
    });
    if (grass.length >= budget.grass) break;
  }
  const clouds = policy.clouds ? Array.from({ length: budget.clouds }, (_, index) => ({
    index,
    left: index ? 45 : 1,
    top: index ? 59 : 16,
    duration: 72 + index * 19,
    delay: -18 - index * 27,
  })) : [];
  return { ...policy, grass, clouds };
}
