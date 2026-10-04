import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import manifest from '../public/art/characters-v2/manifest.json' with { type: 'json' };
import { getCharacterArt, getCharacterFrameStyle, getCharacterSkillPose } from '../src/data/characterArt.js';
import { combatUnitIds, combatMotionPoses, getCombatSprite, getCombatMotionSprite, getCombatChoreography, getCombatPresentation } from '../src/data/combatArt.js';
import { CHARACTER_SKILLS } from '../src/data/skills.js';
import { DISCOVERY_TECHNIQUES } from '../src/data/discoveries.js';
import { getPaintedVisualProfile } from '../src/data/unitVisuals.js';
import { storySpeakerKeys, getStoryPortrait } from '../src/data/storyArt.js';
import { bossCombatIds, getBossSplash } from '../src/data/bossArt.js';
import { getEnemyIllustration } from '../src/data/enemyIllustrations.js';
import { MONSTER_ENEMIES } from '../src/data/monsterEnemies.js';

const poses = [...combatMotionPoses, 'skill-a', 'skill-b'];
const idleBaseline = JSON.parse(await fs.readFile(new URL('../docs/art/characters-v2/idle-baseline.json', import.meta.url), 'utf8'));
const assertNewAsset = asset => assert.match(asset, /^\/art\/characters-v2\//, 'active combat/dialogue must use the new artwork');
const publicFile = asset => new URL(`../public${asset}`, import.meta.url);

test('82 original idle/rear images and four catalogues retain their baseline after only six approved additions', async () => {
  assert.equal(Object.keys(idleBaseline.files).length, 86);
  assert.equal(Object.keys(idleBaseline.files).filter(file => file.endsWith('.webp')).length, 82);
  assert.match(idleBaseline.commit, /^[a-f0-9]{40}$/);
  const approved = Object.keys(MONSTER_ENEMIES);
  assert.equal(approved.length, 6);
  for (const [file, expected] of Object.entries(idleBaseline.files)) {
    assert.match(file, /^public\/art\/(map-sprites-v4|directions-v1)\//);
    let bytes = await fs.readFile(new URL(`../${file}`, import.meta.url));
    // Catalogue registration is additive; remove only the six approved entries before
    // checking the unchanged original hash. Image bytes are never normalized.
    if (file.endsWith('/manifest.json')) {
      const catalogue = JSON.parse(bytes.toString('utf8'));
      for (const id of approved) {
        assert.ok(Object.hasOwn(catalogue, id), `${file}: approved new entry ${id}`);
        delete catalogue[id];
      }
      bytes = JSON.stringify(catalogue, null, 2) + '\n';
    } else if (file.endsWith('/precache.js')) {
      const assignment = bytes.toString('utf8').match(/^(self\.\w+ = )(\[.*\]);\s*$/s);
      assert.ok(assignment, `${file}: the original catalogue assignment format`);
      const files = JSON.parse(assignment[2]);
      const suffix = file.includes('/directions-v1/') ? '-back.webp' : '.webp';
      const additions = new Set(approved.map(id => `/art/${file.includes('/directions-v1/') ? 'directions-v1' : 'map-sprites-v4'}/${id}${suffix}`));
      assert.equal(files.filter(path => additions.has(path)).length, 6, `${file}: exactly six approved additions`);
      bytes = assignment[1] + JSON.stringify(files.filter(path => !additions.has(path))) + ';\n';
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `${file}: existing images and catalogue entries must stay unchanged`);
  }
});

test('new character catalogue covers all 17 companions, 25 enemies and 5 bosses', () => {
  assert.deepEqual(Object.keys(manifest.units).sort(), [...combatUnitIds].sort());
  assert.equal(Object.keys(CHARACTER_SKILLS).length, 17);
  assert.equal(combatUnitIds.filter(id => !Object.hasOwn(CHARACTER_SKILLS, id) && !bossCombatIds.includes(id)).length, 25);
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
      map: art.map || `/art/map-sprites-v4/${id}.webp`, battle: art.motion.recover,
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

test('six approved enemy identities keep their authored weapons, skill contact and saved combat archetypes', () => {
  const identities = [
    ['kobold-hunter', 'ranger', 'arrow', 'ranged', 'bow', 'kneel-snipe'],
    ['lizard-spearman', 'iron_lancer', 'thrust', 'melee', 'thrust', 'long-thrust'],
    ['horned-ogre', 'raider', 'heavy', 'melee', 'heavy', 'axe-slam'],
    ['harpy-scout', 'wolf', 'claw', 'melee', 'beast', 'assassin-leap'],
    ['skeleton-warrior', 'raider', 'heavy', 'melee', 'heavy', 'axe-slam'],
    ['rock-spirit', 'sentinel', 'impact', 'melee', 'fist', 'fist-combo'],
  ];
  for (const [id, spriteKey, effect, style, weapon, skillMotion] of identities) {
    const art = getCharacterArt(id);
    assert.ok(art, id);
    assert.equal(art.map, `/art/map-sprites-v4/${id}.webp`, `${id}: explicit new map identity`);
    const actor = { id: 'saved-enemy', type: 'enemy', spriteKey, artId: id,
      hp: 13, maxHp: 29, atk: 11, def: 4, move: 2, range: 3,
      skill: '기존 기술', skillBonus: 3, skillRange: 3, acted: true, facing: 'up-left' };
    const saved = structuredClone(actor);
    const basicScene = { mode: 'attack', attacker: actor, outcome: { hit: true } };
    const presentation = getCombatPresentation(id, basicScene);
    assert.equal(presentation.effect, effect, `${id}: weapon effect`);
    assert.equal(presentation.style, style, `${id}: ranged versus physical motion`);
    const basic = getCombatChoreography(id, basicScene);
    assert.equal(basic.weapon, weapon);
    assert.equal(basic.skillPose, null);
    assert.equal(basic.impact, .5);
    const skill = getCombatChoreography(id, { ...basicScene, mode: 'skill' });
    assert.equal(skill.motion, skillMotion, `${id}: attack matches the authored anatomy and weapon`);
    assert.equal(skill.skillPose.src, art.motion['skill-a']);
    assert.equal(skill.contacts.at(-1), .62);
    assert.ok(skill.effects.some(effect => effect.at <= .62 && effect.until >= .62), `${id}: impact VFX reaches actual contact`);
    if (style === 'ranged') {
      assert.equal(basic.moving, false, 'crossbow shot holds position');
      assert.ok(basic.effects.some(effect => effect.shape === 'arrow'));
      assert.ok(skill.effects.some(effect => effect.shape === 'arrow'));
    }
    assert.deepEqual(actor, saved, `${id}: art selection never changes original stats, skills or progress`);
  }
});

test('all 376 new combat frames have genuine alpha, complete silhouettes and measured anchors', async () => {
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
