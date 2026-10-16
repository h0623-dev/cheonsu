// QA 전용 독립 브라우저 저장으로 후반 진행도 복구와 손상 저장의 덮어쓰기 차단을 검사.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {QA_URL,SAVE_KEY,createStageSeed,configurePage,watchErrors} from './qa175-harness.mjs';
const out=process.env.QA_OUT||'/workspace/work/qa176/team-b/settings';await mkdir(out,{recursive:true});
const backupKey='cheonsu_v01_progress_recovery_backup';
const report={team:'독립 QA B팀',version:'1.99.176',url:QA_URL,startedAt:new Date().toISOString(),results:[],errors:[],scope:'설정의 0~50장 진행도 복구, 취소/적용/원본 복원과 손상 저장의 정상 진행 덮어쓰기 차단',isolatedSyntheticSave:true};
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const raw=page=>page.evaluate(key=>localStorage.getItem(key),SAVE_KEY);
async function settings(page,tab){await page.getByRole('button',{name:'설정',exact:true}).click();await page.locator('.player-settings').waitFor();await page.getByRole('button',{name:tab,exact:true}).click();}
const stageIds=page=>page.locator('.world-stage-node:not(:disabled)').evaluateAll(es=>es.map(e=>Number(e.querySelector('.node-number').textContent)));
async function openRecovery(page){await page.reload();await settings(page,'저장');await page.getByText('클리어 진행도 복구',{exact:true}).click();}
for(const [completed,viewport] of [[31,{width:390,height:844}],[49,{width:844,height:390}],[50,{width:1280,height:900}]]){
  const r={completedThrough:completed,viewport,passed:false,dialogs:[]};report.results.push(r);
  const context=await browser.newContext({viewport,isMobile:viewport.width<1280,hasTouch:viewport.width<1280,serviceWorkers:'block'});const page=await context.newPage();page.setDefaultTimeout(18000);await configurePage(page);watchErrors(page,report.errors);let decision='accept';page.on('dialog',async dialog=>{r.dialogs.push({type:dialog.type(),message:dialog.message(),decision});await(decision==='dismiss'?dialog.dismiss():dialog.accept());});
  try{
    await page.goto(QA_URL);assert.equal(await page.locator('.journey-title-footer > span').innerText(),'v1.99.176');const seed=createStageSeed(35);seed.gold=8123;await page.evaluate(({key,seed})=>{localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem('cheonsu_v01_manual_slot_1','{}');localStorage.setItem('cheonsu_v01_manual_slot_2','[]');localStorage.setItem('cheonsu_v01_manual_slot_3',JSON.stringify(seed));},{key:SAVE_KEY,seed});
    await openRecovery(page);const original=await raw(page);const select=page.getByLabel('완료한 마지막 장');const options=await select.locator('option').evaluateAll(es=>es.map(e=>Number(e.value)));assert.deepEqual(options,Array.from({length:51},(_,i)=>i));await select.selectOption(`${completed}`);assert.equal(await raw(page),original,'선택만으로 진행을 바꾸지 않음');
    const description=await page.locator('.progress-recovery').innerText();assert.ok(description.includes('캐릭터·장비·골드는 유지'));assert.ok(description.includes('원본 저장'));
    decision='dismiss';await page.getByRole('button',{name:'진행도 복구 적용',exact:true}).click();assert.equal(await raw(page),original,'취소하면 정상 저장 그대로 보존');assert.equal(await page.evaluate(key=>localStorage.getItem(key),backupKey),null);
    decision='accept';await page.getByRole('button',{name:'진행도 복구 적용',exact:true}).click();await page.locator('.campaign-screen').waitFor();const repaired=JSON.parse(await raw(page));assert.deepEqual(repaired.clearedStages,Array.from({length:completed},(_,i)=>i+1));assert.deepEqual(await stageIds(page),Array.from({length:Math.min(50,completed+1)},(_,i)=>i+1));
    for(const field of ['party','gold','inventory','gearInventory','gearEnhance','campWalkerId','collection'])assert.deepEqual(repaired[field],seed[field],`${field} 보존`);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),backupKey),original,'최초 원본을 별도 백업');r.recovery={optionCount:options.length,cancelReadOnly:true,appliedThrough:completed,preserved:['party','gold','inventory','gearInventory','gearEnhance','campWalkerId','collection'],backedUpOriginal:true};
    await page.screenshot({path:`${out}/recovered-${completed}.png`});await openRecovery(page);await page.getByRole('button',{name:'복구 전 원본 되돌리기',exact:true}).click();await page.locator('.campaign-screen').waitFor();assert.equal(await raw(page),original,'원본 되돌리기가 최초 저장을 복원');r.recovery.originalRestored=true;
    // 손상 슬롯 {}·[]는 불러오기 비활성, 정상 슬롯은 활성.
    await page.reload();await settings(page,'저장');assert.ok(await page.getByRole('button',{name:'슬롯 1 불러오기',exact:true}).isDisabled());assert.ok(await page.getByRole('button',{name:'슬롯 2 불러오기',exact:true}).isDisabled());assert.ok(await page.getByRole('button',{name:'슬롯 3 불러오기',exact:true}).isEnabled());r.corruptSlotsBlocked=true;
    // 묶음 가져오기에서도 비정상 current는 정상 primary를 바꾸지 않는다.
    await page.getByRole('button',{name:'업데이트',exact:true}).click();await page.getByText('개발 및 진단',{exact:true}).click();await page.getByRole('button',{name:'저장 점검',exact:true}).click();await page.locator('.save-health-screen').waitFor();
    const textarea=page.getByPlaceholder('저장 데이터 묶음 JSON을 붙여넣으세요.');
    await textarea.fill(JSON.stringify({type:'cheonsu-save-bundle',saves:{current:'{}',manual1:'[]'}}));const before=await raw(page);await page.getByRole('button',{name:'저장 묶음 가져오기',exact:true}).click();assert.equal(await raw(page),before);assert.equal(await page.evaluate(()=>localStorage.getItem('cheonsu_v01_manual_slot_1')),'{}');r.corruptOnlyImportReadOnly=true;
    const good={...seed,gold:9456};await textarea.fill(JSON.stringify({type:'cheonsu-save-bundle',saves:{current:'{}',manual2:JSON.stringify(good)}}));await page.getByRole('button',{name:'저장 묶음 가져오기',exact:true}).click();assert.equal(await raw(page),before);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('cheonsu_v01_manual_slot_2'))),good);r.mixedImportOnlyValidEntry=true;
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.screenshot({path:`${out}/save-safety-${completed}.png`});r.passed=true;
  }catch(e){r.failure={message:e.message,stack:e.stack};await page.screenshot({path:`${out}/failure-${completed}.png`}).catch(()=>{});}
  await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await context.close();console.log(JSON.stringify({completedThrough:completed,passed:r.passed,error:r.failure?.message}));
}
report.finishedAt=new Date().toISOString();report.passed=report.results.every(r=>r.passed)&&report.errors.length===0;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();if(!report.passed)process.exitCode=1;
