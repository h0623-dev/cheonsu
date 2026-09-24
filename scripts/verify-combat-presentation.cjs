const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const sharp = require('sharp');

const base = process.env.GAME_URL || 'http://127.0.0.1:5176';
const out = 'tmp/combat-presentation-qa';
const profiles = [
  ['hero', 'slash'], ['leon', 'thrust'], ['rakan', 'heavy'], ['bram', 'guard'],
  ['sera', 'quick'], ['wolf', 'beast'], ['lina', 'bow'], ['siege_gunner', 'cannon'], ['irene', 'cast'],
  ['boss_commander', 'heavy'], ['boss_frost', 'cast'], ['boss_ember', 'slash'], ['boss_oracle', 'cast'], ['boss_abyss', 'slash'],
];

async function render(page, changes) {
  await page.evaluate(changes => window.renderCombatFixture(changes), changes);
  await page.locator('.painted-combat').waitFor();
  await page.locator('.painted-combat img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
}

async function seek(page, fraction, duration) {
  await page.evaluate(time => document.getAnimations().forEach(animation => {
    animation.pause();
    animation.currentTime = time;
  }), fraction * duration);
}

async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  const errors = [];
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', error => errors.push(error.message));
      // Concurrent art edits must not hot-reload the mounted test scenario.
      await page.routeWebSocket('**', () => {});
      const time = new Date('2026-09-22T00:00:00Z');
      await page.clock.install({ time });
      await page.clock.pauseAt(time);
      // Extend the existing fixture in memory; keep shared fixture files untouched.
      await page.route('**/tests/fixtures/combat.jsx*', async route => {
        const response = await route.fetch();
        const source = await response.text();
        const marker = 'createRoot(document.getElementById(';
        assert.ok(source.includes(marker), 'existing combat fixture mount');
        await route.fulfill({ response, body: source.slice(0, source.indexOf(marker)) + `
          import ReactDOM from '/node_modules/.vite/deps/react-dom.js';
          const root = createRoot(document.getElementById('root'));
          let props = { scene, attackerKey: key, defenderKey: 'blackguard', background: '/art/world-v2/scenes/forest.webp' };
          window.renderCombatFixture = changes => {
            props = { ...props, ...changes };
            ReactDOM.flushSync(() => root.render(React.createElement(CombatScene, props)));
          };
          window.renderCombatFixture({});
        ` });
      });
      await page.goto(`${base}/tests/fixtures/combat.html`);
      let serial = 0;
      const makeScene = (unit, duration, overrides = {}) => ({
        id: `presentation-${++serial}`, durationMs: duration, title: 'Attack', effectLabel: 'Battle',
        attacker: { id: unit, name: unit, type: 'ally', hp: 42, maxHp: 50 },
        defender: { id: 'blackguard', name: 'Blackguard', type: 'enemy', hp: 30, maxHp: 50 },
        attackerPostHp: 42, defenderPostHp: 18, outcome: { hit: true, damage: 12 }, ...overrides,
      });
      const signatures = new Map();
      for (const speed of [1, 2, 3]) {
        const duration = 1820 / speed;
        for (const [unit, profile] of profiles) {
          const scene = makeScene(unit, duration, { mode: 'skill', effectType: 'fire' });
          await render(page, { scene, attackerKey: unit, effectsEnabled: true });
          assert.ok(await page.locator(`.weapon-${profile}`).count(), `${unit}: weapon survives elemental skill`);
          assert.equal(await page.locator('.painted-combat').evaluate(el => el.style.getPropertyValue('--combat-duration')), `${duration}ms`);
          const bodyTransforms = [];
          for (const fraction of [.05, .12, .18, .38, .5, .58, .67, .9, 1]) {
            await seek(page, fraction, duration);
            for (const side of ['attacker', 'defender']) {
              const visible = await page.locator(`.fighter-${side} .fighter-frame`).evaluateAll(images => images.filter(image => +getComputedStyle(image).opacity > .5).length);
              assert.equal(visible, 1, `${unit}/${speed}/${fraction}/${side}: one visible body`);
            }
            if ([.38, .5, .58].includes(fraction)) bodyTransforms.push(await page.locator('.fighter-attacker .fighter-body').evaluate(el => getComputedStyle(el).transform));
          }
          assert.equal(new Set(bodyTransforms).size, 3, `${unit}: anticipation, strike, followthrough differ`);
          const signature = bodyTransforms.join('|');
          if (speed === 1) signatures.set(profile, signature);
          else assert.equal(signature, signatures.get(profile), `${unit}: speed preserves staging`);
          const bounds = await page.locator('.painted-combat').boundingBox();
          assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height, 'scene fits viewport');
          await page.clock.runFor(duration * .49);
          assert.match(await page.locator('.combat-health').last().innerText(), /30 \/ 50/);
          await page.clock.runFor(duration * .02 + 1);
          assert.match(await page.locator('.combat-health').last().innerText(), /18 \/ 50/, `${unit}/${speed}: health changes at impact`);
          if (speed === 3 && ['thrust', 'bow', 'cast'].includes(profile)) {
            await seek(page, .5, duration);
            await page.screenshot({ path: `${out}/${profile}-${viewport.width}-turbo.png` });
          }
        }
      }
      assert.equal(new Set(signatures.values()).size, new Set(profiles.map(([,profile])=>profile)).size, 'each weapon has distinct body acting');
      for (const [unit, profile, animation] of [['void_knight', 'slash', 'slash'], ['beast_tamer', 'whip', 'slash'], ['baekho', 'fist', 'thrust']]) {
        await render(page, { attackerKey: unit, scene: makeScene(unit, 720) });
        assert.equal(await page.locator(`.weapon-${profile}`).count(), 1);
        assert.equal(await page.locator('.fighter-attacker .fighter-body').evaluate(el => getComputedStyle(el).animationName), `combat-${animation}-body`);
      }

      const boss = { id: 'boss', name: 'The Iron Warlord', type: 'boss', hp: 80, maxHp: 80 };
      await render(page, { attackerKey: 'boss_commander', scene: makeScene('boss_commander', 720, { attacker: boss }) });
      await seek(page, .12, 720);
      assert.equal(await page.locator('.has-boss .intro-attacker strong').innerText(), boss.name);
      await page.screenshot({ path: `${out}/boss-intro-${viewport.width}.png` });

      await render(page, { attackerKey: 'hero', defenderKey: 'boss_commander', scene: makeScene('hero', 720, { defender: boss, finish: true, defenderPostHp: 0 }) });
      assert.equal(await page.locator('.has-boss .intro-defender strong').innerText(), boss.name);
      await page.clock.runFor(550);
      await seek(page, .76, 720);
      assert.equal(await page.locator('.fighter-defender .fighter-body').evaluate(el => getComputedStyle(el).animationName), 'combat-defeat-body');
      await page.screenshot({ path: `${out}/defeat-${viewport.width}.png` });
      await seek(page, 1, 720);
      assert.equal(await page.locator('.fighter-defender').evaluate(el => +getComputedStyle(el).opacity), 0);

      for (const support of ['heal', 'guard']) {
        const actor = { id: 'bram', name: 'Bram', type: 'ally', hp: 30, maxHp: 50 };
        await render(page, { attackerKey: 'bram', scene: makeScene('bram', 720, {
          attacker: actor, defender: actor, defenderPostHp: 42, outcome: { [support]: true, hit: false, damage: 12 },
        }) });
        await page.clock.runFor(400);
        await seek(page, .55, 720);
        assert.equal(await page.locator('.painted-fighter').count(), 1);
        assert.equal(await page.locator('.combat-health').count(), 1);
        assert.equal(await page.locator('.combat-enemy-intro').count(), 0);
        await page.screenshot({ path: `${out}/self-${support}-${viewport.width}.png` });
      }

      await render(page, { attackerKey: 'hero', scene: makeScene('hero', 720, { outcome: { hit: false, damage: 0 } }) });
      await seek(page, .5, 720);
      assert.equal(await page.locator('.fighter-defender .fighter-body').evaluate(el => getComputedStyle(el).animationName), 'combat-dodge-body');
      for (const reduced of [false, true]) {
        await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
        await render(page, { effectsEnabled: reduced, scene: makeScene('hero', 720) });
        assert.equal(await page.locator('.fighter-attacker .fighter-body').evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.equal(await page.locator('.fighter-attacker .fighter-ready').evaluate(el => +getComputedStyle(el).opacity), 1);
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await render(page, { effectsEnabled: true, scene: makeScene('hero', 720) });
      await seek(page, .38, 720);
      const shown = await page.locator('.painted-combat-arena').screenshot();
      await page.locator('.painted-fighter').evaluateAll(actors => actors.forEach(actor => { actor.style.visibility = 'hidden'; }));
      const hidden = await page.locator('.painted-combat-arena').screenshot();
      const a = await sharp(shown).ensureAlpha().raw().toBuffer();
      const b = await sharp(hidden).ensureAlpha().raw().toBuffer();
      let changed = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) changed++;
      assert.ok(changed > 500, `${viewport.width}: actor pixels render above background`);
      await page.close();
      console.log(`Presentation QA ${viewport.width}x${viewport.height}: nine weapons, three speeds, boss identity, defeat, self-support, accessibility, visible actor pixels`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
