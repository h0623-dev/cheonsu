import fs from 'node:fs/promises';

// Manufacture runtime data from the artist's raw-input landmarks and the
// original production transforms. No finished image, browser or APK is read.
const read = async path => JSON.parse(await fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const report = await read('docs/art/style-b-v1/production-report.json');
const inputFiles = ['ally-boss', 'middle', 'creatures'];
const units = {};
const point = (raw, placement) => {
  const source = placement.sourceBounds;
  const size = placement.sourceSize || [source.right - source.left + 1, source.bottom - source.top + 1];
  return [placement.left + (raw[0] - source.left) * placement.width / size[0],
    placement.top + (raw[1] - source.top) * placement.height / size[1]];
};
const span = points => Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
for (const group of inputFiles) {
  const input = await read(`docs/art/style-b-v1/body-input-184-${group}.json`);
  for (const [key, author] of Object.entries(input.units)) {
    const production = report.units[key];
    if (!production || units[key]) throw new Error(`${key}: unique production identity required`);
    const poses = {};
    for (const pose of ['recover', 'strike', 'skill-a']) {
      const placement = production.placements[pose];
      const feature = author.poses[pose].feature.map(raw => point(raw, placement));
      if (!(span(feature) > 0)) throw new Error(`${key}/${pose}: anatomical feature must have length`);
      poses[pose] = { feature, correction: 1 };
    }
    for (const pose of ['strike', 'skill-a']) poses[pose].correction = span(poses.recover.feature) / span(poses[pose].feature);
    const box = author.poses.recover.bodyBox;
    const [left, top] = point(box.slice(0, 2), production.placements.recover);
    const [right, bottom] = point(box.slice(2, 4), production.placements.recover);
    units[key] = { feature: author.featureName || author.feature, bodyBounds: { left, top, right, bottom }, poses };
  }
}
for (const group of ['a', 'b']) {
  const input = await read(`docs/art/style-b-v1/body-input-184-legacy-${group}.json`);
  for (const [key, author] of Object.entries(input.units)) {
    const unit = units[key];
    if (!unit) throw new Error(`${key}: new ready identity required`);
    const feature = author.feature.map(raw => point(raw, author.placement));
    if (!(span(feature) > 0)) throw new Error(`${key}/skill-b: anatomical feature must have length`);
    unit.poses['skill-b'] = { feature, correction: span(unit.poses.recover.feature) / span(feature) };
  }
}
const output = { schema: 1, method: '원본 PNG의 해부학 축 수동 근사 저작과 기존 제작 배치 변환. 완성 원화 재열람·QA 아님.', units };
await fs.writeFile(new URL('../src/data/combatBodyProportions.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(`전투 신체 비율 데이터 제작: ${Object.keys(units).length}종, 완성 이미지 재열람 없음`);
