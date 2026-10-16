import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { combatArtKeys, getCombatMotionSprite } from '../src/data/combatArt.js';
import { getCharacterArt } from '../src/data/characterArt.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const poses = ['run-a', 'run-b', 'windup', 'strike', 'recover', 'recoil', 'skill-a', 'skill-b'];
const cache = new Map();

// Layout input, built from the authored frame pixels. The runtime fits both
// bodies and their complete weapons; recover height alone cannot describe them.
function frameBounds(source) {
  if (!cache.has(source)) cache.set(source, (async () => {
    const filename = path.join(root, 'public', source.replace(/^\/+/, ''));
    const { data, info } = await sharp(await fs.readFile(filename)).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let index = 0; index < info.width * info.height; index++) {
      if (data[index * 4 + 3] <= 64) continue;
      const x = index % info.width, y = Math.floor(index / info.width);
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    if (right < left || bottom < top) throw new Error(`배치 영역을 만들 캐릭터 픽셀이 없습니다: ${source}`);
    return { left, top, right, bottom };
  })());
  return cache.get(source);
}

const result = {};
for (const key of combatArtKeys) {
  const art = getCharacterArt(key);
  result[key] = {};
  for (const pose of poses) {
    const source = art?.motion?.[pose] || getCombatMotionSprite(key, pose);
    result[key][pose] = await frameBounds(source);
  }
}

// The runtime registry canonicalizes the original silvan asset spelling to
// sylvan. Keep both lookup spellings on the same authored layout coordinates.
for (const key of combatArtKeys.filter(key => key === 'sylvan' || key.startsWith('sylvan__')))
  result[key.replace(/^sylvan/, 'silvan')] = result[key];

await fs.writeFile(path.join(root, 'src/data/cinematicFrameBounds.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('전투 배치용 원화 경계 메타데이터 제작 완료 · 기존 아트 ID와 자산 별칭 유지');
