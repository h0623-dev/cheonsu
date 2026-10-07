import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

// 내려받은 MIDI.js wrapper는 실행하지 않고 샘플 데이터만 추출합니다.
// 이후 명시적으로 다시 만들 때는 출처 문서와 같은 고정 커밋을 사용합니다.
// 기존 MP3에 없던 과거 취득 시각·커밋을 이 값으로 소급 기록하지 않습니다.
const legalSources = JSON.parse(await fs.readFile('public/legal/music/sources.json', 'utf8'));
const sourceRevision = legalSources.sampleDistribution.documentationRevision;
const source = `https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/${sourceRevision}/FluidR3_GM`;
const instruments = { piano: 'acoustic_grand_piano', harp: 'orchestral_harp', flute: 'flute', strings: 'string_ensemble_1', cello: 'cello', horn: 'french_horn', choir: 'choir_aahs', timpani: 'timpani' };
const pitches = { C2: 36, G2: 43, C3: 48, G3: 55, C4: 60, G4: 67, C5: 72, G5: 79, C6: 84 };
const target = 'public/audio/orchestra-v1';
await fs.mkdir(target, { recursive: true });
const manifest = {
  source, sourceRevision, retrievedAt: new Date().toISOString(),
  license: legalSources.sampleDistribution.license,
  licenseUrl: legalSources.sampleDistribution.licenseUrl,
  licenseText: legalSources.sampleDistribution.licenseText,
  attribution: 'FluidR3 by Frank Wen and contributors; MIDI.js samples rendered by Benjamin Gleitzman',
  credits: '/audio/orchestra-v1/CREDITS.txt', creditPage: '/legal/music/index.html',
  sourceDocumentation: '/legal/music/sources.json',
  licenseLayers: {
    originalSoundFont: {
      license: legalSources.originalSoundFont.license,
      copyright: legalSources.originalSoundFont.copyright,
      licenseText: legalSources.originalSoundFont.licenseText,
    },
    renderedMp3Samples: {
      license: legalSources.sampleDistribution.license,
      licenseUrl: legalSources.sampleDistribution.licenseUrl,
      licenseText: legalSources.sampleDistribution.licenseText,
    },
    upstreamSoftware: {
      license: legalSources.repositorySoftware.license,
      copyright: legalSources.repositorySoftware.copyright,
      licenseText: legalSources.repositorySoftware.licenseText,
      scope: '상류 저장소 소프트웨어의 허락이며 MP3 샘플의 허락 표기를 대신하지 않습니다.',
    },
  },
  licenseReview: {
    reviewedOn: legalSources.reviewedOn,
    documentationRevision: legalSources.sampleDistribution.documentationRevision,
  },
  instruments: {},
};
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
