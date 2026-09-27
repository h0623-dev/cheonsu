import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.GAME_URL || 'http://127.0.0.1:5176';
const browser=await chromium.launch({channel:'msedge',headless:true});
const out='tmp/boss-splash-qa';
await fs.mkdir(out,{recursive:true});
let count=0;
try {
  for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:568,height:320}]) {
    const page=await browser.newPage({viewport,serviceWorkers:'block'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/tests/fixtures/boss-splash.html`);
    for(const key of ['boss_commander','boss_frost','boss_ember','boss_oracle','boss_abyss']) for(const phase of [false,true]) {
      await page.evaluate(data=>window.renderBossSplash(data),{key,phase,name:key==='boss_abyss'?'심연의 군주 가론':'정예 지휘관'});
      await page.locator('.boss-splash-art').evaluate(img=>img.decode());
      await page.waitForTimeout(250);
      await page.evaluate(()=>document.getAnimations().forEach(animation=>animation.finish()));
      assert.equal(await page.locator('.boss-splash-art').evaluate(img=>img.naturalWidth),1024);
      assert.equal(await page.locator('.boss-splash-overlay').getAttribute('data-boss-art'),key);
      const issues=await page.evaluate(()=>{
        const errors=[];
        for(const el of document.querySelectorAll('.boss-splash,.boss-splash-caption,.boss-splash-heading,.boss-splash-stats')) {
          const r=el.getBoundingClientRect();
          if(r.left<0||r.top<0||r.right>innerWidth+.5||r.bottom>innerHeight+.5) errors.push(`${el.className}: outside screen`);
          if(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1) errors.push(`${el.className}: overflow`);
        }
        return errors;
      });
      assert.deepEqual(issues,[]);
      assert.match(await page.locator('.boss-splash-stats').innerText(),/300.*400/s);
      if(!phase) await page.screenshot({path:`${out}/${key}-${viewport.width}.png`});
      count++;
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.boss-splash-art').evaluate(img=>getComputedStyle(img).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>window.renderBossSplash({still:true}));
    assert.equal(await page.locator('.boss-splash-art').evaluate(img=>getComputedStyle(img).animationName),'none');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  const fallbackPage=await browser.newPage({serviceWorkers:'block'});
  await fallbackPage.route('**/boss-splash-v2/boss_commander.webp',route=>route.fulfill({status:404,body:''}));
  await fallbackPage.goto(`${base}/tests/fixtures/boss-splash.html`);
  await fallbackPage.waitForFunction(()=>document.querySelector('.boss-splash-art.is-fallback')?.naturalWidth>0);
  await fallbackPage.close();
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  await page.addInitScript(()=>localStorage.setItem('cheonsu_settings_v1',JSON.stringify({soundOn:false,musicOn:false,cutsceneMode:'off'})));
  await page.goto(process.env.ACTUAL_GAME_URL || base);
  await page.getByRole('button',{name:'새 게임',exact:true}).click();
  await page.locator('.campaign-stage-select button').filter({has:page.locator('strong').filter({hasText:/^1장\./})}).click();
  await page.getByRole('button',{name:'전투 시작',exact:true}).click();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.getByRole('button',{name:'바로 전투',exact:true}).click();
  await page.clock.runFor(1000);
  await page.locator('.boss-splash-art').evaluate(img=>img.decode());
  assert.equal(await page.locator('.boss-splash-overlay').count(),1);
  assert.equal(await page.locator('.boss-red-moon').count(),0);
  await page.evaluate(()=>document.getAnimations().filter(animation=>animation.effect?.target?.closest('.boss-splash-overlay')).forEach(animation=>animation.finish()));
  assert.equal(await page.locator('.boss-splash-overlay').evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.screenshot({path:`${out}/actual-game.png`});
  await page.clock.runFor(2500);
  assert.equal(await page.locator('.boss-splash-overlay').count(),0);
  await page.locator('.cinematic-command-bar .prominent-save').click();
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('cheonsu_v01_save')));
  assert.ok(save.units.some(u=>u.type==='boss'));
  assert.ok(save.units.filter(u=>u.type==='ally').every(u=>!u.acted));
  console.log(`PASS ${count} boss scenes, 5 responsive sizes, reduced motion, image fallback, real-game entrance, auto-dismiss and save preservation`);
} finally {await browser.close();}
