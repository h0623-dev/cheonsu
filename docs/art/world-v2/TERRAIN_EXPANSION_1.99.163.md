# 1.99.163 신규 지형 원화

기존 월드 지형의 손으로 채색한 재질과 내려다보는 시점을 참고해10종의 지형 원화를 새로 제작했습니다. 기존 지형 파일은 보존합니다. 생성 원본은 `sources/terrain-expansion.png`이며, 2열5행을 왼쪽부터 읽습니다.

| 행 | 왼쪽 | 오른쪽 |
| --- | --- | --- |
| 1 | 조개암초 `shell_reef` | 수문석교 `sluice_bridge` |
| 2 | 눈다짐길 `packed_snow` | 온천석 `hot_spring` |
| 3 | 동력도선 `power_conduit` | 공명받침 `resonance_pad` |
| 4 | 별빛이끼 `star_moss` | 봉인문양 `oath_rune` |
| 5 | 균열석판 `cracked_slab` | 낮은 잔해 `low_rubble` |

원화는 캐릭터·글자·UI 없이 불투명한 바닥 재질로 제작했습니다. `scripts/prepare-expansion-terrain.cjs`는 원본의 동일 크기 칸을 자르고512×512 WebP로 내보냅니다. 원본 SHA-256과 실제 자르기 좌표는 `terrain-expansion-exports.json`에 기록합니다. 게임에서는 `src/data/terrainPolicy.js`와 `worldArt.js`가 해당 전용 파일을 선택합니다.

효과는 엄폐·진격길·거친 땅·턴 시작 회복·마법 강화로 구분하고 아군과 적에 동일하게 적용합니다. 회복·마법 강화칸은 시작 배치에서 제외합니다. 원화 제작과 실제 규칙 검증은 별개이며 최종 QA 보고서에 실행 결과를 기록합니다.
