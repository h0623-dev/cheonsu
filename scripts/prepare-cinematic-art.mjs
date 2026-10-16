import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import silhouetteTools from './prepare-painted-sprites.cjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const poses = ['run-a', 'run-b', 'windup', 'strike', 'recover', 'recoil', 'skill-a', 'skill-b'];
const characters = ['hero', 'lina', 'aria', 'oath_guardian'];
const canvasSize = 512;
const foot = 480;
const alphaThreshold = 64;
const contactPoses = ['windup', 'strike', 'skill-a', 'skill-b'];
const serialize = value => `${JSON.stringify(value, null, 2)}\n`;

// Bounds are part of placing the authored artwork and generating its runtime
// metrics. The finished WebP files are not reopened for a separate asset check.
function alphaBounds(pixels, width, height, threshold = alphaThreshold) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let index = 0; index < width * height; index++) {
    if (pixels[index * 4 + 3] <= threshold) continue;
    const x = index % width, y = Math.floor(index / width);
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error('제작할 불투명 캐릭터 영역이 없습니다.');
  return { left, top, right, bottom };
}

async function extractSheet(sourcePath, framePoses = poses, rows = 2, columns = 4) {
  const input = await fs.readFile(sourcePath);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const core = Buffer.from(data);
  for (let offset = 3; offset < core.length; offset += 4) if (core[offset] < 24) core[offset] = 0;
  const { labels, regions } = silhouetteTools.splitSilhouettes(core, info.width, info.height, framePoses.length, rows, columns);
  const frames = framePoses.map((pose, slot) => {
    const parts = regions.filter(region => region.slot === slot && region.area >= 4);
    if (!parts.some(region => region.area > 1000)) throw new Error(`${pose}: 독립된 캐릭터 원화가 필요합니다.`);
    const box = {
      left: Math.max(0, Math.min(...parts.map(part => part.left)) - 2),
      top: Math.max(0, Math.min(...parts.map(part => part.top)) - 2),
      right: Math.min(info.width - 1, Math.max(...parts.map(part => part.right)) + 2),
      bottom: Math.min(info.height - 1, Math.max(...parts.map(part => part.bottom)) + 2),
    };
    const width = box.right - box.left + 1, height = box.bottom - box.top + 1;
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const source = (box.top + y) * info.width + box.left + x;
      const region = regions[labels[source]];
      let belongs = region?.slot === slot && region.area >= 4;
      // Keep the original antialiased alpha near an owned core. Faint RGB/alpha
      // left in the atlas gutters must not join two independently authored poses.
      if (!region && data[source * 4 + 3] > 0) {
        let closest = null;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = box.left + x + dx, ny = box.top + y + dy;
          if (nx < 0 || nx >= info.width || ny < 0 || ny >= info.height) continue;
          const neighbor = regions[labels[ny * info.width + nx]];
          const distance = dx * dx + dy * dy;
          if (neighbor?.area >= 4 && (!closest || distance < closest.distance)) closest = { slot: neighbor.slot, distance };
        }
        belongs = closest?.slot === slot;
      }
      if (belongs)
        data.copy(pixels, (y * width + x) * 4, source * 4, source * 4 + 4);
    }
    return { pose, pixels, width, height, box };
  });
  return { frames, width: info.width, height: info.height };
}

function normalizedAnchor(authored, frame, placement) {
  const point = source => source.map((value, axis) => Math.round(
    (value - (axis ? frame.box.top : frame.box.left))
      * (axis ? placement.height / frame.height : placement.width / frame.width)
      + (axis ? placement.top : placement.left),
  ));
  const result = { kind: authored.kind, grip: point(authored.grip), tip: point(authored.tip), measured: true };
  if (authored.focus) result.focus = point(authored.focus);
  if (authored.secondary) result.secondary = { grip: point(authored.secondary.grip), tip: point(authored.secondary.tip) };
  if (authored.bookCenter) result.bookCenter = point(authored.bookCenter);
  if (authored.bow) {
    const upper = point(authored.bow.upper), lower = point(authored.bow.lower);
    const curve = (authored.bow.curve || []).map(point);
    const outline = (authored.bow.points || []).map(point);
    result.bow = {
      upper, lower,
      path: outline.length > 1
        ? `M${outline[0].join(' ')}${outline.slice(1).map(position => `L${position.join(' ')}`).join('')}`
        : curve.length === 2
        ? `M${upper.join(' ')}C${curve[0].join(' ')} ${curve[1].join(' ')} ${lower.join(' ')}`
        : `M${upper.join(' ')}Q${result.grip.join(' ')} ${lower.join(' ')}`,
      ...(authored.bow.arrowVisible == null ? {} : { arrowVisible: authored.bow.arrowVisible }),
    };
  }
  return result;
}

async function prepareCharacter(id, entry, manifest, catalogs) {
  const sourcePath = path.resolve(root, entry.sourcePath);
  const sheet = await extractSheet(sourcePath);
  const overrides = {};
  for (const [pose, override] of Object.entries(entry.overrides || {})) {
    const replacement = await extractSheet(path.resolve(root, override.sourcePath), [pose], 1, 1);
    sheet.frames[poses.indexOf(pose)] = replacement.frames[0];
    overrides[pose] = { sourcePath: override.sourcePath, sourceSize: [replacement.width, replacement.height] };
  }
  const reference = sheet.frames[poses.indexOf('recover')];
  // One isotropic scale per authored character keeps its body consistent while
  // the weapon and cape change pose. Optional body heights account for a raised
  // weapon; no limb, perspective or pose is synthesized here.
  const normalizations = sheet.frames.map(frame => entry.bodyHeights?.[frame.pose]
    ? (entry.bodyHeights.recover || reference.height) / entry.bodyHeights[frame.pose] : 1);
  const baseScale = Math.min(408 / reference.height, ...sheet.frames.map((frame, index) =>
    Math.min(468 / (frame.height * normalizations[index]), 484 / (frame.width * normalizations[index]))));
  const unit = manifest.units[id];
  if (!unit) throw new Error(`${id}: 기존 캐릭터 항목이 없습니다.`);
  const metrics = {}, anchors = {}, placements = {};
  const collection = entry.collection || 'characters-v2';
  const directory = path.join(root, 'public/art', collection, 'units');
  await fs.mkdir(directory, { recursive: true });
  for (const [index, frame] of sheet.frames.entries()) {
    const scale = baseScale * normalizations[index];
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    const left = Math.floor((canvasSize - width) / 2), top = foot - height;
    const { data: resized, info } = await sharp(frame.pixels, {
      raw: { width: frame.width, height: frame.height, channels: 4 },
    }).resize(width, height).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const box = alphaBounds(resized, info.width, info.height);
    const placement = { left, top, width, height, scale: width / frame.width };
    const authored = entry.anchors?.[frame.pose];
    if (!authored) throw new Error(`${id}/${frame.pose}: 원화에서 지정한 무기 앵커가 필요합니다.`);
    const input = await sharp(resized, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const output = await sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background: '#00000000' } })
      .composite([{ input, left, top }]).webp({ quality: 94, alphaQuality: 100 })
      .toBuffer();
    // Record the bytes being manufactured before writing them. This is the
    // source binding for the production catalog, not a later artifact reread.
    const frameSha256 = createHash('sha256').update(output).digest('hex');
    await fs.writeFile(path.join(directory, `${id}-${frame.pose}.webp`), output);
    metrics[frame.pose] = { height: canvasSize, top: top + box.top, bottom: top + box.bottom };
    anchors[frame.pose] = normalizedAnchor(authored, frame, placement);
    placements[frame.pose] = { sourceBounds: frame.box, ...placement,
      pixelBounds: { left: left + box.left, right: left + box.right, top: top + box.top, bottom: top + box.bottom },
      frameSha256, metrics: metrics[frame.pose] };
  }
  unit.metrics = metrics;
  if (id === 'oath_guardian') {
    // Expansion art uses a reviewed catalog rather than claiming the final
    // output was precisely measured. Leave those four poses to the existing
    // reviewed-frame lookup; the other poses keep their own frame profiles.
    unit.anchors = Object.fromEntries(Object.entries(anchors)
      .filter(([pose]) => !contactPoses.includes(pose))
      .map(([pose, anchor]) => [pose, { ...anchor, measured: false }]));
    catalogs.reviewed.units[id] ||= {};
    for (const pose of contactPoses) {
      const { measured, ...geometry } = anchors[pose];
      void measured;
      catalogs.reviewed.units[id][pose] = {
        ...geometry,
        reviewMethod: '2026-10-16: 생성 원본 시트 또는 단일 교정 원화의 손잡이·검끝을 눈으로 읽은 근삿값을 제작기의 크기·발 정렬 affine 변환으로 512px에 옮김. 최종 출력의 정밀 실측·후속 검증으로 표시하지 않음.',
        framePath: `public/art/${collection}/units/${id}-${pose}.webp`,
        frameSha256: placements[pose].frameSha256,
      };
      anchors[pose] = { ...catalogs.reviewed.units[id][pose], measured: false, reviewed: true };
    }
    for (const pose of poses.filter(pose => !contactPoses.includes(pose))) anchors[pose].measured = false;
  } else {
    unit.anchors = anchors;
    catalogs.authored[id] ||= {};
    for (const pose of contactPoses) {
      const { measured, ...geometry } = anchors[pose];
      void measured;
      catalogs.authored[id][pose] = geometry;
    }
  }
  const referenceHeight = metrics.recover.bottom - metrics.recover.top + 1;
  // Runtime uses recover to enlarge all poses together. Reserve 12px inside the
  // final actor box for every authored sword, bow, robe and raised focus.
  const maxHalfWidth = Math.max(...Object.values(placements).flatMap(({ pixelBounds: box }) =>
    [canvasSize / 2 - box.left, box.right - canvasSize / 2]));
  const maxRise = foot - Math.min(...Object.values(metrics).map(box => box.top));
  const safeDisplayScale = Math.min((canvasSize / 2 - 12) / maxHalfWidth, (foot - 12) / maxRise);
  unit.visibleFraction = Math.min(.703125, referenceHeight / canvasSize * safeDisplayScale);
  const displayScale = unit.visibleFraction * canvasSize / referenceHeight;
  unit.skills = Object.fromEntries(Object.entries(entry.skills).map(([skillId, pose]) => [skillId, {
    src: unit.motion[pose], scale: displayScale,
    footOffset: `${100 * displayScale * (.9375 - (metrics[pose].bottom + 1) / canvasSize)}%`,
  }]));
  return { sourcePath: entry.sourcePath, sourceSize: [sheet.width, sheet.height], overrides, collection,
    baseScale, foot, canvasSize, displayScale, visibleFraction: unit.visibleFraction,
    anchorCatalog: id === 'oath_guardian'
      ? { contactPoses, path: 'src/data/reviewedSkillWeaponAnchors.json', classification: 'reviewed-frame',
          directFrameProfiles: poses.filter(pose => !contactPoses.includes(pose)), hashSource: 'newly-encoded-webp-buffer-before-write' }
      : { contactPoses, path: 'src/data/skillWeaponAnchors.json', classification: 'authored-frame',
          directFrameProfiles: [...poses] },
    placements, anchors, skills: unit.skills };
}

const configPath = path.resolve(root, process.argv.find(argument => argument.startsWith('--config='))?.slice(9)
  || 'docs/art/cinematic-v1/packaging.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const requested = process.argv.find(argument => argument.startsWith('--only='))?.slice(7).split(',') || characters;
const anchorsOnly = process.argv.includes('--anchors-only');
for (const id of requested) if (!characters.includes(id) || !config.units[id]) throw new Error(`제작 대상이 아닙니다: ${id}`);
const manifests = new Map();
for (const id of requested) {
  const collection = config.units[id].collection || 'characters-v2';
  if (!manifests.has(collection)) {
    const manifestPath = path.join(root, 'public/art', collection, 'manifest.json');
    manifests.set(collection, { manifestPath, data: JSON.parse(await fs.readFile(manifestPath, 'utf8')) });
  }
}
const reportPath = path.join(root, 'docs/art/cinematic-v1/packaging-report.json');
const authoredPath = path.join(root, 'src/data/skillWeaponAnchors.json');
const reviewedPath = path.join(root, 'src/data/reviewedSkillWeaponAnchors.json');
const catalogs = {
  authored: JSON.parse(await fs.readFile(authoredPath, 'utf8')),
  reviewed: JSON.parse(await fs.readFile(reviewedPath, 'utf8')),
};
let report = { version: 1, units: {} };
try { report = JSON.parse(await fs.readFile(reportPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const id of requested) {
  const collection = config.units[id].collection || 'characters-v2';
  if (anchorsOnly) {
    const unit = manifests.get(collection).data.units[id];
    const production = report.units[id];
    for (const pose of contactPoses) {
      const placement = production.placements[pose];
      const box = placement.sourceBounds;
      const frame = { box, width: box.right - box.left + 1, height: box.bottom - box.top + 1 };
      const anchor = normalizedAnchor(config.units[id].anchors[pose], frame, placement);
      const { measured, ...geometry } = anchor;
      void measured;
      if (id === 'oath_guardian') {
        Object.assign(catalogs.reviewed.units[id][pose], geometry);
        production.anchors[pose] = { ...catalogs.reviewed.units[id][pose], measured: false, reviewed: true };
      } else {
        unit.anchors[pose] = anchor;
        catalogs.authored[id][pose] = geometry;
        production.anchors[pose] = anchor;
      }
    }
    if (id === 'lina') production.bowContourConstruction = {
      sourcePath: config.units[id].sourcePath,
      poses: contactPoses,
      method: '원본 시트의 수동 활 윤곽 가이드 주변 금빛 alpha>64 픽셀을 짧은 선분으로 연결하고 기존 제작 배치로 512px에 변환. 원화 파일 재제작·출력 대조·검사 샘플 측정 없음.',
      originalArtworkPreserved: true,
    };
    console.log(`전투 무기 좌표 제작: ${id} · 원화 파일 보존`);
  } else {
    report.units[id] = await prepareCharacter(id, config.units[id], manifests.get(collection).data, catalogs);
    console.log(`전투 원화 제작: ${id} · 8개 자세 · 기존 경로 유지`);
  }
}
for (const { manifestPath, data } of manifests.values()) await fs.writeFile(manifestPath, serialize(data));
await fs.writeFile(authoredPath, serialize(catalogs.authored));
await fs.writeFile(reviewedPath, serialize(catalogs.reviewed));
await fs.writeFile(reportPath, serialize(report));
