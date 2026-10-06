// 31장 이후 선택하는 최상위 전직. 기존 일반·비전 전직과 기본 기술은 유지한다.
const catalogue = {
  "hero": [
    {
      "id": "hero__form0",
      "unitId": "hero",
      "name": "여명룡기사",
      "role": "전열 돌파·화염 검술",
      "appearance": "밤색 머리와 청록 반망토·남색 분할 코트를 유지한다. 상아색 비대칭 판금에 청동 여명문양, 검은 한 자루. 검날을 따라 주홍 불꽃이 나선으로 감긴다.",
      "drawback": "방어 보정이 없고 여명 회오리참은 재사용 대기 4턴입니다.",
      "bonuses": {
        "hp": 2,
        "atk": 2,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "hero__form0-skill",
        "name": "여명 회오리참",
        "type": "attack",
        "bonus": 8,
        "minRange": 1,
        "range": 2,
        "cooldown": 4,
        "effect": "fire",
        "radius": 1,
        "status": "burn"
      }
    },
    {
      "id": "hero__form1",
      "unitId": "hero",
      "name": "천수맹약기사",
      "role": "지휘·근접 보호",
      "appearance": "동일한 밤색 머리·청록 망토. 은백 흉갑에 푸른 서약문양, 길어진 남색 분할 코트. 한 자루 장검을 곧게 세운 자세이며 방패는 새로 들지 않는다.",
      "drawback": "공격 보정이 없으며 보호 범위는 주변 1칸입니다. 수호 기술은 행동을 소모합니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "hero__form1-skill",
        "name": "귀환의 맹약",
        "type": "guard",
        "defense": 5,
        "radius": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "guard"
      }
    }
  ],
  "bram": [
    {
      "id": "bram__form0",
      "unitId": "bram",
      "name": "철성수호장",
      "role": "좁은 길 방어·물리 탱커",
      "appearance": "중년의 회갈색 머리와 갈색 수염, 상아색 금테 중갑·녹색 참나무 망토 유지. 두꺼운 카이트 방패와 단검, 커진 무릎·어깨 판금.",
      "drawback": "이동 보정이 없으며 보호 범위는 주변 1칸입니다. 마법 피해를 무효화하지는 않습니다.",
      "bonuses": {
        "hp": 6,
        "atk": 0,
        "def": 3,
        "move": 0
      },
      "skill": {
        "id": "bram__form0-skill",
        "name": "철성의 진",
        "type": "guard",
        "defense": 6,
        "radius": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "guard"
      }
    },
    {
      "id": "bram__form1",
      "unitId": "bram",
      "name": "서약성기사",
      "role": "마법 피해 완화·동료 보호",
      "appearance": "같은 수염과 녹색 망토. 상아·은빛 갑주에 금색 봉인띠, 참나무문양 카이트 방패와 기존 단검. 방패 가장자리에 부드러운 금빛 서약문자.",
      "drawback": "철성의 진보다 기술 방어 증가가 낮고 재사용 대기는 4턴입니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "bram__form1-skill",
        "name": "서약의 성벽",
        "type": "guard",
        "defense": 4,
        "radius": 1,
        "range": 1,
        "cooldown": 4,
        "effect": "guard",
        "special": {
          "cleanseGuard": true
        }
      }
    }
  ],
  "lina": [
    {
      "id": "lina__form0",
      "unitId": "lina",
      "name": "홍련명궁",
      "role": "원거리 화상·범위 압박",
      "appearance": "구리빛 붉은 땋은 포니테일·청동 잎 클립 고정. 올리브 조끼·상아 블라우스·녹색 망토에 주홍 잎 자수. 잎형 리커브 활 끝에 작은 불사조 깃 장식.",
      "drawback": "최소 사거리 2칸을 유지합니다. 가까이 붙은 적에게 이 기술을 쓸 수 없고 재사용 대기는 4턴입니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "lina__form0-skill",
        "name": "홍련 유성시",
        "type": "attack",
        "bonus": 8,
        "minRange": 2,
        "range": 4,
        "cooldown": 4,
        "effect": "fire",
        "radius": 1,
        "status": "burn"
      }
    },
    {
      "id": "lina__form1",
      "unitId": "lina",
      "name": "봉화인도자",
      "role": "원거리 약화·피난 지원",
      "appearance": "동일한 붉은 머리와 잎 클립·녹색 망토. 밝은 상아 외투, 허리의 작은 봉화등. 청동 잎형 리커브 활을 유지하며 지팡이로 바꾸지 않는다.",
      "drawback": "직접 공격 보정이 없으며 최소 사거리 2칸을 유지합니다. 범위 피해가 없습니다.",
      "bonuses": {
        "hp": 2,
        "atk": 0,
        "def": 1,
        "move": 0
      },
      "skill": {
        "id": "lina__form1-skill",
        "name": "봉화의 표식",
        "type": "attack",
        "bonus": 5,
        "minRange": 2,
        "range": 4,
        "cooldown": 3,
        "effect": "arrow",
        "status": "armorBreak",
        "accuracy": 20
      }
    }
  ],
  "aria": [
    {
      "id": "aria__form0",
      "unitId": "aria",
      "name": "성역대사제",
      "role": "집단 치유·상태이상 해제",
      "appearance": "상아백색 긴 머리·푸른 눈과 흰 로브·청록 스톨 유지. 금동 자수와 기도띠, 둥근 청동 태양 머리에 파란 보석이 있는 기존 목제 지팡이를 장식.",
      "drawback": "공격 보정이 없습니다. 치유는 사거리 3칸 안에서 최대 3명입니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 1,
        "move": 0
      },
      "skill": {
        "id": "aria__form0-skill",
        "name": "귀환의 성역",
        "type": "heal",
        "power": 20,
        "targets": 3,
        "range": 3,
        "cooldown": 4,
        "effect": "heal",
        "cleanse": true
      }
    },
    {
      "id": "aria__form1",
      "unitId": "aria",
      "name": "백광심판관",
      "role": "방어 약화·인접 동료 회복",
      "appearance": "같은 백발·푸른 눈·흰청록 배색. 얇은 은백 의식 견갑과 긴 분할 성의. 동일한 태양 지팡이 중심에 푸른 광륜; 차분한 시전 자세.",
      "drawback": "귀환의 성역을 얻지 못합니다. 추가 회복은 자신의 주변 1칸 살아 있는 부상 동료 한 명에만 적용됩니다.",
      "bonuses": {
        "hp": 0,
        "atk": 1,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "aria__form1-skill",
        "name": "백광 정화",
        "type": "attack",
        "bonus": 6,
        "minRange": 1,
        "range": 3,
        "cooldown": 3,
        "effect": "holy",
        "status": "armorBreak",
        "special": {
          "healNearby": 6
        }
      }
    }
  ],
  "leon": [
    {
      "id": "leon__form0",
      "unitId": "leon",
      "name": "유성창기사",
      "role": "직선 돌파·중거리 찌르기",
      "appearance": "짧은 금발·푸른 회색 눈 유지. 은빛 판금에 버건디 망토·목도리, 유성 꼬리 같은 가벼운 허리천. 긴 강철 창만 사용하며 활로 바꾸지 않는다.",
      "drawback": "방어 보정이 없습니다. 이동하지 않고 쓰면 추가 공격 +2가 적용되지 않습니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 1
      },
      "skill": {
        "id": "leon__form0-skill",
        "name": "유성 관통창",
        "type": "attack",
        "bonus": 9,
        "minRange": 1,
        "range": 2,
        "cooldown": 3,
        "effect": "thrust",
        "status": "armorBreak",
        "special": {
          "chargeBonus": 2
        }
      }
    },
    {
      "id": "leon__form1",
      "unitId": "leon",
      "name": "철진창수",
      "role": "전열 유지·자신 수호",
      "appearance": "동일한 금발과 붉은 망토. 은색 팔·무릎 판금 강화, 창날 아래 작은 버건디 전령 깃발. 긴 창을 비스듬히 세운 낮은 자세.",
      "drawback": "이동 보정이 없고 수문창진은 자신만 보호합니다. 강화 반격을 추가하는 기술은 아닙니다.",
      "bonuses": {
        "hp": 4,
        "atk": 1,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "leon__form1-skill",
        "name": "수문창진",
        "type": "guard",
        "defense": 4,
        "radius": 0,
        "range": 0,
        "cooldown": 2,
        "effect": "guard"
      }
    }
  ],
  "sera": [
    {
      "id": "sera__form0",
      "unitId": "sera",
      "name": "월영추적자",
      "role": "측면 추격·출혈",
      "appearance": "짙은 보랏빛 긴 포니테일·흑회색 가죽 갑옷·버건디 목도리 유지. 허리의 은색 추적 표식과 짧게 갈라진 망토. 두 단검을 유지.",
      "drawback": "방어 보정이 없고 기술 사거리는 1칸입니다. 중갑 정면전보다 측면 접근이 유리합니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 1
      },
      "skill": {
        "id": "sera__form0-skill",
        "name": "월영 추적",
        "type": "attack",
        "bonus": 7,
        "minRange": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "shadow",
        "status": "bleed",
        "critical": 10
      }
    },
    {
      "id": "sera__form1",
      "unitId": "sera",
      "name": "묵화교란자",
      "role": "이동 교란·길 안내",
      "appearance": "같은 머리와 얼굴·버건디 포인트. 연회색 안감의 짧은 망토, 허리의 작은 연막통. 기존 양손 단검; 보랏빛 얇은 연무.",
      "drawback": "공격 보정이 없습니다. 이동 약화는 명중한 중심 대상에게만 적용됩니다.",
      "bonuses": {
        "hp": 2,
        "atk": 0,
        "def": 1,
        "move": 1
      },
      "skill": {
        "id": "sera__form1-skill",
        "name": "묵화 연막",
        "type": "attack",
        "bonus": 4,
        "minRange": 1,
        "range": 2,
        "cooldown": 3,
        "effect": "shadow",
        "radius": 1,
        "special": {
          "slow": true
        }
      }
    }
  ],
  "noah": [
    {
      "id": "noah__form0",
      "unitId": "noah",
      "name": "뇌문대현자",
      "role": "연쇄 번개·마법 약화",
      "appearance": "검은 짧은 머리·둥근 안경·녹색 금테 코트 유지. 청동 책 모서리에 푸른 룬, 펼친 갈색 마법서 위 번개 문장. 지팡이를 새로 들지 않는다.",
      "drawback": "방어 보정이 없으며 재사용 대기는 4턴입니다. 주변 적이 흩어지면 범위 피해 효율이 낮습니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "noah__form0-skill",
        "name": "뇌문 연쇄식",
        "type": "attack",
        "bonus": 7,
        "minRange": 1,
        "range": 3,
        "cooldown": 4,
        "effect": "lightning",
        "radius": 1
      }
    },
    {
      "id": "noah__form1",
      "unitId": "noah",
      "name": "천수전략관",
      "role": "전술 방벽·집단 명중 지원",
      "appearance": "같은 안경과 녹색 코트. 어깨에 청동 지휘 인장, 허리 지도통. 마법서 위에 낮은 금빛 격자 도식만 펼친다.",
      "drawback": "공격 보정이 없습니다. 아군이 주변 2칸 밖에 있으면 수호 효과를 받을 수 없습니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "noah__form1-skill",
        "name": "귀환 진형도",
        "type": "guard",
        "defense": 4,
        "radius": 2,
        "range": 2,
        "cooldown": 3,
        "effect": "guard"
      }
    }
  ],
  "yuna": [
    {
      "id": "yuna__form0",
      "unitId": "yuna",
      "name": "월령대무녀",
      "role": "지속 회복·정화",
      "appearance": "긴 검은 머리와 분홍 꽃 장식·흰 장밋빛 로브 유지. 머리 뒤 가는 초승달 머리띠, 지팡이의 분홍 원석 둘레에 겹친 청동 고리.",
      "drawback": "방어 보정이 없습니다. 치유는 사거리 안 최대 3명이며 추가 회복은 쓰러진 동료를 되살리지 않습니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "yuna__form0-skill",
        "name": "월령의 기도",
        "type": "heal",
        "power": 14,
        "targets": 3,
        "range": 3,
        "cooldown": 3,
        "effect": "heal",
        "cleanse": true,
        "special": {
          "regen": 4
        }
      }
    },
    {
      "id": "yuna__form1",
      "unitId": "yuna",
      "name": "달등수호자",
      "role": "피해 예방·회복 지원",
      "appearance": "같은 검은 머리·꽃 장식. 흰 연분홍 의상에 작은 달등이 달린 허리띠, 기존 분홍 원석 목제 지팡이. 부드러운 은분홍 보호빛.",
      "drawback": "공격 보정이 없습니다. 수호 기술은 즉시 HP를 회복하지 않고 추가 회복은 다음 자기 턴에 적용됩니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "yuna__form1-skill",
        "name": "달등의 품",
        "type": "guard",
        "defense": 4,
        "radius": 2,
        "range": 2,
        "cooldown": 3,
        "effect": "guard",
        "special": {
          "regen": 4
        }
      }
    }
  ],
  "rakan": [
    {
      "id": "rakan__form0",
      "unitId": "rakan",
      "name": "대지쇄성자",
      "role": "중갑 파괴·근접 범위 공격",
      "appearance": "짙은 갈색 짧은 머리·수염과 굵은 맨팔 고정. 털 어깨의 갈색 가죽 중갑·붉은 허리띠에 검은 철판 보강. 양손 전투 도끼 끝에 황토빛 파편.",
      "drawback": "방어 보정이 없고 사거리는 1칸입니다. 재사용 대기는 4턴입니다.",
      "bonuses": {
        "hp": 2,
        "atk": 3,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "rakan__form0-skill",
        "name": "쇄성 대지격",
        "type": "attack",
        "bonus": 10,
        "minRange": 1,
        "range": 1,
        "cooldown": 4,
        "effect": "heavy",
        "radius": 1,
        "status": "armorBreak"
      }
    },
    {
      "id": "rakan__form1",
      "unitId": "rakan",
      "name": "불굴전쟁수호자",
      "role": "부상 동료 엄호·버티기",
      "appearance": "동일한 근육·맨팔·갈색 중갑. 더 두꺼운 모피 어깨와 붉은 수호끈, 기존 큰 도끼를 가슴 앞에 낮게 들고 단단한 발 자세.",
      "drawback": "공격 보정이 없습니다. 주변 1칸 밖 동료에게는 수호 효과가 닿지 않습니다.",
      "bonuses": {
        "hp": 6,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "rakan__form1-skill",
        "name": "불굴의 엄호",
        "type": "guard",
        "defense": 5,
        "radius": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "guard"
      }
    }
  ],
  "miho": [
    {
      "id": "miho__form0",
      "unitId": "miho",
      "name": "화연환술사",
      "role": "여우불·환영 폭발",
      "appearance": "짙은 자주검은 긴 머리·여우 귀·한 개의 부드러운 꼬리를 유지. 흰 홍매화 자수 소매와 붉은 리본, 녹금 띠. 빈 두 손 사이 꽃잎형 주홍 여우불.",
      "drawback": "방어 보정이 없습니다. 불꽃 기술 재사용 대기는 3턴이고 단일 적만 있으면 범위 이점이 줄어듭니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "miho__form0-skill",
        "name": "화연 만개",
        "type": "attack",
        "bonus": 7,
        "minRange": 1,
        "range": 3,
        "cooldown": 3,
        "effect": "fire",
        "radius": 1,
        "status": "burn"
      }
    },
    {
      "id": "miho__form1",
      "unitId": "miho",
      "name": "몽영길잡이",
      "role": "환영 유인·기습 차단",
      "appearance": "같은 여우 귀·꼬리·머리. 흰 로브에 보랏빛 안감, 붉은 매듭과 녹금 띠 유지. 손바닥 위 작은 여우 형상의 흐린 환영.",
      "drawback": "공격 보정이 없습니다. 환영 기술은 적의 이동력을 줄이며 분신 유닛을 생성하지 않습니다.",
      "bonuses": {
        "hp": 2,
        "atk": 0,
        "def": 1,
        "move": 1
      },
      "skill": {
        "id": "miho__form1-skill",
        "name": "몽영의 길",
        "type": "attack",
        "bonus": 4,
        "minRange": 1,
        "range": 3,
        "cooldown": 3,
        "effect": "shadow",
        "radius": 1,
        "special": {
          "slow": true
        }
      }
    }
  ],
  "teo": [
    {
      "id": "teo__form0",
      "unitId": "teo",
      "name": "천공관통사수",
      "role": "중갑 약화·범위 사격",
      "appearance": "짧은 적갈색 머리·녹색 망토·흰 셔츠와 갈색 가죽 경갑 유지. 가는 청동 조준 고리와 강화 시위를 붙인 목제 리커브 활. 총·석궁으로 바꾸지 않는다.",
      "drawback": "최소 사거리 2칸을 유지합니다. 대상 주변에 적이 없으면 범위 피해 이점이 없습니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "teo__form0-skill",
        "name": "천공 관통시",
        "type": "attack",
        "bonus": 8,
        "minRange": 2,
        "range": 4,
        "cooldown": 3,
        "effect": "arrow",
        "status": "armorBreak",
        "radius": 1
      }
    },
    {
      "id": "teo__form1",
      "unitId": "teo",
      "name": "풍문추격사수",
      "role": "기동 후 범위 사격",
      "appearance": "같은 적갈 머리·녹색 망토. 무릎이 보이는 짧은 바지와 가벼운 부츠, 허리에 작은 풍향 띠. 기존 목제 활·화살통.",
      "drawback": "공격 보정이 없으며 기술 사거리는 2~3칸입니다. 범위 안 인접 적에게 분산 피해를 주는 기술입니다.",
      "bonuses": {
        "hp": 2,
        "atk": 0,
        "def": 0,
        "move": 1
      },
      "skill": {
        "id": "teo__form1-skill",
        "name": "풍문 삼연시",
        "type": "attack",
        "bonus": 6,
        "minRange": 2,
        "range": 3,
        "cooldown": 3,
        "effect": "arrow",
        "radius": 1,
        "accuracy": 15
      }
    }
  ],
  "irene": [
    {
      "id": "irene__form0",
      "unitId": "irene",
      "name": "극광빙결현자",
      "role": "빙결 공격·전열 약화",
      "appearance": "상아백색 긴 머리·푸른 눈·파란 머리장식 유지. 흰파란 겹 로브와 극광빛 얇은 자수 망토, 높고 투명한 푸른 얼음 결정 지팡이.",
      "drawback": "방어 보정이 없고 재사용 대기는 4턴입니다. 스킬 강화로 대기시간이 없어지지 않습니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "irene__form0-skill",
        "name": "극광 빙정우",
        "type": "attack",
        "bonus": 6,
        "minRange": 1,
        "range": 3,
        "cooldown": 4,
        "effect": "ice",
        "radius": 1,
        "status": "freeze"
      }
    },
    {
      "id": "irene__form1",
      "unitId": "irene",
      "name": "서리성곽술사",
      "role": "마법 방벽·접근 억제",
      "appearance": "같은 백발·푸른 머리장식. 흰청색 의상에 각진 얼음 문양 어깨장식, 동일한 얼음 결정 지팡이. 발 주위 낮은 서리 원.",
      "drawback": "공격 보정이 없습니다. 적 이동 약화는 자신의 주변 1칸 적에게만 적용됩니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "irene__form1-skill",
        "name": "서리 성곽",
        "type": "guard",
        "defense": 4,
        "radius": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "guard",
        "special": {
          "slowAura": 1
        }
      }
    }
  ],
  "kaz": [
    {
      "id": "kaz__form0",
      "unitId": "kaz",
      "name": "흑섬잠행자",
      "role": "단일 대상 급소·출혈",
      "appearance": "검은 짧은 높은묶음·짧은 수염 유지. 회보라 경갑과 짙은 보라 목도리·갈색 벨트, 두 개의 작은 강철 단검에 은색 급소 각인.",
      "drawback": "방어 보정이 없고 기술 사거리는 1칸입니다. 무조건 명중하거나 즉사시키지 않습니다.",
      "bonuses": {
        "hp": 0,
        "atk": 3,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "kaz__form0-skill",
        "name": "흑섬 절맥",
        "type": "attack",
        "bonus": 10,
        "minRange": 1,
        "range": 1,
        "cooldown": 4,
        "effect": "shadow",
        "status": "bleed",
        "accuracy": 10,
        "critical": 15
      }
    },
    {
      "id": "kaz__form1",
      "unitId": "kaz",
      "name": "무음역습자",
      "role": "근접 생존·자신 수호",
      "appearance": "동일한 남성 얼굴·보라색 배색. 짧고 몸에 붙는 망토와 얇은 팔 보호대, 두 단검을 역수로 가깝게 든 낮은 자세.",
      "drawback": "기술은 자신을 수호하며 직접 피해를 주지 않습니다. 원거리 반격 능력을 추가하지 않습니다.",
      "bonuses": {
        "hp": 2,
        "atk": 1,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "kaz__form1-skill",
        "name": "무음 역습",
        "type": "guard",
        "defense": 4,
        "radius": 0,
        "range": 0,
        "cooldown": 2,
        "effect": "guard"
      }
    }
  ],
  "ella": [
    {
      "id": "ella__form0",
      "unitId": "ella",
      "name": "별울림악성",
      "role": "집단 회복·지원 선율",
      "appearance": "적갈색 웨이브 머리·청록 리본·녹색 금꽃 자수 망토 유지. 흰 드레스 위 가는 청동 별띠, 작은 목제 류트에 자개 별무늬. 지팡이로 바꾸지 않는다.",
      "drawback": "공격 보정이 없습니다. 회복 범위는 사거리 3칸 안 최대 3명입니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 1,
        "move": 0
      },
      "skill": {
        "id": "ella__form0-skill",
        "name": "귀환 교향",
        "type": "heal",
        "power": 14,
        "targets": 3,
        "range": 3,
        "cooldown": 3,
        "effect": "heal",
        "special": {
          "regen": 3
        }
      }
    },
    {
      "id": "ella__form1",
      "unitId": "ella",
      "name": "천문공명사",
      "role": "공명 범위 공격·적 강화 약화",
      "appearance": "같은 리본·적갈 머리. 짙은 녹색 보디스와 금빛 별자리 자수, 동일한 배 모양 목제 류트. 현에서 푸른금색 원형 음파.",
      "drawback": "방어 보정이 없습니다. 적의 방어를 약화하지만 모든 강화나 보스 기믹을 삭제하지 않습니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "ella__form1-skill",
        "name": "성좌 공명파",
        "type": "attack",
        "bonus": 7,
        "minRange": 1,
        "range": 3,
        "cooldown": 4,
        "effect": "music",
        "radius": 1,
        "status": "armorBreak"
      }
    }
  ],
  "jin": [
    {
      "id": "jin__form0",
      "unitId": "jin",
      "name": "적룡검황",
      "role": "화염 검술·고위력 단일 공격",
      "appearance": "검은 긴 높은묶음·동양식 흰 로브·버건디 목도리와 허리띠 유지. 검집에 작은 적룡 문양, 한 자루 약간 휜 장검. 검끝에서 얇은 붉은 용염.",
      "drawback": "방어 보정이 없고 기술 사거리는 1칸입니다. 재사용 대기는 4턴입니다.",
      "bonuses": {
        "hp": 0,
        "atk": 3,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "jin__form0-skill",
        "name": "적룡 승염참",
        "type": "attack",
        "bonus": 11,
        "minRange": 1,
        "range": 1,
        "cooldown": 4,
        "effect": "fire",
        "status": "burn"
      }
    },
    {
      "id": "jin__form1",
      "unitId": "jin",
      "name": "월백검선",
      "role": "중거리 참격·안정된 근접전",
      "appearance": "같은 검은 포니테일·흰 로브·붉은 허리띠. 은회색 얇은 의식 자수와 흰 검집끈, 동일한 휜 장검. 차갑고 얇은 월광 호.",
      "drawback": "적룡검황보다 공격 보정이 낮습니다. 반월참에는 화상이나 추가 반격이 없습니다.",
      "bonuses": {
        "hp": 2,
        "atk": 1,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "jin__form1-skill",
        "name": "월백 반월참",
        "type": "attack",
        "bonus": 7,
        "minRange": 1,
        "range": 2,
        "cooldown": 3,
        "effect": "slash",
        "radius": 1
      }
    }
  ],
  "luka": [
    {
      "id": "luka__form0",
      "unitId": "luka",
      "name": "새벽선봉장",
      "role": "기동 돌파·정확한 검격",
      "appearance": "짧은 금발·푸른 눈·은빛 판금·흰 금테 타바드·녹색 짧은 망토 유지. 가벼운 은색 무릎 갑주와 작은 새벽 깃 장식. 한 자루 강철 장검만 사용.",
      "drawback": "방어 보정이 없으며 기술 사거리는 1칸입니다. 명중 지원은 이 공격 자체에만 적용됩니다.",
      "bonuses": {
        "hp": 0,
        "atk": 1,
        "def": 0,
        "move": 1
      },
      "skill": {
        "id": "luka__form0-skill",
        "name": "새벽의 선봉",
        "type": "attack",
        "bonus": 8,
        "minRange": 1,
        "range": 1,
        "cooldown": 2,
        "effect": "slash",
        "accuracy": 15
      }
    },
    {
      "id": "luka__form1",
      "unitId": "luka",
      "name": "성소전위수호자",
      "role": "동료 방벽·안정적인 근접전",
      "appearance": "같은 금발·은색 판금·흰 타바드. 녹색 망토에 금색 성소 인장, 장검을 세워 한손으로 수호 문장을 펼침. 방패·활을 새로 들지 않는다.",
      "drawback": "공격·이동 보정이 없습니다. 수호 범위는 주변 1칸이며 행동을 소모합니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "luka__form1-skill",
        "name": "성소의 빛",
        "type": "guard",
        "defense": 4,
        "radius": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "guard"
      }
    }
  ],
  "baekho": [
    {
      "id": "baekho__form0",
      "unitId": "baekho",
      "name": "백호권성",
      "role": "방어 파괴·강한 단일 권격",
      "appearance": "은백색 상투·흰 수염·성숙한 근육형 인간 유지. 민소매 흰녹색 수련복·붉은 허리띠, 두꺼운 손목 붕대에 청동 호완. 맨손 권법이며 호랑이 몸으로 변하지 않음.",
      "drawback": "방어 보정이 없고 기술 사거리는 1칸입니다. 원거리 적에게 바로 닿을 수 없습니다.",
      "bonuses": {
        "hp": 0,
        "atk": 3,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "baekho__form0-skill",
        "name": "백호 파갑권",
        "type": "attack",
        "bonus": 10,
        "minRange": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "impact",
        "status": "armorBreak"
      }
    },
    {
      "id": "baekho__form1",
      "unitId": "baekho",
      "name": "금강문지기",
      "role": "동료 보호·거점 수비",
      "appearance": "같은 상투·흰수염·흰녹 수련복. 녹색 수호 매듭과 두꺼운 발목 보호대, 한손을 편 굳은 권법 자세. 무기는 새로 장비하지 않음.",
      "drawback": "공격 보정이 없습니다. 수호 범위는 주변 1칸이며 밀치기 면역을 추가하지 않습니다.",
      "bonuses": {
        "hp": 6,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "baekho__form1-skill",
        "name": "금강 수문식",
        "type": "guard",
        "defense": 5,
        "radius": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "guard"
      }
    }
  ],
  "mare": [
    {
      "id": "mare__form0",
      "unitId": "mare",
      "name": "청해폭풍창",
      "role": "밀기·직선 창술",
      "appearance": "같은 남청 단발·청록 망토. 초승달 창날에 청동 파도 문양, 어깨에 소형 해수 결정. 나선 물결이 창끝을 따른다.",
      "drawback": "방어 보정이 없습니다. 보스는 밀리지 않고 빈 이동 가능 칸이 없으면 밀기 효과가 없습니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 1
      },
      "skill": {
        "id": "mare__form0-skill",
        "name": "청해 나선창",
        "type": "attack",
        "bonus": 8,
        "minRange": 1,
        "range": 2,
        "cooldown": 3,
        "effect": "thrust",
        "special": {
          "push": true
        }
      }
    },
    {
      "id": "mare__form1",
      "unitId": "mare",
      "name": "조류수호기사",
      "role": "해안 기동 지원·구조",
      "appearance": "같은 단발·초승달 창. 상아청록 갑주에 해안 수호띠, 구조 밧줄과 작은 부력낭을 허리에 배치. 창을 곧게 세운 안정된 자세.",
      "drawback": "공격 보정이 없습니다. 물길 지원은 다음 자기 턴 얕은 물·늪에만 적용됩니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "mare__form1-skill",
        "name": "돌아오는 물길",
        "type": "guard",
        "defense": 4,
        "radius": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "guard",
        "special": {
          "waterStride": true
        }
      }
    }
  ],
  "harin": [
    {
      "id": "harin__form0",
      "unitId": "harin",
      "name": "홍련연무사",
      "role": "근접 연격·자신 회복",
      "appearance": "같은 검은 높은묶음·상아 주홍 수련복. 주홍 허리끈을 길게, 청동 호완에 붉은 호흡 문양. 양손에 작은 따뜻한 기운만 맺힘.",
      "drawback": "방어 보정이 없고 기술 사거리는 1칸입니다. 자기 회복은 공격이 실제 명중했을 때만 적용됩니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 1
      },
      "skill": {
        "id": "harin__form0-skill",
        "name": "홍련 연환권",
        "type": "attack",
        "bonus": 8,
        "minRange": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "impact",
        "special": {
          "selfHeal": 4
        }
      }
    },
    {
      "id": "harin__form1",
      "unitId": "harin",
      "name": "온맥수호사",
      "role": "근접 응급 치유·동료 엄호",
      "appearance": "같은 얼굴·상투형 묶음. 상아색 긴 앞자락과 주홍 어깨천, 청동 호완과 약초 주머니. 한손은 편 치료 자세, 다른 손은 권법 가드.",
      "drawback": "공격 보정이 없습니다. 치유 사거리는 1칸이며 최대 2명만 선택합니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "harin__form1-skill",
        "name": "온맥 호흡진",
        "type": "heal",
        "power": 14,
        "targets": 2,
        "range": 1,
        "cooldown": 3,
        "effect": "heal",
        "cleanse": true
      }
    }
  ],
  "edan": [
    {
      "id": "edan__form0",
      "unitId": "edan",
      "name": "공명파쇄장인",
      "role": "장치·중갑 파괴",
      "appearance": "같은 적갈 수염·남색 작업복. 황동 진동고리를 붙인 망치, 고글은 이마 위. 접이식 방패에 작고 읽기 쉬운 푸른 공명 결정.",
      "drawback": "방어 보정이 없고 기술 사거리는 1칸입니다. 장치 파괴나 보스 기믹 삭제를 보장하지 않습니다.",
      "bonuses": {
        "hp": 2,
        "atk": 2,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "edan__form0-skill",
        "name": "공명 파쇄격",
        "type": "attack",
        "bonus": 9,
        "minRange": 1,
        "range": 1,
        "cooldown": 3,
        "effect": "heavy",
        "status": "armorBreak"
      }
    },
    {
      "id": "edan__form1",
      "unitId": "edan",
      "name": "성채기공사",
      "role": "임시 방벽·거점 수비",
      "appearance": "동일한 머리·수염. 황토 작업 코트 위 분할 철판, 접이식 장치 방패를 더 넓게 펼친 형태. 망치와 허리 도구는 유지.",
      "drawback": "공격 보정이 없습니다. 보호 범위는 자신의 주변 2칸이며 재사용 대기는 4턴입니다.",
      "bonuses": {
        "hp": 6,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "edan__form1-skill",
        "name": "공방 수호장치",
        "type": "guard",
        "defense": 5,
        "radius": 2,
        "range": 2,
        "cooldown": 4,
        "effect": "guard"
      }
    }
  ],
  "sylvan": [
    {
      "id": "sylvan__form0",
      "unitId": "sylvan",
      "name": "고목룬현자",
      "role": "뿌리 제어·룬 마법",
      "appearance": "같은 은백 반묶음·이끼녹 로브. 목제 지팡이에 얇은 상아 룬띠와 초록 결정, 어깨천에 오래된 나이테 자수. 낮은 뿌리 룬이 손끝에서 보임.",
      "drawback": "방어 보정이 없습니다. 이동 약화는 명중한 중심 대상에게만 적용되며 완전 행동 봉쇄가 아닙니다.",
      "bonuses": {
        "hp": 0,
        "atk": 2,
        "def": 0,
        "move": 0
      },
      "skill": {
        "id": "sylvan__form0-skill",
        "name": "고목의 결계",
        "type": "attack",
        "bonus": 7,
        "minRange": 1,
        "range": 3,
        "cooldown": 3,
        "effect": "nature",
        "radius": 1,
        "special": {
          "slow": true
        }
      }
    },
    {
      "id": "sylvan__form1",
      "unitId": "sylvan",
      "name": "새싹생명지기",
      "role": "지속 치유·환경 저항",
      "appearance": "같은 얼굴과 장발. 밝은 이끼녹색 로브에 상아 잎자수, 기존 뿌리 지팡이에서 작은 새싹. 발목과 손목의 얇은 생태학자 표식.",
      "drawback": "공격 보정이 없습니다. 추가 회복은 다음 자기 턴 1회이며 쓰러진 동료를 되살리지 않습니다.",
      "bonuses": {
        "hp": 4,
        "atk": 0,
        "def": 2,
        "move": 0
      },
      "skill": {
        "id": "sylvan__form1-skill",
        "name": "다시 자라는 약속",
        "type": "heal",
        "power": 10,
        "targets": 3,
        "range": 3,
        "cooldown": 3,
        "effect": "heal",
        "special": {
          "regen": 4
        }
      }
    }
  ]
};

export const ADVANCED_CLASSES = Object.freeze(Object.fromEntries(Object.entries(catalogue).map(([id, forms]) => [id, Object.freeze(forms.map(form => Object.freeze({ ...form, bonuses: Object.freeze(form.bonuses), skill: Object.freeze(form.skill) })))])));
export const NEW_ALLY_TEMPLATES = Object.freeze({
  "mare": {
    "id": "mare",
    "name": "마레",
    "icon": "🔱",
    "hp": 30,
    "maxHp": 30,
    "atk": 9,
    "move": 3,
    "minRange": 1,
    "range": 2,
    "skill": "해류 찌르기",
    "skillType": "attack",
    "skillBonus": 4,
    "skillRange": 2,
    "def": 5
  },
  "harin": {
    "id": "harin",
    "name": "하린",
    "icon": "🤲",
    "hp": 28,
    "maxHp": 28,
    "atk": 8,
    "move": 4,
    "range": 1,
    "skill": "온맥수",
    "skillType": "heal",
    "skillBonus": 0,
    "skillRange": 1,
    "def": 5
  },
  "edan": {
    "id": "edan",
    "name": "에단",
    "icon": "⚒️",
    "hp": 34,
    "maxHp": 34,
    "atk": 10,
    "move": 2,
    "range": 1,
    "skill": "파쇄 망치",
    "skillType": "attack",
    "skillBonus": 5,
    "skillRange": 1,
    "def": 7
  },
  "sylvan": {
    "id": "sylvan",
    "name": "실반",
    "icon": "🌿",
    "hp": 25,
    "maxHp": 25,
    "atk": 9,
    "move": 3,
    "minRange": 1,
    "range": 2,
    "skill": "뿌리 얽기",
    "skillType": "attack",
    "skillBonus": 4,
    "skillRange": 3,
    "def": 4
  }
});

export function getAdvancedClassDefinition(unit) {
  return unit?.type !== "enemy" && unit?.type !== "boss" && Object.hasOwn(ADVANCED_CLASSES, unit?.id)
    ? ADVANCED_CLASSES[unit.id].find(form => form.id === unit.advancedClass) || null : null;
}
