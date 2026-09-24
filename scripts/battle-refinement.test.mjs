import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createStageTerrain } from '../src/data/stageTerrain.js';
import { getBattleOutcome, spendAction } from '../src/engine/battleOutcome.js';
import { getBossSpriteKey, bossCombatIds } from '../src/data/bossArt.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { getInitialParty, grantExp } from '../src/engine/partyEngine.js';
import { stages } from '../src/data/stages.js';
import { getPaintedVisualProfile } from '../src/data/unitVisuals.js';
import { playTone, musicBeat } from '../src/engine/audioEngine.js';

const hero={id:'hero',type:'ally',hp:20}, boss={id:'boss',type:'boss',hp:20}, enemy={id:'guard',type:'enemy',hp:20};
test('boss death wins with living regular enemies; hero loss takes priority; no-boss stages require elimination',()=>{
  assert.equal(getBattleOutcome({units:[hero,boss,enemy]},[hero,enemy]),'victory');
  assert.equal(getBattleOutcome({units:[hero,boss,enemy]},[enemy]),'defeat');
  assert.equal(getBattleOutcome({units:[hero,boss]},[hero,boss]),null);
  assert.equal(getBattleOutcome({units:[hero,enemy]},[hero,enemy]),null);
  assert.equal(getBattleOutcome({units:[hero,enemy]},[hero]),'victory');
  assert.equal(getBattleOutcome({units:[hero,boss,{...boss,id:'boss2'}]},[hero,{...boss,id:'boss2'}]),null);
});
test('action flags survive XP growth, saving and defeated roster migration',()=>{
  const party=getInitialParty(), stage=stages[0];
  const units=spendAction(party,'hero');
  const grown=grantExp(units,'hero',150).units;
  assert.equal(grown.find(u=>u.id==='hero').acted,true);
  const restored=normalizeSaveData({screen:'battle',selectedStage:stage,party,units:grown},'1.99.132');
  assert.deepEqual(restored.units.map(u=>u.id).sort(),grown.map(u=>u.id).sort());
  assert.equal(restored.units.find(u=>u.id==='hero').acted,true);
  assert.equal(restored.units.find(u=>u.id==='hero').moved,true);
  assert.equal(normalizeSaveData({selectedStage:stage,party,units:[]}).units.length,0);
});
test('all five bosses have identities independent of regular enemy spriteKey',()=>{
  const hints=['warlord','frost_mage','pyromancer','cultist','void_knight'];
  for(let i=0;i<hints.length;i++) assert.equal(getBossSpriteKey({...boss,spriteKey:hints[i]}),bossCombatIds[i]);
  assert.equal(getBossSpriteKey(enemy),null);
});
test('all 30 new battlefields are connected with six genuinely different layouts in each act',()=>{
  for(let act=0;act<5;act++) {
    const hashes=new Set();
    for(let chapter=1;chapter<=6;chapter++) {
      const id=act*6+chapter, source=Array.from({length:30},()=>Array(24).fill('plain'));
      const map=createStageTerrain(source,id);
      hashes.add(JSON.stringify(map));
      assert.deepEqual(map,createStageTerrain(source,id));
      const cells=map.flatMap((row,y)=>row.flatMap((t,x)=>t==='block'?[]:[{x,y}]));
      const visited=new Set(),queue=[cells[0]];
      for(let i=0;i<queue.length;i++) {
        const {x,y}=queue[i],key=`${x},${y}`;
        if(visited.has(key)) continue;
        visited.add(key);
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if(map[y+dy]?.[x+dx] && map[y+dy][x+dx]!=='block' && !visited.has(`${x+dx},${y+dy}`)) queue.push({x:x+dx,y:y+dy});
      }
      assert.equal(visited.size,cells.length,`stage ${id} connectivity`);
      assert.ok(cells.length>170);
      assert.equal(source[0][0],'plain');
    }
    assert.equal(hashes.size,6);
  }
});
test('41 map sprites share visible height and foot anchor, with natural quadruped proportions',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/art/map-sprites-v4/manifest.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(manifest).length,41);
  for(const [id,entry] of Object.entries(manifest)) {
    const asset=getPaintedVisualProfile(id).map;
    const {data,info}=await sharp(new URL(`../public${asset}`,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let top=480,bottom=0;
    for(let p=0;p<info.width*info.height;p++) if(data[p*4+3]>64) {top=Math.min(top,Math.floor(p/info.width));bottom=Math.max(bottom,Math.floor(p/info.width));}
    assert.ok(Math.abs(bottom-447)<=2,`${id} feet`);
    assert.ok(Math.abs(bottom-top+1-entry.visibleHeight)<=3,`${id} height`);
  }
});
test('zero or invalid volume never creates a tone; music has a repeatable 32-beat phrase',()=>{
  for(const gain of [0,-1,NaN]) assert.equal(playTone({state:'running',createOscillator(){throw new Error('silent audio allocated');}}, {gain}),null);
  for(const theme of ['camp','world','battle']) {
    assert.deepEqual(musicBeat(theme,0),musicBeat(theme,32));
    assert.ok(musicBeat(theme,0).notes.length>=5);
  }
});
