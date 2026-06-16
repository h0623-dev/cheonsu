import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/maps/concept");

fs.mkdirSync(outDir, { recursive: true });

const WIDTH = 900;
const HEIGHT = 1500;

const themes = {
  frontier: {
    sky: ["#534326", "#293819", "#10190c"],
    ground: "#375b24",
    ground2: "#1f371c",
    path: "#a56f36",
    path2: "#d2a25f",
    stone: "#77715e",
    tree: "#123f22",
    accent: "#d39a43",
    water: "#1e4f58",
  },
  canyon: {
    sky: ["#604227", "#53311f", "#1f140e"],
    ground: "#5c4a2d",
    ground2: "#2f271a",
    path: "#bb8247",
    path2: "#e0b067",
    stone: "#8a7259",
    tree: "#263b1c",
    accent: "#d5772a",
    water: "#23525e",
  },
  burning: {
    sky: ["#6a2a1d", "#3a1b13", "#120807"],
    ground: "#3f391f",
    ground2: "#1d2415",
    path: "#b2743c",
    path2: "#efb060",
    stone: "#7a6651",
    tree: "#18331d",
    accent: "#ff7b32",
    water: "#2d4544",
  },
  frozen: {
    sky: ["#526576", "#2e4151", "#101923"],
    ground: "#455a4a",
    ground2: "#1c2c2c",
    path: "#958b72",
    path2: "#c8c4aa",
    stone: "#8a9692",
    tree: "#153139",
    accent: "#a5f0ff",
    water: "#2c7180",
  },
  marsh: {
    sky: ["#4a4d2b", "#27331f", "#10180f"],
    ground: "#334d25",
    ground2: "#172716",
    path: "#8d6b3d",
    path2: "#c0985c",
    stone: "#6f755f",
    tree: "#0f3b25",
    accent: "#a8b547",
    water: "#224e39",
  },
  fortress: {
    sky: ["#50432d", "#2b2821", "#10100e"],
    ground: "#3b4b2a",
    ground2: "#1b2418",
    path: "#9d7445",
    path2: "#d0a365",
    stone: "#6f6a5f",
    tree: "#143720",
    accent: "#d2a152",
    water: "#234c55",
  },
  shadow: {
    sky: ["#30263b", "#181421", "#08070d"],
    ground: "#27351f",
    ground2: "#101812",
    path: "#6e5735",
    path2: "#a68855",
    stone: "#57545b",
    tree: "#0b281c",
    accent: "#b26dff",
    water: "#1e344c",
  },
  final: {
    sky: ["#3b1e26", "#1c1118", "#070507"],
    ground: "#28301e",
    ground2: "#10130d",
    path: "#7c5432",
    path2: "#bd8b55",
    stone: "#5b5651",
    tree: "#0e2418",
    accent: "#ff5540",
    water: "#172b37",
  },
};

function themeForStage(id) {
  if (id >= 25) return "final";
  if (id >= 19) return "shadow";
  if (id >= 13) return "fortress";
  if (id >= 7) return "marsh";
  if (id === 6) return "frozen";
  if (id === 4) return "burning";
  if (id === 2 || id === 3 || id === 5) return "canyon";
  return "frontier";
}

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick(rng, min, max) {
  return min + rng() * (max - min);
}

function pathD(points) {
  const [first, ...rest] = points;
  return `M ${first[0].toFixed(1)} ${first[1].toFixed(1)} ` + rest
    .map((point, index) => {
      const prev = points[index];
      const cx = (prev[0] + point[0]) / 2;
      return `Q ${cx.toFixed(1)} ${prev[1].toFixed(1)} ${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
    })
    .join(" ");
}

function blob(rng, cx, cy, rx, ry, points = 9) {
  const coords = [];
  for (let i = 0; i < points; i += 1) {
    const angle = (Math.PI * 2 * i) / points;
    const scale = pick(rng, 0.72, 1.18);
    coords.push([
      cx + Math.cos(angle) * rx * scale,
      cy + Math.sin(angle) * ry * scale,
    ]);
  }
  return `M ${coords.map((point) => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" L ")} Z`;
}

function tree(rng, x, y, scale, color) {
  const trunk = `<rect x="${x - 5 * scale}" y="${y + 22 * scale}" width="${10 * scale}" height="${28 * scale}" rx="${3 * scale}" fill="#4a2d19" opacity="0.95"/>`;
  const crownA = `<path d="${blob(rng, x, y, 30 * scale, 32 * scale, 8)}" fill="${color}" opacity="0.96"/>`;
  const crownB = `<path d="${blob(rng, x - 15 * scale, y + 8 * scale, 22 * scale, 24 * scale, 7)}" fill="#1e5a2a" opacity="0.78"/>`;
  const crownC = `<ellipse cx="${x + 10 * scale}" cy="${y - 10 * scale}" rx="${12 * scale}" ry="${9 * scale}" fill="#6ba044" opacity="0.35"/>`;
  return `<g filter="url(#softShadow)">${trunk}${crownA}${crownB}${crownC}</g>`;
}

function pine(rng, x, y, scale, color) {
  const trunk = `<rect x="${x - 4 * scale}" y="${y + 28 * scale}" width="${8 * scale}" height="${24 * scale}" rx="${2 * scale}" fill="#3c2517"/>`;
  const layers = [0, 1, 2].map((i) => {
    const top = y - 34 * scale + i * 27 * scale;
    const w = (34 + i * 15) * scale;
    return `<path d="M ${x},${top} L ${x - w},${top + 55 * scale} L ${x + w},${top + 55 * scale} Z" fill="${i === 0 ? "#2b6b36" : color}" opacity="${0.86 - i * 0.08}"/>`;
  }).join("");
  return `<g filter="url(#softShadow)">${trunk}${layers}</g>`;
}

function rock(rng, x, y, scale, color) {
  return `<path d="${blob(rng, x, y, 22 * scale, 15 * scale, 7)}" fill="${color}" opacity="0.92" filter="url(#softShadow)"/>
  <path d="${blob(rng, x - 3 * scale, y - 4 * scale, 12 * scale, 6 * scale, 5)}" fill="#c9b889" opacity="0.25"/>`;
}

function wall(x, y, w, h, color, accent) {
  const blocks = [];
  const rows = Math.max(2, Math.floor(h / 24));
  const cols = Math.max(3, Math.floor(w / 34));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const bx = x + c * (w / cols) + (r % 2 ? -9 : 0);
      const by = y + r * (h / rows);
      blocks.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(w / cols - 3).toFixed(1)}" height="${(h / rows - 4).toFixed(1)}" rx="2" fill="${color}" opacity="${0.78 - r * 0.025}"/>`);
    }
  }
  return `<g filter="url(#deepShadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#211b16" opacity="0.78"/>
    ${blocks.join("")}
    <path d="M ${x} ${y + h} L ${x + w} ${y + h}" stroke="${accent}" stroke-width="3" opacity="0.46"/>
  </g>`;
}

function torch(x, y, accent) {
  return `<g filter="url(#glow)">
    <rect x="${x - 5}" y="${y + 16}" width="10" height="42" rx="3" fill="#3b2516"/>
    <path d="M ${x} ${y} C ${x - 22} ${y + 30}, ${x + 22} ${y + 30}, ${x} ${y + 60} C ${x - 8} ${y + 38}, ${x + 12} ${y + 28}, ${x} ${y} Z" fill="${accent}" opacity="0.88"/>
    <ellipse cx="${x}" cy="${y + 39}" rx="32" ry="22" fill="${accent}" opacity="0.18"/>
  </g>`;
}

function bridge(x, y, w, h) {
  const planks = Array.from({ length: Math.max(3, Math.floor(w / 38)) }, (_, i) =>
    `<rect x="${x + i * 38}" y="${y}" width="30" height="${h}" rx="3" fill="#7a4c28" opacity="0.88"/>`
  ).join("");
  return `<g filter="url(#softShadow)">
    <rect x="${x - 12}" y="${y + h * 0.15}" width="${w + 24}" height="12" fill="#3b2315"/>
    <rect x="${x - 12}" y="${y + h * 0.72}" width="${w + 24}" height="12" fill="#3b2315"/>
    ${planks}
  </g>`;
}

function makeMap(stageId) {
  const rng = makeRng(9100 + stageId * 177);
  const themeName = themeForStage(stageId);
  const t = themes[themeName];
  const pathPoints = [
    [pick(rng, 250, 390), HEIGHT + 80],
    [pick(rng, 300, 460), 1220],
    [pick(rng, 260, 520), 960],
    [pick(rng, 360, 610), 720],
    [pick(rng, 390, 640), 490],
    [pick(rng, 540, 760), 230],
    [pick(rng, 620, 790), -80],
  ];
  const mainPath = pathD(pathPoints);
  const branchA = pathD([
    [pathPoints[2][0], pathPoints[2][1]],
    [pick(rng, 100, 210), pick(rng, 780, 900)],
    [pick(rng, -90, 30), pick(rng, 700, 820)],
  ]);
  const branchB = pathD([
    [pathPoints[3][0], pathPoints[3][1]],
    [pick(rng, 650, 780), pick(rng, 600, 730)],
    [WIDTH + 70, pick(rng, 590, 760)],
  ]);

  const forest = [];
  for (let i = 0; i < 56; i += 1) {
    const edge = rng() < 0.68;
    const x = edge ? (rng() < 0.5 ? pick(rng, 18, 145) : pick(rng, 755, 885)) : pick(rng, 80, 825);
    const y = pick(rng, 50, 1460);
    const scale = pick(rng, 0.55, 1.28);
    forest.push((rng() < 0.5 ? tree : pine)(rng, x, y, scale, t.tree));
  }

  const rocks = [];
  for (let i = 0; i < 34; i += 1) {
    rocks.push(rock(rng, pick(rng, 55, 845), pick(rng, 90, 1420), pick(rng, 0.55, 1.35), t.stone));
  }

  const grass = [];
  for (let i = 0; i < 170; i += 1) {
    const x = pick(rng, 0, WIDTH);
    const y = pick(rng, 0, HEIGHT);
    const len = pick(rng, 5, 16);
    grass.push(`<path d="M ${x.toFixed(1)} ${y.toFixed(1)} l ${pick(rng, -4, 4).toFixed(1)} ${(-len).toFixed(1)}" stroke="#8fa85a" stroke-width="${pick(rng, 1, 2).toFixed(1)}" opacity="${pick(rng, 0.14, 0.34).toFixed(2)}"/>`);
  }

  const structures = [];
  if (themeName === "fortress" || themeName === "final" || stageId % 6 === 0 || stageId <= 5) {
    structures.push(wall(585, 74, 286, 204, t.stone, t.accent));
    structures.push(wall(655, 260, 185, 84, t.stone, t.accent));
    structures.push(torch(625, 235, t.accent), torch(822, 230, t.accent));
  }
  if (themeName === "marsh" || themeName === "frozen") {
    structures.push(`<path d="M -60 1180 C 160 1060, 310 1160, 500 1115 C 675 1088, 760 1002, 960 1058 L 960 1580 L -60 1580 Z" fill="${t.water}" opacity="0.56"/>`);
    structures.push(bridge(575, 1040, 245, 92));
  }
  if (themeName === "burning" || themeName === "shadow" || themeName === "final") {
    for (let i = 0; i < 9; i += 1) {
      const x = pick(rng, 80, 825);
      const y = pick(rng, 260, 1240);
      structures.push(`<path d="${blob(rng, x, y, pick(rng, 32, 62), pick(rng, 18, 36), 7)}" fill="${themeName === "burning" ? "#742215" : "#25172e"}" opacity="0.34"/>`);
    }
  }

  const banners = stageId % 6 === 0 || themeName === "final"
    ? `<g filter="url(#softShadow)">
        <path d="M 700 210 L 748 238 L 700 266 Z" fill="#8b241d" opacity="0.92"/>
        <path d="M 704 222 L 735 238 L 704 254 Z" fill="${t.accent}" opacity="0.42"/>
        <rect x="696" y="198" width="8" height="96" fill="#2c1b12"/>
      </g>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.sky[0]}"/>
      <stop offset="42%" stop-color="${t.sky[1]}"/>
      <stop offset="100%" stop-color="${t.sky[2]}"/>
    </linearGradient>
    <radialGradient id="sun" cx="43%" cy="4%" r="45%">
      <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.52"/>
      <stop offset="42%" stop-color="${t.accent}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="noise" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.035" numOctaves="4" seed="${stageId * 13}"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.16"/>
      </feComponentTransfer>
    </filter>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="9" stdDeviation="7" flood-color="#000" flood-opacity="0.42"/>
    </filter>
    <filter id="deepShadow" x="-30%" y="-30%" width="170%" height="180%">
      <feDropShadow dx="0" dy="13" stdDeviation="9" flood-color="#000" flood-opacity="0.55"/>
    </filter>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="7" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${t.ground}" opacity="0.72"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sun)"/>
  <path d="M -80 90 C 180 30, 260 185, 495 105 C 655 50, 765 65, 965 0 L 965 470 C 720 405, 615 485, 455 435 C 215 360, 105 475, -80 390 Z" fill="${t.ground2}" opacity="0.42"/>
  <path d="M -50 1290 C 200 1220, 310 1340, 520 1280 C 675 1238, 765 1260, 950 1190 L 950 1550 L -50 1550 Z" fill="${t.ground2}" opacity="0.58"/>
  <path d="${mainPath}" fill="none" stroke="#382718" stroke-width="154" stroke-linecap="round" stroke-linejoin="round" opacity="0.44"/>
  <path d="${mainPath}" fill="none" stroke="${t.path}" stroke-width="126" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
  <path d="${mainPath}" fill="none" stroke="${t.path2}" stroke-width="54" stroke-linecap="round" stroke-linejoin="round" opacity="0.30"/>
  <path d="${branchA}" fill="none" stroke="${t.path}" stroke-width="78" stroke-linecap="round" stroke-linejoin="round" opacity="0.76"/>
  <path d="${branchB}" fill="none" stroke="${t.path}" stroke-width="70" stroke-linecap="round" stroke-linejoin="round" opacity="0.70"/>
  <g opacity="0.72">${grass.join("\n")}</g>
  <g>${rocks.join("\n")}</g>
  <g>${forest.join("\n")}</g>
  <g>${structures.join("\n")}</g>
  ${banners}
  <path d="${mainPath}" fill="none" stroke="#ffe1a2" stroke-width="4" stroke-linecap="round" opacity="0.13"/>
  <rect width="${WIDTH}" height="${HEIGHT}" filter="url(#noise)" opacity="0.86"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="none" stroke="#d6a85f" stroke-opacity="0.16" stroke-width="10"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sun)" opacity="0.52"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="none" stroke="#000" stroke-opacity="0.62" stroke-width="24"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="52"/>
</svg>
`;
}

for (let stageId = 2; stageId <= 30; stageId += 1) {
  const file = path.join(outDir, `stage_${stageId}_illustrated.svg`);
  fs.writeFileSync(file, makeMap(stageId), "utf8");
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
