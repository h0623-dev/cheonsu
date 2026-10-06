import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { stages } from '../src/data/stages.js';
import { getWorldScene, getWorldSceneThumbnail } from '../src/data/worldArt.js';

const prompts = JSON.parse(await readFile(new URL('../docs/art/chapters-v1/prompts.json', import.meta.url), 'utf8'));
const fullHashes = new Set(), thumbHashes = new Set();
let totalBytes = 0;
for (const stage of stages) {
  test(`Chapter ${stage.id}: unique full scene and lightweight preview are ready`, async () => {
    const stem = `chapter-${String(stage.id).padStart(2, '0')}`;
    assert.equal(getWorldScene(stage.id), `/art/chapters-v1/${stem}.webp`);
    assert.equal(getWorldSceneThumbnail(stage.id), `/art/chapters-v1/${stem}-thumb.webp`);
    await access(new URL(`../docs/art/chapters-v1/${stem}.png`, import.meta.url));
    for (const [path, width, height, limit, hashes] of [
      [getWorldScene(stage.id), 1536, 1024, 650000, fullHashes],
      [getWorldSceneThumbnail(stage.id), 480, 320, 80000, thumbHashes],
    ]) {
      const bytes = await readFile(new URL(`../public${path}`, import.meta.url));
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, 'webp');
      assert.equal(metadata.width, width);
      assert.equal(metadata.height, height);
      assert.ok(bytes.length < limit, `${path}: size budget`);
      const hash = createHash('sha256').update(bytes).digest('hex');
      assert.ok(!hashes.has(hash), `${path}: must not reuse another chapter image`);
      hashes.add(hash); totalBytes += bytes.length;
    }
  });
}
test('All 50 chapters have separate prompts, art and previews within the total budget', () => {
  assert.equal(stages.length, 50);
  assert.equal(prompts.chapters.length, 50);
  assert.deepEqual(prompts.chapters.map(chapter => chapter.id), stages.map(stage => stage.id));
  assert.equal(new Set(prompts.chapters.map(chapter => chapter.prompt)).size, 50);
  assert.equal(fullHashes.size, 50);
  assert.equal(thumbHashes.size, 50);
  // 50장의 실제 합계는 약 20.44 MiB이며 개별 이미지 제한은 그대로 유지합니다.
  assert.ok(totalBytes < 24 * 1024 * 1024);
});
test('Legacy and invalid stage references select a valid chapter without altering saves', () => {
  for (const id of [undefined, null, '', 'invalid', -8, 0]) assert.equal(getWorldScene(id), getWorldScene(1));
  assert.equal(getWorldScene('21'), getWorldScene(21));
  assert.equal(getWorldScene(100), getWorldScene(50));
});
