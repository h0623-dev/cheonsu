import { getAudioContext, playTone } from './audioEngine.js';

const tone = (freq,duration,gain=.035,start=0,instrument='bell',extra={}) => ({freq,duration,gain,start,instrument,...extra});
const air = (duration,gain,cutoff,start=0) => tone(440,duration,gain,start,'noise',{cutoff});
const notes = (pitches, gap=.08, instrument='bell',gain=.035) => pitches.map((freq,i)=>tone(freq,.22,gain,i*gap,instrument));
export const SFX_PRESETS = {
  step: [air(.07,.023,420),tone(88,.07,.025,.012,'drum',{freqEnd:45})],
  arrow: [air(.16,.024,4800),tone(580,.12,.015,0,'flute',{freqEnd:220}),air(.055,.03,1300,.14)],
  slash: [air(.17,.035,2700),tone(480,.14,.026,.045,'horn',{freqEnd:100})],
  thrust: [air(.09,.022,3800),tone(760,.16,.032,.055,'bell',{freqEnd:300})],
  heavy: [air(.24,.032,950),tone(105,.32,.068,.05,'drum',{freqEnd:36}),tone(240,.16,.018,.07,'horn')],
  impact: [tone(145,.28,.06,0,'drum',{freqEnd:38}),air(.3,.038,1300)],
  claw: [air(.11,.03,3000),air(.15,.026,2300,.08),tone(200,.16,.027,.1,'horn',{freqEnd:60})],
  counter: [air(.12,.025,2800),...notes([620,930],.07,'bell',.03)],
  fire: [air(.5,.037,950),tone(105,.3,.04,0,'drum',{freqEnd:46}),...notes([392,587,784],.085,'horn',.014)],
  ice: [...notes([1175,1760,2349,1568],.055,'bell',.022),air(.19,.014,5000,.03)],
  lightning: [air(.09,.045,7500),air(.18,.038,3600,.1),tone(85,.4,.045,.02,'drum',{freqEnd:30})],
  holy: [...notes([523,659,784,1046],.09,'bell',.027),tone(523,.65,.025,0,'strings')],
  heal: [...notes([440,554,659,880],.1,'harp',.032),tone(440,.7,.018,.12,'flute')],
  magic: [...notes([392,494,587,784],.065,'bell',.028),air(.35,.012,1800)],
  music: [...notes([523,659,784,988,1046],.085,'harp',.03)],
  shadow: [air(.38,.032,680),tone(260,.36,.03,0,'reed',{freqEnd:65}),tone(98,.4,.025,.1,'bass')],
  poison: [air(.24,.02,850),...notes([330,311,247],.075,'reed',.025)],
  guard: [tone(180,.32,.038,0,'horn'),...notes([740,1109],.045,'bell',.027)],
  crit: [air(.18,.04,3200),tone(125,.28,.062,0,'drum',{freqEnd:40}),...notes([784,1175],.065,'bell',.024)],
  miss: [air(.18,.016,2400),tone(480,.16,.008,0,'flute',{freqEnd:240})],
  hazard: [tone(65,.55,.043,0,'bass'),air(.38,.027,950),tone(78,.3,.028,.18,'drum',{freqEnd:38})],
  phase: [tone(98,.8,.03,0,'strings'),tone(116.5,.8,.02,0,'strings'),...notes([196,233,294,392],.12,'horn',.026)],
  boss: [tone(73.4,1.1,.032,0,'strings'),...notes([146.8,174.6,220,293.7],.16,'horn',.035),tone(95,.35,.055,.55,'drum',{freqEnd:34})],
  finish: [air(.22,.03,1500),tone(125,.36,.055,0,'drum',{freqEnd:30}),...notes([392,587,784],.09,'horn',.026)],
  confirm: notes([659,988],.05,'harp',.028),
  menu: [tone(784,.1,.024,0,'harp')],
  save: notes([523,784,1046],.065,'bell',.025),
  equip: [air(.06,.02,3200),...notes([784,1175],.07,'bell',.028)],
  item: notes([659,880],.09,'harp',.03),
  loot: notes([784,988,1175,1568],.07,'bell',.024),
  turn: notes([392,523,659],.09,'horn',.028),
  start: [...notes([196,294,392,494,587],.1,'horn',.033),tone(98,.42,.04,0,'drum',{freqEnd:49})],
  levelup: notes([523,659,784,1046,1319],.105,'bell',.03),
  victory: [...notes([392,392,523,659,784,1046],.15,'horn',.036),tone(261.6,1.1,.023,.55,'strings'),tone(329.6,1.1,.019,.55,'strings')],
  defeat: [...notes([330,294,247,220,164.8],.2,'strings',.03),tone(110,1.1,.026,.4,'bass')],
};
let stepNumber=0;
const active=new Set();
export function stopSoundEffects() {
  for(const voice of active) { try {voice.stop();} catch { /* Already ended. */ } }
  active.clear();
}
export function playCheonsuSfx(type, enabled=true, volume=1) {
  if(typeof document!=='undefined' && document.hidden) return;
  if(!enabled || !Number.isFinite(Number(volume)) || Number(volume)<=0) return;
  const ctx=getAudioContext();
  if(!ctx) return;
  if(ctx.state==='suspended') ctx.resume().catch(()=>{});
  const safeVolume=Math.max(0,Math.min(1,Number(volume)));
  const sequence=SFX_PRESETS[type] || SFX_PRESETS.confirm;
  const footVariation=type==='step' ? (++stepNumber%3-1)*45 : 0;
  for(const note of sequence) {
    const voice=playTone(ctx,{...note,detune:footVariation,gain:note.gain*safeVolume});
    if(voice) {active.add(voice);voice.addEventListener('ended',()=>active.delete(voice),{once:true});}
  }
}
