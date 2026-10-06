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
  [18,24,'north','gorge','forest','수풀에 묻힌 시장 골목'],
  [26,22,'south','gates','fortress','외곽 성벽'],
  [30,18,'west','harbor','fortress','부두 측면 진입'],
  [20,18,'northeast','ruins','citadel','봉인된 작은 신전'],
  [22,26,'north','ridge','frontier','도성 외곽의 비탈 골목'],
  [28,20,'east','crossroads','fortress','사원 앞 교차로'],
  [20,20,'northwest','grove','forest','달 없는 협곡의 수림'],
  [18,28,'south','bridges','snow','사슬 감옥의 빙교'],
  [30,20,'west','harbor','fortress','성벽 아래 수로'],
  [24,24,'southeast','citadel','citadel','심연의 제단'],
  [20,22,'north','grove','snow','눈 덮인 천수 묘역'],
  [28,18,'east','ridge','snow','얼어붙은 왕도 외곽'],
  [22,26,'southwest','islands','snow','얼음섬에 남은 서가'],
  [26,20,'west','ruins','fortress','기도실의 무너진 안뜰'],
  [20,24,'south','gorge','snow','황혼 다리 앞 협곡'],
  [30,24,'northeast','gates','citadel','흑야의 심장 관문'],
  [24,20,'east','crossroads','citadel','환영 계단의 분기점'],
  [20,22,'northwest','grove','forest','붉은 수정의 성소'],
  [32,20,'west','bridges','citadel','천공 관문의 검은 교량'],
  [24,28,'north','harbor','fortress','폐성의 수문'],
  [22,22,'southeast','islands','citadel','파멸의 평원 파편'],
  [30,28,'southwest','citadel','citadel','최후의 왕좌'],
  [26,20,'east','harbor','coast','귀환 해안의 방파제'],
  [24,24,'west','bridges','coast','물길의 두 석교'],
  [30,22,'south','bridges','coast','포자 수문의 좌우 접근로'],
  [28,24,'northeast','ruins','coast','침수 창고의 귀환로'],
  [30,26,'north','citadel','coast','심해 수문의 원형 안뜰'],
  [24,22,'northwest','ridge','snow','고원 입구의 눈다짐 능선'],
  [22,28,'south','grove','snow','바람 골짜기의 온천 쉼터'],
  [30,24,'east','ridge','snow','따뜻한 돌을 잇는 설원길'],
  [28,26,'southwest','gorge','snow','흰 능선의 두 귀환길'],
  [26,28,'north','citadel','snow','빙정 치유샘의 제단'],
  [28,22,'west','gates','workshop','공명 공방의 입구'],
  [26,24,'southeast','ruins','workshop','종이 울리는 조립실'],
  [32,24,'south','crossroads','workshop','접힌 기록실의 공명로'],
  [30,28,'east','ruins','workshop','이름 없는 세 작업로'],
  [28,28,'northeast','citadel','workshop','공명 집행관의 제어실'],
  [24,26,'west','grove','starlight','별빛이 남은 숲 회랑'],
  [28,24,'southwest','islands','starlight','뿌리의 언어를 읽는 제단'],
  [30,26,'north','crossroads','starlight','빈 갑옷의 세 회랑'],
  [32,28,'southeast','bridges','starlight','모든 이름을 잇는 다리'],
  [32,30,'south','citadel','starlight','첫 맹세의 원형 제단'],
];
export const BATTLEFIELD_PLANS = rows.map(([width,height,direction,layout,biome,name], index) =>
  Object.freeze({ id: index + 1, width, height, direction, layout, biome, name }));
export function getBattlefieldPlan(id = 1) {
  return BATTLEFIELD_PLANS[Math.max(0, Math.min(BATTLEFIELD_PLANS.length - 1, Math.floor(Number(id) || 1) - 1))];
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
