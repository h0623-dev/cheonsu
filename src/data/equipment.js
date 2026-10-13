export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory'];
export const EQUIPMENT_SLOT_LABELS = { weapon: '무기', armor: '방어구', accessory: '장신구' };

const ALL_ALLIES = ['hero', 'bram', 'lina', 'aria', 'leon', 'sera', 'noah', 'yuna', 'rakan', 'miho', 'teo', 'irene', 'kaz', 'ella', 'jin', 'luka', 'baekho', 'mare', 'harin', 'edan', 'sylvan'];

const statText = (atk, def) => [atk > 0 ? `공격 +${atk}` : '', def > 0 ? `방어 +${def}` : ''].filter(Boolean).join(' / ');
const gear = (id, name, slot, allowed, atk, def, price, unlockStage, family, icon, extra = {}) => ({
  id, name, slot, allowed: [...allowed], atk, def, price, unlockStage, family, icon,
  shop: true, desc: statText(atk, def), ...extra,
});

// Existing identifiers, character permissions and bonuses remain save-compatible.
const LEGACY_EQUIPMENT = [
  gear('ironSword', '철검', 'weapon', ['hero', 'teo', 'jin'], 1, 0, 120, 0, '검', 'sword'),
  gear('fireStaff', '화염 활', 'weapon', ['lina'], 2, 0, 220, 0, '활', 'bow'),
  gear('guardShield', '수호 방패', 'weapon', ['bram', 'rakan', 'baekho'], 0, 2, 180, 0, '방패', 'shield'),
  gear('leatherArmor', '가죽 갑옷', 'armor', ALL_ALLIES, 0, 1, 100, 0, '갑옷', 'armor'),
  gear('chainArmor', '사슬 갑옷', 'armor', ['hero', 'bram'], 0, 2, 200, 0, '갑옷', 'armor'),
  gear('mageRobe', '마법 로브', 'armor', ['lina', 'aria', 'noah', 'yuna', 'irene', 'ella', 'harin', 'sylvan'], 0, 1, 120, 0, '로브', 'robe'),
  gear('holyStaff', '성목 지팡이', 'weapon', ['aria', 'noah', 'yuna', 'ella'], 1, 1, 180, 0, '치유 지팡이', 'staff'),
  gear('hunterBow', '사냥꾼의 창', 'weapon', ['leon', 'luka'], 2, 0, 210, 0, '창', 'spear'),
  gear('shadowDagger', '그림자 단검', 'weapon', ['sera', 'miho', 'kaz'], 2, 0, 210, 0, '단검', 'dagger'),
  gear('mareSpear', '해류창', 'weapon', ['mare'], 2, 0, null, 0, '창', 'spear', { shop: false, rewardStage: 32, desc: '마레 전용 공격 +2 · 32장 첫 클리어 보상' }),
  gear('harinBracers', '청동 호완', 'weapon', ['harin'], 1, 1, null, 0, '권갑', 'fist', { shop: false, rewardStage: 37, desc: '하린 전용 공격 +1 / 방어 +1 · 37장 첫 클리어 보상' }),
  gear('edanHammer', '공방 망치', 'weapon', ['edan'], 1, 2, null, 0, '공병 망치', 'hammer', { shop: false, rewardStage: 42, desc: '에단 전용 공격 +1 / 방어 +2 · 42장 첫 클리어 보상' }),
  gear('sylvanStaff', '뿌리 지팡이', 'weapon', ['sylvan'], 2, 0, null, 0, '지팡이', 'staff', { shop: false, rewardStage: 47, desc: '실반 전용 공격 +2 · 47장 첫 클리어 보상' }),
  gear('oathCommemorative', '귀환의 맹세', 'armor', ALL_ALLIES, 1, 2, null, 0, '갑옷', 'armor', { shop: false, rewardStage: 50, desc: '공격 +1 / 방어 +2 · 50장 첫 클리어 기념 방어구' }),
];

// New families follow each ally's current combat role. Legacy equipment stays usable.
const WEAPON_FAMILIES = [
  ['vanguard', '검', 'sword', ['hero', 'sera', 'jin', 'luka'], ['돌격 장검', '수비 장검', '맹세의 룬검']],
  ['bastion', '방패', 'shield', ['bram', 'rakan'], ['돌격 방패', '강철 대방패', '천수의 성벽']],
  ['marksman', '활', 'bow', ['lina', 'teo'], ['전장의 장궁', '호위 단궁', '봉화의 룬궁']],
  ['lancer', '창', 'spear', ['leon', 'mare'], ['돌파의 장창', '방진 수호창', '만조의 기병창']],
  ['scout', '단검', 'dagger', ['sera', 'kaz'], ['매의 단검', '흘려베기 단검', '밤길의 쌍검']],
  ['arcane', '지팡이', 'staff', ['noah', 'miho', 'irene', 'sylvan'], ['흐름의 마도봉', '결계의 마도봉', '별무리 룬지팡이']],
  ['sanctuary', '치유 지팡이', 'staff', ['aria', 'yuna', 'harin'], ['여명의 성목봉', '안식의 수호봉', '귀환의 성광봉']],
  ['resonance', '악기', 'lyre', ['ella'], ['행진의 류트', '수호의 류트', '별노래 공명류트']],
  ['martial', '권갑', 'fist', ['baekho', 'harin'], ['쇄격 권갑', '호신 철완', '새벽의 용권갑']],
  ['engineer', '공병 망치', 'hammer', ['edan'], ['돌파 공병망치', '보루 수리망치', '공명의 대공방추']],
];
const NEW_WEAPONS = WEAPON_FAMILIES.flatMap(([id, family, icon, allowed, names]) => [
  gear(`${id}Assault`, names[0], 'weapon', allowed, 2, 0, 160, 0, family, icon),
  gear(`${id}Guard`, names[1], 'weapon', allowed, 0, 2, 160, 0, family, icon),
  gear(`${id}Oath`, names[2], 'weapon', allowed, 3, 2, 780, 30, family, icon),
]);

const ARMOR_SERIES = [
  ['traveler', 0, 160, [[2, 0], [0, 3], [1, 2]], ['척후 경갑', '보초 판금옷', '여행자의 전투복']],
  ['border', 5, 280, [[3, 0], [0, 4], [2, 2]], ['국경 돌격복', '국경 수호갑', '국경 룬전투복']],
  ['rune', 15, 470, [[4, 1], [1, 5], [3, 3]], ['룬돌격 경갑', '룬방벽 중갑', '공명의 전투로브']],
  ['oathbound', 40, 1050, [[5, 2], [2, 6], [4, 4]], ['맹세의 돌격갑', '맹세의 수호갑', '귀환의 룬로브']],
];
const NEW_ARMOR = ARMOR_SERIES.flatMap(([id, unlockStage, price, stats, names]) => stats.map(([atk, def], index) =>
  gear(`${id}Armor${index}`, names[index], 'armor', ALL_ALLIES, atk, def, price, unlockStage,
    index === 2 && unlockStage >= 15 ? '로브' : '갑옷', index === 2 && unlockStage >= 15 ? 'robe' : 'armor'),
));

const ACCESSORY_SERIES = [
  ['copper', 0, 100, [[2, 0], [0, 2], [1, 1]], ['매의 구리 반지', '보호의 구리 부적', '여행자의 매듭']],
  ['silver', 5, 240, [[3, 0], [0, 3], [2, 1]], ['용기의 은반지', '수호의 은부적', '은빛 우정 매듭']],
  ['starlight', 15, 420, [[4, 0], [0, 4], [2, 2]], ['별빛 결의 반지', '별빛 방벽 부적', '공명의 별목걸이']],
  ['homeward', 40, 900, [[5, 1], [1, 5], [3, 3]], ['귀환의 결의 반지', '귀환의 수호 부적', '천수의 맹세 목걸이']],
];
const NEW_ACCESSORIES = ACCESSORY_SERIES.flatMap(([id, unlockStage, price, stats, names]) => stats.map(([atk, def], index) =>
  gear(`${id}Accessory${index}`, names[index], 'accessory', ALL_ALLIES, atk, def, price, unlockStage,
    '장신구', index === 0 ? 'ring' : 'amulet'),
));

export const EQUIPMENT = Object.fromEntries([...LEGACY_EQUIPMENT, ...NEW_WEAPONS, ...NEW_ARMOR, ...NEW_ACCESSORIES].map(item => [item.id, item]));

// 공유 장비의 저장 식별자·능력치·강화는 그대로 두고 착용자에 맞는 이름만 표시한다.
// 전직 상태가 바뀌어도 동료의 고유 무기 계열은 유지한다.
const weaponPresentation = (name, family, icon) => Object.freeze({ name, family, icon });
const WEAPON_PRESENTATIONS = Object.freeze({
  ironSword: { teo: weaponPresentation('철궁', '활', 'bow') },
  guardShield: {
    rakan: weaponPresentation('수호 도끼', '도끼', 'axe'),
    baekho: weaponPresentation('수호 권갑', '권갑', 'fist'),
  },
  holyStaff: {
    noah: weaponPresentation('성목 마법서', '마법서', 'book'),
    ella: weaponPresentation('성목 류트', '악기', 'lyre'),
  },
  hunterBow: { luka: weaponPresentation('사냥꾼의 검', '검', 'sword') },
  shadowDagger: { miho: weaponPresentation('그림자 부적', '주술 부적', 'charm') },
  vanguardAssault: { sera: weaponPresentation('돌격 쌍검', '쌍검', 'dagger') },
  vanguardGuard: { sera: weaponPresentation('수비 쌍검', '쌍검', 'dagger') },
  vanguardOath: { sera: weaponPresentation('맹세의 룬쌍검', '쌍검', 'dagger') },
  bastionAssault: { rakan: weaponPresentation('돌격 도끼', '도끼', 'axe') },
  bastionGuard: { rakan: weaponPresentation('강철 수호도끼', '도끼', 'axe') },
  bastionOath: { rakan: weaponPresentation('천수의 수호도끼', '도끼', 'axe') },
  arcaneAssault: {
    noah: weaponPresentation('흐름의 마법서', '마법서', 'book'),
    miho: weaponPresentation('흐름의 주술부', '주술 부적', 'charm'),
  },
  arcaneGuard: {
    noah: weaponPresentation('결계의 마법서', '마법서', 'book'),
    miho: weaponPresentation('결계의 주술부', '주술 부적', 'charm'),
  },
  arcaneOath: {
    noah: weaponPresentation('별무리 룬마법서', '마법서', 'book'),
    miho: weaponPresentation('별무리 룬부적', '주술 부적', 'charm'),
  },
  sanctuaryAssault: { harin: weaponPresentation('여명의 치유권갑', '치유 권갑', 'fist') },
  sanctuaryGuard: { harin: weaponPresentation('안식의 수호권갑', '치유 권갑', 'fist') },
  sanctuaryOath: { harin: weaponPresentation('귀환의 성광권갑', '치유 권갑', 'fist') },
});

export function getGearPresentation(gearOrId, unitOrId) {
  const item = typeof gearOrId === 'string'
    ? Object.hasOwn(EQUIPMENT, gearOrId) ? EQUIPMENT[gearOrId] : null
    : gearOrId && typeof gearOrId === 'object' && !Array.isArray(gearOrId) ? gearOrId : null;
  if (!item) return null;
  const variants = Object.hasOwn(WEAPON_PRESENTATIONS, item.id) ? WEAPON_PRESENTATIONS[item.id] : null;
  if (!variants || !Array.isArray(item.allowed)) return item;
  const unitId = typeof unitOrId === 'string' ? unitOrId : unitOrId?.id;
  const canonical = Object.hasOwn(EQUIPMENT, item.id) ? EQUIPMENT[item.id] : item;
  const viewFor = id => Object.hasOwn(variants, id) ? variants[id] : canonical;
  if (typeof unitId === 'string' && item.allowed.includes(unitId)) {
    const view = viewFor(unitId);
    return view === item ? item : { ...item, name: view.name, family: view.family, icon: view.icon };
  }
  const views = item.allowed.map(viewFor);
  if (!views.length) return item;
  const unique = field => [...new Set(views.map(view => view[field]))];
  const icons = unique('icon');
  return {
    ...item,
    name: unique('name').join(' / '),
    family: unique('family').join(' / '),
    icon: icons.length === 1 ? icons[0] : 'arsenal',
  };
}

// Keep the legacy starting collection; new purchases never overwrite old owned IDs.
export const DEFAULT_GEAR_INVENTORY = ['ironSword', 'leatherArmor', 'mageRobe', 'holyStaff', 'hunterBow', 'shadowDagger'];

export function normalizeEquipmentSlots(equipment) {
  const raw = equipment && typeof equipment === 'object' && !Array.isArray(equipment) ? equipment : {};
  return Object.fromEntries(EQUIPMENT_SLOTS.map(slot => [slot, typeof raw[slot] === 'string' && raw[slot] ? raw[slot] : null]));
}

export function getGearShopPrice(item) {
  return item?.shop !== false && Number.isFinite(item?.price) && item.price >= 0 ? item.price : null;
}

export function getGearShopAvailability(item, clearedStages = []) {
  if (!item || !Object.hasOwn(EQUIPMENT, item.id)) return { ok: false, reason: '존재하지 않는 장비입니다.' };
  if (getGearShopPrice(item) === null) return { ok: false, reason: `${item.rewardStage}장 첫 클리어 보상 장비입니다.` };
  const required = item.unlockStage || 0;
  if (required && !(Array.isArray(clearedStages) && clearedStages.includes(required))) {
    return { ok: false, reason: `${required}장 클리어 후 구매할 수 있습니다.` };
  }
  return { ok: true, reason: required ? `${required}장 보급품` : '기본 보급품' };
}
