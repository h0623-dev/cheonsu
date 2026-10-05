# 1.99.162 빌드 및 배포 상태

기록일: 2026-10-05. 개발 버전 **1.99.162 / Android versionCode 361**, 앱 ID `com.cheonsu.game`, target API36입니다.

## 구현 동작

출전 배치 준비에 실제 보스명과 승리·패배 미션 조건을 표시합니다. 새 전투 진입 시 미션 창을 자동으로 열고 확인 뒤 기존 전장 시작·보스 등장 연출을 진행합니다. 전투 중에는 `미션 보기`로 다시 확인할 수 있으며 기존 전투 이어하기에는 자동으로 창을 열지 않습니다. 조건의 OR 연결과 라운드 제한은 실제 판정에 맞춰 안내하며 전투HUD의 승리 미션 표기도 실제 조건에 맞췄습니다. 패배 목록은 배치 카드와 미션 창에서 확인합니다. 안내 확인과 닫기로 턴·행동·능력치·저장을 바꾸지 않습니다. [상세 동작·QA](QA_IMPROVEMENT_1.99.162.md).

## 현재 상태

**로컬 기본 검사와 최종 생산 빌드 브라우저 검사를 통과했습니다.** Node는 **v24.19.0**, 버전은 **1.99.162 / Android361**, 웹 소스 SHA-256은 `5b1bc31525d9c0dbac1f679765e95789b9979e185f815189649743d4889d5efc`입니다. Actions·APK 제작·서명 OTA·공개 다운로드 검증은 아직 완료되지 않았습니다. 이전161의 APK를162의 결과로 제시하지 않습니다.

| 항목 | 상태 | 완료 조건 |
| --- | --- | --- |
| 버전 동기화 | 확인 완료 | 패키지·잠금 파일·SAVE_VERSION·Android·manifest·서비스 워커·업데이트 안내의162/361 일치 |
| 로컬 린트·단위·웹 빌드 | 통과 | 린트 오류0·단위505/505·생산 빌드 통과 |
| 신규 미션 안내 | 통과 | 4화면39회 실제 진입·이어하기12회·구156 저장8건·JS/HTTP 오류0 |
| 안내와 실제 판정 | 통과 | 실제 전장1440설정의 보스명·제한 라운드·승패 판정 일치, 데이터 불변 |
| 독립UI 검사 | 통과 | 4화면·확인1회·다시 보기/ESC·버튼44px·저장 보존·후퇴 예약 연출 누수0 |
| 기존 콘텐츠 회귀 | 통과 | 스모크3화면·마을21회·적132·스킬648·배치48/30장·진행60/실제 패배6회·여정4화면 |
| Cloud Quality | 미실행 | 최종 PR와main 게임 소스 검사 성공 |
| fresh APK | 미제작 | 최종main 게임 소스에서 Android APK and OTA 성공 |
| APK 독립 확인 | 미검증 | Android361·기존 인증서·전체 웹 파일·OTA 신뢰·복구 보호 확인 |
| signed OTA | 미제작·미배포 | 같은 최종 소스의 서명 OTA 제작·공개 채널 배포 |
| 공개 다운로드 | 미검증 | APK·OTA·전체 소스 ZIP 실제 다운로드·크기·해시·서명·전체 파일 확인 |

로그는 `/workspace/work/mission-162/`에 보관합니다. 생산 보고서 `tmp/stage-missions-qa/report.json`, `tmp/deployment-qa/report.json`, `tmp/campaign-progression-qa/report.json`, `tmp/monster-enemies-qa/result.json`, `tmp/skill-spectacle-qa/result.json`은 위 최종 웹 소스 해시와 일치하며 통과했습니다. 독립 검토의1440설정·4화면 결과는 `/workspace/work/mission-162/read-only-review/`에 보관합니다. 네이티브 지문은 `e4a96c16ff95a60f9cf68440c9bf9fd72d5710729264d2464199f400a559dfc6`으로 기존과 같습니다.

배포 검사가 끝나면 최종 게임 소스 커밋·Actions 링크·산출물 크기와SHA-256을 추가합니다. APK와 서명 OTA 배포 검증이 끝나기 전에는 전달을 완료로 안내하지 않습니다.

## 보존과 배포

- 예정 산출물은 `cheonsu_1.99.162_update_debug.apk`, `cheonsu_1.99.162_ota.zip`, `cheonsu_development_1.99.162.zip`입니다. 다운로드 링크는 실제 공개 배포 검증 후 안내합니다.
- 기존 저장·진행·훈련·적 능력치·레벨·수집·장비·전투 행동과 수동 배치를 보존합니다. 기존 APK·OTA 신뢰와 복구 보호도 유지합니다.
- 서명은main 전용 GitHub Actions **`cheonsu-release`**의 기존 Secrets로만 수행합니다. 키와 장기 토큰을 클라우드 작업·소스·ZIP으로 복사하거나 출력하지 않습니다.
- 실제 공개 OTA는별도updates 브랜치입니다. main의 오래된 `public/updates/latest.json`을 기준으로 공개 채널을 낮추지 않습니다.
- 기본 “원복”은 **1.99.154 / Android353**, 소스 `801234d1c99d0cdc7c11d645e111f64336e80672`, 태그 `codex/rollback-1.99.154`를 유지합니다. [복원 절차](ROLLBACK_BASELINE.md).

실제 Android 기기 설치·터치·OTA 실행/복구·GPU·발열은 미검증입니다. Google 로그인·Play Store 출시·클라우드 저장은 완료된 상태가 아닙니다.
