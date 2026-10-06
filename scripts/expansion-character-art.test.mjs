import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import legacyManifest from '../public/art/characters-v2/manifest.json' with { type: 'json' };
import expansionManifest from '../public/art/characters-v3/manifest.json' with { type: 'json' };
import { EXPANSION_BASE_ART_KEYS, ADVANCED_CLASS_ART_KEYS, EXPANSION_ALLY_ART_KEYS, EXPANSION_ENEMY_ART_KEYS, getExpansionArtIdentity, getGameCharacterArtKey } from '../src/data/expansionArtRegistry.js';
import { getCharacterArt, getCharacterFrameStyle, getCharacterSkillPose } from '../src/data/characterArt.js';
import { combatUnitIds, combatArtKeys, getCombatSprite, getCombatMotionSprite, getCombatPresentation, getCombatChoreography } from '../src/data/combatArt.js';
import { getPaintedVisualProfile } from '../src/data/unitVisuals.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { getUnitSkills } from '../src/data/skills.js';
import { getStoryPortrait, storySpeakerKeys } from '../src/data/storyArt.js';
import { MONSTER_ENEMIES } from '../src/data/monsterEnemies.js';
import { EXPANSION_MONSTER_KEYS, EXPANSION_ENEMY_TEMPLATES } from '../src/data/expansionEnemies.js';

const allNewKeys = [...EXPANSION_BASE_ART_KEYS, ...ADVANCED_CLASS_ART_KEYS];
const poses = ['run-a', 'run-b', 'windup', 'strike', 'recover', 'recoil', 'skill-a', 'skill-b'];
const file = asset => new URL(`../public${asset}`, import.meta.url);

test('기존 47종과 신규 20종을 보존하고 42폼을 적군 도감 개체로 중복 등록하지 않는다', () => {
  assert.equal(Object.keys(legacyManifest.units).length, 47);
  assert.equal(EXPANSION_BASE_ART_KEYS.length, 20);
  assert.equal(ADVANCED_CLASS_ART_KEYS.length, 42);
  assert.equal(combatUnitIds.length, 67);
  assert.equal(combatArtKeys.length, 109);
  assert.equal(new Set(combatArtKeys).size, 109);
  assert.equal(combatUnitIds.some(id => id.includes('__form')), false);
  assert.equal(EXPANSION_MONSTER_KEYS.length, 12);
  assert.equal(Object.keys(MONSTER_ENEMIES).length, 18);
  for (const key of EXPANSION_MONSTER_KEYS) {
    assert.ok(Object.hasOwn(MONSTER_ENEMIES, key), `${key}: 신규 몬스터 도감 등록`);
    assert.ok(EXPANSION_ENEMY_ART_KEYS.includes(key), `${key}: 신규 원화 등록`);
  }
  const expectedAssets = allNewKeys.map(key => getExpansionArtIdentity(key).assetId).sort();
  assert.deepEqual(Object.keys(expansionManifest.units).sort(), expectedAssets);
  for (const key of Object.keys(legacyManifest.units)) assert.equal(getCharacterArt(key), legacyManifest.units[key]);
});

test('캐릭터 소유 분기만 아트키로 선택하고 저장된 원래 스탯·진행 정보를 변경하지 않는다', () => {
  for (const [id, forms] of Object.entries(ADVANCED_CLASSES)) {
    for (const form of forms) {
      const unit = { id, type: 'ally', advancedClass: form.id, hp: 7, maxHp: 53, level: 17, exp: 83,
        equipment: { weapon: 'kept' }, collected: ['kept'], learnedTechniques: ['kept'], moved: true };
      const snapshot = structuredClone(unit);
      assert.equal(getGameCharacterArtKey(unit), form.id);
      assert.deepEqual(unit, snapshot);
    }
  }
  assert.equal(getGameCharacterArtKey({ id: 'hero', type: 'ally', advancedClass: 'bram__form0' }), 'hero');
  assert.equal(getGameCharacterArtKey({ id: 'saved-enemy', type: 'enemy', artId: 'eel_archer', spriteKey: 'ranger' }), 'eel_archer');
  assert.equal(getGameCharacterArtKey({ id: 'missing', type: 'enemy', artId: '__proto__' }), null);
  assert.equal(getExpansionArtIdentity('sylvan').assetId, 'silvan');
  assert.equal(getCharacterArt('sylvan'), getCharacterArt('silvan'));
});

test('62종 신규 원화의 실제 496프레임에 투명도·서로 다른 동작·발 정렬·파일 경로가 있다', async () => {
  let checked = 0;
  for (const key of allNewKeys) {
    const art = getCharacterArt(key);
    assert.ok(art, `${key}: 신규 원화 등록`);
    const hashes = new Set();
    for (const pose of poses) {
      assert.match(art.motion[pose], /^\/art\/characters-v3\/units\//);
      const bytes = await fs.readFile(file(art.motion[pose]));
      hashes.add(createHash('sha256').update(bytes).digest('hex'));
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.hasAlpha, true, `${key}/${pose}: 투명 원화`);
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, 512); assert.equal(info.height, 512);
      let visible = 0, transparent = 0, top = 512, bottom = -1, left = 512, right = -1;
      for (let pixel = 0; pixel < 512 * 512; pixel++) {
        const alpha = data[pixel * 4 + 3];
        if (alpha < 8) transparent++;
        if (alpha > 64) { const x = pixel % 512, y = Math.floor(pixel / 512); visible++; top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
      }
      assert.ok(visible > 10000 && transparent > 512 * 512 * .1, `${key}/${pose}: 비어 있지 않은 독립 실루엣`);
      assert.ok(top > 0 && left > 0 && right < 511 && bottom >= 473 && bottom <= 480, `${key}/${pose}: 무기·몸이 잘리지 않고 발 기준 정렬`);
      assert.deepEqual(art.metrics[pose], { height: 512, top, bottom }, `${key}/${pose}: 실제 픽셀 측정값`);
      const style = getCharacterFrameStyle(key, pose);
      assert.equal(style['--combat-sprite-scale'], getCharacterFrameStyle(key, 'recover')['--combat-sprite-scale']);
      const foot = .9375 + ((bottom + 1) / 512 - .9375) * style['--combat-sprite-scale'] + parseFloat(style['--combat-foot-offset']) / 100;
      assert.ok(Math.abs(foot - .9375) < .00001, `${key}/${pose}: 화면 발 기준선`);
      checked++;
    }
    assert.equal(hashes.size, 8, `${key}: 자세 8개를 복제하지 않음`);
    assert.equal(getCombatSprite(key), art.motion.recover);
    assert.equal(getCombatSprite(key, 'action'), art.motion.strike);
    for (const pose of poses.slice(0, 6)) assert.equal(getCombatMotionSprite(key, pose), art.motion[pose]);
    for (const asset of [art.portrait, art.dialogue, art.map]) { assert.match(asset, /^\/art\//); await fs.access(file(asset)); }
  }
  assert.equal(checked, 496);
});

test('기존 동료 대기 이미지와 새 동료 기본 대기는 상위 분기를 선택해도 유지된다', () => {
  for (const key of ADVANCED_CLASS_ART_KEYS) {
    const identity = getExpansionArtIdentity(key);
    const expected = EXPANSION_ALLY_ART_KEYS.includes(identity.baseId)
      ? `/art/characters-v3/map/${identity.baseId === 'sylvan' ? 'silvan' : identity.baseId}.webp`
      : `/art/map-sprites-v4/${identity.baseId}.webp`;
    assert.equal(getCharacterArt(key).map, expected);
    assert.equal(getPaintedVisualProfile(key).map, expected);
  }
});

test('42폼 기본·비전·새 기술은 선택한 의상의 원화와 원래 활·창·검·주술 역할을 사용한다', () => {
  for (const [id, forms] of Object.entries(ADVANCED_CLASSES)) for (const form of forms) {
    const unit = { id, type: 'ally', advancedClass: form.id, learnedTechniques: id === 'hero' ? ['hero-dawn-slash'] : id === 'bram' ? ['bram-oath-wall'] : [] };
    for (const skill of getUnitSkills(unit)) {
      const actor = { ...unit, activeSkillId: skill.id, skillSpec: skill };
      const scene = { mode: 'skill', attacker: actor, outcome: { hit: true, heal: skill.type === 'heal', guard: skill.type === 'guard' } };
      const plan = getCombatChoreography(form.id, scene);
      assert.equal(plan.skillPose.src, getCharacterSkillPose(form.id, skill.id).src);
      assert.match(plan.skillPose.src, /^\/art\/characters-v3\/units\//);
      assert.equal(plan.impact, .62);
      assert.equal(plan.contacts.at(-1), .62);
      assert.ok(plan.effects.length > 0);
      if (skill.type === 'attack') assert.equal(getCombatPresentation(form.id, scene).weapon, getExpansionArtIdentity(form.id).weapon);
    }
  }
});

test('신규 4명과 4보스 이야기 화자가 카일 대신 자기 대화 이미지를 사용한다', () => {
  for (const [name, key] of [['마레','mare'],['하린','harin'],['에단','edan'],['실반','sylvan'],
    ['심해 수문장 모르칸','tide_keeper'],['빙정 여왕 세르카','frost_queen'],['공명 집행관 아르켄','resonance_judge'],['첫 맹세 수호체 아스테르','oath_guardian']]) {
    assert.equal(storySpeakerKeys[name], key);
    assert.equal(getStoryPortrait(name), getCharacterArt(key).dialogue);
    assert.notEqual(getStoryPortrait(name), getStoryPortrait('카일'));
  }
});

test('신규 적 16종과 보스 2페이즈 기술은 승인된 무기와 자기 원화로 실제 접촉한다', () => {
  for (const [key, profile] of Object.entries(EXPANSION_ENEMY_TEMPLATES)) {
    const baseActor = { id: `${key}-saved`, type: profile.rank === 'boss' ? 'boss' : 'enemy',
      spriteKey: key, artId: key, ...profile };
    const basicScene = { mode: 'attack', attacker: baseActor, outcome: { hit: true } };
    const basic = getCombatChoreography(key, basicScene);
    assert.equal(getCombatPresentation(key, basicScene).weapon, getExpansionArtIdentity(key).weapon);
    assert.equal(basic.impact, .5);
    for (const spec of [profile.skillSpec, profile.phaseSkill].filter(Boolean)) {
      const actor = { ...baseActor, skillSpec: spec };
      const scene = { mode: 'skill', attacker: actor, outcome: { hit: true } };
      const plan = getCombatChoreography(key, scene);
      assert.equal(getCombatPresentation(key, scene).weapon, getExpansionArtIdentity(key).weapon);
      assert.equal(plan.impact, .62);
      assert.equal(plan.contacts.at(-1), .62);
      assert.equal(plan.motion.startsWith('basic-'), false, `${key}/${spec.name}: 기본 동작으로 누락되지 않음`);
      assert.ok(plan.effects.length > 0);
      assert.match(plan.skillPose.src, new RegExp(`^/art/characters-v3/units/${key}-skill-[ab]\\.webp$`));
    }
  }
});
