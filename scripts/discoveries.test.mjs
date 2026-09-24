import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { stages } from '../src/data/stages.js';
import { alignMapToArtwork, isPaintedGround } from '../src/data/battlefieldGround.js';
import { createStageTerrain } from '../src/data/stageTerrain.js';
import { distributeBattleFormations } from '../src/engine/formations.js';
import { DISCOVERIES, DISCOVERY_TECHNIQUES, SECRET_PROMOTIONS } from '../src/data/discoveries.js';
import {
  getStageDiscoveries, getVisibleDiscoveries, normalizeExploration, claimDiscovery, applyDiscoveryUnlocks,
  getSecretPromotion, canSecretPromote, applySecretPromotion,
} from '../src/engine/discoveryEngine.js';
import { applyEquipmentStats, applyEquipmentToParty, getInitialParty, grantExp } from '../src/engine/partyEngine.js';
import { getMoveTiles, isTerrainBlocked } from '../src/engine/movement.js';
import {
  CHARACTER_SKILLS, getUnitSkills, getSkill, withSkill, skillDescription,
  getSkillCooldown, applyCooldown, tickCooldowns, applySupportSkill,
} from '../src/data/skills.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// App owns expansion today. Parse its declarations so tests use the real maps,
// formations, recruits, and ordinary promotion without importing React or JSX.
const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const { body } = parse(source, {
  ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true },
});
const declares = (node, name) => node.id?.name === name
  || node.declarations?.some((declaration) => declaration.id.name === name);
const declaration = (name) => {
  const node = body.find((entry) => declares(entry, name));
  assert.ok(node, `App declaration ${name} must exist`);
  return source.slice(node.start, node.end);
};
const start = body.findIndex((node) => declares(node, 'MAX_DEPLOY_COUNT'));
const end = body.findIndex((node) => declares(node, 'TRAINING_TYPES'));
assert.ok(start >= 0 && end > start, 'The actual battlefield builders must be available');
const appHelpers = runInNewContext([
  ...body.slice(start, end).map((node) => source.slice(node.start, node.end)),
  ...['ENEMY_VARIANT_KEYS', 'createRecruitAlly', 'getPromotionTitle', 'promoteAllyUnit'].map(declaration),
  '({ expandStageForLargeBattle, spaceBattleFormations, createRecruitAlly, promoteAllyUnit })',
].join('\n'), {
  alignMapToArtwork, createStageTerrain, applyEquipmentStats, distributeBattleFormations,
  clone: (value) => JSON.parse(JSON.stringify(value)),
  Math: Object.assign(Object.create(Math), { random: () => { throw new Error('Random map placement'); } }),
});

const initialParty = getInitialParty();
const partyIds = [
  'hero', 'bram', 'lina', 'aria', 'leon', 'sera', 'noah', 'yuna', 'rakan',
  'miho', 'teo', 'irene', 'kaz', 'ella', 'jin', 'luka', 'baekho',
];
const fullParty = JSON.parse(JSON.stringify(partyIds.map((id) =>
  initialParty.find((unit) => unit.id === id) || appHelpers.createRecruitAlly(id))));
const ally = (id = 'hero', extra = {}) => ({ ...fullParty.find((unit) => unit.id === id), ...extra });
const entryAt = (stageId, x = 0, y = 0) => ({ ...DISCOVERIES.find((entry) => entry.stageId === stageId), x, y });
const key = ({ x, y }) => `${x},${y}`;

test('eight authored discoveries advance training, four unique techniques, and two relics', () => {
  assert.equal(DISCOVERIES.length, 8);
  assert.deepEqual(DISCOVERIES.map((entry) => entry.stageId), [1, 2, 3, 4, 5, 6, 8, 10]);
  assert.equal(new Set(DISCOVERIES.map((entry) => entry.id)).size, 8);
  assert.deepEqual(DISCOVERIES.filter((entry) => entry.kind === 'training').map((entry) => entry.reward.xp), [35, 60]);
  assert.deepEqual(DISCOVERIES.filter((entry) => entry.kind === 'technique').map((entry) => entry.reward.unitId),
    ['hero', 'lina', 'aria', 'bram']);
  for (const entry of DISCOVERIES) {
    assert.ok(entry.title && entry.hint);
    if (entry.reward.techniqueId) {
      const technique = DISCOVERY_TECHNIQUES[entry.reward.techniqueId];
      assert.equal(technique.id, entry.reward.techniqueId);
      assert.equal(technique.unitId, entry.reward.unitId);
      assert.ok(technique.name && technique.cooldown > 0 && technique.range > 0);
    }
    if (entry.reward.relicId) assert.equal(SECRET_PROMOTIONS[entry.reward.unitId].relicId, entry.reward.relicId);
  }
});

for (const stage of stages) {
  test(`Stage ${stage.id}: actual expanded ground and 4/15/17-ally formations have deterministic reachable discoveries`, () => {
    for (const count of [4, 15, 17]) {
      const active = appHelpers.expandStageForLargeBattle(stage, count);
      const units = appHelpers.spaceBattleFormations(active, [
        ...fullParty.slice(0, count), ...active.units.filter((unit) => unit.type !== 'ally'),
      ]);
      freeze(active.map);
      freeze(units);
      assert.deepEqual(units, appHelpers.spaceBattleFormations(active, [
        ...fullParty.slice(0, count), ...active.units.filter(unit => unit.type !== 'ally'),
      ]), 'Formations are deterministic, including both teams and their bosses');
      assert.equal(new Set(units.map(key)).size, units.length, 'No overlapping spawns');
      for (const unit of units) {
        assert.equal(isTerrainBlocked(active.map[unit.y]?.[unit.x]), false);
        const opponents = units.filter(other => (other.type === 'ally') !== (unit.type === 'ally'));
        assert.ok(opponents.every(other => Math.abs(unit.x - other.x) + Math.abs(unit.y - other.y) >= 7), `stage ${stage.id} opponent separation`);
      }
      for (const side of ['ally', 'enemy']) {
        const team = units.filter(unit => side === 'ally' ? unit.type === 'ally' : unit.type !== 'ally');
        assert.ok(new Set(team.map(unit => unit.y)).size >= 3, `${side} uses multiple rows`);
        assert.ok(new Set(team.map(unit => unit.x)).size >= 3, `${side} uses multiple columns`);
        for (const unit of team) for (const other of team) if (unit.id !== other.id) {
          const gap = Math.abs(unit.x - other.x) + Math.abs(unit.y - other.y);
          assert.ok(gap >= 2, `${side} spawns cannot be adjacent in stage ${stage.id} with ${count} allies`);
          if (count === 4) assert.ok(gap >= 3, 'Opening party and guards have two cells of Manhattan separation');
        }
      }
      assert.ok(active.map.length >= 26, 'Use expanded terrain, not the original 8x8 stage');
      const entries = getStageDiscoveries(stage.id, active.map, units);
      assert.deepEqual(entries, getStageDiscoveries(String(stage.id), active.map, [...units].reverse()));
      assert.equal(entries.length, DISCOVERIES.filter((entry) => entry.stageId === stage.id).length);
      const occupied = new Set(units.map(key));
      const reachable = new Set(units.filter((unit) => unit.type === 'ally').flatMap((unit) =>
        getMoveTiles({ ...unit, move: 10000, moved: false, acted: false, status: [] }, units, active.map).map(key)));
      for (const entry of entries) {
        assert.equal(isTerrainBlocked(active.map[entry.y]?.[entry.x]), false);
        assert.equal(active.terrainRevision, 2, 'Current maps render the actual terrain tiles, not the legacy traced image');
        assert.equal(occupied.has(key(entry)), false);
        assert.ok(reachable.has(key(entry)), 'At least one ally must have a legal route with the current occupants');
        assert.deepEqual(Object.keys(entry).sort(), ['hint', 'id', 'kind', 'reward', 'stageId', 'title', 'x', 'y']);
      }
    }
  });
}

test('placement excludes disconnected islands, blocked terrain, occupied choke points, and diagonal-only paths', () => {
  const map = freeze([
    ['plain', 'plain', 'wall', 'plain', 'plain'],
    ['block', 'plain', 'void', 'plain', 'plain'],
    ['plain', 'plain', 'wall', 'plain', 'plain'],
  ]);
  const units = freeze([ally('hero', { x: 0, y: 0 }), { id: 'enemy', type: 'enemy', hp: 10, x: 1, y: 1 }]);
  for (const authored of DISCOVERIES) {
    const [entry] = getStageDiscoveries(authored.stageId, map, units);
    assert.equal(entry.x, 1);
    assert.equal(entry.y, 0);
  }
  assert.deepEqual(getStageDiscoveries(1, [['plain', 'wall'], ['void', 'plain']], [ally('hero', { x: 0, y: 0 })]), []);
  assert.deepEqual(getStageDiscoveries(1, [['plain', 'plain', 'plain']], [
    ally('hero', { x: 0, y: 0 }), { id: 'enemy', type: 'enemy', hp: 10, x: 1, y: 0 },
  ]), []);
});

test('placement has no arbitrary spawn fallback on empty, malformed, or fully occupied maps', () => {
  for (const map of [null, [], [[]], [['block']], [['plain']], [[], ['plain']], [['plain'], null]]) {
    assert.deepEqual(getStageDiscoveries(1, map, [ally('hero', { x: 0, y: 0 })]), []);
  }
  const map = [['plain', 'plain']];
  for (const units of [null, [], [null], [ally('hero', { x: -1, y: 0 })],
    [ally('hero', { x: 0, y: 0, hp: 0 })], [{ id: 'enemy', type: 'enemy', x: 0, y: 0, hp: 10 }]]) {
    assert.deepEqual(getStageDiscoveries(1, map, units), []);
  }
  assert.deepEqual(getStageDiscoveries(999, map, [ally('hero', { x: 0, y: 0 })]), []);
  const units = [ally('hero', { x: 0, y: 0 }), ally('bram', { x: 1, y: 0 })];
  assert.deepEqual(getStageDiscoveries(1, map, units), []);
});

test('returned reward metadata cannot change later placement or claim rewards', () => {
  const units = [ally('hero', { x: 0, y: 0 })];
  const map = [['plain', 'plain']];
  const [entry] = getStageDiscoveries(1, map, units);
  entry.reward.xp = 9999;
  assert.equal(getStageDiscoveries(1, map, units)[0].reward.xp, 35);
  assert.equal(claimDiscovery(null, entry, { ...units[0], x: entry.x }).reward.xp, 35);
});

test('living-ally proximity reveals within Manhattan 2 and hides claimed entries without moving them', () => {
  const entries = freeze([entryAt(1, 3, 3), entryAt(2, 9, 9)]);
  const progress = freeze(normalizeExploration(null));
  for (const [x, y] of [[3, 3], [3, 4], [5, 3], [4, 4]]) {
    assert.deepEqual(getVisibleDiscoveries(entries, [ally('hero', { x, y })], progress), [entries[0]]);
  }
  for (const unit of [null, ally('hero', { x: 5, y: 4 }), ally('hero', { x: 3, y: 3, hp: 0 }),
    ally('hero', { x: 3, y: 3, type: 'enemy' }), ally('hero', { x: NaN, y: 3 })]) {
    assert.deepEqual(getVisibleDiscoveries(entries, [unit], progress), []);
  }
  const onEntry = freeze(ally('hero', { x: 3, y: 3 }));
  assert.deepEqual(getVisibleDiscoveries(entries, [onEntry], progress, 0), [entries[0]]);
  assert.deepEqual(getVisibleDiscoveries(entries, [onEntry], progress, -1), []);
  assert.deepEqual(getVisibleDiscoveries(null, [onEntry], progress), []);
  assert.deepEqual(getVisibleDiscoveries(entries, null, progress), []);
  const claimed = claimDiscovery(progress, entries[0], onEntry);
  assert.deepEqual(getVisibleDiscoveries(entries, [onEntry], claimed.progress), []);
  assert.equal(claimDiscovery(progress, entries[0], ally('hero', { x: 3, y: 4 })).reward, null,
    'Revealing an adjacent entry must not implicitly claim it');
});

test('battle movement and reveal use saved entries while placement stays tied to initial stage units', () => {
  const active = freeze(appHelpers.expandStageForLargeBattle(stages[0], 4));
  const entries = freeze(getStageDiscoveries(active.id, active.map, active.units));
  const hero = active.units.find((unit) => unit.id === 'hero');
  const movingHero = { ...hero, x: entries[0].x, y: entries[0].y };
  const liveUnits = active.units.map((unit) => unit.id === hero.id ? movingHero : unit);
  assert.deepEqual(getVisibleDiscoveries(entries, liveUnits, null), entries);
  assert.deepEqual(getStageDiscoveries(active.id, active.map, active.units), entries);
  const claim = claimDiscovery(null, entries[0], movingHero);
  assert.ok(claim.reward);
  assert.deepEqual(getVisibleDiscoveries(entries, liveUnits, claim.progress), []);
});

test('normalization deduplicates valid IDs, preserves unknown saved IDs, and never restores spent relics', () => {
  for (const raw of [null, undefined, [], 'old-save', { claimed: {}, relics: 1, techniques: null }]) {
    assert.deepEqual(normalizeExploration(raw), { claimed: [], relics: [], techniques: [] });
  }
  const raw = freeze({
    claimed: ['frost-dawnblade-relic', '', null, 'future-discovery', 'future-discovery'],
    relics: [], techniques: ['hero-dawn-slash', 1, false, {}, ' ', 'hero-dawn-slash', 'future-technique'],
  });
  const normalized = normalizeExploration(raw);
  assert.deepEqual(normalized, {
    claimed: ['frost-dawnblade-relic', 'future-discovery'], relics: [],
    techniques: ['hero-dawn-slash', 'future-technique'],
  });
  assert.deepEqual(normalizeExploration(JSON.parse(JSON.stringify(normalized))), normalized);
  normalized.claimed.push('new');
  assert.equal(raw.claimed.includes('new'), false);
});

test('all 17 allies can claim training; XP is granted once through the existing growth engine', () => {
  for (const id of partyIds) {
    const unit = freeze(ally(id, { x: 0, y: 0, exp: 80 }));
    const result = claimDiscovery(freeze(normalizeExploration(null)), freeze(entryAt(1)), unit);
    assert.equal(result.reward.xp, 35);
    assert.deepEqual(result.unit, unit, 'Claiming must not duplicate XP or growth');
    const grown = grantExp([result.unit], id, result.reward.xp).units[0];
    assert.equal(grown.level, 2);
    assert.equal(grown.exp, 15);
    assert.equal(grown.baseAtk, unit.baseAtk + 1);
    const replay = claimDiscovery(JSON.parse(JSON.stringify(result.progress)), entryAt(1), grown);
    assert.equal(replay.reward, null);
    assert.deepEqual(replay.unit, grown);
    assert.deepEqual(replay.progress.claimed, ['border-training-stone']);
  }
});

test('invalid entries, enemies, dead allies, and distant allies cannot consume discoveries', () => {
  const progress = freeze(normalizeExploration(null));
  const unit = ally('hero', { x: 0, y: 0 });
  const entry = entryAt(2);
  const cases = [
    [null, unit], [{ ...entry, id: 'invented' }, unit], [{ ...entry, stageId: 3 }, unit],
    [{ ...entry, x: -1 }, { ...unit, x: -1 }], [{ ...entry, x: 0.5 }, { ...unit, x: 0.5 }],
    [entry, null], [entry, { ...unit, type: 'enemy' }], [entry, { ...unit, hp: 0 }],
    [entry, { ...unit, x: 1 }],
  ];
  for (const [candidate, actor] of cases) {
    const result = claimDiscovery(progress, freeze(candidate), freeze(actor));
    assert.equal(result.reward, null);
    assert.deepEqual(result.progress, progress);
    assert.equal(result.unit, actor);
  }
});

test('techniques are shared discoveries, applied only to owners, and never duplicate stats or IDs', () => {
  let progress = normalizeExploration(null);
  for (const entry of DISCOVERIES.filter((candidate) => candidate.kind === 'technique')) {
    const result = claimDiscovery(freeze(progress), { ...entry, x: 0, y: 0 }, freeze(ally('leon', { x: 0, y: 0 })));
    progress = result.progress;
    assert.equal(result.unit.learnedTechniques, undefined, 'Collector is not necessarily the technique owner');
    const ownerClaim = claimDiscovery(null, { ...entry, x: 0, y: 0 }, ally(entry.reward.unitId, { x: 0, y: 0 }));
    assert.deepEqual(ownerClaim.unit.learnedTechniques, [entry.reward.techniqueId]);
  }
  freeze(progress);
  for (const original of fullParty) {
    const unit = freeze({ ...original, learnedTechniques: ['legacy-technique'] });
    const unlocked = applyDiscoveryUnlocks(unit, progress);
    const expected = Object.values(DISCOVERY_TECHNIQUES).filter((technique) => technique.unitId === unit.id).map((technique) => technique.id);
    assert.deepEqual(unlocked.learnedTechniques, ['legacy-technique', ...expected]);
    assert.deepEqual(applyDiscoveryUnlocks(unlocked, progress), unlocked);
    assert.deepEqual({ ...unlocked, learnedTechniques: unit.learnedTechniques }, unit);
  }
  assert.equal(applyDiscoveryUnlocks(null, progress), null);
  const enemy = freeze({ id: 'hero', type: 'enemy' });
  assert.equal(applyDiscoveryUnlocks(enemy, progress), enemy);
  assert.deepEqual(applyDiscoveryUnlocks(ally(), { techniques: ['toString', 'invented'] }), ally());
});

for (const id of ['hero', 'bram']) {
  test(`${id}: hidden promotion requires level 5 and its own relic`, () => {
    const promotion = SECRET_PROMOTIONS[id];
    const progress = freeze({ claimed: ['kept'], relics: [promotion.relicId], techniques: [] });
    assert.equal(getSecretPromotion(ally(id), progress).hasRelic, true);
    assert.equal(getSecretPromotion(ally(id), null).hasRelic, false);
    assert.equal(canSecretPromote(ally(id, { level: 4 }), progress).ok, false);
    assert.equal(canSecretPromote(ally(id, { level: 5 }), progress).ok, true);
    assert.equal(canSecretPromote(ally(id, { level: 5 }), null).ok, false);
    assert.equal(canSecretPromote(ally(id, { level: 5 }), { relics: ['another-relic'] }).ok, false);
    for (const level of [undefined, NaN, Infinity, 'invalid']) {
      assert.equal(canSecretPromote(ally(id, { level }), progress).ok, false);
    }
    const locked = freeze(ally(id, { level: 4 }));
    const failed = applySecretPromotion(locked, progress);
    assert.equal(failed.unit, locked);
    assert.deepEqual(failed.progress, progress);
  });

  test(`${id}: promotion preserves gear, guards, HP growth, skills and claims across equipment/save cycles`, () => {
    const promotion = SECRET_PROMOTIONS[id];
    const discovery = DISCOVERIES.find((entry) => entry.reward.relicId === promotion.relicId);
    const technique = Object.values(DISCOVERY_TECHNIQUES).find((entry) => entry.unitId === id);
    const progress = freeze({
      claimed: [discovery.id, 'previous-claim'], relics: [promotion.relicId, 'other-relic'],
      techniques: [technique.id],
    });
    const equipped = applyEquipmentStats(ally(id, {
      level: 5, exp: 87, hp: 14, baseHP: 10, maxHp: 40, baseAtk: 15, baseDef: 10,
      equipment: { weapon: id === 'hero' ? 'ironSword' : 'guardShield', armor: 'chainArmor' },
      gearEnhance: { ironSword: 3, guardShield: 2, chainArmor: 2 },
      guard: true, skillGuardBoost: 4, skillLevel: 2, skillCooldowns: { saved: 3 },
      status: [{ type: 'burn', turns: 2 }], learnedTechniques: ['legacy-technique'],
    }));
    for (const unit of [equipped, appHelpers.promoteAllyUnit(equipped)]) {
      freeze(unit);
      const { bonuses } = getSecretPromotion(unit, progress);
      const result = applySecretPromotion(unit, progress);
      const next = result.unit;
      assert.equal(next.promoted, true);
      assert.equal(next.secretClass, promotion.secretClass);
      assert.equal(next.classTitle, promotion.classTitle);
      assert.equal(next.maxHp, unit.maxHp + bonuses.hp);
      assert.equal(next.baseHP, next.maxHp);
      assert.equal(next.hp, unit.hp + bonuses.hp);
      assert.equal(next.baseAtk, unit.baseAtk + bonuses.atk);
      assert.equal(next.baseDef, unit.baseDef + bonuses.def);
      assert.equal(next.atk, unit.atk + bonuses.atk);
      assert.equal(next.def, unit.def + bonuses.def);
      assert.equal(next.exp, unit.exp);
      assert.equal(next.skillBonus, unit.skillBonus + bonuses.skillBonus);
      assert.deepEqual(next.skillCooldowns, unit.skillCooldowns);
      assert.deepEqual(next.status, unit.status);
      assert.deepEqual(next.learnedTechniques, ['legacy-technique', technique.id]);
      assert.deepEqual(result.progress, { ...progress, relics: ['other-relic'] });
      assert.deepEqual(applyEquipmentStats(next), next);
      const [restored] = applyEquipmentToParty(JSON.parse(JSON.stringify([next])));
      assert.equal(restored.atk, next.atk);
      assert.equal(restored.def, next.def - unit.skillGuardBoost);
      assert.equal(restored.secretClass, next.secretClass);
      assert.equal(restored.maxHp, next.maxHp);
      assert.equal(canSecretPromote(next, progress).ok, false, 'Even reintroduced relics cannot stack bonuses');
      const repeated = applySecretPromotion(next, progress);
      assert.deepEqual(repeated.unit, next);
      assert.deepEqual(repeated.progress, progress);
      assert.equal(claimDiscovery(result.progress, entryAt(discovery.stageId), ally(id, { x: 0, y: 0 })).reward, null);
    }

    const legacy = { ...equipped };
    delete legacy.baseAtk;
    delete legacy.baseDef;
    const fixed = applySecretPromotion(freeze(legacy), progress).unit;
    const { bonuses } = getSecretPromotion(legacy, progress);
    assert.equal(fixed.atk, equipped.atk + bonuses.atk);
    assert.equal(fixed.def, equipped.def + bonuses.def);
    assert.equal(applySecretPromotion(ally(id, { level: 5, hp: 0 }), progress).unit.hp, 0);
  });

  test(`${id}: direct secret promotion and ordinary-then-secret produce identical final stats and rewards`, () => {
    const promotion = SECRET_PROMOTIONS[id];
    const progress = freeze({ claimed: ['kept'], relics: [promotion.relicId], techniques: [] });
    for (const hp of [14, 40]) {
      const base = freeze(applyEquipmentStats(ally(id, {
        level: 5, exp: 87, hp, maxHp: 40, baseHP: 40, baseAtk: 15, baseDef: 10,
        equipment: { weapon: id === 'hero' ? 'ironSword' : 'guardShield', armor: 'chainArmor' },
        gearEnhance: { ironSword: 3, guardShield: 2, chainArmor: 2 },
        guard: true, skillGuardBoost: 4, skillLevel: 2, skillBonus: 7,
        skillCooldown: 3, skillCooldowns: { [CHARACTER_SKILLS[id][0].id]: 3 },
      })));
      const ordinary = freeze(appHelpers.promoteAllyUnit(base));
      const preview = getSecretPromotion(base, progress);
      const upgradedPreview = getSecretPromotion(ordinary, progress);
      assert.deepEqual(preview.bonuses, id === 'hero'
        ? { hp: 13, atk: 5, def: 4, skillBonus: 1 }
        : { hp: 15, atk: 4, def: 6, skillBonus: 1 });
      assert.deepEqual(upgradedPreview.bonuses, { ...promotion.bonuses, skillBonus: 0 });
      const direct = applySecretPromotion(base, progress);
      const afterOrdinary = applySecretPromotion(ordinary, progress);
      assert.deepEqual(direct, afterOrdinary, 'Actual App promotion and direct promotion must converge');
      for (const [stat, bonus] of Object.entries(preview.bonuses)) {
        assert.equal(direct.unit[stat] - base[stat], bonus, `UI delta for ${stat} must match the applied delta`);
      }
      assert.deepEqual(direct.progress, { claimed: ['kept'], relics: [], techniques: [promotion.techniqueId] });
      assert.deepEqual(getUnitSkills(direct.unit), getUnitSkills(afterOrdinary.unit));
      assert.deepEqual(getSecretPromotion(direct.unit, progress).bonuses, { hp: 0, atk: 0, def: 0, skillBonus: 0 });
      assert.equal(applySecretPromotion(direct.unit, progress).unit, direct.unit);
      assert.equal(appHelpers.promoteAllyUnit(direct.unit), direct.unit, 'Ordinary promotion cannot stack afterward');
      assert.deepEqual(applyEquipmentStats(direct.unit), direct.unit);
      const save = (result) => normalizeSaveData(JSON.parse(JSON.stringify({
        party: [result.unit], units: [result.unit], exploration: result.progress,
        selectedStage: { ...stages[0], units: [result.unit] }, savedAt: '2026-09-22T00:00:00.000Z',
      })));
      assert.deepEqual(save(direct), save(afterOrdinary));
    }
  });
}

test('unsupported characters cannot consume promotion relics and metadata is detached', () => {
  const progress = freeze({ relics: ['dawnblade-relic', 'oathwarden-relic'] });
  for (const unit of [null, ally('lina', { level: 10 }), { id: 'hero', type: 'enemy', level: 10 },
    { id: 'toString', type: 'ally', level: 10 }]) {
    assert.equal(getSecretPromotion(unit, progress), null);
    assert.equal(canSecretPromote(unit, progress).ok, false);
    assert.deepEqual(applySecretPromotion(unit, progress).progress.relics, progress.relics);
  }
  const metadata = getSecretPromotion(ally(), progress);
  metadata.bonuses.atk = 1000;
  assert.equal(getSecretPromotion(ally(), progress).bonuses.atk, 5);
});

test('all discovery titles, hints, technique names, promotion names, and result messages are Korean', () => {
  const unit = ally('hero', { x: 0, y: 0 });
  const messages = [];
  for (const entry of DISCOVERIES) {
    const result = claimDiscovery(null, { ...entry, x: 0, y: 0 }, unit);
    messages.push(entry.title, entry.hint, result.message);
  }
  messages.push(...Object.values(DISCOVERY_TECHNIQUES).map((technique) => technique.name));
  messages.push(...Object.values(SECRET_PROMOTIONS).map((promotion) => promotion.classTitle));
  assert.equal(DISCOVERY_TECHNIQUES['hero-dawn-slash'].name, '여명참');
  assert.equal(SECRET_PROMOTIONS.hero.classTitle, '여명검사');
  assert.equal(SECRET_PROMOTIONS.bram.classTitle, '서약수호자');
  assert.equal(claimDiscovery(null, entryAt(1), unit).message, '초소지기의 가르침: 경험치 +35.');
  const rejections = [
    [null, unit, null, '발견 정보를 확인할 수 없습니다.'],
    [entryAt(1), unit, { claimed: [entryAt(1).id] }, '이미 조사를 마친 발견입니다.'],
    [entryAt(1), { ...unit, hp: 0 }, null, '생존한 아군만 조사할 수 있습니다.'],
    [entryAt(1), { ...unit, x: 1 }, null, '발견 지점으로 이동해야 조사할 수 있습니다.'],
  ];
  for (const [entry, actor, progress, expected] of rejections) {
    const result = claimDiscovery(progress, entry, actor);
    assert.equal(result.message, expected);
    assert.equal(result.reward, null);
    messages.push(result.message);
  }
  for (const id of ['hero', 'bram']) {
    const progress = { relics: [SECRET_PROMOTIONS[id].relicId] };
    messages.push(canSecretPromote(ally(id, { level: 4 }), progress).reason);
    messages.push(canSecretPromote(ally(id, { level: 5 }), null).reason);
    messages.push(canSecretPromote(ally(id, { level: 5 }), progress).reason);
    const result = applySecretPromotion(ally(id, { level: 5, name: undefined }), progress);
    messages.push(result.message, canSecretPromote(result.unit, progress).reason);
  }
  messages.push(canSecretPromote(ally('lina'), null).reason);
  for (const message of messages) {
    assert.match(message, /[가-힣]/);
    assert.doesNotMatch(message, /[A-Za-z]/, 'Display text must not expose English labels or internal IDs');
  }
});

test('all 17 characters retain their original two skills and append only unique owner techniques', () => {
  for (const id of partyIds) {
    assert.equal(getUnitSkills(ally(id)), CHARACTER_SKILLS[id]);
    assert.equal(getUnitSkills(ally(id, { learnedTechniques: [] })), CHARACTER_SKILLS[id]);
    const learnedTechniques = [...Object.keys(DISCOVERY_TECHNIQUES), ...Object.keys(DISCOVERY_TECHNIQUES),
      null, false, {}, 'toString', '__proto__', 'missing', ...CHARACTER_SKILLS[id].map((skill) => skill.id)];
    const unit = freeze(ally(id, { learnedTechniques }));
    const skills = getUnitSkills(unit);
    const owned = Object.values(DISCOVERY_TECHNIQUES).filter((skill) => skill.unitId === id);
    assert.deepEqual(skills, [...CHARACTER_SKILLS[id], ...owned]);
    assert.equal(new Set(skills.map((skill) => skill.id)).size, skills.length);
    assert.deepEqual(CHARACTER_SKILLS[id].length, 2);
    assert.deepEqual(getUnitSkills({ ...unit, type: 'enemy' }), CHARACTER_SKILLS[id]);
    for (const malformed of [null, {}, 'hero-dawn-slash']) {
      assert.equal(getUnitSkills(ally(id, { learnedTechniques: malformed })), CHARACTER_SKILLS[id]);
    }
  }
  assert.deepEqual(getUnitSkills({ id: 'toString', learnedTechniques: Object.keys(DISCOVERY_TECHNIQUES) }), []);
  assert.deepEqual(getUnitSkills({ id: 'hero', secretClass: 'oathwarden' }), CHARACTER_SKILLS.hero);
  assert.deepEqual(getUnitSkills({ id: 'lina', secretClass: 'dawnblade' }), CHARACTER_SKILLS.lina);
});

for (const technique of Object.values(DISCOVERY_TECHNIQUES)) {
  test(`${technique.id}: third skill selection and cooldowns survive serialization without replacing base skills`, () => {
    const original = freeze(ally(technique.unitId, {
      learnedTechniques: [technique.id], skillLevel: 2, skillCooldown: 2,
    }));
    const [first, second, third] = getUnitSkills(original);
    assert.equal(third, technique);
    assert.equal(getSkill(original, technique.id), technique);
    assert.doesNotMatch(skillDescription(third, 2), /NaN|undefined/);
    const selected = withSkill(original, technique.id);
    assert.equal(selected.activeSkillId, technique.id);
    assert.equal(selected.skillSpec, technique);
    assert.equal(selected.skillType, technique.type);
    assert.equal(selected.skillRange, technique.range);
    assert.equal(selected.skillBonus, (technique.bonus ?? 0) + 4);
    const [used] = applyCooldown([selected], selected.id, technique.id, technique.cooldown);
    const [restored] = tickCooldowns(JSON.parse(JSON.stringify([used])));
    assert.equal(getSkillCooldown(restored, first.id), 1);
    assert.equal(getSkillCooldown(restored, second.id), 0);
    assert.equal(getSkillCooldown(restored, third.id), technique.cooldown - 1);
    assert.equal(restored.skillCooldown, 1);
    assert.deepEqual(getUnitSkills(restored), getUnitSkills(original));
  });
}

for (const id of ['hero', 'bram']) {
  test(`${id}: secret upgrade grants its missing role technique once, including after ordinary promotion`, () => {
    const promotion = SECRET_PROMOTIONS[id];
    const progress = freeze({ claimed: ['kept'], relics: [promotion.relicId], techniques: [] });
    const ordinary = appHelpers.promoteAllyUnit(ally(id, { level: 5, x: 0, y: 0 }));
    const result = applySecretPromotion(freeze(ordinary), progress);
    assert.deepEqual(result.progress, { claimed: ['kept'], relics: [], techniques: [promotion.techniqueId] });
    assert.deepEqual(result.unit.learnedTechniques, [promotion.techniqueId]);
    assert.equal(result.unit.skillBonus, ordinary.skillBonus);
    assert.equal(result.unit.baseAtk, ordinary.baseAtk + promotion.bonuses.atk);
    assert.equal(result.unit.baseDef, ordinary.baseDef + promotion.bonuses.def);
    const skills = getUnitSkills(result.unit);
    assert.equal(skills.length, 3);
    const secret = withSkill(result.unit, promotion.techniqueId);
    if (id === 'hero') {
      assert.ok(secret.skillRange > skills[0].range);
      assert.equal(secret.skillSpec.status, 'armorBreak');
      assert.ok(secret.skillSpec.bonus > skills[0].bonus);
    } else {
      const units = [secret, ally('hero', { x: 1, y: 0 }), ally('lina', { x: 1, y: 1 })];
      const guarded = applySupportSkill(secret, secret.skillSpec, units);
      assert.deepEqual(guarded.targets.map((unit) => unit.id), ['bram', 'hero']);
      assert.equal(guarded.units[1].def, units[1].def + secret.skillSpec.defense);
      assert.equal(guarded.units[2], units[2]);
      assert.deepEqual(applySupportSkill(secret, skills[0], units).targets.map((unit) => unit.id), ['bram']);
    }
    const techniqueEntry = DISCOVERIES.find((entry) => entry.reward.techniqueId === promotion.techniqueId);
    const foundLater = claimDiscovery(result.progress, { ...techniqueEntry, x: 0, y: 0 }, result.unit);
    assert.deepEqual(foundLater.progress.techniques, [promotion.techniqueId]);
    assert.deepEqual(foundLater.unit, result.unit);
    assert.equal(getUnitSkills(foundLater.unit).length, 3);
    assert.equal(claimDiscovery(foundLater.progress, { ...techniqueEntry, x: 0, y: 0 }, result.unit).reward, null);
    assert.equal(applySecretPromotion(result.unit, progress).unit, result.unit);
    assert.deepEqual(getUnitSkills({ ...result.unit, learnedTechniques: undefined }), skills,
      'A matching saved secret class also grants its technique');
  });
}

test('legacy and malformed saves get normalized exploration without granting discoveries', () => {
  for (const exploration of [undefined, null, [], 'legacy', { claimed: {}, relics: null, techniques: false }]) {
    const normalized = normalizeSaveData(freeze({ exploration }));
    assert.deepEqual(normalized.exploration, { claimed: [], relics: [], techniques: [] });
    for (const unit of normalized.party) assert.equal(getUnitSkills(unit).length, 2);
  }
});

test('save normalization restores exploration unlocks to all party and battle units without stat growth', () => {
  const active = appHelpers.expandStageForLargeBattle(stages[7], 17);
  const units = appHelpers.spaceBattleFormations(active, [
    ...fullParty, ...active.units.filter((unit) => unit.type !== 'ally'),
  ]);
  const raw = freeze({
    selectedStage: { ...active, units }, party: fullParty,
    units: units.map((unit) => ({ ...unit, learnedTechniques: [],
      skillCooldowns: Object.fromEntries(Object.values(DISCOVERY_TECHNIQUES)
        .filter((technique) => technique.unitId === unit.id).map((technique) => [technique.id, 3])),
    })),
    exploration: {
      claimed: ['frost-dawnblade-relic', 'frost-dawnblade-relic', null],
      relics: [], techniques: [...Object.keys(DISCOVERY_TECHNIQUES), 'hero-dawn-slash', null],
    },
    savedAt: '2026-09-22T00:00:00.000Z',
  });
  const expected = { claimed: ['frost-dawnblade-relic'], relics: [], techniques: Object.keys(DISCOVERY_TECHNIQUES) };
  const saved = normalizeSaveData(raw);
  assert.deepEqual(saved.exploration, expected);
  assert.equal(saved.party.length, 17);
  for (const collection of ['party', 'units']) {
    for (const unit of saved[collection]) {
      const original = raw[collection].find((candidate) => candidate.id === unit.id);
      for (const stat of ['hp', 'maxHp', 'atk', 'def', 'level', 'exp']) assert.equal(unit[stat], original[stat]);
      const owned = Object.values(DISCOVERY_TECHNIQUES).filter((technique) => technique.unitId === unit.id);
      if (unit.type !== 'ally') {
        assert.deepEqual(unit.learnedTechniques, original.learnedTechniques);
        continue;
      }
      assert.equal(getUnitSkills(unit).length, 2 + owned.length);
      for (const technique of owned) {
        assert.ok(unit.learnedTechniques.includes(technique.id));
        if (collection === 'units') assert.equal(getSkillCooldown(unit, technique.id), 3);
      }
    }
  }
  const restored = normalizeSaveData(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.exploration, saved.exploration);
  assert.deepEqual(restored.party, saved.party);
  assert.deepEqual(restored.units, saved.units);
  const withoutBattleUnits = normalizeSaveData({ ...raw, units: undefined });
  for (const unit of withoutBattleUnits.units.filter((unit) => ['hero', 'bram', 'lina', 'aria'].includes(unit.id))) {
    assert.equal(getUnitSkills(unit).length, 3);
  }
});

test('saved secret promotions keep spent relics spent and restore Korean class titles and role techniques', () => {
  for (const id of ['hero', 'bram']) {
    const promotion = SECRET_PROMOTIONS[id];
    const discovery = DISCOVERIES.find((entry) => entry.reward.relicId === promotion.relicId);
    const result = applySecretPromotion(ally(id, { level: 5 }), {
      claimed: [discovery.id], relics: [promotion.relicId], techniques: [],
    });
    const legacy = { ...result.unit, classTitle: id === 'hero' ? 'Dawnblade' : 'Oathwarden', learnedTechniques: undefined };
    const raw = freeze({
      selectedStage: { ...stages[0], units: [legacy] },
      party: fullParty.map((unit) => unit.id === id ? legacy : unit), units: [legacy],
      exploration: result.progress, savedAt: '2026-09-22T00:00:00.000Z',
    });
    const saved = normalizeSaveData(raw);
    for (const unit of [saved.party.find((candidate) => candidate.id === id), saved.units[0]]) {
      assert.equal(unit.classTitle, promotion.classTitle);
      assert.equal(unit.secretClass, promotion.secretClass);
      assert.equal(unit.baseAtk, result.unit.baseAtk);
      assert.equal(unit.baseDef, result.unit.baseDef);
      assert.equal(unit.maxHp, result.unit.maxHp);
      assert.deepEqual(unit.learnedTechniques, [promotion.techniqueId]);
      assert.equal(getUnitSkills(unit).length, 3);
      assert.equal(canSecretPromote(unit, saved.exploration).ok, false);
    }
    assert.deepEqual(saved.exploration, result.progress);
    const restored = normalizeSaveData(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(restored.exploration, result.progress);
    assert.equal(claimDiscovery(restored.exploration, entryAt(discovery.stageId), ally(id, { x: 0, y: 0 })).reward, null);
  }
});
