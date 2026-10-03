import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { MUSIC_TRACKS, MUSIC_LOOP_STEPS, musicBeat, getMusicTheme } from '../src/data/musicScore.js';
import { samplePitch } from '../src/engine/orchestraSamples.js';
import { STORY_SCENES } from '../src/data/storyScenes.js';
import { CHAPTER_BOSS_NAMES } from '../src/data/chapterIdentity.js';

test('calm scores exclude war drums while every battle theme contains timpani and a reprise', () => {
  for (const [id, track] of Object.entries(MUSIC_TRACKS)) {
    const notes = Array.from({ length: MUSIC_LOOP_STEPS }, (_, i) => musicBeat(id, i)).flatMap(frame => frame.notes);
    assert.equal(notes.some(n => n.instrument === 'timpani'), !track.calm, id);
    if (track.calm) assert.ok(notes.every(n => !['drum', 'noise'].includes(n.instrument)));
    for (const variant of [0, 1, 2]) assert.deepEqual(musicBeat({ id, variant }, 0), musicBeat({ id, variant }, MUSIC_LOOP_STEPS));
  }
  assert.equal(getMusicTheme('menu').id, 'title');
  assert.equal(getMusicTheme('camp').id, 'camp');
  for (const screen of ['settings', 'codex', 'roster', 'library']) assert.equal(getMusicTheme(screen), null);
});

test('all 72 bundled instrument samples have matching provenance hashes and bounded size', () => {
  const root = new URL('../public/audio/orchestra-v1/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root)));
  let count = 0, size = 0;
  assert.equal(manifest.license, 'CC BY 3.0');
  for (const samples of Object.values(manifest.instruments)) for (const sample of samples) {
    const bytes = fs.readFileSync(new URL(sample.file, root));
    assert.equal(bytes.length, sample.size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sample.sha256);
    assert.equal(samplePitch(440 * 2 ** ((sample.midi - 69) / 12)), sample.midi);
    count++; size += bytes.length;
  }
  assert.equal(count, 72); assert.ok(size < 5000000);
  assert.match(fs.readFileSync(new URL('CREDITS.txt', root), 'utf8'), /Frank Wen/);
});

test('late story closes Garon responsibility and introduces the final echo; Teo remains an archer', () => {
  const text = (id, type) => STORY_SCENES[id][type].map(line => line.text).join(' ');
  assert.equal(CHAPTER_BOSS_NAMES[28], '흑천 가론');
  assert.equal(CHAPTER_BOSS_NAMES[30], '흑야의 잔영');
  assert.match(text(30, 'intro'), /저건 내가 아니다/);
  assert.match(text(30, 'intro'), /잔영/);
  assert.match(text(30, 'clear'), /가론의 증언/);
  assert.match(text(14, 'clear'), /궁수 테오/);
  assert.match(text(21, 'clear'), /이번 전쟁의 서명은 위조/);
});
