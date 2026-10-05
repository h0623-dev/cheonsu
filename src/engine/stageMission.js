import { getStageRoundLimit } from './stageRules.js';

/** Read the active battlefield's identities and the existing outcome rules without changing it. */
export function getStageMission(stage) {
  const units = Array.isArray(stage?.units) ? stage.units : [];
  // Match getBattleOutcome's initial leader roster, including legacy id='boss' enemies.
  const bosses = units.filter(unit => unit && (unit.type === 'boss' || (unit.id === 'boss' && unit.type !== 'ally')));
  const bossNames = bosses.map(unit => typeof unit.name === 'string' && unit.name.trim()
    ? unit.name.trim() : '이름 없는 적 대장');
  const hero = units.find(unit => unit?.id === 'hero');
  const heroName = typeof hero?.name === 'string' && hero.name.trim() ? hero.name.trim() : '카일';
  const roundLimit = getStageRoundLimit(stage);
  const victoryConditions = [];
  if (bossNames.length) {
    victoryConditions.push({
      id: 'leaders',
      text: bossNames.length === 1 ? `적 대장 「${bossNames[0]}」 섬멸`
        : `적 대장 전원 섬멸(${bossNames.map(name => `「${name}」`).join(', ')})`,
    });
  }
  victoryConditions.push({ id: 'enemies', text: '모든 적 섬멸' });
  return {
    bossNames, roundLimit, victoryConditions,
    defeatConditions: [
      { id: 'hero', text: `주인공 ${heroName} 사망` },
      { id: 'allies', text: '아군 전멸' },
      { id: 'round-limit', text: `${roundLimit}라운드의 아군 턴 종료까지 승리하지 못함` },
    ],
    victoryJoin: '또는', defeatJoin: '또는',
    note: bossNames.length
      ? '적 대장을 모두 섬멸하면 일반 적이나 증원이 남아 있어도 승리합니다. 적 전멸에는 전장에 남아 있는 증원도 포함됩니다.'
      : '전장에 남아 있는 증원까지 모두 섬멸해야 승리합니다.',
  };
}
