import { qaBrowserOptions, confirmStageMission } from './qa-browser.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CHARACTER_SKILLS } from '../src/data/skills.js';

const key = 'cheonsu_v01_save';
const out = 'tmp/growth-qa';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(qaBrowserOptions());
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function restore(page, data) {
  await page.evaluate(({ key, data }) => {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, cutsceneMode: 'off', battleSpeed: 'fast', effectsOn: true }));
  }, { key, data });
  await page.reload();
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  await page.locator(data.screen === 'camp' ? '.town-hub' : '.world-battlefield').waitFor();
}
async function save(page, camp = false) {
  await page.locator(camp ? '.camp-header .prominent-save' : '.battle-control-heading .prominent-save').click();
  return read(page);
}
async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  const problems = await page.evaluate(() => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page overflow');
    for (const el of document.querySelectorAll('.company-training-dialog[open]')) {
      const r = el.getBoundingClientRect();
      if (r.left < 0 || r.right > innerWidth + 1 || r.top < 0 || r.bottom > innerHeight + 1 || el.scrollWidth > el.clientWidth + 1) issues.push('dialog overflow');
      for (const button of el.querySelectorAll('button')) {
        if (button.scrollWidth > button.clientWidth + 1) issues.push('button overflow');
      }
    }
    return issues;
  });
  assert.deepEqual(problems, []);
}
async function attack(page, skillId) {
  if (skillId) {
    await page.locator('.cmd-skill').click();
    await page.locator(`[data-skill-id="${skillId}"]`).click();
  } else await page.locator('.cmd-attack').click();
  await page.locator('.battle-target-buttons button:enabled').first().click();
  assert.equal(await page.locator('.vs-preview-modal').count(), 0);
  await page.locator('.world-battlefield [data-unit-id="growth-target"]').waitFor({ state: 'detached' });
}
function sync(data) { data.selectedStage.units = structuredClone(data.units); return data; }
const experience = unit => (unit.level - 1) * 100 + unit.exp;
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
    page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { const random = Math.random; Math.random = () => .5 + random() * .001; });
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5176');
    await page.getByRole('button', { name: '새 게임', exact: true }).click();
    await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: /^1장\./ }) }).click();
    await page.getByRole('button', { name: '전투 시작', exact: true }).click();
    await page.getByRole('button', { name: '바로 전투', exact: true }).click(); await confirmStageMission(page);
    const original = await save(page);
    const camp = structuredClone(original); camp.screen = 'camp'; camp.trainingUsed = false;
    camp.clearedStages = [1]; camp.lastBattleResult = { stageId: 1, outcome: 'victory' };
    camp.party = Object.keys(CHARACTER_SKILLS).map(id => ({ ...structuredClone(original.party.find(unit => unit.id === id) || original.party[0]), id, name: id, exp: 90, level: 1 }));
    await restore(page, camp);
    const beforeTraining = await save(page, true);
    await page.getByRole('button', { name: '훈련소으로 이동', exact: true }).click();
    await page.getByRole('button', { name: '훈련', exact: true }).click();
    const dialog = page.locator('.company-training-dialog');
    assert.equal(await dialog.evaluate(el => el.matches(':modal')), true);
    assert.equal(await dialog.locator('[data-training-unit]').count(), Object.keys(CHARACTER_SKILLS).length);
    await shot(page, `training-before-${viewport.width}`);
    await page.evaluate(() => document.documentElement.classList.add('native-legacy-insets'));
    await shot(page, `training-legacy-native-${viewport.width}`);
    const safe = await dialog.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.top >= 42 && box.bottom <= innerHeight - 56 &&
        (innerHeight >= innerWidth || (box.left >= 56 && box.right <= innerWidth - 56));
    });
    assert.ok(safe, 'training controls stay outside legacy Android system bars');
    await page.evaluate(() => document.documentElement.classList.remove('native-legacy-insets'));
    // Same-task repeated events must still consume the camp opportunity once.
    await dialog.locator('[data-training-id="attack"]').evaluate(button => { button.click(); button.click(); });
    assert.equal(await dialog.locator('[data-training-id]:disabled').count(), 3);
    await shot(page, `training-after-${viewport.width}`);
    await page.getByRole('button', { name: '훈련 닫기', exact: true }).click();
    const trained = await save(page, true);
    for (const before of beforeTraining.party) {
      const after = trained.party.find(unit => unit.id === before.id);
      assert.equal(experience(after) - experience(before), 20);
      assert.equal(after.baseAtk - before.baseAtk, 2, `${before.id}: training + level growth`);
    }
    await restore(page, trained);
    await page.getByRole('button', { name: '훈련소으로 이동', exact: true }).click();
    await page.getByRole('button', { name: '훈련', exact: true }).click();
    assert.equal(await page.locator('[data-training-id]:disabled').count(), 3);
    await page.getByRole('button', { name: '훈련 닫기', exact: true }).click();
    assert.deepEqual((await save(page, true)).party, trained.party);

    const fixture = structuredClone(original);
    fixture.selectedStage.map = Array.from({ length: 12 }, () => Array(12).fill('plain'));
    fixture.hazards = []; fixture.selectedUnit = 'hero'; fixture.turn = 'ally'; fixture.mode = 'move'; fixture.round = 1;
    fixture.party = original.party.map(unit => ({ ...unit, exp: 0, level: 1 }));
    fixture.deployedIds = ['hero', 'bram', 'lina'];
    const hero = { ...fixture.party[0], x: 4, y: 8, atk: 900, baseAtk: 900, acted: false, moved: false, status: [] };
    const bram = { ...fixture.party[1], x: 7, y: 9, acted: false, moved: false, status: [] };
    const target = { ...original.units.find(unit => unit.type === 'enemy'), id: 'growth-target', name: '경험치 대상', x: 4, y: 7, hp: 1, maxHp: 100, def: 0, atk: 1, skl: 100, luk: 0, move: 0, range: 1, minRange: 1, skillRange: 1, skillType: 'attack', aiType: 'aggressive', status: [] };
    const boss = { ...original.units.find(unit => unit.type === 'boss'), x: 10, y: 1, hp: 9999, maxHp: 9999, move: 0, range: 1, skillRange: 1, status: [] };
    fixture.units = [hero, bram, target, boss]; sync(fixture);
    await restore(page, fixture);
    await attack(page);
    const killed = await save(page);
    assert.deepEqual(killed.party.map(unit => unit.exp), [30, 9, 9, 0], 'killer, live share, fallen share, bench');
    assert.ok(!killed.units.some(unit => unit.id === 'lina'), 'fallen ally is not respawned');
    await shot(page, `kill-${viewport.width}`);
    await restore(page, killed);
    const loaded = await save(page);
    assert.deepEqual(loaded.party.map(unit => unit.exp), [30, 9, 9, 0]);
    assert.ok(!loaded.units.some(unit => unit.id === 'lina'));

    const reveal = page.getByRole('button', { name: '정보 표시', exact: true });
    const aoe = structuredClone(fixture);
    const noah = { ...structuredClone(bram), id: 'noah', name: '노아', x: 5, y: 8, atk: 900, baseAtk: 900, skillCooldowns: {}, skillLevel: 0 };
    aoe.party.push(noah); aoe.deployedIds.push('noah'); aoe.selectedUnit = 'noah';
    aoe.units.push(noah, { ...target, id: 'growth-splash', x: 5, y: 7 }); sync(aoe);
    await restore(page, aoe); await attack(page, 'chain');
    const areaSave = await save(page);
    assert.deepEqual(areaSave.party.map(unit => unit.exp), [18, 18, 18, 0, 60], 'two enemy kills distribute twice, not twice per victim');

    const burn = structuredClone(fixture);
    burn.units.find(unit => unit.id === target.id).status = [{ type: 'burn', turns: 2, sourceId: 'lina' }]; sync(burn);
    await restore(page, burn);
    if (await reveal.isVisible()) await reveal.click();
    await page.getByRole('button', { name: /턴 종료/ }).click();
    await page.locator('.world-battlefield [data-unit-id="growth-target"]').waitFor({ state: 'detached' });
    const burned = await save(page);
    assert.deepEqual(burned.party.map(unit => unit.exp), [9, 9, 30, 0], 'fallen caster retains burn-kill credit');

    const victory = structuredClone(fixture);
    Object.assign(victory.units.find(unit => unit.id === target.id), { x: 10, y: 2, hp: 9999 });
    Object.assign(victory.units.find(unit => unit.type === 'boss'), { x: 4, y: 7, hp: 1, def: 0 }); sync(victory);
    await restore(page, victory);
    await page.locator('.cmd-attack').click();
    await page.locator('.battle-target-buttons button:enabled').first().click();
    assert.equal(await page.locator('.vs-preview-modal').count(), 0);
    await page.locator('.victory-dialog .clear-save-ok').waitFor();
    const won = await read(page);
    assert.equal(won.screen, 'camp');
    assert.deepEqual(won.party.map(unit => unit.exp), [50, 15, 15, 0], 'boss shares survive victory autosave');

    for (const [id, skillId, boost, cooldown] of [['bram', 'bulwark', 4, 2], ['rakan', 'roar', 5, 2]]) {
      const self = structuredClone(fixture);
      const actor = { ...structuredClone(bram), id, name: id, x: 7, y: 9, skillCooldowns: {}, skillLevel: 0 };
      self.units = [hero, actor, boss]; self.party = [hero, actor]; self.deployedIds = ['hero', id]; self.selectedUnit = id; sync(self);
      await restore(page, self);
      await page.locator('.cmd-skill').click();
      await page.locator(`[data-skill-id="${skillId}"]`).evaluate(button => { button.click(); button.click(); });
      assert.equal(await page.locator('.support-target-dialog').count(), 0);
      const cast = await save(page);
      const after = cast.units.find(unit => unit.id === id);
      assert.equal(after.guard, true); assert.equal(after.def, actor.def + boost);
      assert.equal(after.acted, true); assert.equal(after.skillCooldowns[skillId], cooldown);
      assert.equal(cast.battleStats.skillsUsed, fixture.battleStats.skillsUsed + 1);
    }
    const ward = structuredClone(aoe); await restore(page, ward);
    await page.locator('.cmd-skill').click();
    await page.locator('[data-skill-id="ward"]').click();
    await page.locator('.support-target-dialog').waitFor();
    assert.equal(await page.locator('.support-target-dialog [aria-pressed="true"]').count(), 0);
    await page.getByRole('button', { name: '보조 마법 취소', exact: true }).click();
    assert.equal((await save(page)).units.find(unit => unit.id === 'noah').acted, false);
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}x${viewport.height}: ${Object.keys(CHARACTER_SKILLS).length}명 훈련·중복 방지·일반/범위/상태/보스 경험치·전사/대기 동료·자동 저장·방어기·보호기`);
    await page.close();
  }
} finally { await browser.close(); }
