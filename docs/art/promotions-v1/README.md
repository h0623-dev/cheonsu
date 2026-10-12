# 전직 외형 원화

일반 전직 21종과 비전 전직 2종의 전투·대화·초상·지도·보행 원화, 최상위 전직 42종의 지도·보행 원화입니다. 캐릭터의 얼굴과 무기 역할을 기존 천수 원화에 맞춰 이미지 생성 도구로 제작했습니다. 기존 기본형 이미지와 최상위 전직의 전투·대화 이미지는 보존합니다.

`sources/`에는 고품질 투명 WebP 원화를 저장합니다. 생성된 PNG 원본은 제작 작업 디렉터리에 보존하고 원본 파일명·SHA-256을 `extraction-report.json`에 기록합니다. 보고서의 경계·크기·발 기준선은 게임 산출물을 만드는 과정에서 수집한 제작 정보입니다. 별도로 게임 QA를 실행했다는 의미가 아닙니다.

`generation-record.json`에는 각 제작 그룹의 참조 원화·생성 원본·교정 이력을 취합했습니다. 프롬프트 원문이 보존된 항목과 생성 지시 요약만 남은 항목을 구분합니다.

## 일반·비전 전직 원화

`<캐릭터>__promoted.webp`, `hero__dawnblade.webp`, `bram__oathwarden.webp`는 4열 4행입니다. 왼쪽 위부터 행 우선 순서로 다음 16개 원화를 담습니다.

1. 달리기 A / 달리기 B / 공격 준비 / 타격
2. 전투 대기 / 피격 / 스킬 A / 스킬 B
3. 대화 흉상 / 지도 앞 대기 / 지도 뒤 대기 / 앞 걷기 A
4. 앞 걷기 B / 뒤 걷기 A / 뒤 걷기 B / 초상

```sh
node scripts/prepare-promotion-art.cjs --only=hero__promoted --source=/workspace/work/promotion171/hero__promoted.png
```

저장한 원화에서 다시 제작할 때는 `--source`를 생략합니다. 전투는 512×512에 발 기준 480, 지도 앞뒤는 256×256에 발 기준 240, 보행은 384×480에 발 기준 448입니다. 전투 8자세와 각 방향 보행 A/B는 공통 크기를 사용합니다.

## 최상위 전직 지도·보행 원화

`<캐릭터>__advanced-map.webp`는 4열 3행입니다. 행 우선 순서로 0~5번은 첫 분기, 6~11번은 두 번째 분기의 **앞 대기 / 뒤 대기 / 앞 걷기 A / 앞 걷기 B / 뒤 걷기 A / 뒤 걷기 B**입니다. 따라서 두 번째 분기는 두 번째 행의 세 번째 칸에서 시작합니다.

```sh
node scripts/prepare-promotion-art.cjs --advanced-map=hero --source=/workspace/work/promotion171/hero__advanced-map.png
```

캐릭터 키는 게임의 `sylvan` 철자를 사용합니다. 기존 최상위 전투 파일의 `silvan` 철자와 혼동하지 않습니다. 결과는 `public/art/promotions-v1/manifest.json`에서 기존 전투·대화 원화에 지도·후면·보행만 덧붙이는 구조입니다.

## 교정 원화와 무기 기준점

한 자세를 다시 그렸다면 `<원화키>-<자세>-correction.webp`를 1×1 투명 원화로 보존합니다. 예를 들어 `hero__promoted-windup-correction.webp`, `hero__advanced-map-form0-map-correction.webp`입니다. 제작기는 원본의 누락·붙음·잘림을 빈 이미지나 복제 자세로 숨기지 않고, 실제 교정 원화로만 대체합니다.

교정 PNG를 직접 전달할 때는 `--correction=windup:/workspace/work/promotion171/교정원화.png`를 추가합니다. 최상위 지도 원화는 `--correction=form0-map:/workspace/work/promotion171/교정원화.png`처럼 분기와 자세를 함께 지정합니다. 여러 자세를 교정할 때는 `--correction` 인수를 반복합니다.

`<원화키>-anchors.json`을 추가하면 최종 전투 프레임 512×512 기준의 무기 좌표를 해당 캐릭터 항목에 넣습니다. 원화를 다시 그려 크기나 배치를 바꾼 경우 이 좌표도 새 프레임에 맞춰야 합니다.

이미지 제작 후 작성한 부착점은 `node scripts/prepare-promotion-art.cjs --anchors-only`로 등록합니다. 이 명령은 이미지를 다시 만들지 않고 저장된 좌표만 목록에 반영합니다.

`manifest.json`, `precache.js`, `extraction-report.json`은 제작기가 잠금을 사용해 갱신합니다. Android 서비스 워커는 신규 목록을 포함하고 Safari는 기존의 제한된 용량 내 요청별 캐시 방식을 유지합니다.
