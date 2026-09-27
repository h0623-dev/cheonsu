import { musicBeat } from '../data/musicScore.js';
export { musicBeat } from '../data/musicScore.js';

let context;
export function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return null;
  if (!context || context.state === 'closed') context = new Audio();
  return context;
}

const caches = new WeakMap();
function audioResources(ctx) {
  if (!caches.has(ctx)) caches.set(ctx, { waves: new Map(), noise: null });
  return caches.get(ctx);
}
const harmonics = {
  flute: [1,.06,.21,.04,.04], reed: [1,.08,.38,.06,.16,.03,.08],
  strings: [1,.38,.22,.14,.09,.065,.04], horn: [1,.55,.32,.15,.08,.03],
  harp: [1,.35,.17,.08,.03], bell: [1,.03,.32,.04,.15,.03,.08], bass: [1,.17,.04],
};
function waveFor(ctx, instrument) {
  const cache = audioResources(ctx);
  if (!cache.waves.has(instrument)) {
    const partials = harmonics[instrument];
    cache.waves.set(instrument,ctx.createPeriodicWave(new Float32Array(partials.length+1),new Float32Array([0,...partials])));
  }
  return cache.waves.get(instrument);
}
function noiseFor(ctx) {
  const cache = audioResources(ctx);
  if (!cache.noise) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 74291;
    for(let i=0;i<data.length;i++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; data[i]=seed/2147483648-1; }
    cache.noise = buffer;
  }
  return cache.noise;
}

export function playTone(ctx, { freq=440, freqEnd, start=0, duration=.08, type='sine', gain=.035, detune=0, instrument, pan=0, cutoff=1600 }, destination=ctx.destination) {
  if (!Number.isFinite(gain) || gain <= 0 || ctx.state === 'closed' || !Number.isFinite(duration) || duration <= 0) return null;
  const at=ctx.currentTime+Math.max(0,start), length=Math.max(.03,duration);
  const source=instrument==='noise' ? ctx.createBufferSource() : ctx.createOscillator();
  const envelope=ctx.createGain(), nodes=[envelope];
  if(instrument==='noise') {
    source.buffer=noiseFor(ctx); source.loop=true;
  } else {
    if(harmonics[instrument]) source.setPeriodicWave(waveFor(ctx,instrument));
    else source.type=instrument==='drum' ? 'sine' : type;
    source.frequency.setValueAtTime(Math.max(20,freq),at);
    if(freqEnd) source.frequency.exponentialRampToValueAtTime(Math.max(20,freqEnd),at+length*.9);
    source.detune.setValueAtTime(detune,at);
    if(['strings','flute','reed'].includes(instrument)) {
      for(let n=1;n<=8;n++) source.detune.linearRampToValueAtTime(detune+Math.sin(n*2.3)*5,at+length*n/8);
    }
  }
  const attack = Math.min(length*.22, instrument==='strings' ? .1 : instrument==='horn' ? .035 : .006);
  const release = Math.min(length*.32, instrument==='strings' ? .22 : .08);
  envelope.gain.setValueAtTime(.0001,at);
  envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,Math.min(.25,gain)),at+attack);
  if(['harp','bell','drum','noise'].includes(instrument)) {
    envelope.gain.exponentialRampToValueAtTime(.0001,at+length);
  } else {
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,gain*.67),at+Math.max(attack,length-release));
    envelope.gain.exponentialRampToValueAtTime(.0001,at+length);
  }
  if(instrument==='noise') {
    const filter=ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=cutoff;
    source.connect(filter); filter.connect(envelope); nodes.push(filter);
  } else source.connect(envelope);
  if(ctx.createStereoPanner && pan) {
    const panner=ctx.createStereoPanner(); panner.pan.value=pan; envelope.connect(panner); panner.connect(destination); nodes.push(panner);
  } else envelope.connect(destination);
  source.onended=()=>{ source.disconnect(); for(const node of nodes) node.disconnect(); };
  source.start(at); source.stop(at+length+.025);
  return source;
}

export function createMusicPlayer(ctx) {
  let timer=null, bus=null, compressor=null;
  const voices=new Set();
  const stop=()=>{
    if(timer!==null) clearInterval(timer);
    timer=null;
    const oldBus=bus, oldCompressor=compressor;
    if(oldBus) {
      oldBus.gain.cancelScheduledValues(ctx.currentTime);
      oldBus.gain.setTargetAtTime(.0001,ctx.currentTime,.01);
    }
    for(const voice of voices) { try { voice.stop(ctx.currentTime+.05); } catch { /* Already ended. */ } }
    voices.clear(); bus=null; compressor=null;
    if(oldBus) setTimeout(()=>{oldBus.disconnect();oldCompressor?.disconnect();},80);
  };
  const start=(theme,volume)=>{
    stop();
    if(!Number.isFinite(volume) || volume<=0 || ctx.state!=='running') return;
    bus=ctx.createGain(); bus.gain.setValueAtTime(.0001,ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(Math.min(1,volume),ctx.currentTime+.18);
    compressor=ctx.createDynamicsCompressor();
    compressor.threshold.value=-16; compressor.knee.value=10; compressor.ratio.value=3;
    bus.connect(compressor); compressor.connect(ctx.destination);
    let beat=0, next=ctx.currentTime+.025;
    const schedule=()=>{
      if(ctx.state!=='running') return;
      if(next<ctx.currentTime-.3) next=ctx.currentTime+.025;
      while(next<ctx.currentTime+.2) {
        const frame=musicBeat(theme,beat++);
        for(const note of frame.notes) {
          const voice=playTone(ctx,{...note,start:next-ctx.currentTime+(note.start||0)},bus);
          if(voice) { voices.add(voice); voice.addEventListener('ended',()=>voices.delete(voice),{once:true}); }
        }
        next+=frame.step;
      }
    };
    schedule(); timer=setInterval(schedule,100);
  };
  return {start,stop};
}
