const clamp = value => Math.max(0, Math.min(1, value));
const tracks = points => [...new Map(points.map(point => [Number(point[0].toFixed(5)), point])).values()].sort((a, b) => a[0] - b[0]);
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
const elementColors = { fire: '#ffb469', ice: '#b8efff', lightning: '#faf0a8', shadow: '#d8baf4', holy: '#fff0b9', poison: '#c0df89', music: '#f4bcdd' };

function sample(points, at) {
  const end = points.findIndex(point => point[0] >= at);
  if (end <= 0) return points[Math.max(0, end)].slice(1);
  const a = points[end - 1], b = points[end], t = (at - a[0]) / (b[0] - a[0]);
  return a.slice(1).map((value, i) => value + (b[i + 1] - value) * t);
}

// Keep the existing character-specific paths, but direct every release and contact as an acted beat.
export function directDuelPerformance(plan, weapon, presentation, scene) {
  const profile = weapons[weapon] || weapons.slash;
  const moving = plan.actor.some(([, x]) => x > .35);
  const support = presentation.support;
  const shots = plan.effects.filter(effect => ['arrow', 'shell', 'vial', 'ice'].includes(effect.shape) && Math.abs(effect.to[0] - effect.from[0]) > .4);
  const releases = support ? [.45] : plan.contacts.map(at => {
    const shot = shots.find(effect => Math.abs(effect.until - at) <= .025);
    return shot?.at ?? (moving ? at - .008 : Math.max(plan.skill ? .32 : .29, at - .12));
  });
  const poses = [[0, 'ready']];
  if (moving) poses.push([plan.skill ? .18 : .08, 'run-a'], [plan.skill ? .25 : .15, 'run-b'], [plan.skill ? .31 : .22, 'run-a']);
  else poses.push([plan.skill ? .20 : .12, 'windup']);
  const body = [[0, 0, 1, 1], [.07, 0, 1, 1]];
  for (const [index, release] of releases.entries()) {
    const previous = releases[index - 1];
    const windup = Math.max(moving ? (plan.skill ? .34 : .29) : .16, previous ? (previous + release) / 2 : release - .13);
    poses.push([windup, 'windup'], [release, plan.skillPose ? 'skill' : 'strike']);
    const hold = Math.min(release + (support ? .20 : .045), releases[index + 1] ? (release + releases[index + 1]) / 2 - .012 : .75);
    poses.push([hold, 'recover']);
    const gain = plan.skill ? 1.15 : 1;
    body.push([windup, profile.pull * gain, 1 - profile.stretch, 1 + profile.stretch * .4],
      [Math.max(windup + .005, release - .012), profile.pull * gain, 1 - profile.stretch, 1 + profile.stretch * .4],
      [release + .008, profile.swing * gain, 1 + profile.stretch, 1 - profile.stretch * .65],
      [hold, profile.swing * gain, 1 + profile.stretch, 1 - profile.stretch * .65]);
  }
  const recovery = Math.min(.78, Math.max(...releases) + .12);
  poses.push([recovery, 'recover']);
  if (moving) poses.push([.78, 'run-b'], [.84, 'run-a'], [.90, 'run-b']);
  poses.push([.965, 'ready'], [1, 'ready']);
  body.push([recovery + .02, profile.swing * .22, 1, 1], [.88, -1, 1, 1], [.965, 0, 1, 1], [1, 0, 1, 1]);
  const actor = [...plan.actor];
  if (moving && !support && !presentation.miss) {
    for (const at of plan.contacts) {
      const contact = sample(plan.actor, at);
      actor.push([at, ...contact], [at + .023, ...contact]);
    }
  }
  const color = plan.skill && elementColors[presentation.effect] || profile.color;
  const impacts = support ? [] : plan.contacts.map((at, index) => ({
    at, color, material: plan.skill && elementColors[presentation.effect] ? presentation.effect : profile.material,
    strength: (plan.skill ? 1.15 : 1) * (scene.outcome?.crit ? 1.18 : 1),
    count: plan.skill ? 12 : 8, index,
  }));
  return { ...plan, actor: tracks(actor), poses: tracks(poses), body: tracks(body), releases, impacts,
    footfalls: moving ? poses.filter(([, pose]) => pose.startsWith('run')).map(([at]) => at) : [],
    contactPause: .023, weapon, moving };
}

export function getImpactParticle(impact, index) {
  const angle = (index * 2.399963 + impact.index * .7) % (Math.PI * 2);
  const reach = (20 + index % 4 * 11) * impact.strength;
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach * .72,
    gravity: ['crush', 'blast'].includes(impact.material) ? 18 : 4,
    angle: angle * 180 / Math.PI, delay: index % 3 * .002, end: clamp(impact.at + .13 + index % 4 * .012) };
}
