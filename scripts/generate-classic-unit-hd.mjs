import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(process.cwd(), "public", "sprites", "classic", "units_hd");

const r = (x, y, w, h, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const p = (points, fill, extra = "") => `<polygon points="${points}" fill="${fill}" ${extra}/>`;

function frame(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 36" width="128" height="144" shape-rendering="crispEdges">
<g shape-rendering="crispEdges">
${content.join("\n")}
</g>
</svg>
`;
}

function drawCap(parts, def, dark) {
  if (def.headgear === "helm") {
    parts.push(r(10, 5, 12, 4, dark));
    parts.push(r(9, 7, 14, 4, def.helm || "#6f8791"));
    parts.push(r(11, 6, 10, 3, def.helmLight || "#c2d4d7"));
    parts.push(r(9, 10, 3, 4, dark));
    parts.push(r(20, 10, 3, 4, dark));
    if (def.plume) {
      parts.push(r(15, 2, 2, 5, def.plume));
      parts.push(r(16, 1, 3, 2, def.plumeLight || "#ffd36b"));
    }
    return;
  }

  if (def.headgear === "hood") {
    parts.push(r(9, 5, 14, 11, dark));
    parts.push(r(10, 6, 12, 9, def.hood || "#e5d8b8"));
    parts.push(r(11, 9, 10, 7, "#1f1512"));
    return;
  }

  if (def.headgear === "hat") {
    parts.push(r(8, 6, 16, 3, dark));
    parts.push(r(9, 4, 12, 5, def.hat || "#7b352a"));
    parts.push(r(11, 5, 9, 2, def.hatLight || "#b94f3f"));
    parts.push(r(21, 7, 4, 2, def.hat || "#7b352a"));
    return;
  }

  parts.push(r(10, 5, 12, 4, dark));
  parts.push(r(9, 8, 5, 6, def.hair || "#302018"));
  parts.push(r(18, 8, 5, 6, def.hair || "#302018"));
  parts.push(r(12, 6, 8, 3, def.hairLight || def.hair || "#62402a"));
}

function drawWeapon(parts, def, dark) {
  const trim = def.trim || "#f4ca68";
  if (def.weapon === "sword") {
    parts.push(r(5, 18, 2, 12, "#57331d"));
    parts.push(r(4, 10, 4, 11, "#d7e2dd"));
    parts.push(r(6, 10, 1, 11, "#ffffff"));
    parts.push(r(3, 20, 6, 2, trim));
    return;
  }
  if (def.weapon === "blade") {
    parts.push(r(4, 17, 2, 14, "#4f2c1a"));
    parts.push(p("2,7 7,7 8,17 6,24 4,24 4,14 2,14", "#cfd9d4"));
    parts.push(r(5, 8, 1, 14, "#ffffff"));
    parts.push(r(2, 22, 7, 2, trim));
    return;
  }
  if (def.weapon === "spear") {
    parts.push(r(25, 8, 2, 23, "#5a321c"));
    parts.push(p("24,5 28,5 26,1", "#d9e5df"));
    parts.push(r(26, 7, 1, 15, "#c28b44"));
    return;
  }
  if (def.weapon === "staff") {
    parts.push(r(25, 8, 2, 23, "#6a3b20"));
    parts.push(r(23, 5, 6, 5, dark));
    parts.push(r(24, 4, 4, 4, def.magic || "#f8d35f"));
    parts.push(r(25, 3, 2, 2, "#fff2a7"));
    return;
  }
  if (def.weapon === "bow") {
    parts.push(p("25,8 29,13 29,23 25,31 26,23 26,15", "#7a4a25"));
    parts.push(r(24, 14, 1, 12, "#ecd99a"));
    parts.push(r(22, 20, 7, 1, "#dce8e4"));
    parts.push(r(28, 20, 2, 1, "#fff2aa"));
    return;
  }
  if (def.weapon === "dagger") {
    parts.push(r(5, 21, 5, 2, "#dce8e4"));
    parts.push(r(5, 19, 1, 5, "#ffffff"));
    parts.push(r(22, 21, 5, 2, "#dce8e4"));
    parts.push(r(26, 19, 1, 5, "#ffffff"));
    return;
  }
  if (def.weapon === "axe") {
    parts.push(r(25, 12, 2, 18, "#5d321d"));
    parts.push(r(23, 10, 5, 5, "#cdd9d4"));
    parts.push(r(22, 12, 3, 4, "#eef6ef"));
  }
}

function human(def) {
  const dark = def.dark || "#14100d";
  const skin = def.skin || "#c58b5c";
  const skinLight = def.skinLight || "#e4b17d";
  const main = def.main || "#2f5e9b";
  const mainLight = def.mainLight || "#5d91d5";
  const cloth = def.cloth || "#202c45";
  const trim = def.trim || "#f4ca68";
  const parts = [];

  parts.push(r(7, 32, 18, 2, "rgba(0,0,0,0.5)"));

  if (def.cape) {
    parts.push(r(8, 14, 16, 16, dark));
    parts.push(p("9,14 7,28 12,33 16,30 16,14", def.capeDark || "#4c1220"));
    parts.push(p("16,14 17,31 23,33 25,27 22,14", def.cape));
    parts.push(r(10, 17, 3, 10, def.capeLight || "#a83a3e"));
  }

  drawWeapon(parts, def, dark);

  parts.push(r(10, 26, 4, 7, dark));
  parts.push(r(18, 26, 4, 7, dark));
  parts.push(r(9, 32, 6, 2, "#080707"));
  parts.push(r(17, 32, 7, 2, "#080707"));
  parts.push(r(11, 26, 3, 6, cloth));
  parts.push(r(18, 26, 3, 6, cloth));
  parts.push(r(12, 28, 2, 2, mainLight));
  parts.push(r(18, 28, 2, 2, mainLight));

  parts.push(r(7, 16, 5, 10, dark));
  parts.push(r(20, 16, 5, 10, dark));
  parts.push(r(8, 17, 4, 8, main));
  parts.push(r(20, 17, 4, 8, main));

  parts.push(r(9, 14, 14, 14, dark));
  parts.push(r(10, 15, 12, 13, main));
  parts.push(r(11, 16, 10, 4, mainLight));
  parts.push(r(12, 20, 8, 2, trim));
  parts.push(r(13, 23, 6, 4, cloth));
  parts.push(r(15, 16, 2, 12, "rgba(0,0,0,0.22)"));
  parts.push(r(10, 14, 3, 3, trim));
  parts.push(r(20, 14, 3, 3, trim));

  if (def.shield) {
    parts.push(r(3, 17, 8, 10, dark));
    parts.push(r(4, 16, 8, 10, def.shield));
    parts.push(r(5, 17, 6, 3, def.shieldLight || "#9fb8c0"));
    parts.push(r(6, 20, 4, 4, "#263642"));
  }

  drawCap(parts, def, dark);
  parts.push(r(11, 9, 10, 8, dark));
  parts.push(r(12, 9, 8, 7, skin));
  parts.push(r(13, 10, 6, 2, skinLight));
  parts.push(r(13, 13, 1, 1, "#15100c"));
  parts.push(r(18, 13, 1, 1, "#15100c"));
  parts.push(r(15, 15, 3, 1, "#7b4330"));

  if (def.headgear === "hood") {
    parts.push(r(10, 8, 12, 2, def.hood || "#e5d8b8"));
    parts.push(r(10, 10, 2, 6, def.hoodShadow || "#b9a985"));
    parts.push(r(20, 10, 2, 6, def.hoodShadow || "#b9a985"));
  }

  if (def.aura) {
    parts.push(r(24, 12, 2, 2, def.aura));
    parts.push(r(26, 15, 1, 1, def.aura));
    parts.push(r(6, 12, 1, 1, def.aura));
  }

  return frame(parts);
}

function wolf() {
  return frame([
    r(6, 31, 18, 2, "rgba(0,0,0,0.5)"),
    r(7, 19, 15, 9, "#14100d"),
    r(8, 18, 14, 9, "#44505a"),
    r(10, 16, 13, 6, "#6d7d82"),
    r(20, 14, 7, 6, "#14100d"),
    r(21, 13, 6, 6, "#56636a"),
    r(23, 12, 2, 2, "#a5b4b8"),
    r(22, 17, 1, 1, "#f2d66f"),
    r(25, 17, 1, 1, "#f2d66f"),
    r(4, 20, 5, 3, "#2d363c"),
    r(9, 27, 3, 6, "#171d21"),
    r(18, 27, 3, 6, "#171d21"),
    r(24, 19, 4, 2, "#e7eee8"),
  ]);
}

const sprites = {
  hero: human({
    main: "#1f5fa8",
    mainLight: "#63a6e8",
    cloth: "#223858",
    trim: "#ffd36a",
    hair: "#2a1c18",
    headgear: "helm",
    helm: "#1d4f86",
    helmLight: "#69a5d2",
    plume: "#d94736",
    weapon: "sword",
    cape: "#6f1824",
    capeDark: "#300b12",
  }),
  bram: human({
    main: "#53646b",
    mainLight: "#aebfc2",
    cloth: "#29343a",
    trim: "#f0c45c",
    headgear: "helm",
    helm: "#596870",
    helmLight: "#d5dfdf",
    weapon: "blade",
    shield: "#2b4b64",
    shieldLight: "#86a9b7",
  }),
  lina: human({
    main: "#6936a0",
    mainLight: "#b070e0",
    cloth: "#32174e",
    trim: "#ffe076",
    hair: "#6a2444",
    hairLight: "#a9436b",
    weapon: "staff",
    magic: "#f7a6ff",
    aura: "#ff8dff",
  }),
  aria: human({
    main: "#d9c98d",
    mainLight: "#fff0b6",
    cloth: "#805456",
    trim: "#ffffff",
    headgear: "hood",
    hood: "#efe2bd",
    hoodShadow: "#bda980",
    weapon: "staff",
    magic: "#bff5ff",
    aura: "#bff5ff",
  }),
  leon: human({
    main: "#2f7447",
    mainLight: "#70b56b",
    cloth: "#233a27",
    trim: "#f0be5d",
    headgear: "hat",
    hat: "#9f2e25",
    hatLight: "#e35a43",
    weapon: "bow",
  }),
  sera: human({
    main: "#34335e",
    mainLight: "#7669bd",
    cloth: "#17172b",
    trim: "#d58cff",
    hair: "#2c132d",
    hairLight: "#6e2d78",
    weapon: "dagger",
    cape: "#2d164a",
    capeDark: "#110820",
  }),
  archer: human({
    main: "#546d34",
    mainLight: "#8ead5e",
    cloth: "#2c3b22",
    trim: "#d8a34e",
    headgear: "hat",
    hat: "#6a3f22",
    hatLight: "#b06b37",
    weapon: "bow",
  }),
  assassin: human({
    main: "#3d2f4f",
    mainLight: "#74619b",
    cloth: "#18131f",
    trim: "#d780ff",
    hair: "#1a1219",
    weapon: "dagger",
    cape: "#241137",
    capeDark: "#100718",
  }),
  bandit: human({
    main: "#804a27",
    mainLight: "#bd7840",
    cloth: "#3b2518",
    trim: "#d89b45",
    headgear: "hat",
    hat: "#6c3320",
    hatLight: "#ac5731",
    weapon: "axe",
  }),
  shield: human({
    main: "#5b6964",
    mainLight: "#98aaa6",
    cloth: "#303a39",
    trim: "#e1b95e",
    headgear: "helm",
    helm: "#4c5958",
    helmLight: "#c6d3cf",
    weapon: "spear",
    shield: "#314f5e",
    shieldLight: "#8fb2b8",
  }),
  mage: human({
    main: "#603267",
    mainLight: "#a46abe",
    cloth: "#2a1733",
    trim: "#f1cd70",
    headgear: "hood",
    hood: "#6a3670",
    hoodShadow: "#3a1b44",
    weapon: "staff",
    magic: "#ff82df",
    aura: "#ff82df",
  }),
  boss_knight: human({
    main: "#383c3e",
    mainLight: "#8f9696",
    cloth: "#191b1d",
    trim: "#ff5c47",
    headgear: "helm",
    helm: "#24282b",
    helmLight: "#a7a9a4",
    plume: "#e63c32",
    plumeLight: "#ff8765",
    weapon: "blade",
    cape: "#4a0d0d",
    capeDark: "#1a0505",
  }),
  boss_mage: human({
    main: "#4f215a",
    mainLight: "#b25fcb",
    cloth: "#22092b",
    trim: "#ff63db",
    headgear: "hood",
    hood: "#5b2365",
    hoodShadow: "#24082e",
    weapon: "staff",
    magic: "#ff4cd8",
    aura: "#ff4cd8",
    cape: "#350640",
  }),
  garon: human({
    main: "#432024",
    mainLight: "#8d3834",
    cloth: "#16090b",
    trim: "#ff6a43",
    headgear: "helm",
    helm: "#251010",
    helmLight: "#78302f",
    plume: "#ff3b2d",
    weapon: "blade",
    cape: "#5c0d0d",
    capeDark: "#1e0505",
    aura: "#ff3b2d",
  }),
  wolf: wolf(),
};

await mkdir(outDir, { recursive: true });

await Promise.all(
  Object.entries(sprites).map(([name, svg]) =>
    writeFile(path.join(outDir, `${name}.svg`), svg, "utf8")
  )
);

console.log(`Generated ${Object.keys(sprites).length} classic HD unit sprites in ${outDir}`);
