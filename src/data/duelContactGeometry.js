import { getSkillAuraAnchor } from './skillAuraAnchors.js';

export function getDuelWeaponAnchor(key, pose = 'strike', weapon = 'slash') {
  const anchor = getSkillAuraAnchor(key, pose, weapon);
  return { grip: anchor.grip.map(value => value / 512), tip: (anchor.focus || anchor.tip).map(value => value / 512), authored: anchor.authored, origin: anchor.origin };
}

// Coordinates use the same foot origin, authored scale and body acting as the image.
export function projectDuelAnchor(point, { width, scale = 1, footOffset = 0, body = [0, 1, 1] }) {
  const [angle, sx, sy] = body;
  const x = (point[0] - .5) * scale * sx * width;
  const y = ((point[1] - .9375) * scale + footOffset + .06) * sy * width;
  const radians = angle * Math.PI / 180;
  return [.5 * width + x * Math.cos(radians) - y * Math.sin(radians), .94 * width + x * Math.sin(radians) + y * Math.cos(radians)];
}

export function getDuelReach({ attackerLeft, attackerWidth, defenderLeft, defenderWidth, tip, scale, footOffset, body, advance = 1 }) {
  const targetX = defenderLeft + defenderWidth * .46;
  const weaponX = projectDuelAnchor(tip, { width: attackerWidth, scale, footOffset, body })[0];
  return Math.max(0, (targetX - attackerLeft - weaponX) / Math.max(.35, advance));
}
