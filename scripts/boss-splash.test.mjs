import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { bossCombatIds, legacyBossCombatIds, expansionBossCombatIds, getBossSplash, getBossSpriteKey } from '../src/data/bossArt.js';
import { stages } from '../src/data/stages.js';
import { getCharacterArt } from '../src/data/characterArt.js';
import { EXPANSION_ENEMY_ART_KEYS } from '../src/data/expansionArtRegistry.js';

test('every campaign boss receives the correct entrance illustration without mutating saved units',()=>{
  for(const stage of stages) for(const boss of stage.units.filter(u=>u.type==='boss')) {
    const before=JSON.stringify(boss),art=getBossSplash(boss);
    assert.equal(art.key,getBossSpriteKey(boss));
    assert.ok(bossCombatIds.includes(art.key) || EXPANSION_ENEMY_ART_KEYS.includes(art.key));
    assert.equal(art.src, getCharacterArt(art.key)?.splash || getCharacterArt(art.key)?.dialogue || `/art/enemy-illustrations-v1/${art.key}.webp`);
    assert.equal(JSON.stringify(boss),before);
  }
  assert.equal(getBossSplash({type:'boss',name:'도적장'}).key,'boss_commander');
  assert.equal(getBossSplash({type:'boss',name:'빙결 마도사'}).key,'boss_frost');
  assert.equal(getBossSplash({type:'boss',name:'화염 군주'}).key,'boss_ember');
  assert.equal(getBossSplash({type:'boss',name:'마녀'}).key,'boss_oracle');
  assert.equal(getBossSplash({type:'boss',name:'가론'}).key,'boss_abyss');
});
for(const key of legacyBossCombatIds) test(`${key}: high-resolution original and compact runtime image exist`,async()=>{
  const source=await readFile(new URL(`../docs/art/enemy-illustrations-v1/${key}.png`,import.meta.url));
  const asset=await readFile(new URL(`../public/art/enemy-illustrations-v1/${key}.webp`,import.meta.url));
  const original=await sharp(source).metadata(),runtime=await sharp(asset).metadata();
  assert.equal(runtime.width,1024);assert.equal(runtime.height,1536);
  assert.equal(original.width,runtime.width);assert.equal(original.height,runtime.height);
  assert.ok(asset.length<650000);
  const stats=await sharp(asset).stats();
  assert.ok(stats.channels.slice(0,3).every(c=>c.stdev>20),'artwork is nonblank');
});

test('four expansion leaders preserve their explicit art across identity fields and legacy-looking names', () => {
  const names = ['심해 수문장 모르칸', '빙정 여왕 세르카', '공명 집행관 아르켄', '첫 맹세 수호체 아스테르'];
  for (const [index, key] of expansionBossCombatIds.entries()) {
    for (const field of ['artId', 'spriteKey', 'id']) {
      const boss = { id: 'boss', type: 'boss', name: names[index], skill: '얼음·공허 판결', [field]: key, hp: 19, maxHp: 40 };
      const before = structuredClone(boss);
      assert.equal(getBossSpriteKey(boss), key, `${key}: ${field} wins over old name heuristics`);
      const splash = getBossSplash(boss), character = getCharacterArt(key);
      assert.equal(splash.key, key);
      assert.ok(splash.accent && /^#[a-f0-9]{6}$/i.test(splash.accent));
      assert.equal(splash.src, character?.splash || character?.dialogue || character?.motion?.recover || character?.portrait || `/art/enemy-illustrations-v1/${key}.webp`);
      if (character) assert.match(splash.src, new RegExp(`/art/characters-v3/(dialogue|units|portraits)/${key}`));
      assert.deepEqual(boss, before, 'saved stats and identities stay unchanged');
    }
    assert.equal(getBossSpriteKey({ type: 'enemy', artId: key }), null, 'ordinary enemies remain ordinary');
  }
  assert.equal(getBossSpriteKey({ type: 'boss', artId: 'frost_queen', spriteKey: 'boss_abyss' }), 'frost_queen');
});

test('expansion species appointed as captains use their own body without entering the unique boss catalogue', () => {
  const ordinary = EXPANSION_ENEMY_ART_KEYS.filter(key => !expansionBossCombatIds.includes(key));
  assert.equal(ordinary.length, 12);
  assert.equal(bossCombatIds.length, 9);
  for (const key of ordinary) {
    for (const field of ['artId', 'spriteKey']) {
      const boss = { id: 'boss', type: 'boss', name: '빙결 지휘관', spriteKey: 'boss_frost', [field]: key };
      const character = getCharacterArt(key), splash = getBossSplash(boss);
      assert.equal(splash.key, key);
      assert.equal(splash.src, character?.splash || character?.dialogue || character?.motion?.recover || character?.portrait || `/art/enemy-illustrations-v1/${key}.webp`);
      assert.ok(!bossCombatIds.includes(key));
      assert.equal(getBossSpriteKey({ ...boss, type: 'enemy' }), null);
    }
  }
});
