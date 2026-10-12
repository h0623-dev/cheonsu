import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { SECRET_PROMOTIONS } from '../src/data/discoveries.js';
import { ORDINARY_PROMOTION_ART_KEYS, SECRET_PROMOTION_ART_KEYS, PROMOTION_ART_KEYS, ADVANCED_CLASS_ART_KEYS, getGameCharacterArtKey, getExpansionArtIdentity } from '../src/data/expansionArtRegistry.js';
import { getCharacterArt, getCharacterSkillPose } from '../src/data/characterArt.js';
import { getPaintedVisualProfile } from '../src/data/unitVisuals.js';
import { getCombatMotionSprite, getCombatChoreography } from '../src/data/combatArt.js';
import { getVillageWalkFrame, getVillageWalkFrames } from '../src/data/villageWalk.js';
import { getStoryPortrait, storySpeakerKeys } from '../src/data/storyArt.js';
import { getUnitSkills } from '../src/data/skills.js';

test('기존 전직 저장은 추가 저장이나 재전직 없이 소유 캐릭터의 상급·비전·최상위 외형을 선택한다', () => {
  assert.equal(ORDINARY_PROMOTION_ART_KEYS.length, 21);
  assert.equal(SECRET_PROMOTION_ART_KEYS.length, 2);
  for (const [id, forms] of Object.entries(ADVANCED_CLASSES)) {
    const unit = { id, type: 'ally', hp: 0, maxHp: 51, level: 14, exp: 29,
      equipment: { weapon: 'ironSword', armor: null, accessory: null }, gearEnhance: { ironSword: 4 }, learnedTechniques: ['kept'], acted: true };
    const base = structuredClone(unit);
    assert.equal(getGameCharacterArtKey(unit), id);
    const promoted = { ...unit, promoted: true };
    const before = structuredClone(promoted);
    assert.equal(getGameCharacterArtKey(promoted), `${id}__promoted`);
    assert.equal(getGameCharacterArtKey({ ...promoted, advancedClass: 'another-character__form0', secretClass: 'invalid' }), `${id}__promoted`);
    for (const form of forms) {
      const advanced = { ...promoted, advancedClass: form.id, secretClass: SECRET_PROMOTIONS[id]?.secretClass };
      const saved = structuredClone(advanced);
      assert.equal(getGameCharacterArtKey(advanced), form.id);
      assert.deepEqual(advanced, saved);
    }
    const secret = SECRET_PROMOTIONS[id];
    if (secret) {
      assert.equal(getGameCharacterArtKey({ ...promoted, secretClass: secret.secretClass }), `${id}__${secret.secretClass}`);
      assert.equal(getGameCharacterArtKey({ ...unit, secretClass: secret.secretClass }), `${id}__${secret.secretClass}`);
    }
    assert.deepEqual(unit, base);
    assert.deepEqual(promoted, before);
  }
  assert.equal(getGameCharacterArtKey({ id: '__proto__', type: 'ally', promoted: true }), null);
  assert.equal(getGameCharacterArtKey({ id: 'hero', type: 'enemy', promoted: true }), 'hero');
});

test('상급 21종과 비전 2종은 기본 모습 대신 자기 전투·기술·초상·대화 원화를 사용한다', async () => {
  const poses = ['run-a', 'run-b', 'windup', 'strike', 'recover', 'recoil', 'skill-a', 'skill-b'];
  for (const key of PROMOTION_ART_KEYS) {
    const identity = getExpansionArtIdentity(key), art = getCharacterArt(key), base = getCharacterArt(identity.baseId);
    assert.ok(art, `${key}: 전직 원화`);
    for (const pose of poses) {
      assert.match(art.motion[pose], /^\/art\/promotions-v1\//);
      assert.notEqual(art.motion[pose], base.motion[pose]);
      await fs.access(new URL(`../public${art.motion[pose]}`, import.meta.url));
    }
    assert.equal(getCombatMotionSprite(key, 'strike'), art.motion.strike);
    const secret = SECRET_PROMOTIONS[identity.baseId];
    const unit = { id: identity.baseId, type: 'ally', promoted: true,
      ...(secret && key.endsWith(`__${secret.secretClass}`) ? { secretClass: secret.secretClass } : {}) };
    for (const skill of getUnitSkills(unit)) {
      const actor = { ...unit, activeSkillId: skill.id, skillSpec: skill };
      const scene = { mode: 'skill', attacker: actor, outcome: { hit: true, heal: skill.type === 'heal', guard: skill.type === 'guard' } };
      const selected = getCharacterSkillPose(key, skill.id);
      assert.ok(Object.values(art.motion).includes(selected.src), `${key}/${skill.id}: 전직 의상 유지`);
      assert.equal(getCombatChoreography(key, scene).skillPose.src, selected.src);
    }
    const speaker = Object.keys(storySpeakerKeys).find(name => storySpeakerKeys[name] === identity.baseId);
    assert.equal(getStoryPortrait(speaker, [unit]), art.dialogue);
    assert.notEqual(art.portrait, base.portrait);
    assert.notEqual(art.dialogue, base.dialogue);
    const profile = getPaintedVisualProfile(key);
    assert.equal(profile.portrait, art.portrait);
    assert.equal(profile.cutscene, art.dialogue);
  }
  assert.equal(getCharacterArt('silvan__promoted'), getCharacterArt('sylvan__promoted'));
});

test('모든 65개 전직 외형은 지도 앞·뒤와 마을 네 보행 프레임을 같은 의상으로 연결한다', async () => {
  const keys = [...PROMOTION_ART_KEYS, ...ADVANCED_CLASS_ART_KEYS];
  assert.equal(keys.length, 65);
  for (const key of keys) {
    const art = getCharacterArt(key), profile = getPaintedVisualProfile(key);
    assert.equal(profile.map, art.map);
    assert.equal(profile.rear, art.rear);
    assert.ok(art.rear, `${key}: 전직 후면`);
    assert.notEqual(art.map, getPaintedVisualProfile(getExpansionArtIdentity(key).baseId).map);
    assert.equal(new Set(getVillageWalkFrames(key)).size, 4, `${key}: 독립 보행 프레임 4개`);
    assert.equal(getVillageWalkFrame(key, 'up-left', 0), art.walk['back-a']);
    assert.equal(getVillageWalkFrame(key, 'up-right', 1), art.walk['back-b']);
    assert.equal(getVillageWalkFrame(key, 'down', 0), art.walk['front-a']);
    assert.equal(getVillageWalkFrame(key, 'left', 1), art.walk['front-b']);
    for (const asset of [art.map, art.rear, ...getVillageWalkFrames(key)]) {
      assert.match(asset, /^\/art\//);
      await fs.access(new URL(`../public${asset}`, import.meta.url));
    }
  }
});
