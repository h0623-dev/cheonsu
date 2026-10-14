import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { qaBrowserOptions } from './qa-browser.mjs';
import { configurePage, createStageSeed, enterStage, loadSeed, readBattle, startDeploymentBattle, watchErrors, QA_URL } from './qa175-harness.mjs';
const browser = await chromium.launch(qaBrowserOptions());
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
const errors = [];
watchErrors(page, errors);
try {
  await configurePage(page);
  await loadSeed(page, createStageSeed(15));
  await enterStage(page, 15);
  await startDeploymentBattle(page);
  const seed = await readBattle(page);
  seed.turn = 'enemy';
  seed.selectedUnit = null;
  seed.units = seed.units.map(unit => unit.type === 'ally' ? { ...unit, acted: true, moved: true } : unit);
  // Enemy turns were formerly saveable; preserve their already-processed start state.
  seed.hazards = [];
  const enemiesBefore = seed.units.filter(unit => unit.type !== 'ally');
  await loadSeed(page, seed);
  const resumed = await readBattle(page);
  assert.equal(resumed.turn, 'ally');
  assert.equal(resumed.round, seed.round + 1);
  assert.ok(resumed.units.some(unit => unit.type === 'ally' && unit.hp > 0 && !unit.acted));
  assert.ok(enemiesBefore.some(before => {
    const after = resumed.units.find(unit => unit.id === before.id);
    return after && (after.x !== before.x || after.y !== before.y);
  }), 'saved enemy board actually executes enemy movement');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ stage: 15, turn: resumed.turn, round: resumed.round, allyReady: true, enemiesMoved: true, errors }));
} finally {
  await browser.close();
}
