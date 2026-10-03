import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Parse only the data object, never execute the downloaded MIDI.js wrapper.
const source = 'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM';
const instruments = { piano: 'acoustic_grand_piano', harp: 'orchestral_harp', flute: 'flute', strings: 'string_ensemble_1', cello: 'cello', horn: 'french_horn', choir: 'choir_aahs', timpani: 'timpani' };
const pitches = { C2: 36, G2: 43, C3: 48, G3: 55, C4: 60, G4: 67, C5: 72, G5: 79, C6: 84 };
const target = 'public/audio/orchestra-v1';
await fs.mkdir(target, { recursive: true });
const manifest = { source, license: 'CC BY 3.0', attribution: 'FluidR3 by Frank Wen and contributors; MIDI.js samples rendered by Benjamin Gleitzman', instruments: {} };
for (const [id, name] of Object.entries(instruments)) {
  const url = `${source}/${name}-mp3.js`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  const text = await response.text();
  const prefix = `MIDI.Soundfont.${name} = `;
  const start = text.indexOf(prefix);
  if (start < 0) throw new Error('Invalid soundfont wrapper');
  const data = text.slice(start + prefix.length).trim().replace(/;\s*$/, '').replace(/,\s*}$/, '}');
  const samples = JSON.parse(data);
  manifest.instruments[id] = [];
  for (const [note, midi] of Object.entries(pitches)) {
    if (!/^data:audio\/(mp3|mpeg);base64,/.test(samples[note] || '')) throw new Error(`Invalid sample ${name}/${note}`);
    const bytes = Buffer.from(samples[note].split(',')[1], 'base64');
    const file = `${id}-${midi}.mp3`;
    await fs.writeFile(`${target}/${file}`, bytes);
    manifest.instruments[id].push({ midi, file, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  console.log(`Prepared ${id}: ${manifest.instruments[id].length} samples`);
}
await fs.writeFile(`${target}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
