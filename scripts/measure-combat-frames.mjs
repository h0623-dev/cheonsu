import fs from 'node:fs/promises';
import sharp from 'sharp';
import { combatUnitIds, combatMotionPoses, getCombatMotionSprite } from '../src/data/combatArt.js';

const frames = {};
for (const id of combatUnitIds) {
  frames[id] = {};
  for (const pose of combatMotionPoses) {
    const file = new URL(`../public${getCombatMotionSprite(id, pose)}`, import.meta.url);
    const { data, info } = await sharp(file.pathname.replace(/^\/([A-Za-z]:)/, '$1')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let top = info.height, bottom = 0;
    for (let p = 0; p < info.width * info.height; p++) if (data[p * 4 + 3] > 64) {
      top = Math.min(top, Math.floor(p / info.width));
      bottom = Math.max(bottom, Math.floor(p / info.width));
    }
    frames[id][pose] = { height: info.height, top, bottom };
  }
}
await fs.writeFile(new URL('../src/data/combatFrameMetrics.json', import.meta.url), JSON.stringify(frames, null, 2) + '\n');
console.log(`Measured ${Object.keys(frames).length * combatMotionPoses.length} combat frames; original images unchanged.`);
