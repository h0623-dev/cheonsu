const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { groups, splitSilhouettes } = require('./prepare-painted-sprites.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/art/combat-v1');
const effects = ['slash', 'thrust', 'arrow', 'heavy', 'guard', 'fire', 'ice', 'lightning', 'shadow', 'holy', 'heal', 'poison', 'music', 'claw', 'impact', 'cast'];

async function extract(group, pose, count) {
  const input = path.join(root, `docs/art/combat-v1/sources/${group}-${pose}.png`);
  if (!(await sharp(input).metadata()).hasAlpha) throw new Error(`Missing alpha: ${input}`);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { labels, regions } = splitSilhouettes(data, info.width, info.height, count);
  return Array.from({ length: count }, (_, slot) => {
    const parts = regions.filter(part => part.slot === slot && part.area >= 4);
    if (!parts.some(part => part.area > 1000)) throw new Error(`Missing ${group} ${pose} ${slot}`);
    const left = Math.min(...parts.map(p => p.left));
    const top = Math.min(...parts.map(p => p.top));
    const width = Math.max(...parts.map(p => p.right)) - left + 1;
    const height = Math.max(...parts.map(p => p.bottom)) - top + 1;
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const src = (y + top) * info.width + x + left;
      const region = regions[labels[src]];
      if (region?.slot === slot && region.area >= 4) data.copy(pixels, (y * width + x) * 4, src * 4, src * 4 + 4);
    }
    return { pixels, width, height };
  });
}

async function main() {
  await fs.mkdir(path.join(output, 'units'), { recursive: true });
  await fs.mkdir(path.join(output, 'effects'), { recursive: true });
  const manifest = { units: {}, effects: {} };
  for (const [group, ids] of Object.entries(groups)) {
    const ready = await extract(group, 'ready', ids.length);
    const action = await extract(group, 'action', ids.length);
    for (const [i, id] of ids.entries()) {
      // One scale for both poses preserves body size when a character crouches or lunges.
      const scale = Math.min((id === 'wolf' ? 250 : 414) / ready[i].height, 450 / action[i].height, 484 / ready[i].width, 484 / action[i].width);
      manifest.units[id] = {};
      for (const [pose, source] of [['ready', ready[i]], ['action', action[i]]]) {
        const width = Math.round(source.width * scale);
        const height = Math.round(source.height * scale);
        const input = await sharp(source.pixels, { raw: { width: source.width, height: source.height, channels: 4 } }).resize(width, height).png().toBuffer();
        const file = `units/${id}-${pose}.webp`;
        await sharp({ create: { width: 512, height: 512, channels: 4, background: '#00000000' } })
          .composite([{ input, left: Math.floor((512 - width) / 2), top: 480 - height }])
          .webp({ quality: 93, alphaQuality: 100 }).toFile(path.join(output, file));
        manifest.units[id][pose] = `/art/combat-v1/${file}`;
      }
    }
  }
  const source = path.join(root, 'docs/art/combat-v1/sources/effects.png');
  const meta = await sharp(source).metadata();
  if (!meta.hasAlpha) throw new Error('Effects require alpha');
  for (const [i, id] of effects.entries()) {
    const left = Math.round(i % 4 * meta.width / 4);
    const top = Math.round(Math.floor(i / 4) * meta.height / 4);
    const width = Math.round((i % 4 + 1) * meta.width / 4) - left;
    const height = Math.round((Math.floor(i / 4) + 1) * meta.height / 4) - top;
    await sharp(source).extract({ left, top, width, height }).resize(384, 384).webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(output, `effects/${id}.webp`));
    manifest.effects[id] = `/art/combat-v1/effects/${id}.webp`;
  }
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'precache.js'), `self.COMBAT_ART_FILES = ${JSON.stringify([...Object.values(manifest.units).flatMap(Object.values), ...Object.values(manifest.effects)])};\n`);
  console.log('Prepared 72 fighter poses and 16 battle effects.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
