import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { combatUnitIds,getCombatChoreography } from '../src/data/combatArt.js';
import { viewports,openDuelFixture,duelProps,renderDuel,seekDuel,assertBodies,assertFit } from './duel-fixture.mjs';

const out='tmp/combat-presentation-qa';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];let cases=0;
try{
  for(const viewport of viewports){
    const page=await openDuelFixture(browser,viewport,errors);
    for(const speed of (viewport.width===390?[1,2,3]:[2])){
      for(const unit of combatUnitIds){
        const enemy=!['hero','bram','lina','aria','leon','sera','noah','yuna','rakan','miho','teo','irene','kaz','ella','jin','luka','baekho'].includes(unit);
        const props=duelProps(unit,null,speed);props.scene.attacker.type=enemy?(unit.startsWith('boss')?'boss':'enemy'):'ally';
        await renderDuel(page,props);const duration=props.scene.durationMs;
        assert.equal(await page.locator('.skill-cut-in').count(),0);
        await assertFit(page,viewport,unit);
        const transforms=[];
        for(const fraction of [.05,.12,.19,.27,.38,.48,.515,.67,.94]){
          await seekDuel(page,fraction,duration);await assertBodies(page,`${unit}/${speed}/${fraction}`);
          transforms.push(await page.locator('.fighter-attacker .fighter-body').evaluate(el=>getComputedStyle(el).transform));
        }
        assert.ok(new Set(transforms).size>=4,`${unit}: anticipation, contact, followthrough`);
        await page.clock.runFor(duration*.48-20);assert.match(await page.locator('.combat-health').last().innerText(),/30 \/ 50/);
        await page.clock.runFor(duration*.035+2);assert.match(await page.locator('.combat-health').last().innerText(),/18 \/ 50/);
        if(speed===2&&['hero','lina','leon','rakan','boss_commander'].includes(unit)){
          await seekDuel(page,.505,duration);await page.screenshot({path:`${out}/${unit}-${viewport.width}.png`});
        }
        if(enemy&&speed===2){
          const skillProps=duelProps(unit,null,speed,{mode:'skill',attacker:props.scene.attacker});
          await renderDuel(page,skillProps);await seekDuel(page,.63,skillProps.scene.durationMs);await assertBodies(page,`${unit}:enemy skill`);
          assert.ok(getCombatChoreography(unit,skillProps.scene).effects.length>0);
        }
        cases++;
      }
    }
    const miss=duelProps('lina',null,2,{outcome:{hit:false,damage:0},defenderPostHp:30});
    await renderDuel(page,miss);await seekDuel(page,.5,miss.scene.durationMs);
    assert.equal(await page.locator('.fighter-defender .fighter-evade').evaluate(el=>+getComputedStyle(el).opacity),1);
    await page.clock.runFor(miss.scene.durationMs*.7);assert.match(await page.locator('.combat-health').last().innerText(),/30 \/ 50/);
    const finish=duelProps('hero',null,2,{finish:true,defenderPostHp:0});
    await renderDuel(page,finish);await seekDuel(page,1,finish.scene.durationMs);
    assert.equal(await page.locator('.fighter-defender .fighter-body').evaluate(el=>+getComputedStyle(el).opacity),0);
    await renderDuel(page,{...duelProps('hero',null,2),shakeEnabled:false});
    assert.equal(await page.locator('.painted-combat-arena').evaluate(el=>el.getAnimations().length),0);
    await seekDuel(page,.5,910);
    const shown=await page.locator('.painted-combat-arena').screenshot();
    await page.locator('.painted-fighter').evaluateAll(actors=>actors.forEach(el=>el.style.visibility='hidden'));
    const hidden=await page.locator('.painted-combat-arena').screenshot();
    const a=await sharp(shown).raw().toBuffer(),b=await sharp(hidden).raw().toBuffer();
    let different=0;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>20)different++;
    assert.ok(different>a.length*.01,'painted actors actually render');
    await page.close();console.log(`PASS basic attacks ${viewport.width}x${viewport.height}: 41 units, weapon motion, enemy skills, miss/finish/HP, pixels`);
  }
  assert.deepEqual(errors,[]);await fs.writeFile(`${out}/result.json`,JSON.stringify({passed:true,cases,errors},null,2));
  console.log(`PASS ${cases} basic scenes`);
}finally{await browser.close();}
