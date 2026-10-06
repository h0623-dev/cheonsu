# 1.99.163 빌드 및 배포 기록

기록일: **2026-10-06 KST**. 대상은 **1.99.163 / Android versionCode 362**, 앱 ID는 `com.cheonsu.game`입니다.

**최종 게임 구현·로컬 QA와 전체 단위 검사 779건을 완료했습니다. 최종 릴리스 커밋의 Cloud Quality #37·Android 발행 #15는 전체 성공했으며 각 필수 게임 검사 10개도 모두 통과했습니다. 공개 APK·서명 OTA·소스 ZIP의 실제 다운로드·서명·전체 파일 대조도 PASS입니다.** PR CI35와 첫 main CI36의 이전 749건 성공, 첫 Android #14의 게시 실패 기록은 별도 보존합니다.

## 최종 구현

기존 30장 캠페인 뒤에 해안 침수 유적·백설 고원·지하 공명 공방·별빛 봉인지의 20장을 추가했습니다. 원정과 기록실은 9막, 보유 아군은 21명, 출전 상한은 15명입니다. 신규 일반·정예 적 12종, 지역 보스 4종, 아군 마레·하린·에단·실반 4명, 21인 각 2분기의 최상위 전직 42종과 지형 10종을 실제 지도·이야기·보상·기술·음악에 연결했습니다.

32/37/42/47장 첫 승리로 새 동료와 정식 전용 무기를 지급하며, 50장 첫 승리에는 모든 21인이 장착할 수 있는 기념 방어구를 지급합니다. 최상위 전직의 조건·인장 소모 원장·분기 변경 비용·기존 성장과 장비 보존을 연결했습니다. 분기 변경은 HP를 회복하거나 쓰러진 동료를 부활시키지 않습니다. 상세 수치와 42분기는 [확장 명세](CAMPAIGN_EXPANSION_50.md)를 따릅니다.

신규 외형 62종에 8개 동작씩 총 496개 프레임과 대화 초상을 제작하고, 50장 고유 배경·미리보기·전용 지형을 연결했습니다. 전체 시각 캐릭터는 기존 47종·신규 기본 20종·전직 42종을 합한 109종입니다. 기존 17인 기본 대기 이미지와 얼굴·무기 정체성을 보존했습니다.

전투는 돌진·무기 접촉·피격·복귀와 기존 피해·반격 판정을 연결합니다. 새 62종의 준비·타격·기술 2자세, 총 248개 최종 프레임에서 무기와 효과 부착점을 직접 관찰하고 프레임 SHA·자산 별칭과 함께 기록했습니다. 가려진 손은 노출된 창봉 등의 접점을 사용하고 관찰 한계를 명시했으며 정밀 실측이라고 표시하지 않습니다.

## 발견한 문제와 최종 수정

- 새 지역의 유효하지 않은 BGM 키, 별빛이끼의 시작 배치 허용, 30장에 머문 지역·기록실 범위, 미등록 전용 장비와 50장 보상을 실제 데이터·공통 정책에 맞춰 연결했습니다.
- 채찍 회전 중심의 CSS 우선순위 오류를 고쳐 원화 부착점과 실제 접촉 계산을 맞췄습니다. 기본 폼 좌표를 상속해 새 전직 무기와 광채가 어긋나던 자세는 최종 프레임별 관찰 좌표로 교체했습니다.
- 노아의 책을 효과 렌더링 별칭 `focus`로 표시하던 불일치를 수정했습니다. 원화 무기 종류 `book`은 `data-kind`에, 렌더링 별칭은 `data-vfx-kind`에 각각 기록합니다.
- 작은 세로 화면에서 동료 대상 지원 기술의 창끝이 화면 밖으로 나가던 문제를 수정했습니다. 600px 이하 세로 화면의 해당 두 배우를 36% 폭·좌우 8% 여백으로 배치하며, 자기 대상 지원·공격·가로·큰 화면은 기존 구성을 보존합니다.

게임 수정과 검사 도구의 준비 상태·대상 선택 수정은 구분합니다. 기존 접촉·화면 안 배치·동작 줄이기·정리 검사의 기준을 완화하지 않았습니다. 상세 실패와 재현·수정 증거는 [QA 기록](QA_IMPROVEMENT_1.99.163.md)에 정리합니다.

## 완료한 로컬 검사와 증거 범위

| 범위 | 최종 결과 | 증거와 범위 |
| --- | --- | --- |
| 최신 전체 린트·단위 검사 | 통과, 779/779·실패 0 | 로컬 `final-lint-release-recovery.log`, `final-tests-release-recovery.log`. 기존 749건 + 새 발행 메타데이터 30건. 최종 Cloud #37·Android #15의 실제 npm test 로그도 각각 779/779·실패/취소/건너뜀 0이며 `final-unit-test-ci-163-proof.json`에 실행 커밋·단계 시각과 함께 보존 |
| 발행 메타데이터·기존 OTA 대상 검사 | 57/57 통과 | `/workspace/work/release-notes-fix/tests.log`: 새 30건 + 기존 OTA 27건. 전체 단위 779건에 다시 더하지 않음 |
| 생산 빌드·Android 웹 동기화 | 완료 | `final-build-candidate5.log`, `final-android-sync-candidate5.log`, 최종 소스 보존 확인 |
| 중복 없는 검사 계열 | 44/44 | 입력 동일 범위의 완료 결과 36개 보존 + 최종 후보 직접 실행 8개. 각 실행 당시 후보·해시·개별 PASS·로그·증거를 구분 |
| 전투 FX 원래 전체 범위 | 5개 묶음, 2,737개 결과 통과 | 기술 1,242 + duel 952 + basics 469 + impact 22 + motion 52 |
| 캐릭터·기술 원화 | 최종 109종·1,005사례 및 기술 616장면 통과 | 전체 3화면 캐릭터 범위·원래 기술 범위. 아트 15작업은 10개 검사 계열로 집계 |
| 캠페인·지도·이야기·마을 | 해당 완료 범위 보존 | 50장 배경의 출전·기록실·별도 검사 장면 각 250건, 실제 전장 74개, 신규 이야기 40개 장면의 실제 UI 80회, 21인 보행 63회 |

계열 수는 고유 스크립트 수입니다. 전장 원화 5개 장 작업을 5개 계열로 세지 않으며, 전직 단위 검사와 대상별 메타데이터 검사를 전체 단위 779개에 다시 더하지 않습니다. FX 2,737개는 위 5개 묶음의 결과 행 합계이며 다른 단위·원화 검사 수와 별도로 기록합니다. 게임 소스가 그대로인 전체 검사 44계열과 발행 메타데이터의 새 단위 30건도 별도 집계입니다. 일반 성능 검사는 브라우저 지표를 기록했고, FX 성능 검사는 노드·애니메이션·입자·정리 계약을 확인했습니다. 실기기 FPS·GPU·발열 측정은 포함하지 않습니다.

입력 불변 증거는 `candidate5-change-scope.json`과 `candidate1-audio-source-proof.json`입니다. 보존 검사는 실행 당시 해시를 유지하며 최종 해시에서 새로 실행한 것으로 표시하지 않습니다. 실패·중단된 전체 실행 결과를 전체 PASS로 바꾸지 않고, 개별 완료 결과와 원래 전체 범위의 재실행만 인정합니다.

최종 연결 증거는 `/workspace/work/expansion-50/qa-final-index-candidate5.json`, `combat-final-qa-candidate5/summary.json`, `art-candidate5-final-summary.json`입니다. 최종 인덱스는 `complete:true / partialIndex:false`이며 실제 Actions·공개 검증 증거를 연결했습니다. 검사 중 공개·dist 전체 파일 불변은 FX의 제한된 295파일 입력 목록만으로 주장하지 않고 별도 소스 보존 확인과 자산 비교 증거로 확인합니다.

## 동결한 로컬 입력

| 항목 | 값 |
| --- | --- |
| 최종 게임 웹 소스 해시 | `ab27bdadc3b81fbd7863516d1c597e206ef1fae6c8522fe38e87eec075ead4a3` |
| 게임 변경 커밋 | `4dc766a0b4258a73b0515fd751eedd79ba7e8107` |
| PR에서 검사한 커밋 | `99258be8a61eed136e972c0604ce2fb3300f7913` — Cloud Quality CI35 완료 |
| PR #10 병합 후 첫 main 커밋 | `c0f264b497cb4275b7872d810722034ae31c9843` — 당시 749건 기준 검사 완료 |
| 발행 메타데이터 복구 후 최종 main 커밋 | `f0c28a3dcfa09c4c83ad9815af43ce47932938c8` — 최신 779건 통과, 변경 사항 없는 소스 상태 |
| 네이티브 구조 지문 | `e4a96c16ff95a60f9cf68440c9bf9fd72d5710729264d2464199f400a559dfc6` |
| dist와 Android 공통 웹 파일 | 2,622개, 불일치 0 |
| Android 추가 파일 | 빈 `cordova.js`·`cordova_plugins.js` 2개 |

`candidate5-final-source-guard.json`은 버전·웹 해시·네이티브 구조 지문 일치, 변경 사항 없는 소스 상태와 위 동기화를 기록합니다. PR #10 병합 후 `main-source-163-guard.json`도 main 커밋에서 동일한 웹 해시와 네이티브 구조 지문 및 변경 사항 없는 상태를 확인했습니다. `release-recovery-source-guard.json`은 복구 커밋에서도 게임 src/public 입력·웹 해시·네이티브 구조 지문이 그대로이고 변경 사항이 없음을 확인했습니다. 공개 태그 `v1.99.163`과 소스 ZIP의 발행 커밋이 `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`에 일치함을 확인했습니다. 공개 다운로드의 대조 결과는 아래에 기록합니다.

## 발행 실패와 메타데이터 복구

첫 Android 실행 #14는 게임 QA와 APK·서명 OTA의 서명·전체 파일 검증을 통과했지만 게시 단계에서 실패했습니다. 패치 안내가 10항목이라 기존 앱이 허용하는 최대 8항목을 초과했고, 앱의 기존 검증기가 이를 거부했습니다. 첫 실패 직후에는 공개 v1.99.163이 없었고 공개 채널이 1.99.162를 유지했음을 확인했습니다. 근거는 `main-actions-163-attempt1-proof.json`입니다. 서명 산출물 제작 성공을 공개 배포 완료로 기록하지 않습니다.

기존 안내 내용을 잃지 않고 8항목으로 합쳤습니다. 공통 사전 검사는 버전 일치·1~8항목·문자열 항목당 최대 400자를 확인하며, `check-cloud-release.mjs`와 `package-update.mjs`에서 네트워크·서명키·빌드 입력 접근 전에 실행합니다. 서명된 최종 안내도 파일 저장 전에 앱의 변경하지 않은 `verifyPatchManifest`로 검증합니다. PowerShell 산출물 검증에는 APK 전체 파일 크기와 SHA-256을 JSON으로 출력하는 기록만 추가해 기존 서명·내용 검사를 유지했습니다.

복구 범위는 발행 안내·스크립트·메타데이터 테스트·검증 출력입니다. 게임 src/public·웹 해시·네이티브 구조 지문은 바뀌지 않았습니다. 새 메타데이터 단위 30건과 기존 OTA 27건의 57건 대상 검사, 최신 전체 린트와 단위 779건이 통과했습니다. 대상별 57건은 전체 779건의 부분집합입니다. PR CI35와 첫 main CI36의 성공은 복구 전 749건의 실제 결과로 남기며, 새 main CI37과 Android #15도 최종 릴리스 소스에서 전체 성공했습니다. 최신 779건과 각 필수 게임 검사 10개의 완료 결과를 복구 전 기록과 구분합니다.

## Actions 결과와 공개 발행 상태

| 항목 | 상태 | 최종 증거 |
| --- | --- | --- |
| PR Cloud Quality CI35 | **통과 — 이전 749건 기준** | [실행 #35](https://github.com/h0623-dev/cheonsu/actions/runs/37402710192), [검사 작업](https://github.com/h0623-dev/cheonsu/actions/runs/37402710192/job/112073349352), 커밋 `99258be8a61eed136e972c0604ce2fb3300f7913`, 전체·필수 10검사 모두 성공 |
| 첫 main Cloud Quality #36 | **통과 — 이전 749건 기준** | [실행 #36](https://github.com/h0623-dev/cheonsu/actions/runs/37404809811), 커밋 `c0f264b497cb4275b7872d810722034ae31c9843`, 전체·필수 10검사 성공 |
| 첫 Android APK and OTA #14 | **게시 단계 실패 — 과거 시도** | [실행 #14](https://github.com/h0623-dev/cheonsu/actions/runs/37404809923). 게임 QA·APK/OTA 서명·전체 파일 대조 후 안내 10항목이 최대 8항목을 초과해 게시 실패 |
| 복구 후 main Cloud Quality #37 | **전체 SUCCESS — 최신 779건 기준** | [실행 #37](https://github.com/h0623-dev/cheonsu/actions/runs/37408064489), [검사 작업](https://github.com/h0623-dev/cheonsu/actions/runs/37408064489/job/112089988103), 커밋 `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`; 전체 성공·필수 10검사 모두 성공 |
| 복구 후 Android APK and OTA #15 | **전체 SUCCESS — 최신 779건 기준** | [실행 #15](https://github.com/h0623-dev/cheonsu/actions/runs/37408064479), [빌드 작업](https://github.com/h0623-dev/cheonsu/actions/runs/37408064479/job/112089987980), 커밋 `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`; 필수 10검사·서명·게시·산출물 업로드·작업 완료 모두 성공 |
| 공개 Release·태그·소스 커밋 | **PASS** | [v1.99.163](https://github.com/h0623-dev/cheonsu/releases/tag/v1.99.163); 공개 시각 `2026-10-06T03:46:23Z`; 태그가 `f0c28a3dcfa09c4c83ad9815af43ce47932938c8`을 직접 참조 |
| APK 암호 서명·인증서 | **PASS** | 최종 공개 파일과 동일한 전체 APK SHA에 연결된 Action `apksigner` v1/v2 true 및 기대 인증서 일치 |
| 서명 OTA·공개 채널 | **PASS** | RSA 안내·번들 서명, 실제 version·bundleId·Android350~362·OTA SHA/URL·APK URL 일치 |
| 공개 다운로드·전체 파일 대조 | **PASS** | APK/OTA/소스 ZIP 3개 크기·SHA·최종 입력 대조 완료 |

`ci-candidate5-result.json`은 이전 PR 실행의 커밋 일치와 전체 성공, 필수 10개 검사 성공을 기록합니다. `main-actions-163-proof.json`은 최종 릴리스 커밋에서 Cloud #37과 Android #15의 전체 성공을 기록합니다. 웹 소스 해시는 CI 작업에서 독립 추출한 값으로 표시하지 않고 로컬 소스 보존 확인 및 공개 APK/OTA의 실제 내용 대조와 연결합니다. 필수 검사는 스모크·마을 카메라·몬스터·전체 스킬·배치·캠페인 진행·스테이지 미션·캐릭터 도감·50장 확장·대결 접촉의 10개입니다.

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

## 보존과 한계

기존 30장 엔딩의 승리·가론 생존과 증언·기사단 귀환, 기존 아군의 성장·수집·장비·전직, 진행 중인 전투의 맵·좌표·HP·행동·라운드와 수동 배치를 보존합니다. 새 적의 성장 곡선은 새 전투 생성에만 적용하고 저장된 적을 재보정하지 않습니다. 실제 캠페인 진입·첫 승리 정산·저장 회귀와 소스 기반 별도 검사 장면의 전체 대사 재생 범위를 각각 구분합니다.

기본 원복은 **1.99.154 / Android353**, 커밋 `801234d1c99d0cdc7c11d645e111f64336e80672`, 태그 `codex/rollback-1.99.154`입니다. [복원 절차](ROLLBACK_BASELINE.md)를 유지하며 163을 새 원복 기준으로 자동 지정하지 않습니다.

실제 Android 설치·터치·OTA 적용/복구·GPU·발열·스피커 청음은 미검증입니다. 모의 네이티브 브리지 검사를 실제 기기 검사로 확대하지 않습니다. Google 로그인과 Play Store 제출·출시, 클라우드 저장은 미완료입니다.

이번 전체 QA는 사용자의 명시 요청에 따른 범위입니다. [기본 검증 생략 스킬](../.agents/skills/cheonsu-no-post-change-validation/SKILL.md)은 유지하며 다음 변경에서 명시 요청 없이 QA를 자동 재개하지 않습니다.
