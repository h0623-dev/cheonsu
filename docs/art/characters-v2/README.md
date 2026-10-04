# 전투·대화 새 시안 원화

2026-10-03 사용자가 카일·브람·리나 비교 시안의 전투·대화 모습을 승인하고 전체 41종에 적용하도록 요청했습니다. 원화는 image_gen으로 기존 인물 정체성과 승인 시안을 참조하여 만들었습니다. 기존 대기 이미지는 적용 범위에서 제외합니다.

`sources/{id}.png`는 전진 a/b·준비·타격·전투 대기·피격·기술 a/b·대화의 3×3 투명 원화입니다. `prompts/{id}.txt`에 제작 지시를, `extraction-report.json`에 원본 SHA-256·영역·발 정렬을 기록합니다. 실제 게임 이미지는 `public/art/characters-v2`입니다.

재추출: `node scripts/prepare-character-redesign.cjs`. 한 인물만 확인: `node scripts/prepare-character-redesign.cjs --only=hero`.

대기 원본 86개 파일의 SHA-256은 `idle-baseline.json`입니다. [전체 변경 및 검증](../../CHARACTER_REDESIGN_1.99.155.md).
