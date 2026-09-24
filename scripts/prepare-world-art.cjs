const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { splitSilhouettes, groups } = require('./prepare-painted-sprites.cjs');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'docs/art/world-v2/sources');
const output = path.join(root, 'public/art/world-v2');
const props = ['oak', 'pine', 'rocks', 'wall', 'arch', 'pillar', 'snow-pine', 'ice-crystal', 'dead-tree', 'crystal', 'crates', 'brazier', 'shrub', 'maple', 'monument', 'palisade'];
const terrain = ['grass', 'road', 'forest', 'rock', 'stone', 'paving', 'water', 'swamp', 'snow', 'ice', 'dark', 'rune', 'fire', 'trap', 'flowers', 'gravel'];
const scenes = ['frontier', 'forest', 'fortress', 'snow', 'citadel', 'camp'];
const footRatios = { hero: 0.95, leon: 0.98, raider: 0.96, iron_lancer: 0.96, warlord: 0.94 };

async function cutTransparent(group, ids, rows, isProp = false) {
  const input = await readFile(path.join(source, `${group}.png`));
  const metadata = await sharp(input).metadata();
  if (!metadata.hasAlpha) throw new Error(`${group}: genuine alpha required`);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { labels, regions } = splitSilhouettes(data, info.width, info.height, ids.length, rows);
  const entries = {};
  for (const [slot, id] of ids.entries()) {
    const parts = regions.filter(region => region.slot === slot && region.area >= 4);
    if (!parts.some(region => region.area > 1000)) throw new Error(`Missing ${group}/${id}`);
    const left = Math.min(...parts.map(part => part.left));
    const top = Math.min(...parts.map(part => part.top));
    const width = Math.max(...parts.map(part => part.right)) - left + 1;
    const height = Math.max(...parts.map(part => part.bottom)) - top + 1;
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const src = (y + top) * info.width + x + left;
        const region = regions[labels[src]];
        if (region?.slot === slot && region.area >= 4) data.copy(pixels, (y * width + x) * 4, src * 4, src * 4 + 4);
      }
    }
    const cutout = sharp(pixels, { raw: { width, height, channels: 4 } });
    if (isProp) {
      await cutout.resize({ width: 384, height: 448, fit: 'inside' }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(output, `props/${id}.webp`));
      continue;
    }
    const resized = await cutout.clone().resize({ width: 330, height: id === 'wolf' ? 330 : 420, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
    // Feet, not the lowest sword tip, define the common y=448 ground anchor.
    const feet = Math.round(resized.info.height * (footRatios[id] || 1));
    await sharp({ create: { width: 384, height: 480, channels: 4, background: '#00000000' } })
      .composite([{ input: resized.data, left: Math.floor((384 - resized.info.width) / 2), top: 448 - feet }])
      .webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(output, `units/${id}.webp`));
    const portraitHeight = Math.round(height * (id === 'wolf' ? 0.92 : 0.5));
    const portraitWidth = Math.min(width, portraitHeight);
    await cutout.extract({ left: Math.floor((width - portraitWidth) / 2), top: 0, width: portraitWidth, height: portraitHeight })
      .resize(192, 192, { fit: 'contain', background: '#00000000' }).webp({ quality: 94, alphaQuality: 100 })
      .toFile(path.join(output, `portraits/${id}.webp`));
    entries[id] = { sprite: `/art/world-v2/units/${id}.webp`, portrait: `/art/world-v2/portraits/${id}.webp` };
  }
  return entries;
}

async function cutGrid(file, names, columns, rows, folder) {
  const input = await readFile(path.join(source, `${file}.png`));
  const { width, height } = await sharp(input).metadata();
  for (const [index, name] of names.entries()) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const left = Math.round(col * width / columns);
    // The generated scene atlas has slightly unequal row heights.
    const rowEdges = file === 'scenes' ? [0, 391, 784, height] : Array.from({ length: rows + 1 }, (_, y) => Math.round(y * height / rows));
    const top = rowEdges[row];
    await sharp(input).extract({ left, top, width: Math.round((col + 1) * width / columns) - left, height: rowEdges[row + 1] - top })
      .webp({ quality: 94 }).toFile(path.join(output, `${folder}/${name}.webp`));
  }
}

async function main() {
  for (const folder of ['units', 'portraits', 'props', 'terrain', 'scenes']) await mkdir(path.join(output, folder), { recursive: true });
  const units = { ...await cutTransparent('allies', groups.allies, 5), ...await cutTransparent('enemies', groups.enemies, 5) };
  await cutTransparent('props', props, 4, true);
  await cutGrid('terrain', terrain, 4, 4, 'terrain');
  await cutGrid('scenes', scenes, 2, 3, 'scenes');
  await sharp(path.join(source, 'frontier.png')).webp({ quality: 94 }).toFile(path.join(output, 'scenes/frontier.webp'));
  const icon = path.join(source, 'icon.png');
  for (const size of [192, 512]) {
    await sharp(icon).resize(size, size).png().toFile(path.join(output, `icon-${size}.png`));
  }
  const insetIcon = await sharp(icon).resize(360, 360).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 3, background: '#1a3929' } })
    .composite([{ input: insetIcon, left: 76, top: 76 }]).png().toFile(path.join(output, 'icon-maskable.png'));
  for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    const folder = path.join(root, `android/app/src/main/res/mipmap-${density}`);
    for (const name of ['ic_launcher', 'ic_launcher_round']) await sharp(icon).resize(size, size).png().toFile(path.join(folder, `${name}.png`));
    await sharp(path.join(output, 'icon-maskable.png')).resize(Math.round(size * 2.25)).png().toFile(path.join(folder, 'ic_launcher_foreground.png'));
  }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ units, props, terrain, scenes }, null, 2) + '\n');
  const files = [
    ...Object.values(units).flatMap(unit => [unit.sprite, unit.portrait]),
    ...props.map(id => `/art/world-v2/props/${id}.webp`),
    ...terrain.map(id => `/art/world-v2/terrain/${id}.webp`),
    ...scenes.map(id => `/art/world-v2/scenes/${id}.webp`),
    '/art/world-v2/icon-192.png', '/art/world-v2/icon-512.png', '/art/world-v2/icon-maskable.png',
  ];
  await writeFile(path.join(output, 'precache.js'), `self.WORLD_ART_FILES = ${JSON.stringify(files, null, 2)};\n`);
  console.log(`World v2: ${Object.keys(units).length} units + portraits, ${props.length} props, ${terrain.length} terrain materials, ${scenes.length} scenes.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
