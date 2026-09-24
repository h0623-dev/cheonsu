const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { splitSilhouettes } = require('./prepare-painted-sprites.cjs');
const root = path.resolve(__dirname, '..');
const keys = ['boss_commander','boss_frost','boss_ember','boss_oracle','boss_abyss'];
const columns = ['ready','run-a','run-b','windup','strike','recoil'];

async function main() {
  const source = path.join(root,'docs/art/bosses-v1/source.png');
  const out = path.join(root,'public/art/bosses-v1');
  await fs.mkdir(out,{recursive:true});
  const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==1374 || info.height!==1145) throw new Error('Reviewed source dimensions changed');
  const {labels,regions}=splitSilhouettes(data,info.width,info.height,30,5,6);
  const owners=new Int16Array(labels.length).fill(-1);
  // Reviewed contacts: windup frames touch vertically; two spell tips touch recoil cloaks.
  for(let p=0;p<labels.length;p++) {
    const r=regions[labels[p]];
    if(!r || r.area<4) continue;
    const x=p%info.width,y=Math.floor(p/info.width);
    let slot=r.slot;
    if(r.slot===9) slot=y<226?3:y<450?9:15;
    if(r.slot===9 && y>423 && y<450 && data[p*4]>data[p*4+2]*1.25) slot=15;
    if(r.slot===22) slot=x<(y<790?1223:1190)?22:23;
    if(r.slot===28) slot=x<(y<1055?1211:1170)?28:29;
    owners[p]=slot;
  }
  const sprites=[];
  for(let slot=0;slot<30;slot++) {
    let left=info.width,top=info.height,right=-1,bottom=-1,count=0;
    for(let p=0;p<owners.length;p++) if(owners[p]===slot) {
      const x=p%info.width,y=Math.floor(p/info.width);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;
    }
    if(count<5000) throw new Error(`Missing boss pose ${slot}`);
    const width=right-left+1,height=bottom-top+1,pixels=Buffer.alloc(width*height*4);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const p=(y+top)*info.width+x+left;
      if(owners[p]===slot) data.copy(pixels,(y*width+x)*4,p*4,p*4+4);
    }
    const isolated=splitSilhouettes(pixels,width,height,1,1,1);
    for(let p=0;p<width*height;p++) if((isolated.regions[isolated.labels[p]]?.area || 0)<900) pixels[p*4+3]=0;
    sprites.push({pixels,width,height});
  }
  const manifest={units:{}};
  const previews=[];
  for(let row=0;row<5;row++) {
    const id=keys[row], frames=sprites.slice(row*6,row*6+6);
    const scale=Math.min(436/Math.max(...frames.map(f=>f.height)),476/Math.max(...frames.map(f=>f.width)));
    const paths={};
    for(let col=0;col<6;col++) {
      const frame=frames[col], width=Math.round(frame.width*scale),height=Math.round(frame.height*scale);
      const input=await sharp(frame.pixels,{raw:{width:frame.width,height:frame.height,channels:4}}).resize(width,height).png().toBuffer();
      const asset=`${id}-${columns[col]}.webp`;
      await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}})
        .composite([{input,left:Math.floor((512-width)/2),top:480-height}]).webp({lossless:true}).toFile(path.join(out,asset));
      paths[columns[col]]=`/art/bosses-v1/${asset}`;
      previews.push({input:await sharp(path.join(out,asset)).resize(192,192).png().toBuffer(),left:col*192,top:row*192});
    }
    const ready=frames[0];
    const faceWidth=Math.min(ready.width,Math.round(ready.height*.65));
    const portrait=`${id}-portrait.webp`;
    await sharp(ready.pixels,{raw:{width:ready.width,height:ready.height,channels:4}})
      .extract({left:Math.floor((ready.width-faceWidth)/2),top:0,width:faceWidth,height:Math.round(ready.height*.6)})
      .resize(256,256,{fit:'contain',background:'#00000000'}).webp({lossless:true}).toFile(path.join(out,portrait));
    manifest.units[id]={ready:paths.ready,map:`/art/map-sprites-v4/${id}.webp`,portrait:`/art/bosses-v1/${portrait}`,motion:{...Object.fromEntries(columns.slice(1).map(p=>[p,paths[p]])),recover:paths.ready}};
  }
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const files=Object.values(manifest.units).flatMap(u=>[u.portrait,u.ready,...Object.values(u.motion)]);
  await fs.writeFile(path.join(out,'precache.js'),`self.BOSS_ART_FILES = ${JSON.stringify([...new Set(files)])};\n`);
  await fs.mkdir(path.join(root,'tmp/boss-art-qa'),{recursive:true});
  await sharp({create:{width:1152,height:960,channels:4,background:'#66746b'}}).composite(previews).png().toFile(path.join(root,'tmp/boss-art-qa/poses.png'));
  console.log('5 bosses: 30 poses, 5 portraits');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
