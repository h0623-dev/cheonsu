const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { extract, bounds, poses } = require('./prepare-character-redesign.cjs');

const root = path.resolve(__dirname, '..');
const prefix = 'promotions-v1';
const output = path.join(root, 'public/art', prefix);
const sourceDirectory = path.join(root, 'docs/art', prefix, 'sources');
const reportPath = path.join(root, 'docs/art', prefix, 'extraction-report.json');
const allies = ['hero', 'bram', 'lina', 'aria', 'leon', 'sera', 'noah', 'yuna', 'rakan', 'miho', 'teo', 'irene', 'kaz', 'ella', 'jin', 'luka', 'baekho', 'mare', 'harin', 'edan', 'sylvan'];
const fullKeys = new Set([...allies.map(id => `${id}__promoted`), 'hero__dawnblade', 'bram__oathwarden']);
const walking = ['front-a', 'front-b', 'back-a', 'back-b'];
const slots = [...poses, 'dialogue', 'map', 'rear', ...walking, 'portrait'];
const json = value => JSON.stringify(value, null, 2) + '\n';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return fallback; }
}

// This command makes authored assets; its bounds are also the renderer's anchors.
// It does not start the game or run post-change tests, browsers, or comparisons.
async function normalize(frame, file, width, height, foot, scale) {
  const w = Math.max(1, Math.round(frame.width * scale));
  const h = Math.max(1, Math.round(frame.height * scale));
  if (w >= width || h >= foot || foot >= height)
    throw new Error(`${file}: 원화가 출력 캔버스 또는 발 기준선을 벗어났습니다.`);
  const input = await sharp(frame.pixels, { raw: { width: frame.width, height: frame.height, channels: 4 } })
    .resize(w, h).png().toBuffer();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await sharp({ create: { width, height, channels: 4, background: '#00000000' } })
    .composite([{ input, left: Math.floor((width - w) / 2), top: foot - h }])
    .webp({ quality: 94, alphaQuality: 100 }).toFile(file);
  return bounds(file);
}

async function importSource(id, input) {
  await fs.mkdir(sourceDirectory, { recursive: true });
  const bytes = await fs.readFile(input);
  const sourcePath = path.join(sourceDirectory, `${id}.webp`);
  if (path.resolve(input) !== sourcePath) {
    // Keep the generated PNG at its supplied work path. The repository stores a
    // high-quality transparent atlas instead of a second oversized PNG copy.
    const metadata = await sharp(bytes).metadata();
    if (!metadata.hasAlpha) throw new Error(`${id}: 실제 투명 알파 채널이 있는 원화가 필요합니다.`);
    await sharp(bytes).webp({ quality: 97, alphaQuality: 100, effort: 6 }).toFile(sourcePath);
  }
  return { originalSourceName: path.basename(input), originalSourceSha256: digest(bytes) };
}

async function readAuthoredAtlas(id, rows, columns, slotNames) {
  const sourcePath = `docs/art/${prefix}/sources/${id}.webp`;
  const corrections = {};
  for (const [index, slot] of slotNames.entries()) {
    const correctionPath = `docs/art/${prefix}/sources/${id}-${slot}-correction.webp`;
    try {
      const authored = await extract(path.join(root, correctionPath), 1, 1);
      corrections[index] = { frame: authored.sources[0], sourcePath: correctionPath, sha256: authored.sha256 };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const replacements = Object.fromEntries(Object.entries(corrections).map(([index, correction]) => [index, correction.frame]));
  const atlas = await extract(path.join(root, sourcePath), rows, columns, [], [], replacements);
  const frames = atlas.sources;
  const sourceCorrections = {};
  for (const [index, correction] of Object.entries(corrections)) {
    const targetHeight = frames[index].originalFrameHeight || frames[index].height;
    frames[index].normalization = targetHeight / frames[index].height;
    sourceCorrections[slotNames[index]] = { sourcePath: correction.sourcePath, sha256: correction.sha256,
      sourceBounds: frames[index].box, normalization: frames[index].normalization, targetHeight };
  }
  return { sourcePath, atlas, frames, sourceCorrections };
}

async function prepare(id, manifest, report, originalSource) {
  // Row-major: run A/B, windup, strike / recover, recoil, skills A/B /
  // dialogue, front idle, rear idle, front walk A / front walk B, rear walk A/B, portrait.
  const { sourcePath, atlas, frames, sourceCorrections } = await readAuthoredAtlas(id, 4, 4, slots);
  const scaled = (frame, axis) => frame[axis] * (frame.normalization || 1);
  const motionFrames = frames.slice(0, 8);
  const combatScale = Math.min(380 / scaled(frames[4], 'height'),
    ...motionFrames.map(frame => Math.min(456 / scaled(frame, 'height'), 476 / scaled(frame, 'width'))));
  const entry = { motion: {}, metrics: {}, portrait: `/art/${prefix}/portraits/${id}.webp`,
    dialogue: `/art/${prefix}/dialogue/${id}.webp`, map: `/art/${prefix}/map/${id}.webp`,
    rear: `/art/${prefix}/map/${id}-back.webp`, walk: {} };
  const anchors = await readJson(path.join(sourceDirectory, `${id}-anchors.json`), null);
  if (anchors) entry.anchors = anchors;
  if (Object.keys(sourceCorrections).length) entry.sourceCorrections = sourceCorrections;
  const created = {};
  for (const [index, pose] of poses.entries()) {
    entry.motion[pose] = `/art/${prefix}/units/${id}-${pose}.webp`;
    const measured = await normalize(frames[index], path.join(root, 'public', entry.motion[pose]),
      512, 512, 480, combatScale * (frames[index].normalization || 1));
    entry.metrics[pose] = { height: measured.height, top: measured.top, bottom: measured.bottom };
    created[pose] = measured;
  }
  created.dialogue = await normalize(frames[8], path.join(root, 'public', entry.dialogue),
    512, 640, 620, Math.min(470 / frames[8].width, 590 / frames[8].height));
  // The authored portrait is its own cell; a generic automatic face crop cannot
  // preserve hats, hair ornaments, ears and shoulder details across all roles.
  created.portrait = await normalize(frames[15], path.join(root, 'public', entry.portrait),
    300, 300, 290, Math.min(280 / frames[15].width, 280 / frames[15].height));
  const mapScales = {};
  for (const [index, field] of [[9, 'map'], [10, 'rear']]) {
    const frame = frames[index];
    mapScales[field] = Math.min(200 / frame.height, 240 / frame.width);
    created[field] = await normalize(frame, path.join(root, 'public', entry[field]), 256, 256, 240, mapScales[field]);
  }
  const walkScales = {};
  for (const [view, first] of [['front', 11], ['back', 13]]) {
    // Keep A/B on one scale. Changing legs must not change body size.
    const viewFrames = frames.slice(first, first + 2);
    const scale = Math.min(400 / scaled(viewFrames[0], 'height'),
      ...viewFrames.map(frame => Math.min(416 / scaled(frame, 'height'), 364 / scaled(frame, 'width'))));
    walkScales[view] = scale;
    for (let offset = 0; offset < 2; offset++) {
      const pose = `${view}-${offset ? 'b' : 'a'}`;
      const frame = frames[first + offset];
      entry.walk[pose] = `/art/${prefix}/walk/${id}-${pose}.webp`;
      created[pose] = await normalize(frame, path.join(root, 'public', entry.walk[pose]),
        384, 480, 448, scale * (frame.normalization || 1));
    }
  }
  manifest.units[id] = entry;
  report.units[id] = { sourcePath, sha256: atlas.sha256, size: [atlas.width, atlas.height],
    ...(originalSource || {}), slots, sourceBounds: frames.map(frame => frame.box), combatScale,
    mapScales, walkScales, sourceCorrections, outputBounds: created };
  console.log(`전직 원화 제작: ${id} · 전투 8·대화·초상·지도 앞뒤·보행 4`);
}

async function prepareAdvancedMap(baseId, manifest, report, originalSource) {
  const sourceId = `${baseId}__advanced-map`;
  const mapSlots = [0, 1].flatMap(form => ['map', 'rear', ...walking].map(pose => `form${form}-${pose}`));
  // Four columns, three rows: six views for form 0, then the same for form 1.
  const { sourcePath, atlas, frames, sourceCorrections } = await readAuthoredAtlas(sourceId, 3, 4, mapSlots);
  const outputBounds = {}, scales = {};
  for (let form = 0; form < 2; form++) {
    const id = `${baseId}__form${form}`;
    const start = form * 6;
    const entry = { ...(manifest.units[id] || {}), map: `/art/${prefix}/map/${id}.webp`,
      rear: `/art/${prefix}/map/${id}-back.webp`, walk: {}, mapMetrics: {}, walkMetrics: {} };
    const formScales = {};
    for (const [offset, field] of [[0, 'map'], [1, 'rear']]) {
      const frame = frames[start + offset];
      const scale = Math.min(200 / frame.height, 240 / frame.width);
      formScales[field] = scale;
      entry.mapMetrics[field] = await normalize(frame, path.join(root, 'public', entry[field]), 256, 256, 240, scale);
    }
    for (const [view, first] of [['front', start + 2], ['back', start + 4]]) {
      const viewFrames = frames.slice(first, first + 2);
      const scaled = (frame, axis) => frame[axis] * (frame.normalization || 1);
      const scale = Math.min(400 / scaled(viewFrames[0], 'height'),
        ...viewFrames.map(frame => Math.min(416 / scaled(frame, 'height'), 364 / scaled(frame, 'width'))));
      formScales[view] = scale;
      for (let offset = 0; offset < 2; offset++) {
        const pose = `${view}-${offset ? 'b' : 'a'}`, frame = frames[first + offset];
        entry.walk[pose] = `/art/${prefix}/walk/${id}-${pose}.webp`;
        entry.walkMetrics[pose] = await normalize(frame, path.join(root, 'public', entry.walk[pose]),
          384, 480, 448, scale * (frame.normalization || 1));
      }
    }
    // No motion, portrait or combat metrics override: existing v3 artwork remains.
    manifest.units[id] = entry;
    outputBounds[id] = { ...entry.mapMetrics, ...entry.walkMetrics };
    scales[id] = formScales;
  }
  report.units[sourceId] = { sourcePath, sha256: atlas.sha256, size: [atlas.width, atlas.height],
    ...(originalSource || {}), slots: mapSlots, sourceBounds: frames.map(frame => frame.box),
    scales, sourceCorrections, outputBounds };
  console.log(`최상위 전직 지도 원화 제작: ${baseId} · 2분기 × 지도 앞뒤·보행 4`);
}

async function writeCatalogues(manifest, report) {
  const ordered = { ...manifest, units: Object.fromEntries(Object.entries(manifest.units).sort(([a], [b]) => a.localeCompare(b))) };
  const files = [...new Set(Object.values(ordered.units).flatMap(entry => [
    ...Object.values(entry.motion || {}), entry.portrait, entry.dialogue, entry.map, entry.rear,
    ...Object.values(entry.walk || {}),
  ].filter(Boolean)))];
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(path.join(output, 'manifest.json'), json(ordered));
  await fs.writeFile(path.join(output, 'precache.js'), `self.PROMOTION_ART_FILES=${JSON.stringify(files)};\n`);
  await fs.writeFile(reportPath, json(report));
}

async function main() {
  const requested = process.argv.find(value => value.startsWith('--only='))?.slice(7).split(',') || [];
  const advancedMap = process.argv.find(value => value.startsWith('--advanced-map='))?.slice(15);
  const input = process.argv.find(value => value.startsWith('--source='))?.slice(9);
  const correctionInputs = process.argv.filter(value => value.startsWith('--correction=')).map(value => {
    const spec = value.slice(13), colon = spec.indexOf(':');
    if (colon < 1 || colon === spec.length - 1) throw new Error('--correction=<자세>:<원화 경로> 형식으로 지정하세요.');
    return { pose: spec.slice(0, colon), input: spec.slice(colon + 1) };
  });
  if (process.argv.includes('--anchors-only')) {
    if (requested.length || advancedMap || input || correctionInputs.length)
      throw new Error('--anchors-only는 다른 제작 인수와 함께 사용하지 마세요.');
    const manifest = await readJson(path.join(output, 'manifest.json'), { units: {} });
    const report = await readJson(reportPath, { units: {} });
    let count = 0;
    for (const [key, entry] of Object.entries(manifest.units)) {
      const anchors = await readJson(path.join(sourceDirectory, `${key}-anchors.json`), null);
      if (!anchors) continue;
      entry.anchors = anchors;
      count++;
    }
    await writeCatalogues(manifest, report);
    console.log(`전직 무기 부착점 등록: ${count}종 · 기존 이미지 유지`);
    return;
  }
  if (advancedMap && (!allies.includes(advancedMap) || requested.length))
    throw new Error('--advanced-map에는 동료 기본 키 한 명만 지정하고 --only와 함께 사용하지 마세요.');
  if (!advancedMap && (!requested.length || requested.some(id => !fullKeys.has(id))))
    throw new Error('제작할 상급 또는 비전 전직 키를 --only=<id>__promoted 로 지정하세요.');
  if (input && !advancedMap && requested.length !== 1) throw new Error('--source는 --only 한 캐릭터에만 사용할 수 있습니다.');
  if (correctionInputs.length && !advancedMap && requested.length !== 1)
    throw new Error('--correction은 한 캐릭터 원화에만 사용할 수 있습니다.');
  await fs.mkdir(output, { recursive: true });
  const manifest = await readJson(path.join(output, 'manifest.json'), { units: {} });
  const report = await readJson(reportPath, { units: {} });
  const sourceId = advancedMap ? `${advancedMap}__advanced-map` : requested[0];
  const correctionSlots = advancedMap ? [0, 1].flatMap(form => ['map', 'rear', ...walking].map(pose => `form${form}-${pose}`)) : slots;
  const correctionOriginals = { ...(report.units[sourceId]?.correctionOriginals || {}) };
  for (const correction of correctionInputs) {
    if (!correctionSlots.includes(correction.pose)) throw new Error(`알 수 없는 교정 자세: ${correction.pose}`);
    correctionOriginals[correction.pose] = await importSource(`${sourceId}-${correction.pose}-correction`, correction.input);
  }
  if (advancedMap) {
    const originalSource = input ? await importSource(sourceId, input) : {
      originalSourceName: report.units[sourceId]?.originalSourceName,
      originalSourceSha256: report.units[sourceId]?.originalSourceSha256,
    };
    if (Object.keys(correctionOriginals).length) originalSource.correctionOriginals = correctionOriginals;
    await prepareAdvancedMap(advancedMap, manifest, report, originalSource);
    await writeCatalogues(manifest, report);
    return;
  }
  for (const id of requested) {
    const originalSource = input ? await importSource(id, input) : {
      originalSourceName: report.units[id]?.originalSourceName,
      originalSourceSha256: report.units[id]?.originalSourceSha256,
    };
    const existingCorrections = id === sourceId ? correctionOriginals : report.units[id]?.correctionOriginals;
    if (existingCorrections && Object.keys(existingCorrections).length) originalSource.correctionOriginals = existingCorrections;
    await prepare(id, manifest, report, originalSource);
    await writeCatalogues(manifest, report);
  }
}

async function withManifestLock() {
  await fs.mkdir(output, { recursive: true });
  const lockPath = path.join(output, '.prepare.lock');
  let lock;
  for (let attempt = 0; attempt < 900; attempt++) {
    try { lock = await fs.open(lockPath, 'wx'); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!lock) throw new Error('전직 원화 목록 제작 잠금 대기 시간이 초과되었습니다.');
  try { await main(); }
  finally { await lock.close(); await fs.unlink(lockPath); }
}

if (require.main === module) withManifestLock().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { prepare, prepareAdvancedMap, writeCatalogues, slots };
