import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,access } from 'node:fs/promises';
import sharp from 'sharp';
import { parse } from 'espree';
import { runInNewContext } from 'node:vm';
import { CHARACTER_SKILLS,getSkill,getSkillDisplayName,skillDescription,withSkill } from '../src/data/skills.js';
import { DISCOVERY_TECHNIQUES } from '../src/data/discoveries.js';
import { stages } from '../src/data/stages.js';
import { combatUnitIds,getCombatChoreography,getCombatTiming } from '../src/data/combatArt.js';
import { SKILL_DIRECTIONS } from '../src/data/duelChoreography.js';
import { makeAlly } from '../src/engine/partyEngine.js';
import { SFX_PRESETS } from '../src/engine/soundEffects.js';
import manifest from '../public/art/skills-v1/manifest.json' with {type:'json'};

const allSkills=[...Object.entries(CHARACTER_SKILLS).flatMap(([unit,skills])=>skills.map(skill=>[unit,skill])),...Object.values(DISCOVERY_TECHNIQUES).map(skill=>[skill.unitId,skill])];
const sceneFor=(unit,skill)=>({mode:skill?'skill':'attack',attacker:skill?withSkill({id:unit,type:'ally',learnedTechniques:[skill.id]},skill.id):{id:unit},outcome:{hit:true,heal:skill?.type==='heal',guard:skill?.type==='guard'}});

test('34 skills and 4 learned techniques have unique choreography, actor paths and effects',()=>{
  assert.equal(allSkills.length,38);
  const plans=allSkills.map(([unit,skill])=>getCombatChoreography(unit,sceneFor(unit,skill)));
  assert.equal(Object.keys(SKILL_DIRECTIONS).length,38);
  for(const property of ['motion','actor','effects'])assert.equal(new Set(plans.map(plan=>JSON.stringify(plan[property]))).size,38,property);
  for(const [index,plan]of plans.entries()){
    assert.equal(plan.name,allSkills[index][1].name);
    assert.ok(plan.skillPose?.src);
    assert.equal(plan.impact,getCombatTiming(sceneFor(...allSkills[index])).impact);
    assert.equal(plan.contacts.at(-1),plan.impact);
    for(const list of [plan.actor,plan.poses]){
      assert.ok(list.every((point,i)=>point[0]>=0&&point[0]<=1&&(!i||point[0]>list[i-1][0])));
    }
    assert.deepEqual(plan.actor.at(-1),[1,0,0,0]);
    for(const effect of plan.effects){
      assert.ok(effect.at>=0&&effect.at<effect.until&&effect.until<=1);
      assert.ok(effect.size>0&&effect.size<=2);
      assert.ok([...effect.from,...effect.to].every(Number.isFinite));
    }
    assert.ok(plan.cues.every(cue=>cue.at>=0&&cue.at<1&&Object.hasOwn(SFX_PRESETS,cue.sound)));
  }
});

test('stationary martial skills do not suddenly advance during recovery, critical hits retain their sound',()=>{
  const roar=getCombatChoreography('baekho',sceneFor('baekho',CHARACTER_SKILLS.baekho[1]));
  assert.ok(roar.actor.every(([,x])=>x<.35));
  assert.ok(roar.poses.every(([,pose])=>!pose.startsWith('run')));
  const crit=getCombatChoreography('hero',{...sceneFor('hero'),outcome:{hit:true,crit:true}});
  assert.ok(crit.cues.some(cue=>cue.at===crit.impact&&cue.sound==='crit'));
});

test('every weapon has its own basic footwork and every unit can attack and use skills',()=>{
  const weapons=new Map();
  for(const unit of combatUnitIds){
    const basic=getCombatChoreography(unit,sceneFor(unit));
    weapons.set(basic.motion,JSON.stringify(basic.actor));
    assert.equal(basic.impact,.5);assert.equal(basic.skillPose,null);
    assert.ok(basic.effects.length&&basic.poses.some(([,pose])=>pose==='strike'));
    const skillScene={...sceneFor(unit),mode:'skill'};
    const skill=getCombatChoreography(unit,skillScene);
    assert.equal(skill.impact,.62);assert.ok(skill.effects.length);
  }
  assert.equal(weapons.size,11);assert.equal(new Set(weapons.values()).size,11);
});

test('skill art: all 34 unique full-body alpha images are packaged and have clear margins',async()=>{
  assert.equal(Object.keys(manifest).length,34);
  assert.equal(new Set(Object.values(manifest).map(entry=>entry.src)).size,34);
  for(const [key,entry]of Object.entries(manifest)){
    const [unit,id]=key.split(':');
    assert.ok(CHARACTER_SKILLS[unit].some(skill=>skill.id===id));
    const {data,info}=await sharp(`public${entry.src}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.height,entry.height);assert.equal(info.width,entry.width);
    let count=0,left=info.width,right=0,top=info.height,bottom=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>8){count++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    assert.ok(count>5000&&count<info.width*info.height*.65,key);
    assert.ok(left>0&&right<info.width-1&&top>0&&bottom<info.height-1,`${key}: weapon and body not clipped`);
    assert.equal(bottom,719);assert.equal(entry.scale,1.5);
  }
  for(const path of ['public/sw.js','public/service-worker.js'])assert.match(await readFile(path,'utf8'),/self\.SKILL_ART_FILES/);
  await access('docs/art/skills-v1/README.md');
});

test('old skill names migrate without discarding cooldowns, growth, learned skills or equipment',()=>{
  const old={id:'lina',type:'ally',skill:'파이어볼',hp:29,maxHp:30,atk:12,def:4,level:8,exp:72,skillCooldowns:{ember:2,snipe:1},learnedTechniques:['lina-phoenix-flare'],equipment:{weapon:'longbow',armor:'leather'},gearEnhance:{longbow:3},facing:'north'};
  const frozen=structuredClone(old),migrated=makeAlly(old);
  assert.equal(migrated.skill,'불꽃 화살');assert.deepEqual(old,frozen);
  for(const key of ['hp','maxHp','level','exp','skillCooldowns','learnedTechniques','equipment','gearEnhance','facing'])assert.deepEqual(migrated[key],old[key]);
  assert.equal(getSkillDisplayName({...old,activeSkillId:'lina-phoenix-flare'}),'불사조 화살');
  assert.equal(getSkillDisplayName({id:'boss',type:'enemy',skill:'파이어볼'}),'파이어볼');
  for(const stage of stages)for(const unit of stage.units.filter(unit=>unit.type==='ally'))assert.equal(unit.skill,CHARACTER_SKILLS[unit.id][0].name,`stage ${stage.id}/${unit.id}`);
});

test('upgrade UI uses current skill definitions even when saved role fields are obsolete',async()=>{
  const source=await readFile('src/App.jsx','utf8');
  const node=parse(source,{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}).body.find(node=>node.id?.name==='getSkillUpgradeEffectText');
  const display=runInNewContext(`${source.slice(node.start,node.end)};getSkillUpgradeEffectText`,{MAX_SKILL_LEVEL:5,getSkill,skillDescription,getSkillUpgradeLevel:unit=>unit?.skillLevel||0});
  assert.equal(display({id:'ella',type:'ally',skill:'별빛 폭발',skillType:'attack'},2),skillDescription(CHARACTER_SKILLS.ella[0],2));
  assert.equal(display({id:'lina',type:'ally',skill:'파이어볼',skillType:'attack'},3),skillDescription(CHARACTER_SKILLS.lina[0],3));
  assert.equal(display({id:'hero',type:'ally',activeSkillId:'oath',skillType:'attack'},1),skillDescription(CHARACTER_SKILLS.hero[1],1));
});
