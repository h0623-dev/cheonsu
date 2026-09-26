const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.GAME_URL || 'http://127.0.0.1:5176';
const out = 'tmp/journey-qa';
const saveKey = 'cheonsu_v01_save';
const sizes = [{width:1280,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390}];
async function imageReady(page) {
  await page.locator('.narrative-actor img').evaluate(async img => { await img.decode(); if (!img.naturalWidth) throw new Error('Missing portrait'); });
}
async function shot(page, name) { await page.screenshot({path:`${out}/${name}.png`}); }
async function noOverflow(page, selector) {
  const errors = await page.locator(selector).evaluateAll(elements => elements.filter(el => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2);
  }).map(el => ({class:el.className,text:el.innerText.slice(0,80),width:el.clientWidth,scroll:el.scrollWidth})));
  assert.deepEqual(errors, [], `Horizontal overflow: ${selector}`);
}
async function saveBattle(page) {
  await page.locator('.cinematic-stage-actions button').filter({hasText:'설정'}).click();
  await page.locator('.battle-settings-menu button').filter({hasText:'진행 저장'}).click();
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
}
async function restoreVictory(page, fixture) {
  const won = structuredClone(fixture);
  won.units = won.units.filter(u => u.type !== 'boss');
  await page.evaluate(({key,won}) => localStorage.setItem(key, JSON.stringify(won)), {key:saveKey,won});
  await page.reload();
  await page.getByRole('button',{name:'이어하기',exact:true}).click();
  await page.locator('.victory-dialog').waitFor();
}
async function main() {
  await fs.mkdir(out,{recursive:true});
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const report = [];
  try {
    for (const viewport of sizes) {
      const context = await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'});
      const page = await context.newPage();
      const errors=[]; page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(() => localStorage.setItem('cheonsu_settings_v1', JSON.stringify({cutsceneMode:'off',soundOn:false})));
      await page.goto(base);
      await page.getByRole('button',{name:'새 게임',exact:true}).click();
      await noOverflow(page,'.campaign-header, .world-progress-card, .world-region-head, .node-body, .world-stage-node');
      await shot(page,`campaign-${viewport.width}`);
      await page.getByRole('button',{name:'제3막',exact:true}).click();
      await page.locator('#campaign-act-3').waitFor();
      await page.locator('.world-stage-node').first().click();
      await noOverflow(page,'.deployment-screen, .deploy-unit-card, .deployment-actions');
      await shot(page,`deployment-${viewport.width}`);
      await page.locator('.deployment-advanced summary').click();
      assert.ok(await page.getByRole('button',{name:'출전 자동 장착',exact:true}).isVisible());
      await noOverflow(page,'.deployment-advanced');
      await page.locator('.deployment-advanced summary').click();
      await page.getByLabel('동료 역할',{exact:true}).selectOption('healer');
      assert.equal(await page.locator('.deploy-unit-card').count(),1);
      await page.getByLabel('동료 역할',{exact:true}).selectOption('all');
      const aria=page.locator('.deploy-unit-card.unit-visual-aria');
      await aria.click(); assert.equal(await aria.getAttribute('aria-pressed'),'false');
      await aria.click(); assert.equal(await aria.getAttribute('aria-pressed'),'true');
      await page.getByRole('button',{name:'전투 시작',exact:true}).click();
      await imageReady(page);
      await noOverflow(page,'.narrative-stage, .narrative-header, .narrative-line, .narrative-dialogue');
      const actor=await page.locator('.narrative-actor img').boundingBox();
      assert.ok(actor.width>60 && actor.height>60,'Speaker must be visible');
      const footer=await page.locator('.narrative-dialogue footer').boundingBox();
      assert.ok(footer.y>=0 && footer.y+footer.height<=viewport.height-8,'Dialogue controls stay in viewport');
      await shot(page,`story-${viewport.width}`);
      const first=await page.locator('.narrative-line').innerText();
      await page.locator('.narrative-stage').focus(); await page.keyboard.press('ArrowRight');
      assert.notEqual(await page.locator('.narrative-line').innerText(),first);
      await page.getByRole('button',{name:'이전 대사',exact:true}).click();
      assert.equal(await page.locator('.narrative-line').innerText(),first);
      await page.getByRole('button',{name:'다음',exact:true}).click();
      await page.getByRole('button',{name:'대화 기록',exact:true}).click();
      assert.equal(await page.locator('.narrative-history').evaluate(el=>el.matches(':modal')),true);
      assert.equal(await page.locator('.narrative-history li').count(),2);
      await shot(page,`history-${viewport.width}`);
      await page.keyboard.press('Escape');
      await page.locator('.narrative-history').waitFor({state:'detached'});
      await page.getByRole('button',{name:'바로 전투',exact:true}).click();
      await page.locator('.world-battlefield').waitFor();
      const fixture=await saveBattle(page);
      await shot(page,`battle-${viewport.width}`);
      const hero=fixture.units.find(u=>u.id==='hero');
      const heroBox=await page.locator(`[data-map-x="${hero.x}"][data-map-y="${hero.y}"]`).boundingBox();
      assert.ok(heroBox.y>100 && heroBox.y<viewport.height-120,'Opening focus is on the selected ally');
      for(const [destination,label] of [['camp','대기실'],['shop','상점'],['next','다음 스테이지']]) {
        await restoreVictory(page,fixture);
        await page.locator('.victory-dialog').getByRole('button',{name:label,exact:true}).click();
        await imageReady(page);
        assert.ok(await page.locator('.story-clear').isVisible());
        if(destination==='camp') {
          await shot(page,`clear-${viewport.width}`);
          while(await page.getByRole('button',{name:'다음',exact:true}).count()) await page.getByRole('button',{name:'다음',exact:true}).click();
          await page.getByRole('button',{name:'계속',exact:true}).click();
          await page.locator('.camp-screen').waitFor();
          await page.locator('.camp-management > summary').click();
          await noOverflow(page,'.camp-screen, .camp-tab-row, .camp-character, .camp-travel-actions');
          await shot(page,`camp-${viewport.width}`);
          const growth=page.getByRole('tab',{name:'성장',exact:true});
          await growth.click(); assert.equal(await growth.getAttribute('aria-selected'),'true');
          await growth.focus(); await page.keyboard.press('ArrowRight');
          assert.equal(await page.getByRole('tab',{name:'장비',exact:true}).getAttribute('aria-selected'),'true');
          await page.getByRole('tab',{name:'관리',exact:true}).click();
          await page.locator('.camp-header .prominent-save').click();
          const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);
          assert.equal(saved.clearedStages.filter(id=>id===1).length,1);
          assert.ok(saved.gold>fixture.gold);
          await page.locator('.camp-travel-actions .camp-next').click();
          assert.ok((await page.locator('.deployment-screen h1').innerText()).startsWith('2장.'));
        } else {
          await page.getByRole('button',{name:'건너뛰기',exact:true}).click();
          await page.locator(destination==='shop'?'.town-facility-dialog':'.deployment-screen').waitFor();
        }
      }
      assert.deepEqual(errors,[]);
      report.push({viewport,spread:true,storyActor:true,dialogueHistory:true,keyboard:true,clearDestinations:3,saveCompatible:true,errors});
      console.log(`journey ${viewport.width}x${viewport.height}: passed`);
      await context.close();
    }
    await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
