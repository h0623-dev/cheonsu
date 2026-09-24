const { chromium } = require('playwright');
const { mkdir, writeFile } = require('node:fs/promises');
const assert = require('node:assert/strict');

async function main() {
  const { isPaintedGround } = await import('../src/data/battlefieldGround.js');
  const stage = Number(process.argv[2] || 1);
  const out = 'tmp/world-art-qa';
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  const failures = [];
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => failures.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5176');
      await page.screenshot({ path: `${out}/menu-${viewport.width}.png` });
      await page.getByRole('button', { name: '새 게임', exact: true }).click();
      await page.locator('.campaign-stage-select button').filter({ hasText: new RegExp(`^${stage}${stage}장\\.`) }).click();
      await page.screenshot({ path: `${out}/campaign-${stage}-${viewport.width}.png` });
      await page.getByRole('button', { name: '전투 시작', exact: true }).click();
      await page.locator('.story-screen img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.story-character-stage img')).opacity) > 0.99);
      await page.screenshot({ path: `${out}/story-${stage}-${viewport.width}.png`, animations: 'disabled' });
      await page.getByRole('button', { name: '바로 전투', exact: true }).click();
      await page.locator('.grounded-battlefield .unit-visual-hero').waitFor();
      await page.locator('.grounded-battlefield img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
      const focusHero = () => page.locator('.battle-map-scroll-shell').evaluate(shell => {
        const hero = shell.querySelector('.unit-visual-hero');
        const box = hero.getBoundingClientRect();
        const view = shell.getBoundingClientRect();
        shell.scrollTo({ top: shell.scrollTop + box.top - view.top - shell.clientHeight * 0.48, left: shell.scrollLeft + box.left - view.left - shell.clientWidth * 0.48, behavior: 'instant' });
      });
      await focusHero();
      await page.screenshot({ path: `${out}/stage-${stage}-${viewport.width}.png` });
      const geometry = await page.locator('.grounded-battlefield').evaluate(map => {
        const rect = map.getBoundingClientRect();
        const tile = map.querySelector('.tile').getBoundingClientRect();
        const units = [...map.querySelectorAll('.unit.sprite-unit')].map(unit => {
          const cell = unit.closest('.tile').getBoundingClientRect();
          const img = unit.querySelector('img');
          const image = img.getBoundingClientRect();
          return {
            name: img.alt, src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0,
            groundX: (+unit.closest('.tile').dataset.mapX + 0.5) / Number(map.style.getPropertyValue('--map-cols')),
            groundY: (+unit.closest('.tile').dataset.mapY + 0.7) / Number(map.style.getPropertyValue('--map-rows')),
            blocked: unit.closest('.tile').classList.contains('terrain-block'),
            height: image.height, tileWidth: cell.width,
            anchorError: Math.abs((image.bottom - image.height * 32 / 480) - (cell.top + cell.height * 0.7)),
          };
        });
        return { width: rect.width, height: rect.height, originError: tile.top - rect.top, tileHeight: tile.height, tileWidth: tile.width, units };
      });
      assert.ok(Math.abs(geometry.tileHeight / geometry.tileWidth - 0.82) < 0.001, 'Every stage must use the same orthographic ground projection');
      assert.ok(Math.abs(geometry.originError) < 0.5, 'Tile origin must match artwork origin');
      assert.ok(geometry.units.every(unit => unit.loaded && unit.src.includes('/art/world-v2/units/')), 'All battle characters must load the new artwork');
      assert.ok(geometry.units.every(unit => unit.anchorError < 1), 'All feet must share the ground anchor');
      assert.ok(geometry.units.every(unit => unit.height / unit.tileWidth < 1.55), 'Characters must scale with tiles');
      assert.ok(geometry.units.every(unit => !unit.blocked && isPaintedGround(stage, unit.groundX, unit.groundY)), 'Every deployed character must stand on painted ground, including extended boards');

      if (!(await page.locator('.grounded-battlefield .unit-visual-hero.selected-unit').count())) {
        await page.locator('.grounded-battlefield .unit-visual-hero').click();
      }
      const source = await page.locator('.grounded-battlefield .unit-visual-hero').evaluate(unit => ({ x: +unit.closest('.tile').dataset.mapX, y: +unit.closest('.tile').dataset.mapY }));
      const destination = await page.locator('.grounded-battlefield .tile:has(.move-tile)').evaluateAll((tiles, from) => tiles.map(tile => ({ x: +tile.dataset.mapX, y: +tile.dataset.mapY, occupied: !!tile.querySelector('.unit') })).find(tile => !tile.occupied && Math.abs(tile.x - from.x) + Math.abs(tile.y - from.y) === 1), source);
      assert.ok(destination, 'Hero must have a reachable adjacent tile');
      const target = page.locator(`.grounded-battlefield .tile[data-map-x="${destination.x}"][data-map-y="${destination.y}"]`);
      await page.evaluate(() => {
        window.battleArtTravel = { samples: [], done: false };
        const sample = () => {
          const unit = document.querySelector('.tile-moving-unit');
          if (unit) {
            const box = unit.getBoundingClientRect();
            const cell = unit.closest('.tile').getBoundingClientRect();
            window.battleArtTravel.samples.push({ x: box.x - cell.x, y: box.y - cell.y, width: cell.width, height: cell.height });
          } else if (window.battleArtTravel.samples.length) {
            window.battleArtTravel.done = true;
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await target.click();
      await page.waitForFunction(() => window.battleArtTravel.done);
      const travel = await page.evaluate(() => {
        const samples = window.battleArtTravel.samples;
        return { dx: Math.max(...samples.map(s => s.x)) - Math.min(...samples.map(s => s.x)), dy: Math.max(...samples.map(s => s.y)) - Math.min(...samples.map(s => s.y)), samples: samples.length, width: samples[0].width, height: samples[0].height };
      });
      assert.ok(Math.hypot(travel.dx, travel.dy) > 1, 'Movement animation must actually travel between tiles');
      assert.ok(travel.dx <= travel.width + 1 && travel.dy <= travel.height + 1, 'Adjacent movement must stay within one tile');
      assert.ok(travel.dx >= travel.width * 0.65 || travel.dy >= travel.height * 0.65, 'Travel must reach the destination before the sprite is removed');
      await page.locator('.tile-moving-unit').waitFor({ state: 'detached' });
      await page.locator(`.tile[data-map-x="${destination.x}"][data-map-y="${destination.y}"] .unit-visual-hero`).waitFor();
      await page.screenshot({ path: `${out}/moved-${stage}-${viewport.width}.png` });
      await page.getByRole('button', { name: '전장 확대', exact: true }).click();
      await page.locator('.map-zoom-normal').waitFor();
      await focusHero();
      const zoom = await page.locator('.grounded-battlefield .unit-visual-hero').evaluate(unit => {
        const cell = unit.closest('.tile').getBoundingClientRect();
        const img = unit.querySelector('img').getBoundingClientRect();
        return { scale: img.height / cell.width, anchorError: Math.abs(img.bottom - img.height * 32 / 480 - cell.top - cell.height * 0.7) };
      });
      assert.ok(zoom.scale < 1.55 && zoom.anchorError < 1, 'Zoom must preserve scale and foot alignment');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const idleAnimation = await page.locator('.grounded-battlefield .unit-visual-hero img').evaluate(img => getComputedStyle(img).animationName);
      assert.equal(idleAnimation, 'none', 'Reduced-motion preference must disable breathing');
      await page.screenshot({ path: `${out}/zoomed-${stage}-${viewport.width}.png` });
      const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(bodyOverflow, false, 'Page must not overflow horizontally');
      if (stage === 1) {
        await page.locator('.cinematic-stage-actions button').filter({ hasText: '설정' }).click();
        await page.locator('.battle-settings-menu button').filter({ hasText: '진행 저장' }).click();
        const save = await page.evaluate(() => Object.entries(localStorage).map(([key, value]) => {
          try { return { key, data: JSON.parse(value) }; } catch { return null; }
        }).find(entry => entry?.data?.screen === 'battle' && entry.data.units?.length));
        assert.ok(save, 'Battle save must exist');
        await page.reload();
        await page.getByRole('button', { name: '이어하기', exact: true }).click();
        await page.locator('.world-battlefield .unit-visual-hero').waitFor();
        const restored = await page.locator('.world-battlefield .unit-visual-hero').evaluate(unit => ({ x: +unit.closest('.tile').dataset.mapX, y: +unit.closest('.tile').dataset.mapY }));
        assert.equal(restored.x, destination.x);
        assert.equal(restored.y, destination.y);
        const resumed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), save.key);
        assert.deepEqual(resumed.selectedStage.map, save.data.selectedStage.map, 'Visual refresh must preserve saved terrain');
        assert.equal(resumed.gold, save.data.gold, 'Visual refresh must preserve progress');
        // An isolated save fixture opens the existing camp view without changing real saves.
        await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify({ ...data, screen: 'camp' })), { key: save.key, data: resumed });
        await page.reload();
        await page.getByRole('button', { name: '이어하기', exact: true }).click();
        await page.locator('.camp-screen').waitFor();
        const campImages = await page.locator('.camp-screen img').evaluateAll(async images => {
          await Promise.all(images.map(img => img.decode()));
          return images.map(img => img.getAttribute('src'));
        });
        assert.ok(campImages.length && campImages.every(src => src.startsWith('/art/world-v2/')));
        const campLayout = await page.locator('.camp-tab-panel').evaluate(panel => ({ listBottom: panel.querySelector('.camp-character-row').getBoundingClientRect().bottom, actionsTop: panel.querySelector('.camp-menu-grid').getBoundingClientRect().top }));
        assert.ok(campLayout.actionsTop >= campLayout.listBottom, 'Camp controls must not cover portraits');
        await page.screenshot({ path: `${out}/camp-${viewport.width}.png` });
      }
      await writeFile(`${out}/geometry-${stage}-${viewport.width}.json`, JSON.stringify({ geometry, source, destination, travel }, null, 2));
      console.log(JSON.stringify({ stage, viewport, units: geometry.units.length, ratio: geometry.width / geometry.height, travel, status: 'passed' }));
      await page.close();
    }
    assert.deepEqual(failures, [], 'No browser runtime errors');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
