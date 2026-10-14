import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {configurePage,createStageSeed,enterStage,loadSeed,readBattle,readSaved,startDeploymentBattle,waitForBattleReady,watchErrors,SAVE_KEY} from './qa175-harness.mjs';
const out='/workspace/work/qa175/stages41-50'; await mkdir(out,{recursive:true});
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
 const bar=page.locator('.cinematic-command-bar');await bar.locator('.cmd-attack').click();
 let targets=bar.locator('.battle-target-buttons button:not(:disabled)');
 if(await targets.count()){await targets.first().click();await waitForBattleReady(page);record.actions.push({actor:id,kind:'attack'});return;}
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
try{for(let id=41;id<=50;id++){
 const n={stage:id,passed:false,actions:[],rounds:[],unverified:[]};report.natural.push(n);
 try{await page.setViewportSize({width:390,height:844});await loadSeed(page,createStageSeed(id));await enterStage(page,id);
 n.deploymentSlots=await page.locator('[data-deployment-valid="true"]').count();assert.equal(n.deploymentSlots,18);assert.equal(await page.locator('.deployment-roster-card[data-placed="true"]').count(),15);
 await page.locator('.deployment-roster-card[data-character-id="hero"]').click();await page.locator('[data-deployment-valid="true"][data-deployment-unit=""]').first().click();
 await page.getByRole('button',{name:'배치 저장',exact:true}).click();const dep=await readSaved(page);await loadSeed(page,dep);await page.locator('.deployment-start-btn').waitFor();
 n.deployment=await snapshot(`stage${id}-deployment`);await startDeploymentBattle(page);const original=await readBattle(page);n.initialEnemyHP=original.units.filter(u=>u.type!=='ally').map(({id,hp,maxHp,level})=>({id,hp,maxHp,level}));
 n.entry=await snapshot(`stage${id}-battle`);
 const shell=page.locator('.battle-map-scroll-shell').last();const box=await shell.boundingBox();if(box){await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.4,{steps:10});await page.mouse.up();n.mapPan=true;}
 for(let round=0;round<4;round++){for(const actor of ['hero','aria','lina','bram'])await commandActor(actor,n);const before=await readBattle(page);await page.locator('.battle-end-turn-float').click();await page.waitForFunction(key=>{const s=JSON.parse(localStorage.getItem(key));return document.querySelector('.battle-screen')?.dataset.saveReady==='true'&&document.querySelector('.battle-end-turn-float:not(:disabled)');},SAVE_KEY,{timeout:120000});const after=await readBattle(page);assert.equal(after.round,before.round+1);n.rounds.push({before:before.round,after:after.round,units:sig(after)});}
 const saved=await readBattle(page);await loadSeed(page,saved);await waitForBattleReady(page);assert.deepEqual(sig(await readBattle(page)),sig(saved));n.saveRestore=true;
 if(id===45||id===50){await page.setViewportSize({width:844,height:390});n.landscape=await snapshot(`stage${id}-landscape`);await page.setViewportSize({width:390,height:844});}
 n.passed=true;n.unverified.push('공격/스킬은 실제 사거리 내 대상이 있는 경우만 실행; actions 기록 참조');
 // Settlement fixture is explicitly separate from natural normal-HP battle.
 const fixture=structuredClone(original);const hero=fixture.units.find(u=>u.id==='hero');const boss=fixture.units.find(u=>u.type==='boss')||fixture.units.find(u=>u.type!=='ally');fixture.units=[hero,{...boss,hp:1,x:hero.x+1,y:hero.y}];hero.acted=false;hero.moved=false;fixture.turn='ally';fixture.result=null;fixture.stageRewardClaimed=false;
 const f={stage:id,kind:'seeded terminal boss HP1, actual UI attack',passed:false};report.settlementFixtures.push(f);
 await loadSeed(page,fixture);await waitForBattleReady(page);for(let retry=0;retry<5;retry++){await page.locator('.world-battlefield [data-unit-id="hero"]').click();await page.locator('.cinematic-command-bar .cmd-attack').click();await page.locator('.cinematic-command-bar .battle-target-buttons button:not(:disabled)').first().click();await page.waitForTimeout(1000);if(await page.locator('.victory-dialog[open]').count())break;await waitForBattleReady(page);await page.locator('.battle-end-turn-float').click();await waitForBattleReady(page);}
 await page.locator('.victory-dialog[open]').waitFor();f.rewardText=await page.locator('.victory-dialog').innerText();f.saved=await readSaved(page);assert.ok(f.saved.clearedStages.includes(id));if(id<50){await page.locator('.victory-next').click();await page.waitForFunction(()=>document.querySelector('.narrative-screen,.story-screen,.battle-deployment-scene'));f.actualNextEntry=true;}else{assert.equal(await page.locator('.victory-next').count(),0);f.noStage51=true;}f.passed=true;
 }catch(e){n.error=e.stack;await page.screenshot({path:`${out}/stage${id}-failure.png`}).catch(()=>{});}await persist();}
}finally{report.unverified.push('전멸 후 캠프 훈련 차단/동일장 재도전','재도전 중복보상0','42 Edan/47 Sylvan 최고보유레벨70% 영입','50 엔딩 장면 전체');await persist();await browser.close();}
console.log(JSON.stringify(report.natural.map(({stage,passed,error})=>({stage,passed,error})),null,2));
