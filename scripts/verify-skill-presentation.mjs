import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';

const base = process.env.GAME_URL || 'http://127.0.0.1:5176';
const out = 'tmp/skill-presentation-qa';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const viewport of [{width:1280,height:900}, {width:390,height:844}, {width:320,height:568}, {width:844,height:390}, {width:568,height:320}]) {
    const page = await browser.newPage({ viewport });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**', () => {});
    const time = new Date('2026-09-27T00:00:00Z');
    await page.clock.install({time}); await page.clock.pauseAt(time);
    await page.route('**/tests/fixtures/combat.jsx*', async route => {
      const response = await route.fetch(); const source = await response.text();
      const index = source.indexOf('createRoot(document.getElementById('); assert.ok(index > 0);
      await route.fulfill({response, body: source.slice(0,index) + `
        import ReactDOM from '/node_modules/.vite/deps/react-dom.js';
        const root = createRoot(document.getElementById('root'));
        window.renderSkillFixture = props => ReactDOM.flushSync(() => root.render(React.createElement(CombatScene, props)));
      `});
    });
    await page.goto(`${base}/tests/fixtures/combat.html`);
    let serial = 0;
    const render = async (mode, effectType, duration, extra = {}) => {
      await page.evaluate(props => window.renderSkillFixture(props), {
        background:'/art/chapters-v1/chapter-01.webp', attackerKey:'hero', defenderKey:'blackguard',
        scene:{id:`skill-${++serial}`,durationMs:duration, mode,effectType,title:mode==='skill'?'천공검':'일반 공격',effectLabel:'검술',
          attacker:{id:'hero',name:'카일',type:'ally',hp:42,maxHp:50,skill:'천공검'},
          defender:{id:'blackguard',name:'국경 방패병',type:'enemy',hp:30,maxHp:50},
          attackerPostHp:42,defenderPostHp:18,outcome:{hit:true,damage:12}}, ...extra,
      });
      await page.locator('.painted-combat img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    };
    const seek = fraction => page.evaluate(time => document.getAnimations().forEach(animation => {animation.pause();animation.currentTime=time;}), fraction);
    for (const speed of [1,2,3]) {
      const duration=2000/speed;
      await render('attack','slash',duration); await seek(.12*duration);
      assert.equal(await page.locator('.skill-cut-in').count(),0);
      assert.equal(await page.locator('.combat-contact').count(),1);
      const basic=await page.locator('.painted-combat-arena').screenshot();
      await page.clock.runFor(.49*duration);
      assert.match(await page.locator('.combat-health').last().innerText(),/30 \/ 50/);
      await page.clock.runFor(.02*duration+1);
      assert.match(await page.locator('.combat-health').last().innerText(),/18 \/ 50/);
      for (const effect of ['slash','fire','ice','lightning','shadow','holy','poison','music','arrow']) {
        await render('skill',effect,duration); await seek(.12*duration);
        assert.equal(await page.locator('.combat-contact').count(),0);
        assert.equal(await page.locator('.skill-cut-in').evaluate(el=>+getComputedStyle(el).opacity),1);
        assert.equal(await page.locator('.skill-cut-in strong').innerText(),'천공검');
        const fits=await page.locator('.skill-cut-in strong').evaluate(el=>{const a=el.getBoundingClientRect();const b=el.closest('.skill-cut-in').getBoundingClientRect();return a.right<=b.right && a.bottom<=b.bottom;});
        assert.ok(fits,'skill name fits banner');
        if(effect==='slash' && speed===2){
          const skill=await page.locator('.painted-combat-arena').screenshot();
          const a=await sharp(basic).raw().toBuffer(),b=await sharp(skill).raw().toBuffer();
          let changed=0;for(let i=0;i<a.length;i++) if(Math.abs(a[i]-b[i])>20)changed++;
          assert.ok(changed>a.length*.2,'skill and basic preparation are visually distinct');
          await page.screenshot({path:`${out}/cut-in-${viewport.width}.png`});
        }
        await page.clock.runFor(.61*duration);assert.match(await page.locator('.combat-health').last().innerText(),/30 \/ 50/);
        await page.clock.runFor(.02*duration+1);assert.match(await page.locator('.combat-health').last().innerText(),/18 \/ 50/);
        await seek(.64*duration);
        assert.ok(await page.locator('.skill-element-burst').evaluate(el=>+getComputedStyle(el).opacity)>.8);
        if(speed===2 && ['fire','ice','lightning'].includes(effect))await page.screenshot({path:`${out}/${effect}-${viewport.width}.png`});
      }
    }
    await render('skill','fire',1000,{shakeEnabled:false});
    assert.equal(await page.locator('.painted-combat-arena').evaluate(el=>getComputedStyle(el).animationName),'none');
    for(const reduced of [false,true]){
      await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
      await render('skill','fire',1000,{effectsEnabled:reduced});
      assert.equal(await page.locator('.skill-cut-in').evaluate(el=>getComputedStyle(el).display),'none');
      assert.equal(await page.locator('.painted-combat-arena').evaluate(el=>getComputedStyle(el).animationName),'none');
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS skill presentation ${viewport.width}x${viewport.height}: basic vs skill, 9 elements, 3 speeds, HP timing, shake/effects/reduced-motion`);
    await page.close();
  }
} finally {await browser.close();}
