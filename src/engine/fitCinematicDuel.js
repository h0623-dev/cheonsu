import frameBounds from '../data/cinematicFrameBounds.json' with { type: 'json' };
import { getCombatFrameStyle } from '../data/combatArt.js';
import { getDuelDefenderReaction, getDuelPoseAt, sampleDuelTrack } from '../data/duelPerformance.js';
import { getDuelWeaponAnchor, projectDuelAnchor } from '../data/duelContactGeometry.js';

const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const fullFrame = { left: 0, top: 0, right: 511, bottom: 511 };
const emptyBounds = () => ({ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
const extend = (bounds, x, y) => {
  bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
  bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
};
const sample = (track, at) => sampleDuelTrack(track, clamp(at));

export function resetCinematicDuelLayout(...actors) {
  for (const actor of actors) {
    if (!actor) continue;
    for (const property of ['width', 'left', 'right', 'bottom']) actor.style.removeProperty(property);
  }
}

// A negative advance is legitimate for a giant whose weapon already passes its target.
// Its use is paired with silhouette fitting below, never with a raw off-screen retreat.
export function getCinematicReach({ attackerLeft, attackerWidth, defenderLeft, defenderWidth, tip, scale, footOffset, body, advance = 1 }) {
  const weaponX = projectDuelAnchor(tip, { width: attackerWidth, scale, footOffset, body })[0];
  return (defenderLeft + defenderWidth * .46 - attackerLeft - weaponX) / Math.max(.001, advance);
}

function frameFor(key, pose, plan, skill = false) {
  const resolvedPose = pose === 'ready' ? 'recover' : pose === 'evade' ? 'run-a'
    : pose === 'skill' ? plan.skillPose?.src?.includes('skill-b') ? 'skill-b' : 'skill-a' : pose;
  const bounds = frameBounds[key]?.[resolvedPose] || fullFrame;
  const style = skill && plan.skillPose ? {
    '--combat-sprite-scale': plan.skillPose.scale,
    '--combat-foot-offset': plan.skillPose.footOffset,
  } : getCombatFrameStyle(key, resolvedPose);
  return { bounds, pose: resolvedPose, scale: Number(style?.['--combat-sprite-scale']) || 1,
    footOffset: (parseFloat(style?.['--combat-foot-offset']) || 0) / 100 };
}

function defenderPoseTrack(plan, { miss, support, finish }) {
  const poses = [[0, 'ready']];
  if (!support) {
    const contacts = miss ? [plan.impact - .06] : plan.contacts;
    for (const [index, at] of contacts.entries()) {
      poses.push([at, miss ? 'evade' : 'recoil']);
      const recovery = Math.min(at + Math.max(.095, plan.contactPause + .065), .86);
      if (index === contacts.length - 1 || recovery < contacts[index + 1]) poses.push([recovery, finish ? 'recoil' : 'ready']);
    }
  }
  poses.push([1, finish && !support && !miss ? 'recoil' : 'ready']);
  return poses.sort((left, right) => left[0] - right[0]);
}

function defenderMotion(plan, { miss, support, finish, defenderBoss }) {
  const reaction = getDuelDefenderReaction(plan, { miss, support, finish });
  const resistance = defenderBoss ? .34 : 1;
  const actor = reaction.actor.map(([at, x, y]) => [at, x * resistance, y * resistance]);
  let body = !finish ? reaction.body.map(([at, angle, sx, sy]) => [at, angle * resistance, 1 + (sx - 1) * resistance, 1 + (sy - 1) * resistance, 0])
    : [[0, 0, 1, 1, 0], [1, 0, 1, 1, 0]];
  if (finish && !support && !miss) body = [
    [0, 0, 1, 1, 0], [plan.impact - .001, 0, 1, 1, 0],
    [plan.impact, defenderBoss ? 2 : 6, .99, .98, 0],
    [plan.impact + plan.contactPause, defenderBoss ? 2 : 6, .99, .98, 0],
    [.84, defenderBoss ? 4 : 12, 1, 1, defenderBoss ? 3 : 6],
    [1, defenderBoss ? 7 : 18, 1, 1, defenderBoss ? 6 : 10],
  ];
  return { actor, body, poses: defenderPoseTrack(plan, { miss, support, finish }) };
}

function alignContactPlane({ plan, acting, attackerKey, attackerWidth, attackerHeight, defenderWidth, defenderHeight, defenseMotion, contactFraction }) {
  const tipRelative = at => {
    const pose = getDuelPoseAt(plan, at);
    const frame = frameFor(attackerKey, pose, plan, pose === 'skill');
    const anchor = getDuelWeaponAnchor(attackerKey, frame.pose, plan.weapon);
    const tip = projectDuelAnchor(anchor.tip, { width: attackerWidth, scale: frame.scale,
      footOffset: frame.footOffset, body: sample(acting.body, at) });
    const actorY = sample(acting.actor, at)[1] * attackerHeight / 100;
    const defenderY = sample(defenseMotion.actor, at)[1] * defenderHeight / 100;
    return -attackerWidth + tip[1] + actorY - defenderY;
  };
  const groups = [...new Set([...plan.contacts, plan.impact])].sort((left, right) => left - right).map(at => {
    const until = clamp(at + (plan.contactPause || 0));
    const offsets = new Set([at, until]);
    // A hold must keep one actor position even if a source pose changes at its boundary.
    for (const [poseAt] of plan.poses) if (poseAt > at && poseAt < until) {
      offsets.add(Math.max(at, poseAt - .000001)); offsets.add(poseAt);
    }
    const ys = [...offsets].map(tipRelative);
    return { at, until, min: Math.min(...ys), max: Math.max(...ys) };
  });
  const topDepth = Math.min(defenderWidth * .78, defenderHeight * .88);
  const bottomDepth = Math.min(defenderWidth * .18, defenderHeight * .2);
  const low = Math.max(...groups.map(group => group.max + bottomDepth));
  const high = Math.min(...groups.map(group => group.min + topDepth));
  const wanted = tipRelative(plan.impact) + defenderWidth * contactFraction;
  // Move the shared combat plane before asking the actor to make any extra airborne movement.
  const deltaGround = low <= high ? Math.max(low, Math.min(high, wanted)) : (low + high) * .5;
  if (low > high) {
    const corrections = [[0, 0], [Math.max(0, (plan.releases[0] ?? plan.impact) - .055), 0]];
    for (const group of groups) {
      const minimum = deltaGround - topDepth - group.min;
      const maximum = deltaGround - bottomDepth - group.max;
      const pixels = minimum <= maximum ? Math.max(minimum, Math.min(maximum, 0)) : (minimum + maximum) * .5;
      const percent = pixels / Math.max(1, attackerHeight) * 100;
      corrections.push([group.at, percent], [group.until, percent]);
    }
    const lastHold = Math.max(...groups.map(group => group.until));
    if (lastHold < 1) corrections.push([Math.min(1, lastHold + .085), 0], [1, 0]);
    const correctionTrack = [...new Map(corrections.map(([at, value]) => [clamp(at).toFixed(6), [clamp(at), value]]))
      .values()].sort((left, right) => left[0] - right[0]);
    const original = acting.actor;
    const offsets = [...new Set([...original.map(([at]) => at), ...correctionTrack.map(([at]) => at)])].sort((left, right) => left - right);
    acting.actor = offsets.map(at => {
      const [x, y] = sample(original, at);
      return [at, x, y + sample(correctionTrack, at)[0]];
    });
    // Preserve a literal flat position over every contact pause, not just matching endpoints.
    const holds = groups.map(group => ({ ...group, actor: sample(acting.actor, group.at) }));
    acting.actor = acting.actor.map(([at, x, y]) => {
      const hold = holds.find(group => at >= group.at && at <= group.until);
      return hold ? [at, ...hold.actor] : [at, x, y];
    });
  }
  return { deltaGround, contactFraction: (deltaGround - tipRelative(plan.impact)) / Math.max(1, defenderWidth) };
}

function poseAt(poses, at) {
  let active = 'ready';
  for (const [offset, pose] of poses) {
    if (offset > at) break;
    active = pose;
  }
  return active;
}

// Bound a rotated corner for the entire angle interval, including interior extrema.
function cornerEnvelope(point, frame, width, from, until, mirrored) {
  const bounds = emptyBounds();
  const source = [mirrored ? 1 - point[0] : point[0], point[1]];
  const minimumAngle = Math.min(from[0], until[0]), maximumAngle = Math.max(from[0], until[0]);
  for (const sx of new Set([from[1], until[1]])) {
    for (const sy of new Set([from[2], until[2]])) {
      const x = (source[0] - .5) * frame.scale * sx * width;
      const y = ((source[1] - .9375) * frame.scale + frame.footOffset + .06) * sy * width;
      const angles = [minimumAngle, maximumAngle];
      for (const extremum of [Math.atan2(-y, x), Math.atan2(x, y)]) {
        const start = Math.ceil((minimumAngle * Math.PI / 180 - extremum) / Math.PI);
        const end = Math.floor((maximumAngle * Math.PI / 180 - extremum) / Math.PI);
        for (let turn = start; turn <= end; turn++) angles.push((extremum + turn * Math.PI) * 180 / Math.PI);
      }
      for (const angle of angles) {
        const [px, py] = projectDuelAnchor(source, { width, scale: frame.scale, footOffset: frame.footOffset, body: [angle, sx, sy] });
        extend(bounds, px, py);
      }
    }
  }
  return bounds;
}

function includeFrame(union, frame, dimensions, motion, interval, mirrored, extraX = [0, 0]) {
  const { width, height, left, ground, reach, percentX } = dimensions;
  const [fromAt, untilAt] = interval;
  const actorFrom = sample(motion.actor, fromAt), actorUntil = sample(motion.actor, untilAt);
  const bodyFrom = sample(motion.body, fromAt), bodyUntil = sample(motion.body, untilAt);
  const factorX = percentX ? width / 100 : reach;
  const xs = [actorFrom[0] * factorX, actorUntil[0] * factorX];
  const ys = [actorFrom[1] * height / 100, actorUntil[1] * height / 100];
  const bodyYs = [finite(bodyFrom[3]) * height / 100, finite(bodyUntil[3]) * height / 100];
  const minX = Math.min(...xs) + Math.min(...extraX), maxX = Math.max(...xs) + Math.max(...extraX);
  const minY = Math.min(...ys) + Math.min(...bodyYs), maxY = Math.max(...ys) + Math.max(...bodyYs);
  // right/bottom include the last opaque pixel; project the outside edge of that pixel.
  const b = frame.bounds;
  for (const x of [b.left / 512, (b.right + 1) / 512]) {
    for (const y of [b.top / 512, (b.bottom + 1) / 512]) {
      const corner = cornerEnvelope([x, y], frame, width, bodyFrom, bodyUntil, mirrored);
      extend(union, left + minX + corner.left, ground - width + minY + corner.top);
      extend(union, left + maxX + corner.right, ground - width + maxY + corner.bottom);
    }
  }
  // The shadow/foot origin also remains inside the arena during anticipation and landing.
  extend(union, left + minX + width * .18, ground + minY);
  extend(union, left + maxX + width * .83, ground + maxY + width * .025);
}

export function fitCinematicDuel({ arena, attacker, defender, attackerKey, defenderKey, plan, acting, contact, contactFraction = .37, miss, support, finish, defenderBoss }) {
  const width = arena.clientWidth, height = arena.clientHeight;
  const attackerWidth = attacker.offsetWidth, attackerHeight = attacker.offsetHeight;
  if (width <= 0 || height <= 0 || attackerWidth <= 0) return { fitted: false };
  const attackerLeft = attacker.offsetLeft;
  const attackerGround = height - (parseFloat(getComputedStyle(attacker).bottom) || 0);
  const defenderWidth = defender?.offsetWidth || 0, defenderHeight = defender?.offsetHeight || 0;
  const deltaLeft = defender ? defender.offsetLeft - attackerLeft : 0;
  let deltaGround = defender ? height - (parseFloat(getComputedStyle(defender).bottom) || 0) - attackerGround : 0;
  const moving = Boolean(defender && plan.moving && !support);
  const defenseMotion = defender ? defenderMotion(plan, { miss, support, finish, defenderBoss }) : null;
  if (moving && !miss) {
    const aligned = alignContactPlane({ plan, acting, attackerKey, attackerWidth, attackerHeight,
      defenderWidth, defenderHeight, defenseMotion, contactFraction });
    deltaGround = aligned.deltaGround;
    contactFraction = aligned.contactFraction;
  }
  const reach = moving ? getCinematicReach({ attackerLeft: 0, attackerWidth, defenderLeft: deltaLeft, defenderWidth,
    ...contact, advance: sample(acting.actor, plan.impact)[0] })
    : Math.max(0, defender ? deltaLeft - attackerWidth * .51 : 0);
  const attackMotion = { actor: acting.actor, body: acting.body, poses: plan.poses };
  const offsets = new Set([0, 1, ...plan.releases, ...plan.contacts]);
  for (const motion of [attackMotion, defenseMotion].filter(Boolean)) {
    for (const track of [motion.actor, motion.body, motion.poses]) for (const [at] of track) offsets.add(clamp(at));
  }
  for (const echo of plan.afterimages || []) { offsets.add(clamp(echo.at)); offsets.add(clamp(echo.until)); }
  const times = [...offsets].sort((left, right) => left - right);
  const union = emptyBounds();
  const attackerDimensions = { width: attackerWidth, height: attackerHeight, left: 0, ground: 0, reach, percentX: false };
  const defenderDimensions = { width: defenderWidth, height: defenderHeight, left: deltaLeft, ground: deltaGround, reach: 0, percentX: true };
  for (let index = 0; index < times.length - 1; index++) {
    const interval = [times[index], times[index + 1]];
    const middle = (interval[0] + interval[1]) * .5;
    // At a step boundary include both adjacent poses, not just the image before the switch.
    for (const pose of new Set([getDuelPoseAt(plan, interval[0]), getDuelPoseAt(plan, middle), getDuelPoseAt(plan, interval[1])])) {
      includeFrame(union, frameFor(attackerKey, pose, plan, pose === 'skill'), attackerDimensions, attackMotion, interval, false);
    }
    if (defender) {
      for (const pose of new Set([poseAt(defenseMotion.poses, interval[0]), poseAt(defenseMotion.poses, middle), poseAt(defenseMotion.poses, interval[1])])) {
        includeFrame(union, frameFor(defenderKey, pose, plan), defenderDimensions, defenseMotion, interval, true);
      }
    }
    for (const echo of plan.afterimages || []) {
      if (interval[1] < echo.at || interval[0] > echo.until) continue;
      const pose = plan.contactPose === 'strike' ? 'strike' : 'skill';
      const echoMotion = { actor: acting.actor, body: [[0, 0, 1, 1], [1, 0, 1, 1]] };
      includeFrame(union, frameFor(attackerKey, pose, plan, pose === 'skill'), attackerDimensions, echoMotion, interval, false,
        [echo.distance * attackerWidth, echo.distance * 1.5 * attackerWidth]);
    }
  }
  if (![union.left, union.top, union.right, union.bottom, reach].every(Number.isFinite)) return { fitted: false };
  // Preserve the boss-to-ally size ratio: the pair receives one uniform layout factor.
  const padding = Math.max(7, Math.min(14, Math.min(width, height) * .025));
  const spanWidth = Math.max(1, union.right - union.left), spanHeight = Math.max(1, union.bottom - union.top);
  const factor = Math.min(1, Math.max(1, width - padding * 2 - 5) / spanWidth, Math.max(1, height - padding * 2 - 5) / spanHeight);
  const lowX = padding + 2.5 - union.left * factor, highX = width - padding - 2.5 - union.right * factor;
  const lowY = padding + 2.5 - union.top * factor, highY = height - padding - 2.5 - union.bottom * factor;
  const center = (union.left + union.right) * .5;
  const wantedX = attackerLeft + center * (1 - factor);
  const translateX = Math.max(lowX, Math.min(highX, wantedX));
  const translateY = Math.max(lowY, Math.min(highY, attackerGround));
  const place = (actor, actorWidth, x, foot) => {
    actor.style.width = `${actorWidth * factor}px`;
    actor.style.left = `${x}px`;
    actor.style.right = 'auto';
    actor.style.bottom = `${height - foot}px`;
  };
  place(attacker, attackerWidth, translateX, translateY);
  if (defender) place(defender, defenderWidth, translateX + deltaLeft * factor, translateY + deltaGround * factor);
  return { fitted: true, factor, contactFraction };
}
