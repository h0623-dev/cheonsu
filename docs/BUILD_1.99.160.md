# 1.99.160 빌드 및 배포 상태

기록일: 2026-10-05. 개발 버전 **1.99.160 / Android versionCode 359**, 앱 ID `com.cheonsu.game`, target API 36입니다.

## 이번 변경

전투 시작 전에 보유 캐릭터와 실제 전장 지형을 확인하고, 허용된 칸을 눌러 아군을 배치하는 단계를 추가합니다. 기본 자동 배치를 출발점으로 사용하며 캐릭터 선택·이동·자리 교환·배치 해제·자동 배치·준비 상태 저장을 제공합니다. 상세 동작과 검사 범위는 [QA_IMPROVEMENT_1.99.160.md](QA_IMPROVEMENT_1.99.160.md)에 기록합니다.

## 검증 상태

**최종 생산 빌드 검사와 새 APK·서명 OTA·전체 소스 ZIP 배포, 실제 공개 다운로드 독립 검증을 완료했습니다.** 최종 게임 소스 커밋은 `3cd29584a21c7da926792ea55c9b76e47cc7374f`이며 공개 태그 `v1.99.160`이 같은 커밋을 가리킵니다. 웹 소스 SHA-256은 `f5813607cd5335b122b5c5d1f404b17784436a286ea82eeeb3f4369a3c8746dc`입니다.

| 항목 | 상태 | 완료 조건 |
| --- | --- | --- |
| 버전 | 1.99.160 / Android359 설정 | 패키지·잠금 파일·앱 저장 버전·Android 버전 일치 확인 |
| 로컬 린트·단위·웹 빌드 | 실행 통과 | 린트 오류 없음, 단위 검사481/481, 생산 빌드 성공 |
| 기본 생산 빌드 브라우저 검사 | 실행 통과 | 기본 스모크3화면·마을 카메라21회 |
| 기존 적·스킬 회귀 | 최종 생산 빌드 통과 | 같은 해시의 적132사례·전체 캐릭터 스킬648사례 |
| 새 배치 브라우저 검사 | 최종 생산 빌드 통과 | 3화면48항목·30개 장의15명 배치·실제 시작 좌표·저장·터치·회전·재도전·다음 장 |
| Cloud Quality | PR·main 실행 통과 | 아래 최종 소스의 Actions 실행 링크 참조 |
| fresh APK | 제작·배포 완료 | 최종 main 게임 소스에서 `Android APK and OTA` 성공 |
| APK 독립 확인 | 통과 | Android359·기존 인증서·웹1874개·OTA 신뢰·복구 보호 확인 |
| signed OTA | 제작·배포·검증 완료 | 최종 소스의 웹1872개·안내문 및 ZIP RSA 서명, 공개 채널160 확인 |
| 공개 다운로드 | 통과 | APK·OTA·소스 ZIP3개 크기·해시 일치, 전체 소스2497개 확인 |

로컬 실행 로그는 `/workspace/work/deployment-160/`에 보관합니다. 생산 보고서는 `tmp/deployment-qa/report.json`, `tmp/monster-enemies-qa/result.json`, `tmp/skill-spectacle-qa/result.json`이며 모두 위 최종 웹 소스 해시를 검사합니다. 기존 여정4개 화면과 플레이어 경험5개 화면도 통과했습니다.

네이티브 지문은 `e4a96c16ff95a60f9cf68440c9bf9fd72d5710729264d2464199f400a559dfc6`으로 1.99.159와 같습니다. 공개 APK 안의 OTA 공개키·LiveUpdate DEX 클래스와 MainActivity 등록·실패 복구 보호·외부 웹 원점 부재를 별도로 검사했습니다.

## 최종 Actions와 공개 산출물

- [PR7 Cloud Quality](https://github.com/h0623-dev/cheonsu/actions/runs/37242878682), [main Cloud Quality](https://github.com/h0623-dev/cheonsu/actions/runs/37243379284), [Android APK and OTA](https://github.com/h0623-dev/cheonsu/actions/runs/37243379279) 모두 성공했습니다. Android 배포 작업은 `111556381766`입니다.
- 공개 릴리스는 **2026-10-05 08:29:34 KST**에 게시되었습니다. APK·OTA·소스 ZIP3개의 실제 다운로드와 크기·SHA-256 대조, 안내문 RSA 및 OTA ZIP RSA 서명을 확인했습니다. 다운로드 검증 완료 시각은 **08:31:37 KST**입니다.
- Actions `apksigner`는 APK의 **v1/v2 암호학적 서명 검증**을 통과했습니다. 실제 공개 APK에서 추출한 기존 인증서 DER SHA-256은 `1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f`로 일치합니다. 인증서 추출만으로 서명 유효성을 주장하지 않습니다.
- APK 웹 파일은 **1874개**이며 최종 내장 웹 디렉터리와 전체 해시가 일치합니다. 생산 빌드1872개와 생성된 빈 Cordova 파일2개를 포함합니다. OTA는 **1872개** 모두 최종 dist와 일치합니다. 두 산출물의 버전·웹 소스 해시도 일치합니다.
- OTA 공개키 DER SHA-256은 `61688fa31562d4b1b7d44072421c549d40cd39b8fe9875210ab3e132ad3f4fc4`로 기존 신뢰를 유지합니다. 실제 공개 안내는 **1.99.160**, 호환 Android 범위는 **350~359**입니다.
- 전체 개발 소스 ZIP은 위 최종 게임 커밋의 **2488개** 추적 파일과 생성 파일 **8개**, 소스 목록 파일 **1개**, 총 **2497개**입니다. 전체 파일명·바이트 해시와 생성 파일을 대조했으며 누락·추가·불일치0개입니다.

| 산출물 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| [새 APK](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.160/cheonsu_1.99.160_update_debug.apk) | 247887865 | `380b6e105f36ce30c576e4b3af655144ceeaea927d2bff910b235649f8fbdbed` |
| [서명 OTA](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.160/cheonsu_1.99.160_ota.zip) | 239943485 | `bab1c85f781a7df1b2745b556935304dca99ff64e8b4a6964c70a0e0da8d109f` |
| [전체 개발 소스 ZIP](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.160/cheonsu_development_1.99.160.zip) | 561381833 | `6c0c5de43bd2f0c7ea405544b057bed7307d3e92086a95c40bbfa901c412c12c` |

[v1.99.160 공개 릴리스](https://github.com/h0623-dev/cheonsu/releases/tag/v1.99.160)에 제공합니다. 독립 검증 JSON은 `/workspace/work/release-1.99.160/`의 `download-verification.json`, `web-and-apk-verification.json`, `native-and-source-verification.json`이며 모두 통과·실패0개입니다. Actions 서명 증거는 `/workspace/work/deployment-160/android160-actions-proof.json`에 보관합니다. 배포 후의 이 문서 갱신은 위 게임 소스 해시와 배포 APK·OTA·소스 ZIP을 변경하지 않습니다.

## 배포 절차와 보존 기준

- 최종 산출물은 `cheonsu_1.99.160_update_debug.apk`, `cheonsu_1.99.160_ota.zip`, `cheonsu_development_1.99.160.zip`이며 위 공개 링크의 파일을 직접 검증했습니다.
- APK·OTA 서명은 `main` 전용 GitHub Actions **`cheonsu-release`** 환경의 기존 Secrets로만 수행합니다. 개인 서명키와 장기 토큰을 클라우드 작업·소스·ZIP으로 복사하거나 출력하지 않습니다.
- 실제 공개 OTA 안내는 별도 `updates` 브랜치에 있습니다. `main`의 오래된 `public/updates/latest.json`을 현재 채널로 간주하거나 다운그레이드하지 않습니다.
- 기존 저장·진행도·수집·장비와 진행 중인 전투를 보존합니다. 기본 “원복”은 **1.99.154 / Android353**, 소스 `801234d1c99d0cdc7c11d645e111f64336e80672`, 태그 `codex/rollback-1.99.154`를 유지합니다. [복원 절차](ROLLBACK_BASELINE.md).

실제 Android 기기 설치·터치·OTA 활성화와 실패 복구·GPU·발열은 미검증입니다. Firebase 프로젝트와 Play Console 계정은 없으며 실제 Google 로그인과 Play Store 정식 출시가 완료된 상태가 아닙니다.
