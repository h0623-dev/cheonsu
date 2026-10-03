import { getBattlefieldPlan } from './battlefieldPlans.js';

// Original themes: eight-bar statements and answers, a quieter bridge, then a full reprise.
export const MUSIC_TRACKS = {
  title: { title: '돌아올 아침', bpm: 68, root: 60, lead: 'piano', calm: true, major: true, chords: [0,5,3,4,2,5,1,4], melody: [4,7,9,7,4,2,1,0,2,4,5,4,2,1,0,null], answer: [7,6,5,4,2,4,1,0,3,5,7,6,4,2,1,0] },
  camp: { title: '정원의 작은 춤', bpm: 78, root: 65, lead: 'flute', calm: true, major: true, chords: [0,2,3,0,5,1,4,0], melody: [2,4,7,null,6,5,4,null,3,5,4,2,1,2,0,null], answer: [7,9,7,4,5,7,5,2,4,3,2,1,4,2,0,null] },
  world: { title: '봄빛 원정길', bpm: 84, root: 60, lead: 'flute', calm: true, major: true, chords: [0,3,2,5,1,4,3,4], melody: [0,2,4,7,6,4,5,null,4,2,3,5,4,2,1,0], answer: [4,5,7,9,7,5,4,null,2,3,5,7,5,4,2,0] },
  frontier: { title: '국경을 여는 군기', bpm: 108, root: 55, lead: 'horn', chords: [0,5,3,4,0,2,5,4], melody: [0,null,4,7,6,4,2,null,3,null,5,7,4,2,1,0], answer: [7,7,9,7,6,null,4,2,5,7,6,4,3,2,1,0] },
  forest: { title: '잿빛 숲의 추격', bpm: 116, root: 57, lead: 'strings', chords: [0,3,5,4,0,6,3,4], melody: [4,2,0,2,3,5,4,null,6,5,3,4,2,1,0,null], answer: [7,6,4,5,7,9,7,null,5,4,2,3,4,2,1,0] },
  fortress: { title: '성벽을 울리는 북', bpm: 104, root: 50, lead: 'horn', chords: [0,0,5,4,3,5,1,4], melody: [0,0,4,null,5,4,2,0,3,3,6,null,7,6,4,2], answer: [7,null,9,7,6,4,2,null,5,null,7,6,4,2,1,0] },
  snow: { title: '설원의 맹세', bpm: 94, root: 62, lead: 'cello', chords: [0,5,3,4,2,5,1,4], melody: [0,null,2,4,7,null,6,4,5,4,2,3,2,1,0,null], answer: [7,null,9,7,5,4,2,null,6,7,5,4,2,1,0,null] },
  citadel: { title: '왕좌로 향하는 행군', bpm: 110, root: 53, lead: 'horn', chords: [0,1,5,4,3,6,1,4], melody: [0,1,4,null,3,2,1,0,5,6,7,null,6,4,2,1], answer: [7,9,8,7,6,4,5,null,4,3,2,1,4,2,1,0] },
  boss: { title: '천둥 아래의 결전', bpm: 126, root: 50, lead: 'horn', chords: [0,5,6,4,3,1,5,4], melody: [0,0,7,6,4,3,2,1,5,5,9,7,6,4,2,0], answer: [7,9,11,9,7,6,4,2,5,7,9,7,6,4,1,0] },
  finale: { title: '모두의 이름으로', bpm: 112, root: 55, lead: 'horn', major: true, chords: [0,3,5,4,2,5,1,4], melody: [4,7,9,7,4,2,1,0,5,7,9,11,9,7,6,4], answer: [7,9,11,14,11,9,7,null,9,7,6,5,4,2,1,0] },
};
export const MUSIC_LOOP_STEPS = 256;
export function getMusicTheme(screen, stageId = 1) {
  if (screen === 'title' || screen === 'menu') return { id: 'title', variant: 0 };
  if (screen === 'camp') return { id: 'camp', variant: 0 };
  if (['campaign', 'deploy', 'deployment'].includes(screen)) return { id: 'world', variant: 0 };
  if (screen !== 'battle') return null;
  return { id: stageId === 30 ? 'finale' : stageId % 6 === 0 ? 'boss' : getBattlefieldPlan(stageId).biome, variant: (stageId - 1) % 3 };
}
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
const degreePitch = (degree, major) => {
  const scale = major ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,11];
  return scale[((degree % 7) + 7) % 7] + Math.floor(degree / 7) * 12;
};
export function musicBeat(theme, beat) {
  const requested = typeof theme === 'string' ? (theme === 'battle' ? 'frontier' : theme) : theme?.id;
  const id = MUSIC_TRACKS[requested] ? requested : 'title', track = MUSIC_TRACKS[id];
  const variant = typeof theme === 'object' ? Math.abs(Math.trunc(theme?.variant || 0)) % 3 : 0;
  const tick = ((beat % MUSIC_LOOP_STEPS) + MUSIC_LOOP_STEPS) % MUSIC_LOOP_STEPS;
  const section = Math.floor(tick / 64), bar = Math.floor(tick / 8), within = tick % 8;
  const step = 30 / track.bpm, root = track.root + [0,2,-2][variant];
  const chord = track.chords[bar % 8], notes = [], calm = track.calm;
  const intensity = [0.78, 0.94, 0.57, 1][section];
  const add = (degree, duration, instrument, gain, pan = 0, delay = 0) => notes.push({ freq: hz(root + degreePitch(degree, track.major)), duration: duration * step, instrument, gain: gain * intensity, pan, start: delay * step });
  const phrase = section === 1 || section === 2 ? track.answer : track.melody;
  if (within % 2 === 0) {
    const degree = phrase[(Math.floor(tick / 2) + Math.floor(bar / 4) * 4) % phrase.length];
    if (degree !== null) {
      const lift = section === 3 ? 7 : section === 2 ? -7 : 0;
      add(degree + lift, within === 6 ? 2.85 : 1.75, section === 2 ? 'cello' : track.lead, calm ? .040 : .044, -.16);
      if (section === 3 && !calm) add(degree, 1.6, 'strings', .019, .24);
    }
  }
  if (within === 0) {
    for (const [i, interval] of [0,2,4].entries()) add(chord + interval - 7, 7.65, 'strings', calm ? .012 : .017, [-.52, 0, .52][i]);
    add(chord - 14, 3.7, 'cello', calm ? .023 : .034, .1);
    if (!calm && section === 3) for (const interval of [0,4]) add(chord + interval, 7.4, 'choir', .012, .3);
  }
  if (within === 4) add(chord - 10, 3.6, 'cello', calm ? .018 : .028, .1);
  if (calm) {
    if (id === 'title') {
      add(chord + [-7,0,2,4,0,2,4,7][within], 1.65, 'piano', .018, .18);
      if (section === 1 && within === 2) add(chord + 7, 4.8, 'flute', .014, -.3);
    } else if (id === 'camp') {
      // A lilting 3+3+2 accompaniment against the sustained four-beat melody.
      if ([0,3,6].includes(within)) for (const interval of [0,2,4]) add(chord + interval - (within === 0 ? 7 : 0), 1.5, 'harp', .015, .22, interval * .04);
    } else add(chord + [0,4,2,4,7,4,2,4][within], 1.25, 'harp', .016, within % 2 ? .3 : -.3);
    if (section === 3 && within === 6) add(chord + 9, 1.9, 'flute', .017, -.28);
  } else {
    const ostinato = id === 'forest' ? [0,4,2,4,0,5,2,4] : id === 'citadel' ? [0,1,4,1,0,4,2,4] : [0,0,4,0,2,2,4,2];
    if (section !== 2 || within % 2 === 0) add(chord + ostinato[(within + variant * 2) % 8] - 7, .8, 'strings', .021, -.3);
    if (within === 0 || within === 4 || (section === 3 && [3,7].includes(within))) {
      add(chord - 14, 1.55, 'timpani', .06);
      notes.push({ freq: 90, freqEnd: 38, duration: .29, instrument: 'drum', gain: .055 * intensity });
    }
    if ([2,6].includes(within) && section !== 2) notes.push({ freq: 180, duration: .13, instrument: 'noise', cutoff: 2800, gain: .025 * intensity, pan: .25 });
    if (section === 3 && bar % 4 === 0 && within === 0) notes.push({ freq: 440, duration: 1.25, instrument: 'noise', cutoff: 6200, gain: .017, pan: .4 });
    if ((id === 'boss' || id === 'finale') && within === 7) for (const delay of [0,.32,.64]) add(chord - 14, .45, 'timpani', .026, -.1, delay);
  }
  return { step, notes, section, track: id };
}
