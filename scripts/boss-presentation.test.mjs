import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_PRESENTATIONS, BOSS_PRESENTATION_TONES, getBossPresentation } from '../src/data/bossPresentation.js';
import { stages } from '../src/data/stages.js';
import { getChapterBossName } from '../src/data/chapterIdentity.js';
import { triggerBossPhases } from '../src/engine/combat.js';
import { createExpansionBossHazards } from '../src/data/expansionEnemies.js';

const stageAt = id => stages.find(stage => stage.id === id);
const bossAt = id => {
  const boss = structuredClone(stageAt(id).units.find(unit => unit.type === 'boss'));
  return { ...boss, name: getChapterBossName(id, boss.name) };
};
const awaken = boss => triggerBossPhases([{ ...boss, hp: Math.ceil(boss.maxHp * 0.5) }]).units[0];
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test('50장 모두 현재 보스 정체성과 고유 등장 대사·별칭을 갖는다', () => {
  assert.deepEqual(Object.keys(BOSS_PRESENTATIONS).map(Number), stages.map(stage => stage.id));
  assert.equal(stages.length, 50);
  const epithets = new Set(), quotes = new Set();
  for (const stage of stages) {
    const boss = bossAt(stage.id);
    const authored = BOSS_PRESENTATIONS[stage.id];
    const presentation = getBossPresentation(stage, boss);
    assert.equal(authored.bossName, boss.name, `${stage.id}장: 기존 보스의 이름과 이야기를 유지한다`);
    assert.equal(presentation.stageTitle, stage.title);
    assert.equal(presentation.stageId, stage.id);
    assert.ok(BOSS_PRESENTATION_TONES[presentation.tone], `${stage.id}장: 표시 가능한 분위기`);
    for (const field of ['epithet', 'quote', 'threat', 'arenaLabel', 'atmosphere', 'rankLabel']) {
      assert.equal(typeof presentation[field], 'string', `${stage.id}장 ${field}`);
      assert.match(presentation[field], /[가-힣]/, `${stage.id}장 ${field}: 한국어 표시`);
    }
    assert.ok(presentation.quote.length <= 70, `${stage.id}장: 모바일에 표시할 한 줄 대사`);
    assert.ok(presentation.threat.length <= 120, `${stage.id}장: 실제 전투 특성의 간결한 안내`);
    epithets.add(presentation.epithet);
    quotes.add(presentation.quote);
  }
  assert.equal(epithets.size, 50);
  assert.equal(quotes.size, 50);
});

test('등장·각성 정보를 읽어도 현재 저장의 체력·장비·행동·위치와 원본 스테이지가 바뀌지 않는다', () => {
  for (const id of [1, 6, 13, 28, 30, 32, 35, 40, 45, 50]) {
    const stage = deepFreeze(structuredClone(stageAt(id)));
    const source = { ...bossAt(id), hp: 7, x: 4, y: 5, acted: true, moved: true,
      equipment: { weapon: 'saved-weapon' }, status: [{ type: 'burn', turns: 1 }],
      skillCooldowns: { 'saved-skill': 2 } };
    const boss = deepFreeze(structuredClone(source));
    const before = structuredClone({ stage, boss });
    getBossPresentation(stage, boss);
    getBossPresentation(stage, deepFreeze({ ...boss, phase2: true }));
    assert.deepEqual({ stage, boss }, before);
  }
});

test('2칸 전용 사수와 1~2칸 수문장의 공격·스킬 사거리를 구분한다', () => {
  const archer = getBossPresentation(stageAt(32), bossAt(32));
  assert.match(archer.threat, /일반 공격 2칸/);
  assert.match(archer.threat, /비늘가시 화살 2칸/);
  assert.match(archer.threat, /이동 약화/);
  assert.doesNotMatch(archer.threat, /1~2칸/);
  const keeper = getBossPresentation(stageAt(35), bossAt(35));
  assert.match(keeper.threat, /일반 공격 1~2칸/);
  assert.match(keeper.threat, /수문 개방 1~2칸/);
  assert.match(keeper.threat, /방어감소/);
});

test('옛 보스의 각성은 실제 반올림 체력 경계와 어둠의 파동 2칸 변경을 안내한다', () => {
  const boss = { ...bossAt(1), hp: 25, maxHp: 25 };
  const intro = getBossPresentation(stageAt(1), boss);
  assert.equal(intro.phase.active, false);
  assert.equal(intro.phase.thresholdHp, 13);
  assert.match(intro.threat, /강타 1칸/);
  assert.match(intro.phase.threat, /일반 공격 2칸.*어둠의 파동 2칸/);
  assert.equal(triggerBossPhases([{ ...boss, hp: 14 }]).units[0].phase2, undefined);
  const phased = awaken(boss);
  assert.equal(phased.phase2, true);
  const current = getBossPresentation(stageAt(1), phased);
  assert.equal(current.phase.active, true);
  assert.match(current.threat, /어둠의 파동 2칸/);
  assert.doesNotMatch(current.threat, /강타|방어감소/);
  assert.equal(intro.phase.threat, `${current.threat} · 공격 +2 · 방어 +1`);
});

test('확장 20장 지휘관의 각성 안내가 실제 유지·교체된 스킬 및 종족과 일치한다', () => {
  for (let id = 31; id <= 50; id++) {
    const boss = bossAt(id);
    const phased = awaken(boss);
    const intro = getBossPresentation(stageAt(id), boss);
    const current = getBossPresentation(stageAt(id), phased);
    assert.equal(phased.phase2, true);
    assert.equal(current.artKey, boss.artId, `${id}장: 기존 종족의 아트 유지`);
    assert.equal(intro.phase.threat, `${current.threat} · 공격 +2 · 방어 +1`);
    assert.ok(current.threat.includes(phased.skill), `${id}장: 실제 각성 스킬 표시`);
    assert.doesNotMatch(current.threat, /어둠의 파동/, `${id}장: 확장 지휘관에 옛 보스 패턴을 붙이지 않는다`);
  }
  assert.match(getBossPresentation(31, awaken(bossAt(31))).threat, /집게 강타 1칸/);
  assert.match(getBossPresentation(40, awaken(bossAt(40))).threat, /고원의 결빙 1~2칸.*빙결/);
  assert.match(getBossPresentation(50, awaken(bossAt(50))).threat, /돌아갈 길 1~2칸.*공격 약화/);
});

test('확장 위험 칸은 실제 장판을 쓰는 4개 보스에게만 안내한다', () => {
  const hazardChapters = new Set([35, 40, 45, 50]);
  const map = Array.from({ length: 8 }, () => Array(8).fill('plain'));
  const hero = { id: 'hero', type: 'ally', hp: 50, maxHp: 50, x: 3, y: 3 };
  for (let id = 31; id <= 50; id++) for (const phase2 of [false, true]) {
    const boss = phase2 ? awaken(bossAt(id)) : bossAt(id);
    const presentation = getBossPresentation(stageAt(id), boss);
    const result = createExpansionBossHazards([boss, hero], map, 2);
    if (hazardChapters.has(id)) {
      assert.ok(result.hazards.length > 0);
      assert.ok(presentation.hazard.includes(result.pattern.label));
      assert.match(presentation.hazard, /짝수 라운드/);
      assert.equal(createExpansionBossHazards([boss, hero], map, 3).hazards.length, 0);
      assert.ok(presentation.phase.hazard.includes(result.pattern.label));
    } else {
      assert.equal(result.hazards.length, 0);
      assert.equal(presentation.hazard, '');
      assert.equal(presentation.phase.hazard, '', `${id}장: 일반종 지휘관에 없는 장판을 안내하지 않는다`);
    }
  }
});

test('진행 중 전투의 변경된 사거리와 스킬 비활성화가 남은 스킬 정보보다 우선한다', () => {
  const boss = { ...bossAt(32), range: 3, minRange: 3, skillType: null };
  const presentation = getBossPresentation(32, boss);
  assert.equal(presentation.threat, '일반 공격 3칸');
  assert.doesNotMatch(presentation.threat, /화살|이동 약화|2칸/);
  const customSkill = { ...boss, skillType: 'attack', skill: '저장된 기술',
    skillSpec: { name: '저장된 기술', type: 'attack', range: 4, minRange: 2, status: null } };
  const custom = getBossPresentation(32, customSkill);
  assert.match(custom.threat, /일반 공격 3칸.*저장된 기술 2~4칸/);
  assert.doesNotMatch(custom.threat, /이동 약화/);
});

test('28장의 살아 있는 가론과 30장의 흑야 잔영을 같은 최종 보스로 소개하지 않는다', () => {
  const garon = getBossPresentation(stageAt(28), bossAt(28));
  const remnant = getBossPresentation(stageAt(30), bossAt(30));
  assert.equal(bossAt(28).name, '흑천 가론');
  assert.equal(bossAt(30).name, '흑야의 잔영');
  assert.notEqual(garon.epithet, remnant.epithet);
  assert.notEqual(garon.rankLabel, remnant.rankLabel);
  assert.match(garon.phase.quote, /데려가/);
  assert.match(remnant.atmosphere, /갑옷을 훔친 잔영/);
  const finalOath = getBossPresentation(stageAt(50), bossAt(50));
  assert.equal(finalOath.rankLabel, '마지막 맹세');
  assert.match(finalOath.phase.quote, /함께 돌아가는 맹세/);
});
