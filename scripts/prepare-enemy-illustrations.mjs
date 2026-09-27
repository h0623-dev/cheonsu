import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { enemyIllustrationKeys } from '../src/data/enemyIllustrations.js';

const source = 'docs/art/enemy-illustrations-v1';
const target = 'public/art/enemy-illustrations-v1';
await fs.mkdir(`${target}/portraits`, { recursive: true });
for (const key of enemyIllustrationKeys) {
  const input = path.join(source, `${key}.png`);
  await sharp(input).webp({ quality: 86, alphaQuality: 100 }).toFile(`${target}/${key}.webp`);
  await sharp(input).extract({ left: 180, top: 90, width: 740, height: 740 })
    .resize(320, 320).webp({ quality: 86, alphaQuality: 100 }).toFile(`${target}/portraits/${key}.webp`);
  console.log(`${key}: 전신 / 정보창 초상 생성`);
}
