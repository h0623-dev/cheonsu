import { getAdvancedClassDefinition } from '../data/advancedClasses.js';

// Repair legacy weapon metadata while retaining earned stats and transient battle state.
export function restoreAllyWeaponIdentity(unit) {
  if (!unit || unit.type !== 'ally') return unit;
  const identities = {
    teo: { icon: '🏹', range: 2, minRange: 2 },
    luka: { icon: '⚔️', range: 1, minRange: 1 },
    leon: { icon: '🔱', range: 2, minRange: 1 },
    miho: { icon: '🦊', range: 2, minRange: 2 },
    ella: { icon: '🎵' },
  };
  const identity = identities[unit.id];
  if (!identity) return unit;
  const next = { ...unit, ...identity };
  if (unit.id === 'teo') {
    const bonus = unit.advancedClassBonus?.move ?? getAdvancedClassDefinition(unit)?.bonuses?.move ?? 0;
    next.move = Math.max(unit.move || 0, 3 + Math.max(0, bonus));
  }
  return next;
}
