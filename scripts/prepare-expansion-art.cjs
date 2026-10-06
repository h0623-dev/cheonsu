const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { extract, bounds, poses } = require('./prepare-character-redesign.cjs');

const root = path.resolve(__dirname, '..');
const prefix = 'characters-v3';
async function main() {
  const requested = process.argv.find(value => value.startsWith('--only='))?.slice(7).split(',') || [];
  if (!requested.length) throw new Error('새 원화의 캐릭터 ID를 --only로 지정하세요.');
  const directory = path.join(root, 'public/art', prefix);
  let manifest = { units: {} };
  try { manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const id of requested) {
    const sourcePath = `docs/art/${prefix}/sources/${id}.png`;
    const authoredCorrections = {};
    for (let i = 0; i < poses.length; i++) {
      const correctionPath = `docs/art/${prefix}/sources/${id}-${poses[i]}-correction.png`;
      try { authoredCorrections[i] = { corrected: await extract(path.join(root, correctionPath), 1, 1), correctionPath }; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    // 실제 교정 원화를 먼저 엄격한 1×1로 검사한 뒤 해당 슬롯의 실제 픽셀로 대체합니다.
    // 원본에서 붙거나 누락된 자세를 빈칸으로 숨기지 않습니다.
    const replacementSources = Object.fromEntries(Object.entries(authoredCorrections).map(([index, item]) => [index, item.corrected.sources[0]]));
    const atlas = await extract(path.join(root, sourcePath), 3, 3, [], [8], replacementSources);
    const frames = atlas.sources.slice(0, 8);
    const ordinaryHeights = frames.filter((_, index) => !Object.hasOwn(authoredCorrections, index)).map(frame => frame.height).sort((a, b) => a - b);
    const referenceHeight = Object.hasOwn(authoredCorrections, 4)
      ? frames[4].originalFrameHeight || ordinaryHeights[Math.floor(ordinaryHeights.length / 2)] || frames[4].height
      : frames[4].height;
    const sourceCorrections = {};
    for (const [index, { corrected, correctionPath }] of Object.entries(authoredCorrections)) {
      const pose = frames[index];
      const targetHeight = pose.originalFrameHeight || referenceHeight;
      const normalization = targetHeight / pose.height;
      frames[index] = { ...pose, normalization };
      sourceCorrections[poses[index]] = { sourcePath: correctionPath, sha256: corrected.sha256, sourceBounds: pose.box, normalization, targetHeight };
    }
    const reference = frames[4];
    const scale = Math.min(380 / (reference.height * (reference.normalization || 1)), ...frames.map(frame => Math.min(456 / (frame.height * (frame.normalization || 1)), 476 / (frame.width * (frame.normalization || 1)))));
    const entry = { motion: {}, metrics: {}, portrait: `/art/${prefix}/portraits/${id}.webp`, dialogue: `/art/${prefix}/dialogue/${id}.webp`, map: `/art/${prefix}/map/${id}.webp` };
    if (Object.keys(sourceCorrections).length) entry.sourceCorrections = sourceCorrections;
    for (let i = 0; i < poses.length; i++) {
      const frame = frames[i];
      const w = Math.max(1, Math.round(frame.width * scale * (frame.normalization || 1)));
      const h = Math.max(1, Math.round(frame.height * scale * (frame.normalization || 1)));
      const input = await sharp(frame.pixels, { raw: { width: frame.width, height: frame.height, channels: 4 } }).resize(w, h).png().toBuffer();
      const relative = `units/${id}-${poses[i]}.webp`;
      await fs.mkdir(path.join(directory, 'units'), { recursive: true });
      const file = path.join(directory, relative);
      await sharp({ create: { width: 512, height: 512, channels: 4, background: '#00000000' } }).composite([{ input, left: Math.floor((512 - w) / 2), top: 480 - h }]).webp({ quality: 92, alphaQuality: 100 }).toFile(file);
      entry.motion[poses[i]] = `/art/${prefix}/${relative}`;
      const measured = await bounds(file);
      entry.metrics[poses[i]] = { height: 512, top: measured.top, bottom: measured.bottom };
    }
    const dialogue = atlas.sources[8];
    const dw = Math.round(dialogue.width * Math.min(470 / dialogue.width, 590 / dialogue.height));
    const dh = Math.round(dialogue.height * Math.min(470 / dialogue.width, 590 / dialogue.height));
    const bust = await sharp(dialogue.pixels, { raw: { width: dialogue.width, height: dialogue.height, channels: 4 } }).resize(dw, dh).png().toBuffer();
    for (const subdir of ['dialogue', 'portraits', 'map']) await fs.mkdir(path.join(directory, subdir), { recursive: true });
    await sharp({ create: { width: 512, height: 640, channels: 4, background: '#00000000' } }).composite([{ input: bust, left: Math.floor((512 - dw) / 2), top: 620 - dh }]).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(root, 'public', entry.dialogue));
    await sharp(dialogue.pixels, { raw: { width: dialogue.width, height: dialogue.height, channels: 4 } }).extract({ left: 0, top: 0, width: dialogue.width, height: Math.max(1, Math.round(dialogue.height * .62)) }).resize(300, 300, { fit: 'contain', background: '#00000000' }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(root, 'public', entry.portrait));
    await sharp(path.join(root, 'public', entry.motion.recover)).resize(256, 256).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(root, 'public', entry.map));
    if (id.includes('__form')) {
      const baseId = id.split('__form')[0];
      entry.map = ['mare', 'harin', 'edan', 'silvan', 'sylvan'].includes(baseId)
        ? `/art/${prefix}/map/${baseId === 'sylvan' ? 'silvan' : baseId}.webp`
        : `/art/map-sprites-v4/${baseId}.webp`;
    }
    manifest.units[id] = entry;
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`원화 적용: ${id} · 실제 자세 8종과 대화·초상화·지도`);
  }
  const files = Object.values(manifest.units).flatMap(entry => [...Object.values(entry.motion), entry.portrait, entry.dialogue, entry.map]);
  await fs.writeFile(path.join(directory, 'precache.js'), `self.EXPANSION_CHARACTER_ART_FILES=${JSON.stringify(files)};\n`);
}
async function withManifestLock() {
  const lockPath = path.join(root, 'public/art', prefix, '.prepare.lock');
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  let lock;
  for (let attempt = 0; attempt < 900; attempt++) {
    try { lock = await fs.open(lockPath, 'wx'); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!lock) throw new Error('원화 목록 저장 잠금 대기 시간이 초과되었습니다.');
  try { await main(); }
  finally { await lock.close(); await fs.unlink(lockPath); }
}
withManifestLock().catch(error => { console.error(error); process.exitCode = 1; });
