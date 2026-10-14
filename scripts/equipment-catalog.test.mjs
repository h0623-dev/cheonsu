import test from 'node:test';
import assert from 'node:assert/strict';
import { EQUIPMENT, EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, DEFAULT_GEAR_INVENTORY, normalizeEquipmentSlots, getGearShopAvailability, getGearShopPrice, getGearPresentation } from '../src/data/equipment.js';
import { EQUIPMENT as LEGACY_EQUIPMENT_EXPORT } from '../src/data/gameData.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';
import { getInitialParty, makeAlly, applyEquipmentStats, applyEquipmentToParty, getEquipmentBonus, getGearEnhanceBonus, grantExp, mergePartyIntoStage } from '../src/engine/partyEngine.js';
import { normalizeSaveData } from '../src/engine/saveEngine.js';
import { stages } from '../src/data/stages.js';

const hero = () => ({ ...getInitialParty()[0], baseAtk: 8, baseDef: 5, atk: 8, def: 5, hp: 13, maxHp: 24 });
const oldIds = ['ironSword', 'fireStaff', 'guardShield', 'leatherArmor', 'chainArmor', 'mageRobe', 'holyStaff', 'hunterBow', 'shadowDagger', 'mareSpear', 'harinBracers', 'edanHammer', 'sylvanStaff', 'oathCommemorative'];

test('110종 장비가 세 슬롯과 한국어 설명을 가지며 모든 동료에게 역할별 신규 무기를 제공한다', () => {
  const items = Object.values(EQUIPMENT);
  assert.equal(items.length, 110);
  assert.deepEqual(EQUIPMENT_SLOTS.map(slot => items.filter(item => item.slot === slot).length), [70, 22, 18]);
  assert.deepEqual(EQUIPMENT_SLOT_LABELS, { weapon: '무기', armor: '방어구', accessory: '장신구' });
  for (const item of items) {
    assert.equal(EQUIPMENT[item.id], item);
    assert.ok(EQUIPMENT_SLOTS.includes(item.slot));
    assert.match(item.name, /[가-힣]/);
    assert.match(item.desc, /[가-힣]/);
    assert.ok(item.family && item.icon);
    assert.ok([0, 5, 10, 15, 30, 40].includes(item.unlockStage));
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

test('각 무기 계열의 추가 보급품은 단계별 가격과 다른 공격·방어 조합을 제공한다', () => {
  const families = ['vanguard', 'bastion', 'marksman', 'lancer', 'scout', 'arcane', 'sanctuary', 'resonance', 'martial', 'engineer'];
  for (const family of families) {
    const expected = [['Veteran', 5, 330, 3, 1], ['Ward', 15, 560, 2, 3], ['Ascendant', 40, 1050, 4, 3]];
    for (const [suffix, stage, price, atk, def] of expected) {
      const item = EQUIPMENT[`${family}${suffix}`];
      assert.deepEqual([item.unlockStage, item.price, item.atk, item.def], [stage, price, atk, def]);
      assert.deepEqual(item.allowed, EQUIPMENT[`${family}Assault`].allowed);
      assert.equal(DEFAULT_GEAR_INVENTORY.includes(item.id), false);
      assert.equal(getGearShopAvailability(item, [stage - 1]).ok, false);
      assert.equal(getGearShopAvailability(item, [stage]).ok, true);
    }
  }
  for (const [prefix, stage] of [['sentinelArmor', 10], ['citadelArmor', 30], ['jadeAccessory', 10], ['sunstoneAccessory', 30]]) {
    const variants = [0, 1, 2].map(index => EQUIPMENT[`${prefix}${index}`]);
    assert.equal(new Set(variants.map(item => `${item.atk}/${item.def}`)).size, 3);
    for (const item of variants) {
      assert.equal(item.unlockStage, stage);
      assert.deepEqual([...item.allowed].sort(), Object.keys(ADVANCED_CLASSES).sort());
      assert.equal(DEFAULT_GEAR_INVENTORY.includes(item.id), false);
    }
  }
});

test('추가 보급 무기도 동료의 실제 무기 이름과 기존 강화 식별자를 유지한다', () => {
  for (const suffix of ['Veteran', 'Ward', 'Ascendant']) {
    const cases = [
      [`marksman${suffix}`, 'lina', '활', 'bow'],
      [`bastion${suffix}`, 'rakan', '도끼', 'axe'],
      [`arcane${suffix}`, 'noah', '마법서', 'book'],
      [`arcane${suffix}`, 'miho', '주술 부적', 'charm'],
      [`sanctuary${suffix}`, 'harin', '치유 권갑', 'fist'],
      [`scout${suffix}`, 'sera', '쌍검', 'dagger'],
    ];
    for (const [id, unitId, family, icon] of cases) {
      const original = EQUIPMENT[id];
      const view = getGearPresentation(id, unitId);
      assert.equal(view.id, id);
      assert.equal(view.family, family);
      assert.equal(view.icon, icon);
      assert.deepEqual(view.allowed, original.allowed);
      assert.deepEqual([view.atk, view.def, view.price], [original.atk, original.def, original.price]);
      assert.deepEqual(getGearEnhanceBonus(view, 3), getGearEnhanceBonus(original, 3));
    }
    assert.doesNotMatch(getGearPresentation(`marksman${suffix}`, 'lina').name, /지팡이|마도봉|마법서/);
  }
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

test('구 저장의 공유 무기는 동료별 이름을 표시해도 같은 식별자와 강화·능력치를 유지한다', () => {
  const source = ['leon', 'luka'].map(id => ({ ...hero(), id,
    equipment: { weapon: 'hunterBow', armor: null, accessory: null }, gearEnhance: { hunterBow: 3 } }));
  const snapshot = structuredClone(source);
  const catalogSnapshot = structuredClone(EQUIPMENT);
  const stats = source.map(applyEquipmentStats);
  const views = source.map(unit => getGearPresentation(unit.equipment.weapon, unit));
  assert.deepEqual(views.map(view => view.name), ['사냥꾼의 창', '사냥꾼의 검']);
  assert.deepEqual(views.map(view => view.icon), ['spear', 'sword']);
  for (const view of views) {
    assert.equal(view.id, 'hunterBow');
    assert.deepEqual(view.allowed, ['leon', 'luka']);
    assert.deepEqual(getGearEnhanceBonus(view, 3), { atk: 3, def: 0 });
    assert.equal(view.price, 210);
    assert.deepEqual(getGearShopAvailability(view, []), getGearShopAvailability(EQUIPMENT.hunterBow, []));
  }
  assert.deepEqual(source.map(applyEquipmentStats), stats);
  assert.deepEqual(stats.map(unit => [unit.atk, unit.def]), [[13, 5], [13, 5]]);
  assert.deepEqual(source, snapshot);
  assert.deepEqual(EQUIPMENT, catalogSnapshot);
});

test('전체 품목과 잘못된 동료 문맥은 공유 무기 이름을 빠짐없이 표시하며 특정 동료로 바뀌지 않는다', () => {
  const all = getGearPresentation('holyStaff');
  assert.equal(all.name, '성목 지팡이 / 성목 마법서 / 성목 류트');
  assert.equal(all.family, '치유 지팡이 / 마법서 / 악기');
  assert.equal(all.icon, 'arsenal');
  for (const context of ['hero', 'unknown', 'constructor', {}, { id: 1 }, null]) {
    assert.deepEqual(getGearPresentation(EQUIPMENT.holyStaff, context), all);
  }
  assert.equal(getGearPresentation('holyStaff', 'aria').name, '성목 지팡이');
  assert.equal(getGearPresentation('holyStaff', 'noah').name, '성목 마법서');
  assert.equal(getGearPresentation('holyStaff', 'ella').name, '성목 류트');
  const noahView = { ...getGearPresentation('holyStaff', 'noah'), atk: 7 };
  const snapshot = structuredClone(noahView);
  const ariaView = getGearPresentation(noahView, 'aria');
  assert.equal(ariaView.name, '성목 지팡이');
  assert.equal(ariaView.family, '치유 지팡이');
  assert.equal(ariaView.icon, 'staff');
  assert.equal(ariaView.atk, 7);
  const allAgain = getGearPresentation(noahView);
  assert.equal(allAgain.name, all.name);
  assert.equal(allAgain.family, all.family);
  assert.equal(allAgain.icon, all.icon);
  assert.equal(allAgain.atk, 7);
  assert.deepEqual(noahView, snapshot);
  assert.equal(getGearPresentation('leatherArmor'), EQUIPMENT.leatherArmor);
  assert.equal(getGearPresentation('missing-gear'), null);
  assert.equal(getGearPresentation('constructor'), null);
  assert.equal(getGearPresentation(null), null);
});

test('리나의 구 무기와 전직 저장은 실제 무기 계열을 표시하고 오래된 데이터 모듈도 같은 목록을 사용한다', () => {
  assert.equal(LEGACY_EQUIPMENT_EXPORT, EQUIPMENT);
  for (const state of [{}, { promoted: true }, { promoted: true, advancedClass: 'lina__form1' }]) {
    const unit = { ...hero(), id: 'lina', ...state,
      equipment: { weapon: 'fireStaff', armor: 'mageRobe', accessory: null }, gearEnhance: { fireStaff: 4 } };
    const snapshot = structuredClone(unit);
    const display = getGearPresentation('fireStaff', unit);
    assert.equal(display.name, '화염 활');
    assert.equal(display.family, '활');
    assert.equal(display.icon, 'bow');
    assert.equal(display.id, 'fireStaff');
    assert.deepEqual(getGearEnhanceBonus(display, 4), { atk: 4, def: 0 });
    assert.deepEqual(unit, snapshot);
  }
  assert.equal(getGearPresentation('ironSword', 'teo').name, '철궁');
  assert.equal(getGearPresentation('guardShield', 'rakan').family, '도끼');
  assert.equal(getGearPresentation('guardShield', 'baekho').family, '권갑');
  assert.equal(getGearPresentation('arcaneAssault', 'noah').family, '마법서');
  assert.equal(getGearPresentation('arcaneAssault', 'miho').family, '주술 부적');
  assert.equal(getGearPresentation('sanctuaryGuard', 'harin').family, '치유 권갑');
});
