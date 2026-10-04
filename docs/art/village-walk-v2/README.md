# 기존 대기 모습의 마을 걷기 원화

기존 map-sprites-v4 정면과 directions-v1 후면을 실제 참조하여 아군 17명의 걷기만 생성합니다. 새 전투 의상으로 기존 대기 모습을 바꾸지 않습니다.

각 `sources/{id}.png`는 front-a/front-b/back-a/back-b 순서의 2×2 투명 원화입니다. `prompts/{id}.txt`는 제작 지시, `extraction-report.json`은 SHA-256·추출·배치 결과입니다. 두 개 프레임을 교대로 표시하며 이동이 끝나면 원래 대기로 돌아갑니다.

재추출: `node scripts/prepare-character-redesign.cjs --walk`. 실제 게임 파일은 `public/art/village-walk-v2`에 있습니다.

라칸은 같은 의상·카메라의 승인 원화 두 장에서 정면(`rakan.png`)과 후면(`rakan-back.png`)을 각각 추출합니다. 후면 보정 원본의 SHA-256과 영역은 추출 보고서의 `corrections`에 별도 기록합니다.
