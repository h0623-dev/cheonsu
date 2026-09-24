const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parseArgs } = require('node:util');

const { values: options } = parseArgs({ options: { case: { type: 'string' }, viewport: { type: 'string' } } });
options.case ||= process.env.TEST_CASE;
options.viewport ||= process.env.TEST_VIEWPORT;
const base = process.env.GAME_URL || 'http://localhost:5176';
const out = path.resolve(__dirname, '../tmp/discoveries-qa');
const SAVE_KEY = 'cheonsu_v01_save';
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }];
const emptyExploration = () => ({ claimed: [], relics: [], techniques: [] });
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const heroOf = data => data.units.find(unit => unit.id === 'hero');
const partyHeroOf = data => data.party.find(unit => unit.id === 'hero');
const results = [];
let engine;
let movement;
let discoveryData;

async function readSave(page) {
  const data = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  assert.ok(data?.units?.length && data?.party?.length, 'Real save must contain units and party');
  return data;
}

async function saveBattle(page) {
  await page.locator('.cinematic-stage-actions').getByRole('button', { name: '설정', exact: true }).click();
  await page.locator('.battle-settings-menu').getByRole('button', { name: '저장 진행 저장', exact: true }).click();
  await page.locator('.battle-settings-menu').waitFor({ state: 'hidden' });
  return readSave(page);
}

async function saveCamp(page) {
  await page.getByRole('button', { name: '관리', exact: true }).click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  return readSave(page);
}

async function continueSaved(page, screen = 'battle') {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  if (screen === 'battle') await page.locator('.world-battlefield .unit-visual-hero').waitFor();
  else await page.getByRole('button', { name: '성장', exact: true }).waitFor();
}

async function restore(page, fixture) {
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: SAVE_KEY, data: fixture });
  await continueSaved(page, fixture.screen);
}

async function snapshot(page, test, name) {
  const file = `${test.name}-${name}-${test.viewport.width}.png`;
  await page.screenshot({ path: path.join(out, file) });
  test.screenshots.push(file);
  const problems = await page.evaluate(() => {
    const issues = [];
    for (const element of [document.documentElement, document.body]) {
      if (element.scrollWidth > innerWidth + 1) issues.push(`${element.tagName}: horizontal page overflow ${element.scrollWidth}/${innerWidth}`);
    }
    // The battlefield and modal lists intentionally scroll vertically or internally.
    for (const element of document.querySelectorAll('dialog[open], .promotion-card')) {
      const rect = element.getBoundingClientRect();
      if (rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.bottom > innerHeight + 1) {
        issues.push(`${element.className}: outside viewport (${JSON.stringify(rect.toJSON())})`);
      }
      if (element.scrollWidth > element.clientWidth + 1) issues.push(`${element.className}: horizontal modal overflow`);
    }
    for (const element of document.querySelectorAll('.discovery-dialog :is(h2,h3,p,strong,small), .secret-promotion-row, .skill-choice-list > button')) {
      if (element.scrollWidth > element.clientWidth + 1) issues.push(`${element.className || element.tagName}: clipped content ${element.textContent.trim()}`);
    }
    return issues;
  });
  test.layouts.push({ file, problems });
  test.failures.push(...problems.map(problem => `${file}: ${problem}`));
}

async function assertModal(page, selector) {
  const dialog = page.locator(selector);
  await dialog.waitFor();
  assert.equal(await dialog.evaluate(element => element.matches(':modal')), true, `${selector} must use the native top layer`);
  await dialog.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  return dialog;
}

async function bootstrap(page, stageId) {
  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${stageId}장\\.`) }) }).click();
  await page.getByRole('button', { name: '전투 시작', exact: true }).click();
  await page.getByRole('button', { name: '바로 전투', exact: true }).click();
  await page.locator('.world-battlefield .unit-visual-hero').waitFor();
  const speed = page.getByRole('button', { name: '전투 3배속', exact: true });
  if (await speed.getAttribute('aria-pressed') !== 'true') await speed.click();
  const fixture = await saveBattle(page);
  assert.equal(fixture.selectedStage.id, stageId, 'Fixture must originate from the actual requested stage');
  assert.deepEqual(fixture.exploration, emptyExploration(), 'New games start without discoveries');
  const map = await page.evaluate(() => window.__CHEONSU_ACTIVE_MAP__);
  assert.ok(Array.isArray(map) && map.length && Array.isArray(map[0]), 'Read the real expanded active map');
  const entries = engine.getStageDiscoveries(stageId, map, fixture.selectedStage.units);
  assert.ok(entries.length, `Stage ${stageId} must have authored discoveries`);
  return { fixture, map, entry: entries[0] };
}

function cells(map) {
  return map.flatMap((row, y) => row.map((terrain, x) => ({ x, y, terrain })))
    .filter(cell => !movement.isTerrainBlocked(cell.terrain));
}

function arrange(seed, position, enemyPosition) {
  const fixture = structuredClone(seed.fixture);
  Object.assign(fixture, { turn: 'ally', mode: 'move', selectedUnit: null, hazards: [] });
  const hero = heroOf(fixture);
  Object.assign(hero, position, { acted: false, moved: false, guard: false, status: [] });
  const occupied = new Set([`${hero.x},${hero.y}`]);
  const farCells = cells(seed.map).filter(cell => distance(cell, seed.entry) > 6);
  let placedEnemy = false;
  for (const unit of fixture.units.filter(unit => unit.id !== 'hero')) {
    const destination = enemyPosition && unit.type !== 'ally' && !placedEnemy
      ? enemyPosition : farCells.find(cell => !occupied.has(`${cell.x},${cell.y}`));
    assert.ok(destination, 'Controlled fixture needs distinct passable cells');
    Object.assign(unit, { x: destination.x, y: destination.y, acted: false, moved: false, guard: false, status: [] });
    if (unit.type !== 'ally') {
      if (destination === enemyPosition) placedEnemy = true;
      Object.assign(unit, { hp: 999, maxHp: 999, atk: 1, def: 1, move: 0, range: 1, skillRange: 1 });
    }
    occupied.add(`${unit.x},${unit.y}`);
  }
  // Moving live units must never change the roster that determines discovery placement.
  assert.deepEqual(fixture.selectedStage, seed.fixture.selectedStage);
  return fixture;
}

async function assertStablePlacement(page, seed, saved) {
  assert.deepEqual(saved.selectedStage, seed.fixture.selectedStage, 'Save must preserve initial units and authored map');
  const activeMap = await page.evaluate(() => window.__CHEONSU_ACTIVE_MAP__);
  assert.deepEqual(activeMap, seed.map, 'Reload must preserve expanded active map');
  assert.deepEqual(engine.getStageDiscoveries(saved.selectedStage.id, activeMap, saved.selectedStage.units),
    engine.getStageDiscoveries(seed.fixture.selectedStage.id, seed.map, seed.fixture.selectedStage.units),
    'Discovery coordinates must stay fixed while actors move');
}

async function selectHero(page) {
  const hero = page.locator('.world-battlefield .unit-visual-hero');
  if (!await hero.evaluate(element => element.classList.contains('selected-unit'))) await hero.click();
  await page.waitForFunction(() => document.querySelector('.cmd-skill')?.disabled === false);
}

function tile(page, position) {
  return page.locator(`.world-battlefield .tile[data-map-x="${position.x}"][data-map-y="${position.y}"]`);
}

async function moveHero(page, destination) {
  await selectHero(page);
  const target = tile(page, destination);
  await target.locator('.move-tile').waitFor();
  await target.click();
  await target.locator('.unit-visual-hero').waitFor();
  await page.waitForFunction(() => !document.querySelector('.moving-unit-layer, .tile-moving-unit'));
}

async function assertUndoUnavailable(page) {
  assert.equal(await page.locator('.cmd-undo:enabled, .undo-move-action:enabled').count(), 0, 'Reward claim must commit movement and disable undo');
}

function state(data) {
  return Object.fromEntries(['units', 'party', 'exploration', 'inventory', 'gold', 'round', 'turn', 'battleStats'].map(key => [key, data[key]]));
}

async function journalClose(page, test) {
  const before = await saveBattle(page);
  for (const method of ['button', 'header', 'escape', 'backdrop']) {
    test.notes.push(`Journal close: ${method}`);
    await page.getByRole('button', { name: '탐색 기록', exact: true }).click();
    const dialog = await assertModal(page, '.discovery-dialog');
    assert.equal(await dialog.locator('.discovery-journal').count(), 1);
    assert.equal(await page.locator('.cmd-skill').isEnabled(), false, 'Journal locks background commands');
    if (method === 'button') {
      await snapshot(page, test, 'journal');
      await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    } else if (method === 'header') await dialog.getByRole('button', { name: '탐색 창 닫기', exact: true }).click();
    else if (method === 'escape') await page.keyboard.press('Escape');
    else {
      const bounds = await dialog.boundingBox();
      const viewport = page.viewportSize();
      const point = [{ x: 2, y: 2 }, { x: viewport.width - 2, y: viewport.height - 2 }]
        .find(({ x, y }) => x < bounds.x || x > bounds.x + bounds.width || y < bounds.y || y > bounds.y + bounds.height);
      assert.ok(point, 'Dialog must leave a clickable backdrop');
      await page.mouse.click(point.x, point.y);
    }
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.cmd-skill').isEnabled(), true, 'Closing journal releases input');
    assert.deepEqual(state(await saveBattle(page)), state(before), `${method} must not change game state`);
  }
}

async function claim(page, test, seed, fixture) {
  await restore(page, fixture);
  const before = await saveBattle(page);
  await assertStablePlacement(page, seed, before);
  const marker = page.locator(`.discovery-marker[data-discovery-id="${seed.entry.id}"]`);
  await marker.waitFor({ state: 'attached' });
  assert.equal(await tile(page, seed.entry).locator('.discovery-marker').count(), 1, 'Marker uses the stable discovery coordinates');
  assert.equal(before.exploration.claimed.includes(seed.entry.id), false, 'Proximity alone must not claim');
  await moveHero(page, seed.entry);
  const receipt = await assertModal(page, '.discovery-dialog');
  assert.match(await receipt.innerText(), new RegExp(seed.entry.title));
  assert.equal(await receipt.locator('.discovery-receipt').count(), 1);
  assert.equal(await page.locator('.cmd-skill').isEnabled(), false, 'Receipt locks background commands');
  await snapshot(page, test, 'receipt');
  await receipt.getByRole('button', { name: '계속', exact: true }).click();
  await receipt.waitFor({ state: 'detached' });
  await assertUndoUnavailable(page);
  assert.equal(await marker.count(), 0, 'Claimed marker disappears');
  const after = await saveBattle(page);
  assert.equal(after.exploration.claimed.filter(id => id === seed.entry.id).length, 1);
  assert.equal(heroOf(after).moved, true);
  assert.equal(heroOf(after).acted, false, 'Discovery movement leaves an action available');
  await assertStablePlacement(page, seed, after);
  return { before, after };
}

async function verifyNoDuplicate(page, test, seed, after) {
  await continueSaved(page);
  const reloaded = await saveBattle(page);
  const persistentState = data => ({
    ...state(data),
    party: data.party.map(unit => ({ ...unit, moved: false, acted: false, guard: false })),
  });
  assert.deepEqual(persistentState(reloaded), persistentState(after), 'Ordinary save/reload preserves rewards and live battle state exactly');
  assert.equal(heroOf(reloaded).moved, true, 'Reload preserves the battle actor movement committed by the claim');
  await assertUndoUnavailable(page);
  assert.equal(await page.locator(`.discovery-marker[data-discovery-id="${seed.entry.id}"]`).count(), 0);
  const adjacent = cells(seed.map).find(cell => distance(cell, seed.entry) === 1);
  const revisit = arrange({ ...seed, fixture: after }, adjacent);
  await restore(page, revisit);
  const before = await saveBattle(page);
  await moveHero(page, seed.entry);
  await page.waitForFunction(() => document.querySelector('.cmd-skill')?.disabled === false);
  assert.equal(await page.locator('.discovery-dialog').count(), 0, 'Revisiting a claimed tile must not display a reward');
  const repeated = await saveBattle(page);
  assert.deepEqual(repeated.exploration, before.exploration);
  assert.deepEqual(repeated.party, before.party);
  for (const field of ['exp', 'level', 'learnedTechniques', 'maxHp', 'atk', 'def']) {
    assert.deepEqual(heroOf(repeated)[field], heroOf(before)[field], `Revisit must not duplicate ${field}`);
  }
  await assertStablePlacement(page, seed, repeated);
  await page.getByRole('button', { name: '탐색 기록', exact: true }).click();
  const journal = await assertModal(page, '.discovery-dialog');
  assert.equal(await journal.locator('article.claimed').filter({ hasText: seed.entry.title }).count(), 1);
  await snapshot(page, test, 'claimed-journal');
  await journal.getByRole('button', { name: '닫기', exact: true }).click();
}

const scenarios = [
  ['training', async (page, test) => {
    const seed = await bootstrap(page, 1);
    await selectHero(page);
    await snapshot(page, test, 'new-game');
    await journalClose(page, test);
    const passable = cells(seed.map);
    const edge = passable.filter(cell => distance(cell, seed.entry) === 4).map(start => ({
      start, next: passable.find(cell => distance(cell, start) === 1 && distance(cell, seed.entry) === 3),
    })).find(pair => pair.next);
    assert.ok(edge, 'Need adjacent passable cells at reveal distances four and three');
    const fixture = arrange(seed, edge.start);
    assert.ok(movement.getMoveTiles(heroOf(fixture), fixture.units, seed.map).some(cell => distance(cell, edge.next) === 0));
    await restore(page, fixture);
    const marker = page.locator(`.discovery-marker[data-discovery-id="${seed.entry.id}"]`);
    assert.equal(await marker.count(), 0, 'Radius four hides discovery when all other allies are farther away');
    await moveHero(page, edge.next);
    await marker.waitFor({ state: 'attached' });
    const revealed = await saveBattle(page);
    assert.deepEqual(revealed.exploration, emptyExploration());
    await assertStablePlacement(page, seed, revealed);
    await snapshot(page, test, 'radius-three');
    await page.locator('.cinematic-command-bar .cmd-undo').click();
    await tile(page, edge.start).locator('.unit-visual-hero').waitFor();
    assert.equal(await marker.count(), 0, 'Undoing ordinary scouting hides the marker again');
    const adjacent = passable.find(cell => distance(cell, seed.entry) === 1);
    const { before, after } = await claim(page, test, seed, arrange(seed, adjacent));
    assert.equal(heroOf(after).exp, heroOf(before).exp + 35, 'Training must grant exactly 35 EXP');
    assert.equal(partyHeroOf(after).exp, partyHeroOf(before).exp + 35, 'Party must retain the EXP reward');
    await verifyNoDuplicate(page, test, seed, after);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const restarted = await bootstrap(page, 1);
    assert.equal(heroOf(restarted.fixture).exp, heroOf(seed.fixture).exp, 'New game resets previously saved discovery EXP');
    await snapshot(page, test, 'new-game-reset');
    test.notes.push(`Stage 1 discovery ${seed.entry.id} at ${seed.entry.x},${seed.entry.y}: radius 3, EXP +35, committed movement, reload and revisit verified.`);
  }],
  ['technique', async (page, test) => {
    const seed = await bootstrap(page, 2);
    await selectHero(page);
    await page.locator('.cmd-skill').click();
    let dialog = await assertModal(page, '.skill-choice-dialog');
    assert.equal(await dialog.locator('[data-skill-id]').count(), 2, 'Hero starts with two skills');
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    const passable = cells(seed.map);
    const adjacent = passable.find(cell => distance(cell, seed.entry) === 1);
    const enemyPosition = passable.find(cell => distance(cell, seed.entry) === 2 && distance(cell, adjacent) > 0);
    assert.ok(enemyPosition, 'Technique test requires an enemy at exactly range two');
    const { before, after } = await claim(page, test, seed, arrange(seed, adjacent, enemyPosition));
    const techniqueId = seed.entry.reward.techniqueId;
    const technique = discoveryData.DISCOVERY_TECHNIQUES[techniqueId];
    assert.equal(after.exploration.techniques.filter(id => id === techniqueId).length, 1);
    for (const unit of [heroOf(after), partyHeroOf(after)]) assert.equal(unit.learnedTechniques.filter(id => id === techniqueId).length, 1);
    assert.equal(heroOf(after).exp, heroOf(before).exp, 'Technique discovery is not an EXP reward');
    await page.locator('.cmd-skill').click();
    dialog = await assertModal(page, '.skill-choice-dialog');
    assert.equal(await dialog.locator('[data-skill-id]').count(), 3, 'First technique claim adds exactly a third hero skill');
    const choice = dialog.locator(`[data-skill-id="${techniqueId}"]`);
    assert.ok(await choice.isEnabled(), 'Newly discovered skill is immediately usable');
    await snapshot(page, test, 'third-skill');
    await choice.click();
    const enemy = after.units.find(unit => unit.type !== 'ally' && distance(unit, enemyPosition) === 0);
    const target = page.locator('.battle-target-buttons button').filter({ has: page.locator('strong').getByText(enemy.name, { exact: true }) });
    assert.ok(await target.isEnabled(), 'The new range-two technique can target an enemy beyond normal sword range');
    await target.click();
    const preview = page.locator('.vs-preview-modal');
    await preview.waitFor();
    assert.ok((await preview.innerText()).includes(technique.name));
    await preview.getByRole('button', { name: '스킬 실행', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.vs-preview-modal, .painted-combat-overlay') && document.querySelector('.battle-end-turn-float')?.disabled === false, null, { timeout: 25000 });
    const used = await saveBattle(page);
    assert.equal(heroOf(used).acted, true);
    assert.equal(heroOf(used).skillCooldowns[techniqueId], technique.cooldown, 'Execution starts the new skill cooldown');
    assert.equal(used.battleStats.skillsUsed, after.battleStats.skillsUsed + 1);
    assert.equal(used.round, after.round, 'Other unacted allies prevent automatic enemy turn');
    assert.equal(used.turn, 'ally');
    await restore(page, after);
    await verifyNoDuplicate(page, test, seed, await saveBattle(page));
    await page.locator('.cmd-skill').click();
    dialog = await assertModal(page, '.skill-choice-dialog');
    assert.equal(await dialog.locator('[data-skill-id]').count(), 3, 'Reload and revisit must not duplicate the third skill');
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    test.notes.push(`Stage 2 ${techniqueId}: first claim, third skill, actual range-two execution, cooldown and persistence verified.`);
  }],
  ['legacy-save', async (page, test) => {
    const seed = await bootstrap(page, 1);
    const legacy = structuredClone(seed.fixture);
    delete legacy.exploration;
    for (const unit of [...legacy.units, ...legacy.party]) {
      delete unit.learnedTechniques;
      delete unit.secretClass;
    }
    await restore(page, legacy);
    const migrated = await saveBattle(page);
    assert.deepEqual(migrated.exploration, emptyExploration(), 'Old saves without exploration migrate to empty progress');
    await assertStablePlacement(page, seed, migrated);
    assert.equal(heroOf(migrated).exp, heroOf(legacy).exp);
    await selectHero(page);
    await page.locator('.cmd-skill').click();
    const skills = await assertModal(page, '.skill-choice-dialog');
    assert.equal(await skills.locator('[data-skill-id]').count(), 2, 'Migration must not grant a discovery skill');
    await skills.getByRole('button', { name: '취소', exact: true }).click();
    await journalClose(page, test);
    await continueSaved(page);
    assert.deepEqual((await saveBattle(page)).exploration, emptyExploration());
  }],
  ['secret-promotion', async (page, test) => {
    const seed = await bootstrap(page, 1);
    const promotion = discoveryData.SECRET_PROMOTIONS.hero;
    const relicEntry = discoveryData.DISCOVERIES.find(entry => entry.reward.relicId === promotion.relicId);
    const camp = structuredClone(seed.fixture);
    camp.screen = 'camp';
    camp.exploration = { claimed: [relicEntry.id], relics: [promotion.relicId], techniques: [] };
    partyHeroOf(camp).level = promotion.requiredLevel - 1;
    const promotionRow = () => page.locator('.promotion-entry').filter({ has: page.locator('.promotion-unit-head strong').filter({ hasText: partyHeroOf(camp).name }) });
    const openPromotion = async () => {
      await page.getByRole('button', { name: '성장', exact: true }).click();
      await page.getByRole('button', { name: '전직', exact: true }).click();
      await page.locator('.promotion-card').waitFor();
      await assertModal(page, '.promotion-dialog');
      return promotionRow().getByRole('button', { name: '비전 전직', exact: true });
    };
    const closePromotion = async () => page.locator('.promotion-card').getByRole('button', { name: '닫기', exact: true }).click();
    await restore(page, camp);
    assert.equal(await (await openPromotion()).isEnabled(), false, 'Relic alone cannot bypass the level-five requirement');
    await snapshot(page, test, 'level-locked');
    await closePromotion();
    partyHeroOf(camp).level = promotion.requiredLevel;
    const noRelic = structuredClone(camp);
    noRelic.exploration.relics = [];
    await restore(page, noRelic);
    await openPromotion();
    assert.equal(await promotionRow().locator('.secret-promotion-row').count(), 0, 'Secret promotion stays hidden without its relic');
    await closePromotion();
    await restore(page, camp);
    const before = await saveCamp(page);
    const expected = engine.getSecretPromotion(partyHeroOf(before), before.exploration).bonuses;
    const button = await openPromotion();
    assert.ok(await button.isEnabled());
    const previewText = await promotionRow().locator('.secret-promotion-row').innerText();
    assert.ok(previewText.includes(`HP +${expected.hp}`) && previewText.includes(`공격 +${expected.atk}`) && previewText.includes(`방어 +${expected.def}`), 'Promotion preview must show the actual API bonuses');
    await snapshot(page, test, 'eligible');
    await button.click();
    assert.equal(await button.isEnabled(), false, 'Promotion immediately disables a repeat');
    assert.ok((await promotionRow().innerText()).includes(promotion.classTitle));
    await snapshot(page, test, 'promoted');
    await closePromotion();
    const after = await saveCamp(page);
    const hero = partyHeroOf(after);
    assert.equal(hero.secretClass, promotion.secretClass);
    assert.equal(hero.classTitle, promotion.classTitle);
    assert.equal(hero.promoted, true);
    // The API includes any missing ordinary promotion in this unit's actual delta.
    for (const [stat, delta] of [['maxHp', expected.hp], ['baseHP', expected.hp], ['atk', expected.atk], ['baseAtk', expected.atk], ['def', expected.def], ['baseDef', expected.def], ['skillBonus', expected.skillBonus]]) {
      const prior = partyHeroOf(before)[stat] ?? (stat === 'baseHP' ? partyHeroOf(before).maxHp : undefined);
      assert.equal(hero[stat], prior + delta, `Secret promotion applies ${stat} bonus exactly once`);
    }
    assert.ok(!after.exploration.relics.includes(promotion.relicId), 'Promotion consumes the relic');
    assert.ok(after.exploration.claimed.includes(relicEntry.id), 'Claim history remains after relic consumption');
    assert.equal(after.exploration.techniques.filter(id => id === promotion.techniqueId).length, 1);
    assert.equal(hero.learnedTechniques.filter(id => id === promotion.techniqueId).length, 1);
    assert.equal(after.gold, before.gold, 'Secret promotion consumes the relic, not ordinary promotion gold');
    for (let repeat = 0; repeat < 2; repeat++) {
      await continueSaved(page, 'camp');
      assert.equal(await (await openPromotion()).isEnabled(), false, 'Reload must keep promotion completed');
      await closePromotion();
      const reloaded = await saveCamp(page);
      assert.deepEqual(partyHeroOf(reloaded), hero, 'Reload must not stack stats or remove the secret class');
      assert.deepEqual(reloaded.exploration, after.exploration, 'Consumed relic must not regenerate from claimed history');
    }
    await page.getByRole('button', { name: '성장', exact: true }).click();
    await page.getByRole('button', { name: '탐색 기록', exact: true }).click();
    await assertModal(page, '.discovery-dialog');
    assert.match(await page.locator('.discovery-count').innerText(), /보유 전직 보물 0/);
    await snapshot(page, test, 'consumed-relic-journal');
    await page.locator('.discovery-dialog').getByRole('button', { name: '닫기', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    const restarted = await bootstrap(page, 1);
    assert.equal(partyHeroOf(restarted.fixture).secretClass, undefined, 'New game clears a previously saved secret class');
    assert.equal(partyHeroOf(restarted.fixture).learnedTechniques?.length || 0, 0, 'New game clears learned discovery techniques');
    await selectHero(page);
    await page.locator('.cmd-skill').click();
    const resetSkills = await assertModal(page, '.skill-choice-dialog');
    assert.equal(await resetSkills.locator('[data-skill-id]').count(), 2, 'New game restores the original hero skill list');
    await snapshot(page, test, 'new-game-reset');
    test.notes.push(`Camp level/relic gates, direct promotion HP +${expected.hp} / ATK +${expected.atk} / DEF +${expected.def}, consumed relic, technique, two reloads and new-game reset verified.`);
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
  const start = Date.now();
  const deadline = setTimeout(() => {
    test.failures.push('Case exceeded its 180-second deadline');
    void context.close().catch(() => {});
  }, 180000);
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY), null, 'Each case owns an isolated save context');
    await run(page, test);
    assert.equal(await page.locator('.runtime-error-overlay').count(), 0);
  } catch (error) {
    test.failures.push(error.stack || String(error));
    if (!page.isClosed()) {
      const file = `${name}-failure-${viewport.width}.png`;
      try {
        await page.screenshot({ path: path.join(out, file), timeout: 5000 });
        test.screenshots.push(file);
        test.lastText = (await page.locator('body').innerText({ timeout: 3000 })).slice(-5000);
      } catch (diagnosticError) { test.notes.push(`Diagnostics: ${diagnosticError.message}`); }
    }
  } finally {
    clearTimeout(deadline);
    await context.close();
    test.durationMs = Date.now() - start;
    test.passed = test.failures.length === 0;
    console.log(`${test.passed ? 'PASS' : 'FAIL'} ${name} ${viewport.width} (${test.durationMs}ms)`);
    for (const failure of test.failures) console.error(failure);
  }
}

async function main() {
  await mkdir(out, { recursive: true });
  // Source modules are imported only in Node; browser evaluation reads data, never implementation hooks.
  engine = await import(pathToFileURL(path.resolve(__dirname, '../src/engine/discoveryEngine.js')).href);
  movement = await import(pathToFileURL(path.resolve(__dirname, '../src/engine/movement.js')).href);
  discoveryData = await import(pathToFileURL(path.resolve(__dirname, '../src/data/discoveries.js')).href);
  const requestedWidths = options.viewport?.split(',');
  for (const width of requestedWidths || []) assert.ok(viewports.some(viewport => String(viewport.width) === width), `Unknown viewport: ${width}`);
  const selectedViewports = viewports.filter(viewport => !requestedWidths || requestedWidths.includes(String(viewport.width)));
  const selectedScenarios = scenarios.filter(([name]) => !options.case || options.case === name);
  assert.ok(selectedViewports.length, `Unknown viewport: ${options.viewport}`);
  assert.ok(selectedScenarios.length, `Unknown case: ${options.case}`);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const runs = await Promise.allSettled(selectedViewports.map(async viewport => {
      for (const [name, run] of selectedScenarios) await runCase(browser, name, viewport, run);
    }));
    for (const result of runs) if (result.status === 'rejected') throw result.reason;
  } finally {
    await browser.close();
    const failed = results.filter(test => !test.passed).length;
    const passed = failed === 0 && results.length === selectedViewports.length * selectedScenarios.length;
    const report = path.join(out, options.case || options.viewport ? `result-${options.case || 'all'}-${options.viewport || 'all'}.json` : 'result.json');
    await writeFile(report, JSON.stringify({ passed, base, browser: 'msedge/headless', summary: { passed: results.length - failed, failed, total: results.length }, results }, null, 2));
    console.log(`${passed ? 'PASS' : 'FAIL'} ${results.length - failed}/${results.length}; report ${report}`);
    if (!passed) process.exitCode = 1;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
