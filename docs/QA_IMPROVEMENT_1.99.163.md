# 천수 1.99.163 QA 개선·검증 범위

Android versionCode는 362입니다. 50장 확장과 새 아군·적·최상위 전직을 실제 게임에 연결했고, 발행 메타데이터 복구 후 로컬 단위 검사 779건과 중복을 제거한 44개 검사 계열의 완료 증거를 확보했습니다. 최종 게임 소스에서 새로 실행한 계열은 8개이며, 입력이 변하지 않은 범위의 기존 완료 결과 36개를 원래 실행 해시와 함께 보존합니다. 최종 전투 FX 5개 묶음은 총 2,737건을 완료했습니다.

**최신 전체 단위 779건과 최종 Cloud Quality #37·Android #15의 전체 실행 및 각 필수 게임 검사 10개를 통과했습니다. 공개 APK·서명 OTA·소스 ZIP의 실제 다운로드·서명·전체 파일 대조도 PASS입니다.** PR CI35·첫 main CI36의 이전 749건 성공과 첫 Android #14의 안내 항목 제한에 따른 게시 실패는 별도 이력으로 보존합니다.

`qa-final-index-candidate5.json`의 집계는 보존 36개·최종 새 실행 8개입니다. 최종 상태는 `complete:true / partialIndex:false`이며 실제 Actions·공개 검증 증거를 연결했습니다. 각 검사의 실행 해시와 입력 보존 근거를 유지하고 최종 Actions 결과와 공개 산출물 대조를 구분합니다.

## 이번 버전의 실제 구현

- 캠페인은 기존 30장 결말을 보존한 채 50장·9막으로 확장했습니다. 31~50장의 전장 20개와 전투 전후 장면 40개를 해안 침수 유적·백설 고원·지하 공명 공방·별빛 봉인지에 배치했습니다. 50장의 새 최종전은 첫 맹세 수호체 아스테르이며, 첫 클리어 기념 방어구를 연결했습니다.
- 마레·하린·에단·실반은 각각 32·37·42·47장 첫 클리어 후 전용 무기와 함께 합류합니다. 보유 21명·출전 최대 15명을 지원합니다. 기존 17명과 새 4명에게 두 분기씩 총 42개 최상위 전직 외형과 기술을 연결했습니다.
- 신규 몬스터 12종과 지역 보스 4종을 캠페인·전투·도감에 연결했습니다. 실제 전장 지형, 지도첩·기록실, 지역 음악과 30장·50장 최종전 음악도 확장 범위에 포함합니다.
- 기본 외형 67종과 최상위 전직 42종을 합친 등록 외형 109종을 전투 원화·무기·기술 연출의 전체 검사 대상으로 사용합니다. 109종은 보유 아군 수와 다른 수치입니다.

구현 범위의 근거는 `campaign-implementation-report.json`, 실제 생산 앱의 `verify-expansion-50.mjs` 보고서, 최종 원화·전투 보고서입니다. 검토용 기획 시안의 미적용 제안은 구현 완료 근거로 사용하지 않습니다.

## 발견하고 수정한 게임 문제

| 문제 | 최종 변경과 확인 범위 |
| --- | --- |
| 새 지역 BGM 키가 미등록이고 별빛이끼 회복칸이 시작 배치에 허용됨 | 지역 음악을 실제 곡 목록에 매핑하고 배치가 공통 지형 정책으로 회복·마법강화·위험칸을 제외하도록 연결했습니다. 50장 음악 유효성과 새 20장 15인 배치·시작 턴 효과를 검사했습니다. |
| 지역·기록실이 30장 범위에 머물고 전용 무기·50장 장비가 정식 보상에 연결되지 않음 | 50장·9막·새 5장 묶음과 정식 EQUIPMENT·stage.reward.gear를 연결했습니다. 장착 능력치·첫 지급·저장·재도전 중복 금지 검사 증거를 보존합니다. |
| 새 전직 원화에 기본 외형의 무기 좌표를 상속하면 실제 손·무기 끝·마법 초점과 어긋남 | 최종 512px 프레임을 직접 검토한 좌표와 프레임 SHA를 연결했습니다. 새 검토 외형 58종과 앞서 검토한 신규 기본 아군 4종의 좌표를 합한 62종·248프레임의 검토 출처를 보존합니다. 좌표는 수동 근삿값이며 정밀 실측으로 표현하지 않습니다. |
| 야수 조련사의 채찍 접촉에서 몸체 원점 CSS가 덮여 실제 접촉 위치가 틀어짐 | 몸체 원점 규칙의 적용 우선순위를 수정했습니다. 최종 109종 duel 검사 952건의 원래 접촉 오차 단언을 유지해 통과했습니다. 접촉 기준은 3px 이내입니다. |
| 책 원화의 실제 무기 종류가 효과 종류에 의해 덮여 연출 연결 정보가 잘못 표시됨 | `data-kind`에 원화 앵커의 실제 종류를 보존하고 VFX 종류와 구분했습니다. 전체 기술 1,242건을 완료하고 노아 두 전직의 실제 책 초점 부착 화면을 직접 검토했습니다. |
| 390/320px 세로 화면에서 마레 전직의 동료 지원 연출 창 끝이 화면 밖으로 나감 | 600px 이하 세로 화면의 동료 대상 지원에만 두 배우 폭 36%, 좌우 여백 8%를 적용했습니다. 자기 대상 지원·공격·가로·큰 화면을 바꾸지 않았습니다. 같은 생산 장면의 기존 단언으로 실패를 재현하고 수정 후 전체 기술·원화 검사를 다시 완료했습니다. |

최종 수정의 근거는 `manual-anchor-integration.json`, `candidate5-change-scope.json`, `support-clamp-diagnostic/result.json`, `combat-final-qa-candidate5/summary.json`, `combat-final-qa-candidate5/visual-final-book-representatives.json`입니다. 가려진 손·창 그립 등 원화의 제한은 해당 검토 연결 정보에 남겼습니다.

캠페인 연결 수정의 범위는 `campaign-implementation-report.json`과 `campaign-tests.log`의 82건, `campaign-app-integration-tests.log`의 75건에 기록했습니다. 이 대상별 수치는 최신 전체 단위 779건에 별도로 더하지 않습니다.

## 검사 코드의 교정

게임 변경과 검사 코드 변경을 구분했습니다. 통과를 위해 원래 단언이나 전체 대상 수를 줄이지 않았습니다.

- 타격 효과 검사가 하린의 첫 기술인 회복을 공격으로 선택하던 별도 검사 장면 오류를 고쳤습니다. 실제 공격 기술 `linked-fist`를 선택하고 공격 종류를 확인합니다. 두 화면 모두 접촉 3회와 매 접촉 입자 12개를 확인했으며, 원래 22건의 접촉·입자·축소 모션·정리 단언을 유지했습니다. 회복 기술은 전체 기술 검사에 계속 포함합니다.
- 가상 시계를 멈춘 모션 검사에서 OS의 동작 줄이기 변경 이벤트가 React에 반영되기 전에 검사하던 준비 상태 경쟁을 고쳤습니다. 요청한 화면·환경 설정 조건과 루트 클래스가 일치할 때까지 제한된 실제 대기를 적용하고, 그 뒤 원래 애니메이션 0개·준비 자세 불투명도·포즈·화면 맞춤 단언을 실행합니다. 원래 13종×4화면=52건과 스크린샷을 유지했습니다. 애니메이션이 0개가 될 때까지 기다려 결과를 숨기는 방식은 사용하지 않았습니다.
- 이미 제거된 공격 확인 버튼 클릭과 예전 세로 일러스트 마스크 기대값은 현재 제품 동작에 맞게 교정했습니다. 실제 대상 클릭·승리 자동 저장과 타일 지형 검사를 보존했습니다.

초기 실패 보고서와 재시도 결과를 함께 보존했습니다. Chromium crash, 중지된 서버로 인한 timeout, 중단된 일부 범위는 게임 결함이나 완료 PASS로 바꾸어 기록하지 않았습니다.

## 발행 메타데이터 문제와 복구

첫 Android #14는 게임 QA·APK 서명·서명 OTA와 파일 대조를 통과했지만, 게시 스크립트 `scripts/publish-update.mjs:15`에서 앱의 패치 안내 검증에 실패했습니다. 안내 10항목이 기존 앱의 최대 8항목 제한을 초과한 문제입니다. 첫 실패 직후에는 공개 v1.99.163이 없었고 채널이 1.99.162를 유지했음을 확인했습니다. 산출물 업로드를 공개 발행 성공으로 세지 않습니다.

기존 안내 내용을 유지해 8항목으로 합치고, 버전·항목 개수 1~8·각 문자열 최대 400자를 검사하는 공통 함수를 추가했습니다. 두 발행 진입점에서 네트워크·신뢰 설정·서명키·빌드 의존 입력에 접근하기 전에 이 사전 검사를 실행합니다. 최종 서명 안내도 저장 전에 앱의 기존 `verifyPatchManifest`로 검증합니다. 앱의 검증 제한과 서명·주소·용량·네이티브 신뢰 검사는 그대로 유지합니다.

새 단위 30건은 실제 8항목 안내의 임시 RSA 서명과 기존 앱 검증기 연결, 0/9항목·401자·잘못된 자료형·버전 불일치, 변조 서명·잘못된 주소·용량 경계·네이티브 신뢰 하한, 키·네트워크 접근 전 거부를 확인합니다. 기존 OTA 27건과 함께 대상 57건을 통과했고 최신 전체 단위는 779건입니다. PowerShell의 기존 APK 검증에는 전체 파일 크기·SHA-256 JSON 출력만 추가했습니다.

`release-recovery-source-guard.json`은 최종 main `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`이 변경 사항 없는 상태이며, 게임 src/public·웹 해시·네이티브 구조 지문은 바뀌지 않았음을 기록합니다. 같은 게임 입력에 연결된 44개 검사 계열과 FX 2,737건은 그 실행 범위를 보존하고, 새 메타데이터 단위 30건을 브라우저 검사 계열 수에 더하지 않습니다. 실패·복구 근거는 `main-actions-163-attempt1-proof.json`과 `/workspace/work/release-notes-fix/summary.json`입니다.

## 유효한 검증 범위

| 구분 | 완료 증거 | 범위와 해석 |
| --- | --- | --- |
| 최신 단위 검사 | 779 통과, 실패·취소·건너뜀 0 | 로컬 `final-tests-release-recovery.log`: 기존 749건 + 새 메타데이터 30건. 최신 전체 린트도 통과. `final-unit-test-ci-163-proof.json`은 최종 f0c의 Cloud #37·Android #15 실제 npm test 로그가 각각 779/779·실패/취소/건너뜀 0임을 단계 시각과 대조한 별도 증거 |
| 발행 메타데이터·기존 OTA 대상 검사 | 57 통과 | `/workspace/work/release-notes-fix/tests.log`: 새 30건 + 기존 OTA 27건. 전체 779건에 중복 합산하지 않음 |
| 이전 PR/main CI 단위 검사 | 749건 기준 전체 성공 | PR CI35 커밋 `99258be8a61eed136e972c0604ce2fb3300f7913`와 첫 main CI36 커밋 `c0f264b497cb4275b7872d810722034ae31c9843`의 실제 완료 결과. 최신 CI37 결과와 구분 |
| 고유 검사 계열 | 총 44개: 보존 36 + 최종 새 실행 8 | 같은 계열의 재실행·검사 실행 도구·복수 화면을 추가 계열로 세지 않습니다. |
| 최종 전투 FX | 5묶음, 2,737건 PASS | 아래 표의 원래 전체 범위를 실행했습니다. 각 보고서의 pageErrors는 빈 배열입니다. |
| 최종 캐릭터 원화 | 109종, 3화면, 1,005장면 PASS | 별도 검사 장면 981장면과 실제 게임 전투 15·대화 9장면. 모든 게임 전투를 사람이 관찰했다는 의미는 아닙니다. |
| 최종 기술 원화 | 88기술, 616장면 PASS | 실제 무기 종류·원화와 기술 연출을 확인한 별도 계열입니다. |
| 최종 정상 흐름 성능 | 390×844, CPU 4배 제한, 8구간 완료 | 시스템 Chromium에서 캠페인·배치·대화·전투 진입·명령·지도 이동을 측정했습니다. frame median 16.7ms, p95 16.8ms, 50ms 초과 1프레임, 최대 long 작업 1,212ms가 기록돼 있습니다. 수치형 FPS 합격 예산이나 Android 실기 인증은 없습니다. |

최종 새 실행 8개 계열은 `verify-skill-spectacle.mjs`, `verify-duel-impact.mjs`, `verify-duel-basics.mjs`, `verify-impact-performance.mjs`, `verify-combat-motion.cjs`, `verify-character-art.mjs`, `verify-skill-presentation.mjs`, `verify-performance.mjs`입니다. `verify-combat-presentation.cjs`가 호출한 duel-basics는 같은 계열로 계산합니다.

| 최종 FX 묶음 | 실제 결과 수 | 주요 범위 |
| --- | ---: | --- |
| `skill-spectacle` | 1,242 | 109종·3화면, 일반 공격·아군 88기술·적 프로필 46종·지원·명중/빗나감·무기 부착·설정 전환·회전/해제 |
| duel-impact | 952 | 109종·4화면, 접촉과 HP/콜백·반격·회피·회복·수호·결정타·취소·축소 모션·정리 |
| combat-presentation / duel-basics | 469 | 기본 외형 67종·5화면, 390px에서 1/2/3배속; 최상위 전직 42종은 별도 전체 109종 검사에 포함 |
| impact-performance | 22 | 11종×2화면, 실제 공격 접촉·입자·화면 효과·크기 변경·축소 모션·해제. 수치형 FPS 검사가 아님 |
| combat-motion | 52 | 13종×4화면, 실제 포즈·무기·화면 맞춤·축소 모션·준비 자세·정리 |
| 합계 | **2,737** | 5개 원래 전체 묶음, 각 exitCode 0 |

근거는 `combat-final-qa-candidate5/summary.json`의 개별 보고서·로그·검사 코드 해시, `art-candidate5-final-summary.json`과 원래 보고서입니다. FX의 295파일 검사 후 소스 보존 확인은 허용된 검사 코드 두 파일 외에 게임 소스가 바뀌지 않았음을 기록합니다. 이 보존 확인에 모든 public/dist 파일이 들어 있다는 주장은 하지 않으며, 해당 파일 보존은 별도 원화·최종 소스 보존 확인에 근거합니다.

## 보존한 결과의 근거

36개 보존 계열은 저장·캠페인·배치·미션·성장·계정·장비·설정·지도·오디오·동작 방향·대화·전장 등 이미 완료한 범위입니다. 각 검사 항목의 원래 실행 후보, 소스 해시, 개별 PASS, 종료 상태와 입력 불변 근거를 `qa-final-index-candidate5.json`에 연결합니다. 전체 실행 결과가 실패였거나 뒤 검사에서 중단된 경우에도 실제 완료한 개별 검사 항목만 보존합니다. 실패·중단 항목을 완료 건수에 넣지 않습니다.

- 후보2의 웹 입력 2,759개 중 최종 후보에서 바뀐 것은 전투 CSS·연출 컴포넌트·무기 앵커 관련 4파일뿐입니다. 나머지 2,755개는 동일합니다. 후보4 이후에는 모바일 동료 지원 CSS 한 파일만 바뀌어 2,758개가 동일합니다. 변경의 영향을 받는 전투·지원·원화 범위는 최종 후보에서 새로 실행했습니다.
- 후보1의 오디오 3개 결과는 최종 후보의 새 실행으로 표시하지 않습니다. `candidate1-audio-source-proof.json`은 후보1 Git 트리의 실제 웹 지문이 당시 빌드 해시와 일치하고, 현재까지 변경된 src 5파일에 오디오 소스·public audio가 없음을 확인한 기록입니다. 앞선 설명 문장만으로 재사용하던 근거를 이 전체 Git 입력 증거로 보강했습니다.
- 원화 검사 15개 작업은 고유 계열 10개에 해당합니다. 장 원화는 50장×5화면에서 배치·도서관·별도 검사 장면 각각 250장면, 지도는 실제 생산 보드 74개, 신규 전투 전후 대화는 40개 고유 장면을 두 화면에서 확인한 범위입니다. 마을 걷기는 동료 21명·고유 프레임 84개를 3화면에서 확인했습니다. 이 수치를 44 계열에 별도로 더하지 않습니다.

최종 게임 웹 소스 해시는 `ab27bdadc3b81fbd7863516d1c597e206ef1fae6c8522fe38e87eec075ead4a3`입니다. `candidate5-final-source-guard.json`에는 이 해시가 소스·dist·Android 복사 메타데이터에 일치하고, 웹 파일 2,622개 대조 불일치가 없으며, Android에만 있는 Cordova 두 파일은 비어 있다고 기록합니다. 네이티브 구조 지문도 기존 `e4a96c16ff95a60f9cf68440c9bf9fd72d5710729264d2464199f400a559dfc6`와 일치합니다. 이 결과는 서명 APK 설치·공개 다운로드 검증을 대신하지 않습니다.

## 저장 호환성과 한계

기존 저장·진행·수집·진행 중 전투와 30장 결말을 보존합니다. 1.99.154 / Android 353, 소스 `801234d1c99d0cdc7c11d645e111f64336e80672`는 지정된 원복 기준으로 유지합니다. 원복 기준 유지와 공개 업데이트 채널 버전 하향은 다른 작업이며, 이번 버전에서 채널을 낮추지 않습니다.

실제 Android 기기에서의 설치·터치·네이티브 플러그인·기기별 성능은 **미검증**입니다. 일부 브라우저 검사는 기록된 모의 네이티브 브리지 모델이나 별도 검사 장면을 사용하며, 이를 실기 검사로 확대하지 않습니다. Google 인증 연결은 미설정이고 실제 Google 로그인·Google Play 계정/제출 검사는 **미완료**입니다. 자동 업데이트의 브라우저 QA는 실제 배포 서명키 대신 시험용 신뢰와 모의 네이티브를 사용한 범위이며, 공개 서명 OTA의 RSA 서명·내용·다운로드 대조는 아래의 별도 증거로 통과했으며 실제 기기 적용은 미검증입니다.

수동 무기 좌표는 최종 원화 SHA에 연결된 근삿값입니다. 준비 자세 대표 화면 직접 검토와 전체 자동 모션 단언을 구분합니다. 성능 보고서의 frame 수치, DOM/animation 수, 정리 확인을 모든 Android 기기의 FPS 보장으로 표현하지 않습니다.

## CI 결과와 공개 배포 증거

게임 구현 커밋은 `4dc766a0b4258a73b0515fd751eedd79ba7e8107`, PR에서 검사한 커밋은 `99258be8a61eed136e972c0604ce2fb3300f7913`입니다. PR #10은 첫 main `c0f264b497cb4275b7872d810722034ae31c9843`으로 병합됐으며, 안내 규격 복구 후 최종 릴리스 소스 커밋은 `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`입니다. `main-source-163-guard.json`과 `release-recovery-source-guard.json`은 각 시점의 변경 사항 없는 상태와 게임 웹/네이티브 입력 보존을 기록합니다.

| 항목 | 최종 상태 | 실제 증거 |
| --- | --- | --- |
| PR Cloud Quality CI35 | **통과 — 이전 749건 기준** | [실행 #35](https://github.com/h0623-dev/cheonsu/actions/runs/37402710192), [검사 작업](https://github.com/h0623-dev/cheonsu/actions/runs/37402710192/job/112073349352), PR 커밋 `99258be8a61eed136e972c0604ce2fb3300f7913`; 전체·필수 10검사 성공 |
| 첫 main Cloud Quality #36 | **통과 — 이전 749건 기준** | [실행 #36](https://github.com/h0623-dev/cheonsu/actions/runs/37404809811), 첫 main 커밋 `c0f264b497cb4275b7872d810722034ae31c9843`; 전체·필수 10검사 성공 |
| 첫 Android APK and OTA #14 | **게시 단계 실패 — 과거 시도** | [실행 #14](https://github.com/h0623-dev/cheonsu/actions/runs/37404809923); 게임 QA·서명·파일 대조 후 안내 10항목이 최대 8항목을 초과해 게시 실패 |
| 최종 main Cloud Quality #37 | **전체 SUCCESS — 최신 779건 기준** | [실행 #37](https://github.com/h0623-dev/cheonsu/actions/runs/37408064489), 커밋 `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`; 전체·필수 10검사 성공 |
| 최종 Android APK and OTA #15 | **전체 SUCCESS — 최신 779건 기준** | [실행 #15](https://github.com/h0623-dev/cheonsu/actions/runs/37408064479), 커밋 `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`; 각 필수 10검사·서명·게시·산출물 업로드·작업 완료 성공 |
| 공개 Release·태그·소스 커밋 | **PASS** | [v1.99.163](https://github.com/h0623-dev/cheonsu/releases/tag/v1.99.163); `2026-10-06T03:46:23Z` 공개; 태그가 `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`을 직접 참조 |
| 공개 APK 1.99.163 / 362 | **PASS** | 실제 다운로드·크기·SHA 일치, Action v1/v2 true·인증서 일치, 웹 2,624개 전체 일치 |
| 공개 서명 OTA | **PASS** | 실제 다운로드·크기·SHA 일치, RSA 안내/번들 서명 검증, 웹 2,622개 전체 일치, Android350~362 |
| 공개 소스 ZIP | **PASS** | 실제 다운로드·크기·SHA 일치, f0c 추적 파일 3,404개 및 명시된 생성 파일 8개 일치 |
| 공개 updates/latest.json | **PASS** | [서명 채널](https://raw.githubusercontent.com/h0623-dev/cheonsu/updates/latest.json); version `1.99.163`, bundleId `1.99.163-c04d31dc1bf9`, OTA SHA·크기·URL·APK URL 일치 |

| 산출물 | 실제 공개 URL | 크기(bytes) | 실제 SHA-256 | 검증 결과 |
| --- | --- | ---: | --- | --- |
| `cheonsu_1.99.163_update_debug.apk` | [다운로드](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.163/cheonsu_1.99.163_update_debug.apk) | 289,042,398 | `fd32cbb7e1c6b8d7640c30bc318e40b0a8b2f4be3276a8efcb76fc16bf1ebf14` | 다운로드·v1/v2 서명·인증서·웹 전체 대조 PASS |
| `cheonsu_1.99.163_ota.zip` | [다운로드](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.163/cheonsu_1.99.163_ota.zip) | 280,937,726 | `c04d31dc1bf94c5f50c6df348fab4d7065ffdbdf70b5f576444f0a28babb5795` | 다운로드·RSA 서명·웹 전체 대조 PASS |
| `cheonsu_development_1.99.163.zip` | [다운로드](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.163/cheonsu_development_1.99.163.zip) | 831,107,546 | `a845a5b4e13f83ce87d41c10fd3175909dad114a2cad897a3ecea678b0224d7f` | 다운로드·발행 커밋의 소스 전체 대조 PASS |

공개 파일 3개를 실제로 다운로드해 GitHub Release의 크기·SHA-256과 대조했으며 모두 일치했습니다. APK에는 Android `1.99.163 / 362`와 최종 웹 소스 해시가 들어 있습니다. APK 웹 파일 2,624개는 Android 동기화 결과와 모두 일치하고, OTA 웹 파일 2,622개는 dist와 모두 일치합니다. APK에만 추가된 `cordova.js`·`cordova_plugins.js`는 빈 생성 파일 2개이며 다른 누락·추가·해시 불일치는 없습니다.

APK 암호 서명은 성공한 Android #15의 `Verify APK and signed OTA payloads` 단계에서 `apksigner`의 v1·v2 모두 true로 확인했습니다. 같은 단계에서 기록한 전체 APK 크기·SHA와 실제 공개 다운로드 파일이 일치합니다. 인증서 SHA-256은 `1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f`입니다. 공개 APK의 인증서 추출과 실제 암호 서명 검증을 별도 근거로 연결합니다. 내장 네이티브 신뢰·다운그레이드 방지·LiveUpdate의 DEX 포함과 MainActivity 직접 등록도 소스/네이티브 대조를 통과했습니다.

공개 [업데이트 채널](https://raw.githubusercontent.com/h0623-dev/cheonsu/updates/latest.json)의 RSA 서명 안내와 OTA 번들 서명을 검증했습니다. 실제 채널 버전은 `1.99.163`, bundleId는 `1.99.163-c04d31dc1bf9`, Android 지원 범위는 `350~362`입니다. 안내의 OTA SHA·크기·주소와 APK 주소는 위 공개 파일과 일치합니다. 안내의 배포 시각 `2026-10-06T03:44:40.222Z`와 Release 공개 시각 `2026-10-06T03:46:23Z`를 구분합니다.

소스 ZIP은 릴리스 소스 커밋 `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`의 발행 시점 스냅샷입니다. Git 추적 파일 3,404개 전체의 내용이 해당 커밋과 일치하고, 명시된 생성 파일 8개도 일치합니다. `SOURCE_MANIFEST.json` 목록은 3,412개이며 그 목록 파일 자체를 포함한 ZIP의 파일 수는 3,413개입니다. 최종 공개 검증 결과를 반영하는 이후 문서 커밋은 이 발행 시점 ZIP에 포함되지 않습니다.

근거는 `/workspace/work/release-1.99.163/`의 `download-verification.json`, `web-artifact-verification.json`, `native-and-source-verification.json`, `public-tag-verification.json`, `publication-verification.json`과 `/workspace/work/expansion-50/main-actions-163-proof.json`입니다. 태그와 공개 파일 대조는 `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`에 연결되며 실제 Android 기기 설치·OTA 적용 검증과는 별도입니다.

## 증거 위치

모든 아래 상대 경로의 기준은 `/workspace/work/expansion-50/`입니다.

- `release-recovery-source-guard.json`, `final-lint-release-recovery.log`, `final-tests-release-recovery.log`: 최종 복구 커밋·게임 입력 불변과 최신 779건·전체 린트 성공.
- `main-actions-163-attempt1-proof.json`: 첫 main CI36 성공과 Android #14의 게시 단계 실패·이전 단계 검증 성공.
- `main-actions-163-proof.json`: 최종 릴리스 커밋의 Cloud #37·Android #15 전체 성공, 필수 검사·최종 APK v1/v2와 크기/SHA 출력의 연결.
- `/workspace/work/release-1.99.163/`의 최종 검증 JSON 4개: 공개 다운로드·웹 전체·네이티브/소스 전체·태그 대조 PASS.
- `/workspace/work/release-notes-fix/summary.json`, `/workspace/work/release-notes-fix/tests.log`: 새 메타데이터 30건과 기존 OTA 27건, 대상 57건 완료.
- `ci-candidate5-result.json`: PR Cloud Quality CI35의 정확한 검사 커밋·전체 성공·필수 10개 성공. CI에서 웹 해시를 독립 추출했다는 주장은 포함하지 않음.
- `main-source-163-guard.json`: PR 병합 후 main 커밋·웹 해시·네이티브 구조 지문 일치와 변경 사항 없는 소스 상태.
- `qa-final-index-candidate5.json`: 44개 고유 계열의 실행 후보·해시·개별 완료·재사용 근거·최종 완료 조건.
- `combat-final-qa-candidate5/summary.json`: 최종 FX 2,737건, 다섯 개 보고서/로그 SHA, 허용된 QA 교정과 검사 후 소스 보존 확인, 실패 보존·정리 상태.
- `art-candidate5-final-summary.json`: 원화 15개 작업/10개 계열과 최종 캐릭터 1,005·기술 616 결과 및 source/dist/QA 보존.
- `candidate5-final-source-guard.json`: 변경 사항 없는 커밋, 최종 웹 소스 해시, dist/Android 복사 대조, 네이티브 구조 지문.
- `candidate5-change-scope.json`, `candidate2-web-inputs.json`, `candidate1-audio-source-proof.json`: 보존 범위의 입력 불변 근거.
- `campaign-implementation-report.json`, `manual-anchor-integration.json`, `final-tests-candidate5.log`: 구현 범위·프레임 검토 출처·단위 검사 실제 집계.
