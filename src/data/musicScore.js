import { getBattlefieldPlan } from './battlefieldPlans.js';

// Original 32-bar arrangements: four sections, separate melody, harmony and rhythm.
export const MUSIC_TRACKS = {
  world: { title: '여명의 길', bpm: 88, root: 55, lead: 'flute', major: true, chords: [0,5,3,4,0,3,1,4], melody: [0,2,4,7,6,4,2,null,3,4,6,5,4,2,1,0] },
  camp: { title: '별빛 아래의 쉼', bpm: 72, root: 60, lead: 'harp', major: true, chords: [0,3,5,4,1,3,4,0], melody: [4,null,2,0,1,2,4,null,5,4,2,null,3,2,1,0] },
  frontier: { title: '국경의 깃발', bpm: 112, root: 55, lead: 'horn', chords: [0,5,2,6,3,0,5,4], melody: [0,2,4,2,7,null,6,4,3,4,6,7,4,2,1,0] },
  forest: { title: '숲의 속삭임', bpm: 96, root: 57, lead: 'reed', chords: [0,3,6,4,5,2,3,4], melody: [4,3,2,null,0,2,3,6,5,null,4,2,1,2,0,null] },
  fortress: { title: '성벽을 넘어', bpm: 120, root: 50, lead: 'horn', chords: [0,0,5,6,3,5,4,4], melody: [0,0,4,5,4,2,0,null,3,3,6,7,6,4,2,1] },
  snow: { title: '눈 속의 서약', bpm: 84, root: 62, lead: 'bell', chords: [0,5,3,6,0,2,5,4], melody: [7,null,6,4,2,null,3,4,6,5,4,null,2,1,0,null] },
  citadel: { title: '황혼의 회랑', bpm: 104, root: 53, lead: 'strings', chords: [0,1,5,4,0,6,3,4], melody: [0,1,4,3,2,1,0,null,5,4,3,1,2,4,1,0] },
  boss: { title: '지휘관의 결의', bpm: 128, root: 50, lead: 'horn', chords: [0,5,6,4,3,1,5,4], melody: [0,4,7,6,4,3,2,1,5,7,9,7,6,4,2,0] },
  finale: { title: '천수의 마지막 빛', bpm: 116, root: 55, lead: 'strings', chords: [0,3,5,4,6,3,1,4], melody: [0,2,4,7,9,7,6,null,5,6,7,9,11,9,7,4] },
};
export const MUSIC_LOOP_STEPS = 256;
export function getMusicTheme(screen, stageId = 1) {
  if (screen !== 'battle') return { id: screen === 'camp' ? 'camp' : 'world', variant: 0 };
  return { id: stageId === 30 ? 'finale' : stageId % 6 === 0 ? 'boss' : getBattlefieldPlan(stageId).biome, variant: (stageId-1)%3 };
}
const hz = midi => 440 * 2 ** ((midi-69)/12);
const degreePitch = (degree, major) => {
  const scale = major ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,10];
  return scale[((degree%7)+7)%7] + Math.floor(degree/7)*12;
};

export function musicBeat(theme, beat) {
  const id = typeof theme === 'string' ? (theme === 'battle' ? 'frontier' : theme) : theme?.id;
  const track = MUSIC_TRACKS[id] || MUSIC_TRACKS.world;
  const variant = typeof theme === 'object' ? theme.variant || 0 : 0;
  const tick = ((beat % MUSIC_LOOP_STEPS)+MUSIC_LOOP_STEPS)%MUSIC_LOOP_STEPS;
  const section = Math.floor(tick/64), bar = Math.floor(tick/8), within = tick%8;
  const step = 30/track.bpm, calm = id === 'world' || id === 'camp';
  const root = track.root + [0,2,-2][variant%3];
  const chord = track.chords[bar%8], notes = [];
  const add = (degree, duration, instrument, gain, pan=0, delay=0) => notes.push({ freq: hz(root+degreePitch(degree,track.major)), duration: duration*step, instrument, gain, pan, start: delay*step });
  // A / response / quiet bridge / full reprise, with breaths and an ending cadence.
  if (within%2===0) {
    const index = (Math.floor(tick/2)+(section===1 ? 4 : 0))%16;
    const degree = track.melody[index];
    if (degree !== null && !(section===2 && within===6)) {
      const phraseLift = section===3 ? 7 : section===2 ? -2 : 0;
      add(degree+phraseLift, within===6 ? 2.9 : 1.7, track.lead, calm ? .033 : .031, -.12);
      if (section===3 && !calm) add(degree+phraseLift-7,1.8,'strings',.01,.16);
    }
  }
  if (within===0) {
    for (const [index,interval] of [0,2,4].entries()) add(chord+interval-7,7.4,'strings',.009,[-.45,0,.45][index]);
    add(chord-14,3.7,'bass',.04);
  }
  if (within===4) add(chord-10,3.6,'bass',.029);
  if (section!==2 || within%2===0) add(chord+[0,4,2,4][within%4],.85, id==='snow'?'bell':'harp',.011,within%2 ? .32 : -.32);
  if (section===1 && within===6) add(chord+6,1.8,'flute',.014,.25);
  if (!calm && section!==2) {
    if (within===0 || within===4 || (section===3 && within===7)) notes.push({freq:96,freqEnd:42,duration:.2,instrument:'drum',gain:.052});
    if (within===2 || within===6) notes.push({freq:180,duration:.13,instrument:'noise',cutoff:1800,gain:.023,pan:.1});
    if (within%2===1) notes.push({freq:440,duration:.04,instrument:'noise',cutoff:6500,gain:.006,pan:-.2});
  } else if (id==='camp' && within===4) notes.push({freq:110,duration:.045,instrument:'noise',cutoff:650,gain:.009});
  return { step, notes, section, track: id };
}
