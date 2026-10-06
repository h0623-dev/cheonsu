const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { extract, bounds } = require('./prepare-character-redesign.cjs');
const root = path.resolve(__dirname, '..');
const poses = ['front-a', 'front-b', 'back-a', 'back-b'];
const ids = ['mare', 'harin', 'edan', 'sylvan'];
async function main() {
  const requested = process.argv.find(value => value.startsWith('--only='))?.slice(7).split(',') || ids;
  const directory = path.join(root, 'public/art/village-walk-v2');
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  for (const id of requested) {
    if (!ids.includes(id)) throw new Error(`알 수 없는 신규 걷기 캐릭터: ${id}`);
    const atlas = await extract(path.join(root, `docs/art/village-walk-v2/sources/${id}.png`), 2, 2);
    const viewNormalization = atlas.sources[0].height / atlas.sources[2].height;
    const frames = atlas.sources.map((frame, index) => ({ ...frame, normalization: index >= 2 ? viewNormalization : 1 }));
    const targetScale = 400 / frames[0].height;
    const width = Math.min(512, Math.max(384, Math.ceil(Math.max(...frames.map(frame => frame.width * frame.normalization)) * targetScale) + 24));
    const scale = Math.min(targetScale, ...frames.map(frame => Math.min(416 / (frame.height * frame.normalization), (width - 24) / (frame.width * frame.normalization))));
    const entry = { frames: {}, metrics: {}, source: `docs/art/village-walk-v2/sources/${id}.png`, sourceSha256: atlas.sha256 };
    for (const [index, pose] of poses.entries()) {
      const frame = frames[index];
      const w = Math.round(frame.width * scale * frame.normalization);
      const h = Math.round(frame.height * scale * frame.normalization);
      const input = await sharp(frame.pixels, { raw: { width: frame.width, height: frame.height, channels: 4 } }).resize(w, h).png().toBuffer();
      // Anchor the visible boot edge; antialiased pixels below alpha 65 can
      // extend the raw silhouette beyond the foot measured by bounds().
      const resized = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let visibleBottom = -1;
      for (let pixel = 0; pixel < resized.info.width * resized.info.height; pixel++)
        if (resized.data[pixel * 4 + 3] > 64) visibleBottom = Math.max(visibleBottom, Math.floor(pixel / resized.info.width));
      if (visibleBottom < 0) throw new Error(`${id}/${pose}: 보이는 보행 원화가 없습니다.`);
      const file = path.join(directory, `${id}-${pose}.webp`);
      await sharp({ create: { width, height: 480, channels: 4, background: '#00000000' } }).composite([{ input, left: Math.floor((width - w) / 2), top: 447 - visibleBottom }]).webp({ quality: 94, alphaQuality: 100 }).toFile(file);
      entry.frames[pose] = `/art/village-walk-v2/${id}-${pose}.webp`;
      entry.metrics[pose] = await bounds(file);
      if (entry.metrics[pose].bottom !== 447) throw new Error(`${id}/${pose}: 발 위치가 447px에서 벗어났습니다.`);
    }
    manifest.units[id] = entry;
    console.log(`신규 걷기 원화 적용: ${id} · 전방/후방 A/B 독립 4프레임`);
  }
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const files = Object.values(manifest.units).flatMap(entry => Object.values(entry.frames));
  await fs.writeFile(path.join(directory, 'precache.js'), `self.VILLAGE_WALK_ART_FILES=${JSON.stringify(files)};\n`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
