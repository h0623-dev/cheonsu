# 천수 개발 인계

## 현재 상태

- 버전 1.99.136, Android 335, 패키지 com.cheonsu.game.
- GitHub 서명 자동 패치와 APK 배포: `AUTO_UPDATE_1.99.136.md`. 개인 서명 키는 소스 ZIP에 없으며 다른 PC 배포 시 별도로 안전하게 전달해야 합니다.
- 마을 이동/시설, 눈에 띄는 저장 버튼과 클리어 즉시 자동저장, 순차 해금/경험치용 재도전, 보조 마법 수동 대상 선택. 상세: `VILLAGE_PATCH_1.99.135.md`.
- 전투 41종 246개 자세의 알파 경계와 발 기준 보정은 `combatFrameMetrics.json`, 재생성은 `node scripts/measure-combat-frames.mjs`입니다.
- 스킬 사거리/광역 표시와 정보 숨김의 줌 컨트롤을 수정했습니다. 자동 연계공격은 제거했습니다. 상세: `TARGETING_PATCH_1.99.134.md`.
- 시작 배치는 `src/engine/formations.js`에서 지형·역할에 맞게 분산합니다. 진행 중 저장에는 다시 배치하지 않습니다.
- 30장 이야기 60개 장면은 `src/data/storyScenes.js`, 대화 UI는 `StoryScene.jsx`, 주요 화면 스타일은 `journey-ui.css`입니다. 승리창에서 선택한 목적지는 전투 후 대화까지 유지합니다.
- 공격/스킬은 같은 행동 1회를 사용. 자동 협공은 없음. 적 턴 반격도 유닛당 1회. 보스 격파 승리와 작은 승리창의 다음 스테이지/상점/대기실 이동.
- 보스 전용 5종과 맵 41종의 크기/발 위치 정규화, 전투 캐릭터 크기 보정. 여섯 경로 유형을 ACT별 지형에 적용.
- 기본 130%/2배속, 전장/대기실/월드 반복 BGM과 이동/공격/스킬 음향. 상세: `BATTLE_REFINEMENT_1.99.132.md`.
- 30개 캠페인, 이동/공격/스킬/반격/상태이상/아이템/보스 패턴.
- 캠프, 성장, 장비, 지원 관계, 도감, 기록, 저장/백업, PWA 및 Android 프로젝트.
- 맵은 실제 타일 데이터를 그리며, 기존 이동 규칙과 저장 데이터 구조를 유지합니다.
- 전투 그래픽은 아군 17종, 적군 19종의 6가지 동작, 총 216개 모션 이미지와 효과 16종입니다.
- 달리기 2자세, 공격 준비, 타격, 후속 자세, 피격을 순서대로 표시합니다. 2D 프레임 애니메이션이며 다관절 스켈레톤 애니메이션은 아닙니다.
- 전투 중 1/2/3배속, 공격 대상 피드백, 패배 후 무보상 대기실 복귀를 지원합니다.
- 캐릭터별 2개 스킬, 총 34개. 재사용 대기시간은 스킬마다 별도로 저장됩니다.

## 새 PC 준비

1. Node.js 24 설치. macOS/Linux에서 nvm을 사용하면 `nvm install`과 `nvm use`를 실행합니다.
2. `cheonsu_development_1.99.136.zip`을 원하는 폴더에 풉니다.
3. 내부 `cheonsu` 폴더에서 `npm ci`, `npm run setup`, `npm run dev`를 실행합니다.
4. Vite가 출력하는 로컬 주소를 엽니다. 사용 중인 포트가 있으면 다른 포트를 사용합니다.

첫 의존성 설치와 Android 도구 설치에는 인터넷 연결이 필요합니다. 작업에 필요한 이미지, 소스, 생성 원본은 ZIP 안에 있습니다. Codex 전용 경로나 외부 이미지 URL에 의존하지 않습니다.

## Git으로 PC 간 이동

저장소 원격 주소는 `https://github.com/h0623-dev/cheonsu.git`입니다. 1.99.136 소스는 `main`, 배포 파일은 `v1.99.136` 릴리스, 자동 패치 안내는 `updates` 브랜치에서 관리합니다. 기존 게임 개선도 모두 포함합니다.

```sh
git clone https://github.com/h0623-dev/cheonsu.git
cd cheonsu
npm ci
npm run setup
npm run dev
```

앞으로 변경을 동기화하려면 현재 PC에서 `git status`와 변경 목록을 확인하고, 본인이 공유할 파일을 커밋한 뒤 푸시하세요. 이미지가 들어 있는 `public/art`, `docs/art`, 새 스크립트와 `package-lock.json`도 포함해야 합니다. 다음 PC에서는 해당 브랜치를 복제/풀한 후 `npm ci`를 실행합니다. Windows GitHub Desktop으로 같은 절차를 진행해도 됩니다.

APK, node_modules, 빌드 캐시, 개인 SDK 경로, 환경 변수 파일과 서명키는 커밋 대상이 아닙니다. 서로 다른 PC에서 같은 파일을 동시에 수정하면 충돌을 검토하고 병합하세요.

## APK 만들기

1. Android Studio와 SDK Platform 35, Build Tools 35.0.0을 설치합니다.
2. JDK 21 이상을 준비합니다. 일반적인 Android Studio 설치의 내장 JBR 경로는 자동 탐색합니다. 다른 위치면 `JAVA_HOME`을 지정하세요.
3. SDK 경로가 기본 위치가 아니면 `ANDROID_HOME`을 지정하세요.
4. `npm run android:apk`를 실행합니다. 로컬 SDK 경로 파일은 자동 생성됩니다.
5. `android/app/build/outputs/apk/debug/app-debug.apk`를 확인합니다.

이 APK는 테스트용 디버그 서명입니다. 다른 PC나 GitHub 빌드는 다른 디버그 키로 서명될 수 있어 기존 설치 위 업데이트가 실패할 수 있습니다. 삭제/재설치 전에 게임 설정의 저장 내보내기로 진행 상황을 백업하세요. 정식 배포는 별도 릴리스 서명키와 스토어 검토가 필요합니다. 서명키는 이 ZIP에 포함하지 않습니다.

`.github/workflows/android-debug.yml`은 수동 실행 전용입니다. 원격에 반영한 후 GitHub Actions의 Android Debug APK에서 Run workflow를 실행하면 APK 아티팩트를 받을 수 있습니다. 이 작업에서 원격 워크플로를 실제 실행하지는 않았습니다.

## 저장 데이터 이동

소스 동기화는 플레이 저장을 동기화하지 않습니다. 설정의 저장 내보내기/가져오기를 사용하세요. 브라우저 로컬 저장과 APK 내부 저장도 서로 별개입니다. 기존 단일 `skillCooldown` 저장값은 첫 번째 스킬로 읽고, 새 `skillCooldowns` 맵으로 이전합니다. 새 맵이 있으면 0을 포함한 맵 값을 우선합니다.

## 소스 위치

| 위치 | 역할 |
| --- | --- |
| src/App.jsx | 게임 상태, 화면, 전투 진행 |
| src/engine | 이동, 전투, 저장, 턴 카메라 등 규칙 |
| src/data | 스테이지, 장비, 상태, 아트 매핑 |
| src/components/CombatScene.jsx | 전투 포즈, HP, 연출 |
| src/components/ItemDialog.jsx | 최상위 아이템 창과 닫기 동작 |
| src/components/SkillDialog.jsx, DefeatDialog.jsx | 두 스킬 선택, 패배 복귀 창 |
| src/data/skills.js | 34개 스킬, 개별 쿨다운, 지원 스킬 |
| src/engine/battleSpeed.js | 1/2/3배속 공통 시간 계산 |
| src/combat-scene.css | 전투 타임라인과 반응형 배치 |
| src/battle-controls.css | 명령 피드백, 배속, 새 창 스타일 |
| src/interface-theme.css | 설정/정보/아이템 창 테마 |
| src/world-art.css, src/battle-art.css | 맵과 캐릭터 발 위치/크기 |
| public/art/world-v2 | 맵, 캐릭터, 초상화, 배경 |
| public/art/combat-v1 | 72개 전투 포즈, 16개 이펙트 |
| public/art/combat-v2 | 실제 자세 변화가 있는 216개 모션 이미지 |
| docs/art | 생성 원본, 프롬프트, 미술 기준 |
| android | Capacitor Android 앱 프로젝트 |

기존 index.css에는 누적된 스타일이 많습니다. 새 화면의 수정은 해당 컴포넌트와 마지막에 불러오는 전용 CSS에 좁게 적용하세요. 이전 사용자 변경을 일괄 초기화하지 마세요.

## 검사

`npm test`는 30개 맵의 지형 정합, 자산 존재/투명도/프레임 구별, 카메라 계산, 스킬 효과/쿨다운, 배속 계산을 검사합니다.

UI 검사는 개발 서버를 켜고 실행합니다.

```sh
npm run dev -- --port 5176
npm run test:ui
```

Windows에서는 Edge를 사용합니다. macOS/Linux에서는 먼저 `npx playwright install chromium`을 실행하세요. 다른 포트면 `GAME_URL` 환경 변수로 주소를 지정하세요. 테스트는 격리된 브라우저 컨텍스트를 사용하며 실제 플레이 저장에 접근하지 않습니다. 테스트 샘플 화면은 `tests/fixtures`에 있고 프로덕션 빌드 진입점이 아닙니다.

`node scripts/verify-battle-art.cjs 1`은 기존 맵 이동과 저장/복원을 추가 검사합니다. 이미지와 결과는 `tmp`에 저장되며 Git과 개발 ZIP에서 제외됩니다.

전투 효과 재추출: `npm run art:combat`. 새 모션 재추출: `npm run art:motion`. 원본 PNG를 편집하지 않고 투명 연결 영역을 분리해 WebP를 출력합니다. 이미 생성된 WebP가 동봉되어 있으므로 평소에는 재추출할 필요가 없습니다.

## 검증 범위와 주의

- 웹 빌드와 자동 테스트, Android debug 조립을 수행합니다. 실제 Android 기기 터치/성능 테스트는 별도입니다.
- 이 패치는 기존 엔진의 전체 린트/의존성 보안 문제를 정리하는 작업이 아닙니다. 의존성 설치 시 보고되는 audit 항목은 별도 검토가 필요합니다.
- 원격 동기화와 자동 저장 클라우드는 활성화되어 있지 않습니다. ZIP 이동 또는 본인 Git 계정으로 커밋/푸시가 필요합니다.
