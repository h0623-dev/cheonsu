import { qaBrowserOptions, confirmStageMission } from './qa-browser.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stages } from '../src/data/stages.js';

const base = process.env.GAME_URL || 'http://127.0.0.1:5176';
const key = 'cheonsu_v01_save', backupKey = 'cheonsu_v01_progress_recovery_backup';
const all = stages.map(stage => stage.id);
const out = 'tmp/settings-progress-qa';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(qaBrowserOptions());
const cases = [
  { width: 360, height: 740, native: 335 }, { width: 412, height: 915, native: 335 },
  { width: 320, height: 568, native: 335 }, { width: 740, height: 360, native: 335 },
  { width: 568, height: 320, native: 335 }, { width: 360, height: 740, native: 344 },
  { width: 740, height: 360, native: 344 }, { width: 1280, height: 900 },
];
try {
  for (const spec of cases) {
    const context = await browser.newContext({ viewport: spec, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(code => {
      localStorage.setItem('cheonsu_auto_patch', 'false');
      if (!localStorage.getItem('cheonsu_settings_v1')) localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false, cutsceneMode: 'off' }));
      if (code) {
        window.androidBridge = {};
        window.Capacitor = {
          PluginHeaders: [{ name: 'LiveUpdate', methods: ['ready', 'getVersionCode'].map(name => ({ name, rtype: 'promise' })) }],
          nativePromise: async (_, method) => method === 'getVersionCode' ? { versionCode: String(code) } : {},
        };
      }
    }, spec.native);
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    await page.routeWebSocket('**', () => {});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const readRaw = () => page.evaluate(key => localStorage.getItem(key), key);
    const restore = async data => {
      await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data });
      await page.reload(); await button('이어하기').click();
    };
    const open = async () => {
      if (await button('정보 표시').isVisible()) await button('정보 표시').click();
      await page.locator('.cinematic-stage-actions').getByRole('button', { name: '설정', exact: true }).click();
      await page.locator('.battle-settings-popover').waitFor();
    };
    const assertStages = async ids => {
      await page.locator('.campaign-screen').waitFor();
      const available = await page.locator('.world-stage-node').evaluateAll(nodes => nodes.filter(node => !node.disabled).map(node => Number(node.querySelector('.node-number').textContent)));
      assert.deepEqual(available, ids);
    };
    await page.goto(base);
    await button('새 게임').click();
    await page.locator('.campaign-header .prominent-save').click();
    const campaign = JSON.parse(await readRaw());
    await page.locator('.world-stage-node').filter({ has: page.locator('strong', { hasText: /^1장\./ }) }).click();
    await button('전투 시작').click(); await button('바로 전투').click(); await confirmStageMission(page);
    await page.locator('.world-battlefield').waitFor();
    await page.locator('.battle-control-heading .prominent-save').click();
    const battle = { ...JSON.parse(await readRaw()), clearedStages: [1], unlockedStages: all };
    await restore(battle); await page.locator('.world-battlefield').waitFor();
    const before = await readRaw();
    await open();
    const dialog = page.locator('.battle-settings-popover');
    assert.ok(await dialog.evaluate(el => el.matches(':modal')));
    const legacy = spec.native === 335;
    const safe = { top: legacy ? 42 : 0, bottom: legacy ? 56 : 0, side: legacy && spec.width > spec.height ? 56 : 0 };
    const check = async () => {
      for (const target of [dialog, dialog.getByRole('button', { name: '전투 설정 닫기', exact: true }), ...await dialog.locator('.battle-settings-exit-menu button').all()]) {
        const box = await target.boundingBox();
        assert.ok(box && box.x >= safe.side && box.y >= safe.top && box.x + box.width <= spec.width - safe.side + 1 && box.y + box.height <= spec.height - safe.bottom + 1, `system bar overlap: ${JSON.stringify({ spec, box })}`);
      }
      const clipped = await dialog.locator('.battle-settings-head,.battle-settings-exit-menu button').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.className));
      assert.deepEqual(clipped, []);
    };
    await check();
    const title = dialog.getByRole('button', { name: '메인 타이틀 메뉴', exact: true });
    const initialBox = await title.boundingBox();
    await dialog.locator('.battle-settings-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert.deepEqual(await title.boundingBox(), initialBox, 'exit buttons stay fixed while options scroll');
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'focus cannot enter the battlefield');
    }
    await check();
    await page.screenshot({ path: `${out}/settings-${spec.width}-${spec.native || 'web'}.png` });
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    await open(); await title.click(); await page.locator('.journey-title').waitFor();
    assert.equal(await readRaw(), before, 'title navigation must not overwrite the checkpoint');
    await button('이어하기').click(); await page.locator('.world-battlefield').waitFor();
    await open(); await dialog.getByRole('button', { name: '월드맵 스테이지 선택', exact: true }).click();
    await assertStages([1, 2]);
    const originalCampaign = all.slice(0, 30);
    for (const [cleared, expected] of [[[1, 30], [1, 2, 30]], [[], [1]], [originalCampaign, all.slice(0, 31)], [all, all], [[1], [1, 2]]]) {
      await restore({ ...campaign, clearedStages: cleared, unlockedStages: all });
      await assertStages(expected);
      await page.locator('.campaign-header .prominent-save').click();
      assert.deepEqual(JSON.parse(await readRaw()).unlockedStages, expected);
    }
    await restore({ ...campaign, screen: 'deployment', selectedStage: campaign.selectedStage, clearedStages: [] });
    await page.locator('.deployment-screen').waitFor();
    await button('전투 시작').click(); await page.locator('.narrative-stage').waitFor();
    await button('바로 전투').click(); await confirmStageMission(page); await page.locator('.world-battlefield').waitFor();
    const inflated = { ...campaign, clearedStages: all, unlockedStages: all, gold: 812 };
    await restore(inflated); await assertStages(all);
    await page.reload(); await button('설정').click(); await button('저장').click();
    await page.getByText('클리어 진행도 복구', { exact: true }).click();
    await page.getByLabel('완료한 마지막 장').selectOption('1');
    page.once('dialog', dialog => dialog.dismiss());
    await button('진행도 복구 적용').click();
    assert.deepEqual(JSON.parse(await readRaw()), inflated, 'cancel is read-only');
    page.once('dialog', dialog => dialog.accept());
    await button('진행도 복구 적용').click(); await assertStages([1, 2]);
    const repaired = JSON.parse(await readRaw());
    for (const field of ['party', 'gold', 'inventory', 'gearInventory', 'gearEnhance']) assert.deepEqual(repaired[field], inflated[field]);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), backupKey), inflated);
    await page.reload(); await button('이어하기').click(); await assertStages([1, 2]);
    await page.reload(); await button('설정').click(); await button('저장').click();
    await page.getByText('클리어 진행도 복구', { exact: true }).click();
    await button('복구 전 원본 되돌리기').click(); await assertStages(all);
    assert.deepEqual(JSON.parse(await readRaw()), inflated);
    assert.deepEqual(errors, []);
    console.log(`PASS ${spec.width}x${spec.height} native=${spec.native || 'web'}: 설정 안전 영역/터치/포커스/이어하기/해금/진행도 복구/원본 복원`);
    await context.close();
  }
} finally { await browser.close(); }
