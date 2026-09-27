import { getPaintedVisualProfile } from './unitVisuals.js';

export const storySpeakerKeys = {
  카일: 'hero', 브람: 'bram', 리나: 'lina', 아리아: 'aria', 레온: 'leon',
  세라: 'sera', 노아: 'noah', 유나: 'yuna', 라칸: 'rakan', 미호: 'miho',
  테오: 'teo', 아이린: 'irene', 이레네: 'irene', 카즈: 'kaz', 엘라: 'ella',
  진: 'jin', 루카: 'luka', 백호: 'baekho', 가론: 'boss_abyss', '흑천 가론': 'boss_abyss',
};

export function getStoryPortrait(speaker) {
  return getPaintedVisualProfile(storySpeakerKeys[speaker] || 'hero').cutscene;
}
