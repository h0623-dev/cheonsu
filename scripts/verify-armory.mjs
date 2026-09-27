import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { stages } from '../src/data/stages.js';
import { makeAlly, applyEquipmentStats } from '../src/engine/partyEngine.js';
import { EQUIPMENT } from '../src/data/equipment.js';
import { CHARACTER_SKILLS } from '../src/data/skills.js';

const url = process.env.GAME_URL || 'http://127.0.0.1:5176';
const key = 'cheonsu_v01_save';
const out = 'tmp/armory-qa';
const cases = [
  { width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 },
  { width: 844, height: 390 }, { width: 416, height: 658, native: 335 },
];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const reports = [];
await mkdir(out, { recursive: true });
try {
  for (const spec of cases) {
    const context = await browser.newContext({ viewport: spec, serviceWorkers: 'block' });
    await context.addInitScript(code => {
      localStorage.setItem('cheonsu_auto_patch', 'false');
      if (!code) return;
      window.androidBridge = {};
      window.Capacitor = {
        PluginHeaders: [{ name: 'LiveUpdate', methods: ['ready', 'getVersionCode'].map(name => ({ name, rtype: 'promise' })) }],
        nativePromise: async (_, method) => method === 'getVersionCode' ? { versionCode: String(code) } : {},
      };
    }, spec.native);
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const read = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    const open = async () => {
      await page.getByRole('button', { name: '장비점으로 이동', exact: true }).click();
      await page.locator('.facility-armory').waitFor();
    };
    try {
      await page.goto(url);
      await page.getByRole('button', { name: '새 게임', exact: true }).click();
      await page.locator('.campaign-header .prominent-save').click();
      const seed = await read();
      const members = new Map(stages.flatMap(stage => stage.units).filter(unit => unit.type === 'ally').map(unit => [unit.id, unit]));
      const names = { sera: '세라', noah: '노아', yuna: '유나', rakan: '라칸', miho: '미호', teo: '테오', irene: '이레네', kaz: '카즈', ella: '엘라', jin: '진', luka: '루카', baekho: '백호' };
      for (const id of Object.keys(CHARACTER_SKILLS)) if (!members.has(id)) members.set(id, { ...members.get('hero'), id, name: names[id] });
      seed.party = [...members.values()].map(unit => applyEquipmentStats(makeAlly({ ...unit, gearEnhance: { ironSword: 2, chainArmor: 1 }, equipment: { weapon: null, armor: null } })));
      seed.screen = 'camp'; seed.gold = 10000; seed.gearInventory = Object.keys(EQUIPMENT);
      seed.gearEnhance = { ironSword: 2, chainArmor: 1 };
      await page.evaluate(({ seed, key }) => localStorage.setItem(key, JSON.stringify(seed)), { seed, key });
      await page.reload();
      await page.getByRole('button', { name: '이어하기', exact: true }).click();
      await open();
      const dialog = page.locator('.facility-armory');
      assert.equal(await dialog.getByRole('combobox').count(), 0);
      const roster = dialog.getByRole('tablist', { name: '장비 캐릭터' });
      assert.equal(await roster.getByRole('tab').count(), seed.party.length);
      await roster.getByRole('tab', { name: '카일 장비', exact: true }).click();
      await dialog.getByRole('button', { name: '철검 선택', exact: true }).click();
      assert.match(await dialog.locator('.armory-comparison-stats').innerText(), /\+3/);
      const before = (await read()).party.find(unit => unit.id === 'hero');
      await dialog.getByRole('button', { name: '철검 장착', exact: true }).click();
      assert.ok(await dialog.getByRole('button', { name: '철검 장착', exact: true }).isDisabled());
      await dialog.locator('.prominent-save').click();
      const equipped = (await read()).party.find(unit => unit.id === 'hero');
      assert.equal(equipped.atk, before.atk + 3);
      assert.equal(equipped.equipment.weapon, 'ironSword');
      await dialog.getByRole('button', { name: '방어구', exact: true }).click();
      await dialog.getByRole('button', { name: '사슬 갑옷 선택', exact: true }).click();
      await dialog.getByRole('button', { name: '사슬 갑옷 장착', exact: true }).click();
      await dialog.getByRole('button', { name: '가죽 갑옷 선택', exact: true }).click();
      assert.match(await dialog.locator('.armory-comparison-stats').innerText(), /-2/);
      await dialog.getByRole('button', { name: '가죽 갑옷 장착', exact: true }).click();
      await dialog.locator('.prominent-save').click();
      assert.equal((await read()).party.find(unit => unit.id === 'hero').def, before.def + 1);
      // Browsing another portrait discards only the comparison, never equips on selection.
      await roster.getByRole('tab', { name: '리나 장비', exact: true }).click();
      assert.equal(await dialog.getByRole('button', { name: '철검 선택', exact: true }).count(), 0);
      await dialog.getByRole('button', { name: '화염 지팡이 선택', exact: true }).click();
      await roster.getByRole('tab', { name: '카일 장비', exact: true }).click();
      await roster.getByRole('tab', { name: '카일 장비', exact: true }).press('End');
      assert.equal(await roster.getByRole('tab').last().getAttribute('aria-selected'), 'true');
      await roster.getByRole('tab').last().press('Home');
      assert.equal(await roster.getByRole('tab').first().getAttribute('aria-selected'), 'true');
      await dialog.getByRole('button', { name: '무기 해제', exact: true }).click();
      assert.match(await dialog.locator('.armory-comparison-stats').innerText(), /-3/);
      await page.screenshot({ path: `${out}/armory-${spec.width}.png` });
      const issues = await dialog.evaluate(element => {
        const issues = [], box = element.getBoundingClientRect();
        const safeBottom = document.documentElement.classList.contains('native-legacy-insets') ? 56 : 0;
        if (box.left < 0 || box.right > innerWidth || box.top < 0 || box.bottom > innerHeight - safeBottom) issues.push('dialog outside safe viewport');
        for (const node of element.querySelectorAll('.armory-comparison, .armory-unit-overview, .armory-slot-tabs, .armory-gear, header, footer')) {
          if (node.scrollWidth > node.clientWidth + 1) issues.push(`${node.className}: overflow`);
        }
        for (const image of element.querySelectorAll('img')) if (!image.complete || !image.naturalWidth) issues.push('missing portrait');
        const action = element.querySelector('.armory-equip');
        if (innerHeight > 520) {
          const rect = action.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          if (!action.contains(hit)) issues.push('equip action obscured');
        }
        return issues;
      });
      assert.deepEqual(issues, []);
      await dialog.getByRole('button', { name: '무기 해제 적용', exact: true }).click();
      await dialog.locator('.prominent-save').click();
      assert.equal((await read()).party.find(unit => unit.id === 'hero').atk, before.atk);
      assert.equal((await read()).party.find(unit => unit.id === 'lina').equipment.weapon, null);
      await dialog.getByRole('button', { name: '시설 닫기', exact: true }).click();
      await page.reload(); await page.getByRole('button', { name: '이어하기', exact: true }).click();
      await open();
      await dialog.getByRole('button', { name: '방어구', exact: true }).click();
      assert.match(await dialog.locator('.armory-current').innerText(), /가죽 갑옷/);
      await dialog.getByRole('button', { name: '제련소', exact: true }).click();
      assert.equal(await dialog.count(), 0);
      assert.deepEqual(errors, []);
      reports.push({ ...spec, partyCount: seed.party.length, passed: true });
      console.log(`PASS armory ${spec.width}x${spec.height}, ${seed.party.length} portraits`);
    } catch (error) {
      await page.screenshot({ path: `${out}/failure-${spec.width}.png` }).catch(() => {});
      await writeFile(`${out}/failure-${spec.width}.txt`, `${error.stack}\n${await page.locator('body').innerText()}`);
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(reports, null, 2));
}
