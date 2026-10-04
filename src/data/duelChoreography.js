import { getSkill } from './skills.js';
import skillArt from '../../public/art/skills-v1/manifest.json' with { type: 'json' };

// One timeline drives the actor, projectiles, contact, health and audio. Extra strikes are visual only.
const fx = (shape, at, until, options = {}) => ({shape, at, until, from:[1,0], to:[1,0], size:1, color:'#ffe2a6', angle:0, ...options});
const arrow = (at, hit, color='#e5d4a3', options={}) => fx('arrow',at,hit,{from:[.15,-.01],to:[1,0],size:.65,color,sound:'arrow',...options});
const cut = (at, angle=0, color='#d8f5f0', options={}) => fx('slash',at,at+.16,{angle,color,...options});
const spark = (at, color='#ffdf92', options={}) => fx('impact',at,at+.13,{color,size:.65,...options});
const ward = (at,color,options={}) => fx('shield',at,.89,{from:[0,0],to:[0,-.04],size:1.1,color,...options});
const ray = (at,color,options={}) => fx('rays',at,.87,{color,size:1.2,...options});
const bolt = (at,x=1,options={}) => fx('lightning',at,at+.13,{from:[x,-.34],to:[x,0],size:1.35,color:'#c8f4ff',...options});

export const SKILL_DIRECTIONS = {
  gale: {motion:'rising-cut', effects:[cut(.57,-38,'#b9f3db',{size:1.5}),cut(.62,-18,'#f0ffe6'),spark(.62)]},
  oath: {motion:'sword-oath', effects:[fx('blade',.32,.77,{from:[0,.12],to:[0,-.23],color:'#ffecac',size:.9}),ward(.56,'#ffdf87')]},
  bulwark: {motion:'kneel-guard', effects:[ward(.37,'#acd9ef',{size:1.25}),fx('plates',.58,.88,{from:[0,.1],to:[0,0],color:'#bfdae3'})]},
  bash: {motion:'shield-ram', effects:[fx('shield',.50,.69,{from:[.7,0],to:[1,0],color:'#d2ecff',size:.85}),spark(.62),fx('debris',.62,.85,{color:'#c5c0a7'})]},
  ember: {motion:'flame-bow', effects:[fx('embers',.23,.53,{from:[.2,0],to:[.2,-.08],color:'#ffc277',size:.55}),arrow(.44,.62,'#ff9a4c',{variant:'flame'}),fx('flame',.62,.84,{color:'#ffb364',size:1.1})]},
  snipe: {motion:'kneel-snipe', effects:[fx('sight',.26,.54,{color:'#e5f6cd',size:.5}),arrow(.55,.62,'#eaffd0',{size:.85}),spark(.62,'#eaffe0',{size:.44})]},
  light: {motion:'gentle-blessing', effects:[fx('motes',.28,.66,{from:[0,-.05],to:[1,0],color:'#fff0b5'}),ray(.57,'#fff4c1',{size:.8})]},
  sanctuary: {motion:'staff-prayer', effects:[ray(.34,'#f9ecc8',{from:[0,.1],to:[0,-.15],size:1.4}),fx('feathers',.52,.94,{color:'#e6ffe2',size:1.5})]},
  pierce: {motion:'long-thrust', effects:[fx('lance',.48,.64,{from:[.45,0],to:[1.13,0],color:'#f5e8bc',size:1.4}),spark(.62,'#fff4d2')]},
  charge: {motion:'spear-charge', effects:[fx('wind',.32,.63,{from:[.1,.12],to:[.82,.12],color:'#d3e7e2',size:1.15}),fx('lance',.53,.67,{from:[.68,0],to:[1.15,0],color:'#f1d698',size:1.25}),spark(.62)]},
  shade: {motion:'cross-dash', contacts:[.50,.62], effects:[cut(.49,-35,'#c3b5e9'),cut(.61,38,'#e2c9ed'),fx('echo',.34,.61,{from:[.12,0],to:[.72,0],size:1}),spark(.62,'#ddd4ff')]},
  opening: {motion:'feint-cut', effects:[cut(.43,65,'#9faaa6',{from:[.66,0],to:[.7,.01],size:.45}),cut(.61,-8,'#ffe7bb'),fx('plates',.62,.82,{color:'#d1ba9c',variant:'break'})]},
  chain: {motion:'sky-command', contacts:[.46,.54,.62], effects:[bolt(.46,.82),bolt(.54,1.1),bolt(.62,1),fx('chain',.46,.76,{color:'#b2e5ff',size:1.6})]},
  ward: {motion:'book-wall', effects:[fx('runes',.28,.69,{from:[0,0],to:[.15,0],color:'#a9dcfa',size:.6}),ward(.51,'#90e8ee',{size:1.3,variant:'hex'})]},
  moon: {motion:'moon-invocation', effects:[fx('moon',.28,.65,{from:[.2,-.27],to:[.95,-.19],color:'#e2e6ff',size:.7}),fx('motes',.48,.91,{from:[1,-.2],to:[1,.08],color:'#c9dbfa'})]},
  purify: {motion:'purifying-palm', effects:[fx('petals',.38,.90,{from:[0,0],to:[1,-.06],color:'#ffd5e2'}),fx('cross',.61,.87,{color:'#fff3ed',size:.7})]},
  crush: {motion:'axe-slam', effects:[cut(.54,83,'#ffc98a',{size:1.35}),fx('cracks',.61,.92,{from:[1,.2],to:[1,.2],color:'#e9b37d',size:1.45}),fx('debris',.62,.88,{color:'#ceaf87',size:1.2})]},
  roar: {motion:'defiant-roar', effects:[fx('pressure',.41,.73,{from:[0,0],to:[0,-.03],color:'#efc489',size:1.4}),ward(.62,'#e1c49c',{size:1,variant:'crest'})]},
  foxfire: {motion:'fox-flick', contacts:[.52,.57,.62], effects:[...[-.1,0,.1].map((y,i)=>fx('flame',.33+i*.05,.54+i*.05,{from:[.08,y],to:[1,0],color:i===1?'#aee8e5':'#ffb37e',size:.6,bend:-.12+i*.08})),fx('flame',.62,.83,{color:'#ffcea4'})]},
  illusion: {motion:'illusion-turn', effects:[fx('echo',.28,.57,{from:[-.1,0],to:[.25,0],size:1}),fx('echo',.32,.59,{from:[.3,0],to:[.7,0],size:.85}),fx('shards',.53,.84,{color:'#dcb2e9',size:1.3,variant:'collapse'}),spark(.62,'#f5d2ff')]},
  rapid: {motion:'triple-release', contacts:[.44,.53,.62], effects:[arrow(.31,.44,'#e3ecca',{to:[1,-.04]}),arrow(.40,.53,'#e3ecca',{to:[1,.025]}),arrow(.49,.62,'#e3ecca'),spark(.44),spark(.53),spark(.62)]},
  breaker: {motion:'piercing-draw', effects:[fx('wind',.30,.54,{from:[.12,0],to:[.2,0],color:'#d2f0d9',size:.5}),arrow(.50,.64,'#cfffe2',{to:[1.3,0],size:.9}),fx('plates',.62,.82,{color:'#cabca2',variant:'break'})]},
  'ice-lance': {motion:'ice-point', effects:[fx('ice',.32,.52,{from:[.17,-.05],to:[.25,-.05],size:.65,color:'#b5eaff'}),fx('ice',.50,.65,{from:[.25,-.05],to:[1,0],size:1.3,color:'#b5eaff'}),fx('shards',.62,.84,{color:'#c6f3ff'})]},
  'frost-wave': {motion:'frost-sweep', effects:[fx('frost',.39,.78,{from:[0,.16],to:[1.1,.12],color:'#bbdfff',size:1.7}),fx('icicles',.59,.88,{color:'#c6efff',size:1.2})]},
  ambush: {motion:'assassin-leap', contacts:[.53,.62], effects:[fx('echo',.33,.62,{from:[.1,-.08],to:[.8,-.14],size:1}),cut(.52,-35,'#acb5d3'),cut(.61,35,'#d4cfe9')]},
  vital: {motion:'low-stab', effects:[fx('sight',.33,.56,{size:.36,color:'#faccc2'}),fx('lance',.56,.67,{from:[.77,.02],to:[1.03,0],color:'#ffd4ce',size:.75}),spark(.62,'#fff0dd',{size:.4})]},
  melody: {motion:'soft-plucking', effects:[fx('notes',.25,.85,{from:[0,.02],to:[1,-.14],color:'#bde8d3',size:1.2}),ray(.61,'#e2ffe2',{size:.7})]},
  resonance: {motion:'forceful-strum', contacts:[.52,.62], effects:[fx('soundwave',.37,.57,{from:[.1,0],to:[1,0],color:'#ffd5dd',size:1.1}),fx('soundwave',.47,.67,{from:[.1,0],to:[1,0],color:'#d1e4ff',size:1.45}),spark(.62,'#ffe1ef')]},
  dragon: {motion:'flaming-rise', effects:[cut(.54,-54,'#ffbd68',{size:1.65}),fx('dragon',.54,.86,{color:'#ffbe76',size:1.65}),fx('embers',.62,.92,{color:'#ffce98'})]},
  moonblade: {motion:'crescent-sweep', effects:[fx('crescent',.47,.69,{from:[.35,0],to:[1.12,0],color:'#d6e7ff',size:1.5}),fx('shards',.62,.87,{color:'#e4efff',size:.75})]},
  'knight-charge': {motion:'shielded-charge', effects:[fx('wind',.35,.62,{from:[.08,.1],to:[.78,.1],color:'#c8e4d3'}),cut(.60,5,'#eef4c7',{size:1.2}),spark(.62)]},
  radiance: {motion:'knight-aegis', effects:[fx('cross',.30,.67,{from:[0,-.12],to:[0,-.16],color:'#fff1b0',size:.8}),ward(.55,'#e4ebae',{size:1.5,variant:'wing'})]},
  'tiger-fist': {motion:'fist-combo', contacts:[.43,.51,.62], effects:[spark(.43,'#f4dbab',{size:.5}),spark(.51,'#f4dbab',{size:.65}),fx('fist',.56,.75,{from:[.65,0],to:[1.12,0],color:'#fff1c6',size:1.1}),spark(.62)]},
  'tiger-roar': {motion:'palm-roar', effects:[fx('tiger',.42,.80,{from:[.1,0],to:[1.05,0],color:'#ffdfb3',size:1.65}),fx('pressure',.62,.88,{color:'#ffead0',size:1.5})]},
  'hero-dawn-slash': {motion:'dawn-judgment', pose:'gale', effects:[ray(.31,'#ffeeb0',{from:[.6,-.12],to:[.8,0]}),cut(.56,-72,'#ffe5a1',{size:1.8}),fx('blade',.60,.85,{color:'#fff4ce',size:1.55})]},
  'lina-phoenix-flare': {motion:'phoenix-release', pose:'ember', effects:[arrow(.40,.62,'#ffb66e',{bend:-.3,variant:'flame'}),fx('phoenix',.54,.86,{color:'#ffd084',size:1.7}),fx('embers',.62,.94,{color:'#ffbc7a'})]},
  'aria-sanctuary-song': {motion:'sanctuary-hymn', pose:'sanctuary', effects:[fx('feathers',.32,.88,{color:'#f4f6df',size:1.5}),fx('notes',.40,.93,{from:[0,0],to:[1,-.06],color:'#daf4ca'}),ray(.60,'#fbffe2')]},
  'bram-oath-wall': {motion:'oath-rampart', pose:'bulwark', effects:[ward(.35,'#f1d89d',{size:1.2}),fx('plates',.51,.92,{from:[-.25,0],to:[.2,0],color:'#dbe5d9',size:1.65}),ray(.62,'#f2e3bd',{from:[0,0],to:[0,0],size:.7})]},
};

// Offsets use a fraction of the melee reach, height in body percent and a restrained lean.
const motions={
  'rising-cut': [[.20,0,0,-2],[.37,.72,0,-3],[.56,.93,-7,-4],[.62,1,-3,3],[.69,1,0,2]],
  'sword-oath': [[.22,0,0,0],[.39,0,1,-1],[.60,0,-2,0],[.72,0,0,0]],
  'kneel-guard': [[.25,0,0,0],[.40,-.03,0,-2],[.61,0,0,1],[.77,0,0,0]],
  'shield-ram': [[.22,-.08,0,-3],[.45,.45,0,-3],[.60,1.07,0,3],[.66,1.07,0,3],[.73,.91,0,0]],
  'flame-bow': [[.23,0,0,-2],[.42,-.02,0,-3],[.47,.035,0,2],[.56,0,0,0],[.72,0,0,0]],
  'kneel-snipe': [[.23,0,0,0],[.37,0,0,-1],[.55,0,0,-1],[.59,-.035,0,1],[.72,0,0,0]],
  'gentle-blessing': [[.22,0,0,-1],[.40,.03,-1,0],[.60,.045,0,1],[.76,0,0,0]],
  'staff-prayer': [[.20,0,0,0],[.37,0,-2,-2],[.53,0,-3,0],[.68,0,-2,1],[.78,0,0,0]],
  'long-thrust': [[.26,.35,0,0],[.45,.65,0,-2],[.59,1.01,0,2],[.66,1.01,0,2],[.73,.84,0,0]],
  'spear-charge': [[.23,-.04,0,-2],[.34,.2,-3,0],[.47,.64,-2,2],[.60,1.14,0,3],[.68,1.08,0,1]],
  'cross-dash': [[.25,0,0,-2],[.43,.87,-2,1],[.50,1,0,3],[.55,.89,0,-2],[.62,1.09,0,2],[.72,.96,0,0]],
  'feint-cut': [[.25,.12,0,0],[.40,.7,0,1],[.49,.52,0,-3],[.60,1.07,0,2],[.69,1.01,0,0]],
  'sky-command': [[.22,0,0,0],[.38,0,-2,-2],[.46,0,-3,2],[.54,0,-2,-1],[.62,0,-2,2],[.75,0,0,0]],
  'book-wall': [[.20,0,0,-1],[.34,-.02,0,-2],[.50,.035,0,2],[.67,.035,0,0],[.76,0,0,0]],
  'moon-invocation': [[.23,0,0,0],[.38,0,-3,-2],[.54,.02,-4,0],[.69,0,-2,1],[.79,0,0,0]],
  'purifying-palm': [[.24,0,0,-2],[.42,-.025,0,-1],[.58,.05,0,2],[.67,.03,0,1],[.76,0,0,0]],
  'axe-slam': [[.23,.14,0,0],[.41,.75,-6,-3],[.53,.9,-8,-4],[.62,1,0,4],[.69,1,0,3]],
  'defiant-roar': [[.22,0,0,0],[.36,-.02,1,-2],[.48,0,-2,-2],[.61,.03,-1,1],[.74,0,0,0]],
  'fox-flick': [[.24,0,0,-2],[.34,.035,-1,1],[.45,.015,0,-1],[.53,.04,-1,2],[.65,0,0,0]],
  'illusion-turn': [[.20,0,0,-2],[.37,-.05,-3,-3],[.52,.045,-3,3],[.65,0,-1,0],[.78,0,0,0]],
  'triple-release': [[.25,0,0,-2],[.32,-.025,0,2],[.38,0,0,-2],[.41,-.025,0,2],[.47,0,0,-2],[.50,-.03,0,2],[.62,0,0,0]],
  'piercing-draw': [[.23,0,0,0],[.40,-.05,0,-3],[.51,-.05,0,-3],[.55,.03,0,3],[.64,-.015,0,-1],[.73,0,0,0]],
  'ice-point': [[.22,0,0,-1],[.36,-.015,0,-3],[.50,.045,-1,2],[.63,.03,0,1],[.76,0,0,0]],
  'frost-sweep': [[.20,0,0,0],[.34,-.035,0,-3],[.45,.035,0,3],[.62,.07,0,2],[.78,0,0,0]],
  'assassin-leap': [[.23,.1,0,-2],[.37,.58,-17,-2],[.50,1.01,-7,3],[.57,.9,-3,-2],[.62,1.08,0,3],[.73,.95,0,0]],
  'low-stab': [[.24,.12,0,0],[.43,.62,0,-3],[.56,.74,0,-2],[.62,1.12,0,3],[.70,1.02,0,0]],
  'soft-plucking': [[.21,0,0,-1],[.34,0,0,1],[.47,0,-1,-1],[.60,0,0,1],[.75,0,0,0]],
  'forceful-strum': [[.22,0,0,-2],[.36,-.025,0,-3],[.42,.04,0,2],[.50,-.01,0,-2],[.56,.065,0,3],[.71,0,0,0]],
  'flaming-rise': [[.22,.15,0,-1],[.43,.69,0,-4],[.56,.97,-11,-3],[.62,1.03,-5,3],[.72,1,0,2]],
  'crescent-sweep': [[.23,.12,0,0],[.40,.66,0,-3],[.49,.9,0,3],[.62,1,0,4],[.72,.96,0,0]],
  'shielded-charge': [[.23,0,0,-2],[.37,.34,-2,1],[.51,.77,0,1],[.62,1.09,0,3],[.70,1,0,1]],
  'knight-aegis': [[.21,0,0,0],[.38,-.02,0,-2],[.54,.02,-1,0],[.66,.02,0,1],[.78,0,0,0]],
  'fist-combo': [[.23,.2,0,0],[.38,.89,0,-2],[.43,1.04,0,2],[.48,.91,0,-2],[.51,1.06,0,2],[.57,.89,0,-3],[.62,1.14,0,4],[.73,1,0,0]],
  'palm-roar': [[.22,.1,0,0],[.38,-.03,1,-3],[.48,.075,0,1],[.62,.14,0,3],[.73,.03,0,0]],
  'dawn-judgment': [[.22,.08,0,-1],[.40,.7,-5,-3],[.56,1,-9,-2],[.62,1.06,0,4],[.72,1.02,0,1]],
  'phoenix-release': [[.21,0,0,-1],[.36,0,-2,-4],[.42,.04,-3,1],[.54,-.02,0,-1],[.71,0,0,0]],
  'sanctuary-hymn': [[.21,0,0,0],[.36,0,-2,-1],[.50,.01,-4,1],[.65,0,-3,0],[.79,0,0,0]],
  'oath-rampart': [[.22,0,0,0],[.40,-.04,0,-2],[.55,.015,0,1],[.70,.015,0,1],[.81,0,0,0]],
};

export function getWeaponMotion(key,presentation){
  if(presentation.style==='cast')return 'cast';
  if(presentation.style==='ranged')return key==='siege_gunner'?'cannon':'bow';
  if(key==='void_knight'||key==='boss_abyss')return 'slash';
  if(key==='beast_tamer')return 'whip';
  return {thrust:'thrust',heavy:'heavy',guard:'guard',shadow:'quick',claw:'beast',impact:'fist'}[presentation.effect]||'slash';
}

const enemySkills={boss_commander:'crush',boss_frost:'frost-wave',boss_ember:'dragon',boss_oracle:'chain',boss_abyss:'illusion',
  raider:'gale',ranger:'snipe',sniper:'breaker',marauder:'crush',assassin_elite:'ambush',iron_lancer:'pierce',plague_doctor:'illusion',beast_tamer:'shade',storm_mage:'chain',blade_dancer:'shade',siege_gunner:'crush',sentinel:'bash',blackguard:'knight-charge',warlord:'charge',pyromancer:'foxfire',frost_mage:'ice-lance',cultist:'illusion',void_knight:'moonblade',wolf:'ambush',
  'kobold-hunter':'snipe','lizard-spearman':'pierce','horned-ogre':'crush',
  'harpy-scout':'ambush','skeleton-warrior':'crush','rock-spirit':'tiger-fist'};

const basicMotions = {
  slash: [[.10,0,0,0],[.18,.25,-1,1],[.26,.51,0,0],[.34,.76,-1,-1],[.43,.81,0,-3],[.50,1,0,3],[.55,1,0,2],[.67,.9,0,0]],
  thrust: [[.10,0,0,0],[.18,.24,-1,0],[.26,.50,0,1],[.34,.69,0,0],[.43,.76,0,-2],[.50,1.07,0,2],[.55,1.07,0,2],[.67,.81,0,0]],
  heavy: [[.10,0,0,0],[.18,.22,0,1],[.26,.45,-1,0],[.34,.71,-3,-2],[.43,.84,-6,-4],[.50,1,0,4],[.58,1,0,3],[.69,.9,0,1]],
  guard: [[.10,0,0,0],[.18,.24,-1,1],[.26,.49,0,0],[.34,.75,0,-1],[.43,.84,0,-2],[.50,1.06,0,3],[.56,1.06,0,2],[.67,.91,0,0]],
  quick: [[.10,0,0,0],[.18,.31,-2,-1],[.26,.61,0,1],[.34,.87,-1,0],[.43,.79,0,-3],[.50,1.1,-1,3],[.55,1.1,0,2],[.65,.83,0,0]],
  beast: [[.10,0,0,0],[.18,.24,-3,-1],[.26,.48,0,1],[.34,.7,-4,-2],[.43,.83,-10,-3],[.50,1.06,-3,3],[.56,1.06,0,1],[.67,.88,0,0]],
  whip: [[.10,0,0,0],[.18,.23,-1,0],[.26,.44,0,1],[.34,.65,0,-2],[.43,.72,0,-4],[.50,.94,0,4],[.55,.96,0,2],[.67,.85,0,0]],
  fist: [[.10,0,0,0],[.18,.28,-1,0],[.26,.54,0,1],[.34,.8,0,-1],[.43,.85,0,-2],[.50,1.14,0,3],[.55,1.14,0,1],[.67,.86,0,0]],
  bow: [[.19,0,0,-1],[.34,-.025,0,-3],[.36,-.025,0,-3],[.40,.02,0,2],[.50,-.015,0,-1],[.64,0,0,0]],
  cannon: [[.19,0,0,0],[.31,0,0,-1],[.35,0,0,-1],[.40,-.08,0,-4],[.50,-.04,0,-2],[.64,0,0,0]],
  cast: [[.19,0,0,-1],[.28,0,-1,-2],[.34,.015,-2,-1],[.43,.035,-1,2],[.50,.02,0,1],[.64,0,0,0]],
};

export function getDuelPlan(key,scene,presentation,weapon){
  const skill=scene.mode==='skill'||presentation.support;
  const spec=scene.attacker?.type==='ally'||(!scene.attacker?.type&&getSkill({id:key})) ? getSkill({...scene.attacker,id:key},scene.attacker?.activeSkillId||scene.attacker?.skillSpec?.id) : null;
  const skillId=spec?.id||enemySkills[key];
  const direction=skill ? SKILL_DIRECTIONS[skillId] : null;
  const impact=skill ? .62 : .5;
  const contacts=direction?.contacts||[impact];
  const motion=direction?.motion||`basic-${weapon}`;
  const basicPath=basicMotions[weapon]||basicMotions.slash;
  const points=direction ? key==='siege_gunner' ? motions['piercing-draw'] : motions[motion] : basicPath;
  const moving=presentation.style==='melee'&&!presentation.support&&points.some(([,x])=>x>.35);
  const retreat=moving?[[.77,.72,-1,0],[.84,.45,0,0],[.90,.2,-1,0]]:[[.88,0,0,0]];
  const actor=[[0,0,0,0],...points,...retreat,[.96,0,0,0],[1,0,0,0]];
  let effects=direction?.effects|| (weapon==='bow' ? [arrow(.36,.5),spark(.5)] : weapon==='cannon' ? [fx('shell',.35,.51,{from:[.15,0],to:[1,0],color:'#ffd8a1',size:.4}),fx('flame',.50,.71,{size:.9,color:'#ffc87c'})] : weapon==='cast' ? [fx('motes',.28,.52,{from:[0,0],to:[1,0],color:'#bce5ff',size:.6}),spark(.5,'#d6edff')] : [cut(.47,weapon==='thrust'?-4:weapon==='heavy'?75:weapon==='quick'?35:-30,'#e6efe5',{size:weapon==='heavy'?1.1:.85}),spark(.5)]);
  if(!skill){
    const weaponEffect={
      thrust:fx('lance',.46,.55,{from:[.72,0],to:[1.1,0],size:1.05,color:'#e5e8ce'}),
      guard:fx('shield',.46,.60,{from:[.8,0],to:[1,0],size:.65,color:'#d5e6e0'}),
      fist:fx('fist',.47,.60,{from:[.8,0],to:[1.08,0],size:.7,color:'#eed8b1'}),
      beast:fx('claw',.47,.64,{size:.95,color:'#eae0c2'}),
      whip:fx('whip',.43,.58,{from:[.72,0],to:[1,0],size:1.3,color:'#c1a685'}),
    }[weapon];
    if(weaponEffect)effects=[weaponEffect,spark(.5)];
  }
  if(key==='siege_gunner'&&skill)effects=[fx('shell',.40,.62,{from:[.1,0],to:[1,0],bend:-.3,color:'#ffd19c',size:.55}),fx('flame',.62,.84,{color:'#ffb46b',size:1.5}),fx('debris',.62,.89,{color:'#ddc8a1'})];
  if(key==='plague_doctor'&&skill)effects=[fx('vial',.36,.62,{from:[0,0],to:[1,0],bend:-.18,color:'#b6d789',size:.6}),fx('shards',.62,.86,{color:'#b8d7a1'}),fx('motes',.62,.94,{color:'#b4c989'})];
  if(!skill&&moving)effects=[fx('dust',.17,.31,{from:[.12,.22],to:[.24,.21],size:.55,color:'#cec1a1'}),...effects];
  const skillPose=direction && spec ? skillArt[`${key}:${direction.pose||spec.id}`] : null;
  let poses=skill
    ? [[0,'ready'],[.20,moving?'run-a':'windup'],[.27,moving?'run-b':'windup'],[.35,'windup'],[.43,skillPose?'skill':'strike'],[.71,'recover'],[.87,'ready']]
    : [[0,'ready'],[.10,moving?'run-a':'windup'],[.18,moving?'run-b':'windup'],[.26,moving?'run-a':'windup'],[.34,'windup'],[.43,'strike'],[.56,'recover'],[.83,'ready']];
  if(skillId==='rapid'&&skill)poses=[[0,'ready'],[.20,'windup'],[.31,'skill'],[.36,'windup'],[.40,'skill'],[.45,'windup'],[.49,'skill'],[.65,'recover'],[.84,'ready']];
  if(skillId==='tiger-fist'&&skill)poses=[[0,'ready'],[.20,'run-a'],[.29,'run-b'],[.37,'windup'],[.42,'skill'],[.47,'windup'],[.50,'skill'],[.56,'windup'],[.61,'skill'],[.72,'recover'],[.87,'ready']];
  if(!skill&&['bow','cannon'].includes(weapon))poses=[[0,'ready'],[.14,'windup'],[weapon==='bow'?.36:.35,'strike'],[.52,'recover'],[.83,'ready']];
  if(moving)poses=[...poses.filter(([at])=>at<.74),[.74,'run-b'],[.81,'run-a'],[.88,'run-b'],[.96,'ready']];
  const cues=effects.filter(e=>e.sound).map(e=>({at:e.at,sound:e.sound}));
  if(skill)cues.unshift({at:.18,sound:presentation.support?'magic':'skill-charge'});
  for(const at of contacts)cues.push({at,sound:presentation.miss?'miss':presentation.support?presentation.effect:at===impact?(scene.finish?'finish':scene.outcome?.crit?'crit':skill?'skill-hit':weapon==='bow'?'impact':presentation.effect):'impact'});
  if(skill&&!presentation.miss&&!presentation.support)cues.push({at:impact,sound:spec?.effect||presentation.effect});
  return {id:skill?`${key}:${skillId||motion}`:`${key}:attack`,motion,skill,impact,contacts,actor,poses,effects,skillPose,cues,
    name:skill&&spec?spec.name:scene.attacker?.skill||scene.title};
}
