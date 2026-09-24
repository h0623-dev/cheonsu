export const BATTLE_SPEED_OPTIONS = [1, 2, 3].map((multiplier, index) => ({
  id: ['normal', 'fast', 'turbo'][index], label: `${multiplier}배속`, multiplier,
  desc: `${multiplier}x`, allyStepMs: 175 / multiplier, enemyStepMs: 190 / multiplier,
  enemyDelayMs: 700 / multiplier, stepGapMs: 35 / multiplier,
}));
export function getBattleSpeedConfig(id) { return BATTLE_SPEED_OPTIONS.find(option => option.id === id) || BATTLE_SPEED_OPTIONS[0]; }
export function scaleBattleTime(ms, speed) { return Math.max(0, ms / (speed?.multiplier || 1)); }
