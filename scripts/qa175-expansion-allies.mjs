import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { configurePage, createStageSeed, enterStage, loadSeed, readBattle, startDeploymentBattle, watchErrors } from './qa175-harness.mjs';
import { ensureBattleInformationOpen } from './qa-battle-tools.mjs';
import { getAttackRange, isTerrainBlocked } from '../src/engine/movement.js';
import { getUnitSkills } from '../src/data/skills.js';
const out = process.env.CHEONSU_QA_EXPANSION_OUT || 'tmp/cloud-qa/expansion-allies';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
page.setDefaultTimeout(30000);
const results = [], errors = [];
watchErrors(page, errors);
await configurePage(page);
const specs = [
  { stage: 33, id: 'mare', classLabel: '창 타입', primary: 'tide-thrust', status: 'push' },
  { stage: 38, id: 'harin', primary: 'warm-touch', secondary: 'linked-fist' },
  { stage: 43, id: 'edan', primary: 'breaker-hammer', status: 'armorBreak' },
  { stage: 48, id: 'sylvan', classLabel: '마법 타입', primary: 'root-snare', status: 'slow', secondary: 'green-breath', regen: true },
];
function positioned(saved, spec, skillId = null) {
  const seed = structuredClone(saved);
  const actor = seed.units.find(unit => unit.id === spec.id);
  assert.ok(actor, 'new ally actually deployed');
  const skill = skillId ? getUnitSkills(actor).find(skill => skill.id === skillId) : null;
  const support = skill && skill.type !== 'attack';
  const target = support ? seed.units.find(unit => unit.id === 'hero') : seed.units.find(unit => unit.type === 'enemy');
  assert.ok(target);
  const range = support ? 1 : getAttackRange(skill ? { ...actor, skillSpec: skill } : actor, skill ? 'skill' : 'attack').min;
  const map = seed.selectedStage.map;
  const cells = [];
  for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) if (!isTerrainBlocked(map[y][x])) cells.push({ x, y });
  // Fixture changes positions only; the healing target alone starts at 50% HP.
  // Leave one further tile free so Mare's real push can move the ordinary enemy.
  const origin = cells.find(cell => [range, range + 1].every(delta => cells.some(other => other.x === cell.x + delta && other.y === cell.y)));
  assert.ok(origin, 'straight safe weapon range and push cell');
  const targetCell = { x: origin.x + range, y: origin.y };
  const occupied = new Set([`${origin.x},${origin.y}`, `${targetCell.x},${targetCell.y}`, `${targetCell.x + 1},${targetCell.y}`]);
  for (const unit of seed.units) {
    if (unit.id === actor.id || unit.id === target.id) continue;
    if (occupied.has(`${unit.x},${unit.y}`)) Object.assign(unit, cells.find(cell => !occupied.has(`${cell.x},${cell.y}`)));
    occupied.add(`${unit.x},${unit.y}`);
  }
  Object.assign(actor, origin, { acted: false, moved: true });
  Object.assign(target, targetCell);
  if (support) target.hp = Math.floor(target.maxHp * .5);
  seed.selectedUnit = actor.id;
  seed.mode = 'attack';
  return { seed, actor: { ...actor }, target: { ...target }, skill, support };
}
async function perform(arranged, skillId) {
  await loadSeed(page, arranged.seed);
  await ensureBattleInformationOpen(page);
  await page.locator(`.world-battlefield .unit[data-unit-id="${arranged.actor.id}"]`).click();
  await page.locator(skillId ? '.cmd-skill' : '.cmd-attack').click();
  if (skillId) await page.locator(`.skill-choice-dialog button[data-skill-id="${skillId}"]`).click();
  if (arranged.support) {
    await page.locator(`.support-target-dialog button[data-target-id="${arranged.target.id}"]`).click();
    await page.getByRole('button', { name: '마법 사용', exact: true }).click();
  } else await page.locator('.battle-target-buttons button').filter({ hasText: arranged.target.name }).first().click();
  return readBattle(page);
}
function savedEvidence(saved, actorId, targetId) {
  const actor = saved.units.find(unit => unit.id === actorId);
  const target = saved.units.find(unit => unit.id === targetId);
  return { actor: actor && { hp: actor.hp, x: actor.x, y: actor.y, advancedMastery: actor.advancedMastery, skillCooldowns: actor.skillCooldowns, status: actor.status },
    target: target && { hp: target.hp, x: target.x, y: target.y, status: target.status }, partyMastery: saved.party.find(unit => unit.id === actorId)?.advancedMastery };
}
try {
  for (const spec of specs) {
    const item = { ...spec, fixture: 'normal enemy HP/stats preserved; explicit safe proximity; healing target HP50%; no stat amplification', checks: [] };
    const errorStart = errors.length;
    try {
      const campaign = createStageSeed(spec.stage);
      assert.ok(campaign.party.some(unit => unit.id === spec.id));
      campaign.deployedIds = [...campaign.deployedIds.filter(id => id !== spec.id).slice(0, 14), spec.id];
      assert.equal(campaign.deployedIds.length, 15);
      await loadSeed(page, campaign);
      await enterStage(page, spec.stage);
      assert.ok(await page.locator('.deployment-roster-card').filter({ hasText: campaign.party.find(unit => unit.id === spec.id).name }).count());
      await startDeploymentBattle(page);
      const actual = await readBattle(page);
      assert.ok(actual.units.some(unit => unit.id === spec.id));
      await ensureBattleInformationOpen(page);
      await page.locator(`.world-battlefield .unit[data-unit-id="${spec.id}"]`).click();
      item.infoText = await page.locator('.unit-info').innerText();
      if (spec.classLabel) {
        assert.ok(item.infoText.includes(spec.classLabel), `actual information UI ${spec.classLabel}`);
        assert.ok(!item.infoText.includes('검 타입'));
      }
      item.checks.push('actual entry/deployment/new ally in selected 15/information weapon class');
      const basic = positioned(actual, spec);
      let basicAfter;
      for (let attempt = 0; attempt < 3; attempt++) {
        basicAfter = await perform(basic);
        if ((basicAfter.units.find(unit => unit.id === basic.target.id)?.hp ?? 0) < basic.target.hp) break;
      }
      assert.ok((basicAfter.units.find(unit => unit.id === basic.target.id)?.hp ?? 0) < basic.target.hp, 'real basic attack damage');
      item.basic = savedEvidence(basicAfter, spec.id, basic.target.id);
      item.checks.push('real basic attack original enemy HP');
      for (const skillId of [spec.primary, spec.secondary].filter(Boolean)) {
        const arranged = positioned(actual, spec, skillId);
        let after;
        for (let attempt = 0; attempt < 3; attempt++) {
          after = await perform(arranged, skillId);
          const target = after.units.find(unit => unit.id === arranged.target.id);
          if (arranged.support ? target.hp > arranged.target.hp : (target?.hp ?? 0) < arranged.target.hp) break;
        }
        const actorAfter = after.units.find(unit => unit.id === spec.id);
        const targetAfter = after.units.find(unit => unit.id === arranged.target.id);
        assert.ok(arranged.support ? targetAfter.hp > arranged.target.hp : (targetAfter?.hp ?? 0) < arranged.target.hp, 'skill actually damages or heals');
        assert.ok((actorAfter.advancedMastery || 0) > (arranged.actor.advancedMastery || 0), 'successful skill increments mastery');
        assert.equal(after.party.find(unit => unit.id === spec.id).advancedMastery, actorAfter.advancedMastery, 'party mastery persists');
        if (skillId === spec.primary && spec.status === 'push') assert.ok(targetAfter.x !== arranged.target.x || targetAfter.y !== arranged.target.y, 'real push');
        if (skillId === spec.primary && ['slow', 'armorBreak'].includes(spec.status)) assert.ok(targetAfter.status.some(status => status.type === spec.status), spec.status);
        if (skillId === 'green-breath') assert.ok(targetAfter.status.some(status => status.type === 'regen'), 'real regen');
        const evidence = savedEvidence(after, spec.id, arranged.target.id);
        await loadSeed(page, after);
        const restored = await readBattle(page);
        assert.deepEqual(savedEvidence(restored, spec.id, arranged.target.id), evidence, 'damage/status/mastery/coordinates survive continue');
        item[skillId] = evidence;
        item.checks.push(`${skillId}/damage-or-heal/status/mastery/save-continue`);
      }
      // One real opponent turn on the normal starting board after this ally's normal hit.
      await loadSeed(page, basicAfter);
      await page.locator('.battle-end-turn-float').click();
      const enemyAfter = await readBattle(page);
      assert.equal(enemyAfter.round, basicAfter.round + 1);
      assert.equal(enemyAfter.turn, 'ally');
      item.enemyTurn = { round: enemyAfter.round, livingNewAlly: enemyAfter.units.some(unit => unit.id === spec.id && unit.hp > 0) };
      item.checks.push('actual enemy turn/end cleanup');
      await page.screenshot({ path: `${out}/${spec.stage}-${spec.id}.png` });
      item.status = 'passed';
    } catch (error) { item.status = 'failed-or-uncertain'; item.error = error.stack; await page.screenshot({ path: `${out}/${spec.stage}-${spec.id}-failure.png` }).catch(() => {}); }
    item.errors = errors.slice(errorStart);
    if (item.errors.length) item.status = 'failed-or-uncertain';
    results.push(item);
    await writeFile(`${out}/report.json`, JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify(item));
  }
} finally { await browser.close(); }
if (results.some(item => item.status !== 'passed')) process.exitCode = 1;
