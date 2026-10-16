// QA A팀: 1~50장 저장/철수/재도전/정산 경계를 각각 실행한다.
// 실제 화면 자연 연속 클리어와 구분하는 엔진 계약 검사이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import { stages } from '../src/data/stages.js';
import { createBattlefieldTerrain } from '../src/data/stageTerrain.js';
import { EQUIPMENT, EQUIPMENT_SLOTS } from '../src/data/equipment.js';
import { RECRUIT_BY_STAGE } from '../src/data/characterCollection.js';
import { applyEquipmentStats, getInitialParty, mergePartyIntoStage, grantExp } from '../src/engine/partyEngine.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { createDefeatCheckpoint, createVictoryCheckpoint, getCampBattleStageId, getCampTrainingAvailability,
  getUnlockedStageIds, writeProgressSave } from '../src/engine/campaignProgress.js';
import { getBattleOutcome } from '../src/engine/battleOutcome.js';
import { getStageMission } from '../src/engine/stageMission.js';
import { getStageRoundLimit, isMajorBossStage } from '../src/engine/stageRules.js';
import { getStageEnemyLevel } from '../src/engine/enemyProgression.js';
import { connectedGround, distributeBattleFormations } from '../src/engine/formations.js';
import { getDeploymentCells, reconcileDeploymentPlacements, validateDeploymentPlacements } from '../src/engine/deploymentEngine.js';
import { getEnemyAttackChoice, moveEnemyToward } from '../src/engine/enemyAI.js';
import { getAttackRange, canCounter, isTerrainBlocked } from '../src/engine/movement.js';
import { applyRecruitStartingGrowth } from '../src/engine/recruitmentEngine.js';
import { createExpansionRecruit, getAdvancedPromotionForms, applyAdvancedPromotion, canAdvancedPromote } from '../src/engine/promotionEngine.js';
import { promoteAllyUnit, canPromoteUnit } from '../src/engine/ordinaryPromotion.js';
import { getSkillDisplayName } from '../src/data/skills.js';
import { triggerBossPhases } from '../src/engine/combat.js';

const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
const getFunction = name => {
  const node = ast.body.find(entry => entry.type === 'FunctionDeclaration' && entry.id?.name === name);
  assert.ok(node, `실제 App 함수 ${name}`);
  return source.slice(node.start, node.end);
};
const createRecruitAlly = runInNewContext(`${getFunction('createRecruitAlly')}\ncreateRecruitAlly`, {
  createExpansionRecruit, applyRecruitStartingGrowth, getSkillDisplayName,
});
const json = value => JSON.parse(JSON.stringify(value));
const key = ({ x, y }) => `${x},${y}`;
const initial = getInitialParty();
const allParty = [...initial];
for (const id of Object.values(RECRUIT_BY_STAGE)) if (!allParty.some(unit => unit.id === id)) {
  allParty.push(json(createRecruitAlly(id, initial)));
}
const rows = [];

for (const authoredStage of stages) {
  // App의 새 전투는 원본 8×8가 아닌 createBattlefieldTerrain의 실제 크기 맵을 쓴다.
  const stage = { ...authoredStage, map: createBattlefieldTerrain(authoredStage.id), terrainRevision: 3 };
  const cleared = stages.filter(entry => entry.id < stage.id).map(entry => entry.id);
  const ownedIds = new Set([...initial.map(unit => unit.id), ...Object.entries(RECRUIT_BY_STAGE)
    .filter(([join]) => Number(join) < stage.id).map(([, id]) => id)]);
  const party = allParty.filter(unit => ownedIds.has(unit.id));
  const deployed = distributeBattleFormations(stage, mergePartyIntoStage(stage, party.slice(0, 15)));
  const seed = normalizeSaveData({ screen: 'battle', selectedStage: stage, party, units: deployed,
    clearedStages: cleared, deployedIds: party.slice(0, 15).map(unit => unit.id), campWalkerId: 'lina',
    round: 3, turn: 'enemy', gold: 9137, inventory: { potion: 7, hiPotion: 3, remedy: 2 },
    gearInventory: ['ironSword'], battleLoot: { gold: 85, items: { potion: 2 }, gear: ['leatherArmor'] },
    stageRewardClaimed: false, trainingUsed: false, dispatchUsed: true,
  }, '1.99.176');

  test(`${stage.id}장: 실제 보유 동료의 한정 배치/연결된 땅/모든 적 접근`, () => {
    const accessible = new Set(connectedGround(stage.map).map(key));
    const walkable = stage.map.flat().filter(tile => !isTerrainBlocked(tile)).length;
    assert.equal(accessible.size, walkable);
    assert.equal(new Set(deployed.map(unit => unit.id)).size, deployed.length);
    assert.equal(new Set(deployed.map(key)).size, deployed.length);
    for (const unit of deployed) assert.ok(accessible.has(key(unit)), `${stage.id}장 ${unit.id} 접근`);
    const ids = deployed.filter(unit => unit.type === 'ally').map(unit => unit.id);
    const cells = getDeploymentCells(stage, deployed);
    const placements = reconcileDeploymentPlacements(null, stage, deployed, ids, cells);
    assert.equal(validateDeploymentPlacements(stage, deployed, ids, placements, cells).ok, true);
    assert.ok(cells.length < walkable, '아군 진영 전체 자유 배치를 허용하지 않음');
    // 적마다 다른 적의 길막을 제거한 독립 접근 검사: 매 턴 실제 이동 정책을 반복한다.
    for (const enemy of deployed.filter(unit => unit.type !== 'ally')) {
      const target = deployed.find(unit => unit.id === 'hero');
      let current = enemy, attack = getEnemyAttackChoice(current, [target], stage.map);
      const visited = new Set();
      for (let turn = 0; turn < stage.map.length * stage.map[0].length && !attack; turn++) {
        assert.ok(!visited.has(key(current)), `${stage.id}장 ${enemy.id} 추적이 반복/대기: ${key(current)}`);
        visited.add(key(current));
        current = moveEnemyToward(current, [target], [current, target], stage.map);
        attack = getEnemyAttackChoice(current, [target], stage.map);
      }
      assert.ok(attack, `${stage.id}장 ${enemy.id} 실제 공격 위치에 도달`);
    }
  });

  test(`${stage.id}장: 피해/상태/적 행동/카일 쓰러짐/전직/장비를 저장 반복 후 보존`, () => {
    const modified = { ...seed, units: seed.units.filter(unit => unit.id !== 'hero').map((unit, index) => ({
      ...unit, hp: Math.max(1, unit.hp - 1), acted: index % 2 === 0, moved: true,
      status: [{ type: 'burn', turns: 2, sourceId: 'hero' }],
    })) };
    let restored = json(modified);
    for (let pass = 0; pass < 3; pass++) restored = normalizeSaveData(json(restored), '1.99.176');
    assert.deepEqual(restored.units, modified.units);
    assert.deepEqual(restored.party, modified.party);
    assert.deepEqual(restored.inventory, modified.inventory);
    assert.deepEqual(restored.clearedStages, cleared);
    assert.deepEqual(restored.unlockedStages, getUnlockedStageIds(cleared));
    assert.equal(restored.round, 3);
    assert.equal(restored.turn, 'enemy');
    assert.equal(restored.campWalkerId, 'lina');
    assert.equal(getBattleOutcome(stage, restored.units), null, '카일 사망만으로 패배하지 않음');
  });

  test(`${stage.id}장: 패배→재진입은 훈련/다음 장/보상 해금 없이 성장과 기존 자산 보존`, () => {
    let current = seed;
    for (let retry = 0; retry < 3; retry++) {
      current = normalizeSaveData(json(createDefeatCheckpoint(current).checkpoint), '1.99.176');
      assert.equal(getCampTrainingAvailability(current).allowed, false);
      assert.equal(getCampBattleStageId(current), stage.id);
      assert.deepEqual(current.clearedStages, cleared);
      assert.equal(current.unlockedStages.includes(stage.id + 1), false);
      assert.equal(current.gold, seed.gold);
      assert.deepEqual(current.inventory, seed.inventory);
      assert.deepEqual(current.gearInventory, seed.gearInventory);
      assert.equal(current.dispatchUsed, true);
      assert.equal(current.party.length, seed.party.length);
      assert.ok(current.party.every(unit => unit.hp === unit.maxHp));
      assert.deepEqual(current.battleLoot, { gold: 0, items: {}, gear: [] });
    }
  });

  test(`${stage.id}장: 미션/전원 전멸/지휘관 섬멸/2페이즈 1회/첫 정산·재정산 보존`, () => {
    const mission = getStageMission(stage);
    assert.equal(mission.roundLimit, getStageRoundLimit(stage));
    assert.ok(!mission.defeatConditions.some(condition => /카일|주인공/.test(condition.text)));
    const leaders = new Set(stage.units.filter(unit => unit.type === 'boss' || unit.id === 'boss').map(unit => unit.id));
    const aliveAllies = seed.units.filter(unit => unit.type === 'ally');
    assert.equal(getBattleOutcome(stage, seed.units.filter(unit => unit.type !== 'ally')), 'defeat');
    assert.equal(getBattleOutcome(stage, aliveAllies), 'victory');
    if (leaders.size) assert.equal(getBattleOutcome(stage, seed.units.filter(unit => !leaders.has(unit.id))), 'victory');
    const bosses = seed.units.filter(unit => unit.type === 'boss').map(unit => ({ ...unit, hp: Math.floor(unit.maxHp / 2) }));
    const phase = triggerBossPhases(bosses);
    assert.ok(phase.units.every(unit => unit.phase2 && Number.isFinite(unit.atk)));
    assert.deepEqual(triggerBossPhases(phase.units).units, phase.units, '2페이즈 능력치 중복 증가 없음');
    const receipt = createVictoryCheckpoint(seed, { party: seed.party, reward: { gold: 321, potion: 2 },
      careerStats: {}, stageMastery: {}, message: 'QA 정산' });
    assert.equal(receipt.checkpoint.gold, seed.gold + 321);
    assert.equal(receipt.checkpoint.inventory.potion, seed.inventory.potion + 4);
    assert.ok(receipt.checkpoint.clearedStages.includes(stage.id));
    if (stage.id < 50) assert.ok(receipt.checkpoint.unlockedStages.includes(stage.id + 1));
    assert.equal(getCampTrainingAvailability(receipt.checkpoint).allowed, true);
    const saved = normalizeSaveData(json(receipt.checkpoint), '1.99.176');
    const replay = createVictoryCheckpoint(saved, { party: saved.party, reward: { gold: 321, potion: 2 },
      careerStats: {}, stageMastery: {}, message: 'QA 재도전 정산' });
    assert.equal(replay.replay, true);
    assert.equal(replay.checkpoint.gold, saved.gold);
    assert.deepEqual(replay.checkpoint.inventory, saved.inventory);
    assert.deepEqual(replay.checkpoint.gearInventory, saved.gearInventory);
    rows.push({ stage: stage.id, allies: party.length, deployed: aliveAllies.length,
      enemies: deployed.length - aliveAllies.length, roundLimit: mission.roundLimit,
      normalEnemyLevel: getStageEnemyLevel(stage.id), lifecycle: 'pass' });
  });
}

test('21명 신규 합류 70%·5/10레벨 전직·분기 반복·장비 재계산이 성장값을 중복하지 않음', () => {
  assert.equal(allParty.length, 21);
  for (const unit of allParty) {
    assert.equal(canPromoteUnit({ ...unit, level: 4 }, 100000).ok, false);
    assert.equal(canPromoteUnit({ ...unit, level: 5 }, 100000).ok, true);
    for (const gear of Object.values(EQUIPMENT).filter(item => item.allowed.includes(unit.id))) {
      assert.ok(EQUIPMENT_SLOTS.includes(gear.slot));
      const equipped = applyEquipmentStats({ ...unit, equipment: { ...unit.equipment, [gear.slot]: gear.id },
        gearEnhance: { [gear.id]: 5 } });
      assert.deepEqual(applyEquipmentStats(equipped), equipped);
      assert.equal(equipped.hp, unit.hp);
      assert.equal(equipped.maxHp, unit.maxHp);
    }
    const level10 = grantExp([unit], unit.id, 900).units[0];
    const promoted = { ...promoteAllyUnit(level10), advancedMastery: 3 };
    const original = { hp: promoted.hp, maxHp: promoted.maxHp, atk: promoted.atk, def: promoted.def, move: promoted.move };
    const forms = getAdvancedPromotionForms(promoted);
    assert.equal(forms.length, 2);
    assert.equal(canAdvancedPromote({ ...promoted, level: 9 }, forms[0].id,
      { party: [promoted], clearedStages: [31], gold: 100000 }).ok, false);
    assert.equal(canAdvancedPromote(promoted, forms[0].id,
      { party: [promoted], clearedStages: [31], gold: 100000 }).ok, true);
    let next = promoted;
    for (const form of [forms[0], forms[1], forms[0], forms[1]]) {
      const result = applyAdvancedPromotion(next, form.id, { party: [next], clearedStages: [31], gold: 100000 });
      assert.equal(result.ok, true);
      next = result.unit;
      assert.equal(next.maxHp, original.maxHp + form.bonuses.hp);
      assert.equal(next.atk, original.atk + form.bonuses.atk);
      assert.equal(next.def, original.def + form.bonuses.def);
      assert.equal(next.move, original.move + form.bonuses.move);
      assert.ok(next.hp <= original.hp, '분기 교체로 무료 회복 없음');
    }
    if (Object.values(RECRUIT_BY_STAGE).includes(unit.id)) {
      for (const highest of [1, 7, 10, 29, 50]) {
        const recruited = createRecruitAlly(unit.id, [{ ...initial[0], level: highest }]);
        assert.equal(recruited.level, Math.max(1, Math.floor(highest * .7)));
        assert.equal(recruited.hp, recruited.maxHp);
      }
    }
  }
});

test('궁수 반격은 정확히 2칸, 1칸 미반격이며 쓰러진 궁수는 반격하지 않음', () => {
  const map = Array.from({ length: 8 }, () => Array(8).fill('plain'));
  for (const id of ['lina', 'teo']) {
    const archer = { ...allParty.find(unit => unit.id === id), x: 3, y: 3 };
    assert.deepEqual(getAttackRange(archer), { min: 2, max: 2 });
    for (let range = 1; range <= 3; range++) {
      const attacker = { id: 'enemy', type: 'enemy', hp: 20, x: 3 + range, y: 3 };
      assert.equal(canCounter(attacker, archer, map), range === 2);
      assert.equal(canCounter(attacker, { ...archer, hp: 0 }, map), false);
    }
  }
});

test('주 저장 슬롯 성공 후 백업 용량 초과는 기존 진행 저장을 되돌리지 않음', () => {
  const data = new Map([['cheonsu_v01_save', '{"old":true}']]);
  const storage = { getItem: name => data.get(name) || null,
    setItem(name, value) { if (name !== 'cheonsu_v01_save') throw Error('QuotaExceededError'); data.set(name, value); } };
  assert.deepEqual(writeProgressSave(storage, { clearedStages: [1, 2, 3] }), { backupOk: false });
  assert.deepEqual(JSON.parse(data.get('cheonsu_v01_save')), { clearedStages: [1, 2, 3] });
});

test('50장 주요 보스 9개 장은 실제 App 편성·브리핑·보급 추천에 같은 기준으로 반영', () => {
  const major = new Set([6, 12, 18, 24, 30, 35, 40, 45, 50]);
  const names = ['getRecommendedFormationForStage', 'getStageBriefingTips', 'getRecommendedSupplyItems', 'getReinforcementRounds'];
  const api = runInNewContext(`${names.map(getFunction).join('\n')}\n({${names.join(',')}})`, { isMajorBossStage });
  for (const { id } of stages) {
    // 장 이름의 '성/보스' 휴리스틱이 번호 판정 누락을 숨기지 않도록 중립 문구를 쓴다.
    const stage = { id, title: '중립 지대', desc: '중립 안내' };
    const expected = major.has(id);
    assert.equal(isMajorBossStage(id), expected, `${id}장 숫자 판정`);
    assert.equal(isMajorBossStage(stage), expected, `${id}장 전장 객체 판정`);
    assert.equal(api.getRecommendedFormationForStage(stage), expected ? 'guard' : 'balanced', `${id}장 추천 편성`);
    assert.equal(api.getStageBriefingTips(stage).some(line => line.includes('2페이즈')), expected, `${id}장 브리핑`);
    const supplies = api.getRecommendedSupplyItems(stage);
    assert.equal(supplies.includes('guardCharm'), expected, `${id}장 수호 부적`);
    assert.equal(supplies.includes('powerCharm'), expected, `${id}장 공격 부적`);
  }
});

test('50장 실제 정산 골드는 난이도×밸런스 프리셋을 적용하고 전리품은 재보정하지 않음', async () => {
  const names = ['DIFFICULTY_OPTIONS', 'BALANCE_PRESET_OPTIONS'];
  const constants = ast.body.filter(entry => entry.type === 'VariableDeclaration' && entry.declarations.some(item => names.includes(item.id?.name)));
  const declaration = node => source.slice(node.start, node.end);
  let expression;
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === 'rewardGold') expression = source.slice(node.init.start, node.init.end);
    for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(walk); else if (child && typeof child === 'object') walk(child);
  };
  walk(ast);
  assert.ok(expression, '실제 settleStageClear rewardGold 식');
  const execute = runInNewContext(`${constants.map(declaration).join('\n')}\n${['getDifficultyConfig', 'getBalancePresetConfig', 'getDifficultyRewardGold'].map(getFunction).join('\n')}\n(settings,reward,bonus,battleLoot)=>(${expression})`);
  const difficulty = { story: .9, normal: 1, hard: 1.18, nightmare: 1.38 };
  const balance = { standard: 1, heroic: .95, swarm: 1.08, bossRush: 1.12 };
  const results = [];
  for (const stage of stages) for (const [difficultyId, d] of Object.entries(difficulty)) for (const [balancePreset, b] of Object.entries(balance)) {
    const reward = stage.reward, bonus = { gold: 77 }, loot = { gold: 19 };
    const expected = Math.round(reward.gold * d * b) + Math.round(77 * d * b) + 19;
    const actual = execute({ difficulty: difficultyId, balancePreset }, reward, bonus, loot);
    results.push({ stage: stage.id, difficulty: difficultyId, balancePreset, expected, actual, pass: actual === expected });
  }
  if (process.env.CHEONSU_QA_EVIDENCE_DIR) {
    await mkdir(process.env.CHEONSU_QA_EVIDENCE_DIR, { recursive: true });
    await writeFile(`${process.env.CHEONSU_QA_EVIDENCE_DIR}/reward-matrix.json`, JSON.stringify(results, null, 2));
  }
  assert.equal(results.filter(row => !row.pass).length, 0,
    JSON.stringify(results.filter(row => !row.pass).slice(0, 4)));
});

test.after(async () => {
  if (!process.env.CHEONSU_QA_EVIDENCE_DIR) return;
  await mkdir(process.env.CHEONSU_QA_EVIDENCE_DIR, { recursive: true });
  await writeFile(`${process.env.CHEONSU_QA_EVIDENCE_DIR}/stage-engine-contracts.json`, JSON.stringify({
    generatedAt: new Date().toISOString(), mode: 'engine-contract-not-natural-full-clear', stages: rows,
  }, null, 2));
});
