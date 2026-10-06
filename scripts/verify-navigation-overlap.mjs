import { saveBattle as clickBattleSave } from './qa-battle-tools.mjs';
import { qaBrowserOptions, confirmStageMission } from './qa-browser.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = process.env.GAME_URL || 'http://127.0.0.1:5176';
const cases = [
  { name: 'legacy-samsung', width: 416, height: 658, code: 335, bottom: 48 },
  { name: 'legacy-small', width: 320, height: 568, code: 335, bottom: 48 },
  { name: 'legacy-landscape', width: 844, height: 390, code: 335, side: 48, bottom: 24 },
  { name: 'legacy-gestures', width: 390, height: 844, code: 335, bottom: 24 },
  { name: 'new-apk-fitted', width: 416, height: 582, code: 336, bottom: 0 },
  { name: 'new-apk-landscape', width: 796, height: 362, code: 336, bottom: 0 },
  { name: 'web', width: 1280, height: 900, code: null, bottom: 0 },
];
const only = process.env.NAV_CASE;
fs.mkdirSync('tmp/navigation-qa', { recursive: true });
const browser = await chromium.launch(qaBrowserOptions());
try {
  for (const spec of cases.filter(spec => !only || spec.name === only)) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, serviceWorkers: 'block' });
    await context.addInitScript(({ code }) => {
      localStorage.setItem('cheonsu_auto_patch', 'false');
      if (!code) return;
      window.androidBridge = {};
      window.Capacitor = {
        PluginHeaders: [{ name: 'LiveUpdate', methods: ['ready', 'getVersionCode'].map(name => ({ name, rtype: 'promise' })) }],
        nativePromise: async (plugin, method) => method === 'getVersionCode' ? { versionCode: String(code) } : {},
      };
    }, spec);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**', () => {});
    try {
      await page.goto(url);
      await page.getByRole('button', { name: '새 게임', exact: true }).click();
      await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: /^1장\./ }) }).click();
      await page.getByRole('button', { name: '전투 시작', exact: true }).click();
      await page.getByRole('button', { name: '바로 전투', exact: true }).click(); await confirmStageMission(page);
      await page.locator('.unit-visual-hero').waitFor();
      await clickBattleSave(page);
      const seed = await page.evaluate(() => JSON.parse(localStorage.getItem('cheonsu_v01_save')));
      const original = seed.units.find(unit => unit.id === 'hero');
      assert.ok(original);
      await page.evaluate(({ bottom, side }) => {
        const overlay = document.createElement('div'); overlay.id = 'mock-android-navigation';
        overlay.textContent = side ? '뒤로\n홈\n최근' : '최근                     홈                     뒤로';
        Object.assign(overlay.style, { position: 'fixed', zIndex: '2147483647', background: '#151d21', color: 'white', textAlign: 'center', display: 'grid', placeContent: 'center', pointerEvents: 'auto',
          ...(side ? { right: '0', top: '0', bottom: '0', width: `${side}px`, whiteSpace: 'pre-line' } : { left: '0', right: '0', bottom: '0', height: `${bottom}px` }) });
        if (bottom || side) document.body.appendChild(overlay);
      }, spec);
      const bar = page.locator('.cinematic-command-bar');
      async function move() {
        if (!await page.locator('.unit-visual-hero.selected-unit').count()) await page.locator('.unit-visual-hero').click();
        await page.waitForTimeout(700);
        const cell = await page.locator('.movable-tile-cell').evaluateAll(elements => {
          const hero = document.querySelector('.unit-visual-hero')?.closest('.tile');
          const x = Number(hero?.dataset.mapX), y = Number(hero?.dataset.mapY);
          const candidates = elements.filter(tile => !tile.querySelector('.unit'));
          candidates.sort((a, b) => (Math.abs(Number(a.dataset.mapX) - x) + Math.abs(Number(a.dataset.mapY) - y)) - (Math.abs(Number(b.dataset.mapX) - x) + Math.abs(Number(b.dataset.mapY) - y)));
          for (const tile of candidates) {
            const r = tile.getBoundingClientRect();
            const px = r.x + r.width / 2, py = r.y + r.height / 2;
            if (tile.contains(document.elementFromPoint(px, py))) return { x: tile.dataset.mapX, y: tile.dataset.mapY };
          }
          return null;
        });
        assert.ok(cell, 'real movement tile must be reachable through a pointer');
        await page.locator(`.tile[data-map-x="${cell.x}"][data-map-y="${cell.y}"]`).click();
        await bar.locator('.cmd-undo').waitFor();
        await page.waitForFunction(() => !document.querySelector('.cmd-undo')?.disabled);
      }
      async function assertButtons(label) {
        assert.equal(await page.locator('.action-panel.post-move-action-panel').isVisible(), false, 'legacy duplicate action panel stays hidden');
        const result = await bar.locator(':scope > button').evaluateAll((buttons, spec) => buttons.map(button => {
          const r = button.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { text: button.innerText, reachable: hit === button || button.contains(hit),
            fits: r.bottom <= innerHeight - spec.bottom && r.left >= (spec.side || 0) && r.right <= innerWidth - (spec.side || 0), height: r.height };
        }), spec);
        assert.equal(result.length, 5, `${label}: all five post-move commands visible`);
        assert.ok(result.every(row => row.reachable && row.fits && row.height >= 44), `${label}: ${JSON.stringify(result)}`);
      }
      await move();
      await assertButtons('post-move');
      await bar.locator('.cmd-attack').click();
      await page.locator('.battle-command-feedback').waitFor();
      await assertButtons('attack selected');
      if (spec.name === 'legacy-samsung') {
        await page.setViewportSize({ width: 658, height: 416 });
        await assertButtons('rotated in the same session');
        await page.setViewportSize({ width: spec.width, height: spec.height });
        await assertButtons('rotated back');
      }
      await page.screenshot({ path: `tmp/navigation-qa/${spec.name}-attack.png` });
      await bar.locator('.cmd-skill').click();
      const skills = page.locator('.skill-choice-dialog'); await skills.waitFor();
      await skills.getByRole('button', { name: '스킬 선택 닫기' }).click();
      await bar.locator('.cmd-item').click();
      const items = page.locator('.world-item-dialog'); await items.waitFor();
      const cancel = items.getByRole('button', { name: '취소', exact: true });
      const cancelBox = await cancel.boundingBox();
      assert.ok(cancelBox.y + cancelBox.height <= spec.height - spec.bottom, 'item cancel stays above system navigation');
      await cancel.click();
      await assertButtons('after dialog cancellation');
      await bar.locator('.cmd-undo').click();
      await bar.locator('.cmd-undo').waitFor({ state: 'detached' });
      await clickBattleSave(page);
      const undone = await page.evaluate(() => JSON.parse(localStorage.getItem('cheonsu_v01_save')).units.find(unit => unit.id === 'hero'));
      assert.deepEqual([undone.x, undone.y, undone.acted, undone.moved], [original.x, original.y, false, false]);
      await move(); await bar.locator('.cmd-wait').click();
      await clickBattleSave(page);
      const waited = await page.evaluate(() => JSON.parse(localStorage.getItem('cheonsu_v01_save')).units.find(unit => unit.id === 'hero'));
      assert.equal(waited.acted, true);
      assert.deepEqual(errors, []);
      console.log(`PASS ${spec.name}: move/attack/skill/item/cancel/wait, real pointer hit tests, save preservation`);
    } catch (error) {
      await page.screenshot({ path: `tmp/navigation-qa/${spec.name}-failed.png` });
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
