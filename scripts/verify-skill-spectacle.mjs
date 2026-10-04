import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { build, preview } from 'vite';
import sharp from 'sharp';
import { CHARACTER_SKILLS } from '../src/data/skills.js';
import { DISCOVERY_TECHNIQUES } from '../src/data/discoveries.js';
import { getCombatChoreography } from '../src/data/combatArt.js';
import { duelProps, renderDuel, seekDuel, assertBodies, assertFit } from './duel-fixture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.env.CHEONSU_SKILL_QA_OUT || path.join(root, 'tmp/skill-spectacle-qa'));
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const entries = [...Object.entries(CHARACTER_SKILLS).flatMap(([unit, skills]) => skills.map(skill => [unit, skill])),
  ...Object.values(DISCOVERY_TECHNIQUES).map(skill => [skill.unitId, skill])];
const heroSkills = entries.filter(([unit]) => unit === 'hero').map(([, skill]) => skill);
const limits = { additionalNodes: 150, additionalAnimations: 30 };
const errors = [], results = [];
const report = { passed: false, production: true, skills: entries.length, viewports, limits, errors, results };
let server, fixtureServer, browser;
await fs.mkdir(output, { recursive: true });

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
      window.__skillAnimationCalls.push({ target: this, animation, additional: Boolean(this.closest('.skill-spectacle,.vfx-blade-aura')) });
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
    const extraRoots = [...scene.querySelectorAll('.skill-spectacle,.vfx-blade-aura')]
      .filter(element => !element.parentElement.closest('.skill-spectacle,.vfx-blade-aura'));
    const animations = document.getAnimations().filter(animation => animation.effect?.target?.closest('.painted-combat'));
    const additional = animations.filter(animation => animation.effect.target.closest('.skill-spectacle,.vfx-blade-aura'));
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
    return { charge: read('.vfx-charge'), bursts: read('.vfx-burst'), blades: read('.vfx-blade-aura'),
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

async function bladeFrames(page, label) {
  const frames = await page.locator('.vfx-blade-aura').evaluateAll(elements => elements.map(aura => {
    const frame = aura.parentElement.querySelector(`.fighter-frame[data-pose="${aura.dataset.pose}"]`);
    const style = getComputedStyle(aura), frameStyle = frame && getComputedStyle(frame);
    const point = attribute => (aura.getAttribute(attribute) || '').replace(/[\[\]]/g, '').trim().split(/[ ,]+/).filter(Boolean).map(Number);
    const matrix = aura.getScreenCTM();
    const canvas = document.createElement('canvas');
    canvas.width = frame?.naturalWidth || 512; canvas.height = frame?.naturalHeight || 512;
    const context = canvas.getContext('2d');
    if (frame) context.drawImage(frame, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const points = ['data-grip', 'data-tip'].map(attribute => {
      const source = point(attribute);
      const screen = source.length === 2 && source.every(Number.isFinite) && matrix ? new DOMPoint(...source).matrixTransform(matrix) : null;
      let onArtwork = false;
      if (source.length === 2) for (let y = Math.max(0, Math.floor(source[1] - 8)); y <= Math.min(canvas.height - 1, source[1] + 8); y++) {
        for (let x = Math.max(0, Math.floor(source[0] - 8)); x <= Math.min(canvas.width - 1, source[0] + 8); x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 64) onArtwork = true;
        }
      }
      return { attribute, source, onArtwork, screen: screen ? { x: screen.x, y: screen.y } : null };
    });
    return { pose: aura.dataset.pose, attached: aura.parentElement.classList.contains('fighter-poses'),
      viewBox: aura.getAttribute('viewBox'), width: aura.clientWidth, height: aura.clientHeight,
      frameWidth: frame?.clientWidth, frameHeight: frame?.clientHeight, transform: style.transform, frameTransform: frameStyle?.transform,
      scale: style.getPropertyValue('--combat-sprite-scale'), frameScale: frameStyle?.getPropertyValue('--combat-sprite-scale'),
      footOffset: style.getPropertyValue('--combat-foot-offset'), frameFootOffset: frameStyle?.getPropertyValue('--combat-foot-offset'), points };
  }));
  for (const frame of frames) {
    assert.ok(frame.attached && ['windup', 'strike', 'skill'].includes(frame.pose), `${label}: 검 이펙트는 해당 자세의 fighter-poses에 부착됩니다`);
    assert.equal(frame.viewBox.replace(/\s+/g, ' ').trim(), '0 0 512 512', `${label}: 검과 그림이 같은 512 좌표계를 사용합니다`);
    assert.equal(frame.width, frame.frameWidth, `${label}: 검 이펙트와 그림 폭이 같습니다`);
    assert.equal(frame.height, frame.frameHeight, `${label}: 검 이펙트와 그림 높이가 같습니다`);
    assert.equal(frame.transform, frame.frameTransform, `${label}: 검 이펙트가 그림의 확대·발 위치를 따릅니다`);
    assert.equal(frame.scale, frame.frameScale, `${label}: 확대율 보존`);
    assert.equal(frame.footOffset, frame.frameFootOffset, `${label}: 발 위치 보존`);
    assert.ok(frame.points.every(point => point.source.length === 2 && point.source.every(value => Number.isFinite(value) && value >= 0 && value <= 512) && point.screen && Number.isFinite(point.screen.x) && Number.isFinite(point.screen.y) && point.onArtwork), `${label}: 실제 원화 위에 유한한 검 손잡이·끝 좌표가 있습니다`);
    assert.ok(Math.hypot(...frame.points[0].source.map((value, index) => value - frame.points[1].source[index])) > 15, `${label}: 손잡이와 검 끝이 구분됩니다`);
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

async function pixelDifference(page, label) {
  const arena = page.locator('.painted-combat-arena');
  const visible = await arena.screenshot();
  await page.locator('.skill-spectacle,.vfx-blade-aura').evaluateAll(elements => elements.forEach(element => {
    element.__qaDisplay = [element.style.getPropertyValue('display'), element.style.getPropertyPriority('display')];
    element.style.setProperty('display', 'none', 'important');
  }));
  const hidden = await arena.screenshot();
  await page.locator('.skill-spectacle,.vfx-blade-aura').evaluateAll(elements => elements.forEach(element => {
    const [value, priority] = element.__qaDisplay;
    if (value) element.style.setProperty('display', value, priority); else element.style.removeProperty('display');
    delete element.__qaDisplay;
  }));
  const a = await sharp(visible).ensureAlpha().raw().toBuffer(), b = await sharp(hidden).ensureAlpha().raw().toBuffer();
  let changedPixels = 0;
  for (let index = 0; index < a.length; index += 4) if ([0, 1, 2].some(channel => Math.abs(a[index + channel] - b[index + channel]) > 25)) changedPixels++;
  assert.ok(changedPixels > 100, `${label}: 새 이펙트가 실제 화면 픽셀에 표시됩니다 (${changedPixels})`);
  return changedPixels;
}

async function sceneCase(page, viewport, unit, skill, speed = 1, scenario = 'hit') {
  const props = duelProps(unit, skill, speed);
  if (skill.type === 'guard') { props.scene.outcome.damage = 0; props.scene.defenderPostHp = props.scene.defender.hp; }
  if (scenario === 'miss') { props.scene.outcome = { hit: false, damage: 0 }; props.scene.defenderPostHp = props.scene.defender.hp; }
  if (scenario === 'ally-guard') {
    props.defenderKey = 'hero';
    props.scene.defender = { id: 'hero', name: '카일', type: 'ally', hp: 30, maxHp: 50 };
    props.scene.defenderPostHp = 30;
  }
  const plan = getCombatChoreography(unit, props.scene), spectacle = plan.spectacle;
  const label = `${unit}:${skill.id}/${scenario}/${speed}/${viewport.width}`;
  assert.ok(spectacle && plan.skillPose, `${label}: 실제 기술 자세와 신규 연출이 있습니다`);
  if (skill.type !== 'attack') assert.equal(props.scene.defender.type, 'ally', `${label}: 회복·수호는 아군 대상입니다`);
  await page.evaluate(() => { window.__skillAnimationCalls = []; });
  await renderDuel(page, props);
  await assertFit(page, viewport, label);
  assert.equal(await page.locator('.skill-spectacle').getAttribute('data-skill-theme'), spectacle.theme, `${label}: 기술 속성을 표시합니다`);
  assert.equal(await page.locator('.fighter-skill').getAttribute('src'), plan.skillPose.src, `${label}: 현재 캐릭터의 기술 그림을 로드합니다`);
  assert.equal(await page.locator('.painted-combat-heading h2').innerText(), skill.name, `${label}: 한국어 기술명 유지`);
  assert.equal(await page.locator('.vfx-charge').count(), 1, `${label}: 준비 효과 하나`);
  assert.equal(await page.locator('.vfx-burst').count(), spectacle.bursts.length, `${label}: 접촉 단계 렌더링`);
  const budget = await metrics(page); assertBudget(budget, label);
  const frames = unit === 'hero' ? await bladeFrames(page, label) : [];
  if (unit === 'hero') { assert.ok(spectacle.sword, `${label}: 주인공 검 효과 있음`); assert.equal(frames.length, 3, `${label}: 준비·일반 타격·기술 검 부착`); }
  const chargeAt = (spectacle.charge.at + spectacle.charge.until) / 2;
  const samples = [...new Set([.01, .12, chargeAt, ...plan.poses.filter(([, pose]) => ['windup', 'skill'].includes(pose)).map(([at]) => Math.min(at + .015, .99)),
    ...plan.releases.map(at => at + .01), ...spectacle.bursts.map(burst => burst.at + Math.min(.02, (burst.until - burst.at) * .2)), .98, 1])].sort((a, b) => a - b);
  let bladeVisible = false;
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
      bladeVisible = true;
      assert.equal(blades.length, 1, `${label}: 현재 자세의 검 이펙트 하나만 표시됩니다`);
      assert.equal(blades[0].pose, state.activePoses[0], `${label}: 검 이펙트와 실제 자세가 일치합니다`);
      assert.equal(blades[0].phase, 'weapon', `${label}: 검 부착 단계`);
    }
    if (at === 1) assert.ok([...state.charge, ...state.bursts, ...state.blades].every(effect => effect.opacity < .01), `${label}: 잔광이 끝나고 사라집니다`);
    if (unit === 'hero' && speed === 1 && scenario === 'hit' && (at === chargeAt || at === plan.releases[0] + .01 || at === spectacle.bursts.at(-1).at + Math.min(.02, (spectacle.bursts.at(-1).until - spectacle.bursts.at(-1).at) * .2) || at === 1)) {
      const stage = at === chargeAt ? 'prepare' : at === 1 ? 'clear' : at === plan.releases[0] + .01 ? 'weapon' : 'contact';
      await page.screenshot({ path: path.join(output, `hero-${skill.id}-${stage}-${viewport.width}.png`) });
    }
    const anchors = blades.length ? (await bladeFrames(page, label)).filter(frame => blades.some(blade => blade.pose === frame.pose)).map(frame => ({ pose: frame.pose, points: frame.points })) : [];
    for (const anchor of anchors) for (const point of anchor.points) {
      assert.ok(point.screen.x >= state.arena.x - 2 && point.screen.x <= state.arena.right + 2 && point.screen.y >= state.arena.y - 2 && point.screen.y <= state.arena.bottom + 2,
        `${label}: 동작 중 실제 검 ${point.attribute}가 화면 안에 있습니다 (${JSON.stringify(point.screen)})`);
    }
    phases.push({ at, charge: state.charge.map(effect => effect.opacity), bursts: state.bursts.map(effect => effect.opacity), blades: blades.map(effect => effect.pose), anchors });
  }
  if (unit === 'hero') assert.ok(bladeVisible, `${label}: 실제 검 부착 효과를 표시합니다`);
  let changedPixels;
  if (unit === 'hero' && speed === 1 && scenario === 'hit') {
    await seekDuel(page, spectacle.bursts.at(-1).at + .02, props.scene.durationMs);
    changedPixels = await pixelDifference(page, label);
  }
  await healthTiming(page, props, plan, label);
  results.push({ type: 'skill-scene', viewport, unit, skill: skill.id, scenario, speed, theme: spectacle.theme, budget, frames, phases, changedPixels });
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
    assert.equal(await page.locator('.skill-spectacle,.vfx-blade-aura').count(), 0, '장면 해제 후 신규 효과 DOM 0');
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
      const basic = duelProps('hero', null);
      assert.equal(getCombatChoreography('hero', basic.scene).spectacle, null, '일반 공격 연출 계약은 그대로 유지됩니다');
      await renderDuel(page, basic);
      assert.equal(await page.locator('.skill-spectacle,.vfx-blade-aura').count(), 0, '일반 공격에 스킬 이펙트를 붙이지 않습니다');
      for (const [unit, skill] of entries) await sceneCase(page, viewport, unit, skill);
      for (const skill of heroSkills) for (const speed of [1, 2, 3]) {
        if (speed !== 1) await sceneCase(page, viewport, 'hero', skill, speed);
        if (skill.type === 'attack') await sceneCase(page, viewport, 'hero', skill, speed, 'miss');
      }
      for (const [unit, skill] of entries.filter(([, skill]) => skill.type === 'guard' && skill.radius > 0)) await sceneCase(page, viewport, unit, skill, 1, 'ally-guard');
      await settingsCases(page, viewport);
      await lifecycleCases(page, viewport);
      console.log(`PASS 신규 스킬 VFX ${viewport.width}x${viewport.height}: 아군38기술, 주인공3기술×3배속·빗나감, 아군 수호, 설정4조합, 회전·해제20회`);
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
