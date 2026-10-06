import { getDuelPoseAt } from '../data/duelPerformance.js';

const clamp = value => Math.max(0, Math.min(1, value));

// Use the duel's animation pool, duration and contact timeline. Decoration cannot deal damage.
export function animateSkillSpectacle(root, plan, { arena, attacker, a, d, dy, ground, miss }, animate) {
  const visual = plan.spectacle;
  if (!visual) return;
  const charge = root.querySelector('[data-vfx-phase="charge"]');
  const reach = parseFloat(root.style.getPropertyValue('--combat-reach')) || 0;
  if (charge) {
    const size = Math.min(attacker.offsetWidth * .9, arena.clientHeight * .67);
    const attackerGround = arena.clientHeight - parseFloat(getComputedStyle(attacker).bottom);
    charge.style.width = `${size}px`;
    charge.style.height = `${size}px`;
    const transform = (x, y) => `translate(${a + reach * x}px,${attackerGround + attacker.offsetHeight * y / 100 - size * .755}px) translateX(-50%)`;
    const actor = plan.actor.map(([offset, x, y]) => ({ offset, transform: transform(x, y), easing: 'cubic-bezier(.3,.65,.4,1)' }));
    animate(charge, actor);
    const { at, until } = visual.charge;
    animate(charge, [
      { offset: 0, opacity: 0 }, { offset: at, opacity: 0 },
      { offset: Math.min(at + .025, until), opacity: .9 },
      { offset: Math.max(at + .025, until - .035), opacity: .9 },
      { offset: until, opacity: 0 }, { offset: 1, opacity: 0 },
    ]);
    animate(charge.querySelector('.vfx-spin'), [{ offset: 0, transform: 'rotate(-12deg)' }, { offset: at, transform: 'rotate(-12deg)' }, { offset: until, transform: 'rotate(18deg)' }, { offset: 1, transform: 'rotate(18deg)' }]);
  }
  const weapon = visual.weapon || visual.sword;
  if (weapon) {
    const offsets = [...new Set([0, ...plan.poses.map(([at]) => at), weapon.at, weapon.until, 1])].sort((x, y) => x - y);
    for (const aura of root.querySelectorAll('[data-vfx-phase="weapon"]')) {
      animate(aura, offsets.map(offset => ({ offset, opacity: offset >= weapon.at && offset < weapon.until && getDuelPoseAt(plan, offset) === aura.dataset.pose ? 1 : 0, easing: 'steps(1,end)' })));
      for (const [index, coil] of [...aura.querySelectorAll('.vfx-blade-coil,.vfx-weapon-flow')].entries()) {
        animate(coil, [{ offset: 0, strokeDashoffset: 0 }, { offset: weapon.at, strokeDashoffset: 0 }, { offset: weapon.until, strokeDashoffset: index ? 130 : -190 }, { offset: 1, strokeDashoffset: index ? 130 : -190 }]);
      }
      animate(aura.querySelector('.vfx-weapon-orbit'), [{ offset: 0, transform: 'rotate(-12deg)' }, { offset: weapon.at, transform: 'rotate(-12deg)' }, { offset: weapon.until, transform: 'rotate(72deg)' }, { offset: 1, transform: 'rotate(72deg)' }]);
    }
  }
  // Keep the whole contact flourish within the arena, including phones in portrait orientation.
  const edge = Math.max(0, Math.min(d, arena.clientWidth - d, dy, arena.clientHeight - dy));
  const size = Math.max(1, Math.min(attacker.offsetWidth * 1.18 * visual.power, arena.clientHeight * .76, edge * 2 * .8));
  for (const [index, burst] of visual.bursts.entries()) {
    const node = root.querySelector(`[data-vfx-index="${index}"]`);
    if (!node) continue;
    node.style.visibility = miss && !visual.support ? 'hidden' : '';
    node.style.width = `${size}px`;
    node.style.height = `${size}px`;
    node.style.left = `${d}px`;
    node.style.top = `${dy}px`;
    node.style.setProperty('--vfx-ground', `${ground - dy}px`);
    const at = burst.at, until = clamp(burst.until), peak = Math.min(until, at + .035);
    const transform = scale => `translate(-50%,-50%) scale(${scale})`;
    animate(node, [
      { offset: 0, opacity: 0, transform: transform(.25) },
      { offset: at, opacity: 0, transform: transform(.25) },
      { offset: Math.min(until, at + .003), opacity: .9, transform: transform(.3) },
      { offset: peak, opacity: 1, transform: transform(1.08) },
      { offset: Math.max(peak, until - .05), opacity: .8, transform: transform(1.15) },
      { offset: until, opacity: 0, transform: transform(1.18) },
      { offset: 1, opacity: 0, transform: transform(1.18) },
    ]);
    animate(node.querySelector('.vfx-spin'), [{ offset: 0, transform: 'rotate(-16deg)' }, { offset: at, transform: 'rotate(-16deg)' }, { offset: until, transform: 'rotate(32deg)' }, { offset: 1, transform: 'rotate(32deg)' }]);
  }
}
