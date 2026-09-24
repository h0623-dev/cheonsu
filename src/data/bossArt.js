export const bossCombatIds = ['boss_commander', 'boss_frost', 'boss_ember', 'boss_oracle', 'boss_abyss'];
export function getBossSpriteKey(unit) {
  if (unit?.type !== 'boss') return null;
  if (bossCombatIds.includes(unit.spriteKey)) return unit.spriteKey;
  const text = `${unit.id || ''} ${unit.name || ''} ${unit.skill || ''} ${unit.spriteKey || ''}`;
  if (/가론|심연|공허|최종|void/.test(text)) return 'boss_abyss';
  if (/빙|얼음|설원|서리|frost/.test(text)) return 'boss_frost';
  if (/화염|흑염|혈|잿|불|pyro/.test(text)) return 'boss_ember';
  if (/마도|마녀|사제|주술|cultist/.test(text)) return 'boss_oracle';
  return 'boss_commander';
}
