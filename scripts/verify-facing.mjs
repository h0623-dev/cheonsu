import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base=process.env.GAME_URL || 'http://127.0.0.1:5176';
const out='tmp/facing-qa';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
    const page=await browser.newPage({viewport,serviceWorkers:'block'});
    await page.routeWebSocket('**',()=>{});
    await page.addInitScript(()=>{
      localStorage.setItem('cheonsu_auto_patch','false');
      if(!localStorage.getItem('cheonsu_settings_v1')) localStorage.setItem('cheonsu_settings_v1',JSON.stringify({soundOn:false,musicOn:false,cutsceneMode:'off',battleSpeed:'normal',effectsOn:true}));
    });
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const button=name=>page.getByRole('button',{name,exact:true});
    const hero=page.locator('.world-battlefield .unit[data-unit-id="hero"] > img');
    const save=async()=>{await page.locator('.battle-control-heading .prominent-save').click();return page.evaluate(()=>JSON.parse(localStorage.getItem('cheonsu_v01_save')));};
    const restore=async data=>{
      await page.evaluate(data=>localStorage.setItem('cheonsu_v01_save',JSON.stringify(data)),data);
      await page.reload();await button('이어하기').click();await hero.waitFor();
    };
    await page.goto(base);await button('새 게임').click();
    await page.locator('.world-stage-node').filter({has:page.locator('strong',{hasText:/^1장\./})}).click();
    await button('전투 시작').click();await button('바로 전투').click();await hero.waitFor();
    const data=await save();
    data.selectedStage.map=Array.from({length:12},()=>Array(12).fill('plain'));
    data.selectedStage.terrainRevision=3;
    data.screen='battle';data.turn='ally';data.selectedUnit='hero';data.mode='move';
    const places=[[3,3],[1,6],[6,6],[1,1]];
    data.units.forEach((unit,i)=>{const [x,y]=places[i] || [7+(i-4)%4,3+Math.floor((i-4)/4)*2];unit.x=x;unit.y=y;unit.hp=unit.maxHp=99;unit.acted=false;unit.moved=false;unit.facing='down';});
    data.selectedStage.units=structuredClone(data.units);
    await restore(data);
    for(const [direction,x,y] of [['up',3,2],['left',2,3],['right',4,3],['down',3,4]]){
      await page.locator(`.tile[data-map-x="${x}"][data-map-y="${y}"]`).click();
      const moving=await page.waitForFunction(direction=>{
        const img=document.querySelector('.tile-moving-unit img');
        return img?.dataset.facing===direction ? {src:img.getAttribute('src')} : false;
      },direction);
      assert.equal((await moving.jsonValue()).src.includes('-back.webp'),direction==='up');
      await moving.dispose();
      await page.locator('.cmd-undo').waitFor();
      await page.waitForFunction(()=>!document.querySelector('.cmd-undo')?.disabled);
      assert.equal(await hero.getAttribute('data-facing'),direction);
      assert.equal(await hero.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a),direction==='left'?-1:1);
      const state=await save();assert.equal(state.units.find(unit=>unit.id==='hero').facing,direction);
      await page.screenshot({path:`${out}/${viewport.width}-${direction}.png`});
      await page.locator('.cmd-undo').click();
      assert.equal(await hero.getAttribute('data-facing'),'down','undo restores original heading');
    }
    await page.locator('.tile[data-map-x="3"][data-map-y="2"]').click();
    await page.waitForFunction(()=>!document.querySelector('.cmd-wait')?.disabled && !document.querySelector('.tile-moving-unit'));
    await page.locator('.cmd-wait').click();
    assert.equal(await hero.getAttribute('data-facing'),'up','waiting preserves final movement heading');
    const waited=await save();await restore(waited);
    assert.equal(await hero.getAttribute('data-facing'),'up','continue preserves waiting heading');
    const attack=structuredClone(data);
    const foe=attack.units.find(unit=>unit.type==='enemy');foe.x=2;foe.y=3;
    attack.selectedStage.units=structuredClone(attack.units);
    await restore(attack);
    await page.locator('.cmd-attack').click();await page.locator('.tile[data-map-x="2"][data-map-y="3"]').click();
    await button('공격 실행').click();
    await page.waitForFunction(()=>document.querySelector('.unit[data-unit-id="hero"] > img')?.dataset.facing==='left');
    await page.waitForFunction(()=>!document.querySelector('.battle-control-heading .prominent-save')?.disabled);
    const after=await save();assert.equal(after.units.find(unit=>unit.id==='hero').facing,'left');
    assert.equal(after.units.find(unit=>unit.id===foe.id).facing,'right','defender/counter faces attacker');
    await restore(after);assert.equal(await hero.getAttribute('data-facing'),'left');
    await page.evaluate(()=>localStorage.setItem('cheonsu_settings_v1',JSON.stringify({soundOn:false,musicOn:false,cutsceneMode:'full',battleSpeed:'normal',effectsOn:true})));
    for(const mode of ['attack','skill']){
      await restore(attack);
      await page.locator(`.cmd-${mode}`).click();
      if(mode==='skill') await page.locator('.skill-choice-dialog [data-skill-id="gale"]').click();
      await page.locator('.tile[data-map-x="2"][data-map-y="3"]').click();
      await button(mode==='skill'?'스킬 실행':'공격 실행').click();
      const scene=page.locator(`.painted-combat[data-presentation="${mode}"]`);
      const frame=await scene.evaluate(el=>({cutIn:el.querySelector('.skill-cut-in strong')?.textContent,impact:el.dataset.impact,images:[...el.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth>0)}));
      assert.equal(frame.impact,mode==='skill'?'0.62':'0.5');assert.ok(frame.images,'real-game combat art preloaded');
      if(mode==='skill')assert.equal(frame.cutIn,'돌풍 베기');else assert.equal(frame.cutIn,undefined);
      assert.equal(await hero.getAttribute('data-facing'),'left');
      await page.screenshot({path:`${out}/${viewport.width}-real-${mode}.png`});
      await page.waitForFunction(()=>!document.querySelector('.battle-control-heading .prominent-save')?.disabled);
      const completed=await save();assert.equal(completed.units.find(unit=>unit.id==='hero').acted,true);
      if(mode==='skill')assert.ok(completed.units.find(unit=>unit.id==='hero').skillCooldowns.gale>0);
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS facing ${viewport.width}x${viewport.height}: four moves, rear art, flip, undo, wait, attack/counter, save/continue, real basic/skill cutscenes`);
    await page.close();
  }
} finally {await browser.close();}
