# 전투·대화 새 시안 원화

2026-10-03 사용자가 카일·브람·리나 비교 시안의 전투·대화 모습을 승인하고 전체 41종에 적용하도록 요청했습니다. 원화는 image_gen으로 기존 인물 정체성과 승인 시안을 참조하여 만들었습니다. 기존 대기 이미지는 적용 범위에서 제외합니다.

`sources/{id}.png`는 전진 a/b·준비·타격·전투 대기·피격·기술 a/b·대화의 3×3 투명 원화입니다. `prompts/{id}.txt`에 제작 지시를, `extraction-report.json`에 원본 SHA-256·영역·발 정렬을 기록합니다. 실제 게임 이미지는 `public/art/characters-v2`입니다.

재추출: `node scripts/prepare-character-redesign.cjs`. 한 인물만 확인: `node scripts/prepare-character-redesign.cjs --only=hero`.

대기 원본 86개 파일의 SHA-256은 `idle-baseline.json`입니다. [전체 변경 및 검증](../../CHARACTER_REDESIGN_1.99.155.md).

## 1.99.157 적 종족 추가

승인한 코볼트·도마뱀·오거·하피·해골·바위정령 6종을 동일한 8동작+대화 원화 형식으로 추가합니다. 원화의 잘린 무기를 image_gen으로 다시 그린 경우 `{id}-{pose}-correction.png`를 보존하고, 추출 시 해당 자세만 완전한 보정 원화로 교체합니다. 원본의 잘린 자세는 최종 게임 이미지로 사용하지 않습니다. 두 원본의 SHA-256·추출 영역·크기 보정은 추출 보고서에 함께 기록합니다.

새 종족의 뒤 대기는 `sources/monsters-rear-atlas.png`의 2×3 원화입니다. 앞 대기는 새 전투 대기 원화를 공통 발 기준으로 추출합니다. `node scripts/prepare-monster-map-art.cjs`로 신규 6종만 추가하며 이전 앞뒤 대기 이미지 82개와 기존 전투 원화를 바꾸지 않습니다. 원본 86파일 기준 기록에는 카탈로그·캐시 목록 4개도 포함되므로 신규 6종 항목만 제외한 내용의 SHA-256을 함께 비교합니다. [적 적용 범위와 저장 보존](../../MONSTER_ENEMIES_1.99.157.md).
