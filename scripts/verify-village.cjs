const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.GAME_URL || 'http://127.0.0.1:5176';
const out = 'tmp/village-qa';
const key = 'cheonsu_v01_save';
const reports = [];
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function restore(page, data, extra = {}) {
  await page.evaluate(({ key, data, extra }) => {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, cutsceneMode: 'off', ...extra }));
  }, { key, data, extra });
  await page.reload();
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  await page.locator(data.screen === 'camp' ? '.town-hub' : '.world-battlefield').waitFor();
}
async function screenshot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 10000 });
  const issues = await page.evaluate(() => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page overflow');
    for (const element of document.querySelectorAll('dialog[open], .battle-control-heading, .town-controls, .town-destinations')) {
      if (!element.getClientRects().length) continue;
      const box = element.getBoundingClientRect();
      if (box.left < 0 || box.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1) issues.push(`${element.className}: overflow`);
      if (element.tagName === 'DIALOG' && (box.top < 0 || box.bottom > innerHeight)) issues.push('dialog vertical overflow');
    }
    return issues;
  });
  assert.deepEqual(issues, [], name);
}
async function saveBattle(page) {
  const save = page.locator('.battle-control-heading .prominent-save');
  await save.click();
  return read(page);
}
async function attackBoss(page) {
  await page.locator('.cinematic-command-bar .cmd-attack').click();
  await page.locator('.battle-target-buttons button:enabled').first().click();
  await page.getByRole('button', { name: '공격 실행', exact: true }).click();
  await page.locator('.victory-dialog .clear-save-ok').waitFor();
  return read(page);
}
async function main() {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      await page.routeWebSocket('**', () => {});
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => { const random = Math.random; Math.random = () => .5 + random() * .001; });
      try {
        console.log(`START ${viewport.width}x${viewport.height}`);
        await page.goto(base);
        await page.getByRole('button', { name: '새 게임', exact: true }).click();
        const stage = id => page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${id}장\\.`) }) });
        assert.ok(await stage(2).isDisabled()); assert.ok(await stage(30).isDisabled());
        await page.locator('.campaign-header .prominent-save').click();
        assert.deepEqual((await read(page)).unlockedStages, [1]);
        await stage(1).click();
        await page.getByRole('button', { name: '전투 시작', exact: true }).click();
        await page.getByRole('button', { name: '바로 전투', exact: true }).click();
        await page.locator('.world-battlefield').waitFor();
        const fixture = await saveBattle(page);
        await screenshot(page, `battle-save-${viewport.width}`);
        const hero = fixture.units.find(unit => unit.id === 'hero');
        const boss = fixture.units.find(unit => unit.type === 'boss');
        const neighbor = fixture.selectedStage.map.flatMap((row, y) => row.flatMap((tile, x) => tile !== 'block' && Math.abs(x - hero.x) + Math.abs(y - hero.y) === 1 ? [{ x, y }] : []))[0];
        Object.assign(hero, { atk: 900, baseAtk: 900, acted: false, moved: false });
        Object.assign(boss, neighbor, { hp: 1, maxHp: 100, def: 0, baseDef: 0 });
        fixture.units = fixture.units.filter(unit => unit.type === 'ally' || unit.id === boss.id);
        fixture.selectedStage.units = structuredClone(fixture.units);
        fixture.selectedUnit = 'hero'; fixture.turn = 'ally'; fixture.mode = 'move';
        await restore(page, fixture);
        const won = await attackBoss(page);
        assert.equal(won.screen, 'camp', 'automatic checkpoint before leaving victory');
        assert.ok(won.gold > fixture.gold);
        assert.deepEqual(won.clearedStages, [1]); assert.deepEqual(won.unlockedStages, [1, 2]);
        await screenshot(page, `victory-autosave-${viewport.width}`);
        await page.reload();
        await page.getByRole('button', { name: '이어하기', exact: true }).click();
        await page.locator('.town-hub').waitFor();
        await page.locator('.camp-header .prominent-save').click();
        assert.equal((await read(page)).gold, won.gold, 'reload cannot award twice');
        await screenshot(page, `town-${viewport.width}`);
        for (const [place, title] of [['상점', '상점'], ['장비점', '장비점'], ['여관', '여관'], ['훈련소', '훈련소']]) {
          const start = await page.locator('.town-walker').evaluate(el => `${el.dataset.townX},${el.dataset.townY}`);
          await page.getByRole('button', { name: `${place}으로 이동`, exact: true }).click();
          const dialog = page.locator('.town-facility-dialog'); await dialog.waitFor();
          assert.equal(await dialog.evaluate(el => el.matches(':modal')), true);
          assert.equal(await dialog.locator('h2').textContent(), title);
          assert.notEqual(await page.locator('.town-walker').evaluate(el => `${el.dataset.townX},${el.dataset.townY}`), start);
          if (place === '상점') {
            const before = await read(page);
            await dialog.getByRole('button', { name: /회복약 구매/ }).first().click();
            await dialog.locator('.prominent-save').click();
            const bought = await read(page);
            assert.ok(bought.gold < before.gold); assert.equal(bought.inventory.potion, before.inventory.potion + 1);
          }
          if (place === '장비점') {
            await dialog.getByLabel('장비 캐릭터').selectOption('hero');
            const equip = dialog.getByRole('button', { name: '철검 장착', exact: true });
            if (await equip.isDisabled()) await dialog.locator('.town-equipment-slots > div').first().getByRole('button').click();
            await equip.click();
            await dialog.locator('.prominent-save').click();
            assert.equal((await read(page)).party.find(unit => unit.id === 'hero').equipment.weapon, 'ironSword');
          }
          if (place === '여관') {
            await dialog.getByRole('button', { name: '모두 휴식 · 무료', exact: true }).click();
            await dialog.locator('.prominent-save').click();
            assert.ok((await read(page)).party.every(unit => unit.hp === unit.maxHp));
          }
          await screenshot(page, `facility-${place}-${viewport.width}`);
          await dialog.getByRole('button', { name: '시설 닫기', exact: true }).click();
        }
        await page.getByRole('button', { name: '출전으로 이동', exact: true }).click();
        await page.locator('.campaign-stage-select').waitFor();
        assert.ok(await stage(1).isEnabled()); assert.ok(await stage(2).isEnabled()); assert.ok(await stage(3).isDisabled());
        const replay = structuredClone(fixture); replay.clearedStages = [1]; replay.gold = won.gold; replay.inventory = won.inventory; replay.gearInventory = won.gearInventory;
        replay.units.find(unit => unit.id === 'hero').exp = 0;
        await restore(page, replay);
        const rew = await attackBoss(page);
        assert.equal(rew.gold, replay.gold); assert.deepEqual(rew.inventory, replay.inventory); assert.deepEqual(rew.gearInventory, replay.gearInventory);
        assert.ok(rew.party.find(unit => unit.id === 'hero').exp > 0 || rew.party.find(unit => unit.id === 'hero').level > replay.units.find(unit => unit.id === 'hero').level);
        // Choose a healthy-enough ally while a lower-HP ally is also eligible.
        const support = structuredClone(fixture);
        support.units = support.units.map(unit => unit.type === 'ally' ? { ...unit, x: hero.x, y: hero.y, hp: unit.maxHp - 2, acted: false, skillCooldowns: {} } : { ...unit, x: hero.x + 7, y: hero.y + 3, hp: 100 });
        const aria = support.units.find(unit => unit.id === 'aria');
        assert.ok(aria, 'initial healer');
        support.units.find(unit => unit.id === 'hero').hp = 1;
        support.units.find(unit => unit.id === 'lina').x += 1;
        support.units.find(unit => unit.id === 'bram').x += 8;
        support.selectedStage.units = structuredClone(support.units);
        support.selectedUnit = 'aria';
        await restore(page, support);
        const beforeSupport = await saveBattle(page);
        await page.locator('.cmd-skill').click();
        await page.locator('.skill-choice-dialog [data-skill-id="light"]').click();
        const targetDialog = page.locator('.support-target-dialog'); await targetDialog.waitFor();
        assert.equal(await targetDialog.locator('[aria-pressed="true"]').count(), 0);
        assert.ok(await targetDialog.getByRole('button', { name: '마법 사용', exact: true }).isDisabled());
        assert.ok(await targetDialog.locator('[data-target-id="bram"]').isDisabled());
        await targetDialog.getByRole('button', { name: '취소', exact: true }).click();
        const canceled = await saveBattle(page); assert.deepEqual(canceled.units, beforeSupport.units);
        await page.locator('.cmd-skill').click(); await page.locator('.skill-choice-dialog [data-skill-id="light"]').click();
        await targetDialog.locator('[data-target-id="lina"]').click();
        await screenshot(page, `support-choice-${viewport.width}`);
        await targetDialog.getByRole('button', { name: '마법 사용', exact: true }).click();
        await targetDialog.waitFor({ state: 'detached' });
        const healed = await saveBattle(page);
        assert.equal(healed.units.find(unit => unit.id === 'hero').hp, 1);
        assert.equal(healed.units.find(unit => unit.id === 'lina').hp, healed.units.find(unit => unit.id === 'lina').maxHp);
        assert.equal(healed.units.find(unit => unit.id === 'aria').acted, true);
        assert.equal(healed.units.find(unit => unit.id === 'aria').skillCooldowns.light, 2);
        assert.deepEqual(errors, []);
        reports.push({ viewport, result: 'passed', checks: ['visible save', 'clear autosave', 'reload', 'sequential unlock', 'replay XP only', 'walk to four facilities', 'purchase/equipment/inn', 'manual healing/cancel/range/cooldown'], errors });
        console.log(`PASS ${viewport.width}x${viewport.height}`);
      } catch (error) {
        console.error(`FAIL ${viewport.width}: ${error.message}`);
        await page.screenshot({ path: `${out}/failure-${viewport.width}.png`, timeout: 10000 }).catch(() => {});
        await fs.writeFile(`${out}/failure-${viewport.width}.txt`, `${error.stack}\n${errors.join('\n')}\n${await page.locator('body').innerText().catch(() => '')}`);
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await fs.writeFile(`${out}/report.json`, JSON.stringify(reports, null, 2)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
