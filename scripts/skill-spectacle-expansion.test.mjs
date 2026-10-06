import test from 'node:test';
import assert from 'node:assert/strict';
import { combatArtKeys, getCombatChoreography, getCombatPresentation } from '../src/data/combatArt.js';
import { CHARACTER_SKILLS, withSkill } from '../src/data/skills.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { EXPANSION_ENEMY_TEMPLATES } from '../src/data/expansionEnemies.js';
import { getSkillAuraAnchor, getExpansionBaseKey } from '../src/data/skillAuraAnchors.js';
import { SFX_PRESETS } from '../src/engine/soundEffects.js';
import authored from '../src/data/skillWeaponAnchors.json' with { type: 'json' };
import reviewed from '../src/data/reviewedSkillWeaponAnchors.json' with { type: 'json' };
import { EXPANSION_BASE_ART_KEYS, ADVANCED_CLASS_ART_KEYS, getExpansionArtIdentity } from '../src/data/expansionArtRegistry.js';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const allyScene = (id, skill, advancedClass) => ({ mode: 'skill', attacker: withSkill({ id, type: 'ally', ...(advancedClass ? { advancedClass } : {}), learnedTechniques: [skill.id] }, skill.id), outcome: { hit: true, heal: skill.type === 'heal', guard: skill.type === 'guard' } });

test('기존 실측 무기 좌표와 활·채찍 경로를 그대로 보존한다', () => {
  const saved = structuredClone(authored);
  for (const [key, poses] of Object.entries(authored)) for (const [pose, expected] of Object.entries(poses)) {
    const actual = getSkillAuraAnchor(key, pose);
    for (const [field, value] of Object.entries(expected)) assert.deepEqual(actual[field], value, `${key}/${pose}/${field}`);
    assert.equal(actual.authored, true); assert.equal(actual.origin, 'authored-frame');
  }
  assert.deepEqual(authored, saved);
});

test('109개 실제 아트 ID의 준비·타격·기술 무기 이펙트에 유한한 좌표를 제공한다', () => {
  assert.equal(combatArtKeys.length, 109);
  for (const key of combatArtKeys) for (const pose of ['windup', 'strike', 'skill-a', 'skill-b']) {
    const anchor = getSkillAuraAnchor(key, pose);
    for (const point of [anchor.grip, anchor.tip, ...(anchor.focus ? [anchor.focus] : [])]) {
      assert.ok(point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 512), `${key}/${pose}: 원화 좌표계`);
    }
    assert.ok(Math.hypot(...anchor.grip.map((value, index) => value - anchor.tip[index])) > 1, `${key}/${pose}: 손과 무기 끝 구분`);
    if (key.includes('__form') || Object.hasOwn(EXPANSION_ENEMY_TEMPLATES, key) || ['mare','harin','edan','sylvan'].includes(key)) {
      assert.equal(anchor.authored, false, `${key}: 새 그림을 실측했다고 표시하지 않습니다`);
      assert.ok(['base-profile','weapon-profile','reviewed-frame'].includes(anchor.origin));
    }
  }
  assert.deepEqual(getSkillAuraAnchor('silvan', 'strike'), getSkillAuraAnchor('sylvan', 'strike'));
});

test('새 62종의 무기 부착점을 실제 검토 원화와 연결하고 원화 교체 시 재검토를 요구한다', () => {
  const keys = [...EXPANSION_BASE_ART_KEYS, ...ADVANCED_CLASS_ART_KEYS];
  assert.equal(keys.length, 62);
  for (const key of keys) for (const pose of ['windup', 'strike', 'skill-a', 'skill-b']) {
    const identity = getExpansionArtIdentity(key);
    const frame = reviewed.units[key]?.[pose] || reviewed.units[identity.assetId]?.[pose];
    assert.ok(frame, `${key}/${pose}: 기본 모습에서 방향을 상속하지 않는 검토 좌표`);
    assert.equal(frame.framePath, `public/art/characters-v3/units/${identity.assetId}-${pose}.webp`);
    assert.ok(frame.reviewMethod, `${key}/${pose}: 검토 방법 기록`);
    const bytes = fs.readFileSync(new URL(`../${frame.framePath}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), frame.frameSha256, `${key}/${pose}: 검토한 원화 보존`);
    const anchor = getSkillAuraAnchor(key, pose);
    assert.equal(anchor.origin, 'reviewed-frame');
    assert.equal(anchor.authored, false);
    assert.equal(anchor.reviewed, true);
    assert.deepEqual(getSkillAuraAnchor(identity.assetId, pose), anchor, `${key}/${pose}: 자산 별칭에도 같은 실제 좌표`);
  }
});

test('새 자연·물 장식은 실제 스킬 효과를 바꾸지 않고 고유 색과 음향을 사용한다', () => {
  for (const [key, theme] of [['mare','water'],['sylvan','nature']]) {
    const skill = CHARACTER_SKILLS[key][0], scene = allyScene(key, skill), before = structuredClone(scene);
    const presentation = getCombatPresentation(key, scene), plan = getCombatChoreography(key, scene);
    assert.equal(plan.spectacle.theme, theme);
    assert.equal(presentation.effect, skill.effect);
    assert.deepEqual(scene, before);
    assert.ok(SFX_PRESETS[theme]?.length > 1);
    assert.ok(plan.cues.every(cue => Object.hasOwn(SFX_PRESETS, cue.sound)));
  }
});

test('42개 최상위 전직 기술은 canonical 캐릭터 및 무기·원소를 보존한다', () => {
  for (const form of Object.values(ADVANCED_CLASSES).flat()) {
    assert.equal(getExpansionBaseKey(form.id), form.unitId);
    const scene = allyScene(form.unitId, form.skill, form.id), plan = getCombatChoreography(form.id, scene);
    assert.equal(plan.spectacle.weapon.unit, form.id);
    assert.ok(plan.spectacle.bursts.every(burst => burst.kind === plan.spectacle.theme));
    assert.ok(plan.cues.every(cue => Object.hasOwn(SFX_PRESETS, cue.sound)));
    if (form.unitId === 'hero') {
      assert.equal(plan.spectacle.sword.kind, form.skill.type === 'attack' ? 'fire' : 'gold');
      assert.equal(getSkillAuraAnchor(form.id, 'skill-a').kind, 'blade');
    }
  }
});

test('신규 적 16종과 보스 두 페이즈 모두 실제 스펙의 속성·무기 부착·음향을 제공한다', () => {
  for (const [key, template] of Object.entries(EXPANSION_ENEMY_TEMPLATES)) for (const spec of [template.skillSpec, template.phaseSkill].filter(Boolean)) {
    const scene = { mode: 'skill', attacker: { id: `enemy-${key}`, type: template.rank === 'boss' ? 'boss' : 'enemy', skill: spec.name, skillSpec: spec }, outcome: { hit: true } };
    const plan = getCombatChoreography(key, scene);
    assert.equal(plan.name, spec.name); assert.equal(plan.spectacle.weapon.unit, key);
    assert.equal(getCombatPresentation(key, scene).effect, spec.effect);
    assert.ok(plan.cues.every(cue => Object.hasOwn(SFX_PRESETS, cue.sound)), `${key}/${spec.name}`);
  }
});
