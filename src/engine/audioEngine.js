let context;
export function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return null;
  if (!context || context.state === 'closed') context = new Audio();
  return context;
}

export function playTone(ctx, { freq=440, start=0, duration=.08, type='sine', gain=.035, detune=0 }, destination=ctx.destination) {
  if (!Number.isFinite(gain) || gain <= 0 || ctx.state === 'closed') return null;
  const at=ctx.currentTime+Math.max(0,start), oscillator=ctx.createOscillator(), envelope=ctx.createGain();
  oscillator.type=type;
  oscillator.frequency.setValueAtTime(freq,at);
  oscillator.detune.setValueAtTime(detune,at);
  envelope.gain.setValueAtTime(.0001,at);
  envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,gain),at+.012);
  envelope.gain.exponentialRampToValueAtTime(.0001,at+Math.max(.025,duration));
  oscillator.connect(envelope); envelope.connect(destination);
  oscillator.onended=()=>{ oscillator.disconnect(); envelope.disconnect(); };
  oscillator.start(at); oscillator.stop(at+duration+.03);
  return oscillator;
}

const MELODIES = {
  battle: [0,7,12,10,7,3,5,7,0,7,12,15,14,10,7,5,3,10,15,14,10,7,5,3,5,12,10,7,5,3,2,7],
  camp: [0,4,7,12,11,7,4,2,0,4,9,7,4,2,0,-1,0,7,9,12,14,12,9,7,5,9,12,9,7,4,2,0],
  world: [0,7,9,12,9,7,4,2,0,4,7,9,7,4,2,-3,0,5,9,12,14,12,9,5,4,7,11,14,12,7,4,2],
};
const hz=(semitone)=>196*2**(semitone/12);
export function musicBeat(theme, beat) {
  const melody=MELODIES[theme] || MELODIES.world;
  const index=beat%melody.length, step=theme==='battle' ? .32 : .46;
  const chord=[0,-5,-3,-7][Math.floor(index/8)];
  const notes=[{freq:hz(melody[index]),duration:step*.88,type:'triangle',gain:.018}];
  if(index%2===0) notes.push({freq:hz(chord-12),duration:step*1.75,type:'sine',gain:.024});
  if(index%8===0) [0,7,theme==='battle'?3:4].forEach(interval=>notes.push({freq:hz(chord+interval),duration:step*7.5,type:'sine',gain:.006}));
  if(theme==='battle' && index%4===0) notes.push({freq:62,duration:.07,type:'triangle',gain:.028});
  return {step,notes};
}

export function createMusicPlayer(ctx) {
  let timer=null, bus=null, voices=new Set();
  const stop=()=>{
    if(timer!==null) clearInterval(timer);
    timer=null;
    for(const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } }
    voices.clear();
    if(bus) bus.disconnect();
    bus=null;
  };
  const start=(theme,volume)=>{
    stop();
    if(volume<=0 || ctx.state!=='running') return;
    bus=ctx.createGain(); bus.gain.value=Math.min(1,volume); bus.connect(ctx.destination);
    let beat=0, next=ctx.currentTime+.025;
    const schedule=()=>{
      if(ctx.state!=='running') return;
      if(next<ctx.currentTime-.3) next=ctx.currentTime+.025;
      while(next<ctx.currentTime+.2) {
        const frame=musicBeat(theme,beat++);
        for(const note of frame.notes) {
          const voice=playTone(ctx,{...note,start:next-ctx.currentTime},bus);
          if(voice) { voices.add(voice); voice.addEventListener('ended',()=>voices.delete(voice),{once:true}); }
        }
        next+=frame.step;
      }
    };
    schedule(); timer=setInterval(schedule,100);
  };
  return {start,stop};
}
