import { CHARACTER_SKILLS, getUnitSkills } from './skills.js';
import { getCharacterProfile } from './characterProfiles.js';
import { combatUnitIds, getCombatSprite } from './combatArt.js';
import { getPaintedVisualProfile } from './unitVisuals.js';
import { MONSTER_ENEMIES } from './monsterEnemies.js';
import { EXPANSION_BOSS_KEYS, EXPANSION_ENEMY_TEMPLATES, EXPANSION_MONSTER_KEYS } from './expansionEnemies.js';

export const RECRUIT_BY_STAGE = { 2: 'leon', 4: 'sera', 6: 'noah', 8: 'yuna', 10: 'rakan', 12: 'miho', 14: 'teo', 16: 'irene', 18: 'kaz', 20: 'ella', 22: 'jin', 24: 'luka', 26: 'baekho', 32: 'mare', 37: 'harin', 42: 'edan', 47: 'sylvan' };
const names = { hero: '카일', bram: '브람', lina: '리나', aria: '아리아', leon: '레온', sera: '세라', noah: '노아', yuna: '유나', rakan: '라칸', miho: '미호', teo: '테오', irene: '아이린', kaz: '카즈', ella: '엘라', jin: '진', luka: '루카', baekho: '백호', mare: '마레', harin: '하린', edan: '에단', sylvan: '실반' };
const enemies = {
  raider: ['약탈병', '돌격 전사'], ranger: ['궁병', '원거리 사수'], sniper: ['저격수', '정밀 사수'],
  marauder: ['투창병', '중장 전사'], assassin_elite: ['암살자', '기습 자객'], iron_lancer: ['철창병', '장창 전사'],
  plague_doctor: ['역병 의술사', '독술사'], beast_tamer: ['조련병', '채찍 전사'], storm_mage: ['폭풍 마도병', '뇌전 술사'],
  blade_dancer: ['쌍검 무희', '쌍검 전사'], siege_gunner: ['공성 포병', '포격수'], sentinel: ['방패병', '중장 수비병'],
  blackguard: ['흑기사', '전위 기사'], warlord: ['집행관', '정예 지휘관'], pyromancer: ['화염 술사', '화염 마도사'],
  frost_mage: ['빙결 술사', '빙결 마도사'], cultist: ['의식 사제', '암흑 술사'], void_knight: ['공허 기사', '심연의 검'], wolf: ['전투 늑대', '야수'],
  boss_commander: ['황금의 지휘관', '적 지휘관'], boss_frost: ['서리의 군주', '빙결 지휘관'], boss_ember: ['잿불의 군주', '화염 지휘관'],
  boss_oracle: ['검은 예언자', '의식 지휘관'], boss_abyss: ['흑천 가론', '옛 천수 기사단장'],
  ...Object.fromEntries(Object.entries(MONSTER_ENEMIES).map(([id, identity]) => [id, [identity.name, identity.role]])),
  ...Object.fromEntries(EXPANSION_BOSS_KEYS.map(id => [id, [EXPANSION_ENEMY_TEMPLATES[id].name, EXPANSION_ENEMY_TEMPLATES[id].role]])),
};

// Collection is derived from the existing roster and clear records; opening it never writes a save.
export function getCharacterCollection({ party = [], clearedStages = [], encounters = [] } = {}) {
  const owned = new Map(party.filter(unit => unit?.id).map(unit => [unit.id, unit]));
  const cleared = new Set(clearedStages.filter(id => Number.isInteger(id) && id >= 1 && id <= 50));
  const allies = Object.keys(CHARACTER_SKILLS);
  const enemyIds = [...new Set([...combatUnitIds, ...EXPANSION_MONSTER_KEYS, ...EXPANSION_BOSS_KEYS])].filter(id => !allies.includes(id));
  return [...allies, ...enemyIds].map((id, index) => {
    const ally = allies.includes(id), unit = owned.get(id), profile = getCharacterProfile(id);
    const joinStage = Number(Object.entries(RECRUIT_BY_STAGE).find(([, key]) => key === id)?.[0] || 0);
    const sightings = encounters.filter(entry => entry.key === id);
    const recorded = sightings.filter(entry => cleared.has(entry.stageId));
    const unlocked = ally ? Boolean(unit || (joinStage ? cleared.has(joinStage) : true)) : recorded.length > 0;
    const kind = ally ? 'ally' : id.startsWith('boss_') || EXPANSION_BOSS_KEYS.includes(id) ? 'boss' : 'enemy';
    const firstStage = sightings.length ? Math.min(...sightings.map(entry => entry.stageId)) : null;
    return { id, number: index + 1, kind, name: ally ? names[id] : enemies[id][0],
      role: ally ? profile.role : enemies[id][1], title: ally ? profile.title : '',
      unlocked, art: getCombatSprite(id), portrait: getPaintedVisualProfile(id)?.portrait,
      condition: ally ? joinStage ? `${joinStage}장 클리어 후 합류` : '처음부터 함께하는 동료' : firstStage ? sightings.every(entry => entry.archived) ? `${firstStage}장 클리어 시 옛 전장 기록 복원` : `${firstStage}장부터 등장 · 등장 전장 클리어 시 기록` : '전장 조사 기록',
      bio: unlocked ? ally ? profile.bio : recorded.map(entry => `${entry.archived ? '옛 전장 · ' : ''}${entry.stageId}장 · ${entry.name}`).filter((line, i, all) => all.indexOf(line) === i).slice(0, 5).join('\n') : '',
      bond: unlocked && ally ? profile.bond : '',
      skills: unlocked && ally ? getUnitSkills(unit || { id, type: 'ally' }) : [],
      level: unit?.level || 1, skillLevel: unit?.skillLevel || 0,
      status: unlocked ? ally ? '영입 완료' : '조사 완료' : ally ? '미영입' : '미발견' };
  });
}

export function filterCharacterCollection(entries, { kind = 'ally', state = 'all', query = '' } = {}) {
  const text = query.trim().toLocaleLowerCase();
  return entries.filter(entry => (kind === 'all' || entry.kind === kind) &&
    (state === 'all' || entry.unlocked === (state === 'owned')) &&
    (!text || `${entry.name} ${entry.role}`.toLocaleLowerCase().includes(text)));
}
