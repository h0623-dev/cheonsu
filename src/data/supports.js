export const SUPPORT_PAIRS = [
  {
    id: "hero_lina",
    a: "hero",
    b: "lina",
    title: "카일 + 리나",
    text: "희망과 두려움 사이에서 서로를 지탱하는 관계.",
    dialogues: {
      C: [
        { speaker: "리나", text: "카일, 너무 앞서 나가지 마. 회복할 시간도 필요하다고." },
        { speaker: "카일", text: "알고 있어. 하지만 누군가는 길을 열어야 하잖아." },
        { speaker: "리나", text: "그럼 적어도 내가 따라갈 수 있는 속도로 가." },
        { speaker: "카일", text: "좋아. 다음엔 같이 움직이자." },
      ],
      B: [
        { speaker: "리나", text: "내 마법은 가끔 내 손을 벗어나. 그래서 무서워." },
        { speaker: "카일", text: "무서운 힘이라도 네가 선택해서 쓰면 달라질 수 있어." },
        { speaker: "리나", text: "그 말을 믿고 싶어. 아직은 조금 어렵지만." },
        { speaker: "카일", text: "어려우면 같이 해보자. 혼자 버틸 필요 없어." },
      ],
      A: [
        { speaker: "리나", text: "난 언젠가 또 폭주할지도 몰라." },
        { speaker: "카일", text: "그래도 같이 간다." },
        { speaker: "리나", text: "후회 안 해?" },
        { speaker: "카일", text: "동료를 버리는 게 더 후회돼." },
      ],
    },
  },
  {
    id: "hero_bram",
    a: "hero",
    b: "bram",
    title: "카일 + 브람",
    text: "이상과 현실이 충돌하면서도 같은 방향을 바라보는 관계.",
    dialogues: {
      C: [
        { speaker: "브람", text: "대장, 정면에서 맞붙는 건 좋지만 방패 뒤에 설 줄도 알아야 합니다." },
        { speaker: "카일", text: "브람, 또 잔소리야?" },
        { speaker: "브람", text: "잔소리가 아니라 생존 전략입니다." },
        { speaker: "카일", text: "알겠어. 네 뒤에 한 번 서볼게." },
      ],
      B: [
        { speaker: "브람", text: "예전 기사단은 이상을 말하다가 무너졌습니다." },
        { speaker: "카일", text: "그래서 아무것도 믿지 않게 된 거야?" },
        { speaker: "브람", text: "아니요. 믿는 법을 잊었을 뿐입니다." },
        { speaker: "카일", text: "그럼 내가 다시 기억나게 해볼게." },
      ],
      A: [
        { speaker: "브람", text: "대장, 당신의 이상은 무모합니다." },
        { speaker: "카일", text: "알아." },
        { speaker: "브람", text: "하지만 이상이 없으면 검을 들 이유도 없습니다." },
        { speaker: "카일", text: "그 말, 네가 해주니까 든든하다." },
      ],
    },
  },
  {
    id: "lina_bram",
    a: "lina",
    b: "bram",
    title: "리나 + 브람",
    text: "불꽃과 방패가 서로의 약점을 메워주는 관계.",
    dialogues: {
      C: [
        { speaker: "리나", text: "브람, 네 방패 뒤에 있으면 이상하게 마음이 편해." },
        { speaker: "브람", text: "그렇다면 계속 그 위치를 지키겠습니다." },
        { speaker: "리나", text: "그럼 난 뒤에서 제대로 태워버릴게." },
        { speaker: "브람", text: "아군은 빼고 부탁합니다." },
      ],
      B: [
        { speaker: "리나", text: "내 불꽃이 너까지 삼킬까 봐 겁나." },
        { speaker: "브람", text: "제 방패는 그런 날을 위해 있습니다." },
        { speaker: "리나", text: "너무 당연하게 말하지 마. 흔들리잖아." },
        { speaker: "브람", text: "흔들리면 기대십시오. 전 버티는 쪽이 익숙합니다." },
      ],
      A: [
        { speaker: "리나", text: "브람, 내가 불안해지면 한 번만 이름을 불러줘." },
        { speaker: "브람", text: "리나." },
        { speaker: "리나", text: "지금 말고." },
        { speaker: "브람", text: "연습입니다. 전장에서 실수하면 안 되니까요." },
      ],
    },
  },
];

export const DEFAULT_SUPPORT_POINTS = {
  hero_lina: 0,
  hero_bram: 0,
  lina_bram: 0,
};

export const DEFAULT_SUPPORT_DIALOGUES_SEEN = {
  hero_lina: [],
  hero_bram: [],
  lina_bram: [],
};

export const SUPPORT_RANK_THRESHOLDS = {
  C: 30,
  B: 70,
  A: 120,
};
