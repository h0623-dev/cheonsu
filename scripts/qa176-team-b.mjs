// 독립 QA B팀. 자연 HP 전투와 승패 종료용 저장 fixture를 분리한다.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {stages} from '../src/data/stages.js';
import {getStageMission} from '../src/engine/stageMission.js';
import {isTerrainBlocked} from '../src/engine/movement.js';
import {QA_URL,createStageSeed,configurePage,loadSeed,readSaved,readBattle,startDeploymentBattle,waitForDeployment,waitForBattleReady,watchErrors} from './qa175-harness.mjs';

const out=process.env.QA_OUT || '/workspace/work/qa176/team-b';
await mkdir(out,{recursive:true});
const ids=process.env.QA_STAGE_IDS ? process.env.QA_STAGE_IDS.split(',').map(Number) : stages.map(s=>s.id);
const workers=Math.min(Number(process.env.QA_WORKERS||2),ids.length);
let stopRequested=false;
process.on('SIGUSR2',()=>{stopRequested=true;}); // 각 장 경계에서 안전하게 중단.
const report={team:'독립 QA B팀',version:process.env.QA_VERSION||'1.99.176',url:QA_URL,startedAt:new Date().toISOString(),scope:'1~50장 UI·배치·원본 HP의 실제 명령/적 턴·저장 복원·승패/재도전',limitations:['장별 저장 진입; 1장부터 50장까지 무중단 자연 클리어 검사가 아님','승패·보상·재도전은 명시한 별도 종료용 fixture를 사용','실제 Android/iPhone 기기를 이용한 실행 검사가 아님'],results:[],errors:[]};
let writes=Promise.resolve();
const persist=()=>writes=writes.then(()=>writeFile(`${out}/report.json`,JSON.stringify(report,null,2)));
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
let cursor=0;
const signature=s=>s.units.map(u=>({id:u.id,type:u.type,hp:u.hp,maxHp:u.maxHp,x:u.x,y:u.y,level:u.level,atk:u.atk,def:u.def,moved:u.moved,acted:u.acted,status:u.status||[]}));
const sample=new Set([1,10,11,20,21,30,31,40,41,50]);
const viewFor=id=>id%5===0?{width:1280,height:900}:id%3===0?{width:844,height:390}:{width:390,height:844};

async function audit(page){return page.evaluate(async()=>{const imgs=[...document.images];imgs.forEach(i=>i.loading='eager');await Promise.all(imgs.map(i=>i.decode().catch(()=>{})));return {viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+2,broken:imgs.filter(i=>!i.naturalWidth).map(i=>i.currentSrc||i.src)};});}
async function settle(page){await page.waitForTimeout(100);await page.waitForFunction(()=>document.querySelector('.victory-dialog[open],.defeat-dialog[open]')||document.querySelector('.battle-screen:not(.deployment-screen)')?.dataset.saveReady==='true',null,{timeout:120000});}
async function cancel(page){for(const name of ['스킬 선택 닫기','보조 마법 취소','명령 선택 취소']){const b=page.getByRole('button',{name,exact:true});if(await b.isVisible())await b.click();}}
async function mapClick(page,loc){await loc.scrollIntoViewIfNeeded();await loc.click();}
async function action(page,id,kind,r){
  await cancel(page);
  const saved=await readBattle(page),actor=saved.units.find(u=>u.id===id&&u.hp>0&&!u.acted);
  if(!actor)return;
  const sprite=page.locator(`.world-battlefield [data-unit-id="${id}"]`).first();if(!await sprite.count())return;
  await mapClick(page,sprite);await waitForBattleReady(page);
  if(kind==='move'){
    const enemies=saved.units.filter(u=>u.type!=='ally'&&u.hp>0);
    const options=await page.locator('.world-battlefield .movable-tile-cell').evaluateAll(es=>es.map(e=>({x:+e.dataset.mapX,y:+e.dataset.mapY})));
    options.sort((a,b)=>Math.min(...enemies.map(e=>Math.abs(e.x-a.x)+Math.abs(e.y-a.y)))-Math.min(...enemies.map(e=>Math.abs(e.x-b.x)+Math.abs(e.y-b.y))));
    if(options.length){await mapClick(page,page.locator(`.world-battlefield [data-map-x="${options[0].x}"][data-map-y="${options[0].y}"]`).first());await settle(page);r.actions.push({id,kind,round:saved.round,to:options[0]});}
    return;
  }
  const bar=page.locator('.cinematic-command-bar'),cmd=bar.locator(kind==='skill'?'.cmd-skill':'.cmd-attack');
  if(!await cmd.isEnabled())return;
  await cmd.click();
  if(kind==='skill'){
    const choices=page.locator('.skill-choice-list button:not(:disabled)');
    if(await choices.count())await choices.first().click();else{await cancel(page);return;}
    if(await page.locator('.support-target-dialog[open]').count()){
      const target=page.locator('.support-target-list button:not(:disabled)').first();
      if(await target.count()){await target.click();await page.getByRole('button',{name:'마법 사용',exact:true}).click();await settle(page);r.actions.push({id,kind:'support-skill',round:saved.round});}else await cancel(page);
      return;
    }
  }
  const target=bar.locator('.battle-target-buttons button:not(:disabled)').first();
  if(await target.count()){await target.click();await settle(page);r.actions.push({id,kind,round:saved.round});}else await cancel(page);
}
async function enemyTurn(page,r){await cancel(page);const before=await readBattle(page);await page.locator('.battle-end-turn-float').click();await settle(page);if(await page.locator('.victory-dialog[open],.defeat-dialog[open]').count())return false;const after=await readBattle(page);assert.equal(after.round,before.round+1,'적 턴 후 다음 라운드');r.enemyTurns.push({before:before.round,after:after.round,enemyMoves:after.units.filter(u=>u.type!=='ally').filter(u=>{const old=before.units.find(b=>b.id===u.id);return old&&(old.x!==u.x||old.y!==u.y)}).map(u=>({id:u.id,x:u.x,y:u.y})),remainingAllies:after.units.filter(u=>u.type==='ally'&&u.hp>0).length});return true;}
async function restore(page,seed){await loadSeed(page,seed);await waitForBattleReady(page);}
async function toCamp(page){await page.locator('.victory-dialog[open]').getByRole('button',{name:'대기실',exact:true}).click();for(let i=0;i<5;i++){await page.waitForTimeout(70);const skip=page.locator('.narrative-skip');if(await skip.isVisible())await skip.click();else break;}await page.locator('.town-hub').waitFor();return readSaved(page);}
function legal(map,x,y){return y>=0&&y<map.length&&x>=0&&x<map[y].length&&!isTerrainBlocked(map[y][x]);}
function terminalFixture(original){const t=structuredClone(original),hero=t.units.find(u=>u.id==='hero'),boss=t.units.find(u=>u.type==='boss')||t.units.find(u=>u.type!=='ally');const map=t.selectedStage.map;const point=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:hero.x+dx,y:hero.y+dy})).find(p=>legal(map,p.x,p.y));assert.ok(point,'승리 fixture 인접 합법 칸');boss.hp=1;Object.assign(boss,point);t.units=t.units.filter(u=>u.type==='ally'&&!(u.x===boss.x&&u.y===boss.y)||u.id===boss.id).map(u=>({...u,moved:false,acted:false}));t.round=1;t.turn='ally';t.result=null;t.stageRewardClaimed=false;t.hazards=[];return t;}
function contactFixture(original){
  const t=structuredClone(original),boss=t.units.find(u=>u.type==='boss')||t.units.find(u=>u.type!=='ally');
  const map=t.selectedStage.map;let positions;
  for(let y=0;y<map.length-2&&!positions;y++)for(let x=0;x<map[y].length-1&&!positions;x++)if(legal(map,x,y)&&legal(map,x+1,y)&&legal(map,x+1,y+2))positions={hero:{x,y},lina:{x:x+1,y:y+2},[boss.id]:{x:x+1,y}};
  assert.ok(positions,'공격/스킬 fixture 합법 접촉 칸');
  const occupied=new Set(Object.values(positions).map(p=>`${p.x},${p.y}`));
  t.units=t.units.filter(u=>positions[u.id]||!occupied.has(`${u.x},${u.y}`)).map(u=>({...u,...positions[u.id],acted:false,moved:false}));
  t.turn='ally';t.round=1;t.result=null;t.hazards=[];return t;
}

async function test(page,id){
  const r={stage:id,passed:false,viewport:viewFor(id),natural:{actions:[],enemyTurns:[],HPStatsUnmodified:true},fixtures:{}};report.results.push(r);
  try{
    await page.setViewportSize(r.viewport);
    const seed=createStageSeed(id);await loadSeed(page,seed);
    const stageButton=n=>page.locator('.campaign-stage-select button').filter({has:page.locator('strong').filter({hasText:new RegExp(`^${n}장[.]`)})}).first();
    assert.equal(await stageButton(id).isEnabled(),true);
    if(id<50)assert.equal(await stageButton(id+1).isDisabled(),true,'미클리어 다음 장 잠금');
    r.campaignLock=true;await stageButton(id).click();await waitForDeployment(page,{confirmMission:false});
    const mission=page.locator('.stage-mission-dialog[open]');await mission.waitFor();const text=await mission.innerText();
    assert.ok(text.includes('아군 전멸'));assert.ok(!text.includes('카일 사망'));const displayedLimit=Number(text.match(/(\d+)라운드의 아군 턴 종료/)?.[1]);assert.ok(displayedLimit>0);
    assert.ok(await page.locator('.deployment-start-btn').isDisabled());r.mission={bossNames:[],roundLimit:displayedLimit,heroDeathExcluded:true};
    await mission.getByRole('button',{name:'미션 확인',exact:true}).click();await waitForDeployment(page);
    assert.equal(await page.locator('.deployment-roster-card[data-placed="true"]').count(),Math.min(15,seed.party.length));
    assert.equal(await page.locator('[data-deployment-valid="true"]').count(),18);
    await page.locator('.deployment-roster-card[data-character-id="hero"]').click();const empty=page.locator('[data-deployment-valid="true"][data-deployment-unit=""]').first();const point=await empty.evaluate(e=>({x:+e.dataset.deploymentX,y:+e.dataset.deploymentY}));await empty.click();
    await page.getByRole('button',{name:'배치 저장',exact:true}).click();const draft=await readSaved(page);assert.deepEqual(draft.deploymentDraft.placements.hero,point);
    await page.reload();await page.getByRole('button',{name:'이어하기',exact:true}).click();await waitForDeployment(page);await page.getByRole('button',{name:'배치 저장',exact:true}).click();assert.deepEqual((await readSaved(page)).deploymentDraft,draft.deploymentDraft);r.deploymentSaveRestore=true;
    const viewport=page.locator('.battle-deploy-viewport');await viewport.scrollIntoViewIfNeeded();const box=await viewport.boundingBox();
    const panBefore=await viewport.evaluate(e=>({x:e.scrollLeft,y:e.scrollTop,maxX:e.scrollWidth-e.clientWidth,maxY:e.scrollHeight-e.clientHeight}));
    const dx=panBefore.x>panBefore.maxX/2?80:-80,dy=panBefore.y>panBefore.maxY/2?65:-65;
    await page.mouse.move(box.x+box.width/2,box.y+Math.min(box.height/2,170));await page.mouse.down();await page.mouse.move(box.x+box.width/2+dx,box.y+Math.min(box.height/2,170)+dy,{steps:8});await page.mouse.up();await page.waitForTimeout(100);
    const panAfter=await viewport.evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));r.deploymentPan={before:panBefore,after:panAfter};if(panBefore.maxX>1||panBefore.maxY>1)assert.ok(panBefore.x!==panAfter.x||panBefore.y!==panAfter.y,'실제 배치 지도를 드래그해 이동');
    r.deployment=await audit(page);assert.equal(r.deployment.overflow,false);assert.deepEqual(r.deployment.broken,[]);if(sample.has(id))await page.screenshot({path:`${out}/stage-${id}-deployment.png`});
    await startDeploymentBattle(page);const original=await readBattle(page);const actualMission=getStageMission(original.selectedStage);assert.equal(r.mission.roundLimit,actualMission.roundLimit,'실제 확장 전장 크기에 따른 라운드 제한 일치');for(const name of actualMission.bossNames)assert.ok(text.includes(name),`실제 보스 ${name} 이름 표시`);r.mission.bossNames=actualMission.bossNames;r.natural.initialEnemyHP=original.units.filter(u=>u.type!=='ally').map(u=>({id:u.id,hp:u.hp,maxHp:u.maxHp,level:u.level,move:u.move,x:u.x,y:u.y}));await writeFile(`${out}/stage-${id}-initial.json`,JSON.stringify(original));
    r.battle=await audit(page);assert.equal(r.battle.overflow,false);assert.deepEqual(r.battle.broken,[]);
    for(let turn=0;turn<2;turn++){
      for(const actor of ['hero','aria','lina','bram'])await action(page,actor,'move',r.natural);
      for(const [actor,kind] of [['hero','attack'],['aria','skill'],['lina','skill'],['bram','attack']]){if(await page.locator('.victory-dialog[open],.defeat-dialog[open]').count())break;await action(page,actor,kind,r.natural);}
      if(await page.locator('.victory-dialog[open],.defeat-dialog[open]').count())break;
      if(!await enemyTurn(page,r.natural))break;
    }
    if(!await page.locator('.victory-dialog[open],.defeat-dialog[open]').count()){
      const live=await readBattle(page);r.natural.finalRound=live.round;r.natural.finalUnits=signature(live);r.natural.battleStats=live.battleStats;
      await writeFile(`${out}/stage-${id}-live.json`,JSON.stringify(live));
      await restore(page,live);const resumed=await readBattle(page);assert.deepEqual(signature(resumed),signature(live));assert.deepEqual(resumed.battleStats,live.battleStats);r.natural.battleSaveRestore=true;
    }else r.natural.terminalBeforeTwoEnemyTurns=await page.locator('.victory-dialog[open]').count()?'victory':'defeat';
    if(sample.has(id))await page.screenshot({path:`${out}/stage-${id}-natural-battle.png`});
    // 실제 자연 전투와 섞지 않는 상태 경계 fixture: 주인공만 사망.
    const noHero=structuredClone(original);noHero.units=noHero.units.filter(u=>u.id!=='hero');noHero.selectedUnit=null;await restore(page,noHero);assert.equal(await page.locator('.defeat-dialog[open]').count(),0);assert.ok(await page.locator('.battle-end-turn-float').isEnabled());r.fixtures.heroDeathContinues=true;
    // 접촉 경계: 원본 HP/능력치 그대로, 좌표만 조정해 모든 장의 공격/스킬 UI 실행 보장.
    const contact=contactFixture(original);await restore(page,contact);const cr={actions:[]};await action(page,'hero','attack',cr);await action(page,'lina','skill',cr);
    assert.ok(cr.actions.some(a=>a.kind==='attack'),'원본 능력치 접촉 fixture의 실제 공격');assert.ok(cr.actions.some(a=>a.kind==='skill'),'원본 능력치 접촉 fixture의 실제 스킬');const contactOutcome=await page.locator('.victory-dialog[open]').count()?'victory':await page.locator('.defeat-dialog[open]').count()?'defeat':null;const contactSaved=contactOutcome?await readSaved(page):await readBattle(page);r.fixtures.contactCombat={kind:'좌표만 조정, HP·공방 원본 유지',actions:cr.actions,battleStats:contactSaved.battleStats,terminal:contactOutcome};
    // 승리 경계: 원본 능력치 유지, 적 대장 HP1·인접 배치의 실제 공격.
    const terminal=terminalFixture(original);await restore(page,terminal);const ar={actions:[],enemyTurns:[]};
    for(let i=0;i<8&&!await page.locator('.victory-dialog[open]').count();i++){await action(page,'hero','attack',ar);if(!await page.locator('.victory-dialog[open]').count())await enemyTurn(page,ar);}
    await page.locator('.victory-dialog[open]').waitFor();const won=await readSaved(page);assert.ok(won.clearedStages.includes(id));assert.ok(won.gold>terminal.gold);r.fixtures.victory={kind:'원본 능력치·적 대장 HP1 인접 저장 fixture, 실제 UI 공격',actions:ar.actions,goldBefore:terminal.gold,goldAfter:won.gold,cleared:true};
    if(id===50){assert.equal(await page.locator('.victory-next').count(),0);r.fixtures.noStage51=true;}
    const camp=await toCamp(page);assert.equal(camp.campWalkerId,'lina');r.fixtures.campWalkerPreserved=true;
    if(id<50){await page.locator('.town-player-nav').getByRole('button',{name:/^(전투 진입|출전 준비)$/}).click();await waitForDeployment(page);assert.match(await page.locator('.deployment-screen h1').innerText(),new RegExp(`^${id+1}장`));r.fixtures.actualNextStage=id+1;}
    else{r.fixtures.finalCamp=true;}
    // 이미 정산한 동일 장은 보상 중복 금지. 적 제거 경계 fixture임을 명시.
    const replay={...structuredClone(original),...structuredClone(camp),screen:'battle',selectedStage:original.selectedStage,units:original.units.filter(u=>u.type==='ally'),round:1,turn:'ally',stageRewardClaimed:true};await loadSeed(page,replay);await page.locator('.victory-dialog[open]').waitFor();const replayCamp=await toCamp(page);assert.equal(replayCamp.gold,camp.gold);assert.deepEqual(replayCamp.inventory,camp.inventory);r.fixtures.replayNoDuplicateReward=true;
    // 전멸 경계 후 실제 대기실 UI 훈련/재도전/진행 잠금을 점검.
    const defeat=structuredClone(original);defeat.units=defeat.units.filter(u=>u.type!=='ally');await loadSeed(page,defeat);await page.locator('.defeat-dialog[open]').waitFor();await page.getByRole('button',{name:'대기실로 이동',exact:true}).click();await page.locator('.town-hub').waitFor();
    const management=page.locator('.camp-management');if(!await management.evaluate(e=>e.open))await page.locator('.camp-management > summary').click();await page.getByRole('tab',{name:'성장',exact:true}).click();assert.equal(await page.locator('.camp-tab-panel[aria-label="성장"]').getByRole('button',{name:'훈련',exact:true}).isDisabled(),true);
    const lost=await readSaved(page);assert.ok(!lost.clearedStages.includes(id));assert.equal(lost.gold,original.gold);assert.deepEqual(lost.lastBattleResult,{stageId:id,outcome:'defeat'});r.fixtures.defeatTrainingBlockedNoProgress=true;
    await page.locator('.town-player-nav').getByRole('button',{name:/^(전투 진입|출전 준비)$/}).click();await waitForDeployment(page);assert.match(await page.locator('.deployment-screen h1').innerText(),new RegExp(`^${id}장`));r.fixtures.actualSameStageRetry=id;
    r.passed=true;
  }catch(e){r.failure={message:e.message,stack:e.stack};await page.screenshot({path:`${out}/stage-${id}-failure.png`}).catch(()=>{});}
  await persist();console.log(JSON.stringify({team:'B',stage:id,passed:r.passed,actions:r.natural.actions.length,enemyTurns:r.natural.enemyTurns.length,error:r.failure?.message}));
}

try{await Promise.all(Array.from({length:workers},async(_,index)=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});const page=await context.newPage();page.setDefaultTimeout(18000);await configurePage(page);watchErrors(page,report.errors);
  await page.goto(QA_URL);assert.equal(await page.locator('.journey-title-footer > span').innerText(),`v${report.version}`,'새 브라우저 실제 실행 버전');report.bundle=await page.locator('script[type="module"][src]').getAttribute('src');
  while(cursor<ids.length&&!stopRequested&&browser.isConnected()){const id=ids[cursor++];await test(page,id);}
  await context.close();
}));}finally{report.finishedAt=new Date().toISOString();report.results.sort((a,b)=>a.stage-b.stage);report.interrupted=stopRequested;report.passed=report.results.length===ids.length&&report.results.every(r=>r.passed)&&report.errors.length===0;await persist();await browser.close();}
if(!report.passed)process.exitCode=1;
