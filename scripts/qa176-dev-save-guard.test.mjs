import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'espree';
import * as journey from '../src/engine/playerExperience.js';
import { getInitialParty } from '../src/engine/partyEngine.js';

const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
function extract(name) {
  let result;
  function visit(node) {
    if (!node || typeof node !== 'object' || result) return;
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) result = source.slice(node.start, node.end);
    else if (node.type === 'VariableDeclarator' && node.id?.name === name) result = source.slice(node.init.start, node.init.end);
    if (result) return;
    for (const value of Object.values(node)) if (value && typeof value === 'object') {
      for (const child of Array.isArray(value) ? value : [value]) visit(child);
    }
  }
  visit(tree); assert.ok(result, `${name} 실제 함수`);
  return result;
}
const valid = () => ({ version: '1.99.175', party: getInitialParty(), clearedStages: [1, 2, 3, 4, 5],
  gold: 9123, savedAt: '2026-10-15T09:00:00Z', screen: 'camp', currentStageId: 6 });
const malformed = ['null', '[]', '{}', '42', '"not a save"', '{"savedAt":"2099-01-01"}',
  '{"party":[]}', '{"party":[null]}', '{"party":[{}]}', '{"party":[{"id":""}]}',
  '{"party":[{"id":"hero"}],"clearedStages":"1,2"}'];
function harness(entries = {}) {
  const data = new Map(Object.entries(entries)), writes = [], alerts = [], confirmations = [], continued = [];
  const context = {
    SAVE_KEY: 'current', SAVE_BACKUP_KEY: 'backup', SAVE_PREVIOUS_KEY: 'previous', SAVE_VERSION: '1.99.176',
    getManualSaveSlotKey: id => `manual${id}`,
    isSaveJourneyData: data => journey.isSaveJourneyData(data),
    localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => { writes.push([key, value]); data.set(key, value); } },
    alert: message => alerts.push(message), window: { confirm: message => { confirmations.push(message); return true; } },
    console: { error: () => {} },
    playSfx: () => {}, setSaveNotice: () => {}, setSaveHealthRefreshKey: () => {}, setSaveImportText: () => {},
    continueGame: () => continued.push(true),
  };
  const fn = name => runInNewContext(`(${extract(name)})`, context);
  context.getSaveSummary = fn('getSaveSummary');
  context.parseSaveImportBundle = fn('parseSaveImportBundle');
  return { data, writes, alerts, confirmations, continued, context, fn };
}

test('저장 요약·메뉴는 파싱 가능한 손상 JSON을 정상 저장으로 인정하지 않는다', () => {
  const h = harness();
  for (const raw of malformed) {
    assert.equal(h.context.getSaveSummary(raw).ok, false, raw);
    assert.equal(journey.readMenuCheckpoint({ getItem: () => raw }).data, null, raw);
  }
  assert.equal(h.context.getSaveSummary(JSON.stringify(valid())).ok, true);
});

test('추천 복구는 미래 시각의 잘못된 백업을 제외하고 유효한 진행을 선택한다', () => {
  const raw = JSON.stringify(valid());
  const h = harness({ current: raw, backup: '{"savedAt":"2099-01-01T00:00:00Z"}' });
  const best = h.fn('getBestRecoverableSave')();
  assert.equal(best.key, 'current');
  assert.equal(best.raw, raw);
  assert.deepEqual(h.writes, []);
});

test('수동 슬롯·자동/이전 백업 복구는 손상 데이터를 쓰기 전에 거절한다', () => {
  for (const name of ['loadManualSlot', 'restoreAutoBackup']) for (const raw of malformed) {
    const original = JSON.stringify(valid());
    const h = harness({ current: original, previous: original, backup: raw, manual1: raw });
    h.fn(name)(...(name === 'loadManualSlot' ? [1] : []));
    assert.equal(h.data.get('current'), original, `${name}: ${raw}`);
    assert.equal(h.data.get('previous'), original, `${name}: ${raw}`);
    assert.deepEqual(h.writes, []);
    assert.deepEqual(h.continued, []);
    assert.equal(h.alerts.length, 1);
  }
});

test('직접 이어하기도 손상 저장을 기본 파티/초기 진행으로 정규화하지 않는다', () => {
  for (const raw of malformed) {
    const h = harness({ current: raw });
    let migrations = 0;
    h.context.normalizeSaveData = () => { migrations++; throw new Error('손상 저장의 정규화에 도달함'); };
    h.fn('continueGame')();
    assert.equal(migrations, 0, raw);
    assert.deepEqual(h.writes, []);
    assert.equal(h.alerts.length, 1);
  }
});

test('가져오기는 모두 무효인 묶음을 성공으로 알리지 않고 유효한 항목만 덮어쓴다', () => {
  const original = JSON.stringify(valid());
  const h = harness({ current: original });
  h.context.saveImportText = JSON.stringify({ type: 'cheonsu-save-bundle', saves: { current: '{}', autoBackup: '[]' } });
  h.fn('importSaveBundle')();
  assert.equal(h.data.get('current'), original);
  assert.deepEqual(h.writes, []);
  assert.equal(h.confirmations.length, 0);
  assert.ok(h.alerts.every(message => !message.includes('가져왔습니다')));

  const mixed = harness({ current: original });
  const older = JSON.stringify({ version: '0.12', party: getInitialParty(), gold: 456 });
  mixed.context.saveImportText = JSON.stringify({ type: 'cheonsu-save-bundle', saves: { current: '{}', autoBackup: older } });
  mixed.fn('importSaveBundle')();
  assert.equal(mixed.data.get('current'), original);
  assert.equal(mixed.data.get('backup'), older);
  assert.equal(mixed.writes.length, 1);
});

test('구형 실제 저장 2건과 진행 필드 미기록 초기 저장을 허용하며 원문은 바꾸지 않는다', async () => {
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/monster-save-1.99.156.json', import.meta.url), 'utf8'));
  const saves = fixtures.cases.map(entry => ({ ...fixtures.shared, ...entry.save }));
  saves.push({ version: '0.12', party: getInitialParty(), gold: 456 });
  saves.push(valid());
  const h = harness();
  for (const save of saves) {
    const raw = JSON.stringify(save);
    assert.equal(h.context.getSaveSummary(raw).ok, true);
    assert.deepEqual(journey.readMenuCheckpoint({ getItem: () => raw }).data, save);
    const loader = harness({ current: JSON.stringify(valid()), manual1: raw });
    loader.fn('loadManualSlot')(1);
    assert.equal(loader.data.get('current'), raw);
    assert.equal(loader.continued.length, 1);
    assert.equal(raw, JSON.stringify(save));
  }
});
