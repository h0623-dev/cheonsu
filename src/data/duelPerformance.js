const clamp = value => Math.max(0, Math.min(1, value));
const tracks = points => [...new Map(points.filter(point => point.every(Number.isFinite) || typeof point[1] === 'string').map(point => [Number(clamp(point[0]).toFixed(5)), [clamp(point[0]), ...point.slice(1)]])).values()].sort((a, b) => a[0] - b[0]);
const weapons = {
  slash: { pull: -8, swing: 9, stretch: .025, material: 'steel', color: '#ffe3aa' },
  thrust: { pull: -5, swing: 5, stretch: .045, material: 'pierce', color: '#f8edc5' },
  heavy: { pull: -12, swing: 12, stretch: .035, material: 'crush', color: '#f6ba79' },
  guard: { pull: -6, swing: 7, stretch: .025, material: 'crush', color: '#c3e9e6' },
  quick: { pull: -7, swing: 10, stretch: .04, material: 'steel', color: '#d8ccef' },
  beast: { pull: -5, swing: 8, stretch: .05, material: 'claw', color: '#ede0b8' },
  whip: { pull: -10, swing: 10, stretch: .03, material: 'lash', color: '#e8c997' },
  fist: { pull: -7, swing: 8, stretch: .04, material: 'crush', color: '#f5d7a0' },
  bow: { pull: -4, swing: 3, stretch: .015, material: 'pierce', color: '#d6efc2' },
  cannon: { pull: 2, swing: -8, stretch: .035, material: 'blast', color: '#ffd394' },
  cast: { pull: -4, swing: 5, stretch: .015, material: 'magic', color: '#c6e9fa' },
};
const elementColors = { fire: '#ffb469', ice: '#b8efff', lightning: '#faf0a8', shadow: '#d8baf4', holy: '#fff0b9', poison: '#c0df89', music: '#f4bcdd', nature: '#c1e3a2', water: '#a6e8ed' };

export function sampleDuelTrack(points, at) {
  const end = points.findIndex(point => point[0] >= at);
  if (end < 0) return points.at(-1).slice(1);
  if (end === 0) return points[0].slice(1);
  const a = points[end - 1], b = points[end], t = (at - a[0]) / (b[0] - a[0]);
  return a.slice(1).map((value, i) => value + (b[i + 1] - value) * t);
}

export function getDuelPoseAt(plan, at) {
  let pose = 'ready';
  for (const [offset, active] of plan.poses) {
    if (offset > at) break;
    pose = active;
  }
  return pose;
}

// Keep the existing character-specific paths, but direct every release and contact as an acted beat.
export function directDuelPerformance(plan, weapon, presentation, scene) {
  const profile = weapons[weapon] || weapons.slash;
  const moving = plan.actor.some(([, x]) => x > .35);
  const support = presentation.support;
  const shots = plan.effects.filter(effect => ['arrow', 'shell', 'vial', 'ice'].includes(effect.shape) && Math.abs(effect.to[0] - effect.from[0]) > .4);
  const releases = support ? [.45] : plan.contacts.map(at => {
    const shot = shots.find(effect => Math.abs(effect.until - at) <= .035);
    return shot?.at ?? (moving ? at - .018 : Math.max(plan.skill ? .32 : .29, at - .12));
  });
  const pause = presentation.miss || support ? 0 : scene.outcome?.crit || scene.finish ? .040 : plan.skill ? .033 : .028;
  const contactPose = plan.skillPose && !(plan.skill && presentation.style === 'melee' && !support) ? 'skill' : 'strike';
  const physicalSkill = plan.skill && plan.skillPose && contactPose === 'strike';
  const poses = [[0, 'ready']];
  if (moving) {
    const stepStart = plan.skill ? .20 : .10;
    const lastStep = releases[0] - (weapon === 'heavy' ? .16 : .115);
    for (let at = stepStart, step = 0; at < lastStep; at += .065, step++) poses.push([at, step % 2 ? 'run-b' : 'run-a']);
  }
  else poses.push([plan.skill ? .20 : .12, 'windup']);
  const body = [[0, 0, 1, 1], [.07, 0, 1, 1]];
  for (const [index, release] of releases.entries()) {
    const previous = releases[index - 1];
    const windup = Math.max(moving ? (plan.skill ? .31 : .25) : .16, previous ? (previous + release) / 2 : release - (weapon === 'heavy' ? .17 : .12), previous && moving && pause ? plan.contacts[index - 1] + pause + .006 : 0);
    poses.push([windup, 'windup']);
    if (physicalSkill) {
      const prepared = Math.max(windup + .02, release - .07);
      if (prepared < release - .003) poses.push([prepared, 'skill']);
    }
    poses.push([release, contactPose]);
    const contact = plan.contacts[index] ?? plan.impact;
    const followthrough = Math.min(Math.max(release + (support ? .20 : .055), contact + pause + .025), releases[index + 1] ? (contact + releases[index + 1]) / 2 - .006 : .76);
    const hold = moving && pause ? Math.max(contact + pause + .006, followthrough) : followthrough;
    poses.push([hold, 'recover']);
    const gain = plan.skill ? 1.15 : 1;
    body.push([windup, profile.pull * gain, 1 - profile.stretch, 1 + profile.stretch * .4],
      [Math.max(windup + .005, release - .025), profile.pull * gain, 1 - profile.stretch, 1 + profile.stretch * .4],
      [moving ? contact : release + .013, profile.swing * gain, 1 + profile.stretch, 1 - profile.stretch * .65]);
    if (moving && pause) body.push([contact + pause, profile.swing * gain, 1 + profile.stretch, 1 - profile.stretch * .65]);
    body.push([hold, profile.swing * gain * .65, 1 + profile.stretch * .25, 1 - profile.stretch * .2]);
  }
  const recovery = Math.min(.78, Math.max(...plan.contacts, ...releases) + .115);
  poses.push([recovery, 'recover']);
  if (moving) poses.push([.78, 'run-b'], [.84, 'run-a'], [.90, 'run-b']);
  poses.push([.965, 'ready'], [1, 'ready']);
  body.push([recovery + .02, profile.swing * .22, 1, 1], [.88, -1, 1, 1], [.965, 0, 1, 1], [1, 0, 1, 1]);
  const actor = [...plan.actor];
  if (moving && !support && !presentation.miss) {
    for (const at of plan.contacts) {
      const contact = sampleDuelTrack(plan.actor, at);
      actor.push([at, ...contact], [at + pause, ...contact]);
    }
  }
  const color = plan.skill && elementColors[presentation.effect] || profile.color;
  const impacts = support ? [] : plan.contacts.map((at, index) => ({
    at, color, material: plan.skill && elementColors[presentation.effect] ? presentation.effect : profile.material,
    strength: (plan.skill ? 1.15 : 1) * (scene.outcome?.crit ? 1.18 : 1),
    count: plan.skill ? 12 : 8, index, pause,
  }));
  const afterimages = !support && !presentation.miss && (plan.skill || scene.outcome?.crit)
    ? releases.filter((_, index) => moving && index === releases.length - 1).flatMap(at => [{ at: at + .004, until: at + .072, distance: -.06 }, { at: at + .013, until: at + .083, distance: -.115 }]) : [];
  const effects = plan.effects.map(effect => {
    if (support || !['arrow','shell','vial','ice','flame'].includes(effect.shape) || effect.from[0] > .35 || effect.to[0] < .9) return effect;
    const contact = plan.contacts.find(at => Math.abs(effect.until - at) <= .035);
    return contact === undefined ? effect : { ...effect, until: contact, to: [1, effect.to[1]] };
  });
  return { ...plan, effects, actor: tracks(actor), poses: tracks(poses), body: tracks(body), releases, impacts,
    footfalls: moving ? poses.filter(([, pose]) => pose.startsWith('run')).map(([at]) => at) : [],
    contactPause: pause, contactPose, weapon, moving, afterimages };
}

export function getDuelDefenderReaction(plan, { miss = false, support = false, finish = false } = {}) {
  if (support) return { actor: [[0, 0, 0], [1, 0, 0]], body: [[0, 0, 1, 1], [1, 0, 1, 1]] };
  if (miss) return { actor: [[0, 0, 0], [plan.impact - .12, 0, 0], [plan.impact - .028, 12, -2], [plan.impact + .08, 12, -2], [.91, 0, 0], [1, 0, 0]], body: [[0, 0, 1, 1], [plan.impact - .02, 6, 1, .97], [.91, 0, 1, 1], [1, 0, 1, 1]] };
  const actor = [[0, 0, 0]], body = [[0, 0, 1, 1]];
  for (const [index, at] of plan.contacts.entries()) {
    const next = plan.contacts[index + 1] ?? .9;
    const pause = Math.min(plan.contactPause || .028, (next - at) * .7);
    const push = Math.min(.062, Math.max(.012, (next - at) * .35));
    const recoil = (plan.skill ? 7 : 4) * (index === plan.contacts.length - 1 ? 1.2 : .75);
    actor.push([at, 0, 0], [at + pause, 0, 0], [at + pause + push, recoil, 0], [Math.min(next - .005, at + pause + push + .055), recoil * .62, 0]);
    body.push([at - .001, 0, 1, 1], [at, plan.skill ? 5 : 3, .985, .975], [at + pause, plan.skill ? 5 : 3, .985, .975], [at + pause + push, plan.skill ? 9 : 6, .99, .97], [Math.min(next - .005, at + pause + push + .055), 2, 1.01, .99]);
  }
  if (!finish) { actor.push([.92, 0, 0]); body.push([.92, 0, 1, 1]); }
  actor.push([1, finish ? 8 : 0, 0]); body.push([1, finish ? 18 : 0, 1, 1]);
  return { actor: tracks(actor), body: tracks(body) };
}

export function getImpactParticle(impact, index) {
  const angle = (index * 2.399963 + impact.index * .7) % (Math.PI * 2);
  const reach = (20 + index % 4 * 11) * impact.strength;
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach * .72,
    gravity: ['crush', 'blast'].includes(impact.material) ? 18 : 4,
    angle: angle * 180 / Math.PI, delay: index % 3 * .002, end: clamp(impact.at + .13 + index % 4 * .012) };
}
