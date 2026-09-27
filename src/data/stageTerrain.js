import { getBattlefieldPlan, orientBattlePoint } from './battlefieldPlans.js';

export const TERRAIN_LAYOUTS = ['갈림길', '협곡', '성문', '폐허', '능선', '쌍교', '숲 공터', '섬', '항구', '왕성'];
const ROUTES = {
  crossroads: [[[.5,.9],[.5,.1]], [[.16,.57],[.82,.57]], [[.25,.86],[.25,.3],[.72,.3],[.72,.12]]],
  gorge: [[[.3,.9],[.3,.73],[.7,.61],[.7,.43],[.3,.3],[.3,.1]], [[.7,.86],[.7,.72],[.3,.5],[.3,.3]]],
  gates: [[[.5,.9],[.5,.68],[.22,.68],[.22,.3],[.5,.3],[.5,.1]], [[.5,.68],[.78,.68],[.78,.3],[.5,.3]]],
  ruins: [[[.25,.9],[.25,.1]], [[.75,.9],[.75,.1]], [[.25,.35],[.75,.35]], [[.25,.66],[.75,.66]], [[.5,.66],[.5,.35]]],
  ridge: [[[.24,.9],[.24,.7],[.65,.7],[.65,.48],[.32,.48],[.32,.26],[.65,.26],[.65,.1]], [[.78,.85],[.78,.26],[.65,.26]]],
  bridges: [[[.25,.9],[.25,.1]], [[.75,.9],[.75,.1]], [[.25,.25],[.75,.25]], [[.25,.75],[.75,.75]]],
  grove: [[[.5,.9],[.23,.7],[.2,.36],[.5,.1]], [[.5,.9],[.8,.66],[.8,.32],[.5,.1]], [[.2,.5],[.8,.5]]],
  islands: [[[.5,.9],[.2,.7],[.5,.5],[.78,.3],[.5,.1]], [[.2,.7],[.8,.7],[.78,.3]], [[.5,.5],[.22,.28],[.5,.1]]],
  harbor: [[[.25,.9],[.25,.1]], [[.25,.75],[.78,.75]], [[.25,.5],[.82,.5]], [[.25,.25],[.78,.25]], [[.78,.25],[.78,.75]]],
  citadel: [[[.5,.9],[.5,.1]], [[.5,.75],[.2,.6],[.2,.3],[.5,.18],[.8,.3],[.8,.6],[.5,.75]], [[.2,.46],[.8,.46]]],
};

export function createBattlefieldTerrain(stageId) {
  const { width, height } = getBattlefieldPlan(stageId);
  return createStageTerrain(Array.from({ length: height }, () => Array(width)), stageId);
}

export function createStageTerrain(source, stageId) {
  const height = source.length, width = source[0]?.length || 0;
  if (!width) return source;
  const plan = getBattlefieldPlan(stageId);
  const map = Array.from({ length: height }, () => Array(width).fill('block'));
  const point = (u, v) => {
    const [x,y] = orientBattlePoint(u,v,plan.direction);
    return [Math.round(x*(width-1)), Math.round(y*(height-1))];
  };
  const paint = (cx,cy,rx,ry,tile,onlyGround=false) => {
    for (let y=Math.max(1,cy-ry); y<=Math.min(height-2,cy+ry); y++)
      for (let x=Math.max(1,cx-rx); x<=Math.min(width-2,cx+rx); x++)
        if (!onlyGround || map[y][x] !== 'block') map[y][x]=tile;
  };
  const patch = (u,v,rx,ry,tile,onlyGround=false) => paint(...point(u,v),rx,ry,tile,onlyGround);
  const route = (points, tile='road', radius=1) => {
    for (let i=1; i<points.length; i++) {
      const [ax,ay]=point(...points[i-1]), [bx,by]=point(...points[i]);
      const steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
      for(let t=0;t<=steps;t++) paint(Math.round(ax+(bx-ax)*t/Math.max(1,steps)),Math.round(ay+(by-ay)*t/Math.max(1,steps)),radius,radius,tile);
    }
  };
  // Every open region joins the route graph. Deployment rooms have lateral depth too.
  for (const v of [.14,.86]) {
    for (let u=.16;u<=.85;u+=.06) patch(u,v,2,2,'plain');
  }
  for (const path of ROUTES[plan.layout]) route(path);
  for (const v of [.14,.86]) route([[.16,v],[.84,v]],'plain');
  const shoulder = plan.biome==='snow' ? 'ice' : plan.biome==='citadel' ? 'dark' : plan.biome==='fortress' ? 'hill' : 'forest';
  const edge = [];
  for(let y=1;y<height-1;y++) for(let x=1;x<width-1;x++) if(map[y][x]==='block' &&
    [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>map[y+dy]?.[x+dx]==='road')) edge.push([x,y]);
  for (const [x,y] of edge) map[y][x]=shoulder;

  if (['bridges','harbor','islands'].includes(plan.layout)) {
    if (plan.layout==='bridges') {
      route([[.1,.48],[.9,.48]],plan.biome==='snow'?'ice':'water',1);
      for (const u of [.25,.75]) route([[u,.38],[u,.58]],'road',0);
    } else if (plan.layout==='harbor') {
      patch(.54,.38,Math.max(1,Math.floor(width*.07)),Math.max(1,Math.floor(height*.09)),'water',true);
      patch(.54,.64,Math.max(1,Math.floor(width*.07)),Math.max(1,Math.floor(height*.07)),'water',true);
      route([[.25,.5],[.82,.5]]);
    } else {
      for (const [u,v] of [[.2,.7],[.5,.5],[.78,.3],[.22,.28]]) patch(u,v,2,2,'fort',true);
    }
  }
  if (plan.layout==='ridge') for (const [u,v] of [[.24,.7],[.65,.48],[.32,.26]]) patch(u,v,1,1,'hill',true);
  if (plan.layout==='grove') patch(.5,.5,2,2,plan.biome==='snow'?'ice':'swamp',true);
  if (plan.layout==='ruins') for (const u of [.25,.75]) patch(u,.35,1,1,stageId===4?'fire':'fort',true);
  if (plan.layout==='gates') for (const u of [.22,.78]) patch(u,.44,1,1,'fort',true);
  if (plan.layout==='citadel') { patch(.5,.46,2,2,'rune',true); patch(.5,.25,2,1,'fort',true); }
  patch(.5,.14,1,1,'fort',true);
  const [gx,gy]=point(.5,.14); if(map[gy]?.[gx] && map[gy][gx]!=='block') map[gy][gx]='gate';
  return map;
}
