import { getBattlefieldPlan } from './battlefieldPlans.js';

const PROFILES = {
  frontier: { weather: 'dust', ground: 'grass', air: '198 220 190', edge: '47 68 44', light: '255 231 172', mist: .1, shafts: .19, horizon: 43 },
  forest: { weather: 'leaves', ground: 'grass', air: '174 213 192', edge: '31 58 45', light: '225 248 190', mist: .14, shafts: .23, horizon: 46 },
  fortress: { weather: 'dust', ground: 'stone', air: '194 209 219', edge: '47 54 62', light: '255 229 182', mist: .09, shafts: .17, horizon: 40 },
  snow: { weather: 'snow', ground: 'ice', air: '216 237 250', edge: '98 128 150', light: '233 248 255', mist: .14, shafts: .21, horizon: 43 },
  citadel: { weather: 'ash', ground: 'rune', air: '183 189 219', edge: '49 49 68', light: '230 211 255', mist: .11, shafts: .22, horizon: 39 },
  coast: { weather: 'spray', ground: 'wet', air: '187 223 232', edge: '61 86 94', light: '220 251 246', mist: .16, shafts: .19, horizon: 44 },
  workshop: { weather: 'embers', ground: 'metal', air: '196 196 205', edge: '66 59 55', light: '255 200 125', mist: .09, shafts: .17, horizon: 41 },
  starlight: { weather: 'stars', ground: 'rune', air: '184 215 236', edge: '48 61 82', light: '241 228 190', mist: .1, shafts: .25, horizon: 39 },
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
      '--cinematic-horizon': `${profile.horizon}%`,
      '--cinematic-light-x': `${34 + (id * 13) % 34}%`,
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
