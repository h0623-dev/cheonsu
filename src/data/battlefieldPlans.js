// Sizes are authored per chapter, not scaled from the old portrait board.
const rows = [
  [16,18,'south','crossroads','frontier','국경의 갈림길'],
  [26,16,'west','gorge','frontier','협곡 횡단로'],
  [18,22,'north','gates','fortress','북문 돌파전'],
  [22,18,'east','ruins','forest','불타는 폐허'],
  [18,26,'southwest','ridge','frontier','비탈의 우회로'],
  [24,20,'west','bridges','snow','얼어붙은 쌍교'],
  [20,20,'southeast','grove','forest','안개 숲 공터'],
  [28,18,'east','islands','frontier','여울의 돌다리'],
  [18,24,'north','gorge','forest','수림 협로'],
  [26,22,'south','gates','fortress','외곽 성벽'],
  [30,18,'west','harbor','fortress','부두 측면 진입'],
  [20,18,'northeast','ruins','citadel','봉인된 작은 신전'],
  [22,26,'north','ridge','frontier','붉은 고원'],
  [28,20,'east','crossroads','fortress','도시 교차로'],
  [20,20,'northwest','grove','forest','잠든 정원'],
  [18,28,'south','bridges','snow','빙하 다리'],
  [30,20,'west','harbor','fortress','성벽 아래 수로'],
  [24,24,'southeast','citadel','citadel','심연의 제단'],
  [20,22,'north','grove','snow','설원의 피난처'],
  [28,18,'east','ridge','snow','얼음 능선'],
  [22,26,'southwest','islands','snow','떠오른 얼음섬'],
  [26,20,'west','ruins','fortress','무너진 병영'],
  [20,24,'south','gorge','snow','마지막 고갯길'],
  [30,24,'northeast','gates','citadel','천공의 관문'],
  [24,20,'east','crossroads','citadel','황혼의 분기점'],
  [20,22,'northwest','grove','forest','생명의 성소'],
  [32,20,'west','bridges','citadel','검은 강 횡단'],
  [24,28,'north','harbor','fortress','폐성의 수문'],
  [22,22,'southeast','islands','citadel','부유하는 회랑'],
  [30,28,'southwest','citadel','citadel','최후의 왕좌'],
];
export const BATTLEFIELD_PLANS = rows.map(([width,height,direction,layout,biome,name], index) =>
  Object.freeze({ id: index + 1, width, height, direction, layout, biome, name }));
export function getBattlefieldPlan(id = 1) {
  return BATTLEFIELD_PLANS[Math.max(0, Math.min(29, Math.floor(Number(id) || 1) - 1))];
}

// Canonical coordinates have the ally rear at v=1. Transform terrain and spawns together.
export function orientBattlePoint(u, v, direction = 'south') {
  if (direction === 'west') return [1-v, u];
  if (direction === 'east') return [v, 1-u];
  if (direction === 'north') return [1-u, 1-v];
  if (direction === 'south') return [u, v];
  const along = (v-.5)*.86, across = (u-.5)*.7;
  const sx = direction.includes('west') ? -1 : 1;
  const sy = direction.includes('north') ? -1 : 1;
  return [.5+sx*along+sy*across, .5+sy*along-sx*across];
}
export function deploymentDepth(x, y, direction = 'south') {
  if (direction === 'west') return 1-x;
  if (direction === 'east') return x;
  if (direction === 'north') return 1-y;
  if (direction === 'south') return y;
  return ((direction.includes('west') ? 1-x : x) + (direction.includes('north') ? 1-y : y))/2;
}
