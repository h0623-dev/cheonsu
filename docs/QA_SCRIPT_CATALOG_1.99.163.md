# 1.99.163 검사 목록

이번 작업은 사용자가 50장 전체 적용과 모든 QA·테스트를 명시적으로 요청하여 수행한다. 아래는 검사 범위이며, 통과 결과는 최종 QA 보고서와 각 실행 로그에서 확인한다. 목록에 있다는 사실만으로 통과를 의미하지 않는다.

## 기본 검사

`npm run lint`, `npm test`, `npm run build`를 최종 소스와 전체 아트가 준비된 뒤 실행한다. 테스트에는 구버전 저장·30장 완료 후 31장 해금·50장 종료·실패 후 진행 차단·새 동료·42종 상위 전직·새 지형·새 몬스터 능력치·실제 접촉 시점 판정을 포함한다.

## 생산 빌드의 필수 검사

Cloud Quality 및 Android APK and OTA의 기존 검사 7개는 `verify-cloud-smoke`, `verify-town-camera`, `verify-monster-enemies`, `verify-skill-spectacle`, `verify-deployment`, `verify-campaign-progression`, `verify-stage-missions`이다. 추가 검사는 `verify-expansion-50`, `verify-character-codex`, `verify-duel-impact`이다. 각 파일 확장자는 `.mjs`이다.

50장 확장 검사는 31~50장 전체 진입, 21명 보유/15명 배치, 구30장 완료 저장 보존, 42개 전직 분기의 실제 선택, 영입·승리 정산, 1칸 미반격/2칸 반격, 새 도감·실제 이미지·모바일 화면을 검사한다. 네 화면에 걸친 전직 선택 72회는 매 선택 후 실제 저장의 능력치·HP·기술·장비·인장·골드를 확인하며, 유료 분기 변경은 동시 중복 입력의 단일 차감도 확인한다. 선택한 전직의 대화 원화는 실제 이야기 재생으로 확인하고, 전장에서는 공유 지도 스프라이트와 기술 메뉴 연결을 확인한다. 전직별 실제 컷신 원화는 별도 전투 연출·원화 전수 검사 결과로 구분한다. 실제 적 AI의 일반 공격과 스킬을 각각 실행해 반격 조건 16회를 확인한다. 공격·반격·영입의 특정 조건은 저장 fixture의 HP·좌표를 명시적으로 설정한 뒤 실제 게임 버튼과 AI로 실행한다. 이를 자연 플레이의 전체 난도 검증으로 표현하지 않는다.

## 기존 기능의 추가 검사

`node scripts/verify-current-qa.mjs --group production`은 임시 생산 서버를 열어 다음 검사를 각각 실행하고 로그·결과 JSON을 `tmp/current-qa`에 남긴 뒤 서버를 종료한다.

| 검사 | 확인 내용 |
| --- | --- |
| verify-player-experience.mjs | 메뉴·동료·이야기 재생·저장 슬롯·새 게임 |
| verify-journey.cjs | 편성·대화·키보드·전투 진입·승리 뒤 이동 경로 |
| verify-account.mjs | 게스트/Google 미설정 안내·법적 안내·저장 보존 |
| verify-armory.mjs | 21명 장비 목록·장착/해제·비교·키보드·작은 화면 |
| verify-village.cjs | 마을 시설·이동·회복·아이템·승리 저장 |
| verify-village-details.cjs | 시설 위치·휴식·저장 공간 오류·자동 저장 재시도 중복 방지 |
| verify-settings-progress.mjs | 네이티브 안전 영역 모형·포커스·50장 해금·복구/원본 보존 |
| verify-navigation-overlap.mjs | 시스템 탐색 영역 모형·명령 터치·이동 취소 |
| verify-audio-lifecycle.cjs | 실제 Web Audio 생성·음악 끄기/켜기·화면 숨김·해제 |
| verify-growth.mjs | 21명 훈련·중복 방지·경험치·전사/대기 동료·방어기 |
| verify-skill-labels.mjs | 21명 실제 스킬 문구·강화 설명 |
| verify-discoveries.cjs | 탐색 발견·보상·새 기술·비전 전직·재방문/재실행 중복 방지 |
| verify-map-pan.mjs | 터치/마우스 전장 이동·pointercancel·저장 보존 |
| verify-offline-production.mjs | 서비스 워커 캐시·오프라인 진입/재시작·음악 72개 디코딩 |
| verify-performance.mjs | Chromium CPU 4배 제한의 진입/명령/전장 이동 측정·브라우저 오류 |
| verify-auto-update.mjs | 자동 패치 UI·진행률·설정·수동 적용·저장 보존, 모의 네이티브 브리지 |

자동 패치 UI 검사는 별도 생산 fixture에 메모리에서 만든 일회성 RSA 공개키만 적용한다. 기존 릴리스 개인키를 읽거나 복사하지 않는다. 실제 APK·OTA의 공개 trust·서명·다운로드 검증은 GitHub Actions와 별도 릴리스 절차에서 수행한다.

`--group development`는 실제 `/src` 모듈을 Web Audio에 연결하는 `verify-score-render`, `verify-orchestra`, `verify-music-transitions`를 실행한다. 게임 소스를 수정하거나 배포하지 않고 임시 Vite 개발 서버를 종료한다. 오케스트라와 악보는 새 지역을 포함한 모든 등록 곡을 실제 OfflineAudioContext에서 렌더링한다.

`--group test-ui`는 임시 Vite 서버에서 기존 `npm run test:ui`를 그대로 실행한다. 진입점은 `verify-combat-patch.cjs`, `verify-combat-motion.cjs`, `verify-battle-controls.cjs`이며, 과거 공격 확인창 절차와 고정 타이밍은 현재의 직접 공격/접촉 계약에 맞춰 갱신한다.

## 원화·전투 연출 검사

원화 묶음은 `verify-character-art`, `verify-chapter-art`, `verify-chapter-maps`, `verify-story-art`, `verify-story-production`, `verify-boss-splash`, `verify-battle-art.cjs`, `verify-facing`, `verify-village-walking`, `verify-skill-presentation`이며 `.cjs`로 표시한 파일 외에는 `.mjs`이다. 새 원화는 기존 47종과 새 기본 20종, 전직 42종을 분리하여 기존 아트 보존과 새 파일 전체 디코딩을 검사한다.

전투 연출은 `verify-duel-basics`, `verify-impact-performance`, `verify-duel-impact`로 준비/접근/접촉/타격/후속 동작·HP 반영 시점·효과 끄기·모션 줄이기·풀 해제를 검사한다. `verify-combat-presentation.cjs`는 `verify-duel-basics.mjs`를 호출하는 기존 호환 진입점이므로 같은 결과로 기록한다.

## 과거 개별 검사와 대체 관계

| 과거 진입점 | 현재 대체 검사 및 이유 |
| --- | --- |
| verify-refinement.cjs | 고정 130% 확대·기존 공격 확인창·과거 오디오 프레임 형식을 전제로 한 개별 패치 검사다. 실제 승리 뒤 3개 경로는 journey, 1회 행동/중복 실행은 battle-controls, 현재 음악/SFX는 score-render·orchestra·audio-lifecycle로 검사한다. |
| verify-movement-hud.cjs | 과거 HUD 문구 `이 4`와 고정 카드 폭을 전제로 한다. 현재 HUD·배율·화면 이동·명령 영역은 battle-controls의 hud-zoom 및 navigation-overlap·map-pan으로 검사한다. |
| verify-release.cjs | 과거 지도 원화 경로와 명령 아이콘 개수를 고정한 1회 릴리스 검사다. 현재 생산 빌드는 cloud-smoke, 이야기 진입은 story-production, 탐색 모달은 discoveries, 명령 배치는 battle-controls·navigation-overlap으로 검사한다. |
| verify-comprehensive-qa.mjs | QA153 당시 기존 검사들을 다시 호출하는 묶음 실행기다. 개별 검사를 현재 목록에서 직접 실행하므로 동일 검사를 중복 호출하지 않는다. |

실제 Android 단말·Google 로그인 제공자·Google Play 계정이 없는 환경에서는 모형 검사와 Chromium 결과만을 명시한다. Android APK 인증서·버전·웹 파일·OTA trust 및 signed OTA는 승인된 main 릴리스 워크플로 결과로 따로 확인한다.
