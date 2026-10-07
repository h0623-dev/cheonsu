# 보스 전신 원화의 생성 원본 보존

기록일: 2026-10-07 KST. 최초 게임 반영 버전: **1.99.166**.

이 폴더는 보스 등장·각성 장면에 사용한 전신 원화 5종의 실제 PNG 원본을 보존합니다. 클라우드 `generated_images/`에 남아 있던 생성 도구 출력 파일을 `sources/`로 그대로 복사했습니다. 화면용 `public/art/boss-presence-v1/*.webp`는 다시 생성하거나 변환하지 않았습니다.

| 보스 ID | 생성 출력 파일 | 보존 원본 |
| --- | --- | --- |
| `boss_commander` | `exec-f72f8a74-e43b-445c-a272-1fa69ea1dfb8.png` | [sources/boss_commander.png](sources/boss_commander.png) |
| `boss_frost` | `exec-3a7d9975-8f06-43c9-8151-6a8ad21e1012.png` | [sources/boss_frost.png](sources/boss_frost.png) |
| `boss_ember` | `exec-c7ea34e9-dae6-4dab-951a-29f99ba5d9a3.png` | [sources/boss_ember.png](sources/boss_ember.png) |
| `boss_oracle` | `exec-1977f557-3817-4d94-af24-b2d4df4ae341.png` | [sources/boss_oracle.png](sources/boss_oracle.png) |
| `boss_abyss` | `exec-a4dca782-a153-4dc4-9661-d50926c386d4.png` | [sources/boss_abyss.png](sources/boss_abyss.png) |

구조화한 기록은 [PROVENANCE.json](PROVENANCE.json)에 있습니다. 생성 도구는 내장 `image_gen`입니다. 도구 실행과 출력 ID는 해당 제작 작업의 인수인계 기록에 있으며, PNG 원본은 클라우드 파일로 남아 있었습니다.

## 제작 설명과 원문 기록의 구분

다음은 기존 제작 기록을 정리한 **요약**입니다. 당시 제출한 프롬프트 원문을 복원한 것이 아닙니다.

- 기존 천수 캐릭터의 정체성·장비와 아군의 채색·선·비율을 참고하여 전신 원화를 제작했습니다.
- 등장 장면에서 무기와 하체까지 읽히는 구도, 투명 배경, 서로 다른 보스 계열의 실루엣을 사용했습니다.
- 게임용 산출물은 원본 알파를 보존한 품질 90 WebP라는 기존 제작 기록을 따릅니다.
- 다른 게임의 공식 설명은 등장 연출 설계에 참고했습니다. 조사 내용과 천수에 적용한 해석은 [보스 연출 조사 문서](../../BOSS_RESEARCH_1.99.166.md)에 나누어 기록되어 있습니다.

이번 보존 작업에서 당시 제출한 전체 프롬프트, 호출별 정확한 참조 이미지 목록, 모델 세부 버전, 정확한 생성 시각은 복구하지 못했습니다. JSON의 해당 항목은 `null`로 남겼으며 새로 추측한 문장을 실제 생성 요청문인 것처럼 적지 않았습니다. `recordedOn`은 이 문서를 작성한 날짜이고 개별 이미지의 생성일을 뜻하지 않습니다.

생성 원본과 제작 이력은 출처를 설명하는 근거입니다. AI 생성 사실만으로 제3자 권리의 비침해나 독점 저작권을 보증하지는 않습니다. 초기 천수 참조 자료의 기록 범위는 [아트 출처 대장](../../legal/ASSET_PROVENANCE.md)을 따릅니다.

사용자 지시에 따라 수정 후 별도 검증은 실행하지 않았습니다.
