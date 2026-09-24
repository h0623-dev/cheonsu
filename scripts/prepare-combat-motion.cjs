const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { splitSilhouettes } = require('./prepare-painted-sprites.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/art/combat-v2');
const qaDirectory = path.join(root, 'tmp/motion-qa');
const poses = ['run-a', 'run-b', 'windup', 'strike', 'recover', 'recoil'];
const batches = [
  ['hero', 'bram', 'lina', 'aria', 'leon', 'sera'],
  ['noah', 'yuna', 'rakan', 'miho', 'teo', 'irene'],
  ['kaz', 'ella', 'jin', 'luka', 'baekho', 'raider'],
  ['ranger', 'sniper', 'marauder', 'assassin_elite', 'iron_lancer', 'plague_doctor'],
  ['beast_tamer', 'storm_mage', 'blade_dancer', 'siege_gunner', 'sentinel', 'blackguard'],
  ['warlord', 'pyromancer', 'frost_mage', 'cultist', 'void_knight', 'wolf'],
];
const baseline = 480;
const size = 512;
const majorArea = 1000;
const coreAlpha = 24;
const correctionIds = ['hero', 'bram', 'leon', 'jin', 'raider', 'warlord'];

// These source-specific outlines follow the visible foreground weapons. Pixels
// hidden behind them do not exist in the source and cannot be recovered by extraction.
const overlaps = {
  1: [
    { row: 0, divide: 850, outline: [[850, 100], [887, 107], [907, 111], [918, 116], [918, 119], [906, 120], [875, 116], [850, 112]] },
    { row: 1, divide: 850, outline: [[850, 305], [892, 313], [919, 318], [936, 323], [936, 326], [923, 327], [891, 325], [850, 320]] },
    { row: 4, divide: 850, outline: [[850, 913], [896, 920], [909, 920], [913, 924], [922, 920], [939, 926], [961, 934], [963, 937], [922, 940], [913, 932], [894, 931], [850, 924]] },
  ],
  3: [
    { row: 2, divide: 842, outline: [[842, 510], [878, 517], [904, 523], [920, 530], [929, 535], [929, 538], [918, 536], [896, 530], [870, 525], [842, 519]] },
    { row: 5, divide: 846, outline: [[846, 1151], [874, 1159], [897, 1165], [910, 1171], [919, 1178], [919, 1180], [905, 1179], [885, 1175], [863, 1168], [846, 1163]] },
  ],
  6: [
    { row: 0, divide: 828, outline: [[828, 119], [918, 123], [939, 129], [940, 132], [920, 138], [877, 138], [828, 135]] },
  ],
};

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(x, y, points) {
  let minimum = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j];
    const [bx, by] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    minimum = Math.min(minimum, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return minimum;
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
  return { nearest, distance };
}

async function extractBatch(batch, ids) {
  const input = await fs.readFile(path.join(root, `docs/art/combat-v2/sources/batch-${batch}.png`));
  const metadata = await sharp(input).metadata();
  if (!metadata.hasAlpha || metadata.width !== 1254 || metadata.height !== 1254) {
    throw new Error(`Batch ${batch}: the reviewed 1254x1254 source with real alpha is required`);
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
  if (!transparent || !opaque) throw new Error(`Batch ${batch}: alpha is not genuine`);
  const { labels, regions } = splitSilhouettes(core, width, height, 36, 6, 6);
  const majors = regions.filter(region => region.area > majorArea);
  const fixes = overlaps[batch] || [];
  if (majors.length !== 36 - fixes.length) {
    throw new Error(`Batch ${batch}: expected ${36 - fixes.length} connected bodies, found ${majors.length}`);
  }
  const fixByLabel = new Map();
  for (const fix of fixes) {
    const candidates = regions.flatMap((region, label) => {
      const row = Math.floor(region.slot / 6);
      return region.area > majorArea && row === fix.row && region.left < fix.divide && region.right > fix.divide + 180 ? [label] : [];
    });
    if (candidates.length !== 1) throw new Error(`Batch ${batch}: ambiguous weapon overlap in row ${fix.row}`);
    fixByLabel.set(candidates[0], fix);
  }
  const owners = new Int16Array(width * height).fill(-1);
  const coreCounts = new Uint32Array(36);
  for (let pos = 0; pos < owners.length; pos++) {
    const label = labels[pos];
    if (label < 0 || regions[label].area <= majorArea) continue;
    const fix = fixByLabel.get(label);
    const x = pos % width;
    const y = Math.floor(pos / width);
    const weapon = fix && (x < fix.divide || insidePolygon(x + 0.5, y + 0.5, fix.outline));
    // The blade's antialiased perimeter also belongs to the foreign weapon.
    // Exclude that thin perimeter from the occluded pose to avoid floating slivers.
    if (fix && !weapon && distanceToPolygon(x + 0.5, y + 0.5, fix.outline) <= 3) continue;
    const slot = fix ? fix.row * 6 + (weapon ? 3 : 4) : regions[label].slot;
    if (slot < 0 || slot >= 36) throw new Error(`Batch ${batch}: body outside its grid`);
    owners[pos] = slot;
    coreCounts[slot]++;
  }
  for (let slot = 0; slot < 36; slot++) {
    if (coreCounts[slot] <= majorArea) throw new Error(`Batch ${batch}: missing ${ids[Math.floor(slot / 6)]} ${poses[slot % 6]}`);
  }

  // Attach disconnected details by actual pixel proximity, not overlapping
  // bounding boxes. Low-alpha bridges are excluded from connectivity only.
  const proximity = nearestOwners(owners, width, height, 12);
  const votes = new Map();
  for (let pos = 0; pos < owners.length; pos++) {
    const label = labels[pos];
    const region = regions[label];
    if (!region || region.area < 4 || region.area > majorArea || proximity.nearest[pos] < 0) continue;
    if (!votes.has(label)) votes.set(label, new Uint32Array(36));
    votes.get(label)[proximity.nearest[pos]]++;
  }
  const detailSlots = new Map();
  for (const [label, counts] of votes) {
    const maximum = Math.max(...counts);
    if (maximum) detailSlots.set(label, counts.indexOf(maximum));
  }
  for (let pos = 0; pos < owners.length; pos++) {
    if (owners[pos] < 0 && detailSlots.has(labels[pos])) owners[pos] = detailSlots.get(labels[pos]);
  }
  const edges = nearestOwners(owners, width, height, 2);
  for (let pos = 0; pos < owners.length; pos++) {
    if (owners[pos] < 0 && labels[pos] < 0 && data[pos * 4 + 3] > 0 && edges.nearest[pos] >= 0) {
      owners[pos] = edges.nearest[pos];
    }
  }
  const bounds = Array.from({ length: 36 }, () => ({ left: width, top: height, right: 0, bottom: 0, pixels: 0, corePixels: 0 }));
  for (let pos = 0; pos < owners.length; pos++) {
    const slot = owners[pos];
    if (slot < 0) continue;
    const x = pos % width;
    const y = Math.floor(pos / width);
    const box = bounds[slot];
    box.left = Math.min(box.left, x);
    box.top = Math.min(box.top, y);
    box.right = Math.max(box.right, x);
    box.bottom = Math.max(box.bottom, y);
    box.pixels++;
    if (data[pos * 4 + 3] >= coreAlpha) box.corePixels++;
  }
  const sprites = bounds.map((box, slot) => {
    const spriteWidth = box.right - box.left + 1;
    const spriteHeight = box.bottom - box.top + 1;
    if (spriteWidth > width / 3 || spriteHeight > height / 4) throw new Error(`Batch ${batch} slot ${slot}: a neighboring body leaked into the crop`);
    const pixels = Buffer.alloc(spriteWidth * spriteHeight * 4);
    for (let y = 0; y < spriteHeight; y++) {
      for (let x = 0; x < spriteWidth; x++) {
        const source = (y + box.top) * width + x + box.left;
        if (owners[source] === slot) data.copy(pixels, (y * spriteWidth + x) * 4, source * 4, source * 4 + 4);
      }
    }
    return { pixels, width: spriteWidth, height: spriteHeight, sourceBounds: box };
  });
  return {
    sprites,
    report: {
      batch,
      sha256: crypto.createHash('sha256').update(input).digest('hex'),
      sourceRegions: regions.length,
      connectedBodies: majors.length,
      separatedBodies: coreCounts.length,
      coreAlpha,
      overlaps: fixes.map(fix => ({ id: ids[fix.row], foreground: 'strike', occluded: 'recover', outline: fix.outline })),
      ignoredSmallOrDistantRegions: regions.filter((region, label) => region.area <= majorArea && !detailSlots.has(label)).length,
    },
  };
}

async function validateSprite(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== size || info.height !== size) throw new Error(`Wrong canvas size: ${file}`);
  let clear = 0;
  let solid = 0;
  let partial = 0;
  let bottom = -1;
  let top = size;
  let left = size;
  let right = -1;
  for (let pos = 0; pos < size * size; pos++) {
    const alpha = data[pos * 4 + 3];
    if (!alpha) { clear++; continue; }
    if (alpha >= 250) solid++;
    else partial++;
    const x = pos % size;
    const y = Math.floor(pos / size);
    if (x === 0 || x === size - 1 || y === 0 || y >= baseline) throw new Error(`Clipped silhouette or wrong baseline: ${file}`);
    if (alpha >= 8) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (!clear || !solid || !partial || bottom < baseline - 6) throw new Error(`Invalid alpha or foot anchor: ${file} (bottom=${bottom})`);
  return { left, top, right, bottom, transparentPixels: clear, nearOpaquePixels: solid, partialPixels: partial };
}

function textOverlay(width, height, text, fontSize = 16, fill = '#e9edf0') {
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="8" y="${fontSize + 3}" font-family="sans-serif" font-size="${fontSize}" fill="${fill}">${escaped}</text></svg>`);
}

async function contactSheet(ids, manifest, filename, thumb = 192, columns = poses) {
  const header = 30;
  const rowHeight = thumb + 28;
  const width = thumb * columns.length;
  const height = header + rowHeight * ids.length;
  const layers = columns.map((pose, column) => ({ input: textOverlay(thumb, header, pose), left: column * thumb, top: 0 }));
  const checker = Buffer.alloc(thumb * thumb * 3);
  for (let y = 0; y < thumb; y++) {
    for (let x = 0; x < thumb; x++) {
      const pos = (y * thumb + x) * 3;
      const value = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? 150 : 167;
      checker[pos] = value;
      checker[pos + 1] = value + 3;
      checker[pos + 2] = value + 5;
      if (y === Math.round(baseline * thumb / size)) {
        checker[pos] = 37;
        checker[pos + 1] = 111;
        checker[pos + 2] = 118;
      }
    }
  }
  for (const [row, id] of ids.entries()) {
    for (const [column, pose] of columns.entries()) {
      const entry = manifest.units[id][pose];
      const sprite = await sharp(Buffer.isBuffer(entry) ? entry : path.join(root, 'public', entry)).resize(thumb, thumb).png().toBuffer();
      const tile = await sharp(checker, { raw: { width: thumb, height: thumb, channels: 3 } }).composite([{ input: sprite }]).png().toBuffer();
      layers.push({ input: tile, left: column * thumb, top: header + row * rowHeight + 28 });
    }
    layers.push({ input: textOverlay(width, 28, id), left: 0, top: header + row * rowHeight });
  }
  await sharp({ create: { width, height, channels: 3, background: '#272c30' } }).composite(layers).png().toFile(path.join(qaDirectory, filename));
}

async function extractRecoverCorrections() {
  const sourcePath = 'docs/art/combat-v2/sources/recover-corrections.png';
  const input = await fs.readFile(path.join(root, sourcePath));
  if (!(await sharp(input).metadata()).hasAlpha) throw new Error('Recover corrections require genuine alpha');
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const core = Buffer.from(data);
  for (let i = 3; i < core.length; i += 4) if (core[i] < coreAlpha) core[i] = 0;
  const { labels, regions } = splitSilhouettes(core, width, height, 6, 2, 3);
  const majors = regions.filter(region => region.area > majorArea);
  if (majors.length !== 6 || new Set(majors.map(region => region.slot)).size !== 6) {
    throw new Error(`Recover corrections: expected six separate bodies in a 3x2 atlas, found ${majors.length}`);
  }
  const owners = new Int16Array(width * height).fill(-1);
  for (let pos = 0; pos < owners.length; pos++) {
    const region = regions[labels[pos]];
    if (region && region.area >= 4) owners[pos] = region.slot;
  }
  const edges = nearestOwners(owners, width, height, 2);
  for (let pos = 0; pos < owners.length; pos++) {
    if (owners[pos] < 0 && labels[pos] < 0 && data[pos * 4 + 3] > 0) owners[pos] = edges.nearest[pos];
  }
  const sprites = {};
  for (const [slot, id] of correctionIds.entries()) {
    const box = { left: width, top: height, right: 0, bottom: 0 };
    for (let pos = 0; pos < owners.length; pos++) {
      if (owners[pos] !== slot) continue;
      const x = pos % width;
      const y = Math.floor(pos / width);
      box.left = Math.min(box.left, x);
      box.top = Math.min(box.top, y);
      box.right = Math.max(box.right, x);
      box.bottom = Math.max(box.bottom, y);
    }
    const spriteWidth = box.right - box.left + 1;
    const spriteHeight = box.bottom - box.top + 1;
    const pixels = Buffer.alloc(spriteWidth * spriteHeight * 4);
    for (let y = 0; y < spriteHeight; y++) {
      for (let x = 0; x < spriteWidth; x++) {
        const pos = (box.top + y) * width + box.left + x;
        if (owners[pos] === slot) data.copy(pixels, (y * spriteWidth + x) * 4, pos * 4, pos * 4 + 4);
      }
    }
    sprites[id] = { pixels, width: spriteWidth, height: spriteHeight, sourceBounds: box };
  }
  return { sprites, report: { sourcePath, sha256: crypto.createHash('sha256').update(input).digest('hex'), width, height, connectedBodies: majors.length, ids: correctionIds } };
}

async function main() {
  const corrections = await extractRecoverCorrections();
  await fs.mkdir(path.join(output, 'units'), { recursive: true });
  await fs.mkdir(qaDirectory, { recursive: true });
  const manifest = { units: {} };
  const report = {
    canvas: { width: size, height: size, baseline },
    poses,
    batches: [],
    recoverCorrections: corrections.report,
    units: {},
    issues: [
      'Six recover poses occluded in the original sheets are replaced from recover-corrections.png, normalized to their original recover height.',
      'Run-a and run-b are a two-pose cycle with modest limb changes, not a full walk-cycle frame sequence.',
    ],
  };
  for (const [index, ids] of batches.entries()) {
    const { sprites, report: batchReport } = await extractBatch(index + 1, ids);
    report.batches.push(batchReport);
    for (const [row, id] of ids.entries()) {
      const sources = sprites.slice(row * 6, row * 6 + 6);
      // The same scalar is used for all six poses, including crouches and lunges.
      const scale = Math.min((id === 'wolf' ? 250 : 414) / sources[0].height, ...sources.map(source => Math.min(450 / source.height, 484 / source.width)));
      manifest.units[id] = {};
      report.units[id] = { batch: index + 1, row, scale, poses: {} };
      for (const [column, original] of sources.entries()) {
        const pose = poses[column];
        const source = pose === 'recover' && corrections.sprites[id] ? corrections.sprites[id] : original;
        const sourceNormalization = original.height / source.height;
        const renderScale = scale * sourceNormalization;
        const width = Math.round(source.width * renderScale);
        const height = Math.round(original.height * scale);
        if (width > 484) throw new Error(`${id}/${pose}: correction weapon exceeds the canvas at the required body scale`);
        const input = await sharp(source.pixels, { raw: { width: source.width, height: source.height, channels: 4 } }).resize(width, height).png().toBuffer();
        const left = Math.floor((size - width) / 2);
        const top = baseline - height;
        const relative = `units/${id}-${pose}.webp`;
        const file = path.join(output, relative);
        await sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
          .composite([{ input, left, top }]).webp({ quality: 94, alphaQuality: 100 }).toFile(file);
        manifest.units[id][pose] = `/art/combat-v2/${relative}`;
        report.units[id].poses[pose] = {
          sourceBounds: source.sourceBounds,
          scale,
          sourceNormalization,
          renderScale,
          corrected: source !== original,
          ...(source !== original ? { originalSourceBounds: original.sourceBounds } : {}),
          placement: { left, top, width, height },
          alphaBounds: await validateSprite(file),
        };
      }
    }
    console.log(`Batch ${index + 1}: ${batchReport.connectedBodies} connected bodies -> 36 isolated poses; ${batchReport.overlaps.length} traced weapon overlaps.`);
  }
  const files = Object.values(manifest.units).flatMap(Object.values);
  if (files.length !== 216 || new Set(files).size !== 216) throw new Error('Expected exactly 216 distinct motion sprites');
  for (const [id, unit] of Object.entries(report.units)) {
    const scales = new Set(Object.values(unit.poses).map(pose => pose.scale));
    if (scales.size !== 1) throw new Error(`${id}: inconsistent body scale`);
  }
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'precache.js'), `self.COMBAT_MOTION_FILES=${JSON.stringify(files)};\n`);
  await fs.writeFile(path.join(qaDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  for (const [index, ids] of batches.entries()) await contactSheet(ids, manifest, `batch-${index + 1}.png`);
  await contactSheet(['hero', 'lina', 'aria', 'raider'], manifest, 'hero-lina-staff-raider.png', 256);
  await contactSheet(['yuna', 'irene', 'plague_doctor', 'storm_mage', 'pyromancer', 'frost_mage'], manifest, 'staff-users.png');
  await contactSheet(correctionIds, manifest, 'corrected-rows.png');
  console.log(`Prepared and verified ${files.length} 512x512 motion sprites at baseline ${baseline}. QA: tmp/motion-qa/report.json`);
  console.log('Applied six isolated recover corrections; original row scales and all 216 paths are preserved.');
}

module.exports = { poses, batches };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
