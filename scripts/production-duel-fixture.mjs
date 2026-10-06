import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build, preview } from 'vite';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { EXPANSION_ENEMY_TEMPLATES } from '../src/data/expansionEnemies.js';
import { CHARACTER_SKILLS, withSkill } from '../src/data/skills.js';
import { getCombatTiming } from '../src/data/combatArt.js';
import { duelProps } from './duel-fixture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const bossKeys = new Set(['tide_keeper', 'frost_queen', 'resonance_judge', 'oath_guardian']);

export function productionDuelProps(key, skill = null, speed = 2, extra = {}) {
  const canonical = key.split('__form')[0];
  const form = ADVANCED_CLASSES[canonical]?.find(value => value.id === key);
  const props = duelProps(canonical, skill, speed, extra);
  props.attackerKey = key;
  props.scene.attacker.type = Object.hasOwn(CHARACTER_SKILLS, canonical) ? 'ally' : key.startsWith('boss_') || bossKeys.has(key) ? 'boss' : 'enemy';
  if (form) {
    props.scene.attacker.advancedClass = form.id;
    if (skill) props.scene.attacker = withSkill(props.scene.attacker, skill.id);
  }
  if (props.scene.mode === 'skill' && EXPANSION_ENEMY_TEMPLATES[key]) {
    props.scene.attacker = { ...props.scene.attacker, skill: EXPANSION_ENEMY_TEMPLATES[key].skill, skillSpec: EXPANSION_ENEMY_TEMPLATES[key].skillSpec };
  }
  if (props.scene.outcome?.guard) {
    props.scene.outcome.damage = 0;
    props.scene.defenderPostHp = props.scene.defender.hp;
  }
  props.scene.durationMs = 1820 * getCombatTiming(props.scene).durationScale / speed;
  return props;
}

/** Compile the actual React combat scene with production Vite, using the final dist art. */
export async function createProductionDuelFixture(output) {
  let gameServer, fixtureServer;
  const close = async () => { await fixtureServer?.close(); await gameServer?.close(); };
  try {
    gameServer = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } });
    const gameBase = `http://127.0.0.1:${gameServer.httpServer.address().port}`;
    const buildInfo = await (await fetch(`${gameBase}/ota-build.json`)).json();
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    assert.equal(buildInfo.version, pkg.version, '최종 게임 버전으로 npm run build를 먼저 실행해야 합니다');
    const fixturePath = path.join(root, 'tests/fixtures/combat.jsx');
    const fixtureOut = path.resolve(output, 'production-fixture');
    await build({ root, configFile: false, logLevel: 'error', plugins: [{ name: 'production-duel-fixture', enforce: 'pre', transform(source, id) {
      if (id !== fixturePath) return;
      const index = source.indexOf('createRoot(document.getElementById(');
      assert.ok(index > 0);
      return `${source.slice(0, index)}\nimport { flushSync } from 'react-dom';\nconst root = createRoot(document.getElementById('root'));\nwindow.__duelContactCalls=[]; window.__duelCompleteCalls=[];\nwindow.renderDuelFixture=props=>flushSync(()=>root.render(props?React.createElement(CombatScene,{...props,onImpact:scene=>window.__duelContactCalls.push(scene.id),onComplete:scene=>window.__duelCompleteCalls.push(scene.id)}):null));\n`;
    } }, react()], build: { outDir: fixtureOut, emptyOutDir: true, copyPublicDir: false, rollupOptions: { input: path.join(root, 'tests/fixtures/combat.html') } } });
    fixtureServer = await preview({ root, configFile: false, build: { outDir: fixtureOut }, preview: { host: '127.0.0.1', port: 0, open: false } });
    const fixtureBase = `http://127.0.0.1:${fixtureServer.httpServer.address().port}`;
    return { build: buildInfo, close, async open(browser, viewport, errors) {
      const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
      page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack }));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await page.route('**/art/**', async route => {
        const response = await route.fetch({ url: route.request().url().replace(fixtureBase, gameBase) });
        await route.fulfill({ response });
      });
      const time = new Date('2026-10-05T00:00:00Z');
      await page.clock.install({ time }); await page.clock.pauseAt(time);
      await page.goto(`${fixtureBase}/tests/fixtures/combat.html`);
      return page;
    } };
  } catch (error) { await close(); throw error; }
}
