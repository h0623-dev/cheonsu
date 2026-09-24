// These IDs are save-data keys shared with learnedTechniques and the skill UI.
export const DISCOVERY_TECHNIQUES = Object.freeze({
  'hero-dawn-slash': Object.freeze({
    id: 'hero-dawn-slash', unitId: 'hero', name: '여명참',
    type: 'attack', bonus: 7, range: 2, cooldown: 4, effect: 'slash', status: 'armorBreak',
  }),
  'lina-phoenix-flare': Object.freeze({
    id: 'lina-phoenix-flare', unitId: 'lina', name: '불사조의 불꽃',
    type: 'attack', bonus: 6, range: 3, cooldown: 4, effect: 'fire', status: 'burn', radius: 1,
  }),
  'aria-sanctuary-song': Object.freeze({
    id: 'aria-sanctuary-song', unitId: 'aria', name: '성역의 노래',
    type: 'heal', power: 14, targets: 3, range: 3, cooldown: 4, effect: 'heal', cleanse: true,
  }),
  'bram-oath-wall': Object.freeze({
    id: 'bram-oath-wall', unitId: 'bram', name: '서약의 방벽',
    type: 'guard', defense: 5, radius: 1, range: 1, cooldown: 4, effect: 'guard',
  }),
});

export const SECRET_PROMOTIONS = Object.freeze({
  hero: Object.freeze({
    id: 'dawnblade', unitId: 'hero', secretClass: 'dawnblade', classTitle: '여명검사',
    relicId: 'dawnblade-relic', requiredLevel: 5, techniqueId: 'hero-dawn-slash',
    bonuses: Object.freeze({ hp: 8, atk: 3, def: 2 }),
  }),
  bram: Object.freeze({
    id: 'oathwarden', unitId: 'bram', secretClass: 'oathwarden', classTitle: '서약수호자',
    relicId: 'oathwarden-relic', requiredLevel: 5, techniqueId: 'bram-oath-wall',
    bonuses: Object.freeze({ hp: 10, atk: 2, def: 4 }),
  }),
});

export const DISCOVERIES = Object.freeze([
  {
    id: 'border-training-stone', stageId: 1, kind: 'training',
    title: '초소지기의 가르침',
    hint: '집결지 너머의 오래된 수련석에 선명한 검흔이 남아 있다.',
    reward: { xp: 35 }, placement: { depth: 0.2, side: 0.25 },
  },
  {
    id: 'canyon-dawn-inscription', stageId: 2, kind: 'technique',
    title: '동트기 전의 검',
    hint: '좁은 공터에는 첫 매복을 막아 낸 검사의 보법이 숨겨져 있다.',
    reward: { techniqueId: 'hero-dawn-slash', unitId: 'hero' },
    placement: { depth: 0.4, side: 0.75 },
  },
  {
    id: 'gate-phoenix-scroll', stageId: 3, kind: 'technique',
    title: '타지 않은 두루마리',
    hint: '성문 진입로 너머, 그을린 두루마리 안에 작은 불씨가 살아 있다.',
    reward: { techniqueId: 'lina-phoenix-flare', unitId: 'lina' },
    placement: { depth: 0.5, side: 0.25 },
  },
  {
    id: 'ruins-sanctuary-bell', stageId: 4, kind: 'technique',
    title: '잿더미 아래의 기도',
    hint: '진군로를 벗어난 곳에 금이 간 종이 있다. 마지막 구절에는 치유의 노래가 새겨져 있다.',
    reward: { techniqueId: 'aria-sanctuary-song', unitId: 'aria' },
    placement: { depth: 0.55, side: 0.75 },
  },
  {
    id: 'pass-oath-tablet', stageId: 5, kind: 'technique',
    title: '방패지기의 약속',
    hint: '버려진 방어 초소에 홀로 부대를 지켜 낸 수호자의 기록이 남아 있다.',
    reward: { techniqueId: 'bram-oath-wall', unitId: 'bram' },
    placement: { depth: 0.6, side: 0.25 },
  },
  {
    id: 'frost-dawnblade-relic', stageId: 6, kind: 'relic',
    title: '첫 여명의 조각',
    hint: '얼어붙은 진입로 깊숙이 묻힌 검날에서 꺼지지 않는 빛이 새어 나온다.',
    reward: { relicId: 'dawnblade-relic', unitId: 'hero' },
    placement: { depth: 0.8, side: 0.75 },
  },
  {
    id: 'frontier-veteran-journal', stageId: 8, kind: 'training',
    title: '노병의 마지막 수련',
    hint: '버려진 쉼터의 전투 일지에는 끝내 마치지 못한 마지막 수련이 적혀 있다.',
    reward: { xp: 60 }, placement: { depth: 0.5, side: 0.75 },
  },
  {
    id: 'citadel-oathwarden-relic', stageId: 10, kind: 'relic',
    title: '꺾이지 않은 서약',
    hint: '출진지에서 멀리 떨어진 곳, 쓰러진 수호자의 인장이 새 주인을 기다린다.',
    reward: { relicId: 'oathwarden-relic', unitId: 'bram' },
    placement: { depth: 0.85, side: 0.25 },
  },
].map((entry) => Object.freeze({
  ...entry, reward: Object.freeze(entry.reward), placement: Object.freeze(entry.placement),
})));
