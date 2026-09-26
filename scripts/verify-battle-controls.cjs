const { chromium } = require('playwright');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseArgs } = require('node:util');

const { values: options } = parseArgs({ options: { case: { type: 'string' }, viewport: { type: 'string' } } });
options.case ||= process.env.TEST_CASE;
options.viewport ||= process.env.TEST_VIEWPORT;

const base = process.env.GAME_URL || 'http://127.0.0.1:5176';
const out = path.resolve(__dirname, '../tmp/battle-controls-qa');
const SAVE_KEY = 'cheonsu_v01_save';
const SETTINGS_KEY = 'cheonsu_settings_v1';
const viewports = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
const results = [];

async function readSave(page) {
  const data = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  assert.ok(data?.units?.length, 'The real Save control must write a populated battle save');
  return data;
}

async function saveBattle(page) {
  await page.locator('.cinematic-stage-actions button').filter({ hasText: '설정' }).click();
  await page.locator('.battle-settings-menu button').filter({ hasText: '진행 저장' }).click();
  await page.locator('.battle-settings-menu').first().waitFor({ state: 'hidden' });
  return readSave(page);
}

async function restore(page, fixture, settings) {
  await page.evaluate(({ saveKey, settingsKey, data, options }) => {
    localStorage.setItem(saveKey, JSON.stringify(data));
    localStorage.setItem(settingsKey, JSON.stringify(options));
  }, { saveKey: SAVE_KEY, settingsKey: SETTINGS_KEY, data: fixture, options: settings });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  await page.locator('.world-battlefield').waitFor();
}

async function selectUnit(page, id) {
  await page.locator(`.world-battlefield .unit-visual-${id}`).click();
  await page.waitForFunction(() => {
    const button = document.querySelector('.cinematic-command-bar .cmd-skill');
    return button && !button.disabled;
  });
}

async function openSkills(page) {
  await page.locator('.cinematic-command-bar .cmd-skill').click();
  const dialog = page.locator('.skill-choice-dialog');
  await dialog.waitFor();
  assert.ok(await dialog.evaluate(element => element.matches(':modal')), 'Skill picker must be a native modal');
  assert.equal(await page.locator('.cmd-skill').getAttribute('aria-pressed'), 'true');
  return dialog;
}

function battleState(data) {
  return Object.fromEntries([
    'units', 'inventory', 'gold', 'battleLoot', 'battleStats', 'unitBattleStats',
    'round', 'turn', 'stageRewardClaimed',
  ].map(key => [key, data[key]]));
}

async function assertNoAction(page, before) {
  const after = await saveBattle(page);
  assert.deepEqual(battleState(after), battleState(before), 'Cancellation must not spend an action, HP, cooldown, item, or reward');
  assert.equal(after.mode, 'move', 'Cancellation returns to movement mode');
}

async function snapshot(page, test, name) {
  const file = `${test.name}-${name}-${test.viewport.width}.png`;
  await page.screenshot({ path: path.join(out, file), timeout: 10000 });
  test.screenshots.push(file);
  // Map and target strips intentionally scroll. Check the page and containing controls instead.
  const layout = await page.evaluate(() => {
    const problems = [];
    const viewport = { width: innerWidth, height: innerHeight };
    for (const element of [document.documentElement, document.body]) {
      if (element.scrollWidth > innerWidth + 1) problems.push(`${element.tagName}: horizontal page overflow (${element.scrollWidth})`);
    }
    for (const element of document.querySelectorAll('.cinematic-command-bar, dialog[open], .painted-combat')) {
      if (!element.getClientRects().length) continue;
      const rect = element.getBoundingClientRect();
      if (rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.bottom > innerHeight + 1) {
        problems.push(`${element.className}: outside ${innerWidth}x${innerHeight} viewport`);
      }
      if (element.scrollWidth > element.clientWidth + 1) problems.push(`${element.className}: internal horizontal overflow`);
    }
    for (const element of document.querySelectorAll('dialog[open] .world-item-sheet, .battle-control-heading, .skill-choice-list > button, .defeat-actions > button')) {
      if (!element.getClientRects().length) continue;
      if (element.scrollWidth > element.clientWidth + 1) problems.push(`${element.className || element.textContent.trim()}: clipped horizontal content`);
    }
    for (const button of document.querySelectorAll('.skill-choice-list > button, .defeat-actions > button')) {
      const bounds = button.getBoundingClientRect();
      for (const text of button.querySelectorAll('strong, small, em, b')) {
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const rect of range.getClientRects()) {
          if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) problems.push(`${text.textContent}: text overflows its button`);
        }
      }
    }
    const sheet = document.querySelector('dialog[open] .world-item-sheet');
    const style = sheet ? getComputedStyle(sheet) : null;
    return { viewport, problems, dialogStyle: style && { background: style.backgroundColor, color: style.color, fontFamily: style.fontFamily } };
  });
  test.layouts.push({ screenshot: file, ...layout });
  test.failures.push(...layout.problems.map(problem => `${file}: ${problem}`));
}

function synchronizeStage(fixture) {
  // Save migration rebuilds units from selectedStage.units, so both copies must match.
  fixture.selectedStage.units = structuredClone(fixture.units);
  return fixture;
}

async function bootstrap(page) {
  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  await page.locator('.campaign-header .prominent-save').click();
  await page.evaluate(() => {
    const key = 'cheonsu_v01_save';
    const data = JSON.parse(localStorage.getItem(key));
    data.clearedStages = Array.from({ length: 10 }, (_, i) => i + 1);
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: /^11장\./ }) }).click();
  await page.getByRole('button', { name: '전투 시작', exact: true }).click();
  await page.getByRole('button', { name: '바로 전투', exact: true }).click();
  await page.locator('.world-battlefield .unit-visual-hero').waitFor();
  const fixture = await saveBattle(page);
  assert.equal(fixture.selectedStage.id, 11, 'Fixtures originate from stage 11 started through the UI');
  const hero = fixture.units.find(unit => unit.id === 'hero');
  const lina = fixture.units.find(unit => unit.id === 'lina');
  const enemy = fixture.units.find(unit => unit.type !== 'ally' && unit.type !== 'boss');
  assert.ok(hero && lina && enemy, 'Stage 11 must supply hero, Lina, and a regular enemy');
  const tiles = await page.locator('.world-battlefield .tile').evaluateAll(elements => elements.map(element => ({
    x: Number(element.dataset.mapX), y: Number(element.dataset.mapY),
    blocked: element.classList.contains('terrain-block'),
  })));
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const adjacent = tiles.find(tile => !tile.blocked && distance(tile, hero) === 1);
  assert.ok(adjacent, 'Hero needs a legal adjacent enemy tile');
  const linaTile = tiles.find(tile => !tile.blocked && distance(tile, hero) > 0 && distance(tile, adjacent) > 0 && distance(tile, adjacent) <= 3);
  assert.ok(linaTile, 'Lina needs a separate tile within attack-skill range');
  for (const ally of [hero, lina]) Object.assign(ally, {
    hp: ally.maxHp, acted: false, moved: false, guard: false, skillGuardBoost: 0,
    skillLevel: 0, skillCooldown: 0, skillCooldowns: {}, status: [],
  });
  Object.assign(lina, { x: linaTile.x, y: linaTile.y });
  Object.assign(enemy, {
    x: adjacent.x, y: adjacent.y, hp: 9999, maxHp: 9999, atk: 1, def: 1,
    move: 0, range: 1, skillRange: 1, skillType: 'attack', status: [],
  });
  Object.assign(fixture, {
    units: [hero, lina, enemy], selectedUnit: null, mode: 'move', turn: 'ally', round: 1,
    hazards: [], gold: 4321, stageRewardClaimed: false,
  });
  synchronizeStage(fixture);
  const settings = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SETTINGS_KEY);
  return { fixture, settings: { ...settings, soundOn: false, musicOn: false, effectsOn: true, cutsceneMode: 'full', battleSpeed: 'normal' } };
}

async function verifyTargetFeedback(page, skillName, enemyName) {
  const feedback = page.locator('.battle-command-feedback');
  await feedback.waitFor();
  assert.equal((await feedback.locator('.battle-selection-heading [role="status"]').innerText()).trim(), `${skillName || '공격'} 선택됨`);
  assert.equal(await page.locator('.cmd-attack').getAttribute('aria-pressed'), skillName ? 'false' : 'true');
  assert.equal(await page.locator('.cmd-skill').getAttribute('aria-pressed'), skillName ? 'true' : 'false');
  const target = feedback.getByRole('button').filter({ hasText: enemyName });
  assert.equal(await target.count(), 1, 'An explicit enemy target must be listed');
  assert.ok(await target.isEnabled(), 'The adjacent enemy must be targetable');
  assert.match(await target.innerText(), /HP 9999\/9999.*대상 선택/s);
  return target;
}

async function cancelTarget(page) {
  await page.getByRole('button', { name: '명령 선택 취소', exact: true }).click();
  await page.locator('.battle-command-feedback').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.cmd-attack').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('.cmd-skill').getAttribute('aria-pressed'), 'false');
}

async function campWithoutRewards(page, test, fixture) {
  const dialog = page.locator('.defeat-dialog');
  await dialog.waitFor();
  assert.ok(await dialog.evaluate(element => element.matches(':modal')), 'Defeat result must be a native modal');
  assert.match(await dialog.innerText(), /전투 패배/);
  assert.match(await dialog.innerText(), /전투 보상은 지급되지 않았습니다/);
  for (const name of ['대기실로 이동', '재도전', '캠페인으로']) assert.ok(await dialog.getByRole('button', { name, exact: true }).isEnabled());
  await page.keyboard.press('Escape');
  assert.ok(await dialog.isVisible(), 'Escape must not strand the player in a defeated battle');
  await snapshot(page, test, 'dialog');
  await dialog.getByRole('button', { name: '대기실로 이동', exact: true }).click();
  await page.locator('.camp-screen').waitFor();
  await dialog.waitFor({ state: 'detached' });
  const gold = page.locator('.camp-screen .hud-box').filter({ hasText: '골드' }).locator('strong');
  assert.equal((await gold.innerText()).trim(), `${fixture.gold}G`, 'Defeat camp return must not award gold');
  await snapshot(page, test, 'camp');
  await page.locator('.camp-header .prominent-save').click();
  const after = await readSave(page);
  assert.equal(after.screen, 'camp');
  assert.equal(after.gold, fixture.gold);
  assert.equal(after.stageRewardClaimed, false);
  assert.deepEqual(after.inventory, fixture.inventory, 'Defeat must not grant consumable rewards');
  assert.deepEqual(after.gearInventory, fixture.gearInventory, 'Defeat must not grant equipment');
  assert.deepEqual(after.clearedStages, fixture.clearedStages, 'Defeat must not mark the stage cleared');
  assert.deepEqual(after.stageMastery, fixture.stageMastery, 'Defeat must not grant stage mastery');
  assert.equal(after.battleLoot.gold, 0, 'Unclaimed battle loot is discarded');
  assert.ok(after.party.every(unit => unit.hp === unit.maxHp), 'Camp return recovers the party');
  assert.equal(after.turn, 'ally');
  assert.equal(after.selectedUnit, null);
}

const scenarios = [
  ['hud-zoom', async (page, test, { fixture, settings }) => {
    await restore(page, fixture, settings);
    const zoom = page.locator('.battle-zoom-controls');
    await zoom.getByRole('button', { name: '전장 확대', exact: true }).click();
    const label = await zoom.locator('.battle-zoom-reset').innerText();
    await page.getByRole('button', { name: '정보 숨김', exact: true }).click();
    assert.equal(await zoom.count(), 0, 'Hidden HUD must remove zoom controls from view and keyboard navigation');
    await snapshot(page, test, 'hidden');
    await page.getByRole('button', { name: '정보 표시', exact: true }).click();
    assert.equal(await zoom.locator('.battle-zoom-reset').innerText(), label, 'Restoring HUD preserves zoom');
    await snapshot(page, test, 'restored');
  }],
  ['range-geometry', async (page, test, { fixture, settings }) => {
    await restore(page, fixture, settings);
    await selectUnit(page, 'lina');
    const actor = (await saveBattle(page)).units.find(unit => unit.id === 'lina');
    for (const [id, range] of [['ember', 3], ['snipe', 4], ['ember', 3]]) {
      await (await openSkills(page)).locator(`[data-skill-id="${id}"]`).click();
      const geometry = await page.locator('.world-battlefield .tile').evaluateAll((elements, { actor, range }) => {
        const expected = [], actual = [], problems = [];
        for (const tile of elements) {
          const x = Number(tile.dataset.mapX), y = Number(tile.dataset.mapY);
          const key = `${x},${y}`, distance = Math.abs(x - actor.x) + Math.abs(y - actor.y);
          if (!['block', 'wall', 'void'].some(type => tile.classList.contains(`terrain-${type}`)) && distance >= 1 && distance <= range) expected.push(key);
          const overlay = tile.querySelector('.skill-range-tile');
          if (!overlay) continue;
          actual.push(key);
          const parent = tile.getBoundingClientRect(), child = overlay.getBoundingClientRect();
          if (Math.abs(child.width - (parent.width - 2)) > 1 || Math.abs(child.height - (parent.height - 2)) > 1) problems.push(key);
          if (getComputedStyle(overlay).transform !== 'none') problems.push(`${key}: transformed`);
        }
        return { expected, actual, problems };
      }, { actor, range });
      assert.deepEqual(geometry.actual, geometry.expected, `${id}: painted tiles equal legal skill targets`);
      assert.deepEqual(geometry.problems, [], 'Range overlays must fit actual tile bounds');
      assert.equal(await page.locator('.enemy-threat-tile').count(), 0, 'Enemy danger must not look like additional skill range');
      assert.match(await page.locator('.battle-range-summary').innerText(), new RegExp(`사거리 ${range}칸`));
      await snapshot(page, test, id);
    }
    await cancelTarget(page);
    assert.equal(await page.locator('.command-range-tile').count(), 0);
    assert.ok(await page.locator('.enemy-threat-tile').count() > 0, 'Enemy danger is restored after command cancellation');
  }],
  ['area-range', async (page, test, { fixture, settings }) => {
    await restore(page, fixture, settings);
    const tiles = await page.locator('.world-battlefield .tile').evaluateAll(elements => elements.map(tile => ({
      x: Number(tile.dataset.mapX), y: Number(tile.dataset.mapY),
      blocked: ['block', 'wall', 'void'].some(type => tile.classList.contains(`terrain-${type}`)),
    })));
    const data = structuredClone(fixture);
    const caster = data.units.find(unit => unit.id === 'lina');
    Object.assign(caster, { id: 'noah', name: '노아', skl: 999 });
    const target = data.units.find(unit => unit.type !== 'ally');
    const splashCell = tiles.find(tile => !tile.blocked && Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y) === 1 &&
      !data.units.some(unit => unit.x === tile.x && unit.y === tile.y));
    assert.ok(splashCell);
    data.units.push({ ...target, id: 'splash-target', name: '광역 대상', x: splashCell.x, y: splashCell.y });
    synchronizeStage(data);
    await restore(page, data, settings);
    await page.evaluate(() => { const random = Math.random; Math.random = () => 0.5 + random() * 0.001; });
    await selectUnit(page, 'noah');
    await (await openSkills(page)).locator('[data-skill-id="chain"]').click();
    const button = page.locator('.battle-target-buttons button').filter({ hasText: target.name });
    await button.focus();
    const expected = tiles.filter(tile => !tile.blocked && Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y) <= 1).map(tile => `${tile.x},${tile.y}`).sort();
    const actual = await page.locator('.skill-impact-tile').evaluateAll(elements => elements.map(element => `${element.parentElement.dataset.mapX},${element.parentElement.dataset.mapY}`).sort());
    assert.deepEqual(actual, expected, 'Area preview includes the center and all legal cells, not just secondary enemy positions');
    assert.equal(await page.locator('.enemy-threat-tile').count(), 0);
    await snapshot(page, test, 'preview');
    await button.click();
    const preview = page.locator('.vs-preview-modal');
    assert.match(await preview.innerText(), /광역\s*1명/);
    await preview.getByRole('button', { name: '스킬 실행', exact: true }).click();
    await page.waitForFunction(() => {
      const endTurn = document.querySelector('.battle-end-turn-float');
      return !document.querySelector('.vs-preview-modal, .painted-combat-overlay') && endTurn && !endTurn.disabled;
    }, null, { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('.combat-effect, .damage-popup, .action-motion'), null, { timeout: 15000 });
    const after = await saveBattle(page);
    for (const id of [target.id, 'splash-target']) assert.ok(after.units.find(unit => unit.id === id).hp < target.hp, `${id} is damaged`);
    assert.equal(after.units.find(unit => unit.id === 'hero').hp, data.units.find(unit => unit.id === 'hero').hp, 'No friendly splash damage');
    assert.equal(after.units.find(unit => unit.id === 'hero').acted, false);
    assert.equal(await page.locator('.skill-impact-tile, .command-range-tile').count(), 0, 'Resolved skills leave no stale range');
  }],
  ['no-follow-up', async (page, test, { fixture, settings }) => {
    const data = structuredClone(fixture);
    const hero = data.units.find(unit => unit.id === 'hero');
    const lina = data.units.find(unit => unit.id === 'lina');
    const enemy = data.units.find(unit => unit.type !== 'ally');
    hero.supportUsed = false;
    lina.skl = 999;
    lina.range = 4;
    synchronizeStage(data);
    await restore(page, data, settings);
    await page.evaluate(() => { const random = Math.random; Math.random = () => 0.5 + random() * 0.001; });
    await selectUnit(page, 'lina');
    const before = await saveBattle(page);
    assert.equal(Math.abs(hero.x - enemy.x) + Math.abs(hero.y - enemy.y), 1, 'An available swordsman is adjacent to the target');
    await page.locator('.cmd-attack').click();
    await page.locator('.battle-target-buttons button').filter({ hasText: enemy.name }).click();
    const preview = page.locator('.vs-preview-modal');
    assert.doesNotMatch(await preview.innerText(), /협공/);
    const damage = Number(await preview.locator('.battle-stats > div').filter({ hasText: /^피해/ }).locator('strong').innerText());
    await preview.getByRole('button', { name: '공격 실행', exact: true }).click();
    await page.waitForFunction(() => {
      const endTurn = document.querySelector('.battle-end-turn-float');
      return !document.querySelector('.vs-preview-modal, .painted-combat-overlay') && endTurn && !endTurn.disabled;
    }, null, { timeout: 20000 });
    const after = await saveBattle(page);
    const untouched = after.units.find(unit => unit.id === 'hero');
    assert.equal(after.turn, 'ally');
    for (const key of ['acted', 'moved', 'supportUsed', 'hp', 'exp']) assert.equal(untouched[key], before.units.find(unit => unit.id === 'hero')[key], `Swordsman's ${key} must not change`);
    assert.equal(after.units.find(unit => unit.id === 'lina').acted, true);
    assert.equal(enemy.hp - after.units.find(unit => unit.id === enemy.id).hp, damage, 'Only the archer deals damage');
    assert.equal(after.battleStats.assists, before.battleStats.assists);
    assert.doesNotMatch(after.logs.slice(0, 4).join(' '), /협공/);
    await snapshot(page, test, 'resolved');
  }],
  ['quick-speed', async (page, test, { fixture, settings }) => {
    await restore(page, fixture, settings);
    const before = await saveBattle(page);
    const controls = page.getByRole('group', { name: '전투 배속', exact: true });
    assert.equal(await controls.getByRole('button').count(), 3);
    for (const [speed, id] of [[1, 'normal'], [2, 'fast'], [3, 'turbo']]) {
      const button = controls.getByRole('button', { name: `전투 ${speed}배속`, exact: true });
      await button.click();
      await page.waitForFunction(({ key, value }) => JSON.parse(localStorage.getItem(key))?.battleSpeed === value, { key: SETTINGS_KEY, value: id });
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      assert.equal(await controls.locator('[aria-pressed="true"]').count(), 1);
      assert.equal(await page.locator('.world-art-app').evaluate(element => getComputedStyle(element).getPropertyValue('--battle-speed').trim()), String(speed));
      await snapshot(page, test, `${speed}x`);
    }
    await assertNoAction(page, before);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '이어하기', exact: true }).click();
    await controls.waitFor();
    assert.equal(await controls.getByRole('button', { name: '전투 3배속', exact: true }).getAttribute('aria-pressed'), 'true', 'Quick speed must survive reload');
  }],
  ['picker-cancel', async (page, test, { fixture, settings }) => {
    await restore(page, fixture, settings);
    await selectUnit(page, 'hero');
    const before = await saveBattle(page);
    for (const method of ['cancel', 'close', 'escape', 'backdrop']) {
      const dialog = await openSkills(page);
      assert.deepEqual(await dialog.locator('[data-skill-id] strong').allTextContents(), ['돌풍 베기', '수호의 맹세']);
      assert.equal(await dialog.locator('[data-skill-id]:enabled').count(), 2);
      if (method === 'cancel') {
        await snapshot(page, test, 'hero-skills');
        await dialog.getByRole('button', { name: '취소', exact: true }).click();
      } else if (method === 'close') {
        await dialog.getByRole('button', { name: '스킬 선택 닫기', exact: true }).click();
      } else if (method === 'escape') {
        await page.keyboard.press('Escape');
      } else {
        await page.mouse.click(2, 2);
      }
      await dialog.waitFor({ state: 'detached' });
      assert.ok(await page.locator('.cmd-skill').isEnabled());
      assert.equal(await page.locator('.cmd-skill').getAttribute('aria-pressed'), 'false');
      await assertNoAction(page, before);
    }
  }],
  ['attack-feedback', async (page, test, { fixture, settings }) => {
    await restore(page, fixture, settings);
    await selectUnit(page, 'hero');
    const before = await saveBattle(page);
    await page.locator('.cmd-attack').click();
    const target = await verifyTargetFeedback(page, null, fixture.units[2].name);
    await snapshot(page, test, 'target');
    await target.click();
    const preview = page.locator('.vs-preview-modal');
    await preview.waitFor();
    assert.ok(await preview.getByRole('button', { name: '공격 실행', exact: true }).isEnabled());
    await preview.getByRole('button', { name: '취소', exact: true }).click();
    await preview.waitFor({ state: 'detached' });
    await cancelTarget(page);
    await assertNoAction(page, before);
  }],
  ['primary-skill', async (page, test, { fixture, settings }) => {
    await restore(page, fixture, settings);
    await selectUnit(page, 'hero');
    const before = await saveBattle(page);
    const dialog = await openSkills(page);
    await dialog.locator('[data-skill-id="gale"]').click();
    await dialog.waitFor({ state: 'detached' });
    const target = await verifyTargetFeedback(page, '돌풍 베기', fixture.units[2].name);
    await snapshot(page, test, 'target');
    await target.click();
    const preview = page.locator('.vs-preview-modal');
    await preview.waitFor();
    assert.match(await preview.locator('.battle-title').innerText(), /돌풍 베기/);
    assert.ok(await preview.getByRole('button', { name: '스킬 실행', exact: true }).isEnabled());
    await preview.getByRole('button', { name: '취소', exact: true }).click();
    await preview.waitFor({ state: 'detached' });
    await cancelTarget(page);
    await assertNoAction(page, before);
  }],
  ['secondary-guard', async (page, test, { fixture, settings }) => {
    await restore(page, fixture, settings);
    await selectUnit(page, 'hero');
    const before = await saveBattle(page);
    const dialog = await openSkills(page);
    await dialog.locator('[data-skill-id="oath"]').click();
    await page.locator('.support-target-dialog [data-target-id="hero"]').click();
    await page.locator('.support-target-dialog').getByRole('button', { name: '마법 사용', exact: true }).click();
    const scene = page.locator('.painted-combat.is-guarding');
    // Read short-lived cutscene state atomically before its normal playback ends.
    const frame = await scene.evaluate(element => {
      const arena = element.querySelector('.painted-combat-arena');
      const actor = element.querySelector('.fighter-attacker');
      const image = element.querySelector('.fighter-action');
      return { title: element.querySelector('h2').textContent.trim(), self: element.classList.contains('is-self-support'),
        actors: element.querySelectorAll('.painted-fighter').length, health: element.querySelectorAll('.combat-health').length,
        centered: Math.abs(actor.offsetLeft + actor.offsetWidth / 2 - arena.clientWidth / 2) <= 2,
        loaded: image.complete && image.naturalWidth > 0 };
    });
    assert.equal(frame.title, '수호의 맹세');
    assert.ok(frame.self);
    assert.equal(frame.actors, 1, 'Self guard must render one actor');
    assert.equal(frame.health, 1, 'Self guard must render one health display');
    assert.ok(frame.centered, 'The self-support actor must be centered in the arena');
    assert.ok(frame.loaded);
    await snapshot(page, test, 'scene');
    await page.locator('.painted-combat-overlay').waitFor({ state: 'detached', timeout: 20000 });
    const after = await saveBattle(page);
    const hero = after.units.find(unit => unit.id === 'hero');
    const lina = after.units.find(unit => unit.id === 'lina');
    assert.equal(after.turn, 'ally', 'An unacted second ally prevents an automatic enemy turn');
    assert.equal(after.round, before.round, 'Cooldown check occurs before any turn tick');
    assert.equal(hero.acted, true);
    assert.equal(hero.moved, true);
    assert.equal(hero.guard, true);
    assert.equal(hero.def, before.units.find(unit => unit.id === 'hero').def + 3);
    assert.equal(hero.skillCooldowns?.gale, 0, 'Primary attack cooldown stays available');
    assert.equal(hero.skillCooldowns?.oath, 3, 'Secondary guard gets exactly its own three-turn cooldown');
    assert.equal(hero.skillCooldown, 0, 'Legacy cooldown mirrors the primary skill');
    assert.equal(lina.acted, false);
    assert.equal(hero.hp, before.units.find(unit => unit.id === 'hero').hp);
    assert.equal(after.battleStats.skillsUsed, before.battleStats.skillsUsed + 1);
    assert.deepEqual(after.inventory, before.inventory);
    assert.equal(after.gold, before.gold);
    await snapshot(page, test, 'acted');

    // Preserve both cooldowns but re-arm the actor to inspect independent picker availability.
    const cooldownFixture = structuredClone(after);
    Object.assign(cooldownFixture.units.find(unit => unit.id === 'hero'), { acted: false, moved: false });
    synchronizeStage(cooldownFixture);
    await restore(page, cooldownFixture, settings);
    await selectUnit(page, 'hero');
    const cooldownDialog = await openSkills(page);
    assert.ok(await cooldownDialog.locator('[data-skill-id="gale"]').isEnabled());
    assert.ok(await cooldownDialog.locator('[data-skill-id="oath"]').isDisabled());
    assert.match(await cooldownDialog.locator('[data-skill-id="oath"]').innerText(), /3턴 후/);
    await snapshot(page, test, 'independent-cooldowns');
  }],
  ['lina-skills', async (page, test, { fixture, settings }) => {
    await restore(page, fixture, settings);
    await selectUnit(page, 'lina');
    const before = await saveBattle(page);
    for (const [id, label] of [['ember', '불꽃 화살'], ['snipe', '정밀 사격']]) {
      const dialog = await openSkills(page);
      assert.deepEqual(await dialog.locator('[data-skill-id] strong').allTextContents(), ['불꽃 화살', '정밀 사격']);
      assert.match(await dialog.locator('[data-skill-id="ember"]').innerText(), /사거리 3.*재사용 2턴/s);
      assert.match(await dialog.locator('[data-skill-id="snipe"]').innerText(), /사거리 4.*재사용 3턴/s);
      assert.equal(await dialog.locator('[data-skill-id]:enabled').count(), 2);
      if (id === 'ember') await snapshot(page, test, 'picker');
      await dialog.locator(`[data-skill-id="${id}"]`).click();
      await dialog.waitFor({ state: 'detached' });
      await verifyTargetFeedback(page, label, fixture.units[2].name);
      await snapshot(page, test, id);
      await cancelTarget(page);
      await assertNoAction(page, before);
    }
  }],
  ['lina-secondary-execute', async (page, test, { fixture, settings }) => {
    const attackFixture = structuredClone(fixture);
    const actor = attackFixture.units.find(unit => unit.id === 'lina');
    const enemy = attackFixture.units.find(unit => unit.type !== 'ally');
    actor.skl = 999;
    attackFixture.units.find(unit => unit.id === 'hero').supportUsed = false;
    synchronizeStage(attackFixture);
    let landed = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await restore(page, attackFixture, settings);
      await selectUnit(page, 'lina');
      const before = await saveBattle(page);
      const dialog = await openSkills(page);
      await dialog.locator('[data-skill-id="snipe"]').click();
      await dialog.waitFor({ state: 'detached' });
      const target = await verifyTargetFeedback(page, '정밀 사격', enemy.name);
      await target.click();
      const preview = page.locator('.vs-preview-modal');
      await preview.waitFor();
      assert.match(await preview.locator('.battle-title').innerText(), /정밀 사격/);
      await preview.getByRole('button', { name: '스킬 실행', exact: true }).click();
      const scene = page.locator('.painted-combat').filter({ has: page.getByRole('heading', { name: '정밀 사격', exact: true }) });
      const frame = await scene.evaluate(element => ({ missed: element.classList.contains('is-miss'),
        loaded: [...element.querySelectorAll('.fighter-action')].every(image => image.complete && image.naturalWidth > 0) }));
      const missed = frame.missed;
      assert.ok(frame.loaded);
      await snapshot(page, test, `scene-${attempt}`);
      await page.waitForFunction(() => {
        const endTurn = document.querySelector('.battle-end-turn-float');
        return !document.querySelector('.painted-combat-overlay') && endTurn && !endTurn.disabled;
      }, null, { timeout: 20000 });
      const after = await saveBattle(page);
      const lina = after.units.find(unit => unit.id === 'lina');
      const hero = after.units.find(unit => unit.id === 'hero');
      const foe = after.units.find(unit => unit.id === enemy.id);
      assert.equal(after.turn, 'ally', 'An unacted hero prevents an enemy turn after Lina attacks');
      assert.equal(after.round, before.round, 'Attack cooldown must be checked before a turn tick');
      assert.equal(hero.acted, false);
      assert.equal(lina.acted, true);
      assert.equal(lina.moved, true);
      assert.equal(lina.skillCooldowns?.ember, 0, 'Executing the secondary attack must not cool down the primary');
      assert.equal(lina.skillCooldowns?.snipe, 3, 'Executing the secondary attack spends its own three-turn cooldown');
      assert.equal(lina.skillCooldown, 0, 'Legacy cooldown still mirrors the primary');
      assert.equal(after.mode, 'move');
      assert.equal(after.selectedUnit, null);
      assert.equal(after.gold, before.gold);
      assert.deepEqual(after.inventory, before.inventory);
      assert.ok(after.logs.some(log => log.includes('정밀 사격')), 'The resolved attack must name the selected secondary skill');
      assert.ok(foe?.hp > 0, 'The durable fixture target must survive');
      if (missed) {
        assert.equal(foe.hp, enemy.hp, 'A missed attack must not damage the enemy');
        test.notes.push(`Secondary attack missed on attempt ${attempt}; cooldown assertions passed, restoring the fixture to retry damage.`);
        continue;
      }
      assert.ok(foe.hp < enemy.hp, 'The executed secondary attack must damage the enemy');
      assert.equal(after.battleStats.skillsUsed, before.battleStats.skillsUsed + 1);
      assert.equal(after.unitBattleStats.lina.skillsUsed, (before.unitBattleStats.lina?.skillsUsed || 0) + 1);
      assert.equal(after.unitBattleStats.lina.damageDealt - (before.unitBattleStats.lina?.damageDealt || 0), enemy.hp - foe.hp);
      test.notes.push(`Secondary attack dealt ${enemy.hp - foe.hp} damage; ember cooldown 0, snipe cooldown 3; hero remains unacted.`);
      await snapshot(page, test, 'resolved');
      landed = true;
      break;
    }
    assert.ok(landed, 'Lina secondary attack must land within three attempts at the capped hit rate');
  }],
  ['defeat-restored', async (page, test, { fixture, settings }) => {
    const defeated = structuredClone(fixture);
    defeated.units.find(unit => unit.id === 'hero').hp = 0;
    defeated.battleLoot.gold = 777;
    synchronizeStage(defeated);
    await restore(page, defeated, settings);
    assert.equal(await page.locator('.world-battlefield .unit-visual-hero').count(), 0, 'Continue must remove the defeated hero');
    await page.locator('.defeat-dialog').waitFor({ state: 'visible', timeout: 5000 });
    test.notes.push('Continue displayed the defeat dialog without an intervening battle action.');
    await campWithoutRewards(page, test, defeated);
  }],
  ['defeat-enemy-turn', async (page, test, { fixture, settings }) => {
    const lethal = structuredClone(fixture);
    lethal.units = lethal.units.filter(unit => unit.id !== 'lina');
    const hero = lethal.units.find(unit => unit.id === 'hero');
    const enemy = lethal.units.find(unit => unit.type !== 'ally');
    Object.assign(hero, { hp: 1, spd: 1, luk: 1, def: 0, baseDef: 0, equipment: { weapon: null, armor: null } });
    Object.assign(enemy, { atk: 9999, skl: 9999, skillBonus: 9999, aiType: 'aggressive' });
    lethal.battleLoot.gold = 777;
    synchronizeStage(lethal);
    await restore(page, lethal, { ...settings, battleSpeed: 'turbo' });
    // Hit chance is capped at 98%; retry only after a real miss, without patching Math.random or app state.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.locator('.battle-end-turn-float').click();
      await page.locator('.painted-combat-overlay').waitFor();
      await page.waitForFunction(() => {
        if (document.querySelector('.defeat-dialog[open]')) return true;
        const button = document.querySelector('.battle-end-turn-float');
        return !document.querySelector('.painted-combat-overlay') && button && !button.disabled;
      }, null, { timeout: 20000 });
      if (await page.locator('.defeat-dialog').isVisible()) break;
      const survived = await saveBattle(page);
      assert.equal(survived.units.find(unit => unit.id === 'hero')?.hp, 1, 'Only a dodged lethal attack can retry');
      assert.ok(survived.logs.some(log => /빗나|회피|실패|MISS/i.test(log)), 'Retry must be explained by a missed attack');
      test.notes.push(`Enemy attack missed on attempt ${attempt}; retrying End Turn.`);
    }
    await campWithoutRewards(page, test, lethal);
  }],
];

async function runCase(browser, name, viewport, run) {
  const test = { name, viewport, passed: false, failures: [], notes: [], screenshots: [], layouts: [] };
  results.push(test);
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', error => test.failures.push(`pageerror: ${error.message}`));
  page.on('dialog', dialog => {
    test.failures.push(`Unexpected ${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss().catch(() => {});
  });
  const started = Date.now();
  const deadline = setTimeout(() => {
    test.failures.push('Case exceeded its 75-second deadline');
    void context.close().catch(() => {});
  }, 75000);
  let value;
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    value = await run(page, test);
    assert.equal(await page.locator('.runtime-error-overlay').count(), 0, 'No runtime error overlay');
  } catch (error) {
    test.failures.push(error.stack || String(error));
    if (!page.isClosed()) {
      const diagnostics = await Promise.allSettled([
        page.screenshot({ path: path.join(out, `${name}-failure-${viewport.width}.png`), timeout: 5000 }),
        page.locator('body').innerText({ timeout: 3000 }),
      ]);
      if (diagnostics[0].status === 'fulfilled') test.screenshots.push(`${name}-failure-${viewport.width}.png`);
      if (diagnostics[1].status === 'fulfilled') test.lastText = diagnostics[1].value.slice(-5000);
    }
  } finally {
    clearTimeout(deadline);
    await context.close();
    test.durationMs = Date.now() - started;
    test.passed = test.failures.length === 0;
    console.log(`${test.passed ? 'PASS' : 'FAIL'} ${name} ${viewport.width} (${test.durationMs}ms)`);
    for (const failure of test.failures) console.error(`  ${failure}`);
  }
  return value;
}

async function main() {
  await mkdir(out, { recursive: true });
  let browser;
  let fatalError = null;
  let selectedViewports = [];
  let selectedScenarios = [];
  let reportName = 'result.json';
  try {
    selectedViewports = viewports.filter(viewport => !options.viewport || options.viewport.split(',').includes(String(viewport.width)));
    selectedScenarios = scenarios.filter(([name]) => !options.case || options.case.split(',').includes(name));
    assert.ok(selectedViewports.length, `Unknown viewport: ${options.viewport}`);
    assert.ok(selectedScenarios.length, `Unknown case: ${options.case}`);
    if (options.case || options.viewport) reportName = `result-${options.case || 'all'}-${options.viewport || 'all'}.json`;
    browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
    const seed = await runCase(browser, 'fixture-bootstrap', viewports[0], bootstrap);
    if (!seed) throw new Error('UI fixture bootstrap failed; inspect fixture-bootstrap diagnostics.');
    for (const viewport of selectedViewports) {
      for (const [name, run] of selectedScenarios) await runCase(browser, name, viewport, (page, test) => run(page, test, seed));
    }
  } catch (error) {
    fatalError = error.stack || String(error);
    console.error(fatalError);
  } finally {
    if (browser) await browser.close();
    const failed = results.filter(test => !test.passed).length;
    const passed = !fatalError && failed === 0 && results.length === 1 + selectedViewports.length * selectedScenarios.length;
    await writeFile(path.join(out, reportName), JSON.stringify({
      passed, base, browser: process.platform === 'win32' ? 'chromium/msedge' : 'chromium', viewports: selectedViewports, cases: selectedScenarios.map(([name]) => name), fatalError,
      summary: { passed: results.length - failed, failed, total: results.length }, results,
    }, null, 2));
    console.log(`${passed ? 'PASS' : 'FAIL'}: ${results.length - failed}/${results.length} cases; report ${path.join(out, reportName)}`);
    if (!passed) process.exitCode = 1;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
