const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
async function main() {
  const { getCombatMotionSprite } = await import('../src/data/combatArt.js');
  const world=JSON.parse(await fs.readFile(path.join(root,'public/art/world-v2/manifest.json'),'utf8'));
  const enemies=JSON.parse(await fs.readFile(path.join(root,'public/art/enemies-v3/manifest.json'),'utf8'));
  const bosses=JSON.parse(await fs.readFile(path.join(root,'public/art/bosses-v1/manifest.json'),'utf8'));
  const sources={...Object.fromEntries(Object.entries(world.units).filter(([id])=>!enemies.units[id]).map(([id,u])=>[id,u.sprite])),...Object.fromEntries(Object.entries({...enemies.units,...bosses.units}).map(([id,u])=>[id,u.ready]))};
  const out=path.join(root,'public/art/map-sprites-v4');
  await fs.mkdir(out,{recursive:true});
  const report={};
  for(const [id,src] of Object.entries(sources)) {
    const {data,info}=await sharp(path.join(root,'public',src)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let left=info.width,right=0,top=info.height,bottom=0;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>64) {
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    const visibleHeight=id==='wolf'?250:400, crop={left,top,width:right-left+1,height:bottom-top+1};
    const resized=await sharp(path.join(root,'public',src)).extract(crop).resize({height:visibleHeight}).png().toBuffer({resolveWithObject:true});
    const width=Math.max(384,resized.info.width+24);
    const asset=path.join(out,`${id}.webp`);
    await sharp({create:{width,height:480,channels:4,background:'#00000000'}})
      .composite([{input:resized.data,left:Math.floor((width-resized.info.width)/2),top:448-visibleHeight}]).webp({lossless:true}).toFile(asset);
    const combat=await sharp(path.join(root,'public',getCombatMotionSprite(id,'recover'))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let combatTop=combat.info.height,combatBottom=0;
    for(let p=0;p<combat.info.width*combat.info.height;p++) if(combat.data[p*4+3]>64) {combatTop=Math.min(combatTop,Math.floor(p/combat.info.width));combatBottom=Math.max(combatBottom,Math.floor(p/combat.info.width));}
    report[id]={source:src,canvas:[width,480],visibleHeight,foot:447,combatScale:Number(((id==='wolf'?230:360)/(combatBottom-combatTop+1)).toFixed(4))};
  }
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');
  await fs.writeFile(path.join(out,'precache.js'),`self.MAP_SPRITE_FILES = ${JSON.stringify(Object.keys(report).map(id=>`/art/map-sprites-v4/${id}.webp`))};\n`);
  console.log(`Normalized ${Object.keys(report).length} map sprites: 400px visible height / 448px foot anchor`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
