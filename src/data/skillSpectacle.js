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
};

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
};

const ALLY_KEYS = new Set([
  'hero', 'bram', 'lina', 'aria', 'leon', 'sera', 'noah', 'yuna', 'rakan',
  'miho', 'teo', 'irene', 'kaz', 'ella', 'jin', 'luka', 'baekho',
]);
const EFFECT_THEMES = {
  fire: 'fire', ice: 'ice', lightning: 'lightning', shadow: 'shadow', holy: 'holy',
  heal: 'heal', guard: 'guard', poison: 'poison', music: 'music',
  slash: 'wind', thrust: 'wind', arrow: 'wind', heavy: 'earth',
  impact: 'martial', claw: 'martial', cast: 'holy',
};

export function getSkillSpectacle(plan, key, presentation, scene) {
  if (!plan?.skill) return null;
  const skillId = String(plan.id).slice(String(plan.id).indexOf(':') + 1);
  const authored = ALLY_KEYS.has(key) ? SKILL_PROFILES[skillId] : null;
  const theme = presentation.healing ? 'heal' : presentation.guarding ? 'guard'
    : authored?.theme || EFFECT_THEMES[presentation.effect] || 'martial';
  const palette = THEME_PALETTES[theme];
  const firstRelease = plan.releases?.[0] ?? .45;
  const lastContact = plan.contacts.at(-1) ?? plan.impact;
  return {
    id: plan.id,
    theme,
    color: authored?.color || palette.color,
    core: authored?.core || palette.core,
    power: authored?.power ?? (scene.attacker?.type === 'boss' ? 1.12 : 1.06),
    support: presentation.support,
    heal: presentation.healing,
    guard: presentation.guarding,
    sword: key === 'hero' ? { kind: presentation.support ? 'gold' : 'fire', at: .24, until: lastContact + .16 } : null,
    charge: { at: .23, until: Math.min(firstRelease + .015, .60) },
    bursts: plan.contacts.map(at => ({ at, until: Math.min(.94, at + .23), kind: theme })),
  };
}
