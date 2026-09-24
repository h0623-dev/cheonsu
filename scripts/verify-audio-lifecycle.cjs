const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      const NativeAudio=window.AudioContext;
      window.audioTest={created:0,active:0};
      window.AudioContext=class extends NativeAudio {
        createOscillator(){const node=super.createOscillator();window.audioTest.created++;window.audioTest.active++;node.addEventListener('ended',()=>window.audioTest.active--);return node;}
      };
      localStorage.setItem('cheonsu_settings_v1',JSON.stringify({soundOn:true,musicOn:true,sfxVolume:80,cutsceneMode:'off',effectsOn:false}));
    });
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5176');
    await page.getByRole('button',{name:'새 게임',exact:true}).click();
    await page.locator('.campaign-stage-select button').filter({has:page.locator('strong').filter({hasText:/^1장\./})}).click();
    await page.getByRole('button',{name:'전투 시작',exact:true}).click();
    await page.getByRole('button',{name:'바로 전투',exact:true}).click();
    await page.locator('.world-battlefield').waitFor();
    await page.waitForTimeout(2500);
    const count=()=>page.evaluate(()=>({...window.audioTest}));
    const first=await count();await page.waitForTimeout(1200);const playing=await count();
    assert.ok(playing.created>first.created,'BGM keeps scheduling past the entry cue');
    await page.locator('.cinematic-stage-actions button').filter({hasText:'설정'}).click();
    const music=page.locator('.battle-settings-menu button').filter({has:page.locator('span',{hasText:/^음악$/})});
    await music.click();await page.waitForTimeout(400);const off=await count();await page.waitForTimeout(1000);
    assert.deepEqual(await count(),off,'Music OFF stops its timer and every scheduled voice');
    assert.equal(off.active,0);
    await music.click();await page.waitForTimeout(1000);assert.ok((await count()).created>off.created,'Music ON resumes once');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForTimeout(300);const hidden=await count();await page.waitForTimeout(700);assert.deepEqual(await count(),hidden);assert.equal(hidden.active,0);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForTimeout(900);assert.ok((await count()).created>hidden.created);
    await page.locator('.battle-settings-menu button').filter({hasText:'전체 사운드'}).click();
    await page.waitForTimeout(400);const muted=await count();await page.waitForTimeout(700);assert.deepEqual(await count(),muted);assert.equal(muted.active,0);
    assert.deepEqual(errors,[]);
    await fs.mkdir('tmp/refinement-qa',{recursive:true});
    await fs.writeFile('tmp/refinement-qa/audio-lifecycle.json',JSON.stringify({playing,off,hidden,muted,errors},null,2));
    console.log('PASS: gesture unlock, continuous BGM, music off/on, hidden/visible, master mute, no audio errors');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
