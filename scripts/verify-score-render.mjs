import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Offline rendering exercises the same Web Audio instruments without microphone/speaker access.
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  const page = await browser.newPage({serviceWorkers:'block'});
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5176');
  const report = await page.evaluate(async () => {
    const {MUSIC_TRACKS,MUSIC_LOOP_STEPS,musicBeat} = await import('/src/data/musicScore.js');
    const {playTone} = await import('/src/engine/audioEngine.js');
    const {SFX_PRESETS} = await import('/src/engine/soundEffects.js');
    const results = [];
    const analyze = (buffer,from=0,to=buffer.length) => {
      const data=buffer.getChannelData(0); let peak=0,sum=0,finite=true;
      for(let i=from;i<to;i++) {peak=Math.max(peak,Math.abs(data[i]));sum+=data[i]*data[i];finite &&= Number.isFinite(data[i]);}
      return {peak,rms:Math.sqrt(sum/(to-from)),finite};
    };
    for(const [id,track] of Object.entries(MUSIC_TRACKS)) {
      const step=30/track.bpm, length=step*MUSIC_LOOP_STEPS;
      const ctx=new OfflineAudioContext(2,Math.ceil((length+2)*22050),22050);
      for(let beat=0;beat<MUSIC_LOOP_STEPS;beat++) for(const note of musicBeat(id,beat).notes) playTone(ctx,{...note,start:beat*step+(note.start||0)});
      const buffer=await ctx.startRendering();
      results.push({kind:'music',id,length,...analyze(buffer),sections:Array.from({length:4},(_,i)=>analyze(buffer,Math.floor(length*22050*i/4),Math.floor(length*22050*(i+1)/4)))});
    }
    for(const [id,notes] of Object.entries(SFX_PRESETS)) {
      const ctx=new OfflineAudioContext(2,22050*3,22050);
      for(const note of notes) playTone(ctx,note);
      const buffer=await ctx.startRendering();
      results.push({kind:'effect',id,...analyze(buffer)});
    }
    return results;
  });
  for(const result of report) {
    assert.ok(result.finite && result.peak>.005 && result.peak<.95,JSON.stringify(result));
    if(result.sections) assert.ok(result.sections.every(s=>s.finite && s.rms>.001 && s.peak<.95),JSON.stringify(result));
  }
  await fs.mkdir('tmp/sound-map-qa',{recursive:true});
  await fs.writeFile('tmp/sound-map-qa/audio-render.json',JSON.stringify(report,null,2));
  console.log(`PASS ${report.filter(r=>r.kind==='music').length} full scores and ${report.filter(r=>r.kind==='effect').length} effects: finite audible PCM, no clipping, all four musical sections non-silent`);
} finally {await browser.close();}
