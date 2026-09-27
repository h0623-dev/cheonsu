# 1~30장 환경 원화

제작 방식: 내장 `image_gen` (built-in). 외부 API/CLI는 사용하지 않았습니다.

이전 보고서의 "신규 타이틀 1장"은 메인 화면용 그림 한 장을 의미하며, 1스테이지만 개편했다는 뜻이 아닙니다. 이번 1.99.144에서는 모든 장에 개별 환경 원화를 추가했습니다.

- 스타일 참조: `docs/art/journey-v1/title.png`, `public/art/world-v2/units/hero.webp`.
- 최종 프롬프트: `prompts.json`의 `commonPrompt` 뒤에 각 장의 `prompt`를 그대로 이어 붙였습니다. 두 참조 이미지는 화풍 참조이며 인물 삽입용이 아닙니다.
- 보존 원본: 이 폴더의 `chapter-01.png` ~ `chapter-30.png` (1536×1024).
- 게임 원화: `public/art/chapters-v1/chapter-01.webp` ~ `chapter-30.webp` (1536×1024).
- 목록 미리보기: 같은 폴더의 `chapter-01-thumb.webp` ~ `chapter-30-thumb.webp` (480×320).
- `npm run art:chapters`로 원본에서 게임 파일을 다시 인코딩합니다. 원본이 하나라도 없으면 실패합니다.
- 런타임 파일 60개의 총 크기: 13,777,506바이트. 동시에 30개의 대형 이미지를 디코딩하지 않습니다.
- 원본은 개발 소스 ZIP에 포함하고 APK/OTA에는 압축한 게임 파일만 포함합니다.

## 장별 원화

| 장 | 장소 | 원본 |
| --- | --- | --- |
| 1 | 국경 초소 | [chapter-01.png](chapter-01.png) |
| 2 | 협곡 매복 | [chapter-02.png](chapter-02.png) |
| 3 | 성문 돌파 | [chapter-03.png](chapter-03.png) |
| 4 | 불타는 숲 | [chapter-04.png](chapter-04.png) |
| 5 | 무너진 요새 | [chapter-05.png](chapter-05.png) |
| 6 | 얼어붙은 계곡 | [chapter-06.png](chapter-06.png) |
| 7 | 그림자 숲 | [chapter-07.png](chapter-07.png) |
| 8 | 붉은 여울 | [chapter-08.png](chapter-08.png) |
| 9 | 폐허의 시장 | [chapter-09.png](chapter-09.png) |
| 10 | 흑야의 탑 | [chapter-10.png](chapter-10.png) |
| 11 | 불길한 항구 | [chapter-11.png](chapter-11.png) |
| 12 | 재의 왕좌 | [chapter-12.png](chapter-12.png) |
| 13 | 암살자의 골목 | [chapter-13.png](chapter-13.png) |
| 14 | 저주받은 사원 | [chapter-14.png](chapter-14.png) |
| 15 | 달 없는 협곡 | [chapter-15.png](chapter-15.png) |
| 16 | 사슬 감옥 | [chapter-16.png](chapter-16.png) |
| 17 | 그림자 성벽 | [chapter-17.png](chapter-17.png) |
| 18 | 밤의 집행자 | [chapter-18.png](chapter-18.png) |
| 19 | 옛 천수의 묘 | [chapter-19.png](chapter-19.png) |
| 20 | 무너진 왕도 | [chapter-20.png](chapter-20.png) |
| 21 | 심연의 도서관 | [chapter-21.png](chapter-21.png) |
| 22 | 검은 기도실 | [chapter-22.png](chapter-22.png) |
| 23 | 황혼의 다리 | [chapter-23.png](chapter-23.png) |
| 24 | 흑야의 심장 | [chapter-24.png](chapter-24.png) |
| 25 | 끝없는 계단 | [chapter-25.png](chapter-25.png) |
| 26 | 붉은 달의 성소 | [chapter-26.png](chapter-26.png) |
| 27 | 천공 관문 | [chapter-27.png](chapter-27.png) |
| 28 | 잊힌 수호자 | [chapter-28.png](chapter-28.png) |
| 29 | 파멸의 평원 | [chapter-29.png](chapter-29.png) |
| 30 | 마지막 천수 | [chapter-30.png](chapter-30.png) |
