import { distance, isTerrainBlocked, getTerrainMoveCost } from './movement.js';

function addStatus(unit, status) {
  const current = Array.isArray(unit.status) ? unit.status : [];
  const previous = current.find(entry => entry.type === status.type);
  return { ...unit, status: [...current.filter(entry => entry.type !== status.type), {
    ...status, turns: Math.max(previous?.turns || 0, status.turns),
    ...(status.power ? { power: Math.max(previous?.power || 0, status.power) } : {}),
  }] };
}

/** 실제 명중/지원 적용 후 호출한다. 피해 자체와 행동 소비는 기존 전투 흐름이 담당한다. */
export function finalizeExpansionAllySkill(units, actorId, targetId, skill, activeMap, { hit = true, targetIds = [] } = {}) {
  const actor = units.find(unit => unit.id === actorId);
  const special = skill?.special;
  if (!actor || actor.type !== 'ally' || actor.hp <= 0 || !special || !hit) return { units, messages: [], affectedIds: [] };
  let nextUnits = units;
  const messages = [];
  const affectedIds = new Set();
  const update = (id, transform) => {
    nextUnits = nextUnits.map(unit => unit.id === id ? transform(unit) : unit);
    affectedIds.add(id);
  };
  const target = units.find(unit => unit.id === targetId && unit.type !== 'ally');
  if (skill.type === 'attack' && target?.hp > 0) {
    if (special.push && target.type !== 'boss' && target.id !== 'boss') {
      const dx = target.x - actor.x;
      const dy = target.y - actor.y;
      const x = target.x + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0);
      const y = target.y + (Math.abs(dx) < Math.abs(dy) ? Math.sign(dy) : 0);
      const tile = activeMap?.[y]?.[x];
      if ((dx || dy) && tile !== undefined && !isTerrainBlocked(tile) && Number.isFinite(getTerrainMoveCost(tile, target)) &&
        !nextUnits.some(unit => unit.id !== target.id && unit.x === x && unit.y === y)) {
        update(target.id, unit => ({ ...unit, x, y }));
        messages.push(`${target.name}을 안전한 빈칸으로 1칸 밀었습니다.`);
      }
    }
    if (special.slow) {
      update(target.id, unit => addStatus(unit, { type: 'slow', turns: 2, power: 1 }));
      messages.push(`${target.name}의 다음 이동력이 1 줄어듭니다.`);
    }
  }
  if (skill.type === 'attack' && targetId && special.selfHeal) {
    update(actorId, unit => ({ ...unit, hp: Math.min(unit.maxHp, unit.hp + special.selfHeal) }));
    messages.push(`${actor.name}이 HP ${special.selfHeal}을 회복합니다.`);
  }
  if (skill.type === 'attack' && targetId && special.healNearby) {
    const ally = nextUnits.filter(unit => unit.type === 'ally' && unit.hp > 0 && unit.id !== actorId &&
      unit.hp < unit.maxHp && distance(actor, unit) <= 1)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0];
    if (ally) {
      update(ally.id, unit => ({ ...unit, hp: Math.min(unit.maxHp, unit.hp + special.healNearby) }));
      messages.push(`${ally.name}이 정화의 빛으로 HP ${special.healNearby}을 회복합니다.`);
    }
  }
  if (skill.type === 'guard' || skill.type === 'heal') {
    const allowed = new Set(targetIds.length ? targetIds : targetId ? [targetId] : []);
    const range = skill.type === 'guard' ? skill.radius : skill.range;
    const allies = nextUnits.filter(unit => allowed.has(unit.id) && unit.type === 'ally' && unit.hp > 0 && distance(actor, unit) <= range);
    for (const ally of allies) {
      if (special.regen) update(ally.id, unit => addStatus(unit, { type: 'regen', turns: 2, power: special.regen }));
      if (special.waterStride) update(ally.id, unit => addStatus(unit, { type: 'waterStride', turns: 2 }));
      if (special.cleanseGuard) update(ally.id, unit => ({ ...unit,
        status: (unit.status || []).filter(status => !['burn', 'bleed', 'freeze', 'armorBreak', 'slow', 'attackDown', 'blind'].includes(status.type)),
      }));
    }
    if (special.regen && allies.length) messages.push(`지원한 아군이 다음 자기 턴에 HP ${special.regen}을 추가 회복합니다.`);
    if (special.waterStride && allies.length) messages.push('지원한 아군의 다음 자기 턴 얕은 물·늪 이동 비용이 1이 됩니다.');
    if (special.cleanseGuard && allies.length) messages.push('서약의 성벽으로 지원한 아군의 상태이상을 해제했습니다.');
    if (special.slowAura) {
      for (const enemy of nextUnits.filter(unit => unit.type !== 'ally' && unit.hp > 0 && distance(actor, unit) <= special.slowAura)) {
        update(enemy.id, unit => addStatus(unit, { type: 'slow', turns: 2, power: 1 }));
      }
      messages.push('서리 성곽 주변 적의 다음 이동력이 1 줄어듭니다.');
    }
  }
  return { units: nextUnits, messages, affectedIds: [...affectedIds] };
}
