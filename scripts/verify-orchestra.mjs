import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const dir = 'tmp/orchestra-qa';
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5178');
  const ids = await page.evaluate(async () => Object.keys((await import('/src/data/musicScore.js')).MUSIC_TRACKS));
  const results = [];
  for (const id of ids) {
    const result = await page.evaluate(async id => {
      const { MUSIC_TRACKS, MUSIC_LOOP_STEPS, musicBeat } = await import('/src/data/musicScore.js');
      const { playTone } = await import('/src/engine/audioEngine.js');
      const { prepareOrchestra, playOrchestraNote } = await import('/src/engine/orchestraSamples.js');
      const step = 30 / MUSIC_TRACKS[id].bpm, length = step * MUSIC_LOOP_STEPS, rate = 22050;
      const ctx = new OfflineAudioContext(2, Math.ceil((length + 2) * rate), rate);
      const frames = Array.from({ length: MUSIC_LOOP_STEPS }, (_, i) => musicBeat(id, i));
      await prepareOrchestra(ctx, frames.flatMap(frame => frame.notes));
      let sampled = 0, synthesized = 0;
      for (const [i, frame] of frames.entries()) for (const note of frame.notes) {
        const scheduled = { ...note, start: i * step + (note.start || 0) };
        if (playOrchestraNote(ctx, scheduled, ctx.destination)) sampled++;
        else { playTone(ctx, scheduled); synthesized++; }
      }
      const buffer = await ctx.startRendering(), left = buffer.getChannelData(0), right = buffer.getChannelData(1);
      const sections = Array.from({ length: 4 }, (_, s) => {
        const start = Math.floor(s * length * rate / 4), end = Math.floor((s + 1) * length * rate / 4);
        let peak = 0, sum = 0;
        for (let i = start; i < end; i++) { peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i])); sum += (left[i] ** 2 + right[i] ** 2) / 2; }
        return { peak, rms: Math.sqrt(sum / (end - start)) };
      });
      let wav;
      if (['title', 'camp', 'frontier'].includes(id)) {
        const n = Math.min(left.length, rate * 32), bytes = new Uint8Array(44 + n * 4), v = new DataView(bytes.buffer);
        const text = (at, s) => [...s].forEach((c, i) => bytes[at + i] = c.charCodeAt(0));
        text(0, 'RIFF'); v.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
        v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
        text(36, 'data'); v.setUint32(40, n * 4, true);
        for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) v.setInt16(44 + i * 4 + c * 2, Math.round(Math.max(-1, Math.min(1, (c ? right : left)[i])) * 32767), true);
        let binary = ''; for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
        wav = btoa(binary);
      }
      return { id, length, sampled, synthesized, sections, wav };
    }, id);
    assert.ok(result.sampled > 100, id);
    assert.ok(result.sections.every(s => Number.isFinite(s.peak) && s.peak < .95 && s.rms > .005), JSON.stringify({ ...result, wav: undefined }));
    if (result.wav) await fs.writeFile(`${dir}/${id}.wav`, Buffer.from(result.wav, 'base64'));
    delete result.wav;
    results.push(result); console.log(`PASS ${id}: ${result.sampled} sampled voices, ${result.length.toFixed(1)}s, four audible sections, no clipping`);
  }
  await fs.writeFile(`${dir}/render.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); }
