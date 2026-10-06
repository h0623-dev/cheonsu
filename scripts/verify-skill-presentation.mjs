import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { qaBrowserOptions } from './qa-browser.mjs';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { CHARACTER_SKILLS, withSkill } from '../src/data/skills.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { DISCOVERY_TECHNIQUES } from '../src/data/discoveries.js';
import { getCombatChoreography } from '../src/data/combatArt.js';
import { viewports,openDuelFixture,duelProps,renderDuel,seekDuel,assertBodies,assertFit } from './duel-fixture.mjs';

const out='tmp/skill-presentation-qa';
await fs.mkdir(out,{recursive:true});
const entries=[...Object.entries(CHARACTER_SKILLS).flatMap(([unit,skills])=>skills.map(skill=>[unit,skill])),...Object.values(DISCOVERY_TECHNIQUES).map(skill=>[skill.unitId,skill]),
  ...Object.entries(ADVANCED_CLASSES).flatMap(([unit,forms])=>forms.map(form=>[unit,form.skill,form.id]))];
const browser=await chromium.launch(qaBrowserOptions());
const errors=[];let cases=0;
try {
  for(const viewport of viewports){
    const page=await openDuelFixture(browser,viewport,errors);
    for(const speed of (viewport.width===390?[1,2,3]:[2])){
      for(const [unit,skill,formId] of entries){
        const props=duelProps(unit,skill,speed),duration=props.scene.durationMs;
        if(formId){
          props.scene.attacker=withSkill({...props.scene.attacker,advancedClass:formId},skill.id);
          props.attackerKey=formId;
          if(skill.type==='guard') props.defenderKey=formId;
        }
        await renderDuel(page,props);
        const plan=getCombatChoreography(formId||unit,props.scene);
        assert.equal(await page.locator('.painted-combat').getAttribute('data-motion'),plan.motion);
        assert.equal(await page.locator('.painted-combat-heading h2').innerText(),skill.name);
        assert.equal(await page.locator('.skill-cut-in strong').innerText(),skill.name);
        assert.equal(await page.locator('.fighter-skill').getAttribute('src'),plan.skillPose.src);
        assert.equal(await page.locator('.painted-fighter').count(),skill.type==='guard'?1:2);
        await assertFit(page,viewport,skill.id);
        for(const fraction of [.12,.24,.39,.51,.625,.74,.92]){
          await seekDuel(page,fraction,duration);await assertBodies(page,`${unit}:${skill.id}/${speed}/${fraction}`);
        }
        await seekDuel(page,.12,duration);
        assert.equal(await page.locator('.skill-cut-in').evaluate(el=>+getComputedStyle(el).opacity),1);
        assert.ok(await page.locator('.skill-cut-in strong').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.skill-cut-in').getBoundingClientRect();return a.right<=b.right&&a.bottom<=b.bottom;}));
        await seekDuel(page,.635,duration);
        assert.ok(await page.locator('.duel-effect').evaluateAll(elements=>elements.some(el=>+getComputedStyle(el).opacity>.05)),`${skill.id}: visible contact effect`);
        const health=page.locator('.combat-health').last();
        await page.clock.runFor(duration*.60-20);assert.match(await health.innerText(),skill.type==='guard'?/42 \/ 50/:/30 \/ 50/);
        await page.clock.runFor(duration*.035+2);assert.match(await health.innerText(),skill.type==='attack'?/18 \/ 50/:/42 \/ 50/);
        if(speed===2&&(viewport.width===390||['gale','ember','ice-lance','sanctuary'].includes(skill.id))){
          await seekDuel(page,.64,duration);await page.screenshot({path:`${out}/${unit}-${skill.id}-${viewport.width}.png`});
        }
        if(skill.id==='ember'&&speed===2){
          await seekDuel(page,.55,duration);
          const shown=await page.locator('.painted-combat-arena').screenshot();
          await page.locator('.duel-effects').evaluate(el=>el.style.visibility='hidden');
          const hidden=await page.locator('.painted-combat-arena').screenshot();
          const a=await sharp(shown).raw().toBuffer(),b=await sharp(hidden).raw().toBuffer();
          assert.ok(a.some((value,i)=>Math.abs(value-b[i])>30),'projectile actually renders');
        }
        cases++;
      }
    }
    const missed=duelProps('teo',CHARACTER_SKILLS.teo[0],2,{outcome:{hit:false,damage:0},defenderPostHp:30});
    await renderDuel(page,missed);
    for(const fraction of [.46,.55,.64]){
      await seekDuel(page,fraction,missed.scene.durationMs);
      assert.ok(await page.locator('.effect-impact').evaluateAll(elements=>elements.every(el=>getComputedStyle(el).visibility==='hidden')),'missed multi-hit arrows never show contact sparks');
    }
    await page.clock.runFor(missed.scene.durationMs*.7);
    assert.match(await page.locator('.combat-health').last().innerText(),/30 \/ 50/);
    for(const reduced of [false,true]){
      await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
      await renderDuel(page,{...duelProps('lina',CHARACTER_SKILLS.lina[0]),effectsEnabled:reduced});
      assert.equal(await page.locator('.duel-effects').evaluate(el=>getComputedStyle(el).display),'none');
      assert.equal(await page.locator('.fighter-attacker').evaluate(el=>el.getAnimations().length),0);
      await assertBodies(page,'reduced/off');
    }
    await page.evaluate(()=>window.renderDuelFixture(null));
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0,'unmount cancels all animations');
    await page.close();console.log(`PASS ${viewport.width}x${viewport.height}: ${entries.length}개 기본·비전·최상위 기술, 자세·이펙트·HP·동작 줄이기`);
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${out}/result.json`,JSON.stringify({passed:true,cases,skills:entries.length,errors},null,2));
  console.log(`PASS ${cases} skill scenes`);
}finally{await browser.close();}
