import { getCombatMotionSprite, getCombatEffect } from '../data/combatArt.js';
import metrics from '../data/combatFrameMetrics.json' with { type: 'json' };
import { getWorldTileVisual, WORLD_ART_ROOT } from '../data/worldArt.js';
import { projectCell, fieldCamera, sampleFieldActor, targetReaction, clamp01, mix, smooth } from './fieldBattlePlan.js';

const TAU = Math.PI * 2;
const alphaAt = (p, start, end) => p < start || p > end ? 0 : Math.sin(clamp01((p - start) / (end - start)) * Math.PI);
function line(ctx, points, color, width = 2) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
}
function ellipse(ctx, x, y, rx, ry, color, width = 2) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), 0, 0, TAU); ctx.stroke();
}

function makeGround(plan, images) {
  const rows = plan.map?.length || 10, columns = Math.max(...(plan.map || [Array(10)]).map(row => row.length));
  const minX = -rows * 56 - 80, minY = -70, width = (rows + columns) * 56 + 160, height = (rows + columns) * 28 + 150;
  const scale = Math.min(1, 1800 / width);
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.translate(-minX, -minY);
  const props = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    if (!plan.map?.[y]?.[x]) continue;
    const point = projectCell({ x, y }), visual = getWorldTileVisual(plan.map, x, y, plan.stageId);
    const image = images.get(`${WORLD_ART_ROOT}/terrain/${visual.material}.webp`);
    ctx.save(); ctx.transform(56, 28, -56, 28, point.x, point.y - 28);
    if (image) ctx.drawImage(image, (x % 3) * image.width / 3, (y % 3) * image.height / 3, image.width / 3, image.height / 3, -.006, -.006, 1.012, 1.012);
    else { ctx.fillStyle = '#526950'; ctx.fillRect(0, 0, 1, 1); }
    ctx.restore();
    if (visual.prop) props.push({ ...point, cell: { x, y }, prop: visual.prop, height: parseFloat(visual.style['--prop-height']) * 95 });
  }
  return { canvas, x: minX, y: minY, width, height, props };
}

function sprite(ctx, images, unit, state, skillPose) {
  const key = unit.artKey || unit.id, pose = state.pose || 'recover';
  const source = pose === 'skill' && skillPose ? skillPose.src : getCombatMotionSprite(key, pose);
  const image = images.get(source) || images.get(getCombatMotionSprite(key, 'recover'));
  if (!image) return false;
  const box = metrics[key]?.[pose === 'skill' ? 'strike' : pose] || metrics[key]?.recover;
  const height = key === 'wolf' ? 73 : 112;
  const factor = pose === 'skill' ? height * (skillPose?.stance || 1) / Math.max(1, (skillPose?.bottom ?? image.height) - (skillPose?.top ?? 0) + 1) : height / Math.max(1, (box?.bottom ?? image.height) - (box?.top ?? 0) + 1);
  const foot = pose === 'skill' ? (skillPose?.bottom ?? image.height - 1) + 1 : (box?.bottom ?? image.height - 1) + 1;
  ctx.save(); ctx.globalAlpha *= state.alpha ?? 1;
  ctx.translate(state.x, state.y);
  ctx.fillStyle = '#06100b55'; ctx.beginPath(); ctx.ellipse(0, 1, key === 'wolf' ? 33 : 24, 8, 0, 0, TAU); ctx.fill();
  ctx.translate(0, -(state.lift || 0)); ctx.rotate((state.lean || 0) * Math.PI / 180);
  ctx.scale(state.flip ?? 1, state.squash || 1);
  ctx.drawImage(image, -image.width * factor / 2, -foot * factor, image.width * factor, image.height * factor);
  ctx.restore(); return true;
}

function burst(ctx, x, y, age, color, strength = 1, seed = 0) {
  for (let i = 0; i < 18; i++) {
    const angle = i * 2.399 + seed, velocity = (35 + i % 5 * 13) * strength;
    const a = age * velocity;
    line(ctx, [[x + Math.cos(angle) * a, y + Math.sin(angle) * a * .7 + age * age * 35],
      [x + Math.cos(angle) * (a + 5), y + Math.sin(angle) * (a + 5) * .7 + age * age * 35]], color, i % 3 === 0 ? 3 : 1.5);
  }
}
function slash(ctx, x, y, age, color, size, angle = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle * Math.PI / 180);
  for (const [width, opacity] of [[15, .12], [7, .45], [2, 1]]) {
    ctx.globalAlpha *= opacity; ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.ellipse(0, 0, size, size * .38, -.25, -.8 - age, 1.7 + age); ctx.stroke(); ctx.globalAlpha /= opacity;
  }
  ctx.restore();
}
function bolt(ctx, x, y, height, color, seed) {
  const points = Array.from({ length: 10 }, (_, i) => [x + Math.sin(i * 8.4 + seed) * 14 * (i === 9 ? 0 : 1), y - height * (1 - i / 9)]);
  line(ctx, points, color, 10); line(ctx, points, '#efffff', 2.5);
  for (let i = 2; i < 8; i += 2) line(ctx, [points[i], [points[i][0] + 23, points[i][1] + 18], [points[i][0] + 13, points[i][1] + 34]], color, 1.5);
}

const family = {
  arrow: 'arrow', lance: 'lance', blade: 'blade', slash: 'slash', crescent: 'slash', fist: 'impact', tiger: 'impact',
  lightning: 'lightning', chain: 'chain', flame: 'fire', embers: 'embers', dragon: 'fire', phoenix: 'fire',
  ice: 'ice', shards: 'ice', icicles: 'ice', frost: 'frost', shield: 'shield', plates: 'shield',
  rays: 'rays', feathers: 'heal', motes: 'heal', petals: 'heal', cross: 'heal', moon: 'heal',
  soundwave: 'music', notes: 'music', echo: 'echo', sight: 'sight', pressure: 'pressure',
  cracks: 'cracks', debris: 'debris', wind: 'wind', runes: 'shield', impact: 'impact', shell: 'shell',
  whip: 'whip', claw: 'claw', vial: 'vial', dust: 'dust',
};
function paintEffect(ctx, images, plan, effect, p, actor) {
  if (p < effect.at || p > effect.until + .1) return;
  const age = clamp01((p - effect.at) / (effect.until - effect.at)), fade = Math.sin(age * Math.PI);
  if (fade <= 0) return;
  const start = { x: plan.sourcePoint.x, y: plan.sourcePoint.y - 64 }, end = { x: plan.targetPoint.x, y: plan.targetPoint.y - 60 };
  const point = coordinates => ({ x: mix(start.x, end.x, coordinates[0]), y: mix(start.y, end.y, coordinates[0]) + coordinates[1] * 290 });
  const relocateWard = plan.guarding && plan.source.id !== plan.target.id && ['shield', 'plates', 'runes'].includes(effect.shape);
  const a = point(relocateWard ? [1, effect.from[1]] : effect.from), b = point(relocateWard ? [1, effect.to[1]] : effect.to);
  const x = mix(a.x, b.x, age), y = mix(a.y, b.y, age) + Math.sin(age * Math.PI) * (effect.bend || 0) * 260;
  const size = 70 * effect.size * (plan.skill ? 1.25 : 1), color = effect.color;
  const type = family[effect.shape] || 'impact';
  if (plan.miss && !['arrow', 'shell', 'lance', 'echo', 'wind', 'embers', 'sight'].includes(type)) return;
  ctx.save(); ctx.globalAlpha *= fade; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';
  if (type === 'dust') {
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = color; ctx.globalAlpha *= .3;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x - i * 8, y + 3 - i * age * 9, 5 + i * age * 3, 3 + i * age * 2, 0, 0, TAU); ctx.fill(); }
  } else if (type === 'whip') {
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(actor.x + plan.vector.x * 20, actor.y - 60);
    ctx.quadraticCurveTo(x + 35, y - size * Math.sin(age * Math.PI), end.x, end.y); ctx.stroke();
  } else if (type === 'claw') {
    for (let i = 0; i < 3; i++) slash(ctx, x + i * 9 - 9, y - i * 4, age, color, size * .6, -40);
  } else if (type === 'vial') {
    ctx.translate(x, y); ctx.rotate(age * 8); ctx.fillStyle = color; ctx.strokeStyle = '#e0f1d4'; ctx.lineWidth = 2;
    ctx.fillRect(-7, -9, 14, 18); ctx.strokeRect(-7, -9, 14, 18); ctx.fillRect(-3, -15, 6, 6);
  } else if (type === 'arrow' || type === 'lance' || type === 'shell') {
    const direction = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.translate(x, y + (plan.miss ? -40 * age : 0)); ctx.rotate(direction);
    line(ctx, [[-size * .8, 0], [size * .22, 0]], color, type === 'lance' ? 6 : 3);
    line(ctx, [[-size * .95, 0], [-size * .4, 0]], color, 9);
    line(ctx, [[size * .1, -5], [size * .23, 0], [size * .1, 5]], '#fff9df', 2);
    if (type === 'arrow') for (const s of [-1, 1]) line(ctx, [[-size * .6, 0], [-size * .72, s * 6]], color, 2);
  } else if (type === 'slash' || type === 'blade') {
    slash(ctx, x, y, age, color, size, effect.angle);
    if (plan.skill) slash(ctx, x + 9, y - 8, age, '#f5ffe9', size * .77, effect.angle + 10);
  } else if (type === 'lightning' || type === 'chain') {
    bolt(ctx, x, y + 30, size * 2.3, color, effect.at * 130);
    if (type === 'chain') for (const target of plan.targets) {
      const t = projectCell(target); line(ctx, [[x, y], [(x + t.x) / 2, t.y - 90], [t.x, t.y - 30]], color, 3);
    }
    burst(ctx, x, y + 20, age, color, 1.1);
  } else if (type === 'fire' || type === 'embers') {
    const image = images.get(getCombatEffect('fire'));
    const flameSize = size * (type === 'embers' ? .6 : 1.8) * (.65 + age * .7);
    if (image) ctx.drawImage(image, x - flameSize / 2, y - flameSize * .65, flameSize, flameSize);
    burst(ctx, x, y, age, color, size / 50, 3);
    if (type === 'fire') for (let i = 0; i < 5; i++) line(ctx, [[x + (i - 2) * 15, y + 35], [x + (i - 2) * 20, y - size * (1 + Math.sin(i) * .25) * age]], '#ffc97f', 4);
  } else if (type === 'ice' || type === 'frost') {
    for (let i = 0; i < 7; i++) {
      const offset = (i - 3) * size * .18, h = size * (.6 + (i % 3) * .25) * smooth(age * 3);
      ctx.fillStyle = i % 2 ? '#c0f6ff' : color;
      ctx.beginPath(); ctx.moveTo(x + offset, y + 36); ctx.lineTo(x + offset - 9, y + 14);
      ctx.lineTo(x + offset + 5, y + 22 - h); ctx.lineTo(x + offset + 12, y + 23); ctx.closePath(); ctx.fill();
    }
    ellipse(ctx, x, y + 36, size * age * 1.8, size * age * .65, color, 3);
  } else if (type === 'shield') {
    const rise = smooth(age * 3), cy = y + 28 - rise * 24;
    ctx.fillStyle = '#8fdde822'; ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const angle = i * TAU / 6 - Math.PI / 2; const px = x + Math.cos(angle) * size * .6, py = cy + Math.sin(angle) * size; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); line(ctx, [[x, cy - size * .65], [x, cy + size * .65]], '#efffff', 2);
    ellipse(ctx, x, y + 66, size * .6, size * .2, color, 2);
  } else if (type === 'rays' || type === 'heal') {
    for (let i = 0; i < 9; i++) {
      const offset = (i - 4) * size * .16, lift = (age * 160 + i * 29) % 145;
      line(ctx, [[x + offset, y + 55 - lift], [x + offset, y + 43 - lift]], color, i % 2 ? 2 : 4);
      line(ctx, [[x + offset - 4, y + 48 - lift], [x + offset + 4, y + 48 - lift]], '#f8fff2', 1);
    }
    if (type === 'rays') for (let i = 0; i < 7; i++) line(ctx, [[x + (i - 3) * 14, y + 60], [x + (i - 3) * 25, y - size * 1.8]], color, 2);
  } else if (type === 'music') {
    for (let i = 0; i < 3; i++) ellipse(ctx, x, y, size * (age + .1 * i), size * (age + .1 * i) * .7, i % 2 ? '#b7eaff' : color, 2.5);
    ctx.fillStyle = color; ctx.font = '24px serif'; ctx.fillText('♪', x + size * age * .6, y - size * age);
  } else if (type === 'cracks' || type === 'debris') {
    for (let i = 0; i < 9; i++) {
      const angle = i * TAU / 9, radius = size * age * 1.7;
      const points = Array.from({ length: 5 }, (_, j) => [x + Math.cos(angle) * radius * j / 4 + Math.sin(j * 7 + i) * 7, y + 38 + Math.sin(angle) * radius * j / 9]);
      line(ctx, points, type === 'cracks' ? '#ffbd64' : '#d4d4bb', type === 'cracks' ? 3 : 1.5);
    }
    burst(ctx, x, y + 40, age, color, 1.7);
  } else if (type === 'echo') {
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha *= .25;
    sprite(ctx, images, plan.source, { ...actor, x, y: y + 64, pose: 'strike' });
  } else if (type === 'wind' || type === 'pressure') {
    for (let i = 0; i < 3; i++) ellipse(ctx, x, y + 30 - i * 12, size * (age + i * .15), size * (age + i * .15) * .38, color, 2.5);
  } else if (type === 'sight') {
    ellipse(ctx, x, y, size * .5, size * .5, color, 1);
    line(ctx, [[x - size, y], [x + size, y]], color, 1); line(ctx, [[x, y - size], [x, y + size]], color, 1);
  } else {
    burst(ctx, x, y, age, color, size / 45);
    ellipse(ctx, x, y, size * age, size * age * .6, color, 3);
  }
  ctx.restore();
}

export function createFieldRenderer(canvas, plan, images, options = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const ground = makeGround(plan, images);
  // Continue the biome beyond the map edge without adding playable tiles.
  const base = images.get(`${WORLD_ART_ROOT}/terrain/${getWorldTileVisual([['plain']], 0, 0, plan.stageId).material}.webp`);
  const backdrop = base ? ctx.createPattern(base, 'repeat') : null;
  backdrop?.setTransform(new DOMMatrix([168 / base.width, 84 / base.width, -168 / base.height, 84 / base.height, 0, -28]));
  let width = 1, height = 1, dpr = 1, lastFraction = 0;
  const resize = (w, h, ratio = devicePixelRatio) => {
    const nextRatio = Math.min(1.75, ratio || 1);
    if (width === w && height === h && dpr === nextRatio) return;
    width = Math.max(1, w); height = Math.max(1, h); dpr = nextRatio;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    render(lastFraction);
  };
  function render(fraction) {
    lastFraction = fraction;
    const p = clamp01(fraction), reduced = options.reduced || !options.effects;
    const actor = sampleFieldActor(plan, p, reduced), camera = fieldCamera(plan, width, height, p, reduced);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#192923'; ctx.fillRect(0, 0, width, height);
    ctx.save();
    const shake = options.shake && !reduced && !plan.support && !plan.miss ? plan.contacts.reduce((sum, at) => sum + (p >= at && p < at + .035 ? Math.sin((p - at) * 520) * (plan.skill ? 3 : 1.5) : 0), 0) : 0;
    ctx.translate(width / 2 + shake, height / 2 + 8); ctx.scale(camera.scale, camera.scale); ctx.translate(-camera.x, -camera.y);
    const viewWidth = width / camera.scale + 32, viewHeight = height / camera.scale + 32;
    const viewX = camera.x - viewWidth / 2, viewY = camera.y - viewHeight / 2;
    if (backdrop) { ctx.fillStyle = backdrop; ctx.fillRect(viewX, viewY, viewWidth, viewHeight); }
    ctx.drawImage(ground.canvas, ground.x, ground.y, ground.width, ground.height);
    if (plan.skill && !reduced) {
      ctx.fillStyle = `rgba(7,12,17,${alphaAt(p, .08, .85) * .52})`; ctx.fillRect(viewX, viewY, viewWidth, viewHeight);
    }
    const objects = [...ground.props.map(prop => ({ ...prop, kind: 'prop' })), ...plan.units.map(unit => ({ ...projectCell(unit), kind: 'unit', unit }))];
    objects.find(object => object.unit?.id === plan.source.id).y = actor.y;
    objects.sort((a, b) => a.y - b.y);
    let bodies = 0;
    for (const object of objects) {
      if (object.kind === 'prop') {
        const image = images.get(`${WORLD_ART_ROOT}/props/${object.prop}.webp`);
        if (!image) continue;
        const near = [actor, ...plan.targets.map(projectCell)].some(point => Math.abs(object.x - point.x) < 78 && object.y > point.y - 5 && object.y - point.y < object.height);
        ctx.save(); ctx.globalAlpha = near ? .25 : plan.skill ? .65 : 1;
        ctx.drawImage(image, object.x - object.height * .38, object.y - object.height + 14, object.height * .76, object.height); ctx.restore(); continue;
      }
      const unit = object.unit, target = plan.targets.find(target => target.id === unit.id);
      const state = unit.id === plan.source.id ? actor : target ? targetReaction(plan, target, p, reduced)
        : { ...projectCell(unit), pose: 'recover', lift: reduced ? 0 : Math.sin(p * 9 + object.y) * .8 };
      if (state.flip === undefined) state.flip = state.x > actor.x ? -1 : 1;
      if (unit.id === plan.source.id && actor.moving && plan.skill && !reduced) {
        for (let trail = 3; trail > 0; trail--) {
          const previous = sampleFieldActor(plan, Math.max(0, p - trail * .012));
          sprite(ctx, images, unit, { ...previous, alpha: .1 * (4 - trail) }, plan.skillPose);
        }
      }
      if (sprite(ctx, images, unit, state, unit.id === plan.source.id ? plan.skillPose : null)) bodies++;
      ctx.save(); ctx.globalAlpha = .65;
      ellipse(ctx, state.x, state.y + 2, 22, 7, unit.type === 'ally' ? '#94e0d6' : unit.type === 'boss' ? '#f4ce83' : '#e99890', 1.4); ctx.restore();
      if (!reduced && unit.id === plan.source.id && actor.moving) {
        const step = Math.floor(p * 30); ctx.fillStyle = '#d9d1b766';
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(state.x - plan.vector.x * (7 + i * 7), state.y + 1 - i * 2, 3 + i * 1.2, 1.5 + i, step, 0, TAU); ctx.fill(); }
      }
    }
    if (!reduced) {
      if (plan.skill) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alphaAt(p, .08, .44) * .8;
        for (let i = 0; i < 24; i++) {
          const radius = (1 - clamp01((p - .08) / .36)) * 105 + 15, angle = i * 2.399 + p * 3;
          line(ctx, [[actor.x + Math.cos(angle) * radius, actor.y - 58 + Math.sin(angle) * radius * .7], [actor.x + Math.cos(angle) * (radius - 9), actor.y - 58 + Math.sin(angle) * (radius - 9) * .7]], plan.effects[0]?.color || '#fff1bc', 1.6);
        }
        ctx.restore();
      }
      for (const effect of plan.effects) paintEffect(ctx, images, plan, effect, p, actor);
      if (!plan.miss) for (const target of plan.targets.slice(1)) {
        const point = projectCell(target), age = (p - plan.impact) / .2;
        if (plan.support) {
          paintEffect(ctx, images, { ...plan, targetPoint: point }, { shape: plan.guarding ? 'shield' : 'rays', at: plan.impact - .08, until: .94, from: [1, 0], to: [1, 0], size: 1, color: plan.guarding ? '#a4e5ef' : '#d5f4b4' }, p, actor);
        } else if (age >= 0 && age <= 1) { ctx.save(); ctx.globalAlpha = 1 - age; burst(ctx, point.x, point.y - 42, age, plan.effects.at(-1)?.color || '#ffe8b9', 1.3); ctx.restore(); }
      }
    }
    ctx.restore();
    canvas.dataset.renderedUnits = String(bodies); canvas.dataset.phase = p < .28 ? 'prepare' : p < plan.impact ? 'action' : p < .83 ? 'impact' : 'recover';
    canvas.dataset.progress = p.toFixed(3); canvas.dataset.actorX = actor.x.toFixed(2); canvas.dataset.actorY = actor.y.toFixed(2); canvas.dataset.pose = actor.pose;
    return { actor, camera, bodies };
  }
  return { resize, render, dispose() { ground.canvas.width = 1; ground.canvas.height = 1; } };
}
