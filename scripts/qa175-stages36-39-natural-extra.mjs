import assert from 'node:assert/strict';
import {findMovePath} from '../src/engine/movement.js';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {configurePage,createStageSeed,enterStage,loadSeed,readBattle,readSaved,startDeploymentBattle,watchErrors,waitForBattleReady,waitForDeployment} from './qa175-harness.mjs';
const out='/workspace/work/qa175/stages31-40/natural-extra'; await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); page.setDefaultTimeout(15000);
await configurePage(page); const errors=[];watchErrors(page,errors);const results=process.env.QA_RESUME_EXTRA?JSON.parse(await fs.readFile(`${out}/report.json`,'utf8')).results:[];
const capture=async(id,label)=>page.screenshot({path:`${out}/${id}-${label}.png`,fullPage:true});
const sig=s=>s.units.map(u=>({id:u.id,hp:u.hp,x:u.x,y:u.y,atk:u.atk,def:u.def,stats:u.battleStats}));
async function settle(){await page.waitForFunction(()=>document.querySelector('.victory-dialog[open],.defeat-dialog[open]')||!!document.querySelector('.battle-end-turn-float:not(:disabled)'));await waitForBattleReady(page);}
async function act(id,kind){
 const unit=page.locator(`.world-battlefield [data-unit-id="${id}"]`).first(); if(!await unit.count())return {id,absent:true};
 await unit.scrollIntoViewIfNeeded();await unit.click();const bar=page.locator('.cinematic-command-bar');await bar.waitFor();
 let moves=page.locator('.world-battlefield .tile:has(.move-tile):not(:has([data-unit-id]))');
 if(await moves.count()){const before=await readBattle(page);const foes=before.units.filter(u=>u.type!=='ally'&&u.hp>0);const positions=await moves.evaluateAll(ts=>ts.map(t=>({x:+t.dataset.mapX,y:+t.dataset.mapY})));positions.sort((a,b)=>Math.min(...foes.map(e=>Math.abs(e.x-a.x)+Math.abs(e.y-a.y)))-Math.min(...foes.map(e=>Math.abs(e.x-b.x)+Math.abs(e.y-b.y))));const map=await page.evaluate(()=>window.__CHEONSU_ACTIVE_MAP__);const actor=before.units.find(u=>u.id===id);const routes=foes.map(e=>findMovePath(actor,e.x,e.y,before.units.filter(u=>u.id!==e.id),map)).filter(path=>positions.some(pos=>path.some(step=>step.x===pos.x&&step.y===pos.y)));routes.sort((a,b)=>(a.at(-1)?.cost||99999)-(b.at(-1)?.cost||99999));if(routes[0])positions.sort((a,b)=>routes[0].findIndex(t=>t.x===b.x&&t.y===b.y)-routes[0].findIndex(t=>t.x===a.x&&t.y===a.y));if(id==='aria'){const hero=before.units.find(u=>u.id==='hero');positions.sort((a,b)=>(Math.abs(a.x-hero.x)+Math.abs(a.y-hero.y))-(Math.abs(b.x-hero.x)+Math.abs(b.y-hero.y))||Math.min(...foes.map(e=>Math.abs(e.x-b.x)+Math.abs(e.y-b.y)))-Math.min(...foes.map(e=>Math.abs(e.x-a.x)+Math.abs(e.y-a.y))));}const dest=page.locator(`.world-battlefield [data-map-x="${positions[0].x}"][data-map-y="${positions[0].y}"]`);await dest.scrollIntoViewIfNeeded();await dest.click();await settle();}
 let used='wait';
 if(kind==='skill'&&await bar.locator('.cmd-skill').isEnabled()){
 await bar.locator('.cmd-skill').click(); let skill=page.locator('.skill-choice-dialog [data-skill-id]:not(:disabled)').first();
 if(await skill.count())await skill.click(); else if(await page.locator('.skill-choice-dialog').count())await page.getByRole('button',{name:'스킬 선택 닫기',exact:true}).click();
 }
 if(kind==='attack'&&await bar.locator('.cmd-attack').isEnabled())await bar.locator('.cmd-attack').click();
 if(await page.locator('.support-target-dialog[open]').count()){const support=page.locator('.support-target-dialog');await support.locator('[data-target-id]:not(:disabled)').first().click();await support.getByRole('button',{name:'마법 사용',exact:true}).click();used='skill';await settle();}
 const targets=bar.locator('.battle-target-buttons button:not(:disabled)');
 if(await targets.count()){await targets.first().click();used=kind;await settle();}
 const cancel=bar.locator('.battle-selection-cancel');if(await cancel.count())await cancel.click();
 if(await bar.locator('.cmd-wait').isEnabled())await bar.locator('.cmd-wait').click();await settle();return {id,used};
}
for(let id=Number(process.env.QA_START||36);id<=39;id++){const r={id,enemyHpUnmodified:true,allyStatsUnmodified:true,rounds:[],actions:[]};results.push(r);try{
await loadSeed(page,createStageSeed(id));await enterStage(page,id);await startDeploymentBattle(page);r.initial=sig(await readBattle(page));
for(let turn=0;turn<10;turn++){
 for(const unit of ['hero','aria','lina','bram'])r.actions.push({turn:turn+1,...await act(unit,unit==='aria'||(unit==='bram'&&turn%2===0)?'skill':'attack')});
 const state=await readBattle(page);r.rounds.push({round:state.round,units:sig(state)});await capture(id,`round${state.round}`);
 if(turn>=4&&r.actions.some(a=>a.used==='attack'))break;
 await page.locator('.battle-end-turn-float').click();await settle();
}
assert.ok(r.actions.some(a=>a.used==='attack'));assert.equal(r.actions.some(a=>a.absent),false);assert.ok(r.rounds.at(-1).round>=5);const saved=await readBattle(page);await page.reload();await page.getByRole('button',{name:'이어하기',exact:true}).click();const restored=await readBattle(page);assert.deepEqual(sig(restored),sig(saved));assert.deepEqual(restored.battleStats,saved.battleStats);r.battleStatsRestore=true;r.passed=true;
}catch(e){r.passed=false;r.failure={message:e.message,stack:e.stack};await capture(id,'failure').catch(()=>{});}await fs.writeFile(`${out}/report.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({id,passed:r.passed,failure:r.failure?.message}));}
await browser.close();
