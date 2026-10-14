import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {configurePage,createStageSeed,enterStage,loadSeed,readBattle,readSaved,startDeploymentBattle,watchErrors,waitForBattleReady,waitForDeployment} from './qa175-harness.mjs';
const out='/workspace/work/qa175/stages31-40'; await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); page.setDefaultTimeout(15000);
await configurePage(page); const errors=[];watchErrors(page,errors);const results=process.env.QA_RESUME?JSON.parse(await fs.readFile(`${out}/report.json`,'utf8')).results:[];
const capture=async(id,label)=>page.screenshot({path:`${out}/${id}-${label}.png`,fullPage:true});
const sig=s=>s.units.map(u=>({id:u.id,hp:u.hp,x:u.x,y:u.y,atk:u.atk,def:u.def,stats:u.battleStats}));
async function settle(){await page.waitForFunction(()=>document.querySelector('.victory-dialog[open],.defeat-dialog[open]')||!!document.querySelector('.battle-end-turn-float:not(:disabled)'));await waitForBattleReady(page);}
async function act(id,kind){
 const unit=page.locator(`.world-battlefield [data-unit-id="${id}"]`).first(); if(!await unit.count())return {id,absent:true};
 await unit.scrollIntoViewIfNeeded();await unit.click();const bar=page.locator('.cinematic-command-bar');await bar.waitFor();
 let moves=page.locator('.world-battlefield .tile:has(.move-tile):not(:has([data-unit-id]))');
 if(await moves.count()){const before=await readBattle(page);const foes=before.units.filter(u=>u.type!=='ally'&&u.hp>0);const positions=await moves.evaluateAll(ts=>ts.map(t=>({x:+t.dataset.mapX,y:+t.dataset.mapY})));positions.sort((a,b)=>Math.min(...foes.map(e=>Math.abs(e.x-a.x)+Math.abs(e.y-a.y)))-Math.min(...foes.map(e=>Math.abs(e.x-b.x)+Math.abs(e.y-b.y))));const dest=page.locator(`.world-battlefield [data-map-x="${positions[0].x}"][data-map-y="${positions[0].y}"]`);await dest.scrollIntoViewIfNeeded();await dest.click();await settle();}
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
for(let id=Number(process.env.QA_START||31);id<=Number(process.env.QA_END||40);id++){
 const r={id,naturalBattle:{enemyHpUnmodified:true,rounds:[],actions:[]},seededSettlement:{},errors:[]};results.push(r);const errorStart=errors.length;
 try{
 await page.setViewportSize({width:390,height:844});const seed=createStageSeed(id);await loadSeed(page,seed);await enterStage(page,id);
 assert.equal(await page.locator('.deployment-roster-card[data-placed="true"]').count(),15);r.designatedCells=await page.locator('[data-deployment-valid="true"]').count();assert.equal(r.designatedCells,18);r.deploymentRoster=await page.locator('.deployment-roster-card').count();
 r.deploymentTitle=await page.locator('.battle-deploy-title').innerText();const hcard=page.locator('.deployment-roster-card[data-character-id="hero"]');await hcard.scrollIntoViewIfNeeded();await hcard.click();const empty=page.locator('[data-deployment-valid="true"][data-deployment-unit=""]').first();if(await empty.count()){r.manualDeploymentDestination={x:await empty.getAttribute('data-deployment-x'),y:await empty.getAttribute('data-deployment-y')};await empty.scrollIntoViewIfNeeded();await empty.click();const actual=page.locator('[data-deployment-unit="hero"]');assert.equal(await actual.getAttribute('data-deployment-x'),r.manualDeploymentDestination.x);assert.equal(await actual.getAttribute('data-deployment-y'),r.manualDeploymentDestination.y);r.manualDeploymentMoved=true;}await page.getByRole('button',{name:'배치 저장',exact:true}).click();const deployment=await readSaved(page);await page.reload();await page.getByRole('button',{name:'이어하기',exact:true}).click();r.deploymentRestored=JSON.stringify((await readSaved(page)).deploymentPlacements)===JSON.stringify(deployment.deploymentPlacements);
 await capture(id,'deployment');await startDeploymentBattle(page);const initial=await readBattle(page);r.naturalBattle.initial=sig(initial);assert.equal(initial.units.filter(u=>u.type==='ally').length,15);
 for(let turn=0;turn<5;turn++){
 for(const [i,unit]of ['hero','aria','lina','bram'].entries())r.naturalBattle.actions.push({turn:turn+1,...await act(unit,i%2?'skill':'attack')});
 const before=await readBattle(page);r.naturalBattle.rounds.push({round:before.round,units:sig(before)});
 if(turn<4){await page.locator('.battle-end-turn-float').click();await settle();}
 }
 const saved=await readBattle(page);const expected=sig(saved);await page.reload();await page.getByRole('button',{name:'이어하기',exact:true}).click();await waitForBattleReady(page);const restored=await readBattle(page);assert.deepEqual(sig(restored),expected);r.naturalBattle.battleRestore=true;assert.ok(restored.round>=5);
 await page.evaluate(async()=>{await Promise.all([...document.images].map(async i=>{i.loading='eager';try{await i.decode()}catch{}}))});
 r.imageFailures=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));r.overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
 await capture(id,'natural-round5');if(id===31||id===40){await page.setViewportSize({width:844,height:390});await capture(id,'landscape');await page.setViewportSize({width:390,height:844});}
 r.naturalBattle.actualMoved=Object.fromEntries(['hero','aria','lina','bram'].map(id=>{const first=initial.units.find(u=>u.id===id),last=restored.units.find(u=>u.id===id);return[id,!!first&&!!last&&(first.x!==last.x||first.y!==last.y)]}));assert.ok(Object.values(r.naturalBattle.actualMoved).every(Boolean));r.naturalBattle.passed=true;
 // Explicit settlement fixture: original board, all allies healthy, only boss retained at 1 HP.
 const fixture=structuredClone(initial);let enemy=fixture.units.find(u=>u.type==='boss')||fixture.units.find(u=>u.type!=='ally');const hero=fixture.units.find(u=>u.id==='hero');
 enemy={...enemy,hp:1,maxHp:enemy.maxHp};hero.x=enemy.x;hero.y=enemy.y+1;fixture.units=fixture.units.filter(u=>u.type==='ally').map(u=>({...u,hp:u.maxHp,moved:false,acted:false})).concat(enemy);fixture.turn='ally';fixture.round=1;fixture.selectedUnit=null;fixture.hazards=[];
 await loadSeed(page,fixture);await waitForBattleReady(page);
 for(let attempt=0;attempt<5&&!await page.locator('.victory-dialog[open]').count();attempt++){const hu=page.locator('.world-battlefield [data-unit-id="hero"]').first();await hu.scrollIntoViewIfNeeded();await hu.click();await page.locator('.cinematic-command-bar .cmd-attack').click();const target=page.locator('.cinematic-command-bar .battle-target-buttons button:not(:disabled)').first();await target.click();await page.waitForTimeout(1000);if(!await page.locator('.victory-dialog[open]').count()){await settle();await page.locator('.battle-end-turn-float').click();await settle();}}
 await page.locator('.victory-dialog[open]').waitFor();await capture(id,'fixture-victory');await page.locator('.victory-dialog').getByRole('button',{name:'대기실',exact:true}).click();
 for(let i=0;i<4&&await page.locator('.narrative-skip').count();i++)await page.locator('.narrative-skip').click();await page.locator('.town-hub').waitFor();await page.locator('.camp-header .prominent-save').click();const won=await readSaved(page);assert.ok(won.clearedStages.includes(id));r.seededSettlement={fixture:true,actualAttack:true,enemyHp:1,goldBefore:fixture.gold,goldAfter:won.gold,newRecruit:won.party.filter(u=>!seed.party.some(p=>p.id===u.id)).map(u=>({id:u.id,level:u.level})),passed:true};
 await page.locator('.town-player-nav').getByRole('button',{name:/^(전투 진입|출전 준비)$/}).click();await waitForDeployment(page);r.seededSettlement.nextEntry=await page.locator('.deployment-screen h1').innerText();
 r.passed=true;
 }catch(e){r.failure={message:e.message,stack:e.stack};await capture(id,'failure').catch(()=>{});r.passed=false;}
 r.errors=errors.slice(errorStart);await fs.writeFile(`${out}/report.json`,JSON.stringify({results,errors,unverified:['전멸 캠프훈련 차단·동일장retry','replay 중복보상','맵 pointer pan']},null,2));console.log(JSON.stringify({id,passed:r.passed,failure:r.failure?.message}));
}
await browser.close();
