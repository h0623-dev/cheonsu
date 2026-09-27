import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { STORY_SCENES } from '../src/data/storyScenes.js';
import { getStoryPortrait, storySpeakerKeys } from '../src/data/storyArt.js';
import { enemyIllustrationKeys, getEnemyIllustration } from '../src/data/enemyIllustrations.js';
import { getPaintedVisualProfile } from '../src/data/unitVisuals.js';
import { getBossSplash } from '../src/data/bossArt.js';

test('every story speaker is explicitly mapped to an existing illustration', async () => {
  const speakers = new Set(Object.values(STORY_SCENES).flatMap(scene => [...scene.intro, ...scene.clear].map(line => line.speaker)));
  for (const speaker of speakers) {
    assert.ok(Object.hasOwn(storySpeakerKeys, speaker), speaker);
    await fs.access(`public${getStoryPortrait(speaker)}`);
  }
  assert.equal(getStoryPortrait('가론'), getStoryPortrait('흑천 가론'));
  assert.match(getStoryPortrait('흑천 가론'), /enemy-illustrations-v1\/boss_abyss.webp$/);
  assert.equal(getStoryPortrait('카일'), '/art/world-v2/units/hero.webp');
  assert.equal(getStoryPortrait('아이린'), getStoryPortrait('이레네'));
});

test('story, boss entrances and information portraits share one identity without replacing combat frames', () => {
  for (const key of enemyIllustrationKeys) {
    const art = getEnemyIllustration(key), profile = getPaintedVisualProfile(key);
    assert.equal(getBossSplash({ type: 'boss', spriteKey: key }).src, art.cutscene);
    assert.equal(profile.cutscene, art.cutscene);
    assert.equal(profile.portrait, art.portrait);
    assert.equal(profile.battle, `/art/bosses-v1/${key}-ready.webp`);
    assert.equal(profile.map, `/art/map-sprites-v4/${key}.webp`);
  }
  assert.equal(getEnemyIllustration('unknown'), null);
});

for (const key of enemyIllustrationKeys) test(`${key}: real transparent cutout and lightweight portrait`, async () => {
  const art = getEnemyIllustration(key);
  const { data, info } = await sharp(`public${art.cutscene}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, solid = 0;
  for (let i = 3; i < data.length; i += info.channels) {
    if (data[i] < 8) transparent++;
    if (data[i] > 240) solid++;
  }
  assert.ok(transparent > info.width * info.height * .15, 'transparent area must be genuine alpha');
  assert.ok(solid > info.width * info.height * .25, 'character must not be ghosted');
  const thumb = await fs.readFile(`public${art.portrait}`);
  const meta = await sharp(thumb).metadata();
  assert.equal(meta.width, 320); assert.equal(meta.height, 320);
  assert.ok(thumb.length < 90000);
});
