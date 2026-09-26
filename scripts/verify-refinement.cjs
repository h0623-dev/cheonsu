const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const base=process.env.GAME_URL || 'http://127.0.0.1:5176';
const saveKey='cheonsu_v01_save',settingsKey='cheonsu_settings_v1';
const out='tmp/refinement-qa';
const results=[];
async function save(page) {
  await page.locator('.cinematic-stage-actions button').filter({hasText:'설정'}).click();
  await page.locator('.battle-settings-menu button').filter({hasText:'진행 저장'}).click();
  return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);
}
async function restore(page,fixture,settings={}) {
  await page.evaluate(({fixture,settings,saveKey,settingsKey})=>{
    localStorage.setItem(saveKey,JSON.stringify(fixture));
    localStorage.setItem(settingsKey,JSON.stringify({cutsceneMode:'off',soundOn:false,...settings}));
  },{fixture,settings,saveKey,settingsKey});
  await page.reload();
  await page.getByRole('button',{name:'이어하기',exact:true}).click();
  await page.locator('.world-battlefield').waitFor();
}
async function screenshot(page,name) {
  await page.screenshot({path:`${out}/${name}.png`});
}
async function bootstrap(page,stage=1) {
  await page.goto(base);
  await page.getByRole('button',{name:'새 게임',exact:true}).click();
  await page.locator('.campaign-stage-select button').filter({has:page.locator('strong').filter({hasText:new RegExp(`^${stage}장\\.`)})}).click();
  await page.getByRole('button',{name:'전투 시작',exact:true}).click();
  await page.getByRole('button',{name:'바로 전투',exact:true}).click();
  await page.locator('.world-battlefield').waitFor();
  await page.locator('.boss-cutscene').waitFor({state:'hidden'}).catch(()=>{});
  return save(page);
}
async function main() {
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    for(const viewport of (process.argv.includes('--audio') ? [] : [{width:1280,height:900},{width:390,height:844},{width:320,height:568}])) {
      const context=await browser.newContext({viewport,serviceWorkers:'block'});
      const page=await context.newPage();
      const errors=[]; page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(()=>{let seed=0; Math.random=()=>.1+(seed++%1000)*.00001;});
      const fixture=await bootstrap(page);
      console.log(`viewport ${viewport.width}: bootstrapped`);
      assert.equal(await page.getByRole('button',{name:'전투 2배속',exact:true}).getAttribute('aria-pressed'),'true');
      assert.ok(await page.locator('.battle-map-scroll-shell').evaluate(el=>el.classList.contains('map-zoom-large')));
      await screenshot(page,`map-${viewport.width}`);
      const hero=fixture.units.find(u=>u.id==='hero');
      const boss=fixture.units.find(u=>u.type==='boss');
      const guard=fixture.units.find(u=>u.type==='enemy');
      assert.ok(boss && guard);
      const nearby=fixture.selectedStage.map.flatMap((row,y)=>row.flatMap((tile,x)=>tile!=='block' && Math.abs(x-hero.x)+Math.abs(y-hero.y)===1?[{x,y}]:[]))[0];
      Object.assign(boss,nearby,{hp:1,maxHp:100,def:0,range:1});
      Object.assign(hero,{baseAtk:90,atk:90,acted:false,moved:false});
      fixture.units=fixture.units.filter(u=>u.type==='ally' || u.id===boss.id || u.id===guard.id);
      fixture.selectedUnit='hero'; fixture.mode='move'; fixture.turn='ally'; fixture.round=1;
      const hit=structuredClone(fixture);
      hit.units.find(u=>u.id===boss.id).hp=999;
      hit.units.find(u=>u.id===boss.id).maxHp=999;
      await restore(page,hit);
      await page.locator('.cinematic-command-bar .cmd-attack').click();
      await page.locator(`[data-map-x="${nearby.x}"][data-map-y="${nearby.y}"]`).click();
      await page.getByRole('button',{name:'공격 실행',exact:true}).click();
      await page.locator('.vs-preview-modal').waitFor({state:'detached'});
      const after=await save(page);
      assert.equal(after.units.find(u=>u.id==='hero').acted,true);
      assert.equal(after.round,1);
      const targetHP=after.units.find(u=>u.id===boss.id).hp;
      await page.locator('.unit-visual-hero').last().click();
      assert.ok(await page.locator('.cinematic-command-bar .cmd-attack').isDisabled());
      const again=await save(page);
      assert.equal(again.units.find(u=>u.id===boss.id).hp,targetHP);
      await restore(page,after);
      assert.ok(await page.locator('.cinematic-command-bar .cmd-attack').isDisabled());
      for(const [destination,label] of [['next','다음 스테이지'],['shop','상점'],['camp','대기실']]) {
        await restore(page,fixture);
        await page.locator('.cinematic-command-bar .cmd-attack').click();
        await page.locator(`[data-map-x="${nearby.x}"][data-map-y="${nearby.y}"]`).click();
        await page.getByRole('button',{name:'공격 실행',exact:true}).click();
        const dialog=page.locator('.victory-dialog'); await dialog.waitFor();
        assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
        const box=await dialog.boundingBox();
        assert.ok(box.width<=380 && box.height<=viewport.height-24 && box.x>=10 && box.y>=10);
        const footer=await dialog.locator('footer').boundingBox();
        assert.ok(footer.y+footer.height<=viewport.height-10);
        if(destination==='next') await screenshot(page,`victory-${viewport.width}`);
        await dialog.getByRole('button',{name:label,exact:true}).click();
        await page.getByRole('button',{name:'건너뛰기',exact:true}).click();
        if(destination==='next') {
          await page.locator('.deployment-simple-screen').waitFor();
          await page.getByRole('button',{name:'전투 시작',exact:true}).click();
          await page.getByRole('button',{name:'바로 전투',exact:true}).click();
          const next=await save(page);
          assert.equal(next.selectedStage.id,2);
          assert.ok(next.clearedStages.includes(1));
          assert.ok(next.gold>fixture.gold);
        } else {
          await page.locator('.camp-screen').waitFor();
          if(destination==='shop') {
            const shop=page.locator('.town-facility-dialog'); await shop.waitFor();
            await shop.getByRole('button',{name:'시설 닫기',exact:true}).click();
          }
          await page.locator('.camp-header .prominent-save').click();
          const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);
          assert.ok(saved.clearedStages.includes(1));
          assert.equal(saved.clearedStages.filter(id=>id===1).length,1);
          assert.ok(saved.gold>fixture.gold);
          await screenshot(page,`${destination}-${viewport.width}`);
        }
        console.log(`viewport ${viewport.width}: ${destination} passed`);
      }
      assert.deepEqual(errors,[]);
      results.push({viewport,defaultZoom:130,defaultSpeed:2,oneAction:true,bossClear:true,destinations:3,errors});
      await context.close();
    }
    if(results.length) await fs.writeFile(`${out}/ui-report.json`,JSON.stringify(results,null,2));
    const page=await browser.newPage({serviceWorkers:'block'});
    await page.goto(`${base}/tests/fixtures/audio.html`);
    const audio=await page.evaluate(async()=>{
      const {playTone,musicBeat}=await import('/src/engine/audioEngine.js');
      const report={};
      for(const theme of ['battle','camp','world']) {
        const ctx=new OfflineAudioContext(1,44100*16,44100);
        let at=0;
        for(let beat=0;at<15;beat++) {const frame=musicBeat(theme,beat); for(const note of frame.notes) playTone(ctx,{...note,start:at});at+=frame.step;}
        const data=(await ctx.startRendering()).getChannelData(0);
        const rms=[];for(let second=0;second<15;second++) {let sum=0;for(let p=second*44100;p<(second+1)*44100;p++)sum+=data[p]**2;rms.push(Math.sqrt(sum/44100));}
        report[theme]={rms,peak:Math.max(...Array.from({length:160},(_,i)=>Math.max(...data.slice(i*4410,(i+1)*4410))))};
      }
      let captured;
      window.AudioContext=class extends OfflineAudioContext {constructor(){super(1,44100,44100);captured=this;} resume(){return Promise.resolve();}};
      const {playCheonsuSfx}=await import('/src/engine/soundEffects.js');
      for(const type of ['step','slash','arrow','thrust','heavy','fire','ice','lightning','holy','heal','shadow','magic','victory','defeat']) {
        playCheonsuSfx(type,true,1);
        const samples=(await captured.startRendering()).getChannelData(0);
        report[type]={rms:Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length)};
      }
      playCheonsuSfx('slash',true,0);
      return report;
    });
    for(const [type,entry] of Object.entries(audio)) {
      if(Array.isArray(entry.rms)) {assert.ok(entry.rms.every(rms=>rms>.001),`${type}: uninterrupted BGM`);assert.ok(entry.peak<.3);}
      else assert.ok(entry.rms>.001,`${type}: audible signal`);
    }
    results.push({audio});
    await fs.writeFile(`${out}/report.json`,JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
