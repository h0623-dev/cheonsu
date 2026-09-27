import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { UNIT_DIRECTIONS, directionTo, getUnitFacing, getFacingArt, withSavedFacings } from '../src/engine/unitFacing.js';
import { combatUnitIds, getCombatTiming, getCombatPresentation } from '../src/data/combatArt.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { stages } from '../src/data/stages.js';

test('eight directions use actual displacement, including vertical-dominant diagonals and zero movement', () => {
  const points = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  points.forEach(([x,y], i) => assert.equal(directionTo({ x: 5, y: 5 }, { x: 5 + x, y: 5 + y }), UNIT_DIRECTIONS[i]));
  assert.equal(directionTo({x:0,y:0},{x:1,y:-8}), 'up');
  assert.equal(directionTo({x:0,y:0},{x:0,y:0},'left'), 'left');
  assert.equal(directionTo({}, null, 'bad'), 'down');
});
test('idle uses saved heading, old saves face nearest opponent, bosses and enemies are one side', () => {
  const units = [{id:'hero',type:'ally',hp:24,x:3,y:4},{id:'enemy',type:'enemy',hp:20,x:3,y:1},{id:'boss',type:'boss',hp:30,x:4,y:1}];
  assert.equal(getUnitFacing(units[0],units),'up');
  assert.equal(getUnitFacing(units[1],units),'down');
  assert.equal(getUnitFacing({...units[0],facing:'down-left'},units),'down-left');
  assert.equal(getUnitFacing({...units[0],facing:'invalid'},units,{hero:'right'}),'right');
  assert.deepEqual(getFacingArt('up-left'),{rear:true,flip:-1});
  assert.deepEqual(getFacingArt('down-right'),{rear:false,flip:1});
});
test('orientation persists through save migration without changing positions, actions, health or growth', () => {
  const units = structuredClone(stages[0].units);
  const before = structuredClone(units);
  const saved = withSavedFacings(units,{hero:'up-left',bram:'left'});
  const normalized = normalizeSaveData({screen:'battle',selectedStage:stages[0],units:saved,party:saved.filter(unit=>unit.type==='ally'),clearedStages:[]});
  assert.equal(normalized.units.find(unit=>unit.id==='hero').facing,'up-left');
  assert.equal(normalized.units.find(unit=>unit.id==='bram').facing,'left');
  saved.forEach((unit,index)=>{ const {facing,...rest}=unit; assert.ok(UNIT_DIRECTIONS.includes(facing)); assert.deepEqual(rest,before[index]); });
  assert.deepEqual(units,before);
});
test('basic and skill timing differ, contact is synchronized and weapon identity stays intact', () => {
  const basic=getCombatTiming({mode:'attack'}), skill=getCombatTiming({mode:'skill'});
  assert.ok(skill.durationScale > basic.durationScale);
  assert.equal(skill.lead + skill.action * .5, skill.impact);
  assert.equal(basic.impact,.5);
  assert.equal(skill.impact,.62);
  assert.equal(getCombatTiming({outcome:{heal:true}}).skill,true);
  assert.equal(getCombatTiming({mode:'counter'}).skill,false);
  for(const key of combatUnitIds) assert.equal(getCombatPresentation(key,{mode:'attack'}).style,getCombatPresentation(key,{mode:'skill',effectType:'fire'}).style);
});
test('all 41 generated rear views have transparent margins, consistent feet and production paths', async () => {
  const manifest=JSON.parse(await fs.readFile('public/art/directions-v1/manifest.json','utf8'));
  assert.deepEqual(Object.keys(manifest).sort(),combatUnitIds.slice().sort());
  let bytes=0;
  for(const key of combatUnitIds){
    const entry=manifest[key], file=`public${entry.rear}`;
    bytes+=(await fs.stat(file)).size;
    const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let top=info.height,bottom=0,left=info.width,right=0,transparent=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const alpha=data[(y*info.width+x)*4+3];transparent+=alpha===0;
      if(alpha>128){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
    }
    assert.ok(Math.abs(bottom-447)<=2,`${key}: feet ${bottom}`);
    assert.ok(Math.abs(bottom-top+1-entry.visibleHeight)<=3,`${key}: height`);
    assert.ok(left>=5&&right<info.width-5&&top>=30,`${key}: unclipped`);
    assert.ok(transparent/(info.width*info.height)>.3,`${key}: transparent background`);
  }
  assert.ok(bytes<2500000,`rear sprite budget ${bytes}`);
});
