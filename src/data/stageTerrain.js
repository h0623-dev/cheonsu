export const TERRAIN_LAYOUTS = ['갈림길', '쌍둑 여울', '굽이 고갯길', '숲속 우회로', '성문 회랑', '중앙 요새'];

// Routes are defined in normalized coordinates so formations remain valid at every board size.
const ROUTES = [
  [[[.35,.92],[.48,.64],[.35,.4],[.24,.08]], [[.48,.64],[.7,.38],[.76,.08]]],
  [[[.3,.92],[.3,.58],[.72,.43],[.72,.08]], [[.72,.92],[.72,.58],[.3,.43],[.3,.08]]],
  [[[.68,.92],[.68,.76],[.25,.65],[.25,.48],[.7,.35],[.7,.08]]],
  [[[.5,.92],[.23,.7],[.23,.32],[.5,.08]], [[.5,.92],[.78,.7],[.78,.32],[.5,.08]]],
  [[[.5,.92],[.5,.64],[.25,.64],[.25,.3],[.5,.3],[.5,.08]], [[.5,.64],[.76,.64],[.76,.3],[.5,.3]]],
  [[[.5,.92],[.5,.08]], [[.2,.66],[.8,.66],[.8,.28],[.2,.28],[.2,.66]]],
];

export function createStageTerrain(source, stageId) {
  const height = source.length, width = source[0]?.length || 0;
  if (!width) return source;
  const layout = (stageId - 1) % 6, act = Math.floor((stageId - 1) / 6);
  const map = Array.from({ length: height }, () => Array(width).fill('block'));
  const point = ([u,v]) => [Math.round((act % 2 ? 1-u : u) * (width-1)), Math.round(v*(height-1))];
  const paint = (cx,cy,rx,ry,tile) => {
    for (let y=Math.max(1,cy-ry); y<=Math.min(height-2,cy+ry); y++)
      for (let x=Math.max(1,cx-rx); x<=Math.min(width-2,cx+rx); x++) map[y][x]=tile;
  };
  for (const route of ROUTES[layout]) {
    for (let index=1; index<route.length; index++) {
      const [ax,ay]=point(route[index-1]), [bx,by]=point(route[index]);
      const steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
      for (let t=0;t<=steps;t++) paint(Math.round(ax+(bx-ax)*t/Math.max(1,steps)),Math.round(ay+(by-ay)*t/Math.max(1,steps)),1,1,'road');
    }
  }
  // Both deployment zones connect to every branch; no isolated spawn pockets.
  paint(Math.floor(width/2),Math.round(height*.86),Math.floor(width*.3),2,'plain');
  paint(Math.floor(width/2),Math.round(height*.13),Math.floor(width*.3),2,'plain');
  for (let y=1;y<height-1;y++) for(let x=1;x<width-1;x++) {
    if(map[y][x] !== 'block') continue;
    if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>map[y+dy]?.[x+dx]==='road'))
      map[y][x] = act===3 ? 'ice' : act===4 ? 'dark' : 'forest';
  }
  if(layout===1) {
    const row=Math.floor(height*.5);
    for(let x=1;x<width-1;x++) if(map[row][x]!=='block') map[row][x]='water';
    for(const u of [.4,.6]) paint(...point([u,.5]),1,0,'road');
  }
  const [gx,gy]=point([.5,.13]);
  paint(gx,gy,1,0,'fort');
  map[gy][gx]='gate';
  if(layout===5) paint(...point([.5,.47]),2,2,'fort');
  return map;
}
