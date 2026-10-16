const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = value => Math.max(0, Math.min(1, finite(value)));
const bound = (value, low, high) => Math.max(low, Math.min(high, finite(value, low)));

// Every new visual belongs to the existing duel animation pool. No damage, clock or pose is changed.
export function animateEpicCombat(root, plan, {
  arena, attacker, defender, d, dy, ground, weaponPoint, miss, support, selfSupport, shake, finish,
}, animate) {
  const width = finite(arena.clientWidth), height = finite(arena.clientHeight);
  if (width <= 0 || height <= 0) return;
  const play = (element, frames) => {
    if (!element) return;
    // Stable ordering also handles coincident contacts and short final contact windows.
    const safe = frames.map((frame, order) => [clamp(frame.offset), order, frame])
      .sort((left, right) => left[0] - right[0] || left[1] - right[1])
      .map(([offset, , frame]) => ({ ...frame, offset }));
    animate(element, safe);
  };
  const contacts = [...new Set((plan.contacts || [plan.impact]).filter(Number.isFinite).map(clamp))].sort((left, right) => left - right);
  const impact = contacts[0] ?? clamp(plan.impact);
  const lastContact = contacts.at(-1) ?? impact;
  const firstRelease = clamp(plan.releases?.[0] ?? impact - .02);
  const targetX = bound(d, 0, width), targetY = bound(dy, 0, height);
  const floorY = bound(ground, 0, height);
  const unit = Math.max(1, Math.min(finite(attacker.offsetWidth, 150), height * .68));
  const theme = plan.spectacle?.theme || root.dataset.epicTheme || 'martial';
  const quiet = support || selfSupport;
  const heroFlame = plan.spectacle?.sword?.kind === 'fire' && plan.skill && theme === 'fire' && plan.moving;
  const ranged = ['bow', 'cannon', 'cast'].includes(plan.weapon);
  const bossStrike = root.dataset.epicBossSide === 'attacker';
  const colors = {
    fire: '#ff9b50', ice: '#a9eaff', lightning: '#c9efff', shadow: '#c8a6ff',
    holy: '#fff0b5', heal: '#c5efd3', guard: '#b1e1ef', poison: '#c3e78d',
    water: '#a4eeed', nature: '#b5e0a4', music: '#ebc5e6', earth: '#dec69b', wind: '#c7e9be',
  };
  root.style.setProperty('--cinematic-impact-color', colors[theme] || '#f2dfb7');
  // Actors and the background paint directly in the arena. Do not composite the
  // entire battlefield into a transformed 3D layer in embedded web views.

  // These are separate decorative planes, never a transformed parent of actors or the scene image.
  if (shake) {
    for (const [selector, distance] of [['.cinematic-atmosphere', 2], ['.cinematic-ground-bed', 3], ['.cinematic-foreground', 5]]) {
      const amount = distance * (quiet ? .25 : bossStrike ? 1 : .7);
      play(root.querySelector(selector), [
        { offset: 0, transform: 'translate(0,0)' },
        { offset: Math.max(0, firstRelease - .08), transform: 'translate(0,0)', easing: 'cubic-bezier(.3,.1,.6,1)' },
        { offset: impact, transform: `translate(${-amount}px,${amount * .18}px)` },
        { offset: Math.min(.94, lastContact + .09), transform: `translate(${-amount}px,${amount * .18}px)` },
        { offset: 1, transform: 'translate(0,0)' },
      ]);
    }
  }
  const weather = root.querySelector('[data-cinematic-weather]')?.dataset.cinematicWeather;
  for (const [index, mote] of [...root.querySelectorAll('.cinematic-motes > i')].slice(0, 12).entries()) {
    const rising = ['embers', 'ash', 'stars'].includes(weather);
    const depth = Number(mote.dataset.cinematicDepth) || 0;
    const horizontal = (index % 2 ? 1 : -1) * (3 + index % 4 * 2) * (1 + depth * .2);
    const vertical = (rising ? -1 : 1) * (5 + index % 5 * 2);
    play(mote, [
      { offset: 0, opacity: .12 + index % 3 * .06, transform: 'translate(0,0)' },
      { offset: .46, opacity: .3 + depth * .06, transform: `translate(${horizontal * .48}px,${vertical * .48}px)` },
      { offset: 1, opacity: .08, transform: `translate(${horizontal}px,${vertical}px)` },
    ]);
  }

  const rimFrames = beats => [
    { offset: 0, opacity: 0, transform: 'translate(-50%,-50%) scale(.8)' },
    ...beats.flatMap(at => [
      { offset: Math.max(0, at - .025), opacity: 0, transform: 'translate(-50%,-50%) scale(.8)' },
      { offset: at, opacity: quiet ? .18 : .34, transform: 'translate(-50%,-50%) scale(1)' },
      { offset: Math.min(.99, at + .075), opacity: 0, transform: 'translate(-50%,-50%) scale(1.08)' },
    ]),
    { offset: 1, opacity: 0, transform: 'translate(-50%,-50%) scale(1.08)' },
  ];
  play(attacker.querySelector('.cinematic-fighter-light'), rimFrames(ranged || support ? plan.releases : contacts));
  if (defender && !miss) play(defender.querySelector('.cinematic-fighter-light'), rimFrames(contacts));

  // The opening illustration shares resize, elapsed time, reduced motion and cleanup with the duel.
  const cutIn = root.querySelector('.skill-cut-in.epic-cut-in');
  if (plan.skill && cutIn) {
    play(cutIn, [
      { offset: 0, opacity: 0, transform: 'translateX(-5%)' },
      { offset: .024, opacity: 1, transform: 'translateX(0)', easing: 'cubic-bezier(.2,.65,.3,1)' },
      { offset: .175, opacity: 1, transform: 'translateX(0)' },
      { offset: .235, opacity: 0, transform: 'translateX(4%)' },
      { offset: 1, opacity: 0, transform: 'translateX(4%)' },
    ]);
    play(cutIn.querySelector('.epic-cut-in-art'), [
      { offset: 0, transform: 'translateX(-2%) scale(1.02)' },
      { offset: .024, transform: 'translateX(0) scale(1.02)' },
      { offset: .235, transform: 'translateX(1.5%) scale(1.065)' },
      { offset: 1, transform: 'translateX(1.5%) scale(1.065)' },
    ]);
  }

  // Recovery, guard and misses never acquire offensive contact flourishes.
  if (quiet || miss || !contacts.length) return;
  const pulses = (make, lifetime = .13) => {
    const frames = [{ offset: 0, ...make(0, 0) }];
    for (const [index, at] of contacts.entries()) {
      const end = Math.max(at, Math.min(.99, at + lifetime, (contacts[index + 1] ?? 1) - .001));
      const peak = Math.min(end, at + .009);
      frames.push(
        { offset: at, ...make(0, 0) },
        { offset: peak, ...make(1, .22) },
        { offset: end, ...make(0, 1) },
      );
    }
    frames.push({ offset: 1, ...make(0, 1) });
    return frames;
  };
  const place = (node, x, y, size) => {
    if (!node) return;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.width = `${size}px`;
    node.style.height = `${size}px`;
  };
  const localLight = root.querySelector('.epic-contact-light');
  place(localLight, targetX, targetY, Math.min(unit * 1.65, height * .82));
  play(localLight, pulses((alpha, progress) => ({
    opacity: alpha * (heroFlame ? .28 : plan.skill ? .21 : .13),
    transform: `translate(-50%,-50%) scale(${.48 + progress * .56})`,
  }), .12));

  const floor = root.querySelector('.epic-floor-pressure');
  place(floor, targetX, floorY, Math.min(unit * 1.25, width * .48));
  play(floor, pulses((alpha, progress) => ({
    opacity: alpha * (plan.skill ? .62 : .37),
    transform: `translate(-50%,-50%) scale(${.25 + progress * 1.3},${.09 + progress * .39})`,
  }), .18));

  const flare = root.querySelector('.epic-hit-flare');
  place(flare, targetX, targetY, Math.min(unit * .65, height * .4));
  play(flare, pulses((alpha, progress) => ({
    opacity: alpha * (plan.skill ? .78 : .54),
    transform: `translate(-50%,-50%) rotate(${-18 + progress * 25}deg) scale(${.18 + progress * 1.2})`,
  }), .105));

  const bounceLight = root.querySelector('.cinematic-impact-light');
  place(bounceLight, targetX, targetY + unit * .13, Math.min(unit * (bossStrike ? 2.1 : 1.8), width * .8, height * .92));
  play(bounceLight, pulses((alpha, progress) => ({
    opacity: alpha * (heroFlame ? .24 : bossStrike ? .22 : .17),
    transform: `translate(-50%,-50%) scale(${.62 + progress * .58})`,
  }), .17));

  const groundWave = root.querySelector('.cinematic-ground-wave');
  place(groundWave, targetX, floorY, Math.min(unit * (bossStrike ? 1.65 : 1.4), width * .72));
  play(groundWave, pulses((alpha, progress) => ({
    opacity: alpha * (finish ? .7 : bossStrike || plan.skill ? .58 : .36),
    transform: `translate(-50%,-50%) scale(${.35 + progress * 1.25})`,
  }), bossStrike ? .21 : .17));

  const cracks = root.querySelector('.cinematic-contact-cracks');
  if (cracks) {
    cracks.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const radius = Math.min(unit * (bossStrike ? .7 : .45), width * .28);
    const segments = Array.from({ length: bossStrike ? 7 : 5 }, (_, index) => {
      const angle = index / (bossStrike ? 7 : 5) * Math.PI * 2 + .24;
      const x = bound(targetX + Math.cos(angle) * radius, 5, width - 5);
      const y = bound(floorY + Math.sin(angle) * radius * .24, 5, height - 5);
      const midX = targetX + (x - targetX) * .53 + (index % 2 ? 2 : -2);
      const midY = floorY + (y - floorY) * .46 - 1;
      return `M ${targetX} ${floorY} L ${midX} ${midY} L ${x} ${y}`;
    }).join(' ');
    for (const path of cracks.querySelectorAll('.cinematic-crack-line')) path.setAttribute('d', segments);
    play(cracks, pulses((alpha, progress) => ({
      opacity: alpha * (bossStrike || plan.skill ? .6 : .28) * (1 - progress * .2),
    }), .25));
  }

  const ribbon = root.querySelector('.epic-strike-ribbon');
  if (ribbon) {
    ribbon.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const source = weaponPoint(firstRelease);
    const sourceX = bound(source?.[0], 0, width), sourceY = bound(source?.[1], 0, height);
    const distance = targetX - sourceX;
    const lift = Math.min(unit * (heroFlame ? .7 : .23), height * .42);
    // Ranged attacks keep their existing release/projectile; their thin arc begins at contact.
    const path = ranged
      ? `M ${targetX - unit * .16} ${targetY - unit * .1} Q ${targetX + unit * .16} ${targetY - unit * .17} ${targetX + unit * .06} ${targetY + unit * .15}`
      : `M ${sourceX} ${sourceY} C ${sourceX + distance * .25} ${bound(sourceY - lift, 0, height)} ${targetX + unit * .12} ${bound(targetY - lift, 0, height)} ${targetX} ${targetY}`;
    const windows = contacts.map((at, index) => ({
      at,
      start: ranged ? at : Math.min(at, clamp(plan.releases?.[index] ?? at - .018)),
      end: Math.max(at, Math.min(.99, at + .095, (contacts[index + 1] ?? 1) - .001)),
    }));
    const ribbonFrames = [{ offset: 0, opacity: 0 }];
    for (const { at, start, end } of windows) {
      ribbonFrames.push(
        { offset: start, opacity: 0 },
        { offset: Math.min(at, start + .006), opacity: heroFlame ? .94 : .53 },
        { offset: Math.min(end, at + .018), opacity: heroFlame ? .94 : .53 },
        { offset: end, opacity: 0 },
      );
    }
    ribbonFrames.push({ offset: 1, opacity: 0 });
    play(ribbon, ribbonFrames);
    for (const stroke of ribbon.querySelectorAll('path')) {
      stroke.setAttribute('d', path);
      stroke.setAttribute('pathLength', '1000');
      stroke.style.strokeDasharray = '1000';
      const frames = [{ offset: 0, strokeDashoffset: 1000 }];
      for (const { at, start, end } of windows) {
        frames.push(
          { offset: start, strokeDashoffset: 1000 },
          { offset: ranged ? Math.min(end, at + .018) : at, strokeDashoffset: 0 },
          { offset: end, strokeDashoffset: -1000 },
        );
      }
      frames.push({ offset: 1, strokeDashoffset: -1000 });
      play(stroke, frames);
    }
  }

  // Deterministic twelve-piece budget: fragments depart from contact, never from a remote actor.
  for (const [index, piece] of [...root.querySelectorAll('.epic-debris')].slice(0, 12).entries()) {
    place(piece, targetX, targetY, 2 + index % 3);
    const angle = -.95 + index * 2.399963;
    const distance = unit * (.16 + index % 4 * .07) * (plan.skill ? 1.12 : .78);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance * .67 - unit * .1;
    const frames = [{ offset: 0, opacity: 0, transform: 'translate(-50%,-50%) scale(0)' }];
    for (const [contactIndex, at] of contacts.entries()) {
      const start = Math.min(.99, at + index % 3 * .002);
      const end = Math.max(start, Math.min(.99, at + .17 + index % 4 * .01, (contacts[contactIndex + 1] ?? 1) - .001));
      const peak = Math.min(end, start + .025);
      frames.push(
        { offset: start, opacity: 0, transform: 'translate(-50%,-50%) scale(.2)' },
        { offset: Math.min(peak, start + .003), opacity: .8, transform: 'translate(-50%,-50%) scale(.8)' },
        { offset: peak, opacity: .72, transform: `translate(${x * .48}px,${y * .55}px) rotate(${index * 47}deg) scale(1)` },
        { offset: end, opacity: 0, transform: `translate(${x}px,${y + unit * .18}px) rotate(${index * 47 + 110}deg) scale(.3)` },
      );
    }
    frames.push({ offset: 1, opacity: 0 });
    play(piece, frames);
  }
}
