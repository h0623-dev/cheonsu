import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import silhouetteTools from './prepare-painted-sprites.cjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const poses = ['recover', 'strike', 'skill-a'];
const allPoses = ['run-a', 'run-b', 'windup', 'strike', 'recover', 'recoil', 'skill-a', 'skill-b'];
const contactPoses = new Set(['windup', 'strike', 'skill-a', 'skill-b']);
const weaponKinds = new Set(['blade', 'spear', 'axe', 'hammer', 'shield', 'dagger', 'claw', 'whip', 'fist', 'bow', 'crossbow', 'cannon', 'focus', 'staff', 'book', 'music']);
const canvas = 512, foot = 480;
const canonicalize = id => id === 'silvan' ? 'sylvan' : id;
const assetIdFor = id => id === 'sylvan' ? 'silvan' : id;
const serialize = value => `${JSON.stringify(value, null, 2)}\n`;
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const loadJson = async relative => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));

// This is the manufacturing step. All layout metrics and source bindings are
// produced from the in-memory pixels being encoded, before their first write.
// Finished WebP files are never reopened for a separate check.
function alphaBounds(pixels, width, height, threshold = 64) {
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

function sourceBox(sheet, cell, info) {
  let authoredBox = cell.box;
  if (!authoredBox && cell.sourceRect) {
    const rect = cell.sourceRect;
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)
      || rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0
      || rect[0] + rect[2] > 1.000001 || rect[1] + rect[3] > 1.000001)
      throw new Error(`${sheet.key}/${cell.id}/${cell.pose}: 원본 전체 0~1 좌표의 sourceRect가 필요합니다.`);
    const left = Math.floor(rect[0] * info.width), top = Math.floor(rect[1] * info.height);
    authoredBox = { left, top,
      width: Math.min(info.width, Math.ceil((rect[0] + rect[2]) * info.width)) - left,
      height: Math.min(info.height, Math.ceil((rect[1] + rect[3]) * info.height)) - top };
  }
  const box = authoredBox || {
    left: Math.floor(cell.column * info.width / sheet.columns),
    top: Math.floor(cell.row * info.height / sheet.rows),
    width: Math.floor((cell.column + 1) * info.width / sheet.columns) - Math.floor(cell.column * info.width / sheet.columns),
    height: Math.floor((cell.row + 1) * info.height / sheet.rows) - Math.floor(cell.row * info.height / sheet.rows),
  };
  if (!['left', 'top', 'width', 'height'].every(key => Number.isInteger(box[key])) || box.left < 0 || box.top < 0 || box.width <= 0 || box.height <= 0
    || box.left + box.width > info.width || box.top + box.height > info.height)
    throw new Error(`${sheet.key}/${cell.id}/${cell.pose}: 원본 안의 정수 셀 영역이 필요합니다.`);
  return box;
}

function extractFrame(sheet, cell, source) {
  const box = sourceBox(sheet, cell, source.info);
  const pixels = Buffer.alloc(box.width * box.height * 4);
  let ownership;
  if (cell.isolateSilhouette) {
    source.partitions ||= new Map();
    const key = `${sheet.rows}/${sheet.columns}`;
    if (!source.partitions.has(key)) {
      const core = Buffer.from(source.data);
      for (let offset = 3; offset < core.length; offset += 4) if (core[offset] < 24) core[offset] = 0;
      source.partitions.set(key, silhouetteTools.splitSilhouettes(core, source.info.width, source.info.height,
        sheet.rows * sheet.columns, sheet.rows, sheet.columns));
    }
    ownership = source.partitions.get(key);
  }
  let clear = false;
  for (let y = 0; y < box.height; y++) {
    const offset = ((box.top + y) * source.info.width + box.left) * 4;
    source.data.copy(pixels, y * box.width * 4, offset, offset + box.width * 4);
    if (ownership) for (let x = 0; x < box.width; x++) {
      const index = (box.top + y) * source.info.width + box.left + x;
      const region = ownership.regions[ownership.labels[index]];
      const slot = cell.row * sheet.columns + cell.column;
      let belongs = region?.slot === slot && region.area >= 4;
      // Same source-atlas separation used by the previous cinematic factory:
      // retain antialias pixels beside an owned core, without copying a weapon
      // fragment connected to the neighbouring character into this frame.
      if (!region && source.data[index * 4 + 3] > 0) {
        let closest = null;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = box.left + x + dx, ny = box.top + y + dy;
          if (nx < 0 || nx >= source.info.width || ny < 0 || ny >= source.info.height) continue;
          const neighbor = ownership.regions[ownership.labels[ny * source.info.width + nx]];
          const distance = dx * dx + dy * dy;
          if (neighbor?.area >= 4 && (!closest || distance < closest.distance)) closest = { slot: neighbor.slot, distance };
        }
        belongs = closest?.slot === slot;
      }
      if (!belongs) {
        const target = (y * box.width + x) * 4;
        pixels.fill(0, target, target + 4);
      }
    }
  }
  for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] < 8) { clear = true; break; }
  if (!clear) throw new Error(`${sheet.key}/${cell.id}/${cell.pose}: 배경 제거는 이미지 생성 도구에서 먼저 저작해야 합니다.`);
  const ink = alphaBounds(pixels, box.width, box.height, 24);
  const crop = {
    left: Math.max(0, ink.left - 2), top: Math.max(0, ink.top - 2),
    right: Math.min(box.width - 1, ink.right + 2), bottom: Math.min(box.height - 1, ink.bottom + 2),
  };
  const width = crop.right - crop.left + 1, height = crop.bottom - crop.top + 1;
  const cropped = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const offset = ((crop.top + y) * box.width + crop.left) * 4;
    pixels.copy(cropped, y * width * 4, offset, offset + width * 4);
  }
  return { sheet, cell, box, width, height, pixels: cropped,
    sourceBounds: { left: box.left + crop.left, top: box.top + crop.top, right: box.left + crop.right, bottom: box.top + crop.bottom } };
}

function pointInSheet(point, frame) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))
    throw new Error(`${frame.cell.id}/${frame.cell.pose}: 저작된 두 좌표가 필요합니다.`);
  const space = frame.cell.anchorSpace || frame.sheet.anchorSpace || 'cell-fraction';
  if (space === 'sheet-pixels') return point;
  if (space === 'cell-pixels') return [frame.box.left + point[0], frame.box.top + point[1]];
  if (space === 'cell-fraction') return [frame.box.left + point[0] * frame.box.width, frame.box.top + point[1] * frame.box.height];
  throw new Error(`지원하지 않는 원화 좌표계: ${space}`);
}

function frameAnchor(frame, placement) {
  const authored = frame.cell.anchors;
  if (!weaponKinds.has(authored?.kind) || !authored.grip || !authored.tip)
    throw new Error(`${frame.cell.id}/${frame.cell.pose}: 아직 저작하지 않은 무기 좌표는 연결할 수 없습니다.`);
  const point = raw => {
    const source = pointInSheet(raw, frame);
    const result = source.map((value, axis) => Math.round(
      (value - (axis ? frame.sourceBounds.top : frame.sourceBounds.left))
      * (axis ? placement.height / frame.height : placement.width / frame.width)
      + (axis ? placement.top : placement.left),
    ));
    if (result.some(value => value < 0 || value > canvas))
      throw new Error(`${frame.cell.id}/${frame.cell.pose}: 무기 좌표를 원화 셀에서 다시 저작해야 합니다.`);
    return result;
  };
  const polyline = points => {
    const transformed = points.map(point);
    return `M${transformed[0].join(' ')}${transformed.slice(1).map(value => `L${value.join(' ')}`).join('')}`;
  };
  const result = { kind: authored.kind, grip: point(authored.grip), tip: point(authored.tip) };
  if (Math.hypot(result.tip[0] - result.grip[0], result.tip[1] - result.grip[1]) <= 1)
    throw new Error(`${frame.cell.id}/${frame.cell.pose}: 손잡이와 무기 끝을 서로 다른 실제 위치에 저작해야 합니다.`);
  if (authored.focus) result.focus = point(authored.focus);
  if (authored.pathPoints?.length > 1) result.path = polyline(authored.pathPoints);
  if (authored.bookCenter) result.bookCenter = point(authored.bookCenter);
  if (authored.secondary) {
    result.secondary = { grip: point(authored.secondary.grip), tip: point(authored.secondary.tip) };
    if (authored.secondary.points?.length > 1) result.secondary.path = polyline(authored.secondary.points);
  }
  if (authored.bow) {
    const bow = authored.bow;
    if (!bow.upper || !bow.lower || (!(bow.points?.length > 1) && bow.curve?.length !== 2))
      throw new Error(`${frame.cell.id}/${frame.cell.pose}: 실제 활 윤곽의 위·아래·경로가 필요합니다.`);
    const upper = point(bow.upper), lower = point(bow.lower);
    const curve = bow.curve?.map(point);
    result.bow = { upper, lower,
      path: bow.points?.length > 1 ? polyline(bow.points)
        : `M${upper.join(' ')}C${curve[0].join(' ')} ${curve[1].join(' ')} ${lower.join(' ')}`,
      ...(bow.arrowVisible == null ? {} : { arrowVisible: bow.arrowVisible }),
    };
  }
  return result;
}

function authoredBodyHeight(frame) {
  const height = frame.cell.bodyHeight;
  if (height == null) return null;
  if (!Number.isFinite(height) || height <= 0)
    throw new Error(`${frame.cell.id}/${frame.cell.pose}: bodyHeight는 저작한 양의 길이여야 합니다.`);
  return (frame.cell.anchorSpace || frame.sheet.anchorSpace || 'cell-fraction') === 'cell-fraction' ? height * frame.box.height : height;
}

const configPath = argument('config') || 'docs/art/style-b-v1/sourcepack.json';
const config = await loadJson(configPath);
if (config.schema !== 1 || !Array.isArray(config.sheets)) throw new Error('B안 제작 schema 1이 필요합니다.');
const [legacy, expansion, authored, reviewed, bounds] = await Promise.all([
  loadJson('public/art/characters-v2/manifest.json'), loadJson('public/art/characters-v3/manifest.json'),
  loadJson('src/data/skillWeaponAnchors.json'), loadJson('src/data/reviewedSkillWeaponAnchors.json'),
  loadJson('src/data/cinematicFrameBounds.json'),
]);
const baseIds = [...Object.keys(legacy.units), ...Object.keys(expansion.units).filter(id => !id.includes('__')).map(canonicalize)];
const requested = argument('only')?.split(',').map(canonicalize) || baseIds;
const requestedSet = new Set(requested);
for (const id of requested) if (!baseIds.includes(id) || id.includes('__')) throw new Error(`승인된 기본형이 아닙니다: ${id}`);

const inputs = new Map(requested.map(id => [id, new Map()]));
const sources = new Map();
for (const sheet of config.sheets) {
  const selected = sheet.cells?.filter(cell => requestedSet.has(canonicalize(cell.id))) || [];
  if (!selected.length) continue;
  if (sheet.authoringComplete !== true || !sheet.sourcePath)
    throw new Error(`${sheet.key}: 투명 원본과 자세별 좌표 저작을 먼저 완료해야 합니다.`);
  if (!Number.isInteger(sheet.rows) || !Number.isInteger(sheet.columns) || sheet.rows < 1 || sheet.columns < 1)
    throw new Error(`${sheet.key}: 시트 행·열이 필요합니다.`);
  if (!sources.has(sheet.sourcePath)) {
    const input = await fs.readFile(path.resolve(root, sheet.sourcePath));
    sources.set(sheet.sourcePath, await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  for (const cell of selected) {
    const id = canonicalize(cell.id), unit = inputs.get(id);
    if (!poses.includes(cell.pose) || unit.has(cell.pose)) throw new Error(`${id}/${cell.pose}: 고유한 승인 자세가 필요합니다.`);
    if (!Number.isInteger(cell.row) || !Number.isInteger(cell.column) || cell.row < 0 || cell.row >= sheet.rows || cell.column < 0 || cell.column >= sheet.columns)
      throw new Error(`${id}/${cell.pose}: 시트 행·열 안의 셀이어야 합니다.`);
    unit.set(cell.pose, extractFrame(sheet, cell, sources.get(sheet.sourcePath)));
  }
}
for (const [id, frames] of inputs) if (poses.some(pose => !frames.has(pose)))
  throw new Error(`${id}: recover·strike·skill-a의 서로 다른 세 원화가 필요합니다.`);

const reportPath = 'docs/art/style-b-v1/production-report.json';
let report = { schema: 1, style: config.style, method: '신규 투명 원본의 자세별 저작 좌표와 인코딩 중 픽셀로 제작. 출력 재열람·후속 QA 아님.', units: {} };
try { report = await loadJson(reportPath); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const pending = [];
for (const [id, frames] of inputs) {
  const assetId = assetIdFor(id);
  const collection = legacy.units[id] ? 'characters-v2' : 'characters-v3';
  const unit = (collection === 'characters-v2' ? legacy : expansion).units[assetId];
  const originalMetrics = structuredClone(unit.metrics);
  const oldReference = report.units[id]?.originalReference || originalMetrics.recover;
  const originalVisibleFraction = report.units[id]?.originalVisibleFraction ?? unit.visibleFraction ?? (id === 'wolf' ? .45 : .703125);
  const originalScale = originalVisibleFraction * canvas / (oldReference.bottom - oldReference.top + 1);
  const ready = frames.get('recover');
  const readyBody = authoredBodyHeight(ready);
  const normalizations = Object.fromEntries(poses.map(pose => {
    const body = authoredBodyHeight(frames.get(pose));
    return [pose, readyBody && body ? readyBody / body : 1];
  }));
  const baseScale = Math.min((oldReference.bottom - oldReference.top + 1) / ready.height,
    ...poses.map(pose => {
      const frame = frames.get(pose), normalization = normalizations[pose];
      return Math.min(468 / (frame.height * normalization), 484 / (frame.width * normalization));
    }));
  const production = { collection, assetId, changedPoses: [...poses], preservedPoses: allPoses.filter(pose => !poses.includes(pose)),
    originalReference: oldReference, originalVisibleFraction, originalDisplayScale: originalScale, baseScale, placements: {} };
  for (const pose of poses) {
    const frame = frames.get(pose), scale = baseScale * normalizations[pose];
    const width = Math.max(1, Math.round(frame.width * scale)), height = Math.max(1, Math.round(frame.height * scale));
    const left = Math.floor((canvas - width) / 2), top = foot - height;
    const { data: resized, info } = await sharp(frame.pixels, { raw: { width: frame.width, height: frame.height, channels: 4 } })
      .resize(width, height).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ink = alphaBounds(resized, info.width, info.height);
    const placement = { left, top, width, height };
    const geometry = frameAnchor(frame, placement);
    const inset = await sharp(resized, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const output = await sharp({ create: { width: canvas, height: canvas, channels: 4, background: '#00000000' } })
      .composite([{ input: inset, left, top }]).webp({ quality: 94, alphaQuality: 100 }).toBuffer();
    const frameSha256 = createHash('sha256').update(output).digest('hex');
    const framePath = `public/art/${collection}/units/${assetId}-${pose}.webp`;
    if (unit.motion[pose] !== framePath.slice(6))
      throw new Error(`${id}/${pose}: 기존 매니페스트의 실제 원화 경로를 유지해야 합니다.`);
    const pixelBounds = { left: left + ink.left, top: top + ink.top, right: left + ink.right, bottom: top + ink.bottom };
    const metrics = { height: canvas, top: pixelBounds.top, bottom: pixelBounds.bottom };
    pending.push({ framePath, output });
    unit.metrics[pose] = metrics;
    bounds[id][pose] = pixelBounds;
    if (id === 'sylvan') bounds.silvan[pose] = pixelBounds;
    if (collection === 'characters-v2') {
      unit.anchors ||= {};
      unit.anchors[pose] = { ...geometry, measured: true };
      if (contactPoses.has(pose)) authored[id][pose] = geometry;
    } else if (contactPoses.has(pose)) {
      if (unit.anchors) delete unit.anchors[pose];
      reviewed.units[id] ||= {};
      reviewed.units[id][pose] = { ...geometry, framePath, frameSha256,
        reviewMethod: frame.cell.reviewMethod || frame.sheet.reviewMethod
          || '2026-10-16: 신규 B안 투명 원본의 손잡이·무기 끝·공격 기관을 원화 저작 중 수동 지정한 근삿값. 동일 제작기의 크기·발 정렬 변환으로 512px에 옮기고 인코딩 버퍼 SHA로 연결. 최종 출력 실측·후속 검증으로 표시하지 않음.',
      };
      if (id !== assetId && reviewed.units[assetId]) reviewed.units[assetId][pose] = reviewed.units[id][pose];
    } else {
      unit.anchors ||= {};
      unit.anchors[pose] = { ...geometry, measured: false };
    }
    production.placements[pose] = { sourcePath: frame.sheet.sourcePath, sheet: frame.sheet.key,
      sourceCell: frame.box, sourceBounds: frame.sourceBounds, sourceSize: [frame.width, frame.height],
      silhouetteIsolation: frame.cell.isolateSilhouette === true,
      framePath, normalization: normalizations[pose], ...placement, pixelBounds, metrics, anchors: geometry, frameSha256 };
  }
  // Include the five untouched poses by loading their existing production
  // metadata. No preserved image is opened, resized, re-encoded or overwritten.
  const completeBounds = allPoses.map(pose => bounds[id][pose]);
  const maxHalfWidth = Math.max(...completeBounds.flatMap(box => [canvas / 2 - box.left, box.right - canvas / 2]));
  const maxRise = Math.max(...completeBounds.map(box => box.bottom - box.top + 1));
  const safeDisplayScale = Math.min((canvas / 2 - 12) / maxHalfWidth, (foot - 12) / maxRise);
  const displayScale = Math.min(originalScale, safeDisplayScale);
  const referenceHeight = unit.metrics.recover.bottom - unit.metrics.recover.top + 1;
  unit.visibleFraction = displayScale * referenceHeight / canvas;
  const updateSkill = skill => {
    const pose = Object.entries(unit.motion).find(([, source]) => source === skill?.src)?.[0];
    if (!pose || !unit.metrics[pose]) return;
    skill.scale = displayScale;
    skill.footOffset = `${100 * displayScale * (.9375 - (unit.metrics[pose].bottom + 1) / canvas)}%`;
  };
  for (const skill of Object.values(unit.skills || {})) updateSkill(skill);
  if (unit.skill) updateSkill(unit.skill);
  Object.assign(production, { displayScale, safeDisplayScale, visibleFraction: unit.visibleFraction,
    completePoseBounds: Object.fromEntries(allPoses.map(pose => [pose, bounds[id][pose]])),
    preservedMetrics: Object.fromEntries(production.preservedPoses.map(pose => [pose, originalMetrics[pose]])) });
  report.units[id] = production;
}

// Construct every selected unit before the first public write; authoring errors
// leave active assets and catalogues untouched. Publication is handled elsewhere.
for (const { framePath, output } of pending) await fs.writeFile(path.join(root, framePath), output);
for (const [relative, data] of [
  ['public/art/characters-v2/manifest.json', legacy], ['public/art/characters-v3/manifest.json', expansion],
  ['src/data/skillWeaponAnchors.json', authored], ['src/data/reviewedSkillWeaponAnchors.json', reviewed],
  ['src/data/cinematicFrameBounds.json', bounds], [reportPath, report],
]) await fs.writeFile(path.join(root, relative), serialize(data));
console.log(`B안 전투 원화 제작: 기본형 ${inputs.size}종 · 고유 자세 ${pending.length}장 · 나머지 자세·전직·지도·대화 원화 보존`);
console.log(JSON.stringify({ type: 'style-b-art-manufacturing', identities: inputs.size, frames: pending.length,
  collections: Object.fromEntries(['characters-v2', 'characters-v3'].map(collection => [collection,
    { directory: `public/art/${collection}/units/`, frames: pending.filter(frame => frame.framePath.includes(`/${collection}/`)).length }])),
  poses, metadataReport: reportPath, outputReread: false }));
