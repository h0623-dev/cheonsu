import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import manifest from '../public/art/characters-v2/manifest.json' with { type: 'json' };
import { getCharacterArt, getCharacterFrameStyle, getCharacterSkillPose } from '../src/data/characterArt.js';
import { combatUnitIds, combatMotionPoses, getCombatSprite, getCombatMotionSprite, getCombatChoreography } from '../src/data/combatArt.js';
import { CHARACTER_SKILLS } from '../src/data/skills.js';
import { DISCOVERY_TECHNIQUES } from '../src/data/discoveries.js';
import { getPaintedVisualProfile } from '../src/data/unitVisuals.js';
import { storySpeakerKeys, getStoryPortrait } from '../src/data/storyArt.js';
import { bossCombatIds, getBossSplash } from '../src/data/bossArt.js';
import { getEnemyIllustration } from '../src/data/enemyIllustrations.js';

const poses = [...combatMotionPoses, 'skill-a', 'skill-b'];
const idleBaseline = JSON.parse(await fs.readFile(new URL('../docs/art/characters-v2/idle-baseline.json', import.meta.url), 'utf8'));
const assertNewAsset = asset => assert.match(asset, /^\/art\/characters-v2\//, 'active combat/dialogue must use the new artwork');
const publicFile = asset => new URL(`../public${asset}`, import.meta.url);

test('all 86 idle and directional artwork files retain their original SHA-256', async () => {
  assert.equal(Object.keys(idleBaseline.files).length, 86);
  assert.match(idleBaseline.commit, /^[a-f0-9]{40}$/);
  for (const [file, expected] of Object.entries(idleBaseline.files)) {
    assert.match(file, /^public\/art\/(map-sprites-v4|directions-v1)\//);
    const bytes = await fs.readFile(new URL(`../${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `${file}: original idle/back image must stay unchanged`);
  }
});

test('new character catalogue covers all 17 companions, 19 enemies and 5 bosses', () => {
  assert.deepEqual(Object.keys(manifest.units).sort(), [...combatUnitIds].sort());
  assert.equal(Object.keys(CHARACTER_SKILLS).length, 17);
  assert.equal(combatUnitIds.filter(id => !Object.hasOwn(CHARACTER_SKILLS, id) && !bossCombatIds.includes(id)).length, 19);
  assert.equal(bossCombatIds.length, 5);
  assert.equal(getCharacterArt('unknown'), null);
  assert.equal(getCharacterArt('__proto__'), null);
  assert.equal(getPaintedVisualProfile('unknown'), null);
});

test('all live combat, collection, dialogue and boss selectors use one new identity and retain map artwork', async () => {
  for (const id of combatUnitIds) {
    const art = getCharacterArt(id);
    assert.ok(art, id);
    const before = JSON.stringify(art);
    assert.equal(getCombatSprite(id), art.motion.recover);
    assert.equal(getCombatSprite(id, 'action'), art.motion.strike);
    assert.equal(getCombatMotionSprite(id, 'invalid'), art.motion.recover);
    for (const pose of combatMotionPoses) assert.equal(getCombatMotionSprite(id, pose), art.motion[pose]);
    assert.deepEqual(getPaintedVisualProfile(id), {
      map: `/art/map-sprites-v4/${id}.webp`, battle: art.motion.recover,
      portrait: art.portrait, cutscene: art.dialogue,
    });
    for (const asset of [...poses.map(pose => art.motion[pose]), art.portrait, art.dialogue]) {
      assertNewAsset(asset);
      await fs.access(publicFile(asset));
    }
    if (bossCombatIds.includes(id)) {
      assert.deepEqual(getEnemyIllustration(id), { portrait: art.portrait, cutscene: art.dialogue });
      const boss = { id: 'saved-boss', type: 'boss', spriteKey: id, hp: 10, maxHp: 20 };
      const saved = structuredClone(boss);
      assert.equal(getBossSplash(boss).src, art.splash || art.dialogue);
      assert.deepEqual(boss, saved);
    }
    assert.equal(JSON.stringify(art), before, 'art selection never mutates the catalogue');
  }
  for (const [speaker, id] of Object.entries(storySpeakerKeys)) {
    assert.equal(getStoryPortrait(speaker), getCharacterArt(id).dialogue);
  }
  assert.equal(getCombatSprite('unknown'), manifest.units.raider.motion.recover);
  assert.equal(getCombatMotionSprite('unknown', 'unknown'), manifest.units.raider.motion.recover);
});

test('all 328 new combat frames have genuine alpha, complete silhouettes and measured anchors', async () => {
  for (const id of combatUnitIds) {
    const art = getCharacterArt(id);
    assert.ok(art, id);
    const hashes = new Set();
    for (const pose of poses) {
      const source = await fs.readFile(publicFile(art.motion[pose]));
      hashes.add(createHash('sha256').update(source).digest('hex'));
      const metadata = await sharp(source).metadata();
      assert.equal(metadata.hasAlpha, true, `${id}/${pose}: genuine alpha channel`);
      const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, 512); assert.equal(info.height, 512);
      let clear = 0, visible = 0, top = 512, bottom = -1, left = 512, right = -1;
      for (let pixel = 0; pixel < 512 * 512; pixel++) {
        const alpha = data[pixel * 4 + 3];
        if (alpha < 8) clear++;
        if (alpha > 64) {
          visible++;
          const x = pixel % 512, y = Math.floor(pixel / 512);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
          left = Math.min(left, x); right = Math.max(right, x);
        }
      }
      assert.ok(clear > 512 * 512 * .1 && visible > 10000, `${id}/${pose}: real cutout, no opaque background`);
      assert.ok(top > 0 && left > 0 && right < 511 && bottom <= 480, `${id}/${pose}: complete weapon and body`);
      assert.ok(bottom >= 473, `${id}/${pose}: anchored feet ${bottom}`);
      assert.deepEqual(art.metrics[pose], { height: 512, top, bottom }, `${id}/${pose}: metrics match actual alpha`);
      const style = getCharacterFrameStyle(id, pose);
      assert.equal(style['--combat-sprite-scale'], getCharacterFrameStyle(id, 'recover')['--combat-sprite-scale']);
      const foot = .9375 + ((bottom + 1) / 512 - .9375) * style['--combat-sprite-scale'] + parseFloat(style['--combat-foot-offset']) / 100;
      assert.ok(Math.abs(foot - .9375) < .00001, `${id}/${pose}: stable rendered baseline`);
    }
    assert.equal(hashes.size, 8, `${id}: eight authored poses, no copied stand-in frames`);
    const portrait = await sharp(publicFile(art.portrait).pathname).metadata();
    assert.equal(portrait.width, 320); assert.equal(portrait.height, 320);
    const dialogue = await sharp(publicFile(art.dialogue).pathname).metadata();
    assert.equal(dialogue.width, 512); assert.equal(dialogue.height, 640);
    assert.equal(dialogue.hasAlpha, true);
  }
});

test('guard, shield bash and learned sanctuary aliases keep their authored skill roles', () => {
  for (const [id, skill, pose] of [
    ['hero', 'oath', 'skill-b'],
    ['bram', 'bulwark', 'skill-b'],
    ['bram', 'bash', 'skill-a'],
    ['bram', 'bram-oath-wall', 'skill-b'],
    ['aria', 'aria-sanctuary-song', 'skill-b'],
  ]) {
    const art = getCharacterArt(id);
    assert.ok(art, id);
    const selected = getCharacterSkillPose(id, skill);
    assert.equal(selected.src, art.motion[pose], `${id}/${skill}: preserve the authored guard/attack role`);
    const style = getCharacterFrameStyle(id, pose);
    assert.equal(selected.scale, style['--combat-sprite-scale']);
    assert.equal(selected.footOffset, style['--combat-foot-offset']);
  }
});

test('34 character skills, learned techniques and enemy skills never reintroduce previous character designs', () => {
  const techniques = [...Object.entries(CHARACTER_SKILLS).flatMap(([unit, skills]) => skills.map(skill => [unit, skill])),
    ...Object.values(DISCOVERY_TECHNIQUES).map(skill => [skill.unitId, skill])];
  for (const [id, skill] of techniques) {
    const actor = { id, type: 'ally', activeSkillId: skill.id, skillSpec: skill, learnedTechniques: [skill.id] };
    const saved = structuredClone(actor);
    const scene = { mode: 'skill', attacker: actor, title: skill.name,
      outcome: { hit: true, heal: skill.type === 'heal', guard: skill.type === 'guard' } };
    const plan = getCombatChoreography(id, scene);
    assertNewAsset(plan.skillPose.src);
    assert.equal(plan.skillPose.src, getCharacterSkillPose(id, skill.id).src);
    assert.equal(plan.impact, .62);
    assert.ok(plan.effects.length && plan.contacts.length);
    assert.deepEqual(actor, saved, 'rendering never mutates saved skill data');
  }
  for (const id of combatUnitIds.filter(id => !Object.hasOwn(CHARACTER_SKILLS, id))) {
    const plan = getCombatChoreography(id, { mode: 'skill', attacker: { id, type: id.startsWith('boss_') ? 'boss' : 'enemy' }, outcome: { hit: true } });
    assertNewAsset(plan.skillPose.src);
    assert.equal(plan.skillPose.src, getCharacterArt(id).motion['skill-a']);
    assert.equal(plan.impact, .62);
  }
});
