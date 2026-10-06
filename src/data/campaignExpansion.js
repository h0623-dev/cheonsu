import { createExpansionEnemy } from './expansionEnemies.js';
import { createBattlefieldTerrain } from './stageTerrain.js';
import { distributeBattleFormations } from '../engine/formations.js';

const EXPANSION_GEAR_REWARDS = Object.freeze({
  32: Object.freeze(['mareSpear']),
  37: Object.freeze(['harinBracers']),
  42: Object.freeze(['edanHammer']),
  47: Object.freeze(['sylvanStaff']),
  50: Object.freeze(['oathCommemorative']),
});

// The original ending remains the conclusion of the first campaign. These
// chapters begin after the party's return, with four outer networks to rebuild.
export const EXPANSION_REGIONS = Object.freeze([
  {
    "start": 31,
    "end": 35,
    "name": "해안 침수 유적",
    "biome": "coast",
    "boss": "심해 수문장 모르칸",
    "story": "귀환 뒤 주민들의 피난길과 물길을 복구한다. 흑야를 부활시키지 않고 옛 명령을 따르는 수문 분기망을 새 공동 맹세로 갱신한다."
  },
  {
    "start": 36,
    "end": 40,
    "name": "백설 고원",
    "biome": "snow",
    "boss": "빙정 여왕 세르카",
    "story": "구호품을 고원으로 운반하며 얼어붙은 치유샘을 주민들에게 돌려준다. 온기를 한 의식에 묶은 오래된 규칙을 나누는 약속으로 바꾼다."
  },
  {
    "start": 41,
    "end": 45,
    "name": "지하 공명 공방",
    "biome": "workshop",
    "boss": "공명 집행관 아르켄",
    "story": "사람 없는 공방이 명령만 반복하는 원인을 찾는다. 이름을 장치 번호로 바꾼 기록을 복원하고 작업자 공동 권한으로 공방을 재건한다."
  },
  {
    "start": 46,
    "end": 50,
    "name": "별빛 봉인지",
    "biome": "starlight",
    "boss": "첫 맹세 수호체 아스테르",
    "story": "네 지역의 응답을 외곽 수호망에 전달한다. 흑야의 상위 흑막 대신 희생 계약만 읽는 옛 수호체와 싸우고 모두가 함께 돌아가는 약속을 완성한다."
  }
].map(region => Object.freeze(region)));

export const EXPANSION_STAGE_DESIGNS = Object.freeze([
  {
    "id": 31,
    "title": "돌아온 파도",
    "desc": "귀환길의 구호 요청을 받고 가론의 수문 기록으로 외곽 연결점의 오래된 명령을 알아낸다.",
    "leader": "갈대등 무리장",
    "leaderKey": "crab_guard",
    "enemyKeys": [
      "crab_guard"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 4500,
      "potion": 2
    },
    "storyRewards": [
      "해안 수문 기록"
    ]
  },
  {
    "id": 32,
    "title": "물길의 창",
    "desc": "주민을 구조하다 돌아갈 길을 잃은 마레와 함께 피난로를 연다. 전투 뒤 마레가 수문으로 안내한다.",
    "leader": "비늘가시 지휘사수",
    "leaderKey": "eel_archer",
    "enemyKeys": [
      "eel_archer",
      "crab_guard"
    ],
    "allyJoin": "mare",
    "reward": {
      "gold": 4650,
      "potion": 2
    },
    "storyRewards": [
      "해안 길잡이 기록"
    ]
  },
  {
    "id": 33,
    "title": "포자가 핀 수문",
    "desc": "주민의 복구 메모를 찾아 수문 안쪽으로 들어간다. 지원 군락을 흩뜨리고 외해로 이어지는 길을 찾는다.",
    "leader": "포자등 군락주",
    "leaderKey": "spore_colony",
    "enemyKeys": [
      "spore_colony",
      "crab_guard",
      "eel_archer"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 4800,
      "potion": 2
    },
    "storyRewards": [
      "수문석 표본"
    ]
  },
  {
    "id": 34,
    "title": "두 개의 귀환로",
    "desc": "마레와 세라가 도면과 피난로를 가져와 수문의 중앙 수호체를 확인한다.",
    "leader": "조개암초 파수장",
    "leaderKey": "crab_guard",
    "enemyKeys": [
      "crab_guard",
      "eel_archer",
      "spore_colony"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 4950,
      "potion": 3
    },
    "storyRewards": [
      "해류창 설계서"
    ]
  },
  {
    "id": 35,
    "title": "심해의 수문장",
    "desc": "옛 수문 명령을 유지하는 수호체를 섬멸한 뒤 주민들이 권한을 나눈다. 백설 고원의 치유샘 기록을 얻는다.",
    "leader": "심해 수문장 모르칸",
    "leaderKey": "tide_keeper",
    "enemyKeys": [
      "crab_guard",
      "eel_archer",
      "spore_colony"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 6300,
      "potion": 3
    },
    "storyRewards": [
      "물길의 표식"
    ]
  },
  {
    "id": 36,
    "title": "눈 아래의 발자국",
    "desc": "항구에서 보낸 구호품이 고원 입구에서 멈췄다. 하린의 표식을 따라 온천 지대로 향한다.",
    "leader": "눈안개 무리장",
    "leaderKey": "mist_ram",
    "enemyKeys": [
      "mist_ram"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 5250,
      "potion": 2
    },
    "storyRewards": [
      "고원 구호 기록"
    ]
  },
  {
    "id": 37,
    "title": "바람 속의 손길",
    "desc": "하린이 부상자를 돌보다 적에 둘러싸였다. 전투 승리 뒤 구조 대화와 함께 기사단에 합류한다.",
    "leader": "빙정날개 군주",
    "leaderKey": "crystal_insect",
    "enemyKeys": [
      "crystal_insect",
      "mist_ram"
    ],
    "allyJoin": "harin",
    "reward": {
      "gold": 5400,
      "potion": 3
    },
    "storyRewards": [
      "고원 구호 도구"
    ]
  },
  {
    "id": 38,
    "title": "따뜻한 돌",
    "desc": "냉각 명령을 잘못 받은 샘의 수호물이 주민을 공격한다. 아이린과 하린이 중앙 제단의 기록을 읽는다.",
    "leader": "온천도롱뇽 우두머리",
    "leaderKey": "spring_salamander",
    "enemyKeys": [
      "spring_salamander",
      "mist_ram",
      "crystal_insect"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 5550,
      "potion": 2
    },
    "storyRewards": [
      "온천 보호석"
    ]
  },
  {
    "id": 39,
    "title": "흰 능선의 약속",
    "desc": "온기를 나누던 샘이 한 의식에 독점된 기록을 찾는다. 기사단은 주민의 공동 이용을 되찾기로 한다.",
    "leader": "설원 샘의 파수장",
    "leaderKey": "mist_ram",
    "enemyKeys": [
      "mist_ram",
      "crystal_insect",
      "spring_salamander"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 5700,
      "potion": 3
    },
    "storyRewards": [
      "빙정 맹세 기록"
    ]
  },
  {
    "id": 40,
    "title": "얼음에 갇힌 온기",
    "desc": "치유샘을 의식 하나에 묶어 둔 관리자를 섬멸한다. 주민은 샘을 함께 쓰고 제어 장치의 공방 주소를 얻는다.",
    "leader": "빙정 여왕 세르카",
    "leaderKey": "frost_queen",
    "enemyKeys": [
      "mist_ram",
      "crystal_insect",
      "spring_salamander"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 7050,
      "potion": 3
    },
    "storyRewards": [
      "온기의 표식"
    ]
  },
  {
    "id": 41,
    "title": "멎지 않는 망치",
    "desc": "돌아온 사람이 없는 공방에서 생산 명령만 반복된다. 테오와 노아가 작업 기록을 조사한다.",
    "leader": "금실 인형장",
    "leaderKey": "gold_puppet",
    "enemyKeys": [
      "gold_puppet"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 6000,
      "potion": 2
    },
    "storyRewards": [
      "공방 명령 기록"
    ]
  },
  {
    "id": 42,
    "title": "종을 멈출 시간",
    "desc": "작업자를 대신해 장치를 끄려다 고립된 에단을 만난다. 승리 뒤 에단이 정상 장치와 위험 명령을 구분한다.",
    "leader": "가면종 감독관",
    "leaderKey": "bell_keeper",
    "enemyKeys": [
      "bell_keeper",
      "gold_puppet"
    ],
    "allyJoin": "edan",
    "reward": {
      "gold": 6150,
      "potion": 2
    },
    "storyRewards": [
      "공방 수리 도구"
    ]
  },
  {
    "id": 43,
    "title": "접힌 기록실",
    "desc": "사람 이름을 장치 번호로 바꾼 기록을 발견한다. 노아와 엘라가 외곽망으로 이어지는 문장을 복원한다.",
    "leader": "접힌 서고의 기록장",
    "leaderKey": "scroll_spirit",
    "enemyKeys": [
      "scroll_spirit",
      "gold_puppet",
      "bell_keeper"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 6300,
      "potion": 2
    },
    "storyRewards": [
      "공명 설계 조각"
    ]
  },
  {
    "id": 44,
    "title": "이름 없는 작업대",
    "desc": "에단은 이름을 되찾은 작업자에게 공방을 돌려주기로 한다. 가론의 증언과 공방 기록이 같은 명령을 가리킨다.",
    "leader": "공방 공정장",
    "leaderKey": "gold_puppet",
    "enemyKeys": [
      "gold_puppet",
      "bell_keeper",
      "scroll_spirit"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 6450,
      "potion": 3
    },
    "storyRewards": [
      "장치방패 설계서"
    ]
  },
  {
    "id": 45,
    "title": "공명의 집행관",
    "desc": "옛 서명만 읽는 자동 집행관을 섬멸한다. 작업자 공동 권한을 등록하고 생활 도구를 만드는 공방을 연다.",
    "leader": "공명 집행관 아르켄",
    "leaderKey": "resonance_judge",
    "enemyKeys": [
      "gold_puppet",
      "bell_keeper",
      "scroll_spirit"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 7800,
      "potion": 3
    },
    "storyRewards": [
      "공명의 표식"
    ]
  },
  {
    "id": 46,
    "title": "별이 남긴 길",
    "desc": "기사단이 새 표식을 전달하려 하자 야생 수호물이 막는다. 백호가 오래된 약속을 보관한 자리를 알아본다.",
    "leader": "월식 무리장",
    "leaderKey": "eclipse_cat",
    "enemyKeys": [
      "eclipse_cat"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 6750,
      "potion": 2
    },
    "storyRewards": [
      "별빛 회랑 기록"
    ]
  },
  {
    "id": 47,
    "title": "뿌리의 언어",
    "desc": "숲의 기억을 읽는 실반을 만난다. 옛 이름을 다시 부른 뒤 승리하고, 실반이 외곽 수호망 갱신에 동행한다.",
    "leader": "잉크덩굴 군락핵",
    "leaderKey": "ink_vine",
    "enemyKeys": [
      "ink_vine",
      "eclipse_cat"
    ],
    "allyJoin": "sylvan",
    "reward": {
      "gold": 6900,
      "potion": 2
    },
    "storyRewards": [
      "숲의 서약 기록"
    ]
  },
  {
    "id": 48,
    "title": "빈 갑옷의 행렬",
    "desc": "사람 없이 명령만 남은 갑옷을 만난다. 기사단은 이름을 가두지 않는 새로운 수호 방식을 설명한다.",
    "leader": "빈 갑옷의 선도자",
    "leaderKey": "hollow_armor",
    "enemyKeys": [
      "hollow_armor",
      "eclipse_cat",
      "ink_vine"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 7050,
      "potion": 3
    },
    "storyRewards": [
      "첫 맹세의 원문"
    ]
  },
  {
    "id": 49,
    "title": "모든 이름의 응답",
    "desc": "가론의 책임을 숨기지 않은 증언을 남긴다. 네 지역의 주민이 공동 맹세에 참여하고 카일은 홀로 남는 요구를 거절한다.",
    "leader": "첫 맹세의 전위",
    "leaderKey": "hollow_armor",
    "enemyKeys": [
      "eclipse_cat",
      "ink_vine",
      "hollow_armor"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 7200,
      "potion": 3
    },
    "storyRewards": [
      "공동 서약 기록"
    ]
  },
  {
    "id": 50,
    "title": "함께 여는 새벽",
    "desc": "희생 계약만 읽는 오래된 수호체를 섬멸한다. 주민과 기사단의 공동 응답을 등록해 외곽 수호망을 완성한다. 30장의 귀환은 보존된다.",
    "leader": "첫 맹세 수호체 아스테르",
    "leaderKey": "oath_guardian",
    "enemyKeys": [
      "eclipse_cat",
      "ink_vine",
      "hollow_armor"
    ],
    "allyJoin": null,
    "reward": {
      "gold": 8550,
      "potion": 5
    },
    "storyRewards": [
      "귀환의 맹세 기념 장비",
      "50장 엔딩 기록"
    ]
  }
].map(stage => Object.freeze({
  ...stage,
  enemyKeys: Object.freeze(stage.enemyKeys),
  reward: Object.freeze({ ...stage.reward, ...(EXPANSION_GEAR_REWARDS[stage.id] ? { gear: EXPANSION_GEAR_REWARDS[stage.id] } : {}) }),
  storyRewards: Object.freeze(stage.storyRewards),
})));

export const CAMPAIGN_STAGE_COUNT = 50;

export const EXPANSION_CHAPTER_BRIEFS = Object.freeze(Object.fromEntries(
  EXPANSION_STAGE_DESIGNS.map(stage => [stage.id, Object.freeze({ title: stage.title, text: stage.desc })]),
));

export function getExpansionRegion(stageId) {
  return EXPANSION_REGIONS.find(region => stageId >= region.start && stageId <= region.end) || null;
}

export function getExpansionStageDesign(stageId) {
  return EXPANSION_STAGE_DESIGNS.find(stage => stage.id === stageId) || null;
}

export function createExpansionStages(originalStages) {
  const originals = originalStages[0]?.units || [];
  const startingAllies = ['hero', 'bram', 'lina', 'aria'].map(id => originals.find(unit => unit.id === id));
  if (startingAllies.some(unit => !unit)) throw new Error('확장 캠페인을 만들 기본 아군이 없습니다.');
  return EXPANSION_STAGE_DESIGNS.map(design => {
    const map = createBattlefieldTerrain(design.id);
    const allyUnits = startingAllies.map(unit => ({ ...unit, equipment: { ...unit.equipment } }));
    const regularCount = 6 + (design.id - 31) % 5;
    const regularUnits = Array.from({ length: regularCount }, (_, index) => createExpansionEnemy(
      design.id, design.enemyKeys[index % design.enemyKeys.length], {
        id: `expansion-${design.id}-${index + 1}`, x: 1, y: 1, type: 'enemy',
      },
    ));
    const boss = createExpansionEnemy(design.id, design.leaderKey, {
      id: 'boss', x: 1, y: 1, type: 'boss', name: design.leader,
    });
    const stage = {
      id: design.id,
      title: `${design.id}장. ${design.title}`,
      desc: design.desc,
      objective: `목표: ${design.leader} 섬멸 또는 모든 적 섬멸`,
      reward: { ...design.reward },
      map,
      terrainRevision: 3,
      campaignExpansion: true,
      campaignRegion: getExpansionRegion(design.id).name,
      units: [...allyUnits, ...regularUnits, boss],
    };
    return { ...stage, units: distributeBattleFormations(stage, stage.units) };
  });
}
