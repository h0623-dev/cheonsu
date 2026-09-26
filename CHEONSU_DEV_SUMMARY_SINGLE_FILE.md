# 천수 개발현황 통파일

마지막 확인일: 2026-09-26
프로젝트 위치: `C:\Users\user\Desktop\cheonsu`
현재 앱/패키지 버전: `1.99.136` (Android 335)

GitHub: [저장소](https://github.com/h0623-dev/cheonsu), [1.99.136 릴리스](https://github.com/h0623-dev/cheonsu/releases/tag/v1.99.136). 자동 패치 안내는 별도 `updates` 브랜치에서 관리합니다. 이전 파일은 Git 이력에 보존합니다.

최신 산출물: `cheonsu_1.99.136_update_debug.apk`, `cheonsu_development_1.99.136.zip`. 실제 Android 기기 설치와 OTA 복구, 스피커 청음은 미검증.

1.99.136 변경: 최초 한 번 자동 패치 지원 APK를 설치하면 이후 호환되는 게임 패치를 자동 다운로드하고 다음 실행 때 적용합니다. 고정 공개 키로 안내와 ZIP 서명을 검증하며 실행 실패 시 APK 내장 버전 복구/재설치 차단. 전투 중 강제 재시작 없이 기존 저장 유지. 네이티브 변경은 APK 설치 안내. 운영 절차는 `docs/AUTO_UPDATE_1.99.136.md`.

1.99.135 변경: 전투 하단/마을/원정 지도에 저장 버튼, 클리어 즉시 보상·진행·경험치 자동저장. 완료한 장 기준 다음 장 해금, 이전 장 재도전은 경험치만 지급. 마을에서 캐릭터 이동 후 상점/장비점/여관/훈련소 이용, 간단한 구매/장착/휴식. 회복·수호는 수동으로 대상 선택 후 확정, 취소 시 행동/쿨다운 유지. 전투 41종 246개 자세의 실제 이미지 높이와 발 위치를 통일했습니다. 상세: `docs/VILLAGE_PATCH_1.99.135.md`.

이전 APK: `cheonsu_1.99.134_targeting_debug.apk`.

1.99.135 검증: 단위 검사 204/204, 기존 전투 조작 40/40, 새 마을/진행/회복 선택 4개 화면 크기, 저장 실패 후 재시도, 승리 후 이동 9개 흐름, 전투 연출 5개 화면 크기 검사 통과. 최종 APK의 1,077개 웹 파일이 dist와 일치합니다.

1.99.134 변경: 스킬 사거리와 적 위험 범위의 중첩 제거, 타일 경계에 맞춘 표시, 스킬별 사거리 및 광역 피해 범위 통일. 정보 숨김 시 화면 맞춤/확대/축소도 숨기며 배율은 유지. 자동 연계공격과 동료 행동 소모 제거. 반격/광역 스킬/지원 관계 및 기존 저장 유지. 단위 검사 197/197, PC/모바일 3개 크기의 새 회귀 검사 13/13 통과. 상세: `docs/TARGETING_PATCH_1.99.134.md`, `docs/BUILD_1.99.134.md`.

이전 APK: `cheonsu_1.99.133_journey_debug.apk`.

1.99.133 변경: 아군·적·보스의 시작 배치를 지형과 역할에 맞게 분산. 30장 전투 전후 60개 장면, 211개 한국어 대사와 동료 합류 이야기. 대화 인물 표시, 이전 대사, 기록 창, 승리 후 대화와 선택 목적지 연결. 원정 지도·편성·야영지 화면 정리와 전투 명령 아이콘. 시작 시 선택 아군 초점. 새 배치는 신규 전투에 적용하며 기존 전투 저장 좌표는 유지합니다. 자동 테스트 192개, PC/모바일 4개 화면 크기, 전투 조작 10개 검사 통과. 상세: `docs/JOURNEY_PATCH_1.99.133.md`, `docs/BUILD_1.99.133.md`.

이전 APK: `cheonsu_1.99.132_battle_refinement_debug.apk`.

1.99.132 변경: 턴당 공격 1회(공격 스킬/협공 포함), 보스 처치 승리, 작은 승리창과 다음 스테이지/상점/대기실 이동, 보스 전용 5종, 맵/컷신의 아군·적 크기 정규화, 장별 여섯 지형 경로, 반복 BGM 및 공격/이동/스킬 음향. 기본 130%/2배속. 기존 저장의 맵/진행은 유지하며 쓰러진 적이 로드 시 되살아나던 문제도 수정. 자동 테스트 189개 통과. 상세: `docs/BATTLE_REFINEMENT_1.99.132.md`.

이전 APK: `cheonsu_1.99.131_discovery_debug.apk`. 테스트 183개, 탐색/전직과 적 이미지 교체 빌드.

1.99.131 변경: 적 19종의 이미지 152개(전투 모션 114, 맵 19, 초상화 19), 무기별 컷신 동작, 1~10장의 발견 요소 8곳, 비전 기술 4종과 숨겨진 전직 2종. 기존 아군 이동력 +1 및 작은 정보창은 유지합니다. 앞으로 소스/이미지 변경 시 새 APK를 필수 전달합니다.

이전 APK: `cheonsu_1.99.130_movement_hud_debug.apk`. 빌드 및 서명 검증 완료. 테스트 121개와 PC/모바일 화면 검사 통과. 실제 Android 기기 설치는 미검증.

최신 수정: 전투 좌측 상단 정보창의 폭/여백/글자 크기 축소. 모든 아군의 실효 이동력 +1. 저장된 기본 능력치는 유지하므로 기존 저장에도 적용되며 반복 불러오기로 중복 증가하지 않음. 적군 이동력과 지형 비용은 변경 없음.

## 최신 패치 요약

- 전투 캐릭터 36종에 달리기 2자세, 준비, 타격, 후속, 피격의 216개 모션 이미지 적용.
- 근접 보법과 무기 동작, 활 조준/발사, 시전/피격/회피/회복/수호/격파 연출.
- 전투 1/2/3배속. 이동, 행동 대기, 컷씬, 효과 표시 시간을 함께 조절.
- 아군 17명에게 2개씩 총 34개 스킬. 선택창, 개별 쿨다운, 기존 저장 호환.
- 공격/스킬 선택 표시 및 대상 버튼. 패배 창에서 대기실 복귀, 재도전, 캠페인 복귀.
- 아이템 창의 취소/닫기/바깥 영역/Esc 동작 복구. 취소 시 수량과 행동 상태 유지.
- 아군/적군 턴 전환 시 해당 진영으로 카메라 이동. 현재 확대 배율 유지.
- 설정, 정보, 도감, 기록, 전투 설정창의 색상/여백/컨트롤 정리.
- 다른 PC용 소스 ZIP, Node 24 설치 안내, 원클릭 APK 빌드 명령과 수동 CI 구성.
- 118개 자동 테스트 및 1280/390/320px 전투 모션 검사 통과. 최신 상세 검증 기록은 `docs/COMBAT_MOTION_QA.md` 참조. 실제 Android 기기 테스트는 미실시.
- 이전 APK: `cheonsu_1.99.129_battle_motion_debug.apk`. Android 빌드, 버전 328, 서명, 216개 모션 파일 포함 검증 완료.
- 개발 서버 재시작 시 임시 복제본의 React를 중복으로 불러오던 문제 수정.

최신 실행/이관 절차는 [개발 인계 문서](docs/DEVELOPMENT_HANDOFF.md)를 참조하세요. 아래는 기존 기능과 개발 이력의 상세 요약입니다.

이 파일은 게임 "천수"를 이어 개발하기 위한 단일 인수인계 문서입니다.
예전 `handoff_docs` 기준이 아니라, 현재 실제 코드 기준으로 정리했습니다.

## 1. 한눈에 보는 현재 상태

천수는 React + Vite 기반 모바일 세로형 전략 SRPG이며, Capacitor로 Android 앱 패키징까지 준비되어 있습니다.

현재 실제 구현 상태:

- 캠페인 30장 구현: `1장. 국경 초소`부터 `30장. 마지막 천수`까지
- 턴제 전술 전투 구현: 이동, 공격, 스킬, 아이템, 대기, 아군 턴, 적 턴
- 대형 전장 확장, 지형 테마, 전장 배치 로직 구현
- 출전 편성 화면 구현: 최대 15명, 프리셋, 진형 정렬, 전략 리포트, 빠른 슬롯, 원클릭 준비
- 전투 예측 구현: 피해, 명중, 치명, 병과/무기 상성, 지형 전술, 패시브, 협공, 반격, 광역 스킬, 스킬 쿨다운
- 적 AI 타입 구현: `aggressive`, `archer`, `assassin`, `boss`
- 보스 2페이즈, 보스 패턴 경고 타일, 위험 타일 폭발, 증원, 라운드 제한, 승리/패배 연출 구현
- 캠프 구현: 상점, 장비, 제련, 훈련, 파견, 스킬 강화, 전직, 지원 대화, 저장
- 성장/메타 구현: EXP, 레벨업, 동료 합류, 장비 강화, 마스터리, 업적, 도전 과제, 일일 접속, 시즌 보상
- 저장 구현: 현재 저장, 자동 백업, 이전 백업, 수동 슬롯, 내보내기/가져오기, 저장 점검, 복구
- PWA/설치/업데이트 화면과 Android APK 패키징 구현
- QA, 오류 기록, 출시 준비도, 런칭 체크리스트, 출시 후 점검, 갤러리, 프로필, 도감, 명예의 전당, 플레이테스트 분석 화면 구현

검증:

```bash
npm.cmd run build
```

결과: 2026-09-16 기준 성공.

빌드 산출물:

- `dist/index.html`
- `dist/assets/index-DenLSs2M.js` 약 728 KB
- `dist/assets/index-qImeILNe.css` 약 795 KB

주의: Vite가 번들 크기 경고를 냅니다. 현재는 앱이 커서 생기는 구조적 경고이며, 당장 빌드 실패는 아닙니다.

## 2. 실행 방법

개발 실행:

```bash
npm install
npm run dev
```

보통 접속 주소:

```text
http://localhost:5173/
```

웹 빌드:

```bash
npm run build
```

Android 동기화:

```bash
npm run android:sync
```

디버그 APK 생성:

```bash
npm run android:apk
```

현재 루트에 존재하는 APK:

```text
cheonsu_v199127_debug.apk
```

현재 루트에 존재하는 Android 패키지 zip:

```text
cheonsu_v199127_android_apk.zip
```

## 3. 기술 스택

- React `19.2.6`
- Vite `8.0.12`가 package.json에 기록되어 있고, 실제 빌드 출력은 Vite `8.0.14`
- Capacitor `7.0.0`
- Android appId: `com.cheonsu.game`
- Android versionName: `1.99.127`
- Android versionCode: `326`
- minSdk: `23`
- targetSdk: `35`

주요 npm 스크립트:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run android:sync`
- `npm run android:apk`

## 4. 핵심 파일 지도

앱 본체:

- `src/App.jsx`: 메인 게임 앱, 화면 전환, 전투 진행, UI, 메타 시스템 대부분
- `src/index.css`: 전체 화면과 전투 연출 스타일
- `src/main.jsx`: React 진입점
- `src/index.html`: 앱 HTML 셸

데이터:

- `src/data/stages.js`: 실제 30장 스테이지 데이터
- `src/data/storyScenes.js`: 30장 전체 인트로/클리어 스토리
- `src/data/equipment.js`: 장비 9종과 기본 장비 인벤토리
- `src/data/statuses.js`: 상태이상 표시 데이터
- `src/data/supports.js`: 지원 대화 페어와 C/B/A 대화
- `src/data/gameData.js`: 예전 통합 데이터로 보이며 현재 핵심 import 기준은 아님

현재 `App.jsx`가 사용하는 엔진:

- `src/engine/movement.js`: 맵 범위, 지형 이동 비용, 이동 범위, 공격 범위, 경로 찾기
- `src/engine/combat.js`: 피해, 명중, 치명, 상성, 보스 페이즈, 위험 타일
- `src/engine/enemyAI.js`: 적 AI 타겟팅과 이동
- `src/engine/statusEngine.js`: 흑염, 혈상, 방어감소, 빙결, 지형 효과
- `src/engine/partyEngine.js`: 파티 생성, 장비 스탯, 스테이지 투입, EXP
- `src/engine/saveEngine.js`: 저장 데이터 정규화와 마이그레이션
- `src/engine/supportEngine.js`: 지원 랭크 계산
- `src/engine/stageRules.js`: 스테이지 라운드 제한
- `src/engine/updateEngine.js`: 업데이트 매니페스트와 버전 비교
- `src/engine/runtime.js`: Capacitor 런타임 감지

건드릴 때 주의할 파일:

- `src/engine/battleEngine.js`: 오래된 통합 전투 엔진 후보. 현재 `App.jsx`는 직접 import하지 않습니다.
- `src/data/gameData.js`: 오래된 통합 데이터 후보. 현재는 분리된 data 파일들이 주로 쓰입니다.
- `handoff_docs/*`: 원래 기획 파악에는 좋지만 실제 구현 상태는 오래되었습니다.

## 5. 캠페인 구현 상태

현재 `src/data/stages.js` 기준 30개 스테이지가 있습니다.

1. `1장. 국경 초소`
2. `2장. 협곡 매복`
3. `3장. 성문 돌파`
4. `4장. 불타는 숲`
5. `5장. 무너진 요새`
6. `6장. 얼어붙은 계곡`
7. `7장. 그림자 숲`
8. `8장. 붉은 여울`
9. `9장. 폐허의 시장`
10. `10장. 흑야의 탑`
11. `11장. 불길한 항구`
12. `12장. 재의 왕좌`
13. `13장. 암살자의 골목`
14. `14장. 저주받은 사원`
15. `15장. 달 없는 협곡`
16. `16장. 사슬 감옥`
17. `17장. 그림자 성벽`
18. `18장. 밤의 집행자`
19. `19장. 옛 천수의 묘`
20. `20장. 무너진 왕도`
21. `21장. 심연의 도서관`
22. `22장. 검은 기도실`
23. `23장. 황혼의 다리`
24. `24장. 흑야의 심장`
25. `25장. 끝없는 계단`
26. `26장. 붉은 달의 성소`
27. `27장. 천공 관문`
28. `28장. 잊힌 수호자`
29. `29장. 파멸의 평원`
30. `30장. 마지막 천수`

`src/data/storyScenes.js`에도 30장 전체의 인트로/클리어 대사가 있습니다.

현재 테스트 플래그:

```js
const PLAYTEST_UNLOCK_ALL_STAGES = true;
```

이 설정 때문에 모든 스테이지가 테스트용으로 열립니다. 출시 모드에서는 순차 해금으로 바꿀 필요가 큽니다.

## 6. 파티와 동료 상태

스테이지 데이터에서 확인되는 기본 아군 ID:

- `hero`: 카일
- `bram`: 브람
- `lina`: 리나
- `aria`: 아리아
- `leon`: 레온

다만 `App.jsx`에는 더 큰 확장 로스터의 시각 자료, 패시브, 합류 로직이 들어 있습니다.

확장 로스터 후보:

- 세라
- 노아
- 유나
- 라칸
- 미호
- 테오
- 이레네
- 카즈
- 엘라
- 진
- 루카
- 백호

중요한 현재값:

- `getInitialParty()`는 `hero`, `bram`, `lina`, `aria`로 시작합니다.
- `STAGE_ONE_DEFAULT_DEPLOY_IDS`도 `["hero", "bram", "lina", "aria"]`입니다.
- 스테이지 클리어 후 합류는 `App.jsx`의 `RECRUIT_BY_STAGE`, `createRecruitAlly()` 쪽을 확인해야 합니다.

## 7. 전투 시스템 구현 상태

기본 전투 흐름:

- 아군 선택
- 지형 비용 기반 이동
- 공격, 스킬, 아이템, 대기
- 모든 아군 행동 완료 시 적 턴
- 적 AI 행동
- 다음 라운드
- 적 전멸 시 승리
- 카일 사망 또는 라운드 제한 초과 시 패배

구현된 전투 요소:

- 피해, 명중, 치명 판정
- 빗나감과 치명타
- 병과/무기 상성
- 지형 전술 보정
- 유닛 패시브
- 반격
- 협공
- 광역 스킬 피해
- 회복 스킬
- 수호/방어 스킬
- 스킬 쿨다운
- 전투 아이템
- 상태이상
- 지형 턴 시작 효과
- 보스 2페이즈
- 보스 패턴 위험 타일
- 적 증원
- 스테이지별 라운드 제한
- 자동 전투 위임
- 로그 필터
- 맵 확대/축소
- 전술 시야 모드
- 모바일 전투 패널
- 전투 컷씬, 이펙트, 화면 흔들림, 피해 팝업, 턴 배너

상태이상과 지형:

- `burn`: 지속 피해
- `bleed`: 지속 피해
- `armorBreak`: 방어 감소
- `freeze`: 이동 불가
- 화염 지형: 피해와 흑염
- 빙결 지형: 빙결
- 흑야/룬 지형: 피해와 혈상
- 함정/늪: 피해
- 길, 숲, 언덕, 요새, 성문, 여울, 화염, 빙결, 흑야, 룬, 늪, 이동불가 지형이 이동/시각화에 반영됩니다.

적 AI:

- `aggressive`: 가장 가까운 아군 추적
- `archer`: 거리 유지
- `assassin`: 후방/취약 대상 우선
- `boss`: 낮은 HP 대상과 페이즈 상황 우선

## 8. 캠프와 성장 시스템

캠프에서 가능한 것:

- 파티 확인
- 장비 장착
- 상점
- 훈련
- 파견
- 스킬 강화
- 전직
- 지원 대화
- 저장
- 기록, 도감, 프로필, 갤러리, 명예의 전당, 전략 보관함 이동

성장 시스템:

- 적 처치 EXP
- 100 EXP 레벨업
- 훈련 종류별 성장
- 파견 보상
- Lv.3 이상 전직
- 스킬 강화 최대 5레벨
- 장비 강화 최대 +5
- 장비 스탯 재계산
- 스테이지 마스터리와 보상
- 업적과 도전 과제
- 일일 접속 보상
- 시즌 보상

지원 대화:

- 현재 페어: 카일+리나, 카일+브람, 리나+브람
- 랭크: C 30, B 70, A 120
- 각 페어마다 C/B/A 대화 구현
- 본 대화 상태 저장

## 9. 출전 편성과 전략 시스템

전투 전 바로 진입하지 않고 출전 편성 화면을 거칩니다.

구현된 기능:

- 최대 출전 수 `MAX_DEPLOY_COUNT = 15`
- 역할별 필터와 정렬
- 균형/전열/후열/원거리/지원 등 프리셋
- 진형 정렬
- 자동 보강
- 출전 동료 자동 장비
- 전체 자동 장비
- 원클릭 준비
- 스테이지 브리핑
- 적 요약과 위협도
- 추천 보급 구매 계획
- 스테이지 노트와 태그
- 전략 리포트 생성
- 전략 리포트 보관함
- 즐겨찾기
- 전략 비교
- 빠른 슬롯 1-4
- 전략 슬롯 가져오기/내보내기

## 10. 저장 시스템

현재 저장 키:

```text
cheonsu_v01_save
```

관련 저장 키:

- `cheonsu_v01_auto_backup`
- `cheonsu_v01_previous_backup`
- `cheonsu_v01_manual_slot_1`
- `cheonsu_v01_manual_slot_2`
- `cheonsu_v01_manual_slot_3`

저장 데이터에 포함되는 것:

- 현재 화면과 선택 스테이지
- 파티와 전장 유닛
- 출전 명단
- 턴, 라운드, 모드
- 인벤토리, 전리품, 전투 통계, 유닛 통계, 커리어 통계
- 스테이지 마스터리, 노트, 태그, 전략 보관함, 빠른 슬롯
- 최종 RC/런칭 체크 상태
- 업적/도전 과제
- 프로필 칭호/프레임
- 스냅샷 갤러리
- 일일/시즌 이벤트 데이터
- 장비 인벤토리와 강화 상태
- 골드, 로그, 캠프 메시지
- 클리어/해금 스테이지
- 보스 위험 타일
- 지원 포인트와 대화 확인 상태
- 훈련/파견 사용 여부

`normalizeSaveData()`가 오래된 저장이나 필드 누락 저장을 복구하므로, 저장 구조를 바꿀 때는 반드시 이 파일을 같이 살펴봐야 합니다.

## 11. 에셋 상태

현재 파일 수:

- `public`: 341개
- `public/sprites`: 195개
- `public/maps`: 90개

중요 폴더:

- `public/maps`
- `public/maps/classic`
- `public/maps/concept`
- `public/sprites`
- `public/sprites/map_units`
- `public/sprites/sd_units`
- `public/sprites/enemies`
- `public/sprites/generated_allies`
- `public/sprites/classic`
- `public/portraits`
- `public/ui`
- `public/icons`
- `public/art`
- `public/promo`

## 12. Android, PWA, 업데이트 상태

Capacitor:

- `capacitor.config.json` 설정 완료
- appId: `com.cheonsu.game`
- appName: `천수`
- webDir: `dist`
- Android 프로젝트는 `android/`에 존재
- 루트에 디버그 APK 존재

업데이트 매니페스트:

- `public/updates/latest.json` 버전은 `1.99.127`
- `versionCode`는 `326`
- `apkFileName`은 `cheonsu_v199127_android_apk.zip`
- `apkUrl`은 비어 있으므로 앱 내 업데이트 다운로드 버튼은 실제 URL을 열 수 없습니다.

PWA:

- `public/manifest.webmanifest` 존재
- `public/service-worker.js`, `public/sw.js` 존재
- 중요 불일치: PWA manifest의 `version`은 `1.99.102`인데, package/save/update/Android는 `1.99.127`입니다.

## 13. 현재 주의점과 정리 후보

이어 개발 전에 알아야 할 가장 큰 주의점:

- `README.md`는 현재 빌드를 `v1.99.1`로 적고 있어 실제와 다릅니다.
- `docs/APP_BUILD_GUIDE.md`는 앱 버전 `1.83`, versionCode `183`을 언급해 실제와 다릅니다.
- `public/manifest.webmanifest` 버전이 `1.99.102`로 남아 있습니다.
- `public/updates/latest.json`에 `apkUrl`이 없습니다.
- `handoff_docs`는 v0.13 전후의 오래된 개발 상태를 설명합니다.
- `src/App.jsx`가 매우 큽니다.
- `src/index.css`도 매우 큽니다.
- `src/data/gameData.js`, `src/engine/battleEngine.js`는 레거시 중복 후보입니다.
- `PLAYTEST_UNLOCK_ALL_STAGES`가 true라서 모든 스테이지가 열립니다.
- 빌드는 통과하지만 번들 크기 경고가 있습니다.

## 14. 추천 다음 작업 순서

1. 버전/문서 정합성 정리
   - README, 앱 빌드 가이드, PWA manifest, 업데이트 매니페스트를 `1.99.127` 기준으로 맞춥니다.

2. 출시/테스트 모드 분리
   - `PLAYTEST_UNLOCK_ALL_STAGES`를 출시에서는 false로 둘지 결정합니다.
   - 디버그 플래그를 별도 설정으로 분리하는 것이 좋습니다.

3. 코드 구조 정리
   - `App.jsx`를 화면/기능 단위로 분리합니다.
   - `index.css`를 기능별로 나누거나 오래된 override를 정리합니다.
   - 미사용이면 `gameData.js`, `battleEngine.js`를 보관/삭제 후보로 분류합니다.

4. 게임플레이 검증
   - 30장 대형 전장 밸런스를 플레이 테스트합니다.
   - 동료 합류 타이밍과 확장 로스터가 실제로 획득 가능한지 확인합니다.
   - 확장 로스터를 쓸 계획이면 지원 대화와 장비 제한도 확장합니다.

5. 출시 준비
   - 실제 APK 다운로드 URL을 넣습니다.
   - 웹/Android 재빌드합니다.
   - 새 게임, 이어하기, 전투, 캠프, 저장/로드, APK 설치를 점검합니다.

## 15. 이어 개발용 프롬프트

다음 개발을 시작할 때 이 문장을 그대로 쓰면 안전합니다.

```text
이 프로젝트는 React + Vite + Capacitor 기반 모바일 세로형 SRPG 게임 "천수"입니다.
먼저 CHEONSU_DEV_SUMMARY_SINGLE_FILE.md를 읽고 실제 현재 구현 상태를 기준으로 작업해 주세요.
현재 버전은 1.99.127이고 npm.cmd run build는 통과합니다.

작업 규칙:
- 기존 저장 데이터 호환성을 깨지 마세요.
- 모바일 세로 UI를 유지하세요.
- 한국어 UI를 유지하세요.
- 한 번에 너무 큰 구조 변경을 하지 마세요.
- 수정 후 npm.cmd run build를 실행해 주세요.
- 오래된 handoff_docs보다 실제 src/App.jsx와 src/data, src/engine 파일을 우선해 주세요.
```

## 16. 다음에 파일을 볼 때 출발점

기능별 시작 파일:

- 전투 동작: `src/App.jsx`, `src/engine/combat.js`, `src/engine/statusEngine.js`, `src/engine/enemyAI.js`, `src/engine/movement.js`
- 스테이지 내용: `src/data/stages.js`, `src/data/storyScenes.js`
- 성장/캠프: `src/App.jsx`, `src/engine/partyEngine.js`, `src/data/equipment.js`, `src/data/supports.js`
- 저장 호환성: `src/engine/saveEngine.js`, 이후 `src/App.jsx`의 저장 state
- UI 스타일: `src/index.css`
- Android 버전: `android/app/build.gradle`, `package.json`, `public/updates/latest.json`, `public/manifest.webmanifest`
- PWA/업데이트: `public/manifest.webmanifest`, `public/sw.js`, `public/service-worker.js`, `src/engine/updateEngine.js`
