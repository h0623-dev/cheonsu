import { getDuelPoseAt } from '../data/duelPerformance.js';

const clamp = value => Math.max(0, Math.min(1, value));

// Use the duel's animation pool, duration and contact timeline. Decoration cannot deal damage.
export function animateSkillSpectacle(root, plan, { arena, attacker, a, d, dy, ground, miss, weaponPoint, actorTrack = plan.actor }, animate) {
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
    const actor = actorTrack.map(([offset, x, y]) => ({ offset, transform: transform(x, y), easing: 'cubic-bezier(.3,.65,.4,1)' }));
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
  // B안의 큰 궤적은 실제 현재 자세의 무기 끝에서 출발합니다. 포착된
  // 궤적의 잔광만 남기며 배우의 좌표나 접촉·피해·지원 시계를 바꾸지 않습니다.
  for (const [index, ribbon] of (visual.ribbons || []).entries()) {
    const node = root.querySelector(`[data-vfx-release="${index}"]`);
    if (!node) continue;
    const source = weaponPoint?.(ribbon.at, 'tip') || [a, dy];
    const inset = 8;
    const tx = Math.max(inset, Math.min(arena.clientWidth - inset, d + (miss && !visual.support ? attacker.offsetWidth * .22 : 0)));
    const ty = Math.max(inset, Math.min(arena.clientHeight - inset, dy - (miss && !visual.support ? attacker.offsetWidth * .11 : 0)));
    const dx = tx - source[0], deltaY = ty - source[1];
    const distance = Math.hypot(dx, deltaY);
    const edgeX = Math.max(6, Math.min(source[0], arena.clientWidth - source[0]));
    const edgeY = Math.max(6, Math.min(source[1], arena.clientHeight - source[1]));
    const length = visual.melee
      ? Math.max(12, Math.min(attacker.offsetWidth * 1.6, arena.clientWidth * .85, edgeX * 1.84))
      : Math.max(12, distance);
    const height = visual.melee
      ? Math.max(10, Math.min(attacker.offsetWidth * 1.02, arena.clientHeight * .7, edgeY * 1.84))
      : Math.max(10, Math.min(attacker.offsetWidth * (visual.support ? .56 : .72), arena.clientHeight * .44, Math.max(22, length * .67), edgeY * 1.8));
    const angle = Math.atan2(deltaY, dx) * 180 / Math.PI;
    node.style.width = `${length}px`;
    node.style.height = `${height}px`;
    node.style.left = `${source[0]}px`;
    node.style.top = `${source[1]}px`;
    node.style.transformOrigin = visual.melee ? '50% 50%' : '0 50%';
    const at = ribbon.at, contact = Math.max(at + .008, ribbon.contact), until = ribbon.until;
    const reveal = Math.min(contact, at + .008);
    const fade = Math.max(contact, until - .04);
    const transform = scale => `${visual.melee ? 'translate(-50%,-50%)' : 'translateY(-50%)'} rotate(${visual.melee ? 0 : angle}deg) scaleY(${scale})`;
    const concealed = visual.melee ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)';
    const appearing = visual.melee ? 'inset(0 0% 0 0)' : 'inset(0 80% 0 0)';
    animate(node, [
      { offset: 0, opacity: 0, clipPath: concealed, transform: transform(.42) },
      { offset: at, opacity: 0, clipPath: concealed, transform: transform(.42) },
      { offset: reveal, opacity: .82, clipPath: appearing, transform: transform(.7) },
      { offset: contact, opacity: visual.support ? .72 : .94, clipPath: 'inset(0 0% 0 0)', transform: transform(1) },
      { offset: fade, opacity: visual.support ? .5 : .58, clipPath: 'inset(0 0% 0 0)', transform: transform(1.04) },
      { offset: until, opacity: 0, clipPath: 'inset(0 0% 0 0)', transform: transform(1.08) },
      { offset: 1, opacity: 0, clipPath: 'inset(0 0% 0 0)', transform: transform(1.08) },
    ]);
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
