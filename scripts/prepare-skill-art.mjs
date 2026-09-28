import fs from 'node:fs/promises';
import sharp from 'sharp';
import { CHARACTER_SKILLS } from '../src/data/skills.js';
import { getCombatMotionSprite } from '../src/data/combatArt.js';
import silhouetteTools from './prepare-painted-sprites.cjs';

const groups = [['hero','bram','lina','aria'], ['leon','sera','noah','yuna'], ['rakan','miho','teo','irene'], ['kaz','ella','jin','luka','baekho']];
const root='docs/art/skills-v1';
// Measure the body, not a sword/staff raised above the head; crouches stay shorter.
const framing={gale:[.25,1],oath:[.29,1],bulwark:[0,.78],bash:[0,.88],ember:[.12,1],snipe:[.22,.73],pierce:[0,.88],charge:[0,.93],shade:[0,.78],opening:[0,.94],chain:[.05,1],moon:[.15,1],purify:[.08,1],crush:[0,.82],rapid:[.03,1],breaker:[.08,.94],ambush:[0,.83],vital:[0,.72],dragon:[.28,1],moonblade:[0,.82],'knight-charge':[0,.85],radiance:[.18,1],'tiger-fist':[0,.88],'tiger-roar':[0,.92],sanctuary:[.32,1]};
await fs.mkdir(root,{recursive:true});
const manifest={};
for(const [index,units] of groups.entries()){
  const name=`skills-${index+1}`;
  if(process.argv.includes('--refs')){
    const layers=[];
    for(const [row,id] of units.entries()){
      const input=await sharp(`public${getCombatMotionSprite(id)}`).resize(460,460).png().toBuffer();
      for(let col=0;col<2;col++)layers.push({input,left:col*512+26,top:row*512+26});
    }
    await sharp({create:{width:1024,height:units.length*512,channels:4,background:'#e8edf0'}}).composite(layers).png().toFile(`${root}/${name}-reference.png`);
    continue;
  }
  const source=`${root}/${name}.png`,meta=await sharp(source).metadata();
  if(!meta.hasAlpha)throw new Error(`Missing alpha: ${source}`);
  const raw=await sharp(source).ensureAlpha().raw().toBuffer();
  const {labels,regions}=silhouetteTools.splitSilhouettes(raw,meta.width,meta.height,units.length*2,units.length,2);
  for(const [row,id] of units.entries()){
    for(let col=0;col<2;col++){
      const slot=row*2+col,parts=regions.filter(region=>region.slot===slot&&region.area>=8);
      if(!parts.some(part=>part.area>1000))throw new Error(`Missing skill: ${id}/${col}`);
      const l=Math.min(...parts.map(part=>part.left)),t=Math.min(...parts.map(part=>part.top));
      const r=Math.max(...parts.map(part=>part.right)),b=Math.max(...parts.map(part=>part.bottom));
      if(l<2||r>=meta.width-2||t<2||b>=meta.height-2)throw new Error(`Clipped skill: ${id}/${col}`);
      const width=r-l+1,height=b-t+1,pixels=Buffer.alloc(width*height*4);
      for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){
        const pos=(t+yy)*meta.width+l+xx,region=regions[labels[pos]];
        if(region?.slot===slot&&region.area>=8)raw.copy(pixels,(yy*width+xx)*4,pos*4,pos*4+4);
      }
      const skill=CHARACTER_SKILLS[id][col];
      const [headOffset,stance]=framing[skill.id]||[0,1];
      const cropped=await sharp(pixels,{raw:{width,height,channels:4}}).resize({height:Math.round(360*stance/(1-headOffset))}).png().toBuffer({resolveWithObject:true});
      const canvasWidth=Math.max(768,cropped.info.width+32),out=`public/art/skills-v1/${id}-${skill.id}.webp`;
      await fs.mkdir('public/art/skills-v1',{recursive:true});
      await sharp({create:{width:canvasWidth,height:768,channels:4,background:'#00000000'}}).composite([{input:cropped.data,left:Math.floor((canvasWidth-cropped.info.width)/2),top:720-cropped.info.height}]).webp({quality:94}).toFile(out);
      manifest[`${id}:${skill.id}`]={src:`/${out.slice(7)}`,width:canvasWidth,height:768,top:720-cropped.info.height,bottom:719,scale:1.5,stance};
    }
  }
}
if(!process.argv.includes('--refs')){
  await fs.writeFile('public/art/skills-v1/manifest.json',JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile('public/art/skills-v1/precache.js',`self.SKILL_ART_FILES = ${JSON.stringify(Object.values(manifest).map(item=>item.src))};\n`);
  console.log(`Prepared ${Object.keys(manifest).length} dedicated skill poses`);
}
