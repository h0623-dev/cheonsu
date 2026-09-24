const { chromium } = require('playwright');
const { mkdir, writeFile } = require('node:fs/promises');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const base = process.env.GAME_URL || 'http://127.0.0.1:5176';
const out = 'tmp/combat-patch-qa';

async function snapshot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: no page overflow`);
}
async function save(page) {
  await page.locator('.cinematic-stage-actions button').filter({ hasText: '설정' }).click();
  await page.locator('.battle-settings-menu button').filter({ hasText: '진행 저장' }).click();
  return page.evaluate(() => Object.entries(localStorage).map(([key, value]) => {
    try { return { key, data: JSON.parse(value) }; } catch { return null; }
  }).find(entry => entry?.key === 'cheonsu_v01_save'));
}
async function restore(page, fixture) {
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), fixture);
  await page.reload();
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  await page.locator('.world-battlefield').waitFor();
}
async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  const errors = [];
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(base);
      await page.getByRole('button', { name: '설정', exact: true }).click();
      await snapshot(page, `settings-${viewport.width}`);
      const settingsRows = await page.locator('.setting-row').evaluateAll(rows => rows.map(row => {
        const rect = row.getBoundingClientRect();
        return [...row.querySelectorAll('button')].every(button => { const b = button.getBoundingClientRect(); return b.left >= rect.left - 1 && b.right <= rect.right + 1; });
      }));
      assert.ok(settingsRows.every(Boolean), 'Settings controls must fit');
      await page.getByRole('button', { name: '뒤로', exact: true }).click();
      await page.getByRole('button', { name: '새 게임', exact: true }).click();
      await page.locator('.campaign-stage-select button').filter({ hasText: /^11장\./ }).click();
      await page.getByRole('button', { name: '전투 시작', exact: true }).click();
      await page.getByRole('button', { name: '바로 전투', exact: true }).click();
      await page.locator('.world-battlefield .unit-visual-hero').waitFor();
      await page.locator('.world-battlefield .unit-visual-hero').click();
      const before = await save(page);
      for (const method of ['cancel', 'close', 'escape', 'backdrop']) {
        await page.locator('.cmd-item').click();
        const modal = page.locator('.world-item-dialog');
        await modal.waitFor();
        assert.ok(await modal.evaluate(el => el.matches(':modal')), 'Item window must be in the top layer');
        if (method === 'cancel') { await snapshot(page, `items-${viewport.width}`); await modal.getByRole('button', { name: '취소', exact: true }).click(); }
        if (method === 'close') await modal.getByRole('button', { name: '아이템 닫기' }).click();
        if (method === 'escape') await page.keyboard.press('Escape');
        if (method === 'backdrop') await page.mouse.click(2, 2);
        await modal.waitFor({ state: 'detached' });
        assert.equal(await page.locator('.cmd-item').isEnabled(), true);
      }
      const after = await save(page);
      assert.deepEqual(after.data.inventory, before.data.inventory, 'Cancel must not consume items');
      assert.deepEqual(after.data.units, before.data.units, 'Cancel must not spend an action');
      const fixture = structuredClone(after);
      const hero = fixture.data.units.find(unit => unit.id === 'hero');
      const enemy = fixture.data.units.find(unit => unit.type !== 'ally');
      enemy.move = 0; enemy.range = 1; enemy.skillRange = 1; enemy.hp = enemy.maxHp;
      fixture.data.units = [hero, enemy];
      fixture.data.selectedStage.units = structuredClone(fixture.data.units);
      fixture.data.selectedUnit = 'hero';
      fixture.data.hazards = [];
      await restore(page, fixture);
      await page.getByRole('button', { name: '전장 확대', exact: true }).click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => {
        window.turnCameraFrames = [];
        const start = performance.now();
        const sample = () => {
          const cell = document.querySelector('.camera-focus-tile')?.closest('.tile');
          const shell = document.querySelector('.battle-map-scroll-shell');
          if (cell && shell) window.turnCameraFrames.push({ x: +cell.dataset.mapX, y: +cell.dataset.mapY, top: shell.scrollTop, left: shell.scrollLeft });
          if (performance.now() - start < 8000) requestAnimationFrame(sample);
        };
        sample();
      });
      await page.locator('.battle-end-turn-float').click();
      await page.waitForFunction(({ x, y }) => window.turnCameraFrames.some(frame => frame.x === x && frame.y === y), enemy);
      await snapshot(page, `enemy-turn-${viewport.width}`);
      await page.waitForFunction(({ x, y }) => window.turnCameraFrames.some(frame => frame.x === x && frame.y === y), hero);
      const frames = await page.evaluate(() => window.turnCameraFrames);
      assert.ok(Math.max(...frames.map(frame => frame.top)) - Math.min(...frames.map(frame => frame.top)) > 20 || Math.max(...frames.map(frame => frame.left)) - Math.min(...frames.map(frame => frame.left)) > 20, 'Camera must actually scroll between teams');
      assert.ok(await page.locator('.map-zoom-normal').count(), 'Auto camera preserves zoom');
      await snapshot(page, `ally-turn-${viewport.width}`);
      if (viewport.width === 390) {
        const combatFixture = structuredClone(fixture);
        const ally = combatFixture.data.units[0];
        const foe = combatFixture.data.units[1];
        const adjacent = await page.locator('.world-battlefield .tile').evaluateAll((tiles, unit) => tiles
          .map(tile => ({ x: +tile.dataset.mapX, y: +tile.dataset.mapY, blocked: tile.classList.contains('terrain-block'), occupied: !!tile.querySelector('.unit') }))
          .find(tile => !tile.blocked && !tile.occupied && Math.abs(tile.x - unit.x) + Math.abs(tile.y - unit.y) === 1), ally);
        assert.ok(adjacent);
        Object.assign(foe, { x: adjacent.x, y: adjacent.y, hp: 999, maxHp: 999, atk: 1, def: 1, move: 0 });
        combatFixture.data.selectedStage.units = structuredClone(combatFixture.data.units);
        await restore(page, combatFixture);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.locator('.world-battlefield .unit-visual-hero').click();
        await page.locator('.cmd-attack').click();
        await page.locator(`.world-battlefield .tile[data-map-x="${foe.x}"][data-map-y="${foe.y}"] .unit`).click();
        await page.getByRole('button', { name: '공격 실행', exact: true }).click();
        await page.locator('.painted-combat').waitFor();
        assert.ok(await page.locator('.painted-combat .fighter-action').evaluate(img => img.complete && img.naturalWidth === 512));
        await snapshot(page, 'live-combat-mobile');
        await page.locator('.painted-combat-overlay').waitFor({ state: 'detached', timeout: 20000 });
        assert.equal(await page.locator('.runtime-error-overlay').count(), 0);
      }
      await page.close();
      console.log(`UI ${viewport.width}: item cancellation, turn camera, settings passed`);

      for (const [unit, kind] of [['hero', 'attack'], ['lina', 'attack'], ['irene', 'skill'], ['aria', 'heal'], ['raider', 'miss']]) {
        const demo = await browser.newPage({ viewport });
        demo.on('pageerror', error => errors.push(error.message));
        await demo.goto(`${base}/tests/fixtures/combat.html?unit=${unit}&kind=${kind}`);
        await demo.locator('.painted-combat img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
        await demo.evaluate(() => document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 1600; }));
        const first = await demo.screenshot();
        const bounds = await demo.locator('.painted-combat').boundingBox();
        assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height, 'Combat fits viewport');
        await demo.evaluate(() => document.getAnimations().forEach(animation => { animation.currentTime = 2300; }));
        const second = await demo.screenshot();
        const a = await sharp(first).raw().toBuffer();
        const b = await sharp(second).raw().toBuffer();
        let changed = 0;
        for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 20) changed++;
        assert.ok(changed > 100, 'Combat frames must visibly change');
        await snapshot(demo, `combat-${unit}-${kind}-${viewport.width}`);
        await demo.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await demo.locator('.fighter-attacker').evaluate(el => getComputedStyle(el).animationName), 'none');
        await demo.close();
      }
    }
    assert.deepEqual(errors, []);
    await writeFile(`${out}/result.json`, JSON.stringify({ passed: true, viewports: [1280, 390, 320], errors }, null, 2));
  } finally {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: `${out}/last-state.png` });
      console.log(await page.evaluate(() => ({ frames: window.turnCameraFrames, text: document.body.innerText.slice(-1800) })));
    }
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
