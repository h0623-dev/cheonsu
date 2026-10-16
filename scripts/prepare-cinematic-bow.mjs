import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = path.join(root, 'docs/art/cinematic-v1/packaging.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const entry = config.units.lina;
const { data, info } = await sharp(path.join(root, entry.sourcePath)).ensureAlpha().raw()
  .toBuffer({ resolveWithObject: true });

// Hand-authored guides follow the gold bow limbs, not the taut string or cape.
// Dense landmarks preserve each recurved limb instead of approximating a long
// asymmetric bow with one cubic through transparent air.
const guides = {
  windup: [[1065,26],[1068,38],[1076,49],[1088,61],[1100,76],[1112,94],[1120,112],[1122,130],[1129,146],[1128,173],[1133,192],[1133,212],[1127,232],[1119,249],[1108,267],[1095,283],[1086,300],[1079,315],[1077,329]],
  strike: [[1363,14],[1364,25],[1371,33],[1385,39],[1401,45],[1419,52],[1436,60],[1450,70],[1463,83],[1473,98],[1485,110],[1493,128],[1501,144],[1507,161],[1512,179],[1514,197],[1513,215],[1508,232],[1502,248],[1497,264],[1493,282]],
  'skill-a': [[1041,513],[1047,527],[1061,539],[1077,551],[1091,566],[1104,582],[1114,600],[1120,619],[1123,637],[1122,654],[1121,671],[1124,691],[1125,709],[1122,726],[1116,744],[1107,762],[1098,781],[1084,798],[1077,812],[1073,826]],
  'skill-b': [[1429,616],[1434,629],[1446,642],[1460,656],[1474,673],[1487,691],[1497,710],[1501,729],[1500,747],[1500,766],[1506,785],[1509,804],[1507,824],[1503,843],[1495,862],[1485,880],[1478,899],[1478,917],[1480,931]],
};

function bowPixel([x, y]) {
  let selected = null;
  for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
    const px = Math.round(x + dx), py = Math.round(y + dy);
    if (px < 0 || px >= info.width || py < 0 || py >= info.height) continue;
    const offset = (py * info.width + px) * 4;
    const [r, g, b, alpha] = data.subarray(offset, offset + 4);
    if (alpha <= 64 || r < 45 || g < 30 || r <= g * 1.03 || g <= b * 1.12) continue;
    const distance = (px - x) ** 2 + (py - y) ** 2;
    if (!selected || distance < selected.distance) selected = { point: [px, py], distance };
  }
  if (!selected) throw new Error(`활 윤곽 제작 가이드를 원본에서 다시 지정해야 합니다: ${x},${y}`);
  return selected.point;
}

for (const [pose, guide] of Object.entries(guides)) {
  const points = [];
  for (let index = 0; index < guide.length - 1; index++) {
    const from = guide[index], to = guide[index + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 4));
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      const point = bowPixel([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
      if (points.at(-1)?.join(',') !== point.join(',')) points.push(point);
    }
  }
  points.push(bowPixel(guide.at(-1)));
  const bow = entry.anchors[pose].bow;
  delete bow.curve;
  Object.assign(bow, { upper: points[0], lower: points.at(-1), points,
    guide, construction: '원본 시트의 수동 활 윤곽 가이드와 주변 금빛 불투명 픽셀로 제작한 짧은 선분 경로. 출력 원화·검사 샘플 재대조 없음.' });
}

await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log('리나의 네 자세 활 윤곽 좌표 제작 완료 · 원본 그림 보존');
