const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { splitSilhouettes, groups } = require('./prepare-painted-sprites.cjs');

const root = path.resolve(__dirname, '..');
const bosses = ['boss_commander', 'boss_frost', 'boss_ember', 'boss_oracle', 'boss_abyss'];
const poses = ['run-a', 'run-b', 'windup', 'strike', 'recover', 'recoil', 'skill-a', 'skill-b'];
const walking = ['front-a', 'front-b', 'back-a', 'back-b'];
const monsters = ['kobold-hunter', 'lizard-spearman', 'horned-ogre', 'harpy-scout', 'skeleton-warrior', 'rock-spirit'];
const ids = [...groups.allies, ...groups.enemies, ...bosses, ...monsters];
const digest = input => crypto.createHash('sha256').update(input).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

// Extract authored independent silhouettes; do not synthesize or deform poses.
async function extract(file, rows, columns, componentAssignments = [], replacedSlots = [], replacementSources = {}) {
  const input = await fs.readFile(file);
  const metadata = await sharp(input).metadata();
  if (!metadata.hasAlpha) throw new Error(`${file}: 투명 원화가 필요합니다.`);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = 0;
  for (let p = 3; p < data.length; p += 4) if (data[p] === 0) clear++;
  if (clear < info.width * info.height * .1) throw new Error(`${file}: 실제 투명 여백이 부족합니다.`);
  const core = Buffer.from(data);
  for (let p = 3; p < core.length; p += 4) if (core[p] < 24) core[p] = 0;
  const { labels, regions } = splitSilhouettes(core, info.width, info.height, rows * columns, rows, columns);
  for (const assignment of componentAssignments) {
    const selected = regions.filter(region => ['left', 'top', 'right', 'bottom'].every(key => region[key] === assignment.sourceBounds[key]) && region.area === assignment.area);
    if (selected.length !== 1) throw new Error(`${file}: ${assignment.name}의 분리 도형이 승인 원화와 다릅니다.`);
    selected[0].slot = assignment.slot;
  }
  const sources = [];
  for (let slot = 0; slot < rows * columns; slot++) {
    const parts = regions.filter(region => region.slot === slot && region.area >= 4);
    if (Object.hasOwn(replacementSources, slot)) {
      const replacement = replacementSources[slot];
      if (!replacement || !Buffer.isBuffer(replacement.pixels) || replacement.width < 1 || replacement.height < 1
        || replacement.pixels.length !== replacement.width * replacement.height * 4)
        throw new Error(`${file}: ${slot}번의 실제 교정 원화 픽셀 데이터가 유효하지 않습니다.`);
      let originalFrameHeight = null;
      if (parts.some(region => region.area > 1000)) {
        const oldWidth = Math.max(...parts.map(p => p.right)) - Math.min(...parts.map(p => p.left)) + 1;
        const oldHeight = Math.max(...parts.map(p => p.bottom)) - Math.min(...parts.map(p => p.top)) + 1;
        if (oldWidth <= info.width / columns * 1.6 && oldHeight <= info.height / rows * 1.25)
          originalFrameHeight = oldHeight;
      }
      // The caller already extracts this authored full pose strictly as 1×1.
      // Missing/merged atlas silhouettes never become blank placeholder sprites.
      sources.push({ ...replacement, originalFrameHeight });
      continue;
    }
    if (!parts.some(region => region.area > 1000)) throw new Error(`${file}: ${slot}번 자세 누락`);
    const box = { left: Math.min(...parts.map(p => p.left)), top: Math.min(...parts.map(p => p.top)),
      right: Math.max(...parts.map(p => p.right)), bottom: Math.max(...parts.map(p => p.bottom)) };
    const width = box.right - box.left + 1;
    const height = box.bottom - box.top + 1;
    // A long blade may extend into a neighbour's empty gutter; it remains one isolated silhouette.
    if (width > info.width / columns * 1.6 || height > info.height / rows * 1.25)
      throw new Error(`${file}: ${slot}번 자세가 이웃 셀과 연결되었습니다.`);
    if (!replacedSlots.includes(slot) && (box.left === 0 || box.right === info.width - 1 || box.top === 0 || box.bottom === info.height - 1))
      throw new Error(`${file}: ${slot}번 자세가 원화 가장자리에서 잘렸습니다.`);
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const source = (box.top + y) * info.width + box.left + x;
      if (regions[labels[source]]?.slot === slot && regions[labels[source]].area >= 4)
        data.copy(pixels, (y * width + x) * 4, source * 4, source * 4 + 4);
    }
    sources.push({ pixels, width, height, box });
  }
  return { sources, sha256: digest(input), width: info.width, height: info.height };
}

async function bounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1, clear = 0;
  for (let pos = 0; pos < info.width * info.height; pos++) {
    const alpha = data[pos * 4 + 3];
    if (!alpha) clear++;
    if (alpha <= 64) continue;
    const x = pos % info.width, y = Math.floor(pos / info.width);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (!clear || left <= 0 || right >= info.width - 1 || top <= 0 || bottom >= info.height - 1)
    throw new Error(`${file}: 투명도 또는 가장자리 검사 실패`);
  return { width: info.width, height: info.height, left, top, right, bottom };
}

async function normalize(source, file, width, height, foot, scale) {
  const w = Math.round(source.width * scale), h = Math.round(source.height * scale);
  if (w < 1 || h < 1 || w >= width || h >= foot || foot >= height)
    throw new Error(`${file}: 정규화 크기 또는 발 기준이 캔버스 범위를 벗어났습니다.`);
  const input = await sharp(source.pixels, { raw: { width: source.width, height: source.height, channels: 4 } })
    .resize(w, h).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: '#00000000' } })
    .composite([{ input, left: Math.floor((width - w) / 2), top: foot - h }])
    .webp({ quality: 94, alphaQuality: 100 }).toFile(file);
  return bounds(file);
}

async function prepareCharacter(id, manifest, report) {
  const sourcePath = `docs/art/characters-v2/sources/${id}.png`;
  const authoredCorrections = {};
  for (const [index, pose] of poses.entries()) {
    const correctionPath = `docs/art/characters-v2/sources/${id}-${pose}-correction.png`;
    try {
      const corrected = await extract(path.join(root, correctionPath), 1, 1);
      authoredCorrections[index] = { corrected, correctionPath };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // This authored thrown bottle crosses the gutter into the next grid column.
  // Its exact component signature prevents assigning it to the adjacent pose.
  const componentAssignments = id === 'plague_doctor' ? [{ name: 'thrown-medicine-bottle', slot: 6,
    sourceBounds: { left: 427, top: 920, right: 470, bottom: 969 }, area: 1196 }] : [];
  const atlas = await extract(path.join(root, sourcePath), 3, 3, componentAssignments, Object.keys(authoredCorrections).map(Number));
  const directory = path.join(root, 'public/art/characters-v2/units');
  await fs.mkdir(directory, { recursive: true });
  const frames = atlas.sources.slice(0, 8);
  const corrections = {};
  for (const [index, { corrected, correctionPath }] of Object.entries(authoredCorrections)) {
    const pose = corrected.sources[0];
    const bodyAnchor = id === 'horned-ogre' && poses[index] === 'windup'
      ? { referenceTop: 465, correctedTop: 381 } : null;
    // The overhead club is taller in the complete correction. Match head-to-foot
    // body height to recover so raising the weapon does not shrink the ogre.
    const normalization = bodyAnchor
      ? (frames[4].box.bottom - bodyAnchor.referenceTop + 1) / (pose.box.bottom - bodyAnchor.correctedTop + 1)
      : frames[index].height / pose.height;
    corrections[poses[index]] = { sourcePath: correctionPath, sha256: corrected.sha256,
      sourceBounds: pose.box, normalization, ...(bodyAnchor ? { bodyAnchor } : {}) };
    frames[index] = { ...pose, normalization };
  }
  if (id === 'hero') {
    const correctionPath = 'docs/art/characters-v2/sources/hero-oath.png';
    try {
      const corrected = await extract(path.join(root, correctionPath), 1, 1);
      const pose = corrected.sources[0];
      // The authored guard's upright sword begins above the head. Match the
      // head-to-foot body height to recover instead of shrinking the body to
      // the previous raised-sword silhouette's full height.
      const bodyTop = Math.round(corrected.height * 267 / 1536);
      const bodyHeight = pose.box.bottom - bodyTop + 1;
      corrections['skill-b'] = { sourcePath: correctionPath, sha256: corrected.sha256,
        sourceBounds: pose.box, bodyBounds: { top: bodyTop, bottom: pose.box.bottom },
        normalization: frames[4].height / bodyHeight };
      frames[7] = { ...pose, normalization: corrections['skill-b'].normalization };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const scale = Math.min((id === 'wolf' ? 250 : 408) / frames[4].height,
    ...frames.map(frame => Math.min(468 / (frame.height * (frame.normalization || 1)), 484 / (frame.width * (frame.normalization || 1)))));
  const unit = { motion: {}, metrics: {}, portrait: `/art/characters-v2/portraits/${id}.webp`,
    dialogue: `/art/characters-v2/dialogue/${id}.webp` };
  if (monsters.includes(id)) unit.map = `/art/map-sprites-v4/${id}.webp`;
  for (const [index, pose] of poses.entries()) {
    const relative = `units/${id}-${pose}.webp`;
    unit.motion[pose] = `/art/characters-v2/${relative}`;
    const measured = await normalize(frames[index], path.join(root, 'public/art/characters-v2', relative), 512, 512, 480, scale * (frames[index].normalization || 1));
    unit.metrics[pose] = { height: measured.height, top: measured.top, bottom: measured.bottom };
  }
  await fs.mkdir(path.join(root, 'public/art/characters-v2/dialogue'), { recursive: true });
  await fs.mkdir(path.join(root, 'public/art/characters-v2/portraits'), { recursive: true });
  const dialogue = atlas.sources[8];
  await normalize(dialogue, path.join(root, 'public', unit.dialogue), 512, 640, 620, Math.min(480 / dialogue.width, 600 / dialogue.height));
  // This crop uses the authored dialogue pose rather than an old portrait.
  const headHeight = Math.min(dialogue.height, Math.round(dialogue.height * .65));
  await sharp(dialogue.pixels, { raw: { width: dialogue.width, height: dialogue.height, channels: 4 } })
    .extract({ left: 0, top: 0, width: dialogue.width, height: headHeight })
    .resize(300, 300, { fit: 'contain', background: '#00000000' })
    .extend({ top: 10, bottom: 10, left: 10, right: 10, background: '#00000000' })
    .webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(root, 'public', unit.portrait));
  manifest.units[id] = unit;
  const authoredSkillPoses = {
    bram: { bulwark: 'skill-b', bash: 'skill-a', 'bram-oath-wall': 'skill-b' },
    hero: { 'hero-dawn-slash': 'skill-a' },
    lina: { 'lina-phoenix-flare': 'skill-a' },
    aria: { 'aria-sanctuary-song': 'skill-b' },
  };
  if (authoredSkillPoses[id]) {
    unit.skills = {};
    const reference = unit.metrics.recover;
    const displayScale = .703125 * reference.height / (reference.bottom - reference.top + 1);
    for (const [skillId, pose] of Object.entries(authoredSkillPoses[id]))
      unit.skills[skillId] = { src: unit.motion[pose], scale: displayScale,
        footOffset: `${100 * displayScale * (.9375 - (unit.metrics[pose].bottom + 1) / unit.metrics[pose].height)}%` };
  }
  report.units[id] = { sourcePath, sha256: atlas.sha256, size: [atlas.width, atlas.height], scale,
    sourceBounds: atlas.sources.map(source => source.box), corrections, componentAssignments, metrics: unit.metrics };
}

async function prepareWalk(id, manifest, report) {
  const sourcePath = `docs/art/village-walk-v2/sources/${id}.png`;
  const atlas = await extract(path.join(root, sourcePath), 2, 2);
  const sources = [...atlas.sources];
  const corrections = {};
  if (id === 'rakan') {
    // Front and rear A/B were approved in separate authored atlases. Preserve
    // both originals and extract the approved silhouettes without deformation.
    const rearPath = `docs/art/village-walk-v2/sources/${id}-back.png`;
    const corrected = await extract(path.join(root, rearPath), 2, 2);
    for (const index of [2, 3]) {
      sources[index] = corrected.sources[index];
      corrections[walking[index]] = { sourcePath: rearPath, sha256: corrected.sha256,
        sourceBounds: sources[index].box };
    }
  }
  const map = await readJson(path.join(root, 'public/art/map-sprites-v4/manifest.json'));
  const rear = await readJson(path.join(root, 'public/art/directions-v1/manifest.json'));
  const targetScale = 400 / sources[0].height;
  // Keep A/B on one common scale per view, and align front/back body heights.
  const viewNormalization = sources[0].height / sources[2].height;
  const frames = sources.map((frame, index) => ({ ...frame, normalization: index >= 2 ? viewNormalization : 1 }));
  // Expand for wide weapons before reducing the body; 480px height keeps the
  // rendered size aligned with the unchanged idle/back artwork.
  const neededWidth = Math.ceil(Math.max(...frames.map(frame => frame.width * frame.normalization)) * targetScale) + 20;
  const width = Math.min(480, Math.max(map[id].canvas[0], rear[id].canvas[0], neededWidth));
  const scale = Math.min(targetScale, ...frames.map(frame => Math.min(416 / (frame.height * frame.normalization), (width - 20) / (frame.width * frame.normalization))));
  const directory = path.join(root, 'public/art/village-walk-v2');
  await fs.mkdir(directory, { recursive: true });
  const entry = { frames: {}, metrics: {} };
  for (const [index, pose] of walking.entries()) {
    entry.frames[pose] = `/art/village-walk-v2/${id}-${pose}.webp`;
    entry.metrics[pose] = await normalize(frames[index], path.join(directory, `${id}-${pose}.webp`), width, 480, 448, scale * frames[index].normalization);
    if (entry.metrics[pose].bottom < 440 || entry.metrics[pose].bottom > 447)
      throw new Error(`${id}/${pose}: 보행 발 기준 447에서 벗어났습니다.`);
  }
  manifest.units[id] = entry;
  report.units[id] = { sourcePath, sha256: atlas.sha256, size: [atlas.width, atlas.height], scale, viewNormalization, corrections,
    sourceBounds: sources.map(source => source.box), metrics: entry.metrics };
}

async function main() {
  const isWalk = process.argv.includes('--walk');
  const set = isWalk ? groups.allies : ids;
  const requested = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',') || set;
  for (const id of requested) if (!set.includes(id)) throw new Error(`알 수 없는 캐릭터: ${id}`);
  const prefix = isWalk ? 'village-walk-v2' : 'characters-v2';
  const directory = path.join(root, 'public/art', prefix);
  await fs.mkdir(directory, { recursive: true });
  const manifest = await readJson(path.join(directory, 'manifest.json'), { units: {} });
  const reportPath = path.join(root, 'docs/art', prefix, 'extraction-report.json');
  const report = await readJson(reportPath, { units: {} });
  for (const id of requested) {
    await (isWalk ? prepareWalk : prepareCharacter)(id, manifest, report);
    console.log(`PASS ${prefix}: ${id}`);
  }
  const ordered = Object.fromEntries(set.filter(id => manifest.units[id]).map(id => [id, manifest.units[id]]));
  manifest.units = ordered;
  await fs.writeFile(path.join(directory, 'manifest.json'), json(manifest));
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, json(report));
  const files = Object.values(ordered).flatMap(unit => isWalk ? Object.values(unit.frames) : [...Object.values(unit.motion), unit.portrait, unit.dialogue]);
  await fs.writeFile(path.join(directory, 'precache.js'), `self.${isWalk ? 'VILLAGE_WALK_ART_FILES' : 'CHARACTER_ART_FILES'}=${JSON.stringify(files)};\n`);
  console.log(`${Object.keys(ordered).length}/${set.length}종, ${files.length}개 게임 이미지 준비`);
}

module.exports = { extract, bounds, poses, ids, walking };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
