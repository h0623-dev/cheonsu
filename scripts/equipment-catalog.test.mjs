import test from 'node:test';
import assert from 'node:assert/strict';
import { EQUIPMENT, EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, DEFAULT_GEAR_INVENTORY, normalizeEquipmentSlots, getGearShopAvailability, getGearShopPrice } from '../src/data/equipment.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { getInitialParty, makeAlly, applyEquipmentStats, applyEquipmentToParty, getEquipmentBonus, getGearEnhanceBonus, grantExp, mergePartyIntoStage } from '../src/engine/partyEngine.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { stages } from '../src/data/stages.js';

const hero = () => ({ ...getInitialParty()[0], baseAtk: 8, baseDef: 5, atk: 8, def: 5, hp: 13, maxHp: 24 });
const oldIds = ['ironSword', 'fireStaff', 'guardShield', 'leatherArmor', 'chainArmor', 'mageRobe', 'holyStaff', 'hunterBow', 'shadowDagger', 'mareSpear', 'harinBracers', 'edanHammer', 'sylvanStaff', 'oathCommemorative'];

test('68종 장비가 세 슬롯과 한국어 설명을 가지며 모든 동료에게 역할별 신규 무기를 제공한다', () => {
  const items = Object.values(EQUIPMENT);
  assert.equal(items.length, 68);
  assert.deepEqual(EQUIPMENT_SLOTS.map(slot => items.filter(item => item.slot === slot).length), [40, 16, 12]);
  assert.deepEqual(EQUIPMENT_SLOT_LABELS, { weapon: '무기', armor: '방어구', accessory: '장신구' });
  for (const item of items) {
    assert.equal(EQUIPMENT[item.id], item);
    assert.ok(EQUIPMENT_SLOTS.includes(item.slot));
    assert.match(item.name, /[가-힣]/);
    assert.match(item.desc, /[가-힣]/);
    assert.ok(item.family && item.icon);
    assert.ok([0, 5, 15, 30, 40].includes(item.unlockStage));
    assert.ok(Number.isInteger(item.atk) && Number.isInteger(item.def));
    assert.equal(item.hp, undefined);
    assert.equal(item.move, undefined);
  }
  for (const id of Object.keys(ADVANCED_CLASSES)) {
    const weapons = items.filter(item => item.slot === 'weapon' && item.allowed.includes(id) && !oldIds.includes(item.id));
    assert.ok(weapons.length >= 3, id);
    assert.ok(weapons.some(item => getGearShopAvailability(item, []).ok), `${id} 기본 보급 무기`);
    for (const slot of ['armor', 'accessory']) {
      assert.ok(items.filter(item => item.slot === slot && item.allowed.includes(id) && !item.unlockStage).length >= 3, `${id} ${slot}`);
    }
  }
  assert.ok(EQUIPMENT.marksmanAssault.allowed.includes('lina'));
  assert.ok(EQUIPMENT.marksmanAssault.allowed.includes('teo'));
  assert.ok(EQUIPMENT.lancerAssault.allowed.includes('leon'));
  assert.ok(EQUIPMENT.arcaneAssault.allowed.includes('irene'));
  assert.ok(EQUIPMENT.resonanceAssault.allowed.includes('ella'));
});

test('기존 14종의 식별자와 효과·착용 동료 및 시작 수집품을 보존한다', () => {
  const values = [
    [1, 0, ['hero', 'teo', 'jin']], [2, 0, ['lina']], [0, 2, ['bram', 'rakan', 'baekho']],
    [0, 1, Object.keys(ADVANCED_CLASSES)], [0, 2, ['hero', 'bram']], [0, 1, ['lina', 'aria', 'noah', 'yuna', 'irene', 'ella', 'harin', 'sylvan']],
    [1, 1, ['aria', 'noah', 'yuna', 'ella']], [2, 0, ['leon', 'luka']], [2, 0, ['sera', 'miho', 'kaz']],
    [2, 0, ['mare']], [1, 1, ['harin']], [1, 2, ['edan']], [2, 0, ['sylvan']], [1, 2, Object.keys(ADVANCED_CLASSES)],
  ];
  oldIds.forEach((id, index) => {
    const [atk, def, allowed] = values[index];
    assert.equal(EQUIPMENT[id].atk, atk);
    assert.equal(EQUIPMENT[id].def, def);
    assert.deepEqual([...EQUIPMENT[id].allowed].sort(), [...allowed].sort());
  });
  assert.deepEqual(DEFAULT_GEAR_INVENTORY, ['ironSword', 'leatherArmor', 'mageRobe', 'holyStaff', 'hunterBow', 'shadowDagger']);
});

test('보급 단계는 해당 장 클리어로 해금하며 첫 클리어 전용 보상은 구매할 수 없다', () => {
  for (const item of Object.values(EQUIPMENT)) {
    const availability = getGearShopAvailability(item, []);
    if (!item.shop) {
      assert.equal(availability.ok, false);
      assert.equal(getGearShopAvailability(item, [item.rewardStage]).ok, false);
      assert.equal(getGearShopPrice(item), null);
      assert.match(availability.reason, /첫 클리어 보상/);
    } else {
      assert.ok(Number.isInteger(getGearShopPrice(item)) && getGearShopPrice(item) > 0);
      assert.equal(availability.ok, !item.unlockStage);
      assert.equal(getGearShopAvailability(item, [item.unlockStage]).ok, true);
      if (item.unlockStage) assert.equal(getGearShopAvailability(item, [item.unlockStage - 1]).ok, false);
    }
  }
  assert.equal(getGearShopAvailability(null, [50]).ok, false);
  assert.equal(getGearShopAvailability({ id: 'unknown' }, []).ok, false);
});

test('장신구 포함 세 슬롯의 강화 효과는 한 번만 적용하고 미리보기와 해제에도 HP·이동을 보존한다', () => {
  const source = { ...hero(), skillGuardBoost: 3, gearEnhance: { vanguardAssault: 2, leatherArmor: 1, copperAccessory2: 3 },
    equipment: { weapon: 'vanguardAssault', armor: 'leatherArmor', accessory: 'copperAccessory2' } };
  const before = structuredClone(source);
  const equipped = applyEquipmentStats(source);
  assert.deepEqual(getEquipmentBonus(equipped), { atk: 8, def: 6 });
  assert.equal(equipped.atk, 16);
  assert.equal(equipped.def, 14);
  assert.equal(equipped.hp, source.hp);
  assert.equal(equipped.move, source.move);
  assert.deepEqual(applyEquipmentStats(equipped), equipped);
  const changed = applyEquipmentStats({ ...equipped, equipment: { ...equipped.equipment, accessory: 'copperAccessory0' } });
  assert.equal(changed.atk, 14);
  assert.equal(changed.def, 10);
  const removed = applyEquipmentStats({ ...changed, equipment: { ...changed.equipment, accessory: null } });
  assert.equal(removed.atk, 12);
  assert.equal(removed.def, 10);
  assert.deepEqual(source, before);
});

test('기본치가 없는 새 유닛의 첫 장비 착용은 세 슬롯 효과를 더하고 임시 방어를 기본치와 분리한다', () => {
  const fresh = { ...hero(), def: 8, skillGuardBoost: 3,
    equipment: { weapon: 'ironSword', armor: 'leatherArmor', accessory: 'copperAccessory2' },
    gearEnhance: { ironSword: 2, leatherArmor: 1, copperAccessory2: 1 } };
  delete fresh.baseAtk;
  delete fresh.baseDef;
  const equipped = applyEquipmentStats(fresh);
  assert.equal(equipped.baseAtk, 8);
  assert.equal(equipped.baseDef, 5);
  assert.equal(equipped.atk, 13);
  assert.equal(equipped.def, 12);
  assert.equal(equipped.skillGuardBoost, 3);
  assert.deepEqual(applyEquipmentStats(equipped), equipped);
  const removed = applyEquipmentStats({ ...equipped, equipment: { weapon: null, armor: null, accessory: null } });
  assert.equal(removed.atk, 8);
  assert.equal(removed.def, 8);
  assert.equal(removed.baseDef, 5);
});

test('0 기본 능력치를 보존하고 잘못된 슬롯이나 옛 미등록 장비는 추가 효과를 만들지 않는다', () => {
  const raw = { ...hero(), baseAtk: 0, baseDef: 0, equipment: { weapon: 'ironSword', armor: 'leatherArmor', accessory: 'copperAccessory2' } };
  const unit = applyEquipmentStats(makeAlly(raw));
  assert.equal(unit.atk, 2);
  assert.equal(unit.def, 2);
  assert.equal(unit.baseAtk, 0);
  assert.equal(unit.baseDef, 0);
  const old = applyEquipmentStats({ ...hero(), equipment: { weapon: 'old-unlisted-weapon', armor: 'ironSword', accessory: 'ironSword' } });
  assert.equal(old.atk, 8);
  assert.equal(old.def, 5);
  assert.equal(old.equipment.weapon, 'old-unlisted-weapon');
  assert.deepEqual(normalizeEquipmentSlots({ weapon: 'ironSword', armor: null }), { weapon: 'ironSword', armor: null, accessory: null });
  assert.deepEqual(getGearEnhanceBonus(EQUIPMENT.copperAccessory2, 9.9), { atk: 5, def: 5 });
  assert.deepEqual(getGearEnhanceBonus(EQUIPMENT.copperAccessory2, 2.9), { atk: 2, def: 2 });
  assert.deepEqual(getGearEnhanceBonus(EQUIPMENT.copperAccessory2, Infinity), { atk: 0, def: 0 });
});

test('기본 능력치가 없던 구 저장은 장비·강화·임시 방어를 중복 가산하지 않는다', () => {
  const equipped = applyEquipmentStats({ ...hero(), skillGuardBoost: 3,
    equipment: { weapon: 'ironSword', armor: 'leatherArmor' }, gearEnhance: { ironSword: 2, leatherArmor: 1 } });
  const legacy = { ...equipped };
  delete legacy.baseAtk;
  delete legacy.baseDef;
  const normalized = makeAlly(legacy);
  assert.equal(normalized.baseAtk, 8);
  assert.equal(normalized.baseDef, 5);
  assert.equal(applyEquipmentStats(normalized).atk, equipped.atk);
  assert.equal(applyEquipmentStats(normalized).def, equipped.def);
  const camp = applyEquipmentToParty([legacy])[0];
  assert.equal(camp.atk, equipped.atk);
  assert.equal(camp.def, equipped.def - 3);
  const leveled = grantExp([legacy], legacy.id, 100).units[0];
  assert.equal(leveled.baseAtk, 9);
  assert.equal(leveled.baseDef, 6);
  assert.equal(leveled.atk, equipped.atk + 1);
  assert.equal(leveled.def, equipped.def + 1);
});

test('동료와 전투 저장의 누락 장비·강화를 공유 장비함으로 복원하고 반복 저장에 누적하지 않는다', () => {
  const equipped = applyEquipmentStats({ ...hero(), equipment: { weapon: 'ironSword', armor: 'leatherArmor', accessory: 'copperAccessory2' },
    gearEnhance: { ironSword: 2, leatherArmor: 1, copperAccessory2: 1 } });
  const legacy = { ...equipped };
  delete legacy.baseAtk;
  delete legacy.baseDef;
  const live = { ...legacy, hp: 7, skillGuardBoost: 3, def: legacy.def + 3 };
  const raw = { screen: 'battle', selectedStage: stages[0], party: [legacy], units: [live],
    gearInventory: ['ironSword', 'unknown-keepsake'], gearEnhance: { ironSword: 4 },
    gold: 1234, clearedStages: [1, 2], savedAt: '2026-10-12T00:00:00.000Z' };
  const snapshot = structuredClone(raw);
  const saved = normalizeSaveData(raw, '1.99.170');
  assert.deepEqual(saved.gearEnhance, { ironSword: 4, leatherArmor: 1, copperAccessory2: 1 });
  assert.deepEqual(saved.gearInventory, ['ironSword', 'unknown-keepsake', 'leatherArmor', 'copperAccessory2']);
  assert.equal(saved.party[0].baseAtk, 8);
  assert.equal(saved.party[0].baseDef, 5);
  assert.equal(saved.party[0].atk, equipped.atk + 2);
  assert.equal(saved.units[0].atk, equipped.atk + 2);
  assert.equal(saved.units[0].def, equipped.def + 3);
  assert.equal(saved.units[0].hp, 7);
  assert.deepEqual(saved.party[0].equipment, equipped.equipment);
  assert.equal(saved.gold, raw.gold);
  assert.deepEqual(saved.clearedStages, raw.clearedStages);
  const again = normalizeSaveData(saved, '1.99.170');
  assert.deepEqual(again.party, saved.party);
  assert.deepEqual(again.units, saved.units);
  assert.deepEqual(raw, snapshot);
});

test('개별 강화 맵이 없는 구 저장도 전역 강화를 이용해 성장 기본치를 복구한다', () => {
  const unit = { ...hero(), atk: 13, def: 8, equipment: { weapon: 'ironSword', armor: 'leatherArmor' } };
  delete unit.baseAtk;
  delete unit.baseDef;
  delete unit.gearEnhance;
  const restored = normalizeSaveData({ party: [unit], units: [unit], gearEnhance: { ironSword: 2, leatherArmor: 1 } });
  assert.equal(restored.party[0].baseAtk, 10);
  assert.equal(restored.party[0].baseDef, 6);
  assert.equal(restored.party[0].atk, 13);
  assert.equal(restored.party[0].def, 8);
  assert.equal(restored.units[0].atk, 13);
});

test('공유 장비 종류는 여러 동료가 동시에 착용하며 출전에도 장신구와 강화를 유지한다', () => {
  const party = getInitialParty().map(unit => applyEquipmentStats({ ...unit,
    equipment: { weapon: null, armor: 'travelerArmor2', accessory: 'copperAccessory2' },
    gearEnhance: { copperAccessory2: 2 } }));
  const result = mergePartyIntoStage(stages[0], party);
  for (const ally of party) {
    const deployed = result.find(unit => unit.id === ally.id);
    assert.equal(deployed.equipment.accessory, 'copperAccessory2');
    assert.equal(deployed.atk, ally.atk);
    assert.equal(deployed.def, ally.def);
    assert.equal(deployed.gearEnhance.copperAccessory2, 2);
  }
});
