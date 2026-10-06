const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { createHash } = require('node:crypto');

async function main() {
  const root = path.resolve(__dirname, '..');
  const source = 'docs/art/world-v2/sources/terrain-expansion.png';
  const ids = ['shell_reef', 'sluice_bridge', 'packed_snow', 'hot_spring', 'power_conduit', 'resonance_pad', 'star_moss', 'oath_rune', 'cracked_slab', 'low_rubble'];
  const bytes = await fs.readFile(path.join(root, source));
  const metadata = await sharp(bytes).metadata();
  const exports = [];
  for (const [index, id] of ids.entries()) {
    const left = Math.round((index % 2) * metadata.width / 2);
    const top = Math.round(Math.floor(index / 2) * metadata.height / 5);
    const right = Math.round(((index % 2) + 1) * metadata.width / 2);
    const bottom = Math.round((Math.floor(index / 2) + 1) * metadata.height / 5);
    const file = `public/art/world-v2/terrain/${id}.webp`;
    await sharp(bytes).extract({ left, top, width: right - left, height: bottom - top })
      .resize(512, 512).removeAlpha().webp({ quality: 90 }).toFile(path.join(root, file));
    exports.push({ id, file, crop: { left, top, width: right - left, height: bottom - top }, width: 512, height: 512 });
  }
  await fs.writeFile(path.join(root, 'docs/art/world-v2/terrain-expansion-exports.json'), JSON.stringify({
    source, sha256: createHash('sha256').update(bytes).digest('hex'), columns: 2, rows: 5,
    note: '생성 도구로 직접 제작한 2열 5행 지형 원화를 자른 결과. 기존 지형 원본과 파일은 보존합니다.', exports,
  }, null, 2) + '\n');
  console.log(`신규 지형 원화 ${exports.length}종을 512×512 WebP로 내보냈습니다.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
