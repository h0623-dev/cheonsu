import fs from 'node:fs/promises';
import sharp from 'sharp';

const source = 'docs/art/chapters-v1';
const target = 'public/art/chapters-v1';
await fs.mkdir(target, { recursive: true });
for (let id = 1; id <= 30; id++) {
  const name = `chapter-${String(id).padStart(2, '0')}`;
  const original = `${source}/${name}.png`;
  await fs.access(original);
  await sharp(original).resize({ width: 1536, withoutEnlargement: true }).webp({ quality: 84 }).toFile(`${target}/${name}.webp`);
  await sharp(original).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 80 }).toFile(`${target}/${name}-thumb.webp`);
  console.log(`제${id}장 원화와 경량 미리보기 준비`);
}
