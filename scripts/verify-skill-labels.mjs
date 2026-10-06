import { qaBrowserOptions } from './qa-browser.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CHARACTER_SKILLS } from '../src/data/skills.js';

const browser=await chromium.launch(qaBrowserOptions());
try{
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('cheonsu_auto_patch','false'));
    await page.goto(process.env.GAME_URL||'http://127.0.0.1:5176');
    await page.getByRole('button',{name:'새 게임',exact:true}).click();
    await page.locator('.campaign-header .prominent-save').click();
    await page.evaluate(ids=>{
      const data=JSON.parse(localStorage.getItem('cheonsu_v01_save'));
      data.party=ids.map(id=>({...data.party[0],id,name:id,skill:'파이어볼',skillType:'attack',skillLevel:2,skillCooldowns:{ember:2,snipe:1},learnedTechniques:id==='lina'?['lina-phoenix-flare']:[]}));
      data.screen='camp';data.clearedStages=[1];data.gold=10000;
      localStorage.setItem('cheonsu_v01_save',JSON.stringify(data));
    },Object.keys(CHARACTER_SKILLS));
    await page.reload();await page.getByRole('button',{name:'이어하기',exact:true}).click();
    await page.locator('.town-hub').waitFor();
    await page.getByRole('button',{name:'훈련소으로 이동',exact:true}).click();
    await page.getByRole('button',{name:'스킬 강화',exact:true}).click();
    const card=page.locator('.skill-upgrade-card');await card.waitFor();
    assert.equal(await card.locator('.skill-upgrade-entry').count(),Object.keys(CHARACTER_SKILLS).length);
    for(const [id,skills] of Object.entries(CHARACTER_SKILLS)){
      const row=card.locator('.skill-upgrade-entry').filter({has:page.locator('.skill-upgrade-head strong',{hasText:`${id} ·`})});
      assert.ok((await row.innerText()).includes(skills[0].name));
      if(skills[0].type==='heal')assert.match(await row.innerText(),/회복 스킬/);
    }
    assert.ok(!(await card.innerText()).includes('파이어볼'));
    await fs.mkdir('tmp/skill-labels-qa',{recursive:true});
    await page.screenshot({path:`tmp/skill-labels-qa/upgrade-${viewport.width}.png`});
    assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${viewport.width}: ${Object.keys(CHARACTER_SKILLS).length}명 스킬 문구·강화 설명·역할 분류`);
  }
}finally{await browser.close();}
