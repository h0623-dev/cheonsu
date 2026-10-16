const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = value => Math.max(0, Math.min(1, finite(value)));
const bound = (value, low, high) => Math.max(low, Math.min(high, finite(value, low)));

// Every new visual belongs to the existing duel animation pool. No damage, clock or pose is changed.
export function animateEpicCombat(root, plan, {
  arena, attacker, a, d, dy, ground, weaponPoint, miss, support, finish, shake, selfSupport,
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
  const quiet = support || selfSupport || ['holy', 'heal', 'guard'].includes(theme);
  const heroFlame = plan.spectacle?.sword?.kind === 'fire' && plan.skill && theme === 'fire' && plan.moving;
  const ranged = ['bow', 'cannon', 'cast'].includes(plan.weapon);
  const world = root.querySelector('.epic-combat-world');

  // Heading, cut-in, result and HP remain outside this layer and stay legible.
  if (world && shake) {
    const focusX = quiet ? bound(a, 0, width) : targetX;
    const focusY = quiet ? bound(floorY - unit * .36, 0, height) : targetY;
    const halfWidth = width * .5, halfHeight = height * .5;
    // Use only half of the minimum 5% composition inset; a target-biased origin can crop the opposite fighter.
    const edgeBudget = Math.min(width, height) * .025;
    world.style.transformOrigin = `${halfWidth}px ${halfHeight}px`;
    const pushX = bound((halfWidth - focusX) * .025, -Math.min(5, edgeBudget * .22), Math.min(5, edgeBudget * .22));
    const pushY = bound((height * .54 - focusY) * .025, -Math.min(3, edgeBudget * .18), Math.min(3, edgeBudget * .18));
    const zoom = quiet ? 1.014 : finish ? 1.065 : plan.skill ? 1.055 : 1.027;
    const transform = (scale, x = 0, y = 0, tilt = 0) => {
      const safeX = bound(x, -edgeBudget * .45, edgeBudget * .45);
      const safeY = bound(y, -edgeBudget * .4, edgeBudget * .4);
      const maxTilt = Math.atan(edgeBudget * .1 / Math.max(width, height)) * 180 / Math.PI;
      const safeTilt = bound(tilt, -maxTilt, maxTilt);
      const angle = Math.abs(safeTilt) * Math.PI / 180;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      // Budget the rotated/scaled rectangle and translation together on both axes, including contact recoil.
      const horizontalLimit = (halfWidth + edgeBudget - Math.abs(safeX)) / (halfWidth * cosine + halfHeight * sine);
      const verticalLimit = (halfHeight + edgeBudget - Math.abs(safeY)) / (halfHeight * cosine + halfWidth * sine);
      const safeScale = Math.max(1, Math.min(scale, horizontalLimit, verticalLimit));
      return `translate3d(${safeX}px,${safeY}px,0) rotate(${safeTilt}deg) scale(${safeScale})`;
    };
    const camera = [
      { offset: 0, transform: transform(1) },
      { offset: Math.max(0, firstRelease - .12), transform: transform(1), easing: 'cubic-bezier(.22,.65,.35,1)' },
      { offset: impact, transform: transform(zoom, pushX, pushY) },
    ];
    if (!quiet && !miss) {
      for (const [index, at] of contacts.entries()) {
        const until = Math.max(at, Math.min(at + .045, (contacts[index + 1] ?? .95) - .001));
        camera.push(
          { offset: at, transform: transform(zoom, pushX, pushY) },
          { offset: Math.min(until, at + .012), transform: transform(zoom + .003, pushX - 1.2, pushY + .7, plan.skill ? -.13 : -.07) },
          { offset: until, transform: transform(zoom, pushX, pushY) },
        );
      }
    }
    camera.push(
      { offset: Math.min(.96, lastContact + .12), transform: transform(zoom, pushX, pushY), easing: 'cubic-bezier(.25,.1,.25,1)' },
      { offset: 1, transform: transform(1) },
    );
    play(world, camera);
  }

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
