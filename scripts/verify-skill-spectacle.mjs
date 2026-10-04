import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { build, preview } from 'vite';
import sharp from 'sharp';
import { parse } from 'espree';
import { CHARACTER_SKILLS } from '../src/data/skills.js';
import { DISCOVERY_TECHNIQUES } from '../src/data/discoveries.js';
import { combatUnitIds, getCombatChoreography, getCombatTiming } from '../src/data/combatArt.js';
import { getCharacterArt } from '../src/data/characterArt.js';
import { getBossSpriteKey } from '../src/data/bossArt.js';
import { getChapterBossName } from '../src/data/chapterIdentity.js';
import { MONSTER_ENEMIES, applyStageMonsterAppearance } from '../src/data/monsterEnemies.js';
import { stages } from '../src/data/stages.js';
import { getEnemyAttackChoice } from '../src/engine/enemyAI.js';
import { getAttackRange } from '../src/engine/movement.js';
import { duelProps, renderDuel, seekDuel, assertBodies, assertFit } from './duel-fixture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.env.CHEONSU_SKILL_QA_OUT || path.join(root, 'tmp/skill-spectacle-qa'));
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const entries = [...Object.entries(CHARACTER_SKILLS).flatMap(([unit, skills]) => skills.map(skill => [unit, skill])),
  ...Object.values(DISCOVERY_TECHNIQUES).map(skill => [skill.unitId, skill])];
const heroSkills = entries.filter(([unit]) => unit === 'hero').map(([, skill]) => skill);
const enemyIds = combatUnitIds.filter(unit => !Object.hasOwn(CHARACTER_SKILLS, unit));
const limits = { additionalNodes: 150, additionalAnimations: 30 };
const errors = [], results = [];
const attachmentPixelsChecked = new Set();
const report = { passed: false, production: true, skills: entries.length, units: combatUnitIds.length, viewports, limits, errors, results };
let server, fixtureServer, browser;
await fs.mkdir(output, { recursive: true });
const weaponAnchors = JSON.parse(await fs.readFile(path.join(root, 'src/data/skillWeaponAnchors.json'), 'utf8'));
const enemyScenes = await collectEnemyScenes();
report.enemyProfiles = enemyIds.map(unit => ({ unit, ...enemyScenes[unit].provenance, actor: enemyScenes[unit].actor }));

async function collectEnemyScenes() {
  const source = await fs.readFile(path.join(root, 'src/App.jsx'), 'utf8');
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
  const declarations = tree.body.flatMap(node => node.type === 'VariableDeclaration' ? node.declarations : []);
  const variable = name => {
    const node = declarations.find(node => node.id?.name === name);
    assert.ok(node?.init, `${name}: 실제 게임 적 정의를 읽습니다`);
    return `const ${name} = ${source.slice(node.init.start, node.init.end)};`;
  };
  const declaration = name => {
    const node = tree.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
    assert.ok(node, `${name}: 실제 게임 적 분기를 읽습니다`);
    return source.slice(node.start, node.end);
  };
  const actual = runInNewContext([variable('ENEMY_VARIANT_KEYS'), variable('ENEMY_ARCHETYPE_TEMPLATES'), declaration('enemySquadUnit'),
    variable('STAGE_ENEMY_SQUADS'), declaration('getStageBossSpriteKey'), declaration('getEffectType'),
    '({ squads: STAGE_ENEMY_SQUADS, bossKey: getStageBossSpriteKey, effect: getEffectType })'].join('\n'));
  const squads = JSON.parse(JSON.stringify(actual.squads));
  const profiles = {};
  for (const unit of enemyIds) {
    let original, stage, sourceLabel;
    if (unit.startsWith('boss_')) {
      for (const candidate of stages) {
        const boss = candidate.units.find(actor => actor.type === 'boss');
        if (!boss) continue;
        const actor = { ...boss, name: getChapterBossName(candidate.id, boss.name), spriteKey: actual.bossKey(candidate, boss) };
        if (getBossSpriteKey(actor) === unit) { original = actor; stage = candidate.id; break; }
      }
      sourceLabel = 'stages + App.getStageBossSpriteKey + chapterIdentity + getBossSpriteKey';
    } else if (Object.hasOwn(MONSTER_ENEMIES, unit)) {
      stage = MONSTER_ENEMIES[unit].firstStage;
      original = squads[stage].map(actor => applyStageMonsterAppearance(actor, { id: stage })).find(actor => actor.artId === unit);
      sourceLabel = 'App.STAGE_ENEMY_SQUADS + applyStageMonsterAppearance';
    } else if (unit === 'wolf') {
      const candidate = stages.find(candidate => candidate.units.some(actor => actor.type === 'enemy' && /늑대|야수/.test(actor.name)));
      original = candidate?.units.find(actor => actor.type === 'enemy' && /늑대|야수/.test(actor.name));
      stage = candidate?.id;
      sourceLabel = 'stages 기존 늑대 전투 규칙';
    } else {
      for (const [stageId, actors] of Object.entries(squads)) {
        const actor = actors.find(actor => actor.spriteKey === unit);
        if (actor) { original = actor; stage = Number(stageId); break; }
      }
      sourceLabel = 'App.STAGE_ENEMY_SQUADS / ENEMY_ARCHETYPE_TEMPLATES';
    }
    assert.ok(original, `${unit}: 실제 적·보스 스킬 자료가 있습니다`);
    const actor = { ...structuredClone(original), id: original.id || `qa-${unit}`, type: unit.startsWith('boss_') ? 'boss' : 'enemy',
      maxHp: original.maxHp || original.hp, skillType: original.skillType || 'attack', x: 3, y: 3, status: [] };
    const target = { id: 'hero', name: '카일', type: 'ally', hp: 30, maxHp: 50,
      x: actor.x + getAttackRange(actor, 'skill').min, y: actor.y };
    const choice = getEnemyAttackChoice(actor, [target], Array.from({ length: 20 }, () => Array(20).fill('plain')));
    assert.equal(choice?.mode, 'skill', `${unit}: 실제 AI가 이 사거리에서 자신의 공격 스킬을 선택합니다`);
    profiles[unit] = { actor, target, effect: actual.effect, provenance: { stage, source: sourceLabel, aiType: actor.aiType, skill: actor.skill } };
  }
  return profiles;
}

function sceneProps(unit, skill, speed, scenario, mode = 'skill') {
  const profile = enemyScenes[unit];
  const props = duelProps(unit, skill, speed, { mode });
  if (profile) {
    props.scene.attacker = structuredClone(profile.actor);
    props.scene.defender = structuredClone(profile.target);
    props.scene.attackerPostHp = props.scene.attacker.hp;
    props.defenderKey = 'hero';
    props.scene.title = mode === 'skill' ? props.scene.attacker.skill : '일반 공격';
  }
  if (skill?.type === 'guard') { props.scene.outcome.damage = 0; props.scene.defenderPostHp = props.scene.defender.hp; }
  if (scenario === 'miss') { props.scene.outcome = { hit: false, damage: 0 }; props.scene.defenderPostHp = props.scene.defender.hp; }
  if (scenario === 'ally-guard') {
    props.defenderKey = 'hero';
    props.scene.defender = { id: 'hero', name: '카일', type: 'ally', hp: 30, maxHp: 50 };
    props.scene.defenderPostHp = 30;
  }
  if (profile) props.scene.effectType = profile.effect(props.scene, props.scene.outcome);
  props.scene.durationMs = 1820 * getCombatTiming(props.scene).durationScale / speed;
  return props;
}

function watch(page) {
  page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack }));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/art/')) errors.push({ message: `${response.status()} ${response.url()}` });
  });
}

async function openPage(fixtureBase, base, viewport) {
  const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
  watch(page);
  await page.route('**/art/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(fixtureBase, base) });
    await route.fulfill({ response });
  });
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    window.__skillAnimationCalls = [];
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      window.__skillAnimationCalls.push({ target: this, animation, additional: Boolean(this.closest('.skill-spectacle,.vfx-blade-aura,.vfx-weapon-aura')) });
      return animation;
    };
  });
  const time = new Date('2026-10-04T00:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.goto(`${fixtureBase}/tests/fixtures/combat.html`);
  return page;
}

async function metrics(page) {
  return page.evaluate(() => {
    const scene = document.querySelector('.painted-combat');
    const extraRoots = [...scene.querySelectorAll('.skill-spectacle,.vfx-blade-aura,.vfx-weapon-aura')]
      .filter(element => !element.parentElement.closest('.skill-spectacle,.vfx-blade-aura,.vfx-weapon-aura'));
    const animations = document.getAnimations().filter(animation => animation.effect?.target?.closest('.painted-combat'));
    const additional = animations.filter(animation => animation.effect.target.closest('.skill-spectacle,.vfx-blade-aura,.vfx-weapon-aura'));
    return { nodes: scene.querySelectorAll('*').length, additionalNodes: extraRoots.reduce((count, element) => count + 1 + element.querySelectorAll('*').length, 0),
      animations: animations.length, additionalAnimations: additional.length,
      runningAnimations: animations.filter(animation => animation.playState === 'running').length,
      animateCalls: window.__skillAnimationCalls.length, additionalAnimateCalls: window.__skillAnimationCalls.filter(call => call.additional).length,
      finite: additional.every(animation => Number.isFinite(animation.effect.getComputedTiming().endTime) && animation.effect.getTiming().iterations === 1) };
  });
}

function assertBudget(value, label) {
  assert.ok(value.additionalNodes <= limits.additionalNodes, `${label}: 추가 DOM ${value.additionalNodes} ≤ ${limits.additionalNodes}`);
  assert.ok(value.additionalAnimations <= limits.additionalAnimations, `${label}: 추가 애니메이션 풀 ${value.additionalAnimations} ≤ ${limits.additionalAnimations}`);
  assert.ok(value.finite, `${label}: 신규 애니메이션은 유한한 1회 재생입니다`);
}

async function phaseState(page) {
  return page.evaluate(() => {
    const arena = document.querySelector('.painted-combat-arena');
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const opacity = element => {
      let value = 1;
      for (let node = element; node && node !== arena; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return 0;
        value *= Number(style.opacity);
      }
      return value;
    };
    const read = selector => [...arena.querySelectorAll(selector)].map(element => ({ phase: element.dataset.vfxPhase,
      anchor: element.dataset.vfxAnchor, index: element.dataset.vfxIndex, pose: element.dataset.pose,
      opacity: opacity(element), bounds: rect(element), transform: getComputedStyle(element).transform }));
    const target = arena.querySelector('.fighter-defender') || arena.querySelector('.fighter-attacker');
    return { charge: read('.vfx-charge'), bursts: read('.vfx-burst'), blades: read('.vfx-blade-aura,.vfx-weapon-aura'),
      hits: read('.duel-hit'), arena: rect(arena), target: rect(target), attacker: rect(arena.querySelector('.fighter-attacker')),
      activePoses: [...arena.querySelectorAll('.fighter-attacker .fighter-frame')].filter(image => Number(getComputedStyle(image).opacity) > .5).map(image => image.dataset.pose) };
  });
}

function assertTarget(burst, state, label) {
  const x = (burst.bounds.x + burst.bounds.right) / 2, y = (burst.bounds.y + burst.bounds.bottom) / 2;
  assert.ok(x >= state.target.x - 2 && x <= state.target.right + 2 && y >= state.target.y - 2 && y <= state.target.bottom + 2,
    `${label}: 접촉 효과 중심 (${x},${y})이 실제 아군·적 대상에 닿습니다`);
  assert.ok(x >= state.arena.x - 2 && x <= state.arena.right + 2 && y >= state.arena.y - 2 && y <= state.arena.bottom + 2,
    `${label}: 접촉 효과 중심이 화면 안에 있습니다`);
}

async function attachmentFrames(page, label, unit, plan) {
  const skillPose = Object.entries(getCharacterArt(unit).motion).find(([, source]) => source === plan.skillPose.src)?.[0];
  const sourceAnchors = Object.fromEntries(['windup', 'strike', 'skill'].map(pose => [pose, weaponAnchors[unit]?.[pose === 'skill' ? skillPose : pose]]));
  const frames = await page.locator('.vfx-blade-aura,.vfx-weapon-aura').evaluateAll((elements, anchors) => elements.map(aura => {
    const frame = aura.parentElement.querySelector(`.fighter-frame[data-pose="${aura.dataset.pose}"]`);
    const style = getComputedStyle(aura), frameStyle = frame && getComputedStyle(frame);
    const point = attribute => (aura.getAttribute(attribute) || '').replace(/[\[\]]/g, '').trim().split(/[ ,]+/).filter(Boolean).map(Number);
    const matrix = aura.getScreenCTM();
    window.__weaponAlpha ||= {};
    let alpha = window.__weaponAlpha[frame?.src];
    if (!alpha) {
      const canvas = document.createElement('canvas');
      canvas.width = frame?.naturalWidth || 512; canvas.height = frame?.naturalHeight || 512;
      const context = canvas.getContext('2d');
      if (frame) context.drawImage(frame, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      alpha = { width: canvas.width, height: canvas.height, pixels: new Uint8Array(canvas.width * canvas.height) };
      for (let index = 0; index < alpha.pixels.length; index++) alpha.pixels[index] = pixels[index * 4 + 3];
      window.__weaponAlpha[frame?.src] = alpha;
    }
    const onArtwork = source => {
      let onArtwork = false;
      if (source.length === 2) for (let y = Math.max(0, Math.floor(source[1] - 8)); y <= Math.min(alpha.height - 1, source[1] + 8); y++) {
        for (let x = Math.max(0, Math.floor(source[0] - 8)); x <= Math.min(alpha.width - 1, source[0] + 8); x++) {
          if (alpha.pixels[y * alpha.width + x] > 64) onArtwork = true;
        }
      }
      return onArtwork;
    };
    const points = ['data-grip', 'data-tip'].map(attribute => {
      const source = point(attribute);
      const screen = source.length === 2 && source.every(Number.isFinite) && matrix ? new DOMPoint(...source).matrixTransform(matrix) : null;
      return { attribute, source, onArtwork: onArtwork(source), screen: screen ? { x: screen.x, y: screen.y } : null };
    });
    const anchor = anchors[aura.dataset.pose];
    let bowCurve;
    if (anchor?.bow?.path) {
      const path = [...aura.querySelectorAll('path')].find(element => element.getAttribute('d') === anchor.bow.path);
      const length = path?.getTotalLength();
      const samples = path ? Array.from({ length: 9 }, (_, index) => {
        const point = path.getPointAtLength(length * index / 8), source = [point.x, point.y];
        return { at: index / 8, source, onArtwork: onArtwork(source) };
      }) : [];
      const arrowPath = `M${anchor.focus.join(' ')}L${anchor.tip.join(' ')}`;
      bowCurve = { path: path?.getAttribute('d'), length, samples, focus: point('data-focus'),
        arrowPathPresent: [...aura.querySelectorAll('path')].some(element => element.getAttribute('d') === arrowPath),
        arrowTipPresent: [...aura.querySelectorAll('path')].some(element => element.getAttribute('transform')?.startsWith(`translate(${anchor.tip.join(' ')})`)) };
    }
    return { pose: aura.dataset.pose, kind: aura.dataset.kind || aura.dataset.vfxKind || (aura.classList.contains('vfx-blade-aura') ? 'blade' : null), attached: aura.parentElement.classList.contains('fighter-poses'),
      viewBox: aura.getAttribute('viewBox'), width: aura.clientWidth, height: aura.clientHeight,
      frameWidth: frame?.clientWidth, frameHeight: frame?.clientHeight, transform: style.transform, frameTransform: frameStyle?.transform,
      scale: style.getPropertyValue('--combat-sprite-scale'), frameScale: frameStyle?.getPropertyValue('--combat-sprite-scale'),
      footOffset: style.getPropertyValue('--combat-foot-offset'), frameFootOffset: frameStyle?.getPropertyValue('--combat-foot-offset'), points, bowCurve };
  }), sourceAnchors);
  for (const frame of frames) {
    const anchor = weaponAnchors[unit]?.[frame.pose === 'skill' ? skillPose : frame.pose];
    assert.ok(anchor, `${label}: 실제 원화 자세 ${frame.pose}의 부착 자료가 있습니다`);
    assert.equal(frame.kind, anchor.kind, `${label}: 실제 무기 종류를 표시합니다`);
    assert.deepEqual(frame.points[0].source, anchor.grip, `${label}: 조사한 손잡이 좌표를 사용합니다`);
    assert.deepEqual(frame.points[1].source, anchor.tip, `${label}: 조사한 무기 끝 좌표를 사용합니다`);
    assert.ok(frame.attached && ['windup', 'strike', 'skill'].includes(frame.pose), `${label}: 무기 이펙트는 해당 자세의 fighter-poses에 부착됩니다`);
    assert.equal(frame.viewBox.replace(/\s+/g, ' ').trim(), '0 0 512 512', `${label}: 무기와 그림이 같은 512 좌표계를 사용합니다`);
    assert.equal(frame.width, frame.frameWidth, `${label}: 무기 이펙트와 그림 폭이 같습니다`);
    assert.equal(frame.height, frame.frameHeight, `${label}: 무기 이펙트와 그림 높이가 같습니다`);
    assert.equal(frame.transform, frame.frameTransform, `${label}: 무기 이펙트가 그림의 확대·발 위치를 따릅니다`);
    assert.equal(frame.scale, frame.frameScale, `${label}: 확대율 보존`);
    assert.equal(frame.footOffset, frame.frameFootOffset, `${label}: 발 위치 보존`);
    assert.ok(frame.points.every(point => point.source.length === 2 && point.source.every(value => Number.isFinite(value) && value >= 0 && value <= 512) && point.screen && Number.isFinite(point.screen.x) && Number.isFinite(point.screen.y) && point.onArtwork), `${label}: 실제 원화 위에 유한한 손잡이·무기 끝 좌표가 있습니다`);
    assert.ok(Math.hypot(...frame.points[0].source.map((value, index) => value - frame.points[1].source[index])) > (unit === 'hero' ? 15 : 1), `${label}: 손잡이와 무기 끝이 구분됩니다`);
    if (unit === 'lina') assert.ok(anchor.bow?.path, `${label}: 리나의 실제 활 곡선 자료가 있습니다`);
    if (anchor.bow?.path) {
      assert.equal(frame.bowCurve?.path, anchor.bow.path, `${label}: 실측 활 곡선을 SVG에 표시합니다`);
      assert.ok(Number.isFinite(frame.bowCurve.length) && frame.bowCurve.length > 15, `${label}: 활 곡선은 길이가 있는 선입니다`);
      assert.ok(frame.bowCurve.samples.length === 9 && frame.bowCurve.samples.every(sample => sample.onArtwork), `${label}: 실제 활 곡선 9개 지점이 512 원화 위에 놓입니다 (${JSON.stringify(frame.bowCurve.samples)})`);
      assert.deepEqual(frame.bowCurve.focus, anchor.focus, `${label}: 실제 화살 시작 위치 보존`);
      if (anchor.bow.arrowVisible === false) {
        assert.ok(!frame.bowCurve.arrowPathPresent && !frame.bowCurve.arrowTipPresent, `${label}: 화살을 꺼내는 준비 자세에 장전·발사 화살을 만들지 않습니다`);
      } else {
        assert.ok(Math.hypot(...anchor.focus.map((value, index) => value - anchor.tip[index])) > 15 && frame.bowCurve.arrowPathPresent && frame.bowCurve.arrowTipPresent, `${label}: 화살 시작과 끝이 구분되고 방출 선·촉빛이 표시됩니다`);
      }
    }
  }
  return frames;
}

async function healthTiming(page, props, plan, label) {
  const self = props.scene.attacker.id === props.scene.defender.id;
  const before = self ? props.scene.attacker.hp : props.scene.defender.hp;
  const after = props.scene.defenderPostHp;
  const health = page.locator('.combat-health').last();
  assert.match(await health.innerText(), new RegExp(`${before} \\/ ${props.scene.defender.maxHp}`), `${label}: 연출 탐색은 피해·회복을 미리 적용하지 않습니다`);
  await page.clock.runFor(props.scene.durationMs * (plan.impact - .02) - 20);
  assert.match(await health.innerText(), new RegExp(`${before} \\/ ${props.scene.defender.maxHp}`), `${label}: 실제 접촉 전 HP 보존`);
  await page.clock.runFor(props.scene.durationMs * .04 + 2);
  assert.match(await health.innerText(), new RegExp(`${after} \\/ ${props.scene.defender.maxHp}`), `${label}: 실제 접촉 때 피해·회복 정산`);
}

async function pixelDifference(page, label, selector = '.skill-spectacle,.vfx-blade-aura,.vfx-weapon-aura', minimum = 100) {
  const arena = page.locator('.painted-combat-arena');
  const visible = await arena.screenshot();
  await page.locator(selector).evaluateAll(elements => elements.forEach(element => {
    element.__qaDisplay = [element.style.getPropertyValue('display'), element.style.getPropertyPriority('display')];
    element.style.setProperty('display', 'none', 'important');
  }));
  const hidden = await arena.screenshot();
  await page.locator(selector).evaluateAll(elements => elements.forEach(element => {
    const [value, priority] = element.__qaDisplay;
    if (value) element.style.setProperty('display', value, priority); else element.style.removeProperty('display');
    delete element.__qaDisplay;
  }));
  const a = await sharp(visible).ensureAlpha().raw().toBuffer(), b = await sharp(hidden).ensureAlpha().raw().toBuffer();
  let changedPixels = 0;
  for (let index = 0; index < a.length; index += 4) if ([0, 1, 2].some(channel => Math.abs(a[index + channel] - b[index + channel]) > 25)) changedPixels++;
  assert.ok(changedPixels > minimum, `${label}: 새 이펙트가 실제 화면 픽셀에 표시됩니다 (${changedPixels})`);
  return changedPixels;
}

async function sceneCase(page, viewport, unit, skill, speed = 1, scenario = 'hit') {
  const props = sceneProps(unit, skill, speed, scenario);
  const plan = getCombatChoreography(unit, props.scene), spectacle = plan.spectacle;
  const skillId = skill?.id || plan.id.slice(plan.id.indexOf(':') + 1), skillName = skill?.name || props.scene.title;
  const label = `${unit}:${skillId}/${scenario}/${speed}/${viewport.width}`;
  assert.ok(spectacle && plan.skillPose, `${label}: 실제 기술 자세와 신규 연출이 있습니다`);
  assert.equal(spectacle.weapon?.unit, unit, `${label}: 캐릭터의 무기에 속성 효과를 부착합니다`);
  if (skill && skill.type !== 'attack') assert.equal(props.scene.defender.type, 'ally', `${label}: 회복·수호는 아군 대상입니다`);
  await page.evaluate(() => { window.__skillAnimationCalls = []; });
  await renderDuel(page, props);
  await assertFit(page, viewport, label);
  assert.equal(await page.locator('.skill-spectacle').getAttribute('data-skill-theme'), spectacle.theme, `${label}: 기술 속성을 표시합니다`);
  assert.equal(await page.locator('.fighter-skill').getAttribute('src'), plan.skillPose.src, `${label}: 현재 캐릭터의 기술 그림을 로드합니다`);
  assert.equal(await page.locator('.painted-combat-heading h2').innerText(), skillName, `${label}: 한국어 기술명 유지`);
  assert.equal(await page.locator('.vfx-charge').count(), 1, `${label}: 준비 효과 하나`);
  assert.equal(await page.locator('.vfx-burst').count(), spectacle.bursts.length, `${label}: 접촉 단계 렌더링`);
  const budget = await metrics(page); assertBudget(budget, label);
  const frames = await attachmentFrames(page, label, unit, plan);
  assert.equal(frames.length, 3, `${label}: 준비·일반 타격·기술 무기 부착`);
  if (unit === 'hero') assert.ok(spectacle.sword, `${label}: 기존 주인공 검 효과 유지`);
  const chargeAt = (spectacle.charge.at + spectacle.charge.until) / 2;
  const samples = [...new Set([.01, .12, chargeAt, ...plan.poses.filter(([, pose]) => ['windup', 'skill'].includes(pose)).map(([at]) => Math.min(at + .015, .99)),
    ...plan.releases.map(at => at + .01), ...spectacle.bursts.map(burst => burst.at + Math.min(.02, (burst.until - burst.at) * .2)), .98, 1])].sort((a, b) => a - b);
  let firstAttachmentAt;
  const phases = [];
  for (const at of samples) {
    await seekDuel(page, at, props.scene.durationMs); await assertBodies(page, `${label}/${at}`);
    const state = await phaseState(page);
    if (at === .01) assert.ok(state.bursts.every(burst => burst.opacity === 0), `${label}: 준비 전 접촉 폭발이 없습니다`);
    if (at === chargeAt) {
      assert.ok(state.charge[0].opacity > .05 && state.charge[0].anchor === 'attacker' && state.charge[0].phase === 'charge', `${label}: 시전자에서 준비 효과를 표시합니다`);
      assertTarget(state.charge[0], { ...state, target: state.attacker }, `${label}: 준비`);
    }
    if (scenario === 'miss') assert.ok(state.bursts.every(burst => burst.opacity === 0) && state.hits.every(hit => hit.opacity === 0), `${label}: 빗나간 대상에 폭발·타격을 표시하지 않습니다`);
    else for (const [index, burst] of spectacle.bursts.entries()) {
      if (Math.abs(at - burst.at - Math.min(.02, (burst.until - burst.at) * .2)) > .0001) continue;
      const shown = state.bursts.find(value => Number(value.index) === index);
      assert.ok(shown?.opacity > .05 && shown.phase === 'contact' && shown.anchor === 'target', `${label}: 접촉 ${index + 1}의 타깃 폭발`);
      assertTarget(shown, state, label);
    }
    const blades = state.blades.filter(blade => blade.opacity > .05);
    if (blades.length) {
      firstAttachmentAt ??= at;
      assert.equal(blades.length, 1, `${label}: 현재 자세의 무기 이펙트 하나만 표시됩니다`);
      assert.equal(blades[0].pose, state.activePoses[0], `${label}: 무기 이펙트와 실제 자세가 일치합니다`);
      assert.equal(blades[0].phase, 'weapon', `${label}: 무기 부착 단계`);
      assert.equal(blades[0].anchor, 'weapon', `${label}: 시전자 무기에 붙인 효과`);
    }
    if (at === 1) assert.ok([...state.charge, ...state.bursts, ...state.blades].every(effect => effect.opacity < .01), `${label}: 잔광이 끝나고 사라집니다`);
    if (unit === 'hero' && speed === 1 && scenario === 'hit' && (at === chargeAt || at === plan.releases[0] + .01 || at === spectacle.bursts.at(-1).at + Math.min(.02, (spectacle.bursts.at(-1).until - spectacle.bursts.at(-1).at) * .2) || at === 1)) {
      const stage = at === chargeAt ? 'prepare' : at === 1 ? 'clear' : at === plan.releases[0] + .01 ? 'weapon' : 'contact';
      await page.screenshot({ path: path.join(output, `hero-${skillId}-${stage}-${viewport.width}.png`) });
    }
    const anchors = blades.length ? (await attachmentFrames(page, label, unit, plan)).filter(frame => blades.some(blade => blade.pose === frame.pose)).map(frame => ({ pose: frame.pose, kind: frame.kind, points: frame.points })) : [];
    for (const anchor of anchors) for (const point of anchor.points) {
      assert.ok(point.screen.x >= state.arena.x - 2 && point.screen.x <= state.arena.right + 2 && point.screen.y >= state.arena.y - 2 && point.screen.y <= state.arena.bottom + 2,
        `${label}: 동작 중 실제 무기 ${point.attribute}가 화면 안에 있습니다 (${JSON.stringify(point.screen)})`);
    }
    phases.push({ at, charge: state.charge.map(effect => effect.opacity), bursts: state.bursts.map(effect => effect.opacity), blades: blades.map(effect => effect.pose), anchors });
  }
  assert.ok(firstAttachmentAt != null, `${label}: 실제 무기 부착 효과를 표시합니다`);
  let changedPixels, attachmentChangedPixels;
  const pixelKey = `${viewport.width}/${unit}`;
  if (scenario === 'hit' && speed === 1 && !attachmentPixelsChecked.has(pixelKey)) {
    await seekDuel(page, firstAttachmentAt, props.scene.durationMs);
    attachmentChangedPixels = await pixelDifference(page, label, '.vfx-blade-aura,.vfx-weapon-aura', 20);
    await page.screenshot({ path: path.join(output, `weapon-${unit}-${viewport.width}.png`) });
    attachmentPixelsChecked.add(pixelKey);
  }
  if (unit === 'hero' && speed === 1 && scenario === 'hit') {
    await seekDuel(page, spectacle.bursts.at(-1).at + .02, props.scene.durationMs);
    changedPixels = await pixelDifference(page, label);
  }
  await healthTiming(page, props, plan, label);
  results.push({ type: 'skill-scene', viewport, unit, skill: skillId, name: skillName, enemy: Boolean(enemyScenes[unit]), scenario, speed, theme: spectacle.theme, budget, frames, phases, changedPixels, attachmentChangedPixels });
}

async function basicCase(page, viewport, unit) {
  const props = sceneProps(unit, null, 1, 'hit', 'attack');
  const plan = getCombatChoreography(unit, props.scene);
  const label = `${unit}/일반 공격/${viewport.width}`;
  assert.equal(plan.spectacle, null, `${label}: 일반 공격의 기존 연출 계약을 보존합니다`);
  await page.evaluate(() => { window.__skillAnimationCalls = []; });
  await renderDuel(page, props);
  await assertFit(page, viewport, label);
  for (const at of [.01, ...plan.releases.map(at => at + .01), plan.impact + .02, 1]) {
    await seekDuel(page, at, props.scene.durationMs);
    await assertBodies(page, label);
  }
  assert.equal(await page.locator('.skill-spectacle,.vfx-blade-aura,.vfx-weapon-aura').count(), 0, `${label}: 일반 공격에 새 스킬 이펙트가 없습니다`);
  const budget = await metrics(page);
  assert.equal(budget.additionalNodes, 0, `${label}: 추가 효과 DOM 없음`);
  assert.equal(budget.additionalAnimations, 0, `${label}: 추가 효과 애니메이션 없음`);
  await healthTiming(page, props, plan, label);
  results.push({ type: 'basic-attack', viewport, unit, enemy: Boolean(enemyScenes[unit]), budget });
}

async function settingsCases(page, viewport) {
  const skill = CHARACTER_SKILLS.hero[0];
  for (const effectsEnabled of [true, false]) for (const reduced of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const props = { ...duelProps('hero', skill), effectsEnabled };
    const plan = getCombatChoreography('hero', props.scene);
    await page.evaluate(() => { window.__skillAnimationCalls = []; });
    await renderDuel(page, props);
    await seekDuel(page, plan.impact + .02, props.scene.durationMs);
    await assertBodies(page, `설정/${effectsEnabled}/${reduced}`);
    const state = await phaseState(page), budget = await metrics(page);
    assertBudget(budget, '설정');
    if (!effectsEnabled || reduced) {
      assert.ok([...state.charge, ...state.bursts, ...state.blades].every(effect => effect.opacity === 0), '효과 끄기·모션 줄이기는 신규 효과를 숨깁니다');
      assert.equal(budget.additionalAnimations, 0, '효과 끄기·모션 줄이기에 신규 WAA 없음');
      assert.deepEqual(state.activePoses, ['ready'], '정지 자세 하나를 표시합니다');
    } else assert.ok(state.bursts.some(effect => effect.opacity > .05) && budget.additionalAnimations > 0, '효과 켜기에서 신규 효과 재생');
    await healthTiming(page, props, plan, '설정');
    results.push({ type: 'effects-settings', viewport, effectsEnabled, reduced, budget });
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const props = duelProps('hero', skill);
  await renderDuel(page, props);
  for (const reduced of [true, false, true, false]) {
    await page.evaluate(expected => {
      const media = matchMedia('(prefers-reduced-motion: reduce)');
      window.__skillMediaChanged = new Promise(resolve => {
        if (media.matches === expected) { resolve(); return; }
        const changed = event => {
          if (event.matches !== expected) return;
          media.removeEventListener('change', changed); resolve();
        };
        media.addEventListener('change', changed);
      });
    }, reduced);
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.clock.runFor(32);
    // Emulation updates matches immediately, but Chromium dispatches change on its next render frame.
    let timeout;
    try {
      await Promise.race([page.evaluate(() => window.__skillMediaChanged), new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('모션 설정 change 이벤트가 3초 안에 도착하지 않았습니다')), 3000);
      })]);
    } finally { clearTimeout(timeout); }
    const value = await metrics(page); assertBudget(value, '진행 중 모션 설정 전환');
    assert.equal(value.additionalAnimations > 0, !reduced, '진행 중 모션 설정에 따라 WAA 풀을 해제·재생합니다');
    results.push({ type: 'settings-transition', viewport, setting: 'reducedMotion', value: reduced, budget: value });
  }
  for (const enabled of [false, true, false, true]) {
    await page.evaluate(enabled => window.renderDuelFixture({ ...window.__skillFixtureProps, effectsEnabled: enabled }), enabled);
    await page.clock.runFor(20);
    const value = await metrics(page); assertBudget(value, '진행 중 효과 설정 전환');
    assert.equal(value.additionalAnimations > 0, enabled, '진행 중 효과 설정에 따라 WAA 풀을 해제·재생합니다');
    await assertBodies(page, '진행 중 효과 설정 전환');
    results.push({ type: 'settings-transition', viewport, setting: 'effectsEnabled', value: enabled, budget: value });
  }
}

async function lifecycleCases(page, viewport) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (let index = 0; index < 20; index++) {
    const props = index % 2 ? duelProps('hero', heroSkills[index % heroSkills.length]) : duelProps('teo', CHARACTER_SKILLS.teo[0]);
    await page.evaluate(() => { window.__skillAnimationCalls = []; });
    await renderDuel(page, props);
    await seekDuel(page, .4, props.scene.durationMs);
    const before = await metrics(page); assertBudget(before, `화면 전환 ${index}`);
    const resized = viewport.width === 1280 ? { width: viewport.width - 12, height: viewport.height } : { width: viewport.height, height: viewport.width };
    await page.setViewportSize(resized); await page.clock.runFor(32);
    await assertFit(page, resized, '화면 회전'); await assertBodies(page, '화면 회전');
    const after = await metrics(page); assertBudget(after, `화면 회전 ${index}`);
    assert.equal(after.additionalAnimations, before.additionalAnimations, '회전은 취소한 풀을 대체하고 중복 생성하지 않습니다');
    await page.setViewportSize(viewport); await page.clock.runFor(32);
    await page.evaluate(() => window.renderDuelFixture(null));
    await page.clock.runFor(20);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0, '장면 해제 후 CSS·WAA 애니메이션 0');
    assert.ok(await page.evaluate(() => window.__skillAnimationCalls.every(call => call.animation.playState === 'idle')), '분리된 DOM에 걸린 WAA도 모두 취소합니다');
    assert.equal(await page.locator('.skill-spectacle,.vfx-blade-aura,.vfx-weapon-aura').count(), 0, '장면 해제 후 신규 효과 DOM 0');
    results.push({ type: 'resize-unmount', viewport, index, before, after });
  }
}

try {
  server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  report.build = await (await fetch(`${base}/ota-build.json`)).json();
  const fixturePath = path.join(root, 'tests/fixtures/combat.jsx');
  const fixtureOut = path.join(output, 'production-fixture');
  await build({ root, configFile: false, logLevel: 'error', plugins: [{
    name: 'skill-qa-render-control', enforce: 'pre', transform(source, id) {
      if (id !== fixturePath) return;
      const index = source.indexOf('createRoot(document.getElementById(');
      assert.ok(index > 0, '생산 전투 fixture 진입점');
      return `${source.slice(0, index)}\nimport { flushSync } from 'react-dom';\nconst root = createRoot(document.getElementById('root'));\nwindow.renderDuelFixture = props => { window.__skillFixtureProps = props; flushSync(() => root.render(props ? React.createElement(CombatScene, props) : null)); };\n`;
    },
  }, react()], build: { outDir: fixtureOut, emptyOutDir: true, copyPublicDir: false, rollupOptions: { input: path.join(root, 'tests/fixtures/combat.html') } } });
  fixtureServer = await preview({ root, configFile: false, build: { outDir: fixtureOut }, preview: { host: '127.0.0.1', port: 0, open: false } });
  const fixtureBase = `http://127.0.0.1:${fixtureServer.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHEONSU_QA_BROWSER ? { channel: process.env.CHEONSU_QA_BROWSER } : {}) });
  for (const viewport of viewports) {
    const page = await openPage(fixtureBase, base, viewport);
    try {
      for (const unit of combatUnitIds) await basicCase(page, viewport, unit);
      for (const [unit, skill] of entries) await sceneCase(page, viewport, unit, skill);
      for (const skill of heroSkills) for (const speed of [1, 2, 3]) {
        if (speed !== 1) await sceneCase(page, viewport, 'hero', skill, speed);
        if (skill.type === 'attack') await sceneCase(page, viewport, 'hero', skill, speed, 'miss');
      }
      for (const [unit, skill] of entries.filter(([unit, skill]) => unit !== 'hero' && skill.type === 'attack')) await sceneCase(page, viewport, unit, skill, 1, 'miss');
      for (const unit of enemyIds) {
        await sceneCase(page, viewport, unit, null);
        await sceneCase(page, viewport, unit, null, 1, 'miss');
      }
      for (const [unit, skill] of entries.filter(([, skill]) => skill.type === 'guard' && skill.radius > 0)) await sceneCase(page, viewport, unit, skill, 1, 'ally-guard');
      for (const unit of combatUnitIds) assert.ok(attachmentPixelsChecked.has(`${viewport.width}/${unit}`), `${unit}/${viewport.width}: 실제 무기 이펙트 픽셀 검사 완료`);
      await settingsCases(page, viewport);
      await lifecycleCases(page, viewport);
      console.log(`PASS 전체 캐릭터 스킬 VFX ${viewport.width}x${viewport.height}: 일반 공격 ${combatUnitIds.length}종, 아군 ${entries.length}기술, 적·보스 ${enemyIds.length}종 명중·빗나감, 실제 무기 부착 ${combatUnitIds.length}종, 주인공3배속·아군 수호·설정4조합·회전해제20회`);
    } catch (error) {
      await page.screenshot({ path: path.join(output, `failure-${viewport.width}.png`) }).catch(() => {});
      throw error;
    } finally { await page.close(); }
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  }
  assert.deepEqual(errors, [], '신규 스킬 VFX에서 페이지 오류·누락 아트가 없습니다');
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  report.counts = Object.fromEntries([...new Set(results.map(result => result.type))].map(type => [type, results.filter(result => result.type === type).length]));
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await fixtureServer?.close();
  await server?.close();
}
