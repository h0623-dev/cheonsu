import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getTurnCameraTarget, getCellScrollTarget } from '../src/engine/battleCamera.js';
import { combatUnitIds, combatEffectIds, getCombatPresentation, getCombatSprite, getCombatEffect } from '../src/data/combatArt.js';

test('turn camera only selects living units on the current side', () => {
  const units = [{ id: 'dead', type: 'enemy', hp: 0 }, { id: 'hero', type: 'ally', hp: 10, acted: true }, { id: 'lina', type: 'ally', hp: 12 }, { id: 'boss', type: 'boss', hp: 80 }];
  assert.equal(getTurnCameraTarget(units, 'enemy').id, 'boss');
  assert.equal(getTurnCameraTarget(units, 'ally', 'hero').id, 'lina');
  assert.equal(getTurnCameraTarget([], 'ally'), null);
  assert.equal(getTurnCameraTarget([{ id: 'hero', type: 'ally', hp: 20 }, ...units.slice(2)], 'ally', 'lina').id, 'lina');
});
test('camera respects map padding and visible space between HUD panels', () => {
  const target = getCellScrollTarget({ mapLeft: 20, mapTop: 72, cellWidth: 80, cellHeight: 65.6, x: 8, y: 14, viewportWidth: 390, viewportHeight: 844, topInset: 142, bottomInset: 188 });
  assert.equal(target.left, 505);
  assert.ok(Math.abs(target.top - 637.32) < .01);
});
test('weapon and healing presentation matches character artwork', () => {
  const hit = { outcome: { hit: true } };
  assert.equal(getCombatPresentation('lina', hit).effect, 'arrow');
  assert.equal(getCombatPresentation('leon', hit).effect, 'thrust');
  assert.equal(getCombatPresentation('rakan', hit).effect, 'heavy');
  assert.equal(getCombatPresentation('irene', hit).style, 'cast');
  assert.equal(getCombatPresentation('aria', { outcome: { heal: true } }).effect, 'heal');
  assert.equal(getCombatPresentation('hero', { outcome: { hit: false } }).miss, true);
  assert.equal(getCombatPresentation('hero', { ...hit, mode: 'skill', effectType: 'fire' }).effect, 'fire');
});
test('all combat poses and effects have real alpha and correct dimensions', async () => {
  assert.equal(combatUnitIds.length, 41);
  assert.equal(combatEffectIds.length, 16);
  const paths = [...combatUnitIds.flatMap(id => [getCombatSprite(id), getCombatSprite(id, 'action')]), ...combatEffectIds.map(getCombatEffect)];
  for (const asset of paths) {
    const source = await readFile(new URL(`../public${asset}`, import.meta.url));
    const meta = await sharp(source).metadata();
    assert.ok(meta.hasAlpha, asset);
    assert.equal(meta.width, asset.includes('/effects/') ? 384 : 512);
    const stats = await sharp(source).stats();
    assert.equal(stats.channels[3].min, 0, asset);
    assert.ok(stats.channels[3].max > 200, asset);
  }
});
