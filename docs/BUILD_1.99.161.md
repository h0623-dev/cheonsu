# 1.99.161 빌드 및 배포 상태

기록일: 2026-10-05. 개발 버전 **1.99.161 / Android versionCode 360**, 앱 ID `com.cheonsu.game`, target API 36입니다.

## 이번 작업

미션 실패 결과를 저장하고 실패 뒤 훈련을 차단합니다. 출전 준비는 실패한 장의 재도전으로 연결하고, 실제 승리 결과를 확인한 뒤 보상 정산과 다음 장 해금을 진행하도록 보호합니다. 철수 자동 저장과 이전 저장 백업을 보존하며 구버전의 철수 문구를 읽어 결과를 이어받습니다. 회복·장비 관리와 기존 경험치·수집·진행도·이미 열린 전장 기록은 유지합니다.

적의 HP·공격·방어는 기존부터 스테이지·종족·난이도·밸런스에 따라 보정되고 있어 이 수치를 중복 강화하지 않습니다. 신규 전투의 적 레벨은 일반 `1 + floor((장 - 1) / 2)`, 정예는 일반+1, 보스는 일반+2로 부여합니다. 기본·추가 적·보스·증원의 새 생성에만 적용하고 진행 중인 저장 전투를 재산정하지 않습니다. 출전 전 전장 정보와 PC·휴대폰 적 정보에 레벨을 표시하며 보스 HP·공격 표기도 실제 선택한 난이도의 출전 전장 수치에 맞춥니다. 작업 내역과 검사 계획은 [QA_IMPROVEMENT_1.99.161.md](QA_IMPROVEMENT_1.99.161.md)를 따릅니다.

## 현재 검증 상태

**로컬 검사와 Actions, 새 APK·서명 OTA·전체 소스 ZIP 배포 및 공개 다운로드 독립 검증을 완료했습니다.** 버전은 **1.99.161 / Android360**입니다. 최종 게임 소스 커밋은 `bb6899d95276e4bc77e8f8ee3ddad613eaba5113`이며 공개 태그 `v1.99.161`이 같은 커밋을 가리킵니다. 웹 소스 SHA-256은 `37b3219859977657a7cd4eeecdf8f364dc157ddae2b9c133558fcfc59db9f520`입니다.

| 항목 | 상태 | 완료 조건 |
| --- | --- | --- |
| 버전 동기화 | 확인 완료 | 패키지·잠금 파일·SAVE_VERSION·Android·manifest·서비스 워커 버전 일치 |
| 로컬 린트·단위·웹 빌드 | 통과 | 린트 오류0·단위497/497·생산 빌드 성공 |
| 이번 변경의 생산 빌드 검사 | 통과 | 3화면60항목·실제 패배6회·저장/훈련/재도전/정산/해금·브라우저 오류0 |
| 적 생성과 수치 | 통과 | 480설정·9648명 능력치 보존, 기본603명 레벨 누락0·증원 생성3360회·실제 증원1472명 |
| 기존 콘텐츠 회귀 | 통과 | 스모크3화면·마을21회·적132·스킬648·배치48항목/30장·여정4화면·플레이어 경험5화면 |
| Cloud Quality | PR·main 통과 | 아래 최종 소스의 Actions 실행 링크 참조 |
| fresh APK | 제작·배포 완료 | 최종main 게임 소스에서 Android APK and OTA 성공 |
| APK 독립 확인 | 통과 | Android360·기존 인증서·웹1874개·OTA 신뢰·복구 보호 확인 |
| signed OTA | 제작·배포·검증 완료 | 웹1872개·안내문과ZIP RSA 서명·공개 채널161 확인 |
| 공개 다운로드 | 통과 | APK·OTA·소스 ZIP3개 크기·해시 일치, 전체 소스2503개 확인 |

로컬 로그는 `/workspace/work/campaign-161/`에 보관합니다.497개 단위 검사에는 새 실패·훈련·정산·이관 검사9개와 적 레벨 검사7개를 포함합니다. 생산 빌드 해시는 `dist/ota-build.json`으로 확인했습니다. 생산 보고서는 `tmp/campaign-progression-qa/report.json`, `tmp/deployment-qa/report.json`, `tmp/monster-enemies-qa/result.json`, `tmp/skill-spectacle-qa/result.json`이며 모두 위 소스 해시에 일치하고 통과·브라우저 오류0입니다. 적 생성 검증은 `/workspace/work/enemy-balance-161/final-chain-verification.json`에 보관합니다.

## 최종 Actions와 공개 산출물

- [PR8 Cloud Quality](https://github.com/h0623-dev/cheonsu/actions/runs/37252397780), [main Cloud Quality](https://github.com/h0623-dev/cheonsu/actions/runs/37252982906), [Android APK and OTA](https://github.com/h0623-dev/cheonsu/actions/runs/37252982925)가 모두 성공했습니다. 해당 작업은 각각 `111582535226`, `111584243852`, `111584244099`입니다.
- 공개 릴리스는 **2026-10-05 11:02:10 KST**에 게시되었습니다. APK·OTA·소스 ZIP3개를 직접 내려받아 공개 크기·SHA-256과 대조했고 안내문과 실제 OTA ZIP의 RSA 서명도 검증했습니다. 다운로드 검증 완료 시각은 **11:04:12 KST**입니다.
- Actions `apksigner`의 APK **v1/v2 암호학적 서명 검증**과 공개 APK의 기존 인증서 DER SHA-256 `1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f` 일치를 확인했습니다. 인증서 추출과 암호학적 서명 검증을 구분합니다.
- APK 웹 파일은 **1874개**로 생산 빌드1872개와 생성된 빈 Cordova 파일2개를 포함합니다. 최종 내장 웹 디렉터리와 모든 파일 해시가 일치합니다. OTA의 **1872개** 파일도 최종 dist와 일치하며 두 산출물의 웹 버전·소스 해시는 위 최종 게임 소스와 같습니다.
- 네이티브 지문은 `e4a96c16ff95a60f9cf68440c9bf9fd72d5710729264d2464199f400a559dfc6`, OTA 공개키 DER SHA-256은 `61688fa31562d4b1b7d44072421c549d40cd39b8fe9875210ab3e132ad3f4fc4`로 기존 신뢰를 유지합니다. APK 안의 LiveUpdate DEX 클래스·MainActivity 등록·복구 보호·외부 웹 원점 부재를 확인했습니다.
- 실제 공개 OTA 안내는 **1.99.161**, 호환 Android 범위는 **350~360**입니다. 오래된main 안내 파일을 기준으로 채널을 낮추지 않았습니다.
- 전체 개발 소스 ZIP은 최종 게임 커밋의 추적 파일 **2494개**, 생성 파일 **8개**, 소스 목록 파일 **1개**, 총 **2503개**입니다. 파일명·전체 바이트 해시와 생성 파일을 대조했으며 누락·추가·불일치0개입니다.

| 산출물 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| [새 APK](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.161/cheonsu_1.99.161_update_debug.apk) | 247889320 | `aff82b1c2a2f5c7627be81916c94ff287397ca2c32e2a014de5c2cd3e04c3549` |
| [서명 OTA](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.161/cheonsu_1.99.161_ota.zip) | 239944658 | `67b640839d0b7dbcd5689d0d03fba5737c100df7ffef8e9eff5c63a8745c1428` |
| [전체 개발 소스 ZIP](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.161/cheonsu_development_1.99.161.zip) | 561406233 | `395058091e0cbd39df2d561d1f09d2cc3d1b2b04d2df4e3db74a77d9c14d6ce1` |

[v1.99.161 공개 릴리스](https://github.com/h0623-dev/cheonsu/releases/tag/v1.99.161)에 제공합니다. 독립 검증 JSON은 `/workspace/work/release-1.99.161/`의 `download-verification.json`, `web-and-apk-verification.json`, `native-and-source-verification.json`이며 모두 통과·실패0개입니다. Actions 서명 증거는 `/workspace/work/campaign-161/android161-actions-proof.json`입니다. 배포 후 문서 갱신은 위 게임 소스 해시와 공개 APK·OTA·소스 ZIP을 변경하지 않습니다.

## 배포와 보존 기준

- 최종 산출물은 `cheonsu_1.99.161_update_debug.apk`, `cheonsu_1.99.161_ota.zip`, `cheonsu_development_1.99.161.zip`이며 위 공개 링크의 파일을 직접 검증했습니다.
- APK·OTA 서명은main 전용 GitHub Actions **`cheonsu-release`** 환경의 기존 Secrets로만 수행합니다. 서명키와 장기 토큰을 클라우드 작업·소스·ZIP으로 복사하거나 출력하지 않습니다.
- 실제 공개 OTA 안내는 별도updates 브랜치에 있습니다. main의 오래된 `public/updates/latest.json`을 기준으로 채널을 초기화하거나 낮추지 않습니다.
- 기존 저장·진행도·수집·장비와 무관한 사용자 작업을 보존합니다. 기본 “원복”은 **1.99.154 / Android353**, 소스 `801234d1c99d0cdc7c11d645e111f64336e80672`, 태그 `codex/rollback-1.99.154`를 유지합니다. [복원 절차](ROLLBACK_BASELINE.md).

실제 Android 기기 설치·터치·OTA 실행과 실패 복구·GPU·발열은 미검증입니다. Firebase 프로젝트와 Play Console 계정은 없으며 실제 Google 로그인과 Play Store 정식 출시가 완료된 상태가 아닙니다.
