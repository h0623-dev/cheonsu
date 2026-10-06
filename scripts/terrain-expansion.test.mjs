import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  NEW_TERRAIN_IDS, getNewTerrainPolicy, getNewTerrainCombatModifiers,
  getTerrainEffectDescription, isDeploymentTerrainUnsafe,
} from '../src/data/terrainPolicy.js';
import {
  getTerrainMoveCost, getTerrainBaseMoveCost, getTerrainMoveLabel,
  getUnitMoveRange, getMoveTiles,
} from '../src/engine/movement.js';
import { processTerrainStartEffects, processTurnStartStatuses } from '../src/engine/statusEngine.js';
import { getWorldTileVisual } from '../src/data/worldArt.js';

const unit = (id = 'hero', overrides = {}) => ({
  id, name: id, type: 'ally', hp: 10, maxHp: 20, move: 3, x: 0, y: 0, status: [], ...overrides,
});

test('10종 신규 지형은 실제 생성 원본과 서로 다른 불투명 512px WebP를 갖는다', async () => {
  const record = JSON.parse(await readFile(new URL('../docs/art/world-v2/terrain-expansion-exports.json', import.meta.url), 'utf8'));
  const original = await readFile(new URL(`../${record.source}`, import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'), record.sha256);
  assert.deepEqual(record.exports.map(entry => entry.id), NEW_TERRAIN_IDS);
  const hashes = new Set();
  for (const entry of record.exports) {
    const bytes = await readFile(new URL(`../${entry.file}`, import.meta.url));
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 512);
    assert.equal(metadata.hasAlpha, false);
    assert.ok(bytes.length < 150000, `${entry.id}: 모바일 지형 용량`);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, 10);
});

test('new terrain paths use weighted movement, retained occupancy and no implicit flight', () => {
  const actor = unit();
  const map = [['plain', 'sluice_bridge', 'shell_reef', 'plain', 'plain']];
  assert.deepEqual(getMoveTiles(actor, [actor], map).map(cell => [cell.x, cell.cost]), [[0, 0], [1, 1], [2, 3], [3, 4]]);
  assert.deepEqual(getMoveTiles(actor, [actor, unit('enemy', { type: 'enemy', x: 2 })], map).map(cell => cell.x), [0, 1]);
  const winged = unit('scroll_sentinel', { type: 'enemy', move: 5 });
  assert.deepEqual(getMoveTiles(winged, [winged], [['plain', 'wall', 'plain']]).map(cell => cell.x), [0]);
  assert.equal(getTerrainMoveCost('packed_snow', unit('lina')), 2);
  assert.equal(getTerrainMoveCost('hot_spring', unit('bram')), 1);
  for (const tile of NEW_TERRAIN_IDS) {
    assert.ok(Number.isFinite(getTerrainMoveCost(tile, actor)), tile);
    assert.equal(getTerrainMoveLabel(tile), getNewTerrainPolicy(tile).name);
  }
});

test('legacy terrain costs and class traits retain their original behavior', () => {
  const expected = { road: 1, gate: 1, plain: 1, fort: 1, trap: 1, forest: 2, hill: 2, fire: 2, ice: 2, water: 2, dark: 2, rune: 2, swamp: 3 };
  for (const [tile, cost] of Object.entries(expected)) {
    assert.equal(getTerrainBaseMoveCost(tile), cost, tile);
    assert.deepEqual(getNewTerrainCombatModifiers(tile, tile, 'magic'), { damageMod: 0, hitMod: 0, critMod: 0, labels: [] });
  }
  assert.equal(getTerrainMoveCost('water', unit('bram')), 3);
  assert.equal(getTerrainMoveCost('swamp', unit('bram')), 4);
  assert.equal(getTerrainMoveCost('forest', unit('leon')), 1);
  assert.equal(getTerrainMoveCost('ice', unit('lina')), 1);
});

test('two recovery tiles heal only living active-side units and cannot exceed max HP', () => {
  for (const tile of ['hot_spring', 'star_moss']) {
    const allies = [unit('hurt'), unit('almostFull', { x: 1, hp: 19 }), unit('full', { x: 2, hp: 20 }), unit('dead', { x: 3, hp: 0 })];
    const enemy = unit('enemy', { type: 'enemy', x: 4 });
    const before = structuredClone([...allies, enemy]);
    const map = [Array(5).fill(tile)];
    const result = processTerrainStartEffects(before, 'ally', map);
    assert.deepEqual(result.units.map(item => [item.id, item.hp]), [['hurt', 12], ['almostFull', 20], ['full', 20], ['enemy', 10]]);
    assert.equal(result.messages.length, 2);
    assert.equal(before[0].hp, 10);
    assert.deepEqual(result.units[0].status, []);
    const enemyTurn = processTerrainStartEffects(result.units, 'enemy', map);
    assert.equal(enemyTurn.units.find(item => item.id === 'enemy').hp, 12);
    assert.equal(enemyTurn.units.find(item => item.id === 'hurt').hp, 12);
  }
});

test('safe snow and magic pads do not inherit freeze, bleed or legacy rune damage', () => {
  const map = [['packed_snow', 'resonance_pad', 'oath_rune', 'cracked_slab']];
  const units = map[0].map((tile, x) => unit(tile, { x }));
  assert.deepEqual(processTerrainStartEffects(units, 'ally', map), { units, messages: [] });
  const oldMap = [['fire', 'ice', 'dark', 'rune', 'trap', 'swamp']];
  const oldUnits = oldMap[0].map((tile, x) => unit(tile, { x }));
  const oldResult = processTerrainStartEffects(oldUnits, 'ally', oldMap);
  assert.deepEqual(oldResult.units.map(item => item.hp), [8, 10, 9, 8, 6, 9]);
  assert.deepEqual(oldResult.units.slice(0, 4).map(item => item.status[0]?.type), ['burn', 'freeze', 'bleed', 'bleed']);
});

test('terrain combat modifiers combine route, magic and cover without permanent stat changes', () => {
  const route = getNewTerrainCombatModifiers('sluice_bridge', 'shell_reef', 'bow');
  assert.equal(route.damageMod, -2);
  assert.equal(route.hitMod, 0);
  const magic = getNewTerrainCombatModifiers('oath_rune', 'low_rubble', 'magic');
  assert.equal(magic.damageMod, -1);
  assert.equal(magic.hitMod, 0);
  const physical = getNewTerrainCombatModifiers('oath_rune', 'plain', 'sword');
  assert.equal(physical.damageMod, 0);
  assert.equal(physical.hitMod, 0);
  for (const tile of NEW_TERRAIN_IDS) {
    assert.ok(getTerrainEffectDescription(tile).length > 0);
  }
  assert.equal(isDeploymentTerrainUnsafe('hot_spring'), true);
  assert.equal(isDeploymentTerrainUnsafe('oath_rune'), true);
  assert.equal(isDeploymentTerrainUnsafe('sluice_bridge'), false);
  assert.equal(isDeploymentTerrainUnsafe('shell_reef'), false);
});

test('slow and water stride expire after one usable next turn without accumulating saved move', () => {
  const actor = unit('bram', { status: [{ type: 'slow', turns: 2, power: 1 }, { type: 'waterStride', turns: 2 }] });
  const before = JSON.stringify(actor);
  assert.equal(getUnitMoveRange(actor), 3);
  assert.equal(getTerrainMoveCost('water', actor), 1);
  assert.equal(getTerrainMoveCost('swamp', actor), 1);
  for (const tile of ['block', 'wall', 'void', 'deep_water', 'deepwater']) assert.equal(getTerrainMoveCost(tile, actor), Infinity);
  const first = processTurnStartStatuses([actor], 'ally').units[0];
  assert.deepEqual(first.status.map(status => status.turns), [1, 1]);
  assert.equal(getUnitMoveRange(first), 3);
  const second = processTurnStartStatuses([first], 'ally').units[0];
  assert.deepEqual(second.status, []);
  assert.equal(getUnitMoveRange(second), 4);
  assert.equal(getTerrainMoveCost('water', second), 3);
  assert.equal(JSON.stringify(actor), before);
  assert.equal(getUnitMoveRange(unit('rooted', { type: 'enemy', move: 0, status: [{ type: 'slow', turns: 2 }] })), 0);
  assert.equal(getUnitMoveRange(unit('slowEnemy', { type: 'enemy', move: 1, status: [{ type: 'slow', turns: 2, power: 9 }] })), 1);
});

test('regen heals once, expires, respects side, and does not rescue lethal status damage', () => {
  const regenerating = unit('regen', { status: [{ type: 'regen', turns: 2, power: 4 }] });
  const enemy = unit('enemy', { type: 'enemy', status: [{ type: 'regen', turns: 2, power: 4 }] });
  const first = processTurnStartStatuses([regenerating, enemy], 'ally');
  assert.equal(first.units[0].hp, 14);
  assert.deepEqual(first.units[0].status, []);
  assert.equal(first.units[1].hp, 10);
  assert.equal(processTurnStartStatuses(first.units, 'ally').units[0].hp, 14);
  assert.equal(processTurnStartStatuses([unit('nearMax', { hp: 19, status: regenerating.status })], 'ally').units[0].hp, 20);
  assert.deepEqual(processTurnStartStatuses([unit('dead', { hp: 0, status: regenerating.status })], 'ally').units, []);
  const lethal = unit('lethal', { hp: 2, status: [{ type: 'burn', turns: 2, sourceId: 'enemy' }, ...regenerating.status] });
  const lethalResult = processTurnStartStatuses([lethal], 'ally');
  assert.deepEqual(lethalResult.units, []);
  assert.equal(lethalResult.defeats.length, 1);
  assert.ok(lethalResult.messages.every(message => !message.includes('회복 4')));
});

test('new terrain reads its own image at one full tile while original art scale remains unchanged', () => {
  for (const tile of NEW_TERRAIN_IDS) {
    const visual = getWorldTileVisual([[tile]], 0, 0, 1);
    assert.equal(visual.material, tile);
    assert.equal(visual.blocked, false);
    assert.equal(visual.style['--ground-image'], `url("/art/world-v2/terrain/${tile}.webp")`);
    assert.equal(visual.style['--ground-position'], 'center');
    assert.equal(visual.style['--ground-size'], '100% 100%');
  }
  const old = getWorldTileVisual([['plain']], 0, 0, 1);
  assert.equal(old.material, 'grass');
  assert.equal(old.style['--ground-size'], '300% 300%');
});
