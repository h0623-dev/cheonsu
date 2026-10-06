import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { build, preview } from 'vite';
import { getCharacterArt } from '../src/data/characterArt.js';
import { getCombatChoreography } from '../src/data/combatArt.js';
import { MONSTER_ENEMIES } from '../src/data/monsterEnemies.js';
import directions from '../public/art/directions-v1/manifest.json' with { type: 'json' };
import { duelProps, seekDuel, assertBodies, assertFit } from './duel-fixture.mjs';
import { qaBrowserOptions } from './qa-browser.mjs';
import { EXPANSION_MONSTER_KEYS } from '../src/data/expansionEnemies.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.env.CHEONSU_MONSTER_QA_OUT || path.join(root, 'tmp/monster-enemies-qa'));
const legacyFile = process.env.CHEONSU_LEGACY_MONSTER_SAVES || fileURLToPath(new URL('./fixtures/monster-save-1.99.156.json', import.meta.url));
const ids = ['kobold-hunter', 'lizard-spearman', 'horned-ogre', 'harpy-scout', 'skeleton-warrior', 'rock-spirit'];
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const saveKey = 'cheonsu_v01_save';
const errors = [], results = [];
const report = { passed: false, production: true, fixtureProduction: true, ids, errors, results };
let server, fixtureServer, browser;
await fs.mkdir(output, { recursive: true });
const legacy = JSON.parse(await fs.readFile(legacyFile, 'utf8'));
assert.equal(legacy.version, '1.99.156', '보존 fixture는 실제 1.99.156 생산 저장입니다');
for (const id of ids) assert.ok(getCharacterArt(id)?.map, `${id}: 신규 아트와 지도 스프라이트 생성 후 검사합니다`);

function watch(page) {
  page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack }));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/art/')) errors.push({ message: `${response.status()} ${response.url()}` });
  });
}

async function images(page, selector) {
  return page.locator(selector).evaluateAll(async elements => {
    await Promise.all(elements.map(async image => { image.loading = 'eager'; await image.decode(); }));
    return elements.map(image => ({ src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight }));
  });
}

async function assertNewArt(page, selector, id) {
  const loaded = await images(page, selector);
  assert.ok(loaded.length, `${id}: 화면에 이미지가 있습니다`);
  assert.ok(loaded.every(image => image.loaded && image.src.startsWith('/art/characters-v2/') && image.src.includes(id)), `${id}: 신규 종족 그림을 실제로 로드합니다`);
  return loaded;
}

async function assertMapArt(page, id) {
  const loaded = await images(page, `.world-battlefield .unit-visual-${id} > img`);
  const allowed = [getCharacterArt(id).map, directions[id]?.rear];
  assert.ok(loaded.length && loaded.every(image => image.loaded && allowed.includes(image.src) && image.src.includes(id)), `${id}: 지도 앞·뒤 스프라이트를 실제로 로드합니다`);
  return loaded;
}

async function assertSilhouettes(page, label) {
  const bounds = await page.evaluate(() => {
    const arena = document.querySelector('.painted-combat-arena');
    window.__monsterAlphaBounds ||= {};
    return [...arena.querySelectorAll('.fighter-frame')].filter(image => Number(getComputedStyle(image).opacity) > .5).map(image => {
      let alpha = window.__monsterAlphaBounds[image.src];
      if (!alpha) {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        alpha = { edges: [] };
        for (let y = 0; y < canvas.height; y++) {
          let left = canvas.width, right = -1;
          for (let x = 0; x < canvas.width; x++) if (pixels[(y * canvas.width + x) * 4 + 3] > 64) { left = Math.min(left, x); right = Math.max(right, x + 1); }
          if (right >= 0) alpha.edges.push([left, y], [right, y], [left, y + 1], [right, y + 1]);
        }
        window.__monsterAlphaBounds[image.src] = alpha;
      }
      let matrix = new DOMMatrix();
      for (let node = image; node !== arena; node = node.parentElement) {
        const style = getComputedStyle(node);
        const [ox, oy] = style.transformOrigin.split(' ').map(Number.parseFloat);
        matrix = new DOMMatrix().translate(ox + node.offsetLeft, oy + node.offsetTop)
          .multiply(new DOMMatrix(style.transform === 'none' ? undefined : style.transform)).translate(-ox, -oy).multiply(matrix);
      }
      const corners = alpha.edges.map(([x, y]) => new DOMPoint(x / image.naturalWidth * image.offsetWidth, y / image.naturalHeight * image.offsetHeight).matrixTransform(matrix));
      return { src: image.getAttribute('src'), left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)), bottom: Math.max(...corners.map(point => point.y)), width: arena.clientWidth, height: arena.clientHeight };
    });
  });
  for (const box of bounds) assert.ok(box.left >= -2 && box.top >= -2 && box.right <= box.width + 2 && box.bottom <= box.height + 2, `${label}: 몸·무기·날개·꼬리가 잘리지 않습니다 (${JSON.stringify(box)})`);
}

async function fixtureCases(fixtureBase, base, viewport) {
  const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
  watch(page);
  await page.route('**/art/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(fixtureBase, base) });
    await route.fulfill({ response });
  });
  const time = new Date('2026-10-04T00:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 60_000));
  try {
    await page.goto(`${fixtureBase}/tests/fixtures/combat.html`);
    for (const id of ids) for (const mode of ['attack', 'skill', 'counter', 'recoil', 'skill-recoil']) {
      const defending = mode === 'recoil' || mode === 'skill-recoil';
      const props = duelProps(id, null, 1, { mode: defending ? mode === 'skill-recoil' ? 'skill' : 'attack' : mode });
      props.scene.attacker.type = 'enemy';
      props.scene.attacker.name = MONSTER_ENEMIES[id].name;
      props.defenderKey = 'hero';
      props.scene.defender = { id: 'hero', name: '카일', type: 'ally', hp: 30, maxHp: 50 };
      if (mode === 'counter') props.scene.title = '반격';
      if (defending) {
        props.attackerKey = 'hero';
        props.defenderKey = id;
        props.scene.defender = { ...props.scene.attacker, hp: 30, maxHp: 50 };
        props.scene.attacker = { id: 'hero', name: '카일', type: 'ally', hp: 42, maxHp: 50 };
      }
      const plan = getCombatChoreography(props.attackerKey, props.scene);
      await page.evaluate(props => window.renderDuelFixture(props), props);
      await images(page, '.painted-combat img');
      await page.clock.runFor(20);
      await assertFit(page, viewport, `${id}/${mode}`);
      const side = defending ? 'defender' : 'attacker';
      const loaded = await assertNewArt(page, `.fighter-${side} .fighter-frame`, id);
      if (mode === 'skill') await assertNewArt(page, '.skill-cut-in img', id);
      const poses = new Set(), transforms = new Set();
      const skillRecoilSamples = mode === 'skill-recoil' ? plan.contacts.map(at => at + .012) : [];
      const samples = [...new Set([.03, .095, .16, .24, .36, .41, .56, ...plan.poses.slice(0, -1).map(([at], index) => (at + plan.poses[index + 1][0]) / 2), ...plan.releases.map(at => at + .01), ...plan.contacts.map(at => at + .02), ...skillRecoilSamples, .70, .85, .98])].sort((a, b) => a - b);
      for (const fraction of samples) {
        await seekDuel(page, fraction, props.scene.durationMs);
        await assertBodies(page, `${id}/${mode}/${fraction}`);
        if (fraction === .03 || plan.releases.some(at => Math.abs(fraction - at - .01) < .0001) || plan.contacts.some(at => Math.abs(fraction - at - .02) < .0001) || skillRecoilSamples.includes(fraction)) await assertSilhouettes(page, `${id}/${mode}/${fraction}`);
        const shown = await page.locator(`.fighter-${side} .fighter-frame`).evaluateAll(elements => elements.filter(image => Number(getComputedStyle(image).opacity) > .5).map(image => image.dataset.pose));
        shown.forEach(pose => poses.add(pose));
        transforms.add(await page.locator('.fighter-attacker .fighter-body').evaluate(element => getComputedStyle(element).transform));
      }
      assert.ok(poses.has('ready'), `${id}/${mode}: 대기 자세로 복귀합니다`);
      assert.ok(defending ? poses.has('recoil') : poses.has('windup') && poses.has(mode === 'skill' ? 'skill' : 'strike'), `${id}/${mode}: 종족별 동작 그림이 실제 전환됩니다`);
      if (!defending) assert.ok(transforms.size >= 3, `${id}/${mode}: 준비·타격·회복 신체 모션이 다릅니다`);
      await seekDuel(page, plan.contacts.at(-1) + .02, props.scene.durationMs);
      const contact = await page.evaluate(() => {
        const scene = document.querySelector('.painted-combat');
        const arena = scene.querySelector('.painted-combat-arena').getBoundingClientRect();
        const hit = [...scene.querySelectorAll('.duel-hit')].find(element => Number(getComputedStyle(element).opacity) > .5);
        const defender = scene.querySelector('.fighter-defender .fighter-recoil');
        const box = defender.getBoundingClientRect();
        const marker = hit?.getBoundingClientRect();
        return { recoil: Number(getComputedStyle(defender).opacity), marker: marker ? { x: marker.x, y: marker.y } : null,
          defender: { x: box.x, y: box.y, right: box.right, bottom: box.bottom }, arena: { x: arena.x, y: arena.y, right: arena.right, bottom: arena.bottom } };
      });
      assert.equal(contact.recoil, 1, `${id}/${mode}: 타격 순간 피격 자세를 표시합니다`);
      assert.ok(contact.marker && contact.marker.x >= contact.defender.x - 2 && contact.marker.x <= contact.defender.right + 2 && contact.marker.y >= contact.defender.y - 2 && contact.marker.y <= contact.defender.bottom + 2, `${id}/${mode}: 타격 효과가 실제 수비 캐릭터 안에 닿습니다`);
      assert.ok(contact.marker.x >= contact.arena.x && contact.marker.x <= contact.arena.right && contact.marker.y >= contact.arena.y && contact.marker.y <= contact.arena.bottom, `${id}/${mode}: 타격 지점이 화면 밖으로 벗어나지 않습니다`);
      assert.match(await page.locator('.combat-health').last().innerText(), /30 \/ 50/, `${id}/${mode}: 피격 전 HP를 유지합니다`);
      await page.clock.runFor(props.scene.durationMs * (plan.impact - .02) - 20);
      assert.match(await page.locator('.combat-health').last().innerText(), /30 \/ 50/, `${id}/${mode}: 타격 전에 HP가 먼저 감소하지 않습니다`);
      await page.clock.runFor(props.scene.durationMs * .04 + 1);
      assert.match(await page.locator('.combat-health').last().innerText(), /18 \/ 50/, `${id}/${mode}: 타격 때 HP가 감소합니다`);
      if (mode === 'attack' || mode === 'skill') await page.screenshot({ path: path.join(output, `fixture-${id}-${mode}-${viewport.width}.png`) });
      results.push({ type: 'production-fixture', viewport, id, mode, loaded, poses: [...poses], sampleFractions: samples, contact });
    }
    console.log(`PASS 신규 적 6종 생산 모션 ${viewport.width}x${viewport.height}: 공격·스킬·반격·기본피격·스킬피격 30건`);
  } catch (error) {
    await page.screenshot({ path: path.join(output, `fixture-failure-${viewport.width}.png`) }).catch(() => {});
    throw error;
  } finally { await page.close(); }
}

async function actualApp(base, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  watch(page);
  page.setDefaultTimeout(18000);
  const button = name => page.getByRole('button', { name, exact: true });
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
  const ready = async () => {
    await page.locator('.world-battlefield .unit-visual-hero').waitFor();
    await page.waitForFunction(() => !document.querySelector('.battle-control-heading .prominent-save')?.disabled && !document.querySelector('.boss-splash-overlay'));
  };
  const load = async data => {
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: saveKey, data });
    await page.reload();
    await button('이어하기').click();
  };
  try {
    await page.addInitScript(() => {
      localStorage.setItem('cheonsu_auto_patch', 'false');
      localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'full', battleSpeed: 'normal', effectsOn: true }));
    });
    await page.goto(base);
    for (const testCase of legacy.cases) {
      const baseline = { ...structuredClone(legacy.shared), ...structuredClone(testCase.save) };
      await load(baseline);
      await ready();
      assert.deepEqual(await saved(), baseline, `${testCase.stage}: 이어하기는 기존 저장에 쓰지 않습니다`);
      await page.locator('.battle-control-heading .prominent-save').click();
      const resumed = await saved();
      assert.deepEqual(resumed.units, baseline.units, `${testCase.stage}: 기존 전투 units의 모든 필드·전투 규칙·외형을 보존합니다`);
      assert.deepEqual(resumed.selectedStage.units, baseline.selectedStage.units, `${testCase.stage}: 저장한 전장 적 구성 전체를 보존합니다`);
      for (const field of ['party', 'gold', 'inventory', 'clearedStages', 'gearInventory', 'gearEnhance', 'supportPoints', 'supportDialoguesSeen', 'exploration', 'stageNotes', 'stageMastery', 'claimedAchievements', 'claimedMasteryRewards', 'snapshotGallery']) {
        assert.deepEqual(resumed[field], baseline[field], `${testCase.stage}: ${field} 보존`);
      }
      results.push({ type: 'legacy-156-save', viewport, stage: testCase.stage, units: resumed.units.length, fieldsPreserved: true });
    }

    const campaign = { ...structuredClone(legacy.shared), ...structuredClone(legacy.cases[0].save), screen: 'campaign', clearedStages: Array.from({ length: 29 }, (_, index) => index + 1) };
    await load(campaign);
    await page.locator('.campaign-header').waitFor();
    const campaignSource = await page.evaluate(key => localStorage.getItem(key), saveKey);
    await page.locator('.campaign-header-actions').getByRole('button', { name: '뒤로', exact: true }).click();
    await button('도감').click();
    await button('적군').click();
    assert.equal(await page.locator('.collection-card').count(), 37, '기존 적군25종과 확장12종을 모두 보존합니다');
    for (const id of EXPANSION_MONSTER_KEYS) {
      assert.equal(await page.locator(`[data-character="${id}"]`).getAttribute('data-collected'), 'false', `${id}: 옛 29장 클리어 기록으로 확장 적을 미리 조사하지 않습니다`);
    }
    for (const id of ['raider', 'ranger', 'sniper', 'marauder', 'assassin_elite', 'iron_lancer', 'plague_doctor', 'beast_tamer', 'storm_mage', 'blade_dancer', 'siege_gunner', 'sentinel', 'blackguard', 'warlord', 'pyromancer', 'frost_mage', 'cultist', 'void_knight', 'wolf']) {
      assert.equal(await page.locator(`[data-character="${id}"]`).getAttribute('data-collected'), 'true', `${id}: 기존 적 도감 조사 기록을 보존합니다`);
    }
    for (const id of ids) {
      const card = page.locator(`[data-character="${id}"]`);
      await card.waitFor();
      assert.equal(await card.getAttribute('data-collected'), 'true', `${id}: 기존 클리어 기록에서 신규 종족 관찰을 확인합니다`);
      const loaded = await assertNewArt(page, `[data-character="${id}"] img`, id);
      await card.click();
      await page.locator('.character-detail-dialog[open]').waitFor();
      await assertNewArt(page, '.character-detail-identity img', id);
      assert.match(await page.locator('.collection-condition').innerText(), new RegExp(`${MONSTER_ENEMIES[id].firstStage}장`));
      await page.screenshot({ path: path.join(output, `codex-${id}-${viewport.width}.png`) });
      await button('캐릭터 정보 닫기').click();
      results.push({ type: 'actual-codex', viewport, id, loaded });
    }
    assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), campaignSource, '도감 열람은 진행도·수집 기억을 변경하지 않습니다');
    await button('뒤로').click();
    await button('이어하기').click();

    for (const id of [...ids].sort((a, b) => MONSTER_ENEMIES[a].firstStage - MONSTER_ENEMIES[b].firstStage)) {
      await load(campaign);
      const stage = MONSTER_ENEMIES[id].firstStage;
      await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${stage}장[.]`) }) }).click();
      await button('전투 시작').click();
      await page.waitForFunction(() => document.querySelector('.final-deploy-card,.narrative-screen,.story-screen,.world-battlefield'));
      if (await page.locator('.final-deploy-card').count()) await button('그래도 출전').click();
      if (await button('바로 전투').count()) await button('바로 전투').click();
      await page.locator('.stage-mission-dialog[open]').getByRole('button', { name: '미션 확인', exact: true }).click();
      await ready();
      const loaded = await assertMapArt(page, id);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${id}: 휴대폰 가로 넘침이 없습니다`);
      await page.locator('.battle-control-heading .prominent-save').click();
      const battle = await saved();
      const enemy = battle.units.find(unit => unit.artId === id);
      assert.ok(enemy && enemy.type === 'enemy' && enemy.name.includes(MONSTER_ENEMIES[id].name), `${stage}장 실제 전투에 ${id}가 연결됩니다`);
      assert.ok(battle.selectedStage.units.some(unit => unit.artId === id), `${id}: 새 전투를 저장하면 종족 식별자를 보존합니다`);
      await page.locator(`.world-battlefield .unit-visual-${id}`).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `actual-stage-${stage}-${id}-${viewport.width}.png`) });
      results.push({ type: 'actual-new-battle', viewport, id, stage, enemy, loaded });
      await load(battle);
      await ready();
      await assertMapArt(page, id);
      assert.deepEqual((await saved()).units, battle.units, `${id}: 새 저장 이어하기에서 종족 식별자와 전투 데이터 모두 유지합니다`);
    }
    console.log(`PASS 신규 적 실제 전투·도감·구156 저장 ${viewport.width}x${viewport.height}: 첫등장6곳, 도감6종, 구저장${legacy.cases.length}곳`);
  } catch (error) {
    await page.screenshot({ path: path.join(output, `actual-failure-${viewport.width}.png`) }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

try {
  server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  report.build = await (await fetch(`${base}/ota-build.json`)).json();
  report.legacy = { version: legacy.version, commit: legacy.commit, sourceHash: legacy.sourceHash };
  const fixturePath = path.join(root, 'tests/fixtures/combat.jsx');
  const fixtureOut = path.join(output, 'production-fixture');
  await build({ root, configFile: false, logLevel: 'error', plugins: [{
    name: 'monster-qa-render-control', enforce: 'pre', transform(source, id) {
      if (id !== fixturePath) return;
      const index = source.indexOf('createRoot(document.getElementById(');
      assert.ok(index > 0, '생산 전투 fixture 진입점');
      return `${source.slice(0, index)}\nimport { flushSync } from 'react-dom';\nconst root = createRoot(document.getElementById('root'));\nwindow.renderDuelFixture = props => flushSync(() => root.render(props ? React.createElement(CombatScene, props) : null));\n`;
    },
  }, react()], build: { outDir: fixtureOut, emptyOutDir: true, copyPublicDir: false, rollupOptions: { input: path.join(root, 'tests/fixtures/combat.html') } } });
  fixtureServer = await preview({ root, configFile: false, build: { outDir: fixtureOut }, preview: { host: '127.0.0.1', port: 0, open: false } });
  const fixtureBase = `http://127.0.0.1:${fixtureServer.httpServer.address().port}`;
  browser = await chromium.launch(qaBrowserOptions());
  for (const viewport of viewports) {
    await fixtureCases(fixtureBase, base, viewport);
    await actualApp(base, viewport);
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  }
  assert.deepEqual(errors, [], '신규 종족 검사에서 페이지 오류와 누락 아트가 없습니다');
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await fixtureServer?.close();
  await server?.close();
}
