import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { VILLAGE_WALK_IDS, getVillageWalkFrames } from '../src/data/villageWalk.js';

test('all 17 village companions have four authored transparent walking images at the existing foot anchor', async () => {
  assert.equal(VILLAGE_WALK_IDS.length, 17);
  const paths = new Set();
  for (const id of VILLAGE_WALK_IDS) {
    const frames = getVillageWalkFrames(id);
    assert.equal(frames.length, 4);
    const hashes = new Set();
    const silhouettes = [];
    for (const src of frames) {
      paths.add(src);
      const file = await fs.readFile(new URL(`../public${src}`, import.meta.url));
      hashes.add(createHash('sha256').update(file).digest('hex'));
      assert.equal((await sharp(file).metadata()).hasAlpha, true, `${id}: actual alpha`);
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.height, 480);
      assert.ok(info.width <= 480, `${id}: height controls the display scale`);
      let clear = 0, visible = 0, top = 480, bottom = -1, left = info.width, right = -1;
      const feet = new Set();
      for (let pos = 0; pos < info.width * 480; pos++) {
        const alpha = data[pos * 4 + 3];
        if (alpha < 8) clear++;
        if (alpha <= 64) continue;
        visible++;
        const x = pos % info.width, y = Math.floor(pos / info.width);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        left = Math.min(left, x); right = Math.max(right, x);
        if (y >= 320) feet.add(`${x},${y}`);
      }
      assert.ok(clear > info.width * 480 * .15 && visible > 10000, `${id}: true foreground cutout`);
      assert.ok(left > 0 && right < info.width - 1 && top > 0, `${id}: complete body and weapon`);
      assert.ok(bottom >= 440 && bottom <= 447, `${id}: same grounded feet as existing idle`);
      assert.ok(bottom - top + 1 >= 375 && bottom - top + 1 <= 418, `${id}: walking keeps idle body scale`);
      silhouettes.push(feet);
    }
    assert.equal(hashes.size, 4, `${id}: four different authored poses`);
    for (const [a, b] of [[0, 1], [2, 3]]) {
      let changed = 0;
      for (const point of silhouettes[a]) if (!silhouettes[b].has(point)) changed++;
      for (const point of silhouettes[b]) if (!silhouettes[a].has(point)) changed++;
      assert.ok(changed > 150, `${id}: feet actually change during the ${a ? 'rear' : 'front'} stride`);
    }
  }
  assert.equal(paths.size, 68);
});
