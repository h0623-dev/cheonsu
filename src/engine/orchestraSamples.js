const instruments = ['piano', 'harp', 'flute', 'strings', 'cello', 'horn', 'choir', 'timpani'];
const pitches = [36, 43, 48, 55, 60, 67, 72, 79, 84];
const caches = new WeakMap();
export function samplePitch(freq) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  return pitches.reduce((a, b) => Math.abs(b - midi) < Math.abs(a - midi) ? b : a);
}
function cacheFor(ctx) {
  if (!caches.has(ctx)) caches.set(ctx, new Map());
  return caches.get(ctx);
}
export async function prepareOrchestra(ctx, notes) {
  const cache = cacheFor(ctx);
  const keys = [...new Set(notes.filter(n => instruments.includes(n.instrument)).map(n => `${n.instrument}-${samplePitch(n.freq)}`))];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, keys.length) }, async () => {
    while (next < keys.length) {
      const key = keys[next++];
      if (!cache.has(key)) {
        const pending = fetch(`/audio/orchestra-v1/${key}.mp3`).then(r => {
          if (!r.ok) throw new Error(`Missing orchestra sample: ${key}`);
          return r.arrayBuffer();
        }).then(bytes => ctx.decodeAudioData(bytes)).then(buffer => {
          let peak = .01;
          for (const value of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(value));
          const sample = { buffer, peak };
          cache.set(key, sample);
          return sample;
        }).catch(() => { cache.delete(key); return null; });
        cache.set(key, pending);
      }
      await cache.get(key);
    }
  }));
}
export function playOrchestraNote(ctx, note, destination) {
  const pitch = samplePitch(note.freq), sample = cacheFor(ctx).get(`${note.instrument}-${pitch}`);
  if (!sample?.buffer) return null;
  const at = ctx.currentTime + Math.max(0, note.start || 0), length = Math.max(.06, note.duration);
  const source = ctx.createBufferSource(), envelope = ctx.createGain();
  const nodes = [envelope];
  source.buffer = sample.buffer;
  source.playbackRate.value = note.freq / (440 * 2 ** ((pitch - 69) / 12));
  const pluck = ['piano', 'harp', 'timpani'].includes(note.instrument);
  const attack = Math.min(length * .2, pluck ? .004 : .045);
  const gain = Math.min(.5, note.gain * 2.2 / sample.peak);
  envelope.gain.setValueAtTime(.0001, at);
  envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, gain), at + attack);
  envelope.gain.setValueAtTime(Math.max(.0001, gain * (pluck ? .7 : .88)), at + Math.max(attack, length - .12));
  envelope.gain.exponentialRampToValueAtTime(.0001, at + length);
  source.connect(envelope);
  if (ctx.createStereoPanner && note.pan) {
    const pan = ctx.createStereoPanner(); pan.pan.value = note.pan;
    envelope.connect(pan); pan.connect(destination); nodes.push(pan);
  } else envelope.connect(destination);
  source.onended = () => { source.disconnect(); nodes.forEach(node => node.disconnect()); };
  source.start(at); source.stop(at + length + .03);
  return source;
}
