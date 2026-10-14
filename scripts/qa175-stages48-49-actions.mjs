import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {configurePage,createStageSeed,enterStage,loadSeed,readBattle,readSaved,startDeploymentBattle,waitForBattleReady,watchErrors,SAVE_KEY} from './qa175-harness.mjs';
const out='/workspace/work/qa175/stages41-50/action-gaps'; await mkdir(out,{recursive:true});
const report={scope:'41–50, current source',natural:[],settlementFixtures:[],errors:[],unverified:[]};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(12000);watchErrors(page,report.errors);await configurePage(page);
const sig=s=>s.units.map(({id,hp,maxHp,x,y,atk,def,level})=>({id,hp,maxHp,x,y,atk,def,level}));
async function persist(){await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
async function images(){return page.evaluate(async()=>{const imgs=[...document.images];imgs.forEach(i=>i.loading='eager');await Promise.all(imgs.map(i=>i.decode().catch(()=>{})));return imgs.filter(i=>!i.naturalWidth).map(i=>i.currentSrc||i.src);});}
async function snapshot(label){await page.screenshot({path:`${out}/${label}.png`});return {overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),brokenImages:await images()};}
async function commandActor(id,record){
 const state=await readBattle(page);const u=state.units.find(u=>u.id===id&&u.hp>0&&!u.acted);if(!u)return;
 const sprite=page.locator(`.world-battlefield [data-unit-id="${id}"]`);await sprite.scrollIntoViewIfNeeded();await sprite.click();
 const enemies=state.units.filter(u=>u.type!=='ally'&&u.hp>0);const target=enemies.sort((a,b)=>Math.abs(a.x-u.x)+Math.abs(a.y-u.y)-Math.abs(b.x-u.x)-Math.abs(b.y-u.y))[0];
 const cells=await page.locator('.world-battlefield .movable-tile-cell').evaluateAll(es=>es.map(e=>({x:Number(e.dataset.mapX),y:Number(e.dataset.mapY)})));
 if(target&&cells.length){cells.sort((a,b)=>Math.abs(a.x-target.x)+Math.abs(a.y-target.y)-Math.abs(b.x-target.x)-Math.abs(b.y-target.y));const c=cells[0];await page.locator(`.world-battlefield .movable-tile-cell[data-map-x="${c.x}"][data-map-y="${c.y}"]`).click();await waitForBattleReady(page);record.actions.push({actor:id,kind:'move',to:c});}
 const bar=page.locator('.cinematic-command-bar');if(record.stage===48&&['hero','lina'].includes(id)){await bar.locator('.cmd-skill').click();const choices=page.locator('.skill-choice-list button:not(:disabled)');if(await choices.count())await choices.first().click();}else await bar.locator('.cmd-attack').click();
 let targets=bar.locator('.battle-target-buttons button:not(:disabled)');
 if(await targets.count()){await targets.first().click();await waitForBattleReady(page);record.actions.push({actor:id,kind:record.stage===48&&['hero','lina'].includes(id)?'skill':'attack'});return;}
 await page.getByRole('button',{name:'명령 선택 취소',exact:true}).click();
 await bar.locator('.cmd-skill').click();
 const choices=page.locator('.skill-choice-list button:not(:disabled)');
 if(await choices.count())await choices.first().click();
 targets=bar.locator('.battle-target-buttons button:not(:disabled)');
 if(await targets.count()){await targets.first().click();await waitForBattleReady(page);record.actions.push({actor:id,kind:'skill'});return;}
 const support=page.locator('.support-target-list button:not(:disabled)');
 if(await support.count()){await support.first().click();await page.getByRole('button',{name:'마법 사용',exact:true}).click();await waitForBattleReady(page);record.actions.push({actor:id,kind:'support-skill'});return;}
 const close=page.getByRole('button',{name:'스킬 선택 닫기',exact:true});if(await close.isVisible())await close.click();
 const cancel=page.getByRole('button',{name:'명령 선택 취소',exact:true});if(await cancel.isVisible())await cancel.click();
 if(await bar.locator('.cmd-wait').isEnabled()){await bar.locator('.cmd-wait').click();record.actions.push({actor:id,kind:'wait'});}
}

try{for(const stage of [48,49]){const n={stage,passed:false,actions:[],rounds:[]};report.natural.push(n);try{await loadSeed(page,createStageSeed(stage));await enterStage(page,stage);await startDeploymentBattle(page);n.initialEnemyHP=(await readBattle(page)).units.filter(u=>u.type!=='ally').map(({id,hp,maxHp})=>({id,hp,maxHp}));for(let round=0;round<9;round++){for(const actor of ['hero','aria','lina','bram'])await commandActor(actor,n);if(n.actions.some(a=>a.kind===(stage===48?'skill':'attack'))){n.passed=true;break;}const before=await readBattle(page);await page.locator('.battle-end-turn-float').click();await page.waitForFunction(()=>document.querySelector('.battle-screen')?.dataset.saveReady==='true'&&document.querySelector('.battle-end-turn-float:not(:disabled)'),null,{timeout:120000});const after=await readBattle(page);n.rounds.push({before:before.round,after:after.round});}await snapshot(`stage${stage}-extra-action`);assert.ok(n.passed);}catch(e){n.error=e.stack;await page.screenshot({path:`${out}/stage${stage}-failure.png`}).catch(()=>{});}await persist();}}finally{await persist();await browser.close();}console.log(JSON.stringify(report.natural));
