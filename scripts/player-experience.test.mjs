import test from 'node:test';
import assert from 'node:assert/strict';
import { readMenuCheckpoint, canReplayStory, getNextChapter, getStoryReadDelay } from '../src/engine/playerExperience.js';
import { CHARACTER_PROFILES } from '../src/data/characterProfiles.js';
import { CHARACTER_SKILLS } from '../src/data/skills.js';
import { getChapterBrief } from '../src/data/chapterBriefs.js';
import { STORY_SCENES } from '../src/data/storyScenes.js';
import { storySpeakerKeys } from '../src/data/storyArt.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { getInitialParty } from '../src/engine/partyEngine.js';

test('menu handles missing, corrupt, invalid and older checkpoints without writing', () => {
  const read = value => readMenuCheckpoint({ getItem: () => value, setItem: () => { throw new Error('must not write'); } });
  assert.deepEqual(read(null), { exists: false, data: null });
  for (const raw of ['{bad', 'null', '[]', '{}', '{"party":[null],"clearedStages":[]}']) assert.deepEqual(read(raw), { exists: true, data: null });
  const old = { version: '1.99.135', party: getInitialParty(), clearedStages: [1, 2], gold: 812 };
  assert.deepEqual(read(JSON.stringify(old)).data, old);
  assert.equal(normalizeSaveData(old, '1.99.143').gold, 812);
  assert.deepEqual(readMenuCheckpoint({ getItem: () => { throw new Error('denied'); } }), { exists: true, data: null });
});
test('story replays gate spoilers without changing campaign progress', () => {
  const cleared = Object.freeze([1, 2]);
  assert.ok(canReplayStory(3, 'intro', cleared));
  assert.equal(canReplayStory(3, 'clear', cleared), false);
  assert.ok(canReplayStory(2, 'clear', cleared));
  assert.equal(canReplayStory(4, 'intro', cleared), false);
  for (const id of [-1, 0, 31, '1', 1.5]) assert.equal(canReplayStory(id, 'intro', cleared), false);
  assert.equal(canReplayStory(1, 'unknown', cleared), false);
  assert.deepEqual(cleared, [1, 2]);
  assert.equal(getNextChapter([]), 1);
  assert.equal(getNextChapter(cleared), 3);
  assert.equal(getNextChapter(Array.from({ length: 30 }, (_, i) => i + 1)), null);
});
test('all current characters, speakers and 30 chapters have authored context', () => {
  for (const id of Object.keys(CHARACTER_SKILLS)) assert.ok(CHARACTER_PROFILES[id]?.bio && CHARACTER_PROFILES[id]?.role, id);
  for (const story of Object.values(STORY_SCENES)) for (const line of [...story.intro, ...story.clear]) assert.ok(CHARACTER_PROFILES[storySpeakerKeys[line.speaker]], line.speaker);
  const briefs = Array.from({ length: 30 }, (_, index) => getChapterBrief(index + 1));
  assert.ok(briefs.every(brief => brief.title && brief.text.length > 25));
  assert.equal(new Set(briefs.map(brief => brief.text)).size, 30);
  assert.equal(getChapterBrief(31), null);
  assert.match(CHARACTER_PROFILES.lina.role, /궁수/);
});
test('automatic dialogue leaves reading time and has an upper bound', () => {
  assert.equal(getStoryReadDelay('짧은 대사'), 4000);
  assert.equal(getStoryReadDelay('가'.repeat(1000)), 9000);
  assert.ok(getStoryReadDelay('가'.repeat(60)) > getStoryReadDelay('가'.repeat(20)));
});
