export const EXPERIENCE_REWARD_MULTIPLIER = 1.6;

// 보상을 만들 때 한 번만 적용합니다. 저장된 EXP와 grantExp의 지급량은 다시 보정하지 않습니다.
export function getExperienceReward(baseAmount) {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return 0;
  return Math.round(baseAmount * EXPERIENCE_REWARD_MULTIPLIER);
}
