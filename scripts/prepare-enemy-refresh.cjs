const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { splitSilhouettes } = require('./prepare-painted-sprites.cjs');

const root = path.resolve(__dirname, '..');
const sources = path.join(root, 'docs/art/enemies-v3');
const output = path.join(root, 'public/art/enemies-v3');
const qaDirectory = path.join(root, 'tmp/enemy-refresh-qa');
const poses = ['run-a', 'run-b', 'windup', 'strike', 'recover', 'recoil'];
const size = 512;
const baseline = 480;
const coreAlpha = 24;
const anchorAlpha = 64;
const majorArea = 1000;

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function nearestOwners(owners, width, height, limit) {
  const nearest = new Int16Array(owners);
  const distance = new Uint8Array(owners.length).fill(255);
  const queue = new Int32Array(owners.length);
  let tail = 0;
  for (let pos = 0; pos < owners.length; pos++) {
    if (owners[pos] < 0) continue;
    distance[pos] = 0;
    queue[tail++] = pos;
  }
  for (let head = 0; head < tail; head++) {
    const pos = queue[head];
    if (distance[pos] >= limit) continue;
    const x = pos % width;
    const visit = next => {
      if (distance[next] !== 255) return;
      distance[next] = distance[pos] + 1;
      nearest[next] = nearest[pos];
      queue[tail++] = next;
    };
    if (x > 0) visit(pos - 1);
    if (x + 1 < width) visit(pos + 1);
    if (pos >= width) visit(pos - width);
    if (pos + width < width * height) visit(pos + width);
  }
  return nearest;
}

async function extractBatch(batch) {
  const input = await fs.readFile(path.join(sources, batch.file));
  const metadata = await sharp(input).metadata();
  if (!metadata.hasAlpha || metadata.width !== batch.width || metadata.height !== batch.height) {
    throw new Error(`${batch.id}: reviewed ${batch.width}x${batch.height} source with genuine alpha required`);
  }
  const rows = batch.keys.length;
  const count = rows * poses.length;
  if (!rows || new Set(batch.keys).size !== rows) throw new Error(`${batch.id}: distinct row keys required`);
  const aliases = new Map();
  for (const [row, id] of batch.keys.entries()) {
    for (const [pose, sourcePose] of Object.entries(batch.poseAliases?.[id] || {})) {
      if (!poses.includes(pose) || !poses.includes(sourcePose) || pose === sourcePose) throw new Error(`${batch.id}: invalid pose alias`);
      aliases.set(row * 6 + poses.indexOf(pose), row * 6 + poses.indexOf(sourcePose));
    }
  }
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const core = Buffer.from(data);
  let transparent = 0;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) transparent++;
    if (data[i] === 255) opaque++;
    if (core[i] < coreAlpha) core[i] = 0;
  }
  if (!transparent || !opaque) throw new Error(`${batch.id}: source alpha is not genuine`);
  const { labels, regions } = splitSilhouettes(core, width, height, count, rows, 6);
  const majors = regions.filter(region => region.area > majorArea);
  const splits = batch.ownershipSplits || [];
  const expected = count - aliases.size - splits.length;
  if (majors.length !== expected) {
    throw new Error(`${batch.id}: expected ${expected} connected bodies, found ${majors.length}; inspect source ownership before importing this atlas`);
  }
  const splitByLabel = new Map();
  for (const split of splits) {
    const candidates = regions.flatMap((region, index) => region.area > majorArea && split.slots.includes(region.slot)
      && region.top < split.divideY - 100 && region.bottom > split.divideY + 100 ? [index] : []);
    if (candidates.length !== 1) throw new Error(`${batch.id}: ambiguous ownership split`);
    splitByLabel.set(candidates[0], split);
  }
  const owners = new Int16Array(width * height).fill(-1);
  const coreCounts = new Uint32Array(count);
  for (let pos = 0; pos < owners.length; pos++) {
    const region = regions[labels[pos]];
    if (!region || region.area <= majorArea) continue;
    const split = splitByLabel.get(labels[pos]);
    const x = pos % width;
    const y = Math.floor(pos / width);
    const slot = split ? split.slots[y >= split.divideY || insidePolygon(x + 0.5, y + 0.5, split.lowerOutline) ? 1 : 0] : region.slot;
    if (aliases.has(slot)) throw new Error(`${batch.id}: an aliased pose unexpectedly contains a body`);
    owners[pos] = slot;
    coreCounts[slot]++;
  }
  for (let slot = 0; slot < count; slot++) {
    if (!aliases.has(slot) && coreCounts[slot] <= majorArea) throw new Error(`${batch.id}: missing body in slot ${slot}`);
  }
  // Grid coordinates label bodies only. Weapons and loose details follow actual
  // connected alpha and nearest body pixels, even across neighboring cells.
  const nearest = nearestOwners(owners, width, height, 12);
  const votes = new Map();
  for (let pos = 0; pos < owners.length; pos++) {
    const label = labels[pos];
    const region = regions[label];
    if (!region || region.area < 4 || region.area > majorArea || nearest[pos] < 0) continue;
    if (!votes.has(label)) votes.set(label, new Uint32Array(count));
    votes.get(label)[nearest[pos]]++;
  }
  const details = new Map();
  for (const [label, counts] of votes) details.set(label, counts.indexOf(Math.max(...counts)));
  for (let pos = 0; pos < owners.length; pos++) {
    if (owners[pos] < 0 && details.has(labels[pos])) owners[pos] = details.get(labels[pos]);
  }
  const edges = nearestOwners(owners, width, height, 2);
  for (let pos = 0; pos < owners.length; pos++) {
    if (owners[pos] < 0 && labels[pos] < 0 && data[pos * 4 + 3] > 0) owners[pos] = edges[pos];
  }
  const bounds = Array.from({ length: count }, () => ({ left: width, top: height, right: -1, bottom: -1, pixels: 0 }));
  let ignoredVisiblePixels = 0;
  for (let pos = 0; pos < owners.length; pos++) {
    if (owners[pos] < 0) {
      if (data[pos * 4 + 3]) ignoredVisiblePixels++;
      continue;
    }
    const box = bounds[owners[pos]];
    const x = pos % width;
    const y = Math.floor(pos / width);
    box.left = Math.min(box.left, x);
    box.top = Math.min(box.top, y);
    box.right = Math.max(box.right, x);
    box.bottom = Math.max(box.bottom, y);
    box.pixels++;
  }
  const sprites = bounds.map((box, slot) => {
    if (aliases.has(slot)) return null;
    const spriteWidth = box.right - box.left + 1;
    const spriteHeight = box.bottom - box.top + 1;
    if (spriteWidth > width / 3 || spriteHeight > height / 4) throw new Error(`${batch.id}/${slot}: neighboring body leaked into crop`);
    const pixels = Buffer.alloc(spriteWidth * spriteHeight * 4);
    for (let y = 0; y < spriteHeight; y++) {
      for (let x = 0; x < spriteWidth; x++) {
        const pos = (y + box.top) * width + x + box.left;
        if (owners[pos] === slot) data.copy(pixels, (y * spriteWidth + x) * 4, pos * 4, pos * 4 + 4);
      }
    }
    return { pixels, width: spriteWidth, height: spriteHeight, sourceBounds: box };
  });
  for (const [slot, sourceSlot] of aliases) {
    if (!sprites[sourceSlot]) throw new Error(`${batch.id}: alias source is missing`);
    sprites[slot] = sprites[sourceSlot];
  }
  return {
    sprites,
    report: {
      id: batch.id, file: `docs/art/enemies-v3/${batch.file}`, keys: batch.keys,
      generatedImage: batch.generatedImage,
      sha256: crypto.createHash('sha256').update(input).digest('hex'),
      width, height, coreAlpha, sourceRegions: regions.length, connectedBodies: majors.length,
      assignedDetailRegions: details.size, ignoredVisiblePixels, ownershipSplits: splits, poseAliases: batch.poseAliases || {},
    },
  };
}

async function validateSprite(file, canvasSize, anchor = null) {
  const metadata = await sharp(file).metadata();
  if (!metadata.hasAlpha || metadata.width !== canvasSize || metadata.height !== canvasSize) throw new Error(`Invalid canvas: ${file}`);
  const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = { left: canvasSize, top: canvasSize, right: -1, bottom: -1, footBottom: -1, clear: 0, opaque: 0, partial: 0 };
  for (let pos = 0; pos < canvasSize * canvasSize; pos++) {
    const alpha = data[pos * 4 + 3];
    if (!alpha) { bounds.clear++; continue; }
    if (alpha >= 250) bounds.opaque++;
    else bounds.partial++;
    const x = pos % canvasSize;
    const y = Math.floor(pos / canvasSize);
    if (anchor !== null && (x === 0 || x === canvasSize - 1 || y === 0 || y === canvasSize - 1)) throw new Error(`Clipped silhouette: ${file}`);
    if (alpha > anchorAlpha) bounds.footBottom = Math.max(bounds.footBottom, y);
    if (alpha >= 8) {
      bounds.left = Math.min(bounds.left, x);
      bounds.top = Math.min(bounds.top, y);
      bounds.right = Math.max(bounds.right, x);
      bounds.bottom = Math.max(bounds.bottom, y);
    }
  }
  if (!bounds.clear || !bounds.opaque || !bounds.partial) throw new Error(`Invalid silhouette alpha: ${file}`);
  if (anchor !== null && (bounds.footBottom < anchor - 2 || bounds.footBottom >= anchor)) throw new Error(`Wrong visible foot anchor: ${file} (${bounds.footBottom})`);
  return bounds;
}

async function makePortrait(source, crop) {
  if (!crop || ![crop.left, crop.top, crop.width, crop.height].every(Number.isInteger) || crop.width <= 0 || crop.height <= 0) {
    throw new Error('A reviewed portrait crop in source-atlas coordinates is required');
  }
  const pixels = Buffer.alloc(crop.width * crop.height * 4);
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const sx = crop.left + x - source.sourceBounds.left;
      const sy = crop.top + y - source.sourceBounds.top;
      if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
      const pos = (sy * source.width + sx) * 4;
      source.pixels.copy(pixels, (y * crop.width + x) * 4, pos, pos + 4);
    }
  }
  return sharp(pixels, { raw: { width: crop.width, height: crop.height, channels: 4 } })
    .resize(256, 256, { fit: 'contain', background: '#00000000' }).webp({ lossless: true }).toBuffer();
}

function label(width, text) {
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28"><text x="8" y="20" font-family="sans-serif" font-size="15" fill="#f0f0f0">${escaped}</text></svg>`);
}

async function contactSheet(batch, manifest, includeProfiles = false) {
  const columns = includeProfiles ? ['map', 'portrait'] : poses;
  const thumb = includeProfiles ? 256 : 192;
  const rowHeight = thumb + 28;
  const width = thumb * columns.length;
  const height = 28 + rowHeight * batch.keys.length;
  const checker = Buffer.alloc(thumb * thumb * 3);
  for (let y = 0; y < thumb; y++) {
    for (let x = 0; x < thumb; x++) {
      const value = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? 150 : 176;
      checker.fill(value, (y * thumb + x) * 3, (y * thumb + x) * 3 + 3);
    }
  }
  const layers = columns.map((column, index) => ({ input: label(thumb, column), top: 0, left: thumb * index }));
  for (const [row, id] of batch.keys.entries()) {
    layers.push({ input: label(width, id), top: 28 + row * rowHeight, left: 0 });
    for (const [column, field] of columns.entries()) {
      const unit = manifest.units[id];
      const asset = includeProfiles ? unit[field] : unit.motion[field];
      const sprite = await sharp(path.join(root, 'public', asset)).resize(thumb, thumb).png().toBuffer();
      const tile = await sharp(checker, { raw: { width: thumb, height: thumb, channels: 3 } }).composite([{ input: sprite }]).png().toBuffer();
      layers.push({ input: tile, left: column * thumb, top: 56 + row * rowHeight });
    }
  }
  const filename = `${batch.id}-${includeProfiles ? 'profiles' : 'motion'}.png`;
  await sharp({ create: { width, height, channels: 3, background: '#272c30' } }).composite(layers).png().toFile(path.join(qaDirectory, filename));
}

async function main() {
  const config = JSON.parse(await fs.readFile(path.join(sources, 'sources.json'), 'utf8'));
  if (!config.batches.length) throw new Error('At least one reviewed source batch is required');
  for (const folder of ['motion', 'maps', 'portraits']) await fs.mkdir(path.join(output, folder), { recursive: true });
  await fs.mkdir(qaDirectory, { recursive: true });
  const manifest = {
    version: 3, generator: config.generator,
    canvases: { motion: { width: size, height: size, baseline }, map: { width: 256, height: 256, baseline: 240 }, portrait: { width: 256, height: 256 } },
    poses, units: {},
  };
  const report = { generator: config.generator, anchorAlpha, batches: [], units: {} };
  for (const batch of config.batches) {
    const extracted = await extractBatch(batch);
    report.batches.push(extracted.report);
    for (const [row, id] of batch.keys.entries()) {
      if (!/^[a-z][a-z0-9_]*$/.test(id) || Object.hasOwn(manifest.units, id)) throw new Error(`Invalid or duplicate key: ${id}`);
      const sprites = extracted.sprites.slice(row * 6, row * 6 + 6);
      const scale = Math.min((id === 'wolf' ? 250 : 414) / sprites[0].height, ...sprites.map(sprite => Math.min(450 / sprite.height, 484 / sprite.width)));
      const unit = { map: `/art/enemies-v3/maps/${id}.webp`, portrait: `/art/enemies-v3/portraits/${id}.webp`, ready: `/art/enemies-v3/motion/${id}-recover.webp`, motion: {} };
      const unitReport = { batch: batch.id, row, scale, poseAliases: batch.poseAliases?.[id] || {}, poses: {} };
      for (const [column, sprite] of sprites.entries()) {
        const pose = poses[column];
        const width = Math.round(sprite.width * scale);
        const height = Math.round(sprite.height * scale);
        const resized = await sharp(sprite.pixels, { raw: { width: sprite.width, height: sprite.height, channels: 4 } }).resize(width, height).raw().toBuffer();
        let footBottom = -1;
        for (let pos = 0; pos < width * height; pos++) {
          if (resized[pos * 4 + 3] > anchorAlpha) footBottom = Math.floor(pos / width);
        }
        if (footBottom < 0) throw new Error(`${id}/${pose}: no visible foot anchor`);
        const left = Math.floor((size - width) / 2);
        // Align visible feet after resampling; keep faint pixels in the padding.
        const top = baseline - 1 - footBottom;
        if (top < 1 || top + height >= size) throw new Error(`${id}/${pose}: insufficient canvas padding for alpha fringe`);
        const relative = `motion/${id}-${pose}.webp`;
        const file = path.join(output, relative);
        await sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
          .composite([{ input: resized, raw: { width, height, channels: 4 }, left, top }]).webp({ lossless: true }).toFile(file);
        unit.motion[pose] = `/art/enemies-v3/${relative}`;
        unitReport.poses[pose] = { sourcePose: batch.poseAliases?.[id]?.[pose] || pose, sourceBounds: sprite.sourceBounds, scale, anchorOffset: height - 1 - footBottom, placement: { left, top, width, height }, alphaBounds: await validateSprite(file, size, baseline) };
      }
      const mapFile = path.join(root, 'public', unit.map);
      // Exact downsampling keeps the map's identity and relative scale tied to ready.
      await sharp(path.join(root, 'public', unit.ready)).resize(256, 256, { kernel: sharp.kernel.cubic }).webp({ lossless: true }).toFile(mapFile);
      unitReport.map = { derivedFrom: 'recover', scale: 0.5, alphaBounds: await validateSprite(mapFile, 256, 240) };
      const portraitFile = path.join(root, 'public', unit.portrait);
      await fs.writeFile(portraitFile, await makePortrait(sprites[4], batch.portraitCrops[id]));
      unitReport.portrait = { derivedFrom: 'recover', sourceCrop: batch.portraitCrops[id], alphaBounds: await validateSprite(portraitFile, 256) };
      manifest.units[id] = unit;
      report.units[id] = unitReport;
    }
    console.log(`${batch.id}: ${batch.keys.length * 6} motion files, ${batch.keys.length} maps, ${batch.keys.length} recover portraits`);
  }
  const files = Object.values(manifest.units).flatMap(unit => [unit.map, unit.portrait, ...Object.values(unit.motion)]);
  if (new Set(files).size !== Object.keys(manifest.units).length * 8) throw new Error('Duplicate output asset paths');
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'precache.js'), `self.ENEMY_REFRESH_FILES = ${JSON.stringify(files, null, 2)};\n`);
  await fs.writeFile(path.join(sources, 'EXTRACTION.json'), JSON.stringify(report, null, 2) + '\n');
  for (const batch of config.batches) {
    await contactSheet(batch, manifest);
    await contactSheet(batch, manifest, true);
  }
  console.log(`Prepared ${files.length} assets. QA: tmp/enemy-refresh-qa; reproducible source metadata: docs/art/enemies-v3/EXTRACTION.json`);
}

module.exports = { poses, extractBatch };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
