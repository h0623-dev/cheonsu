import { isTerrainBlocked } from './movement.js';

const key = ({ x, y }) => `${x},${y}`;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Stay in one connected land mass so a decorative island cannot become a spawn.
function connectedGround(map) {
  const seen = new Set();
  let largest = [];
  for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
    if (isTerrainBlocked(map[y][x]) || seen.has(`${x},${y}`)) continue;
    const group = [{ x, y }];
    seen.add(`${x},${y}`);
    for (let i = 0; i < group.length; i++) {
      const cell = group[i];
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        if (map[next.y]?.[next.x] == null || isTerrainBlocked(map[next.y][next.x]) || seen.has(key(next))) continue;
        seen.add(key(next));
        group.push(next);
      }
    }
    if (group.length > largest.length) largest = group;
  }
  return largest;
}

function rearRole(unit) {
  return unit.type === 'boss' || unit.skillType === 'heal' || Number(unit.range) > 1
    || ['lina', 'aria', 'noah', 'yuna', 'irene', 'ella', 'luka'].includes(unit.id);
}

export function distributeBattleFormations(stage, sourceUnits = []) {
  const map = stage?.map || [];
  const height = map.length, width = map[0]?.length || 0;
  if (!width) return sourceUnits;
  const ground = connectedGround(map);
  if (ground.length < sourceUnits.length) return sourceUnits;
  const placed = [], occupied = new Set(), byId = new Map();
  const seed = Number(stage.id) || 1;
  const teams = [sourceUnits.filter(u => u.type === 'ally'), sourceUnits.filter(u => u.type !== 'ally')];
  teams.forEach((team, side) => {
    const allies = side === 0;
    const own = [], opponents = [...placed];
    // Bosses join the same spacing check as their guards, instead of a separate pass.
    const ordered = [...team].sort((a, b) => Number(b.type === 'boss') - Number(a.type === 'boss'));
    ordered.forEach((unit, index) => {
      const rear = rearRole(unit);
      const phase = ((index * 0.61803398875 + seed * 0.137) % 1);
      const target = {
        x: (width - 1) * (0.16 + phase * 0.68),
        y: (height - 1) * (allies
          ? (rear ? .85 : .7) + ((index + seed) % 3 - 1) * .045
          : (rear ? .12 : .29) + ((index + seed) % 3 - 1) * .045),
      };
      const score = cell => {
        const sameRow = own.filter(other => other.y === cell.y).length;
        const sameColumn = own.filter(other => other.x === cell.x).length;
        const terrain = map[cell.y][cell.x];
        const terrainCost = ['fire', 'trap', 'water', 'swamp'].includes(terrain) ? 14 : terrain === 'forest' ? .6 : 0;
        return distance(cell, target) + sameRow * 2.8 + sameColumn * 1.4 + terrainCost
          + own.reduce((cost, other) => cost + 3 / Math.max(1, distance(cell, other)), 0);
      };
      const candidates = ground.filter(cell => !occupied.has(key(cell)))
        .map(cell => ({ ...cell, score: score(cell) }))
        .sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
      let chosen;
      for (const bandOnly of [true, false]) {
        for (const gap of [3, 2, 1]) {
          chosen = candidates.find(cell => (!bandOnly || (allies ? cell.y >= height * .57 : cell.y <= height * .43))
            && own.every(other => distance(cell, other) >= gap)
            && opponents.every(other => distance(cell, other) >= 7));
          if (chosen) break;
        }
        if (chosen) break;
      }
      // Tiny custom boards may not have seven cells between teams; never overlap.
      chosen ||= candidates[0];
      const next = { ...unit, x: chosen.x, y: chosen.y };
      occupied.add(key(next));
      own.push(next); placed.push(next); byId.set(next.id, next);
    });
  });
  return sourceUnits.map(unit => byId.get(unit.id));
}
