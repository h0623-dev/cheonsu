import { getExpansionEnemyStats, withStageEnemyLevel } from '../engine/enemyProgression.js';
import { addOrRefreshStatus } from '../engine/statusEngine.js';
import { distance } from '../engine/movement.js';

const attack = (name, bonus, range, effect, status = null, minRange = 1) => ({
  name, type: 'attack', bonus, minRange, range, effect, ...(status ? { status } : {}),
});
const template = (name, firstStage, icon, role, rank, aiType, move, range, skillSpec, stats, extra = {}) => ({
  name, firstStage, icon, role, rank, aiType, move, range, minRange: 1,
  skill: skillSpec.name, skillType: 'attack', skillBonus: skillSpec.bonus,
  skillRange: skillSpec.range, skillMinRange: skillSpec.minRange, skillSpec, ...stats, ...extra,
});

export const EXPANSION_ENEMY_TEMPLATES = {
  crab_guard: template('갈대등 갑각병', 31, '🦀', '수문 방패 수호자', 'elite', 'aggressive', 2, 1,
    attack('집게 강타', 4, 1, 'heavy'), { hpOffset: 12, atkOffset: -2, defOffset: 5 },
    { combatIdentityName: '방패 수비병', expansionSupport: 'shell', supportSkillName: '수문 껍질',
      supportSkillDescription: '인접 적이 없으면 자신 방어 +3 · 2턴 · 재사용 2라운드' }),
  eel_archer: template('비늘가시 사수', 32, '🏹', '수로 활 사수', 'normal', 'archer', 3, 2,
    attack('비늘가시 화살', 4, 2, 'arrow', 'slow', 2), { hpOffset: -12, atkOffset: 1, defOffset: -3 },
    { combatIdentityName: '궁병 활 사수', minRange: 2 }),
  spore_colony: template('포자등 균사체', 33, '🍄', '단일 치유 지원', 'normal', 'archer', 2, 1,
    attack('뿌리 밀치기', 2, 1, 'poison'), { hpOffset: -18, atkOffset: -3, defOffset: -2 },
    { combatIdentityName: '회복 주술사', expansionSupport: 'heal', supportSkillName: '공생 포자',
      supportSkillDescription: '2칸 이내 다친 적 1명 HP 회복 · 재사용 2라운드' }),
  mist_ram: template('눈안개 뿔양', 36, '🐏', '설원 돌진 야수', 'normal', 'aggressive', 4, 1,
    attack('설원 들이받기', 6, 1, 'impact', 'armorBreak'), { hpOffset: -4, atkOffset: 2, defOffset: -1 },
    { combatIdentityName: '뿔양 야수' }),
  crystal_insect: template('빙정날개 벌레', 37, '🪽', '후열 기습 곤충', 'normal', 'assassin', 4, 1,
    attack('수정 날개 베기', 5, 1, 'claw', 'bleed'), { hpOffset: -18, atkOffset: 3, defOffset: -3 },
    { combatIdentityName: '기습 단검 곤충' }),
  spring_salamander: template('온천 도롱뇽', 38, '🔥', '단거리 화염 정예', 'elite', 'archer', 2, 1,
    attack('온천 분사', 5, 2, 'fire', 'burn'), { hpOffset: 8, atkOffset: 1, defOffset: 2 },
    { combatIdentityName: '화염 주술 야수' }),
  gold_puppet: template('금실 인형병', 41, '🧵', '태엽 검 전열', 'normal', 'aggressive', 3, 1,
    attack('태엽 연격', 5, 1, 'slash'), { hpOffset: -6, atkOffset: 1, defOffset: 0 },
    { combatIdentityName: '태엽 검병' }),
  bell_keeper: template('가면 종지기', 42, '🔔', '단일 공격 강화 지원', 'normal', 'archer', 2, 1,
    attack('종 밀치기', 2, 1, 'music'), { hpOffset: -14, atkOffset: -4, defOffset: -2 },
    { combatIdentityName: '지원 주술사', expansionSupport: 'inspire', supportSkillName: '정렬의 종',
      supportSkillDescription: '2칸 이내 적 1명 다음 공격 +3 · 최대 2턴 · 재사용 2라운드' }),
  scroll_spirit: template('접힌서고 정령', 43, '📜', '원거리 공격 약화', 'normal', 'archer', 3, 2,
    attack('덮어쓴 문장', 4, 2, 'holy', 'attackDown'), { hpOffset: -16, atkOffset: 2, defOffset: -4 },
    { combatIdentityName: '기록 주술사' }),
  eclipse_cat: template('월식 사냥고양이', 46, '🐈', '후열 침투 야수', 'normal', 'assassin', 4, 1,
    attack('달그늘 도약', 6, 1, 'shadow', 'bleed'), { hpOffset: -8, atkOffset: 4, defOffset: -3 },
    { combatIdentityName: '사냥 고양이 야수' }),
  ink_vine: template('잉크덩굴 포식자', 47, '🌿', '느린 거리 제어', 'normal', 'archer', 1, 2,
    attack('잉크 덩굴', 4, 2, 'poison', 'slow'), { hpOffset: 4, atkOffset: -1, defOffset: 1 },
    { combatIdentityName: '긴 창 촉수 식물' }),
  hollow_armor: template('빈갑옷 운반자', 48, '🛡️', '인접 방어 지원 정예', 'elite', 'aggressive', 2, 1,
    attack('의장봉 강타', 4, 1, 'guard'), { hpOffset: 14, atkOffset: -1, defOffset: 6 },
    { combatIdentityName: '방패 수비병', expansionSupport: 'fortify', supportSkillName: '빈자리의 방패',
      supportSkillDescription: '인접 적 1명 방어 +3 · 2턴 · 재사용 2라운드' }),
  tide_keeper: template('심해수문장 모르칸', 35, '🔱', '해안 지역 보스', 'boss', 'boss', 2, 2,
    attack('수문 개방', 6, 2, 'thrust', 'armorBreak'), { hpOffset: 10, atkOffset: 0, defOffset: 2 },
    { combatIdentityName: '긴 창 수문장', phaseSkill: attack('해류의 열쇠', 8, 2, 'thrust', 'slow'), hazardLabel: '수문 물결' }),
  frost_queen: template('빙정여왕 세르카', 40, '❄️', '고원 지역 보스', 'boss', 'boss', 2, 2,
    attack('빙정 예고', 6, 2, 'ice', 'slow'), { hpOffset: 0, atkOffset: 1, defOffset: 0 },
    { combatIdentityName: '빙결 주술사', phaseSkill: attack('고원의 결빙', 7, 2, 'ice', 'freeze'), hazardLabel: '빙정 낙하' }),
  resonance_judge: template('공명집행관 아르켄', 45, '🔔', '공방 지역 보스', 'boss', 'boss', 2, 2,
    attack('공명 판결', 7, 2, 'music', 'attackDown'), { hpOffset: 6, atkOffset: 0, defOffset: 2 },
    { combatIdentityName: '긴 창 공명집행관', expansionSupport: 'alternatingGuard', supportSkillName: '공명 방어',
      supportSkillDescription: '짝수 라운드에 공격할 대상이 없으면 자신 방어 +3(2페이즈 +5)',
      phaseSkill: attack('공명 재집행', 9, 2, 'music', 'armorBreak'), hazardLabel: '공명 진동' }),
  oath_guardian: template('첫맹세수호체 아스테르', 50, '✦', '확장 캠페인 최종 보스', 'boss', 'boss', 3, 1,
    attack('맹세의 원', 8, 2, 'holy', 'armorBreak'), { hpOffset: 10, atkOffset: 1, defOffset: 1 },
    { combatIdentityName: '의식 검 수호자', phaseSkill: attack('돌아갈 길', 10, 2, 'holy', 'attackDown'), hazardLabel: '맹세의 별빛' }),
};

export const EXPANSION_MONSTER_KEYS = Object.keys(EXPANSION_ENEMY_TEMPLATES).filter(key => EXPANSION_ENEMY_TEMPLATES[key].rank !== 'boss');
export const EXPANSION_BOSS_KEYS = Object.keys(EXPANSION_ENEMY_TEMPLATES).filter(key => EXPANSION_ENEMY_TEMPLATES[key].rank === 'boss');
export const EXPANSION_MONSTER_IDENTITIES = Object.fromEntries(EXPANSION_MONSTER_KEYS.map(key => {
  const entry = EXPANSION_ENEMY_TEMPLATES[key];
  return [key, { name: entry.name, role: entry.role, rank: entry.rank, firstStage: entry.firstStage, icon: entry.icon }];
}));

function stageIdOf(stage) { return typeof stage === 'number' ? stage : stage?.id; }
export function isExpansionEnemyKey(key) { return Object.hasOwn(EXPANSION_ENEMY_TEMPLATES, key); }
export function getExpansionEnemyKeys(stage) {
  const stageId = stageIdOf(stage);
  if (!Number.isInteger(stageId) || stageId < 31 || stageId > 50) return [];
  const first = 31 + Math.floor((stageId - 31) / 5) * 5;
  return EXPANSION_MONSTER_KEYS.filter(key => {
    const entry = EXPANSION_ENEMY_TEMPLATES[key];
    return entry.firstStage >= first && entry.firstStage <= stageId;
  });
}

/** Factory is only for new battles/spawns; loading saved units never calls it. */
export function createExpansionEnemy(stage, key, options = {}) {
  const stageId = stageIdOf(stage);
  const profile = EXPANSION_ENEMY_TEMPLATES[key];
  if (!Number.isInteger(stageId) || stageId < 31 || stageId > 50 || !profile || profile.firstStage > stageId) {
    throw new RangeError(`신규 적 생성 범위 오류: ${stageId}/${key}`);
  }
  const type = options.type || (profile.rank === 'boss' ? 'boss' : 'enemy');
  const stats = getExpansionEnemyStats(stageId, { ...profile, type });
  const identity = { ...profile };
  delete identity.hpOffset;
  delete identity.atkOffset;
  delete identity.defOffset;
  return withStageEnemyLevel({
    ...options, ...identity, ...stats,
    id: options.id || `${key}-${stageId}`, type,
    name: options.name || profile.name,
    spriteKey: key, artId: key, stageEnemyRole: type === 'boss' ? 'boss' : key,
    monsterRank: type === 'boss' ? 'boss' : profile.rank,
    expansionEnemy: true, expansionStatsStage: stageId,
    moved: Boolean(options.moved), acted: Boolean(options.acted), guard: Boolean(options.guard),
  }, stageId);
}

/** Preserve authored species on 31–50; never touch old chapters or already-scaled live units. */
export function applyExpansionEnemyIdentity(unit, stage, index = 0) {
  const stageId = stageIdOf(stage);
  if (!unit || unit.type === 'ally' || !Number.isInteger(stageId) || stageId <= 30 || stageId > 50) return unit;
  if (unit.difficultyApplied || unit.expansionStatsStage === stageId) return unit;
  const explicit = unit.artId || unit.spriteKey;
  const available = getExpansionEnemyKeys(stageId);
  const key = isExpansionEnemyKey(explicit) ? explicit : available[Math.abs(Math.floor(index)) % available.length];
  return createExpansionEnemy(stageId, key, { ...unit, id: unit.id, x: unit.x, y: unit.y, type: unit.type });
}

export function createExpansionExtraEnemy(stage, index, x, y) {
  const stageId = stageIdOf(stage), keys = getExpansionEnemyKeys(stageId);
  if (!keys.length) return null;
  return createExpansionEnemy(stageId, keys[Math.abs(stageId + index) % keys.length], {
    id: `large-extra-${stageId}-${index}`, x, y, largeBattleExtra: true,
  });
}

/** One support action consumes the enemy's turn; powers are statuses, never permanent stat writes. */
export function resolveExpansionEnemySupport(enemy, units, round = 1) {
  if (!enemy?.expansionEnemy || enemy.hp <= 0 || !enemy.expansionSupport || enemy.expansionSupportNextRound > round) return null;
  const allies = units.filter(unit => unit.type !== 'ally' && unit.hp > 0 && unit.id !== enemy.id);
  const adjacentTarget = units.some(unit => unit.type === 'ally' && unit.hp > 0 && distance(enemy, unit) <= enemy.range);
  let target = null, status = null, healing = 0, label = '';
  const support = enemy.expansionSupport;
  if (support === 'shell' && !adjacentTarget) {
    target = enemy; status = { type: 'fortify', turns: 2, power: 3 }; label = '수문 껍질';
  } else if (support === 'heal') {
    target = allies.filter(unit => distance(enemy, unit) <= 2 && unit.hp < unit.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0];
    if (target) { healing = Math.min(12 + Math.floor((enemy.level || 16) / 4), target.maxHp - target.hp); label = '공생 포자'; }
  } else if (support === 'inspire') {
    target = allies.filter(unit => distance(enemy, unit) <= 2 && !unit.status?.some(entry => entry.type === 'inspire'))
      .sort((a, b) => b.atk - a.atk || a.id.localeCompare(b.id))[0];
    if (target) { status = { type: 'inspire', turns: 2, power: 3 }; label = '정렬의 종'; }
  } else if (support === 'fortify') {
    target = allies.filter(unit => distance(enemy, unit) <= 1 && !unit.status?.some(entry => entry.type === 'fortify'))
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0];
    if (target) { status = { type: 'fortify', turns: 2, power: 3 }; label = '빈자리의 방패'; }
  } else if (support === 'alternatingGuard' && round % 2 === 0) {
    target = enemy; status = { type: 'fortify', turns: 1, power: enemy.phase2 ? 5 : 3 }; label = '공명 방어';
  }
  if (!target) return null;
  const nextUnits = units.map(unit => {
    let next = unit;
    if (unit.id === target.id) next = status
      ? { ...unit, status: addOrRefreshStatus(unit.status || [], { ...status, sourceId: enemy.id }) }
      : { ...unit, hp: Math.min(unit.maxHp, unit.hp + healing) };
    if (unit.id === enemy.id) next = { ...next, acted: true, expansionSupportNextRound: round + (support === 'alternatingGuard' ? 1 : 2) };
    return next;
  });
  return { units: nextUnits, actor: enemy, target, label, healing, status,
    messages: [`${enemy.name} ${label} → ${target.name}${healing ? ` HP ${healing} 회복` : ` ${status.type === 'fortify' ? '방어' : '공격'} +${status.power}`}`] };
}

/** Inspire buffs exactly the next attack; misses also consume the attempted attack. */
export function consumeExpansionEnemyAttackBoost(units, attackerId) {
  return units.map(unit => unit.id === attackerId && unit.expansionEnemy && unit.status?.some(status => status.type === 'inspire')
    ? { ...unit, status: unit.status.filter(status => status.type !== 'inspire') } : unit);
}

/** Telegraphs use the existing hazard resolver, so stepping out prevents the real damage. */
export function createExpansionBossHazards(units, map, round = 1) {
  const boss = units.find(unit => unit.type === 'boss' && unit.hp > 0 && EXPANSION_BOSS_KEYS.includes(unit.artId));
  if (!boss || round % 2 !== 0) return { hazards: [], pattern: null };
  const living = units.filter(unit => unit.type === 'ally' && unit.hp > 0)
    .sort((a, b) => (a.id === 'hero' ? -1 : b.id === 'hero' ? 1 : a.hp - b.hp));
  const target = living[0];
  if (!target) return { hazards: [], pattern: null };
  const limit = boss.artId === 'oath_guardian' && boss.phase2 ? 3 : 2;
  const coords = [{ x: target.x, y: target.y }, { x: target.x + 1, y: target.y }, { x: target.x, y: target.y - 1 }];
  const hazards = coords.slice(0, limit).filter(tile => tile.y >= 0 && tile.y < map.length && tile.x >= 0 && tile.x < (map[tile.y]?.length || 0))
    .map(tile => ({ ...tile, damage: boss.phase2 ? 9 : 6, label: boss.hazardLabel, sourceId: boss.id, effect: boss.skillSpec?.effect || 'holy' }));
  return { hazards, pattern: { label: boss.hazardLabel, desc: '다음 적 턴에 표시된 칸이 공격받습니다. 위험 칸을 벗어나세요.' } };
}
