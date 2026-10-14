// 장별 저장 시나리오에서 실제 화면·전투를 검사한다. 무중단 자연 클리어 증거와 구분한다.
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { stages } from '../src/data/stages.js';
import { RECRUIT_BY_STAGE } from '../src/data/characterCollection.js';
import { DEFAULT_GEAR_INVENTORY } from '../src/data/equipment.js';
import { getInitialParty, grantExp } from '../src/engine/partyEngine.js';
import { createExpansionRecruit } from '../src/engine/promotionEngine.js';
import { applyRecruitStartingGrowth } from '../src/engine/recruitmentEngine.js';
import { getStageEnemyLevel } from '../src/engine/enemyProgression.js';
import { getSkillDisplayName } from '../src/data/skills.js';
import { getPromotionCost, promoteAllyUnit } from '../src/engine/ordinaryPromotion.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { saveBattle, waitForBattleReady } from './qa-battle-tools.mjs';
import { waitForDeployment, startDeploymentBattle } from './qa-deployment-flow.mjs';

export const QA_URL = process.env.QA_URL || 'http://127.0.0.1:4173';
export const SAVE_KEY = 'cheonsu_v01_save';
const info = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const source = await readFile(process.env.CHEONSU_QA_APP_SNAPSHOT || new URL('../src/App.jsx', import.meta.url), 'utf8');
const { body } = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
const node = body.find(entry => entry.type === 'FunctionDeclaration' && entry.id?.name === 'createRecruitAlly');
if (!node) throw Error('실제 동료 생성 함수를 찾을 수 없습니다.');
export const createRecruitAlly = runInNewContext(`${source.slice(node.start, node.end)}\ncreateRecruitAlly`, {
  createExpansionRecruit, applyRecruitStartingGrowth, getSkillDisplayName,
});

export function createStageSeed(stageId, { count = 15, level = getStageEnemyLevel(stageId), ordinary = true } = {}) {
  const stage = stages.find(entry => entry.id === stageId);
  if (!stage) throw Error(`존재하지 않는 장: ${stageId}`);
  let party = getInitialParty().map(unit => grantExp([unit], unit.id, Math.max(0, level - unit.level) * 100).units[0]);
  for (const [join, id] of Object.entries(RECRUIT_BY_STAGE)) {
    if (Number(join) >= stageId || party.some(unit => unit.id === id)) continue;
    const recruit = createRecruitAlly(id, party);
    if (recruit) party.push(JSON.parse(JSON.stringify(recruit)));
  }
  let gold = 300 + stages.filter(entry => entry.id < stageId).reduce((sum, entry) => sum + (entry.reward?.gold || 0), 0);
  if (ordinary) party = party.map(unit => {
    const cost = getPromotionCost(unit);
    if (unit.level < 5 || unit.promoted || gold < cost) return unit;
    gold -= cost;
    return promoteAllyUnit(unit);
  });
  return normalizeSaveData({
    screen: 'campaign', selectedStage: stage, party, units: [], round: 1, turn: 'ally', mode: 'move',
    clearedStages: stages.filter(entry => entry.id < stageId).map(entry => entry.id),
    deployedIds: party.slice(0, count).map(unit => unit.id), campWalkerId: 'lina',
    gold, gearInventory: [...new Set([...DEFAULT_GEAR_INVENTORY,
      ...stages.filter(entry => entry.id < stageId).flatMap(entry => entry.reward?.gear || [])])],
    gearEnhance: {}, inventory: { potion: 12, hiPotion: 6, remedy: 6, powerCharm: 2, guardCharm: 2 },
    stageRewardClaimed: false, trainingUsed: false,
    lastBattleResult: stageId > 1 ? { stageId: stageId - 1, outcome: 'victory' } : null,
  }, info.version);
}
export const createCampaignSeed = createStageSeed;

export async function configurePage(page, { fullEffects = false } = {}) {
  await page.addInitScript(({ fullEffects }) => {
    localStorage.setItem('cheonsu_auto_patch', 'false');
    localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false,
      cutsceneMode: fullEffects ? 'full' : 'off', effectsOn: fullEffects,
      battleSpeed: 'turbo', battleSpeedRevision: 1, autoUseItems: false,
      autoUseSkills: true, autoBattleMode: 'aggressive' }));
  }, { fullEffects });
}
export async function loadSeed(page, seed, base = QA_URL) {
  await page.goto(base);
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: SAVE_KEY, data: seed });
  await page.reload();
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
}
export async function enterStage(page, id) {
  await page.locator('.campaign-stage-select button').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${id}장[.]`) }) }).click();
  await waitForDeployment(page);
}
export const readSaved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
export async function readBattle(page) { await saveBattle(page); return readSaved(page); }
export function watchErrors(page, errors, base = QA_URL) {
  page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack }));
  page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(base)) errors.push({ message: `${response.status()} ${response.url()}` }); });
}
export { waitForDeployment, startDeploymentBattle, waitForBattleReady };
