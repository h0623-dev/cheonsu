// Walkable ground traced from the frontier illustration, in native image space.
// Each row describes horizontal clearings at 1/26 of the original image height.
const CLEARINGS = [
  [], [], [[0.19, 0.36]], [[0.17, 0.34], [0.66, 0.85]],
  [[0.17, 0.34], [0.62, 0.86]], [[0.18, 0.34], [0.54, 0.82]],
  [[0.17, 0.32], [0.49, 0.72]], [[0.17, 0.32], [0.43, 0.69]],
  [[0.21, 0.57]], [[0.27, 0.55]], [[0.28, 0.57]], [[0.29, 0.65]],
  [[0.33, 0.73]], [[0.37, 0.71]], [[0.37, 0.62]],
  [[0.12, 0.30], [0.34, 0.56]], [[0.19, 0.52]], [[0.25, 0.50]],
  [[0.25, 0.51]], [[0.22, 0.54]], [[0.18, 0.59]], [[0.15, 0.64]],
  [[0.12, 0.29], [0.48, 0.69]], [[0.10, 0.27], [0.49, 0.71]],
  [[0.08, 0.24], [0.53, 0.73]], [[0.06, 0.22], [0.54, 0.74]],
];

// Crop rectangles and mirroring used by generate-stage-final-map-variants.ps1.
// Acts 1-6 currently all display the uncropped stage-1 illustration.
const CROPS = {
  7: [99, 121, 743, 1430], 8: [0, 0, 776, 1204], 9: [46, 86, 809, 1279],
  10: [263, 153, 678, 1354], 11: [150, 242, 710, 1430], 12: [24, 318, 743, 1204],
  13: [42, 157, 776, 1279], 14: [66, 159, 809, 1354], 15: [0, 0, 678, 1430],
  16: [81, 103, 710, 1204], 17: [198, 189, 743, 1279], 18: [107, 318, 776, 1354],
  19: [16, 165, 809, 1430], 20: [188, 247, 678, 1204], 21: [116, 196, 710, 1279],
  22: [0, 0, 743, 1354], 23: [58, 53, 776, 1430], 24: [132, 225, 809, 1204],
  25: [171, 393, 678, 1279], 26: [28, 216, 710, 1354], 27: [35, 158, 743, 1430],
  28: [82, 234, 776, 1204], 29: [0, 0, 809, 1279], 30: [92, 70, 678, 1354],
};

export function isPaintedGround(stageId, u, v) {
  const crop = CROPS[stageId] || [0, 0, 941, 1672];
  const mirrored = stageId > 6 && stageId % 2 === 0;
  const x = (crop[0] + (mirrored ? 1 - u : u) * crop[2]) / 941;
  const y = (crop[1] + v * crop[3]) / 1672;
  const ranges = CLEARINGS[Math.min(25, Math.max(0, Math.floor(y * 26)))];
  return ranges.some(([left, right]) => x >= left && x <= right);
}

export function alignMapToArtwork(map, stageId) {
  const height = map.length;
  const width = map[0]?.length || 0;
  if (!width) return map;
  const blocked = new Set(['block', 'wall', 'void']);
  const aligned = map.map((row, y) => row.map((terrain, x) => {
    if (!isPaintedGround(stageId, (x + 0.5) / width, (y + 0.7) / height)) return 'block';
    return blocked.has(terrain) || terrain === 'forest' ? 'plain' : terrain;
  }));

  // Discard isolated clearings so neither team can spawn in an unreachable pocket.
  const visited = new Set();
  let largest = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = y * width + x;
      if (aligned[y][x] === 'block' || visited.has(key)) continue;
      const component = [{ x, y }];
      visited.add(key);
      for (let i = 0; i < component.length; i++) {
        const cell = component[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          const next = ny * width + nx;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || aligned[ny][nx] === 'block' || visited.has(next)) continue;
          visited.add(next);
          component.push({ x: nx, y: ny });
        }
      }
      if (component.length > largest.length) largest = component;
    }
  }
  const connected = new Set(largest.map(({ x, y }) => y * width + x));
  return aligned.map((row, y) => row.map((terrain, x) => connected.has(y * width + x) ? terrain : 'block'));
}
