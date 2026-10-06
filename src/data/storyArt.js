import { getPaintedVisualProfile } from './unitVisuals.js';
import { getCharacterArt } from './characterArt.js';
import { getExpansionArtIdentity, getGameCharacterArtKey } from './expansionArtRegistry.js';

export const storySpeakerKeys = {
  카일: 'hero', 브람: 'bram', 리나: 'lina', 아리아: 'aria', 레온: 'leon',
  세라: 'sera', 노아: 'noah', 유나: 'yuna', 라칸: 'rakan', 미호: 'miho',
  테오: 'teo', 아이린: 'irene', 이레네: 'irene', 카즈: 'kaz', 엘라: 'ella',
  진: 'jin', 루카: 'luka', 백호: 'baekho', 가론: 'boss_abyss', '흑천 가론': 'boss_abyss',
  마레: 'mare', 하린: 'harin', 에단: 'edan', 실반: 'sylvan',
  모르칸: 'tide_keeper', '심해수문장 모르칸': 'tide_keeper',
  '심해 수문장 모르칸': 'tide_keeper',
  세르카: 'frost_queen', '빙정여왕 세르카': 'frost_queen',
  '빙정 여왕 세르카': 'frost_queen',
  아르켄: 'resonance_judge', '공명집행관 아르켄': 'resonance_judge',
  '공명 집행관 아르켄': 'resonance_judge',
  아스테르: 'oath_guardian', '첫맹세수호체 아스테르': 'oath_guardian',
  '첫 맹세 수호체 아스테르': 'oath_guardian',
};

export function getStoryPortrait(speaker, party = []) {
  const key = Object.hasOwn(storySpeakerKeys, speaker) ? storySpeakerKeys[speaker] : null;
  if (key) {
    const canonicalKey = getExpansionArtIdentity(key)?.baseId || key;
    const unit = (Array.isArray(party) ? party : []).find(candidate => {
      const artKey = getGameCharacterArtKey(candidate);
      return (getExpansionArtIdentity(artKey)?.baseId || artKey) === canonicalKey;
    });
    const selectedArt = unit && getCharacterArt(getGameCharacterArtKey(unit));
    const selectedPortrait = selectedArt?.dialogue || selectedArt?.portrait;
    if (selectedPortrait) return selectedPortrait;
  }
  return getPaintedVisualProfile(key || 'hero')?.cutscene || getPaintedVisualProfile('hero').cutscene;
}
