import { applyEquipmentStats, grantExp } from './partyEngine.js';

export const TRAINING_TYPES = [
  { id: 'attack', name: '공격 훈련', exp: 20, stat: 'atk', desc: 'EXP +20 · 기본 공격 +1' },
  { id: 'defense', name: '방어 훈련', exp: 20, stat: 'def', desc: 'EXP +20 · 기본 방어 +1' },
  { id: 'focus', name: '집중 훈련', exp: 30, stat: null, desc: 'EXP +30' },
];

export function trainParty(party, trainingId, used = false) {
  const training = TRAINING_TYPES.find(type => type.id === trainingId);
  const allies = party.filter(unit => unit.type === 'ally');
  if (used || !training || !allies.length) return { units: party, messages: [], used, count: 0 };
  let units = party.map(unit => unit.type !== 'ally' ? unit : applyEquipmentStats({ ...unit,
    baseAtk: (unit.baseAtk ?? unit.atk) + (training.stat === 'atk' ? 1 : 0),
    baseDef: (unit.baseDef ?? (unit.def - (unit.skillGuardBoost || 0))) + (training.stat === 'def' ? 1 : 0),
  }));
  const messages = [];
  for (const unit of allies) {
    const growth = grantExp(units, unit.id, training.exp);
    units = growth.units;
    messages.push(...growth.messages);
  }
  return { units, messages, used: true, count: allies.length };
}

export function grantEnemyDefeatExp(units, killerId, enemy, deployedIds) {
  const ids = [...new Set(deployedIds)];
  if (!enemy || enemy.type === 'ally' || !ids.includes(killerId)) return { units, rewards: [], messages: [] };
  const total = enemy.type === 'boss' ? 50 : 30;
  const rewards = ids.map(id => ({ id, amount: id === killerId ? total : Math.floor(total * 0.3) }));
  let updated = units;
  const messages = [];
  for (const reward of rewards) {
    const growth = grantExp(updated, reward.id, reward.amount);
    updated = growth.units;
    messages.push(...growth.messages);
  }
  return { units: updated, rewards, messages };
}

// Live battle growth is authoritative; absent deployed allies retain their share in the roster.
export function syncBattleExperience(party, result) {
  return party.map(unit => {
    const reward = result.rewards.find(entry => entry.id === unit.id);
    if (!reward || unit.type !== 'ally') return unit;
    const live = result.units.find(entry => entry.id === unit.id && entry.type === 'ally');
    if (!live) return grantExp([unit], unit.id, reward.amount).units[0];
    return applyEquipmentStats({ ...unit, level: live.level, exp: live.exp,
      maxHp: live.maxHp, baseAtk: live.baseAtk, baseDef: live.baseDef,
      hp: unit.hp > 0 ? Math.min(live.maxHp, unit.hp + Math.max(0, live.maxHp - unit.maxHp)) : 0,
    });
  });
}
