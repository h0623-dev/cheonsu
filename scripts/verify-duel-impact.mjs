import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { build, preview } from 'vite';
import { combatUnitIds, getCombatChoreography } from '../src/data/combatArt.js';
import { CHARACTER_SKILLS } from '../src/data/skills.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { getDuelWeaponAnchor } from '../src/data/duelContactGeometry.js';
import { duelProps, renderDuel, seekDuel, assertBodies, assertFit } from './duel-fixture.mjs';
import { qaBrowserOptions } from './qa-browser.mjs';
import { productionDuelProps } from './production-duel-fixture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.env.CHEONSU_DUEL_IMPACT_QA_OUT || path.join(root, 'tmp/duel-impact-qa'));
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }, { width: 844, height: 390 }];
const errors = [], results = [];
const report = { passed: false, production: true, viewports, errors, results };
let server, fixtureServer, browser;
await fs.mkdir(output, { recursive: true });

function propsFor(key, mode = 'attack', extra = {}) {
  const canonical = key.split('__form')[0], form = ADVANCED_CLASSES[canonical]?.find(value => value.id === key);
  const spec = form?.skill || CHARACTER_SKILLS[canonical]?.[0];
  return productionDuelProps(key, mode === 'skill' ? spec : null, 2, { ...extra, mode });
}

async function openPage(fixtureBase, base, viewport) {
  const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
  page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack }));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/art/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(fixtureBase, base) });
    await route.fulfill({ response });
  });
  const time = new Date('2026-10-05T00:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.goto(`${fixtureBase}/tests/fixtures/combat.html`);
  return page;
}

async function inspect(page) {
  return page.evaluate(() => {
    const scene = document.querySelector('.painted-combat');
    return { state: scene?.dataset.contactState, calls: [...window.__duelContactCalls], complete: [...window.__duelCompleteCalls], animations: document.getAnimations().length, health: [...document.querySelectorAll('.combat-health span')].map(element => element.textContent) };
  });
}

async function sceneCase(page, viewport, key, mode) {
  const props = propsFor(key, mode), plan = getCombatChoreography(key, props.scene), duration = props.scene.durationMs;
  await renderDuel(page, props);
  await assertFit(page, viewport, `${key}/${mode}`);
  const before = await inspect(page);
  await page.clock.runFor(duration * plan.impact - 21);
  assert.equal((await inspect(page)).state, 'pending', `${key}: 접촉 이전에는 피해가 없습니다`);
  await page.clock.runFor(2);
  const contact = await inspect(page);
  assert.equal(contact.state, 'resolved');
  assert.equal(contact.calls.filter(id => id === props.scene.id).length, 1);
  const selfSupport = Boolean(props.scene.outcome.guard && props.scene.attacker.id === props.scene.defender.id);
  const expectedHealth = [`${(selfSupport ? props.scene.defenderPostHp : props.scene.attackerPostHp) ?? props.scene.attacker.hp} / ${props.scene.attacker.maxHp}`, ...(!selfSupport ? [`${props.scene.defenderPostHp ?? props.scene.defender.hp} / ${props.scene.defender.maxHp}`] : [])];
  assert.deepEqual(contact.health, expectedHealth, `${key}/${mode}: 접촉에서 실제 HP 표시가 바뀝니다`);
  for (const fraction of [.10, .27, Math.max(.30, plan.releases[0] - .02), plan.impact + .009, plan.impact + .07, .94]) {
    await seekDuel(page, fraction, duration);
    await assertBodies(page, `${key}/${mode}/${fraction}`);
  }
  if (plan.moving) {
    await seekDuel(page, plan.impact, duration);
    if (mode === 'skill') {
      const contactGeometry = await page.evaluate(() => {
        const actor = document.querySelector('.fighter-attacker');
        const active = [...actor.querySelectorAll('.fighter-frame')].find(image => Number(getComputedStyle(image).opacity) > .5)?.dataset.pose;
        const aura = actor.querySelector(`[data-vfx-phase="weapon"][data-pose="${active}"]`);
        const defender = document.querySelector('.fighter-defender');
        if (!aura || !defender) return null;
        const coordinate = (aura.getAttribute('data-focus') || aura.getAttribute('data-tip')).split(',').map(Number);
        const tip = new DOMPoint(...coordinate).matrixTransform(aura.getScreenCTM());
        const rect = defender.getBoundingClientRect();
        return { tipX: tip.x, targetX: rect.x + rect.width * .46, tipY: tip.y, top: rect.top, bottom: rect.bottom, origin: aura.dataset.anchorOrigin };
      });
      assert.ok(contactGeometry, `${key}: 기술 자세의 실제 SVG 부착점`);
      assert.ok(Math.abs(contactGeometry.tipX - contactGeometry.targetX) <= 3, `${key}: 무기 부착점이 실제 타깃에 도달합니다 (${JSON.stringify(contactGeometry)})`);
      assert.ok(contactGeometry.tipY >= contactGeometry.top - 3 && contactGeometry.tipY <= contactGeometry.bottom + 3, `${key}: 무기 부착점이 타깃의 세로 범위 안에 있습니다`);
    }
    const first = await page.locator('.fighter-attacker').evaluate(element => getComputedStyle(element).transform);
    await seekDuel(page, plan.impact + plan.contactPause * .8, duration);
    const second = await page.locator('.fighter-attacker').evaluate(element => getComputedStyle(element).transform);
    assert.equal(first, second, `${key}: 접촉 짧은 정지에서 배우 위치 유지`);
  }
  await page.clock.runFor(duration);
  const completed = await inspect(page);
  assert.equal(completed.calls.filter(id => id === props.scene.id).length, 1);
  assert.equal(completed.complete.filter(id => id === props.scene.id).length, 1);
  if (['hero','lina','rakan','mare','edan','hero__form0'].includes(key) && viewport.width === 390) {
    await seekDuel(page, plan.impact + .016, duration);
    await page.screenshot({ path: path.join(output, `${key}-${mode}.png`) });
  }
  results.push({ type: 'contact', viewport, key, mode, choreography: plan.id, impacts: plan.contacts.length, contactPause: plan.contactPause, authoredWeapon: getDuelWeaponAnchor(key, plan.contactPose === 'strike' ? 'strike' : plan.skillPose?.src?.includes('skill-b') ? 'skill-b' : 'skill-a', plan.weapon).authored, initialHealth: before.health, contactHealth: contact.health, callbackCount: 1 });
}

async function outcomes(page, viewport) {
  for (const speed of [1, 2, 3]) for (const kind of ['counter', 'miss', 'critical', 'finish', 'heal', 'guard']) {
    const key = kind === 'heal' ? 'aria' : kind === 'guard' ? 'hero' : 'lina';
    const props = kind === 'heal' ? duelProps(key, CHARACTER_SKILLS.aria[0], speed) : kind === 'guard' ? duelProps(key, CHARACTER_SKILLS.hero[1], speed) : duelProps(key, null, speed, { mode: kind === 'counter' ? 'counter' : 'attack', finish: kind === 'finish', outcome: { hit: kind !== 'miss', damage: kind === 'miss' ? 0 : kind === 'finish' ? 30 : 12, crit: kind === 'critical' }, defenderPostHp: kind === 'miss' ? 30 : kind === 'finish' ? 0 : 18 });
    await renderDuel(page, props);
    const plan = getCombatChoreography(key, props.scene);
    await seekDuel(page, plan.impact + .01, props.scene.durationMs);
    await assertBodies(page, `${kind}/${speed}`);
    if (kind === 'miss') {
      assert.ok(await page.locator('.duel-hit').evaluateAll(elements => elements.every(element => getComputedStyle(element).visibility === 'hidden')));
      assert.equal(await page.locator('.duel-impact-ink').evaluate(element => Number(getComputedStyle(element).opacity)), 0);
    }
    await page.clock.runFor(props.scene.durationMs);
    const value = await inspect(page);
    assert.equal(value.calls.filter(id => id === props.scene.id).length, 1);
    if (kind === 'finish') {
      await seekDuel(page, 1, props.scene.durationMs);
      assert.equal(await page.locator('.fighter-defender .fighter-body').evaluate(element => Number(getComputedStyle(element).opacity)), 0);
    }
    results.push({ type: 'outcome', viewport, kind, speed, health: value.health });
  }
}

async function cancellationAndSettings(page, viewport) {
  for (const reduced of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const props = propsFor('hero');
    await renderDuel(page, props);
    await page.clock.runFor(props.scene.durationMs * .2);
    await page.evaluate(() => window.renderDuelFixture(null));
    await page.clock.runFor(props.scene.durationMs * 2);
    assert.equal((await inspect(page)).calls.filter(id => id === props.scene.id).length, 0);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    const next = { ...propsFor('hero'), effectsEnabled: !reduced };
    await renderDuel(page, next);
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await page.clock.runFor(next.scene.durationMs);
    assert.equal((await inspect(page)).calls.filter(id => id === next.scene.id).length, 1);
    await assertBodies(page, '회전·동작 최소화');
    await page.setViewportSize(viewport);
    results.push({ type: 'cancel-reduce-rotate', viewport, reduced, callbackCount: 1 });
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

try {
  server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  report.build = await (await fetch(`${base}/ota-build.json`)).json();
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(report.build.version, pkg.version, '최종 게임 버전으로 npm run build를 먼저 실행해야 합니다');
  const fixturePath = path.join(root, 'tests/fixtures/combat.jsx'), fixtureOut = path.join(output, 'production-fixture');
  await build({ root, configFile: false, logLevel: 'error', plugins: [{ name: 'duel-contact-qa', enforce: 'pre', transform(source, id) {
    if (id !== fixturePath) return;
    const index = source.indexOf('createRoot(document.getElementById(');
    assert.ok(index > 0);
    return `${source.slice(0,index)}\nimport { flushSync } from 'react-dom';\nconst root = createRoot(document.getElementById('root'));\nwindow.__duelContactCalls=[]; window.__duelCompleteCalls=[];\nwindow.renderDuelFixture = props => flushSync(() => root.render(props ? React.createElement(CombatScene, {...props,onImpact:scene=>window.__duelContactCalls.push(scene.id),onComplete:scene=>window.__duelCompleteCalls.push(scene.id)}) : null));\n`;
  } }, react()], build: { outDir: fixtureOut, emptyOutDir: true, copyPublicDir: false, rollupOptions: { input: path.join(root, 'tests/fixtures/combat.html') } } });
  fixtureServer = await preview({ root, configFile: false, build: { outDir: fixtureOut }, preview: { host: '127.0.0.1', port: 0, open: false } });
  const fixtureBase = `http://127.0.0.1:${fixtureServer.httpServer.address().port}`;
  browser = await chromium.launch(qaBrowserOptions());
  const allKeys = [...new Set([...combatUnitIds, ...Object.values(ADVANCED_CLASSES).flat().map(form => form.id)])];
  const requested = process.env.CHEONSU_DUEL_QA_KEYS?.split(',').filter(Boolean);
  if (requested) assert.ok(requested.every(key => allKeys.includes(key)), '검사 대상은 실제 등록된 전투 아트여야 합니다');
  const keys = requested ? [...new Set(requested)] : allKeys;
  report.keys = keys; report.fullRoster = keys.length === allKeys.length; report.totalRegisteredKeys = allKeys.length;
  for (const viewport of viewports) {
    const page = await openPage(fixtureBase, base, viewport);
    try {
      for (const key of keys) for (const mode of ['attack', 'skill']) await sceneCase(page, viewport, key, mode);
      await outcomes(page, viewport);
      await cancellationAndSettings(page, viewport);
      console.log(`PASS 타격 연출 ${viewport.width}x${viewport.height}: ${keys.length}종 일반/스킬, 접촉·반격·회피·회복·수호·결정타·취소·회전`);
    } catch (error) { await page.screenshot({ path: path.join(output, `failure-${viewport.width}.png`) }).catch(() => {}); throw error; }
    finally { await page.close(); }
  }
  assert.deepEqual(errors, []);
  report.passed = true;
} catch (error) { report.failure = error.stack; throw error; }
finally {
  report.counts = Object.fromEntries([...new Set(results.map(result => result.type))].map(type => [type, results.filter(result => result.type === type).length]));
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  await browser?.close(); await fixtureServer?.close(); await server?.close();
}
