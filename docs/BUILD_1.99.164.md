# 천수 1.99.164 빌드·배포 기록

작성일: 2026-10-06 KST. 게임 버전은 **1.99.164**, Android versionCode는 **363**입니다.

**1.99.164의 새 APK·서명 OTA·전체 개발 소스 ZIP을 공개 배포했습니다.** 최종 게임 소스와 공개 태그의 커밋은 `742bca6eacd415251c91e69cb286cf8958dbedd5`입니다. [Cloud Quality](https://github.com/h0623-dev/cheonsu/actions/runs/37415891066)와 [Android APK and OTA](https://github.com/h0623-dev/cheonsu/actions/runs/37415891062) 자동 실행은 모두 성공했고, 각각 이번 단위 검사 779/779와 필수 브라우저 검사 10개가 통과했습니다. Android 자동 실행에서 APK·OTA 검사와 공개 파일 다운로드 검사·서명 파일 정리까지 성공했습니다. 공개 릴리스 발행 시각은 **2026-10-06 14:25 KST**입니다.

## 변경 내용

스테이지를 선택하면 이야기 컷신을 먼저 진행하고 실제 전장에서 아군을 배치합니다. 배치를 확정한 뒤 첫 아군 턴을 시작합니다. 기존의 작은 준비 지도 대신 확대·이동할 수 있는 전장과 보유 캐릭터 목록을 사용하며, 기존 편성 관리는 필요한 경우 별도로 엽니다.

배치 가능 칸은 자동 초기 아군 위치와 후방을 중심으로 최대 18칸입니다. 출전 최대 15명과 주인공 필수 출전은 유지합니다. 기존의 연결된 안전 지형·적과의 간격 제한도 유지하여 적 진영 가까이 이동하거나 회복·강화·위험 칸에서 시작할 수 없도록 합니다. 칸 선택·자리 교환·해제·자동 배치·준비 상태 저장을 지원합니다.

아직 시작하지 않은 배치 저장은 새 허용 칸 밖의 좌표만 안전한 시작 칸으로 보정합니다. 이미 진행 중인 전투의 좌표·체력·행동과 기존 성장·장비·진행·수집 데이터는 보존합니다. 기본 원복 기준은 [1.99.154](ROLLBACK_BASELINE.md)를 유지합니다.

## 산출물 상태

| 항목 | 1.99.164 상태 |
| --- | --- |
| 최종 릴리스 소스 커밋 | `742bca6eacd415251c91e69cb286cf8958dbedd5` |
| Cloud Quality 자동 실행 | [Cloud Quality](https://github.com/h0623-dev/cheonsu/actions/runs/37415891066) 전체 성공, 단위 779/779·필수 브라우저 10개 통과 |
| Android APK and OTA 자동 실행 | [Android APK and OTA](https://github.com/h0623-dev/cheonsu/actions/runs/37415891062) 전체 성공, 단위 779/779·필수 브라우저 10개·APK/OTA·공개 다운로드 검사 통과 |
| 새 APK | [1.99.164 APK 다운로드](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.164/cheonsu_1.99.164_update_debug.apk) 공개 완료 |
| 서명 OTA | [1.99.164 서명 OTA](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.164/cheonsu_1.99.164_ota.zip) 공개 완료 |
| 전체 개발 소스 ZIP | [1.99.164 전체 개발 소스 ZIP](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.164/cheonsu_development_1.99.164.zip) 공개 완료 |
| 공개 릴리스 | [v1.99.164 공개 릴리스](https://github.com/h0623-dev/cheonsu/releases/tag/v1.99.164), 2026-10-06 14:25 KST 발행 |
| 실제 공개 업데이트 채널 | [공개 업데이트 채널](https://raw.githubusercontent.com/h0623-dev/cheonsu/updates/latest.json) 메타데이터: 1.99.164 / `1.99.164-7f4da1ce8199` / Android 350~363 |
| APK 인증서·버전·전체 웹 파일·OTA 신뢰 | 자동 `Verify final APK`와 OTA payload 검사 단계 성공 |
| 공개 산출물 다운로드 검사 | 이번 자동 발행 로그에서 APK·OTA·소스 ZIP 3개 모두 검증 완료 |

서명과 배포는 `main`에 허용된 기존 GitHub Actions의 `cheonsu-release` 환경에서 수행합니다. Android·OTA 개인키를 Codex Cloud나 소스·ZIP에 복사하지 않습니다. 실제 자동 업데이트 채널은 별도 `updates` 브랜치의 `latest.json`이며, `main`에 남은 과거 안내를 공개 채널로 간주하지 않습니다.

직전 공개 버전은 1.99.163 / Android 362입니다. 그 APK·OTA에는 이번 변경이 포함되지 않으며, 당시 검사 수치·해시를 이번 버전의 근거로 사용하지 않습니다. 직전 결과는 [1.99.163 빌드 기록](BUILD_1.99.163.md)에 보존합니다.

## 자동 실행에서 발견한 문제

첫 소스 `38a03957dbfebcfb28947c84a6fe0682d97d8769`의 자동 Actions는 `public/manifest.webmanifest`에 1.99.163 표기가 남아 오프라인 캐시 관련 단위 검사에서 실패했습니다. 최종 소스에서는 이 표기를 1.99.164로 맞췄고, 후속 Cloud Quality의 단위 검사 779개가 모두 통과했습니다. 최초 실패를 숨기거나 이전 버전 검사 결과로 대신하지 않습니다.

## 공개 파일과 자동 발행 로그

아래 크기·SHA-256은 이번 자동 발행 로그와 공개 릴리스 메타데이터에서 읽은 값입니다. 에이전트가 파일을 별도로 다운로드해 대조한 결과가 아닙니다.

| 산출물 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| [cheonsu_1.99.164_update_debug.apk](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.164/cheonsu_1.99.164_update_debug.apk) | 289044102 | `485e6f4d1c77fe1a1e89ecb72e63c07410b3d094b03d5c1c214727a0b3a07f86` |
| [cheonsu_1.99.164_ota.zip](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.164/cheonsu_1.99.164_ota.zip) | 280939250 | `7f4da1ce8199687c81fc3dbcfb251c7023434055597fa28cb2d52d85f2d1aeec` |
| [cheonsu_development_1.99.164.zip](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.164/cheonsu_development_1.99.164.zip) | 831137149 | `06280f6491bf8a6745e9e9e9285531a7619a198260812105d796d573f80d1f9b` |

이번 APK 검사 로그의 기존 인증서 SHA-256은 `1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f`입니다. 자동 실행이 인증서·버전·웹 파일과 OTA 신뢰를 검사했고, 발행 로그에 세 공개 파일의 다운로드 검사 완료가 기록되었습니다. 서명 임시 파일 정리 단계도 성공했습니다.

실제 공개 채널의 읽기 결과는 버전 1.99.164, 번들 `1.99.164-7f4da1ce8199`, 호환 Android versionCode 350~363입니다. 에이전트는 채널 메타데이터를 읽었으며 별도 서명 검증이나 아티팩트 대조를 실행하지 않았습니다. 소스 ZIP은 발행 소스 `742bca6eacd415251c91e69cb286cf8958dbedd5`의 스냅샷이므로, 배포 완료 뒤 갱신한 이 문서의 최종 상태는 포함하지 않습니다.

## 직접 실행과 자동 Actions 구분

**사용자 지시에 따라 수정 후 별도 검증은 실행하지 않았습니다.** 에이전트가 린트·테스트·브라우저 QA·검증용 빌드·APK/OTA 재다운로드 대조를 직접 실행하거나 별도 검증 CI를 수동 시작하지 않았습니다. 이번 변경은 이전 1.99.163의 전체 QA 요청과 별개의 작업이며 [검증 생략 스킬](../.agents/skills/cheonsu-no-post-change-validation/SKILL.md)을 적용합니다.

기존 자동 Actions의 검사·서명·배포 보호 설정은 유지했습니다. 이번 자동 실행의 작업 상태와 로그를 읽어 결과를 기록했으며, 에이전트가 별도 검사한 것으로 표현하지 않습니다. 실제 Android 기기 설치·터치·OTA 적용·기기 성능은 이번 작업에서 확인하지 않았습니다. Firebase 연결·Google 로그인·Google Play 정식 출시는 여전히 미완료입니다.

변경 범위와 검사 상태의 구분은 [1.99.164 변경·검증 기록](QA_IMPROVEMENT_1.99.164.md)을 따릅니다.
