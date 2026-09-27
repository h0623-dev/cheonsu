import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { BATTLEFIELD_PLANS } from '../src/data/battlefieldPlans.js';

const url=process.env.GAME_URL || 'http://127.0.0.1:5176';
const browser=await chromium.launch({channel:'msedge',headless:true});
await fs.mkdir('tmp/sound-map-qa',{recursive:true});
const results=[];
try {
  for(const width of [1280,390,320]) {
    const page=await browser.newPage({viewport:{width,height:width===320?568:900},serviceWorkers:'block'});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400 && r.url().includes('/art/'))errors.push(`${r.status()} ${r.url()}`);});
    await page.addInitScript(()=>{
      localStorage.setItem('cheonsu_auto_patch','false');
      localStorage.setItem('cheonsu_settings_v1',JSON.stringify({soundOn:false,musicOn:false,cutsceneMode:'off',effectsOn:true,battleSpeed:'fast'}));
    });
    await page.goto(url);
    await page.getByRole('button',{name:'새 게임',exact:true}).click();
    await page.locator('.campaign-header .prominent-save').click();
    const campaign=await page.evaluate(()=>{
      const data=JSON.parse(localStorage.getItem('cheonsu_v01_save'));
      data.clearedStages=Array.from({length:29},(_,i)=>i+1);
      return data;
    });
    const plans=width===1280?BATTLEFIELD_PLANS:BATTLEFIELD_PLANS.filter(p=>[1,2,5,6,11,18,30].includes(p.id));
    for(const plan of plans) {
      await page.evaluate(data=>localStorage.setItem('cheonsu_v01_save',JSON.stringify(data)),campaign);
      await page.reload();
      await page.getByRole('button',{name:'이어하기',exact:true}).click();
      await page.locator('.campaign-stage-select button').filter({has:page.locator('strong').filter({hasText:new RegExp(`^${plan.id}장\\.`)})}).click();
      await page.getByRole('button',{name:'전투 시작',exact:true}).click();
      await page.getByRole('button',{name:'바로 전투',exact:true}).click();
      await page.locator('.world-battlefield').waitFor();
      assert.ok(await page.getByRole('button',{name:'정보 표시',exact:true}).isVisible());
      assert.equal(await page.locator('.battle-zoom-controls').count(),0);
      await page.locator('.cinematic-command-bar .prominent-save').click();
      const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('cheonsu_v01_save')));
      assert.equal(saved.selectedStage.id,plan.id);
      assert.equal(saved.selectedStage.terrainRevision,3);
      assert.equal(saved.selectedStage.map.length,plan.height);
      assert.equal(saved.selectedStage.map[0].length,plan.width);
      assert.equal(await page.locator('.world-battlefield .world-ground').count(),plan.width*plan.height);
      await page.waitForFunction(()=>[...document.querySelectorAll('.world-battlefield img')].every(img=>img.complete&&img.naturalWidth>0));
      await page.waitForTimeout(300);
      const layout=await page.evaluate(()=>{
        const shell=document.querySelector('.battle-map-scroll-shell'), hero=document.querySelector('.unit-visual-hero');
        const h=hero.getBoundingClientRect(),s=shell.getBoundingClientRect();
        return {overflow:document.documentElement.scrollWidth>innerWidth+1,heroVisible:h.right>s.left&&h.left<s.right&&h.bottom>s.top&&h.top<s.bottom,scrollWidth:shell.scrollWidth,scrollHeight:shell.scrollHeight};
      });
      assert.equal(layout.overflow,false);
      assert.equal(layout.heroVisible,true,`Chapter ${plan.id} camera reaches ${plan.direction} ally deployment`);
      if(width!==1280 || [1,2,5,6,11,18,30].includes(plan.id)) await page.screenshot({path:`tmp/sound-map-qa/stage-${plan.id}-${width}.png`});
      // Exercise both axes, including the opposite corner, without moving units.
      await page.locator('.battle-map-scroll-shell').evaluate(el=>{el.scrollLeft=el.scrollWidth;el.scrollTop=0;});
      await page.locator('.cinematic-command-bar .prominent-save').click();
      assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('cheonsu_v01_save')).units),saved.units);
      results.push({id:plan.id,width,map:`${plan.width}x${plan.height}`,direction:plan.direction,...layout});
      console.log(`PASS chapter ${plan.id} at ${width}: ${plan.width}x${plan.height}, ${plan.direction}, hidden HUD, artwork, camera, save`);
    }
    assert.deepEqual(errors,[]);
    await page.close();
  }
  await fs.writeFile('tmp/sound-map-qa/maps.json',JSON.stringify(results,null,2));
} finally {await browser.close();}
