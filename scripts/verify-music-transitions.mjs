import { qaBrowserOptions } from './qa-browser.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch(qaBrowserOptions());
try {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5178');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const state = await page.evaluate(async () => {
    const { createMusicPlayer } = await import('/src/engine/audioEngine.js');
    const context = new AudioContext(); await context.resume();
    const player = createMusicPlayer(context);
    await player.start({ id: 'title' }, .3);
    await new Promise(r => setTimeout(r, 950));
    const before = player.getState();
    await player.start({ id: 'title' }, .6);
    const after = player.getState();
    const pending = player.start({ id: 'boss' }, .4);
    player.stop(); await pending;
    const cancelled = player.getState();
    for (let i = 0; i < 5; i++) { await player.start({ id: 'title' }, .3); await player.start({ id: 'title' }, 0); }
    const silent = player.getState();
    await context.close();
    return { before, after, cancelled, silent };
  });
  assert.ok(state.before.beat > 1);
  assert.equal(state.after.beat, state.before.beat, 'same theme/volume update must not restart the score');
  assert.equal(state.cancelled.playing, false); assert.equal(state.cancelled.voices, 0);
  assert.equal(state.silent.playing, false); assert.equal(state.silent.voices, 0);
  console.log('PASS persistent music, volume without restart, cancelled sample loading, repeated mute without residual voices', JSON.stringify(state));
} finally { await browser.close(); }
