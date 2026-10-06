import assert from 'node:assert/strict';
import { withSkill } from '../src/data/skills.js';
import { getCombatTiming } from '../src/data/combatArt.js';

export const viewports = [{width:1280,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:568,height:320}];
export async function openDuelFixture(browser, viewport, errors) {
  const page = await browser.newPage({viewport});
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if(response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.routeWebSocket('**', () => {});
  const time = new Date('2026-09-28T00:00:00Z');
  await page.clock.install({time});
  // Freeze the blank page ahead of install-time IPC latency, before mounting any scene.
  await page.clock.pauseAt(new Date(time.getTime() + 60_000));
  await page.route('**/tests/fixtures/combat.jsx*', async route => {
    const response = await route.fetch(), source = await response.text();
    const index = source.indexOf('createRoot(document.getElementById(');
    assert.ok(index > 0);
    await route.fulfill({response, body: source.slice(0,index) + `
      import ReactDOM from '/node_modules/.vite/deps/react-dom.js';
      const root = createRoot(document.getElementById('root'));
      window.renderDuelFixture = props => ReactDOM.flushSync(() => root.render(props ? React.createElement(CombatScene, props) : null));
    `});
  });
  await page.goto(`${process.env.GAME_URL || 'http://127.0.0.1:5176'}/tests/fixtures/combat.html`);
  return page;
}
let serial = 0;
export function duelProps(unit, skill, speed=1, extra={}) {
  const actor = {id:unit,name:unit,type:'ally',hp:42,maxHp:50,learnedTechniques:skill?[skill.id]:[]};
  const support=skill && skill.type!=='attack';
  const self=skill?.type==='guard';
  const scene={id:`duel-${++serial}`,mode:skill?'skill':'attack',title:skill?.name || '일반 공격',effectLabel:'전투',
    attacker:skill ? withSkill(actor,skill.id):actor,
    defender:self?actor:{id:support?'hero':'blackguard',name:support?'카일':'적 기사',type:support?'ally':'enemy',hp:30,maxHp:50},
    attackerPostHp:42,defenderPostHp:support?42:18,
    outcome:{hit:true,damage:12,heal:skill?.type==='heal',guard:self},...extra};
  scene.durationMs = 1820*getCombatTiming(scene).durationScale/speed;
  return {attackerKey:unit,defenderKey:self?unit:support?'hero':'blackguard',scene,
    background:'/art/chapters-v1/chapter-01.webp',effectsEnabled:true,shakeEnabled:true};
}
export async function renderDuel(page, props) {
  await page.evaluate(props=>window.renderDuelFixture(props), props);
  await page.locator('.painted-combat img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  // Let the initial ResizeObserver commit before manipulating its animation clock.
  await page.clock.runFor(20);
}
export async function seekDuel(page, fraction, duration) {
  await page.evaluate(time=>document.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=time;}),fraction*duration);
}
export async function assertBodies(page,label) {
  const counts=await page.locator('.painted-fighter').evaluateAll(actors=>actors.map(actor=>[...actor.querySelectorAll('.fighter-frame')].filter(image=>+getComputedStyle(image).opacity>.5).length));
  assert.ok(counts.every(count=>count===1),`${label}: exactly one anatomical pose per actor (${counts})`);
}
export async function assertFit(page,viewport,label) {
  const bounds=await page.locator('.painted-combat').boundingBox();
  assert.ok(bounds.x>=-1&&bounds.y>=-1&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1,`${label}: scene fits viewport`);
}
