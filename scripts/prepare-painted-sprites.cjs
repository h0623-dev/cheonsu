const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const groups = {
  allies: ['hero', 'bram', 'lina', 'aria', 'leon', 'sera', 'noah', 'yuna', 'rakan', 'miho', 'teo', 'irene', 'kaz', 'ella', 'jin', 'luka', 'baekho'],
  enemies: ['raider', 'ranger', 'sniper', 'marauder', 'assassin_elite', 'iron_lancer', 'plague_doctor', 'beast_tamer', 'storm_mage', 'blade_dancer', 'siege_gunner', 'sentinel', 'blackguard', 'warlord', 'pyromancer', 'frost_mage', 'cultist', 'void_knight', 'wolf'],
};

// Connected silhouettes preserve spear tips that extend beyond an atlas cell.
function splitSilhouettes(data, width, height, count, rows = 5, columns = 4) {
  const labels = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  const regions = [];
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== -1 || data[start * 4 + 3] < 8) continue;
    const region = { left: width, top: height, right: 0, bottom: 0, area: 0, sx: 0, sy: 0 };
    let head = 0;
    let tail = 1;
    queue[0] = start;
    labels[start] = regions.length;
    while (head < tail) {
      const pos = queue[head++];
      const x = pos % width;
      const y = Math.floor(pos / width);
      region.left = Math.min(region.left, x);
      region.top = Math.min(region.top, y);
      region.right = Math.max(region.right, x);
      region.bottom = Math.max(region.bottom, y);
      region.area++;
      region.sx += x;
      region.sy += y;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (labels[next] !== -1 || data[next * 4 + 3] < 8) continue;
        labels[next] = regions.length;
        queue[tail++] = next;
      }
    }
    region.cx = region.sx / region.area;
    region.cy = region.sy / region.area;
    region.slot = Math.min(rows - 1, Math.floor(region.cy / height * rows)) * columns + Math.min(columns - 1, Math.floor(region.cx / width * columns));
    regions.push(region);
  }
  const major = regions.filter(region => region.area > 1000 && region.slot < count);
  for (const region of regions) {
    if (region.area > 1000 && region.slot < count) continue;
    const nearest = major.reduce((best, candidate) => {
      const dx = Math.max(candidate.left - region.cx, 0, region.cx - candidate.right);
      const dy = Math.max(candidate.top - region.cy, 0, region.cy - candidate.bottom);
      const distance = dx * dx + dy * dy;
      return !best || distance < best.distance ? { distance, slot: candidate.slot } : best;
    }, null);
    region.slot = nearest?.slot ?? -1;
  }
  return { labels, regions };
}

async function main() {
  const output = path.join(root, 'public/sprites/painted-v1');
  await mkdir(path.join(output, 'portraits'), { recursive: true });
  const manifest = {};
  for (const [group, ids] of Object.entries(groups)) {
    const input = await readFile(path.join(root, `docs/art/sources/${group}.png`));
    if (!(await sharp(input).metadata()).hasAlpha) throw new Error(`${group}: source needs real transparency`);
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { labels, regions } = splitSilhouettes(data, info.width, info.height, ids.length);
    for (const [slot, id] of ids.entries()) {
      const parts = regions.filter(region => region.slot === slot && region.area >= 4);
      if (!parts.some(region => region.area > 1000)) throw new Error(`Missing silhouette: ${id}`);
      const left = Math.max(0, Math.min(...parts.map(part => part.left)) - 2);
      const top = Math.max(0, Math.min(...parts.map(part => part.top)) - 2);
      const right = Math.min(info.width - 1, Math.max(...parts.map(part => part.right)) + 2);
      const bottom = Math.min(info.height - 1, Math.max(...parts.map(part => part.bottom)) + 2);
      const width = right - left + 1;
      const height = bottom - top + 1;
      const pixels = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const src = (y + top) * info.width + x + left;
          const region = regions[labels[src]];
          if (region?.slot !== slot || region.area < 4) continue;
          data.copy(pixels, (y * width + x) * 4, src * 4, src * 4 + 4);
        }
      }
      const source = sharp(pixels, { raw: { width, height, channels: 4 } });
      const resized = await source.clone().resize({ width: 340, height: id === 'wolf' ? 310 : 434, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
      const sprite = await sharp({ create: { width: 384, height: 480, channels: 4, background: '#00000000' } })
        .composite([{ input: resized.data, left: Math.floor((384 - resized.info.width) / 2), top: 466 - resized.info.height }])
        .webp({ quality: 94, alphaQuality: 100 }).toBuffer();
      await writeFile(path.join(output, `${id}.webp`), sprite);
      const portraitHeight = Math.min(height, Math.round(height * (id === 'wolf' ? 0.9 : 0.52)));
      const portraitWidth = Math.min(width, portraitHeight);
      await source.clone().extract({ left: Math.floor((width - portraitWidth) / 2), top: 0, width: portraitWidth, height: portraitHeight })
        .resize(192, 192, { fit: 'contain', background: '#00000000' })
        .webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(output, `portraits/${id}.webp`));
      manifest[id] = { sprite: `/sprites/painted-v1/${id}.webp`, portrait: `/sprites/painted-v1/portraits/${id}.webp`, sourceBounds: { left, top, width, height } };
    }
  }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Prepared ${Object.keys(manifest).length} sprites and portraits with a shared foot anchor.`);
}

module.exports = { splitSilhouettes, groups };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
