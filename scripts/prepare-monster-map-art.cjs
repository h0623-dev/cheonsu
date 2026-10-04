const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { extract, bounds } = require('./prepare-character-redesign.cjs');
const root = path.resolve(__dirname, '..');
const ids = ['kobold-hunter', 'lizard-spearman', 'horned-ogre', 'harpy-scout', 'skeleton-warrior', 'rock-spirit'];
const json = value => JSON.stringify(value, null, 2) + '\n';

async function place(source, relative, quality = 94) {
  const resized = await sharp(source.pixels, { raw: { width: source.width, height: source.height, channels: 4 } })
    .resize({ height: 400 }).png().toBuffer({ resolveWithObject: true });
  const width = Math.max(384, resized.info.width + 24);
  const file = path.join(root, 'public', relative);
  await sharp({ create: { width, height: 480, channels: 4, background: '#00000000' } })
    .composite([{ input: resized.data, left: Math.floor((width - resized.info.width) / 2), top: 48 }])
    .webp({ quality, alphaQuality: 100, effort: 6 }).toFile(file);
  const measured = await bounds(file);
  return { canvas: [width, 480], visibleHeight: measured.bottom - measured.top + 1, foot: measured.bottom };
}

async function main() {
  const rearSource = 'docs/art/characters-v2/sources/monsters-rear-atlas.png';
  const atlas = await extract(path.join(root, rearSource), 2, 3);
  const mapFile = path.join(root, 'public/art/map-sprites-v4/manifest.json');
  const rearFile = path.join(root, 'public/art/directions-v1/manifest.json');
  const characterFile = path.join(root, 'public/art/characters-v2/manifest.json');
  const map = JSON.parse(await fs.readFile(mapFile, 'utf8'));
  const rear = JSON.parse(await fs.readFile(rearFile, 'utf8'));
  const characters = JSON.parse(await fs.readFile(characterFile, 'utf8'));
  const report = { sourcePath: rearSource, sha256: atlas.sha256, size: [atlas.width, atlas.height], units: {} };
  for (const [index, id] of ids.entries()) {
    const art = characters.units[id];
    if (!art) throw new Error(`${id}: 전투 원화를 먼저 추출하세요.`);
    const front = await extract(path.join(root, 'public', art.motion.recover), 1, 1);
    const mapPath = `/art/map-sprites-v4/${id}.webp`;
    const frontMetrics = await place(front.sources[0], mapPath);
    map[id] = { source: art.motion.recover, ...frontMetrics,
      combatScale: Number((360 / (art.metrics.recover.bottom - art.metrics.recover.top + 1)).toFixed(4)) };
    const rearPath = `/art/directions-v1/${id}-back.webp`;
    const rearMetrics = await place(atlas.sources[index], rearPath, 80);
    rear[id] = { rear: rearPath, ...rearMetrics };
    art.map = mapPath;
    report.units[id] = { rearSourceBounds: atlas.sources[index].box, front: frontMetrics, rear: rearMetrics };
    console.log(`PASS 새 적 앞뒤 대기 아트: ${id}`);
  }
  await fs.writeFile(mapFile, json(map));
  await fs.writeFile(rearFile, json(rear));
  await fs.writeFile(characterFile, json(characters));
  await fs.writeFile(path.join(root, 'public/art/map-sprites-v4/precache.js'), `self.MAP_SPRITE_FILES = ${JSON.stringify(Object.keys(map).map(id => `/art/map-sprites-v4/${id}.webp`))};\n`);
  await fs.writeFile(path.join(root, 'public/art/directions-v1/precache.js'), `self.DIRECTION_ART_FILES = ${JSON.stringify(Object.values(rear).map(entry => entry.rear))};\n`);
  await fs.writeFile(path.join(root, 'docs/art/characters-v2/monster-map-extraction-report.json'), json(report));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
