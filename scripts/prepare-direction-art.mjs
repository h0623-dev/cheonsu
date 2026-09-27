import fs from 'node:fs/promises';
import sharp from 'sharp';
import { combatUnitIds } from '../src/data/combatArt.js';

export const groups = [
  { id: 'allies-a', cols: 3, rows: 3, keys: combatUnitIds.slice(5, 14) },
  { id: 'allies-b', cols: 3, rows: 3, keys: combatUnitIds.slice(14, 22) },
  { id: 'enemies-a', cols: 5, rows: 2, keys: combatUnitIds.slice(22, 32) },
  { id: 'enemies-b', cols: 3, rows: 3, keys: combatUnitIds.slice(32) },
  { id: 'bosses', cols: 3, rows: 2, keys: combatUnitIds.slice(0, 5) },
];
const root = 'docs/art/directions-v1';
await fs.mkdir(root, { recursive: true });
if (process.argv.includes('--refs')) {
  for (const group of groups) {
    const layers = [];
    for (const [index, key] of group.keys.entries()) {
      const input = await sharp(`public/art/map-sprites-v4/${key}.webp`).resize(320, 400).png().toBuffer();
      layers.push({ input, left: index % group.cols * 512 + 96, top: Math.floor(index / group.cols) * 512 + 56 });
    }
    await sharp({ create: { width: group.cols * 512, height: group.rows * 512, channels: 4, background: '#e8edf0' } }).composite(layers).png().toFile(`${root}/${group.id}-reference.png`);
    console.log(group.id, group.keys.join(', '));
  }
} else {
  await fs.mkdir('public/art/directions-v1', { recursive: true });
  const manifest = {};
  for (const group of groups) {
    const source = `${root}/${group.id}.png`;
    const info = await sharp(source).metadata();
    if (!info.hasAlpha) throw new Error(`Missing generated transparency: ${source}`);
    const atlas = await sharp(source).ensureAlpha().raw().toBuffer();
    const rowCuts = [0];
    for (let row = 1; row < group.rows; row++) {
      const nominal = Math.round(row * info.height / group.rows);
      let best = nominal, score = Infinity;
      for (let y = nominal - 48; y < nominal + 48; y++) {
        let occupied = 0;
        for (let x = 0; x < info.width; x++) for (let dy = -3; dy <= 3; dy++) occupied += atlas[((y + dy) * info.width + x) * 4 + 3] > 32;
        const candidate = occupied * 1000 + Math.abs(y - nominal);
        if (candidate < score) { best = y; score = candidate; }
      }
      rowCuts.push(best);
    }
    rowCuts.push(info.height);
    // Generated sheets can drift a few pixels; cut through transparent gutters, never weapons.
    const gutter = (nominal, startY, endY) => {
      let best = nominal, score = Infinity;
      for (let x = Math.max(4, nominal - 96); x < Math.min(info.width - 4, nominal + 96); x++) {
        let occupied = 0;
        for (let y = startY; y < endY; y++) for (let dx = -3; dx <= 3; dx++) occupied += atlas[(y * info.width + x + dx) * 4 + 3] > 32;
        const candidate = occupied * 1000 + Math.abs(x - nominal);
        if (candidate < score) { best = x; score = candidate; }
      }
      return best;
    };
    for (const [index, key] of group.keys.entries()) {
      const top = rowCuts[Math.floor(index / group.cols)];
      const height = rowCuts[Math.floor(index / group.cols) + 1] - top;
      const column = index % group.cols;
      const left = column === 0 ? 0 : gutter(Math.round(column * info.width / group.cols), top, top + height);
      const right = column === group.cols - 1 ? info.width : gutter(Math.round((column + 1) * info.width / group.cols), top, top + height);
      const width = right - left;
      const cell = await sharp(source).extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let x1 = width, y1 = height, x2 = -1, y2 = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (cell.data[(y * width + x) * 4 + 3] > 128) {
        x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y);
      }
      if (x2 < x1 || x1 === 0 || x2 >= width - 1 || y1 === 0 || y2 >= height - 1) throw new Error(`Empty/clipped generated cell: ${key} ${JSON.stringify({ left, top, width, height, x1, y1, x2, y2 })}`);
      const visibleHeight = key === 'wolf' ? 260 : 400;
      const resized = await sharp(cell.data, { raw: cell.info }).extract({ left: x1, top: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 }).resize({ height: visibleHeight }).png().toBuffer({ resolveWithObject: true });
      const canvasWidth = Math.max(384, resized.info.width + 24);
      const file = `public/art/directions-v1/${key}-back.webp`;
      await sharp({ create: { width: canvasWidth, height: 480, channels: 4, background: '#00000000' } }).composite([{ input: resized.data, left: Math.floor((canvasWidth - resized.info.width) / 2), top: 448 - visibleHeight }]).webp({ quality: 92 }).toFile(file);
      manifest[key] = { rear: `/${file.slice(7)}`, canvas: [canvasWidth, 480], visibleHeight, foot: 447 };
    }
  }
  await fs.writeFile('public/art/directions-v1/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile('public/art/directions-v1/precache.js', `self.DIRECTION_ART_FILES = ${JSON.stringify(Object.values(manifest).map(entry => entry.rear))};\n`);
  console.log(`Prepared ${Object.keys(manifest).length} rear sprites without changing the front sprites.`);
}
