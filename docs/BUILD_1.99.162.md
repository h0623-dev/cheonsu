# 1.99.162 빌드 및 배포 상태

기록일: 2026-10-05. 개발 버전 **1.99.162 / Android versionCode 361**, 앱 ID `com.cheonsu.game`, target API36입니다.

## 구현 동작

출전 배치 준비에 실제 보스명과 승리·패배 미션 조건을 표시합니다. 새 전투 진입 시 미션 창을 자동으로 열고 확인 뒤 기존 전장 시작·보스 등장 연출을 진행합니다. 전투 중에는 `미션 보기`로 다시 확인할 수 있으며 기존 전투 이어하기에는 자동으로 창을 열지 않습니다. 조건의 OR 연결과 라운드 제한은 실제 판정에 맞춰 안내하며 전투HUD의 승리 미션 표기도 실제 조건에 맞췄습니다. 패배 목록은 배치 카드와 미션 창에서 확인합니다. 안내 확인과 닫기로 턴·행동·능력치·저장을 바꾸지 않습니다. [상세 동작·QA](QA_IMPROVEMENT_1.99.162.md).

## 현재 상태

**로컬 검사와 Actions, 새 APK·서명 OTA·전체 소스 ZIP 배포 및 실제 공개 다운로드 독립 검증을 완료했습니다.** Node는 **v24.19.0**, 버전은 **1.99.162 / Android361**입니다. 최종 게임 소스 커밋은 `0deae37a67fe5ac5e7e49d8fb887f78429d1e5b5`이며 공개 태그 `v1.99.162`가 같은 커밋을 가리킵니다. 웹 소스 SHA-256은 `5b1bc31525d9c0dbac1f679765e95789b9979e185f815189649743d4889d5efc`입니다.

| 항목 | 상태 | 완료 조건 |
| --- | --- | --- |
| 버전 동기화 | 확인 완료 | 패키지·잠금 파일·SAVE_VERSION·Android·manifest·서비스 워커·업데이트 안내의162/361 일치 |
| 로컬 린트·단위·웹 빌드 | 통과 | 린트 오류0·단위505/505·생산 빌드 통과 |
| 신규 미션 안내 | 통과 | 4화면39회 실제 진입·이어하기12회·구156 저장8건·JS/HTTP 오류0 |
| 안내와 실제 판정 | 통과 | 실제 전장1440설정의 보스명·제한 라운드·승패 판정 일치, 데이터 불변 |
| 독립UI 검사 | 통과 | 4화면·확인1회·다시 보기/ESC·버튼44px·저장 보존·후퇴 예약 연출 누수0 |
| 기존 콘텐츠 회귀 | 통과 | 스모크3화면·마을21회·적132·스킬648·배치48/30장·진행60/실제 패배6회·여정4화면 |
| Cloud Quality | PR·main 통과 | 아래 최종 소스의 Actions 실행 링크 참조 |
| fresh APK | 제작·배포 완료 | 최종main 게임 소스에서 Android APK and OTA 성공 |
| APK 독립 확인 | 통과 | Android361·기존 인증서·웹1874개·OTA 신뢰·복구 보호 확인 |
| signed OTA | 제작·배포·검증 완료 | 웹1872개·안내문과ZIP RSA 서명·공개 채널162 확인 |
| 공개 다운로드 | 통과 | APK·OTA·소스 ZIP3개 크기·해시 일치, 전체 소스2510개 확인 |

로그는 `/workspace/work/mission-162/`에 보관합니다. 생산 보고서 `tmp/stage-missions-qa/report.json`, `tmp/deployment-qa/report.json`, `tmp/campaign-progression-qa/report.json`, `tmp/monster-enemies-qa/result.json`, `tmp/skill-spectacle-qa/result.json`은 위 최종 웹 소스 해시와 일치하며 통과했습니다. 독립 검토의1440설정·4화면 결과는 `/workspace/work/mission-162/read-only-review/`에 보관합니다. 네이티브 지문은 `e4a96c16ff95a60f9cf68440c9bf9fd72d5710729264d2464199f400a559dfc6`으로 기존과 같습니다.

## 최종 Actions와 공개 산출물

- [PR9 Cloud Quality](https://github.com/h0623-dev/cheonsu/actions/runs/37257520237), [main Cloud Quality](https://github.com/h0623-dev/cheonsu/actions/runs/37261449565), [Android APK and OTA](https://github.com/h0623-dev/cheonsu/actions/runs/37261449555)가 모두 성공했습니다. 해당 작업은 각각 `111597677577`, `111609356359`, `111609356151`입니다.
- 공개 릴리스는 **2026-10-05 13:12:36 KST**에 게시되었습니다. APK·OTA·소스 ZIP3개를 직접 내려받아 공개 크기·SHA-256과 대조했습니다. 안내문과 실제 OTA ZIP의 RSA 서명을 모두 검증했으며 다운로드 검증 완료 시각은 **13:14:33 KST**입니다.
- Actions `apksigner`의 APK **v1/v2 암호학적 서명 검증**과 공개 APK의 기존 인증서 DER SHA-256 `1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f` 일치를 확인했습니다. 인증서 추출과 암호학적 서명 검증을 구분합니다.
- APK 웹 파일은 **1874개**이며 생산 빌드1872개와 생성된 빈 Cordova 파일2개를 포함합니다. 최종 내장 웹 디렉터리와 모든 파일 해시가 일치합니다. OTA의 **1872개** 파일도 최종 dist와 일치하며 두 산출물의 웹 버전·소스 해시는 위 최종 게임 소스와 같습니다.
- 네이티브 지문은 `e4a96c16ff95a60f9cf68440c9bf9fd72d5710729264d2464199f400a559dfc6`, OTA 공개키 DER SHA-256은 `61688fa31562d4b1b7d44072421c549d40cd39b8fe9875210ab3e132ad3f4fc4`로 기존 신뢰를 유지합니다. APK의 LiveUpdate DEX 클래스·MainActivity 등록·복구 보호·외부 웹 원점 부재를 확인했습니다.
- 실제 공개 OTA 안내는 **1.99.162**, 호환 Android 범위는 **350~361**입니다. 오래된main 안내 파일을 기준으로 채널을 낮추지 않았습니다.
- 전체 개발 소스 ZIP은 최종 게임 커밋의 추적 파일 **2501개**, 생성 파일 **8개**, 소스 목록 파일 **1개**, 총 **2510개**입니다. 파일명·전체 바이트 해시와 생성 파일을 대조했으며 누락·추가·불일치0개입니다.

| 산출물 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| [새 APK](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.162/cheonsu_1.99.162_update_debug.apk) | 247891254 | `ae9cb08e487a020a573cffb624c86cc3cc5c57ae6a24a4f919e9ccb09fd06c30` |
| [서명 OTA](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.162/cheonsu_1.99.162_ota.zip) | 239946325 | `f712b3833222fedf085b000b99c4d9036929d20870f0254389626d01e1a3ed7c` |
| [전체 개발 소스 ZIP](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.162/cheonsu_development_1.99.162.zip) | 561427083 | `aa2e00fe779f814a606ddc5e315c467658eb3b2ae398dab893427f0281d98dbc` |

[v1.99.162 공개 릴리스](https://github.com/h0623-dev/cheonsu/releases/tag/v1.99.162)에 제공합니다. 독립 검증 JSON은 `/workspace/work/release-1.99.162/`의 `download-verification.json`, `web-and-apk-verification.json`, `native-and-source-verification.json`이며 모두 통과·실패0개입니다. 배포 뒤 문서 갱신은 위 게임 소스 해시와 공개 APK·OTA·소스 ZIP을 변경하지 않습니다.

## 보존과 배포

- 최종 산출물은 `cheonsu_1.99.162_update_debug.apk`, `cheonsu_1.99.162_ota.zip`, `cheonsu_development_1.99.162.zip`이며 위 공개 링크의 파일을 직접 검증했습니다.
- 기존 저장·진행·훈련·적 능력치·레벨·수집·장비·전투 행동과 수동 배치를 보존합니다. 기존 APK·OTA 신뢰와 복구 보호도 유지합니다.
- 서명은main 전용 GitHub Actions **`cheonsu-release`**의 기존 Secrets로만 수행합니다. 키와 장기 토큰을 클라우드 작업·소스·ZIP으로 복사하거나 출력하지 않습니다.
- 실제 공개 OTA는별도updates 브랜치입니다. main의 오래된 `public/updates/latest.json`을 기준으로 공개 채널을 낮추지 않습니다.
- 기본 “원복”은 **1.99.154 / Android353**, 소스 `801234d1c99d0cdc7c11d645e111f64336e80672`, 태그 `codex/rollback-1.99.154`를 유지합니다. [복원 절차](ROLLBACK_BASELINE.md).

실제 Android 기기 설치·터치·OTA 실행/복구·GPU·발열은 미검증입니다. Google 로그인·Play Store 출시·클라우드 저장은 완료된 상태가 아닙니다.
