import { getBattlefieldPlan } from './battlefieldPlans.js';

const PROFILES = {
  frontier: { weather: 'dust', ground: 'grass', air: '198 220 190', edge: '47 68 44', light: '245 231 180', mist: .11, shafts: .13 },
  forest: { weather: 'leaves', ground: 'grass', air: '174 213 192', edge: '31 58 45', light: '203 238 195', mist: .18, shafts: .18 },
  fortress: { weather: 'dust', ground: 'stone', air: '194 209 219', edge: '47 54 62', light: '230 226 206', mist: .1, shafts: .12 },
  snow: { weather: 'snow', ground: 'ice', air: '216 237 250', edge: '98 128 150', light: '237 249 255', mist: .18, shafts: .17 },
  citadel: { weather: 'ash', ground: 'rune', air: '183 189 219', edge: '49 49 68', light: '212 205 250', mist: .14, shafts: .19 },
  coast: { weather: 'spray', ground: 'wet', air: '187 223 232', edge: '61 86 94', light: '221 245 247', mist: .2, shafts: .13 },
  workshop: { weather: 'embers', ground: 'metal', air: '196 196 205', edge: '66 59 55', light: '255 200 125', mist: .09, shafts: .1 },
  starlight: { weather: 'stars', ground: 'rune', air: '184 215 236', edge: '48 61 82', light: '212 235 255', mist: .13, shafts: .24 },
};

export function getCinematicEnvironment(stageId, background = '') {
  const suppliedStage = Number(stageId);
  const backgroundStage = String(background).match(/chapter-(\d+)/)?.[1];
  const id = Number.isFinite(suppliedStage) && suppliedStage >= 1 && suppliedStage <= 50
    ? Math.floor(suppliedStage) : Number(backgroundStage) || 1;
  const plan = getBattlefieldPlan(id);
  const biome = String(background).includes('sanctuary-arena') ? 'starlight' : plan.biome;
  const profile = id === 4
    ? { ...PROFILES.forest, weather: 'embers', edge: '67 48 39', light: '255 184 112', mist: .12 }
    : PROFILES[biome] || PROFILES.frontier;
  return {
    stageId: id, biome, layout: plan.layout, ...profile,
    style: {
      '--cinematic-air': profile.air,
      '--cinematic-edge': profile.edge,
      '--cinematic-light': profile.light,
      '--cinematic-mist': profile.mist,
      '--cinematic-shafts': profile.shafts,
    },
    // Fixed seeds keep a resumed duel's atmosphere stable and avoid random render work.
    motes: Array.from({ length: 12 }, (_, index) => ({
      x: 5 + (id * 17 + index * 37) % 90,
      y: 8 + (id * 11 + index * 29) % 78,
      size: profile.weather === 'snow' ? 2 + index % 3 * .7 : 1.4 + index % 3 * .65,
      depth: index % 3,
    })),
  };
}
