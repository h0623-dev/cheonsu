import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { createBattleAsyncLifecycle } from '../src/engine/battleAsyncLifecycle.js';

function timers() {
  const jobs = [];
  return { jobs, schedule: (callback, delay) => { const job = { callback, delay, cancelled: false }; jobs.push(job); return job; }, unschedule: job => { if (job) job.cancelled = true; } };
}
test('전투 이탈은 모든 이동·대기 promise를 false로 해제하고 늦은 타이머를 무시한다', async () => {
  const fake = timers(), life = createBattleAsyncLifecycle(fake), epoch = life.capture();
  const waits = [life.wait(100), life.wait(300), life.wait(500)];
  life.cancelAll();
  for (const job of fake.jobs) { assert.equal(job.cancelled, true); job.callback(); }
  assert.deepEqual(await Promise.all(waits), [false, false, false]);
  assert.equal(life.current(epoch), false);
  assert.equal(await life.wait(0, epoch), false);
  assert.equal(life.pendingCount(), 0);
});
test('이전 전투 취소가 새 전투의 대기와 후처리에 영향을 주지 않는다', async () => {
  const fake = timers(), life = createBattleAsyncLifecycle(fake);
  const old = life.wait(100);
  life.cancelAll();
  const fresh = life.wait(150);
  fake.jobs[0].callback();
  assert.equal(life.pendingCount(), 1);
  fake.jobs[1].callback();
  assert.equal(await old, false);
  assert.equal(await fresh, true);
  assert.equal(life.pendingCount(), 0);
});
test('이동의 두 paint 프레임과 fallback 타이머도 이탈하면 정리한다', async () => {
  const fake = timers(), frames = [], cancelled = [], life = createBattleAsyncLifecycle(fake);
  const paint = life.paint(life.capture(), callback => { frames.push(callback); return frames.length; }, frame => cancelled.push(frame));
  frames[0]();
  life.cancelAll();
  frames[1](); fake.jobs[0].callback();
  assert.equal(await paint, false);
  assert.ok(cancelled.includes(2));
  assert.equal(life.pendingCount(), 0);
});

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const tree = parse(appSource, {ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}});
let cutscene;
function find(node) {
  if (!node || typeof node !== 'object' || cutscene) return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'showCombatCutscene') { cutscene = appSource.slice(node.init.start,node.init.end); return; }
  for (const value of Object.values(node)) if (value && typeof value === 'object') for (const child of Array.isArray(value) ? value : [value]) find(child);
}
find(tree); assert.ok(cutscene);
function harness(off = false) {
  const fake = timers(), lifecycle = createBattleAsyncLifecycle(fake), scenes = [], preloadKeys = [], calls = [];
  const context = { battleAsyncRef:{current:lifecycle}, settings:{cutsceneMode:off?'off':'full',effectsOn:true},
    getGameCharacterArtKey:unit=>unit.advancedClass||unit.id,getEnemySpriteKey:unit=>unit.artId||unit.id,
    getEffectType:()=> 'slash',faceCombat:()=>{},playSfx:()=>{},triggerCombatVisual:()=>{},
    cutsceneConfig:{duration:1800},getCombatTiming:()=>({durationScale:1}),scaleBattleTime:duration=>duration,battleSpeedRef:{current:{}},
    preloadCombatArt:async(a,d)=>preloadKeys.push([a,d]),getUnitWeaponMotionKey:()=> 'sword',getCutsceneEffectLabel:()=>'',getCutsceneEffectIcon:()=>'',
    getCombatChoreography:()=>({cues:[]}),scheduleBattleVisual:()=>{},setCombatCutscene:scene=>scenes.push(scene),
    window:{setTimeout:fake.schedule,clearTimeout:fake.unschedule} };
  const show = runInNewContext(`(${cutscene})`,context);
  const battle = {attacker:{id:'hero',advancedClass:'hero__form0',type:'ally',hp:50,maxHp:50},defender:{id:'enemy-31',artId:'crab_guard',type:'enemy',hp:20,maxHp:20},mode:'attack'};
  return { fake,lifecycle,scenes,preloadKeys,calls,show,battle,context };
}
test('실제 App 장면은 접촉 콜백을 한 번만 호출하고 완료 true를 반환한다', async () => {
  const h = harness(), playing = h.show(h.battle,{hit:true,damage:8},()=>h.calls.push('hit'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.preloadKeys,[['hero__form0','crab_guard']]);
  const scene = h.scenes.find(value=>typeof value === 'object'); assert.ok(scene);
  assert.deepEqual(h.calls,[]);
  scene.onImpact(); scene.onImpact();
  assert.deepEqual(h.calls,['hit']);
  scene.onComplete(); scene.onComplete();
  assert.equal(await playing,true);
  for (const job of h.fake.jobs) if (!job.cancelled) job.callback();
  assert.deepEqual(h.calls,['hit']);
  assert.equal(h.lifecycle.pendingCount(),0);
});
test('실제 App 장면은 이탈 후 접촉·완료 callback을 받아도 피해 없이 false를 반환한다', async () => {
  const h = harness(), playing = h.show(h.battle,{hit:true,damage:8},()=>h.calls.push('hit'));
  await new Promise(resolve => setImmediate(resolve));
  const scene = h.scenes.find(value=>typeof value === 'object'); assert.ok(scene);
  h.lifecycle.cancelAll();
  scene.onImpact(); scene.onComplete();
  assert.equal(await playing,false);
  assert.deepEqual(h.calls,[]);
  assert.equal(h.lifecycle.pendingCount(),0);
});
test('실제 App의 연출 끔에서도 행동은 한 번 적용하고 정상 완료한다', async () => {
  const h = harness(true);
  assert.equal(await h.show(h.battle,{hit:true,damage:8},()=>h.calls.push('hit')),true);
  assert.deepEqual(h.calls,['hit']);
  assert.deepEqual(h.scenes,[]);
});
test('실제 App의 preload 실패는 턴을 멈추지 않고 접촉 시점에 한 번 처리한다', async () => {
  const h = harness();
  h.context.preloadCombatArt = () => Promise.reject(new Error('decode failed'));
  const playing = h.show(h.battle,{hit:true,damage:8},()=>h.calls.push('hit'));
  await new Promise(resolve => setImmediate(resolve));
  const scene = h.scenes.find(value=>typeof value === 'object'); assert.ok(scene);
  scene.onImpact(); scene.onComplete();
  assert.equal(await playing,true);
  assert.deepEqual(h.calls,['hit']);
  assert.equal(h.lifecycle.pendingCount(),0);
});
test('실제 App의 접촉 처리에서 전투를 떠나면 완료 성공으로 덮어쓰지 않는다', async () => {
  const h = harness(), playing = h.show(h.battle,{hit:true,damage:8},()=>h.lifecycle.cancelAll());
  await new Promise(resolve => setImmediate(resolve));
  const scene = h.scenes.find(value=>typeof value === 'object'); assert.ok(scene);
  scene.onComplete();
  assert.equal(await playing,false);
  assert.equal(h.lifecycle.pendingCount(),0);
});
