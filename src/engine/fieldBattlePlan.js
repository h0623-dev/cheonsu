import { getCombatChoreography, getCombatPresentation, getCombatTiming, combatUnitIds } from '../data/combatArt.js';

export const FIELD_TILE = { width: 112, height: 56 };
export const clamp01 = value => Math.max(0, Math.min(1, value));
export const smooth = value => { const p = clamp01(value); return p * p * (3 - 2 * p); };
export const mix = (a, b, p) => a + (b - a) * p;
export function projectCell(unit) { return { x: (unit.x - unit.y) * 56, y: (unit.x + unit.y) * 28 }; }

export function makeFieldBattlePlan(scene, attackerKey, defenderKey) {
  const choreography = getCombatChoreography(attackerKey, scene);
  const presentation = getCombatPresentation(attackerKey, scene);
  const source = { ...scene.attacker, artKey: attackerKey };
  const target = { ...scene.defender, artKey: defenderKey };
  const sourcePoint = projectCell(source), targetPoint = projectCell(target);
  const length = Math.hypot(targetPoint.x - sourcePoint.x, targetPoint.y - sourcePoint.y);
  const vector = length > 0 ? { x: (targetPoint.x - sourcePoint.x) / length, y: (targetPoint.y - sourcePoint.y) / length } : { x: 1, y: 0 };
  const roster = new Map((scene.fieldUnits || [source, target]).filter(unit => unit.hp > 0).map(unit => [unit.id, unit]));
  roster.set(source.id, source); roster.set(target.id, target);
  const targets = scene.fieldTargets?.length ? scene.fieldTargets : [{ ...target, postHp: scene.defenderPostHp ?? target.hp }];
  return { ...choreography, ...presentation, source, target, targets, units: [...roster.values()], sourcePoint, targetPoint, vector,
    stageId: scene.stageId || 1, map: scene.fieldMap, timing: getCombatTiming(scene),
    reach: Math.max(0, length - 46), duration: scene.durationMs || 2200,
    supported: combatUnitIds.includes(attackerKey) && combatUnitIds.includes(defenderKey),
  };
}

function sampleTrack(track, p) {
  const nextIndex = track.findIndex(point => point[0] >= p);
  if (nextIndex <= 0) return track[nextIndex < 0 ? track.length - 1 : 0].slice(1);
  const a = track[nextIndex - 1], b = track[nextIndex];
  const fraction = smooth((p - a[0]) / Math.max(.001, b[0] - a[0]));
  return a.slice(1).map((value, index) => mix(value, b[index + 1], fraction));
}

export function sampleFieldActor(plan, time, reduced = false) {
  const p = clamp01(time), [advance, lift, lean] = sampleTrack(plan.actor, p);
  const previous = sampleTrack(plan.actor, Math.max(0, p - .016))[0];
  const moving = !reduced && plan.style === 'melee' && !plan.support && Math.abs(advance - previous) > .028;
  const melee = !reduced && plan.style === 'melee' && !plan.support;
  const contact = plan.contacts.some(at => p >= at - .035 && p < at + .055);
  const stride = Math.sin(p * 76);
  let pose = 'recover';
  if (!reduced) {
    pose = plan.poses.filter(([at]) => p >= at).at(-1)?.[1] || 'recover';
    if (pose === 'ready') pose = 'recover';
    if (moving && !contact && (pose.startsWith('run-') || p < .34 || p > .74)) pose = Math.floor(p * 26) % 2 ? 'run-a' : 'run-b';
    if (contact && plan.style === 'melee') pose = plan.skillPose ? 'skill' : 'strike';
  }
  const lateral = melee ? Math.sin(clamp01(advance) * Math.PI) * (plan.motion.includes('cross') || plan.motion.includes('leap') ? 28 : 9) : 0;
  return {
    x: plan.sourcePoint.x + plan.vector.x * (reduced ? 0 : melee ? plan.reach * advance : advance * 25) - plan.vector.y * lateral,
    y: plan.sourcePoint.y + plan.vector.y * (melee ? plan.reach * advance : 0) + plan.vector.x * lateral,
    lift: reduced ? 0 : -lift * 1.4 + (moving ? Math.abs(stride) * 3 : Math.sin(p * Math.PI * 4) * .7),
    lean: reduced ? 0 : lean * .6 + (moving ? stride * 1.3 : 0),
    squash: moving ? 1 + stride * .018 : 1, pose, moving,
    flip: (plan.vector.x >= 0 ? 1 : -1) * (moving && advance < previous ? -1 : 1),
  };
}

export function fieldCamera(plan, width, height, p, reduced = false) {
  const points = [plan.sourcePoint, ...plan.targets.map(projectCell)];
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y)) - 130, maxY = Math.max(...points.map(point => point.y)) + 35;
  const availableHeight = Math.max(160, height - 180);
  const base = Math.min(2.2, Math.max(.22, (width - 54) / (maxX - minX + 210)), availableHeight / (maxY - minY + 160));
  const emphasis = reduced ? 0 : Math.sin(smooth(p) * Math.PI) * (plan.skill ? .12 : .06);
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 + (reduced ? 0 : Math.sin(p * Math.PI * 2) * 6), scale: base * (1 + emphasis), width, height };
}

export function targetReaction(plan, target, p, reduced = false) {
  const point = projectCell(target);
  if (reduced || plan.support) return { ...point, pose: 'recover', alpha: 1, lean: 0 };
  const recent = plan.contacts.filter(at => p >= at).at(-1);
  const elapsed = recent === undefined ? -1 : p - recent;
  const recoil = elapsed >= 0 ? Math.sin(clamp01(elapsed / .16) * Math.PI) : 0;
  const dodge = plan.miss ? Math.sin(clamp01((p - plan.impact + .1) / .23) * Math.PI) * 27 : 0;
  const finish = !plan.miss && target.postHp <= 0 && p > plan.impact;
  return { x: point.x + plan.vector.x * recoil * 13 + dodge, y: point.y + plan.vector.y * recoil * 13,
    lean: finish ? smooth((p - .72) / .22) * 35 : recoil * 8,
    alpha: finish ? 1 - smooth((p - .82) / .18) : 1,
    pose: plan.miss && dodge > 0 ? 'run-a' : recoil > .1 || finish ? 'recoil' : 'recover' };
}
