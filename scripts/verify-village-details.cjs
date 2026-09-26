const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.GAME_URL || 'http://127.0.0.1:5176';
const key = 'cheonsu_v01_save';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  page.setDefaultTimeout(12000);
  page.on('dialog', dialog => dialog.dismiss());
  await page.routeWebSocket('**', () => {});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base);
    await page.getByRole('button', { name: '새 게임', exact: true }).click();
    await page.locator('.campaign-header-actions').getByRole('button', { name: '마을', exact: true }).click();
    await page.locator('.camp-header .prominent-save').click();
    const seed = await read(page);
    await page.locator('.save-notice').waitFor();
    await page.locator('.save-notice').waitFor({ state: 'detached', timeout: 5000 });
    const town = page.locator('.town-map-shell');
    await town.focus(); await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => document.querySelector('.town-walker')?.dataset.townY === '11');
    await page.getByRole('button', { name: '장비점으로 이동', exact: true }).click();
    const facility = page.locator('.town-facility-dialog'); await facility.waitFor();
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      const box = await facility.boundingBox();
      assert.ok(box.x >= 11 && box.y >= 11 && box.y + box.height <= viewport.height - 11);
      assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 1);
      await page.screenshot({ path: `tmp/village-qa/centered-armory-${viewport.width}.png`, timeout: 10000 });
    }
    await facility.getByRole('button', { name: '시설 닫기', exact: true }).click();
    const label = await page.locator('.town-door-armory').boundingBox();
    const walker = await page.locator('.town-walker').boundingBox();
    assert.ok(label.y + label.height <= walker.y, 'facility label must stay above the arriving character');
    await page.screenshot({ path: 'tmp/village-qa/town-arrival.png', timeout: 10000 });
    const injury = structuredClone(seed); injury.screen = 'camp'; injury.party[0].hp = 1;
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data: injury });
    await page.reload(); await page.getByRole('button', { name: '이어하기', exact: true }).click();
    await page.getByRole('button', { name: '여관으로 이동', exact: true }).click();
    await facility.waitFor();
    assert.match(await facility.locator('.town-rest-party').innerText(), /HP 1 \/ /);
    await facility.getByRole('button', { name: '모두 휴식 · 무료', exact: true }).click();
    await facility.locator('.prominent-save').click();
    assert.ok((await read(page)).party.every(unit => unit.hp === unit.maxHp));
    await facility.getByRole('button', { name: '시설 닫기', exact: true }).click();

    const victory = await page.evaluate(async seed => {
      const { stages } = await import('/src/data/stages.js');
      const { mergePartyIntoStage } = await import('/src/engine/partyEngine.js');
      const stage = stages[0];
      return { ...seed, selectedStage: stage, screen: 'battle', selectedUnit: null, mode: 'move', turn: 'ally',
        clearedStages: [], stageRewardClaimed: false, units: mergePartyIntoStage(stage, seed.party).filter(unit => unit.type === 'ally') };
    }, seed);
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data: victory });
    await page.addInitScript(() => {
      const write = Storage.prototype.setItem;
      window.failProgressWrite = true;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'cheonsu_v01_save' && window.failProgressWrite) throw new DOMException('test quota', 'QuotaExceededError');
        return write.call(this, key, value);
      };
    });
    await page.reload(); await page.getByRole('button', { name: '이어하기', exact: true }).click();
    const retry = page.locator('.victory-dialog').getByRole('button', { name: '자동저장 재시도', exact: true }); await retry.waitFor();
    assert.deepEqual(await read(page), victory, 'failed autosave preserves previous primary');
    await page.evaluate(() => { window.failProgressWrite = false; });
    await retry.click();
    await page.locator('.victory-dialog .clear-save-ok').waitFor();
    const recovered = await read(page);
    assert.equal(recovered.screen, 'camp'); assert.deepEqual(recovered.clearedStages, [1]);
    assert.ok(recovered.gold > seed.gold);
    assert.equal(recovered.careerStats.victories, seed.careerStats.victories + 1, 'retry does not settle twice');
    assert.deepEqual(errors, []);
    await fs.writeFile('tmp/village-qa/details-report.json', JSON.stringify({ success: true, checks: ['centered facility at 390/320/1280', 'toast dismissal', 'keyboard movement', 'injured-party rest', 'quota failure retains save', 'retry saves once'], errors }, null, 2));
    console.log('PASS village details and autosave failure/retry');
  } catch (error) {
    await page.screenshot({ path: 'tmp/village-qa/details-failure.png', timeout: 10000 }).catch(() => {});
    await fs.writeFile('tmp/village-qa/details-failure.txt', `${error.stack}\n${errors.join('\n')}\n${await page.locator('body').innerText()}`);
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
