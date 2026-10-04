import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.GAME_URL || 'http://127.0.0.1:5178';
const output = 'tmp/character-codex-qa';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const reports = [];
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
    const page = await browser.newPage({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.addInitScript(() => localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false })));
    const button = name => page.getByRole('button', { name, exact: true });
    const save = () => page.evaluate(() => localStorage.getItem('cheonsu_v01_save'));
    const card = id => page.locator(`[data-character="${id}"]`);
    const verifyImages = async () => {
      await page.locator('.collection-art img,.character-detail-identity img').evaluateAll(async images => {
        await Promise.all(images.map(async img => {
          img.loading = 'eager';
          await img.decode();
          if (!img.naturalWidth || !img.naturalHeight) throw new Error(`Blank collection image: ${img.src}`);
        }));
      });
    };
    const capture = async name => {
      await verifyImages();
      await page.screenshot({ path: `${output}/${viewport.width}-${name}.png` });
      const overflow = await page.locator('.character-codex,.collection-grid,.collection-filters,.collection-tabs,.character-detail-dialog[open]').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.className));
      assert.deepEqual(overflow, [], name);
    };
    await page.goto(base);
    await button('도감').click();
    await page.locator('.collection-card').first().waitFor();
    assert.equal(await page.locator('.collection-card').count(), 17);
    assert.equal(await page.locator('[data-collected=true]').count(), 4);
    await card('hero').locator('img').evaluate(img => img.decode());
    assert.equal(await card('hero').locator('img').evaluate(img => getComputedStyle(img).filter), 'none');
    assert.match(await card('leon').locator('img').evaluate(img => getComputedStyle(img).filter), /grayscale\(1\)/);
    await capture('initial');
    await card('hero').click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.locator('.character-detail-skills > div').count(), 2);
    await capture('detail');
    for (let i = 0; i < 4; i++) await button('다음 캐릭터').click();
    assert.equal(await page.locator('#character-detail-title').innerText(), '레온');
    assert.equal(await page.locator('.character-detail-skills').count(), 0);
    assert.match(await page.locator('.collection-condition').innerText(), /2장/);
    await capture('locked-detail');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByLabel('수집 상태', { exact: true }).selectOption('locked');
    assert.equal(await page.locator('.collection-card').count(), 13);
    await page.getByRole('textbox', { name: '도감 검색' }).fill('리나');
    assert.equal(await page.locator('.collection-card').count(), 0);
    await page.getByLabel('수집 상태', { exact: true }).selectOption('owned');
    assert.equal(await page.locator('.collection-card').count(), 1);
    await button('검색 지우기').click();
    await page.getByLabel('수집 상태', { exact: true }).selectOption('all');
    await button('적군').click();
    assert.equal(await page.locator('.collection-card').count(), 25);
    assert.equal(await page.locator('[data-collected=true]').count(), 0);
    await button('보스').click();
    assert.equal(await page.locator('.collection-card').count(), 5);
    await button('지역·시스템').click();
    assert.equal(await page.locator('.collection-records article').count(), 34);
    assert.equal(await save(), null, 'browsing must not create a save');
    await button('뒤로').click();
    await page.locator('.journey-title').waitFor();
    await button('새 게임').click();
    await page.locator('.campaign-header .prominent-save').click();
    await page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('cheonsu_v01_save'));
      value.clearedStages = [1, 2];
      localStorage.setItem('cheonsu_v01_save', JSON.stringify(value));
    });
    await page.reload();
    const before = await save();
    await button('도감').click();
    assert.equal(await card('leon').getAttribute('data-collected'), 'true');
    assert.equal(await card('sera').getAttribute('data-collected'), 'false');
    assert.equal(await page.locator('[data-collected=true]').count(), 5);
    await capture('owned');
    await button('적군').click();
    assert.ok(await page.locator('[data-collected=true]').count() > 0);
    await capture('enemies');
    await button('보스').click();
    assert.equal(await card('boss_commander').getAttribute('data-collected'), 'true');
    assert.equal(await card('boss_abyss').getAttribute('data-collected'), 'false');
    assert.equal(await save(), before, 'title collection never changes original save');
    await button('뒤로').click();
    await button('기록실').click();
    await button('도감·기록').click();
    await button('도감').click();
    await button('뒤로').click();
    await page.locator('.journey-library').waitFor();
    assert.equal(await save(), before);
    await page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('cheonsu_v01_save'));
      value.clearedStages = Array.from({ length: 30 }, (_, i) => i + 1);
      localStorage.setItem('cheonsu_v01_save', JSON.stringify(value));
    });
    await page.reload();
    await button('도감').click();
    for (const [kind, count] of [['동료', 17], ['적군', 25], ['보스', 5]]) {
      await button(kind).click();
      assert.equal(await page.locator('[data-collected=true]').count(), count, `${kind}: full campaign can complete the catalog`);
      await verifyImages();
    }
    assert.deepEqual(errors, []);
    reports.push({ viewport, passed: true });
    console.log(`PASS codex ${viewport.width}x${viewport.height}: 47 entries, grayscale/color, details, filters, save, back navigation`);
    await page.close();
  }
  await fs.writeFile(`${output}/result.json`, JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
