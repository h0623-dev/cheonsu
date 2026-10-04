import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { bossCombatIds, getBossSplash, getBossSpriteKey } from '../src/data/bossArt.js';
import { stages } from '../src/data/stages.js';
import { getCharacterArt } from '../src/data/characterArt.js';

test('every campaign boss receives the correct entrance illustration without mutating saved units',()=>{
  for(const stage of stages) for(const boss of stage.units.filter(u=>u.type==='boss')) {
    const before=JSON.stringify(boss),art=getBossSplash(boss);
    assert.equal(art.key,getBossSpriteKey(boss));
    assert.ok(bossCombatIds.includes(art.key));
    assert.equal(art.src, getCharacterArt(art.key)?.splash || getCharacterArt(art.key)?.dialogue || `/art/enemy-illustrations-v1/${art.key}.webp`);
    assert.equal(JSON.stringify(boss),before);
  }
  assert.equal(getBossSplash({type:'boss',name:'도적장'}).key,'boss_commander');
  assert.equal(getBossSplash({type:'boss',name:'빙결 마도사'}).key,'boss_frost');
  assert.equal(getBossSplash({type:'boss',name:'화염 군주'}).key,'boss_ember');
  assert.equal(getBossSplash({type:'boss',name:'마녀'}).key,'boss_oracle');
  assert.equal(getBossSplash({type:'boss',name:'가론'}).key,'boss_abyss');
});
for(const key of bossCombatIds) test(`${key}: high-resolution original and compact runtime image exist`,async()=>{
  const source=await readFile(new URL(`../docs/art/enemy-illustrations-v1/${key}.png`,import.meta.url));
  const asset=await readFile(new URL(`../public/art/enemy-illustrations-v1/${key}.webp`,import.meta.url));
  const original=await sharp(source).metadata(),runtime=await sharp(asset).metadata();
  assert.equal(runtime.width,1024);assert.equal(runtime.height,1536);
  assert.equal(original.width,runtime.width);assert.equal(original.height,runtime.height);
  assert.ok(asset.length<650000);
  const stats=await sharp(asset).stats();
  assert.ok(stats.channels.slice(0,3).every(c=>c.stdev>20),'artwork is nonblank');
});
