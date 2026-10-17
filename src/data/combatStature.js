// 몸의 체격과 적장의 지위를 분리합니다. 현재 보스 원화 9종은 인간급이며,
// 갑옷·검·왕관·부유 석판이 크다는 이유로 신체나 상대를 확대/축소하지 않습니다.
// 기존 대형 보스 배치는 실제 원화·설정에 큰 몸이 명시된 종족에만 남깁니다.
const largeCombatBodies = new Set(['horned-ogre', 'rock-spirit', 'crab_guard', 'spore_colony']);

export function isLargeCombatBody(unitKey) {
  return largeCombatBodies.has(unitKey);
}
