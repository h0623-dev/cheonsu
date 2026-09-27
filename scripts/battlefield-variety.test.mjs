import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLEFIELD_PLANS, deploymentDepth } from '../src/data/battlefieldPlans.js';
import { createBattlefieldTerrain } from '../src/data/stageTerrain.js';
import { distributeBattleFormations, getReinforcementApproaches } from '../src/engine/formations.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { getInitialParty } from '../src/engine/partyEngine.js';
import { MUSIC_TRACKS, MUSIC_LOOP_STEPS, getMusicTheme, musicBeat } from '../src/data/musicScore.js';
import { SFX_PRESETS } from '../src/engine/soundEffects.js';

test('30 chapter plans vary size, routes, biome and all eight deployment directions', () => {
  assert.equal(BATTLEFIELD_PLANS.length, 30);
  assert.equal(new Set(BATTLEFIELD_PLANS.map(p => p.direction)).size, 8);
  assert.equal(new Set(BATTLEFIELD_PLANS.map(p => p.layout)).size, 10);
  assert.ok(new Set(BATTLEFIELD_PLANS.map(p => `${p.width}x${p.height}`)).size >= 20);
  for (const shape of ['wide', 'tall', 'square']) assert.ok(BATTLEFIELD_PLANS.some(p =>
    shape === 'wide' ? p.width > p.height : shape === 'tall' ? p.height > p.width : p.height === p.width));
  assert.equal(new Set(BATTLEFIELD_PLANS.map(p => JSON.stringify(createBattlefieldTerrain(p.id)))).size, 30);
});

for (const plan of BATTLEFIELD_PLANS) test(`Chapter ${plan.id}: actual-sized terrain is connected; both armies follow ${plan.direction} deployment`, () => {
  const map = createBattlefieldTerrain(plan.id);
  assert.deepEqual(map, createBattlefieldTerrain(plan.id));
  assert.equal(map.length, plan.height);
  assert.ok(map.every(row => row.length === plan.width));
  const cells = map.flatMap((row,y) => row.flatMap((type,x) => type === 'block' ? [] : [{x,y}]));
  const visited = new Set(), queue = [cells[0]];
  for (let i=0;i<queue.length;i++) {
    const {x,y} = queue[i], key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if (map[y+dy]?.[x+dx] && map[y+dy][x+dx] !== 'block' && !visited.has(`${x+dx},${y+dy}`)) queue.push({x:x+dx,y:y+dy});
    }
  }
  assert.equal(visited.size, cells.length);
  const approaches=getReinforcementApproaches(plan,map);
  assert.ok(approaches.length>3);
  for(const cell of approaches) {
    assert.ok(visited.has(`${cell.x},${cell.y}`));
    assert.ok(deploymentDepth(cell.x/(plan.width-1),cell.y/(plan.height-1),plan.direction)<=.4);
  }
  const units = distributeBattleFormations({id:plan.id,map,terrainRevision:3},[
    ...getInitialParty(), ...Array.from({length:10},(_,i)=>({id:`enemy-${i}`,type:i===0?'boss':'enemy',hp:20,range:1})),
  ]);
  for (const side of ['ally','enemy']) {
    const team = units.filter(u => (u.type==='ally') === (side==='ally'));
    const depth = team.reduce((sum,u)=>sum+deploymentDepth(u.x/(plan.width-1),u.y/(plan.height-1),plan.direction),0)/team.length;
    assert.ok(side==='ally' ? depth>.6 : depth<.4, `${side} centroid follows the planned direction: ${depth}`);
  }
});

test('legacy battle geometry, unit coordinates, actions and discovery progress survive normalization', () => {
  const party = getInitialParty();
  const map = Array.from({length:30},()=>Array(24).fill('road'));
  map[4][4]='block';
  const units = party.map((u,i)=>({...u,x:3+i*3,y:25-i,moved:true,acted:i===0}));
  const saved = {screen:'battle',selectedStage:{id:2,map,units,terrainRevision:2},party,units,round:4,turn:'ally',exploration:{claimed:['s1-sword-notes']}};
  const before = JSON.stringify(saved);
  const restored = normalizeSaveData(saved,'1.99.140');
  assert.deepEqual(restored.selectedStage.map, map);
  assert.equal(restored.selectedStage.terrainRevision, 2);
  assert.deepEqual(restored.units.map(({id,x,y,moved,acted})=>({id,x,y,moved,acted})),units.map(({id,x,y,moved,acted})=>({id,x,y,moved,acted})));
  assert.equal(restored.round,4);
  assert.deepEqual(restored.exploration.claimed,saved.exploration.claimed);
  assert.equal(JSON.stringify(saved),before);
});

test('nine original soundtracks have distinct four-section arrangements, valid notes and a repeatable loop', () => {
  assert.equal(Object.keys(MUSIC_TRACKS).length, 9);
  const scores = new Set();
  for (const id of Object.keys(MUSIC_TRACKS)) {
    const bars = Array.from({length:MUSIC_LOOP_STEPS},(_,i)=>musicBeat(id,i));
    assert.equal(new Set(bars.map(b=>b.section)).size,4);
    assert.notDeepEqual(bars.slice(0,64).map(b=>b.notes),bars.slice(128,192).map(b=>b.notes));
    assert.deepEqual(musicBeat(id,0),musicBeat(id,MUSIC_LOOP_STEPS));
    for (const frame of bars) for (const note of frame.notes) {
      assert.ok(Number.isFinite(note.freq) && note.freq>=20 && note.freq<12000);
      assert.ok(note.duration>0 && note.gain>0 && note.gain<.1);
    }
    scores.add(JSON.stringify(bars));
  }
  assert.equal(scores.size,9);
  assert.equal(getMusicTheme('camp').id,'camp');
  assert.equal(getMusicTheme('battle',30).id,'finale');
  for (const plan of BATTLEFIELD_PLANS) assert.ok(MUSIC_TRACKS[getMusicTheme('battle',plan.id).id]);
  for (const [effect,notes] of Object.entries(SFX_PRESETS)) {
    assert.ok(notes.length>0,effect);
    assert.ok(notes.every(note=>note.duration>0 && note.gain>0 && note.gain<.1));
  }
  assert.notDeepEqual(SFX_PRESETS.arrow,SFX_PRESETS.slash);
});
