import { EXPANSION_ALLY_ART_KEYS } from './expansionArtRegistry.js';
import { getExpansionBaseKey } from './skillAuraAnchors.js';

// Decoration only: these themes never replace a skill's combat effect or timeline.
const THEME_PALETTES = {
  fire: { color: '#ff853d', core: '#fff2bc' },
  wind: { color: '#89ddcb', core: '#f0fff2' },
  holy: { color: '#f4d67d', core: '#fffbed' },
  heal: { color: '#9be4bd', core: '#f5ffdf' },
  guard: { color: '#9cdde5', core: '#f1fbff' },
  lightning: { color: '#9edcff', core: '#fff7c6' },
  ice: { color: '#9ce7fa', core: '#f0fcff' },
  shadow: { color: '#bca1e5', core: '#f4ddff' },
  earth: { color: '#d9ae79', core: '#fff0cc' },
  music: { color: '#eca4d2', core: '#fff1fb' },
  martial: { color: '#efcd8f', core: '#fff6d4' },
  poison: { color: '#a3ce74', core: '#edffbf' },
  nature: { color: '#84c78c', core: '#efffd5' },
  water: { color: '#81d8dd', core: '#eafffb' },
};

// 승인된 B안 67개 기본 정체성의 연출 원장. 전직 의상은 교체하지 않고
// 같은 인물의 모티브만 계승합니다. 실제 속성·피해·지원 판정은 아래의
// presentation과 기존 공통 접촉 시계가 계속 결정합니다.
const battleStyle = (name, motif, theme, color, power = 1.26, boss = false) => ({
  name, motif, theme, color, core: THEME_PALETTES[theme].core, power, boss,
});
const battleStyleBEntries = {
  hero: battleStyle('카일', 'flame-vortex', 'fire', '#ff9b42', 1.34),
  bram: battleStyle('브람', 'bastion', 'guard', '#b9dea0'),
  lina: battleStyle('리나', 'phoenix-arrow', 'fire', '#ffb14c', 1.3),
  aria: battleStyle('아리아', 'sanctuary', 'heal', '#c6e9ef'),
  leon: battleStyle('레온', 'wind-lance', 'wind', '#b2eee0'),
  sera: battleStyle('세라', 'cross-shadow', 'shadow', '#dc9be5'),
  noah: battleStyle('노아', 'thunder-formula', 'lightning', '#a7e8ff', 1.3),
  yuna: battleStyle('유나', 'moon-ribbon', 'heal', '#e7c3f4'),
  rakan: battleStyle('라칸', 'earth-split', 'earth', '#f1bd75', 1.34),
  miho: battleStyle('미호', 'foxfire', 'fire', '#ffac82'),
  teo: battleStyle('테오', 'arrow-volley', 'wind', '#c2e8a3'),
  irene: battleStyle('아이린', 'crystal-lance', 'ice', '#a4edff', 1.3),
  kaz: battleStyle('카즈', 'cross-shadow', 'shadow', '#b3a4ed'),
  ella: battleStyle('엘라', 'lute-resonance', 'music', '#eac3a3'),
  jin: battleStyle('진', 'dragon-coil', 'fire', '#ff9562', 1.34),
  luka: battleStyle('루카', 'knight-aegis', 'holy', '#e7edb8'),
  baekho: battleStyle('백호', 'tiger-pressure', 'martial', '#f6dfaa', 1.32),
  mare: battleStyle('마레', 'tidal-lance', 'water', '#9de5de'),
  harin: battleStyle('하린', 'meridian-lotus', 'heal', '#f0c3a1'),
  edan: battleStyle('에단', 'forge-impact', 'earth', '#edc378', 1.3),
  sylvan: battleStyle('실반', 'living-roots', 'nature', '#a7e1a2'),
  raider: battleStyle('약탈병', 'amber-cleave', 'wind', '#efc781'),
  ranger: battleStyle('궁병', 'leaf-arrow', 'wind', '#afe7ac'),
  sniper: battleStyle('저격수', 'precision-bolt', 'wind', '#e5e8b0'),
  marauder: battleStyle('투창병', 'earth-split', 'earth', '#dfaf7d', 1.3),
  assassin_elite: battleStyle('암살자', 'cross-shadow', 'shadow', '#d88fdb'),
  iron_lancer: battleStyle('철창병', 'piercing-cone', 'wind', '#a8e0f6'),
  plague_doctor: battleStyle('역병 의술사', 'venom-seal', 'poison', '#c7df83'),
  beast_tamer: battleStyle('조련병', 'whip-spiral', 'martial', '#edc590'),
  storm_mage: battleStyle('폭풍 마도병', 'thunder-formula', 'lightning', '#a7e2ff', 1.3),
  blade_dancer: battleStyle('쌍검 무희', 'twin-crescents', 'wind', '#ecc3ee'),
  siege_gunner: battleStyle('공성 포병', 'cannon-flare', 'martial', '#ffbd7d', 1.32),
  sentinel: battleStyle('방패병', 'bastion', 'guard', '#ade2ec'),
  blackguard: battleStyle('흑기사', 'crimson-cleave', 'wind', '#d4b8d2'),
  warlord: battleStyle('집행관', 'commander-impact', 'earth', '#e8ae79', 1.3),
  pyromancer: battleStyle('화염 술사', 'flame-vortex', 'fire', '#ff9157', 1.3),
  frost_mage: battleStyle('빙결 술사', 'crystal-lance', 'ice', '#a1e6ff'),
  cultist: battleStyle('의식 사제', 'occult-seal', 'shadow', '#d6a1e9'),
  void_knight: battleStyle('공허 기사', 'void-cleave', 'shadow', '#b2b8ff', 1.3),
  wolf: battleStyle('전투 늑대', 'frost-claws', 'ice', '#c7f1ff'),
  'kobold-hunter': battleStyle('코볼트 사냥꾼', 'precision-bolt', 'wind', '#e9d59c'),
  'lizard-spearman': battleStyle('도마뱀 창병', 'tidal-lance', 'wind', '#9be4c5'),
  'horned-ogre': battleStyle('뿔오거', 'earth-split', 'earth', '#eab584', 1.34),
  'harpy-scout': battleStyle('하피 정찰병', 'feather-claws', 'martial', '#d8c6f3'),
  'skeleton-warrior': battleStyle('해골전사', 'spectral-cleave', 'earth', '#b9e5ee'),
  'rock-spirit': battleStyle('바위정령', 'stone-fissure', 'martial', '#edca7b', 1.34),
  crab_guard: battleStyle('갈대등 갑각병', 'shell-ward', 'martial', '#b8e1d8'),
  eel_archer: battleStyle('비늘가시 사수', 'tide-arrow', 'wind', '#afe0d8'),
  spore_colony: battleStyle('포자등 균사체', 'spore-spiral', 'poison', '#c0dda0'),
  mist_ram: battleStyle('눈안개 뿔양', 'mist-horns', 'martial', '#d6e6f4'),
  crystal_insect: battleStyle('빙정날개 벌레', 'prism-claws', 'martial', '#c4e9f7'),
  spring_salamander: battleStyle('온천 도롱뇽', 'steam-vents', 'fire', '#ffc18e'),
  gold_puppet: battleStyle('금실 인형병', 'clockwork-threads', 'wind', '#e8cd8d'),
  bell_keeper: battleStyle('가면 종지기', 'bell-resonance', 'music', '#d8c8ad'),
  scroll_spirit: battleStyle('접힌서고 정령', 'paper-seal', 'holy', '#dedbb6'),
  eclipse_cat: battleStyle('월식 사냥고양이', 'eclipse-claws', 'shadow', '#bdb5ed'),
  ink_vine: battleStyle('잉크덩굴 포식자', 'ink-roots', 'poison', '#c0d28f'),
  hollow_armor: battleStyle('빈갑옷 운반자', 'empty-aegis', 'guard', '#dbdfca'),
  boss_commander: battleStyle('황금의 지휘관', 'commander-impact', 'earth', '#ffd080', 1.46, true),
  boss_frost: battleStyle('서리의 군주', 'royal-frost-wave', 'ice', '#a1edff', 1.46, true),
  boss_ember: battleStyle('잿불의 군주', 'inferno-vortex', 'fire', '#ff9a54', 1.48, true),
  boss_oracle: battleStyle('검은 예언자', 'covenant-oracle', 'holy', '#f6e5a2', 1.44, true),
  boss_abyss: battleStyle('흑천 가론', 'void-cleave', 'shadow', '#b8b0f7', 1.48, true),
  tide_keeper: battleStyle('심해 수문장 모르칸', 'water-gates', 'wind', '#a5e3e3', 1.46, true),
  frost_queen: battleStyle('빙정 여왕 세르카', 'crystal-crown', 'ice', '#b6f0ff', 1.46, true),
  resonance_judge: battleStyle('공명 집행관 아르켄', 'judgment-resonance', 'music', '#e8d09e', 1.46, true),
  oath_guardian: battleStyle('첫 맹세 수호체 아스테르', 'five-oath-tablets', 'holy', '#f4e2b0', 1.5, true),
};
export const BATTLE_STYLE_B_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(battleStyleBEntries).map(([id, entry]) => [id, Object.freeze({ id, ...entry })]),
));

export function getBattleStyleBProfile(unitKey) {
  if (typeof unitKey !== 'string') return null;
  const canonical = getExpansionBaseKey(unitKey.replace(/^silvan(?=__|$)/, 'sylvan'));
  return Object.hasOwn(BATTLE_STYLE_B_PROFILES, canonical) ? BATTLE_STYLE_B_PROFILES[canonical] : null;
}

const profile = (theme, power, color, core) => ({ theme, power, color, core });
const SKILL_PROFILES = {
  gale: profile('fire', 1.1),
  oath: profile('guard', 1.04, '#edcb79', '#fff4ca'),
  'hero-dawn-slash': profile('fire', 1.18, '#ffb451', '#fffbe0'),
  bulwark: profile('guard', 1.06, '#a5d8ef', '#f1fcff'),
  bash: profile('guard', 1.08),
  'bram-oath-wall': profile('guard', 1.16, '#e1c78a', '#fff8db'),
  ember: profile('fire', 1.08),
  snipe: profile('wind', 1.04, '#c7eaa5', '#f8ffe2'),
  'lina-phoenix-flare': profile('fire', 1.18, '#ffa553', '#fff3bb'),
  light: profile('heal', 1.04, '#f2dca2', '#fffbea'),
  sanctuary: profile('heal', 1.1, '#e4e9b0', '#fffdf0'),
  'aria-sanctuary-song': profile('heal', 1.16, '#e4e8bd', '#ffffed'),
  pierce: profile('wind', 1.04, '#e7d79d', '#fff8df'),
  charge: profile('wind', 1.1),
  shade: profile('shadow', 1.1),
  opening: profile('shadow', 1.06, '#cdb0cd', '#ffeddd'),
  chain: profile('lightning', 1.16),
  ward: profile('guard', 1.08, '#8fdde9', '#eefcff'),
  moon: profile('heal', 1.06, '#cbd1f7', '#f8f7ff'),
  purify: profile('heal', 1.1, '#f1bdd9', '#fff8f1'),
  crush: profile('earth', 1.14),
  roar: profile('guard', 1.1, '#dfc391', '#fff2d9'),
  foxfire: profile('fire', 1.1, '#ffa879', '#d5fff0'),
  illusion: profile('shadow', 1.12, '#d0a7e6', '#ffedff'),
  rapid: profile('wind', 1.08, '#c5e5a6', '#f4ffe4'),
  breaker: profile('wind', 1.1, '#a9e6be', '#edffdf'),
  'ice-lance': profile('ice', 1.1),
  'frost-wave': profile('ice', 1.12, '#a9dafa', '#f3fcff'),
  ambush: profile('shadow', 1.12, '#aaa8d9', '#eee6ff'),
  vital: profile('martial', 1.08, '#edbbb1', '#fff6e9'),
  melody: profile('heal', 1.08, '#b4e2c2', '#f4ffe4'),
  resonance: profile('music', 1.14),
  dragon: profile('fire', 1.18, '#ff9950', '#fff0aa'),
  moonblade: profile('holy', 1.12, '#bfd7fa', '#f5fbff'),
  'knight-charge': profile('holy', 1.1, '#d7dfa2', '#ffffdf'),
  radiance: profile('guard', 1.12, '#e3d893', '#fffbdc'),
  'tiger-fist': profile('martial', 1.14),
  'tiger-roar': profile('martial', 1.18, '#edc488', '#fff3ce'),
  'tide-thrust': profile('water', 1.1),
  'water-cover': profile('guard', 1.06, '#91d9db', '#eafff6'),
  'warm-touch': profile('heal', 1.06, '#e2bdad', '#fff1df'),
  'linked-fist': profile('martial', 1.12, '#e6b6ab', '#fff0df'),
  'breaker-hammer': profile('earth', 1.14, '#dbb56c', '#fff1c1'),
  'folding-barrier': profile('guard', 1.08, '#d1bc7f', '#fff3d1'),
  'root-snare': profile('nature', 1.1),
  'green-breath': profile('heal', 1.08, '#a4d797', '#f5ffdf'),
};

const ALLY_KEYS = new Set([
  'hero', 'bram', 'lina', 'aria', 'leon', 'sera', 'noah', 'yuna', 'rakan',
  'miho', 'teo', 'irene', 'kaz', 'ella', 'jin', 'luka', 'baekho', ...EXPANSION_ALLY_ART_KEYS,
]);
const EFFECT_THEMES = {
  fire: 'fire', ice: 'ice', lightning: 'lightning', shadow: 'shadow', holy: 'holy',
  heal: 'heal', guard: 'guard', poison: 'poison', music: 'music',
  slash: 'wind', thrust: 'wind', arrow: 'wind', heavy: 'earth',
  impact: 'martial', claw: 'martial', cast: 'holy', nature: 'nature', water: 'water',
};

// Unit accents decorate the existing element; a different skill element keeps its own palette.
const UNIT_ACCENTS = {
  raider: profile('wind', 1.06, '#e5bd74', '#fff5d7'),
  ranger: profile('wind', 1.06, '#9ee7ac', '#f1ffe3'),
  sniper: profile('wind', 1.08, '#b2cf91', '#ffffdf'),
  marauder: profile('earth', 1.1, '#d6a270', '#fff1d6'),
  assassin_elite: profile('shadow', 1.1, '#bb83ea', '#f9e7ff'),
  iron_lancer: profile('wind', 1.08, '#92d7ed', '#eefaff'),
  plague_doctor: profile('poison', 1.08, '#c3dc6f', '#f6ffd9'),
  beast_tamer: profile('martial', 1.08, '#eaba84', '#fff0cb'),
  storm_mage: profile('lightning', 1.1, '#94d8ff', '#fff5b8'),
  blade_dancer: profile('wind', 1.08, '#eac2ef', '#fff2ff'),
  siege_gunner: profile('martial', 1.1, '#ffa66c', '#fff7cd'),
  sentinel: profile('guard', 1.08, '#a1dbe5', '#efffff'),
  blackguard: profile('wind', 1.08, '#b6c7e8', '#f0f2ff'),
  warlord: profile('earth', 1.12, '#dc8f63', '#ffe9c2'),
  pyromancer: profile('fire', 1.1, '#ff6d47', '#fff0b6'),
  frost_mage: profile('ice', 1.1, '#8dd9ff', '#eaffff'),
  cultist: profile('shadow', 1.1, '#ca8ede', '#ffe5f6'),
  void_knight: profile('shadow', 1.12, '#8bbff7', '#efedff'),
  wolf: profile('ice', 1.06, '#b7eaff', '#f2ffff'),
  'kobold-hunter': profile('wind', 1.06, '#f2da8b', '#fff9dd'),
  'lizard-spearman': profile('wind', 1.08, '#7dd8bc', '#ecfff4'),
  'horned-ogre': profile('earth', 1.12, '#e3a66e', '#fff0c9'),
  'harpy-scout': profile('martial', 1.06, '#c6b7f7', '#f8f1ff'),
  'skeleton-warrior': profile('earth', 1.1, '#a6d2dd', '#f0fdff'),
  'rock-spirit': profile('martial', 1.12, '#e6bd72', '#fff0a6'),
  boss_commander: profile('earth', 1.16, '#ffc56d', '#fff4d1'),
  boss_frost: profile('ice', 1.16, '#83e7ff', '#edffff'),
  boss_ember: profile('fire', 1.16, '#ff7545', '#fff0b0'),
  boss_oracle: profile('holy', 1.16, '#fff0b1', '#ffffee'),
  boss_abyss: profile('shadow', 1.16, '#c19afb', '#f5e9ff'),
  crab_guard: profile('martial', 1.08, '#dfc394', '#fff2cc'),
  eel_archer: profile('wind', 1.06, '#a8d6cf', '#effff2'),
  spore_colony: profile('poison', 1.06, '#c3db91', '#f6ffdc'),
  mist_ram: profile('martial', 1.1, '#cbd9eb', '#f3faff'),
  crystal_insect: profile('martial', 1.06, '#b8ddec', '#effcff'),
  spring_salamander: profile('fire', 1.1, '#ffab7b', '#fff2cc'),
  gold_puppet: profile('wind', 1.08, '#ddbe79', '#fff3cf'),
  bell_keeper: profile('music', 1.08, '#d6b2d4', '#fff2fa'),
  scroll_spirit: profile('holy', 1.08, '#dac895', '#fff7df'),
  eclipse_cat: profile('shadow', 1.1, '#afa6d9', '#eee9ff'),
  ink_vine: profile('poison', 1.08, '#b2cb7f', '#efffd0'),
  hollow_armor: profile('guard', 1.1, '#bac8d2', '#f4f8ff'),
  tide_keeper: profile('wind', 1.16, '#8fcbd8', '#eaffff'),
  frost_queen: profile('ice', 1.16, '#9ae4f1', '#f0ffff'),
  resonance_judge: profile('music', 1.16, '#d3b3e1', '#fff2ff'),
  oath_guardian: profile('holy', 1.18, '#e9d6a6', '#fffce7'),
};

export function getSkillSpectacle(plan, key, presentation, scene) {
  if (!plan?.skill) return null;
  const skillId = String(plan.id).slice(String(plan.id).indexOf(':') + 1);
  const canonical = getExpansionBaseKey(key);
  const authored = ALLY_KEYS.has(canonical) ? SKILL_PROFILES[skillId] : null;
  const theme = presentation.healing ? 'heal' : presentation.guarding ? 'guard'
    : authored?.theme || EFFECT_THEMES[presentation.effect] || 'martial';
  const palette = THEME_PALETTES[theme];
  const styleB = getBattleStyleBProfile(key);
  const unit = UNIT_ACCENTS[canonical];
  const accent = unit?.theme === theme ? unit : null;
  const styleAccent = styleB?.theme === theme ? styleB : null;
  const firstRelease = plan.releases?.[0] ?? .45;
  const lastContact = plan.contacts.at(-1) ?? plan.impact;
  const supportMotifs = {
    hero: 'five-oath-tablets', bram: 'bastion', noah: 'thunder-formula', yuna: 'moon-ribbon',
    rakan: 'tiger-pressure', ella: 'lute-resonance', luka: 'knight-aegis', mare: 'water-gates',
    harin: 'meridian-lotus', edan: 'forge-impact', sylvan: 'living-roots',
    crab_guard: 'shell-ward', spore_colony: 'spore-spiral', bell_keeper: 'bell-resonance',
    hollow_armor: 'empty-aegis', resonance_judge: 'judgment-resonance',
  };
  const motif = presentation.support ? supportMotifs[canonical] || 'sanctuary' : styleB?.motif || theme;
  return {
    id: plan.id,
    theme,
    style: 'b', identity: styleB?.id || canonical, motif, boss: Boolean(styleB?.boss),
    melee: Boolean(plan.moving && !presentation.support),
    color: authored?.color || styleAccent?.color || accent?.color || palette.color,
    core: authored?.core || styleAccent?.core || accent?.core || palette.core,
    power: styleB?.power ?? authored?.power ?? unit?.power ?? (scene.attacker?.type === 'boss' ? 1.3 : 1.2),
    support: presentation.support,
    heal: presentation.healing,
    guard: presentation.guarding,
    sword: canonical === 'hero' ? { kind: presentation.support ? 'gold' : 'fire', at: .24, until: lastContact + .16 } : null,
    weapon: { unit: key, at: .24, until: lastContact + .16 },
    charge: { at: .23, until: Math.min(firstRelease + .015, .60) },
    ribbons: (plan.releases || [firstRelease]).map((at, index) => ({
      at, contact: plan.contacts[index] ?? plan.impact,
      until: Math.min(.94, (plan.contacts[index] ?? plan.impact) + (presentation.support ? .2 : .15)),
    })),
    bursts: plan.contacts.map(at => ({ at, until: Math.min(.94, at + .23), kind: theme })),
  };
}
