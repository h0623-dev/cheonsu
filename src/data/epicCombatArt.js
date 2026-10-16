import { getCharacterArt } from './characterArt.js';

export const EPIC_COMBAT_KEYFRAME = '/art/combat-epic-v1/oath-battle-keyframe.png';
export const EPIC_COMBAT_SANCTUARY = '/art/combat-epic-v1/sanctuary-arena.png';
export const EPIC_COMBAT_ART_ASSETS = Object.freeze([EPIC_COMBAT_KEYFRAME, EPIC_COMBAT_SANCTUARY]);

// 승인된 합성 장면을 그대로 전투 결과로 보여주지 않고 시전자만 잘라 사용합니다.
// 전직 키에는 적용하지 않아 현재 전직의 초상과 무기를 유지합니다.
const cutInCrops = {
  hero: [70, 285, 640, 560],
  lina: [0, 60, 440, 390],
  aria: [1130, 535, 542, 400],
};

export function getEpicCombatCutInArt(unitKey, portrait) {
  const crop = Object.hasOwn(cutInCrops, unitKey) ? cutInCrops[unitKey] : null;
  return crop
    ? { kind: unitKey, src: EPIC_COMBAT_KEYFRAME, crop, width: 1672, height: 941 }
    : { kind: 'portrait', src: portrait, crop: null };
}

// B안은 전투에 참여하는 한 명의 실제 전신 원화만 사용합니다. 기본 외형과
// 전직 외형의 키를 그대로 조회하므로 다른 인물이나 기본 의상으로 바뀌지 않습니다.
// 구형 합성 컷인 API는 기존 자료와의 호환을 위해 위에 보존합니다.
export function getBattleStyleBCutInArt(unitKey, portrait, skillPose) {
  const art = getCharacterArt(unitKey);
  const src = skillPose?.src || art?.motion?.['skill-a'] || art?.motion?.strike
    || art?.motion?.recover || portrait;
  return { kind: 'b-frame', src, crop: null, unitKey };
}

function hasBoss(scene) {
  return scene?.attacker?.type === 'boss' || scene?.defender?.type === 'boss';
}

export function getEpicCombatBackdrop(stageId, scene, background) {
  // 성소 배경은 마지막 장의 적장 결투에만 사용합니다. 다른 전장은 원래 배경입니다.
  return Number(stageId) === 50 && hasBoss(scene) ? EPIC_COMBAT_SANCTUARY : background;
}

export function getEpicCombatAssets(attackerKey, scene, stageId = scene?.stageId) {
  const assets = [];
  const skill = scene?.mode === 'skill' || Boolean(scene?.outcome?.heal || scene?.outcome?.guard);
  if (skill && Object.hasOwn(cutInCrops, attackerKey)) assets.push(EPIC_COMBAT_KEYFRAME);
  // The battle lifecycle stays independent of the active map. Preload the boss plate
  // when its stage is unspecified; only CombatScene chooses whether to display it.
  if (hasBoss(scene) && (stageId == null || Number(stageId) === 50)) assets.push(EPIC_COMBAT_SANCTUARY);
  return assets;
}
