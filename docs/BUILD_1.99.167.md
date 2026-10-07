# 천수 1.99.167 · 출처와 라이선스 정리

작성 기준: 2026-10-07 KST · Android versionCode 366

**새 APK·서명 OTA·개발 소스 ZIP과 Safari 공개 완료.** 최종 릴리스 소스는 `7f1e8ee3fa93ab33db57abcaec4cde6a4f6d0a68`이며 [v1.99.167](https://github.com/h0623-dev/cheonsu/releases/tag/v1.99.167)을 2026-10-07 **16:18:25 KST**에 공개했습니다. 기존 자동 Actions 두 작업은 모두 성공했고 실제 업데이트 채널은 1.99.167 / Android 350~366입니다.

## 변경 범위

- 설정의 권리 안내에서 제작·권리 안내, npm 원문, 실제 웹 번들 고지, Android 라이브러리, 음악, Google 로고의 고지를 읽습니다. 고지는 게임 화면 안에서 텍스트로 표시하며 임의 HTML을 실행하지 않습니다.
- npm production 의존성 96개의 LICENSE·NOTICE·원저작권 주석을 보존합니다. 누락된 Firebase 라이선스는 버전별 매핑과 공식 릴리스 원문으로 보충하며 Lucide의 ISC와 Feather MIT를 함께 제공합니다. 실제 번들 고지는 숨김 디렉터리를 피한 legal/bundled-web-notices.md에 생성합니다.
- Android 제작에 쓰인 Gradle runtime 의존성의 고지는 생산 빌드에서 수집하여 APK·같은 dist의 OTA·개발 소스 ZIP에 포함합니다. 네이티브 API·의존성·OTA 신뢰 구성을 바꾸지 않습니다.
- FluidR3 원본 음색과 MIDI.js 변환 MP3의 조건을 구분하고 음악의 고지와 원문을 보존합니다. 음악과 악보·샘플 자체는 교체하지 않습니다.
- 현재 사용하지 않는 초기 메뉴 2개·참조 및 콘셉트 이미지 18개·Vite/React 템플릿 5개, 관련 캐시 경로 3개를 제거합니다. 제작사 문구만 지운 재가공본으로 대체하지 않습니다. 과거 Git·릴리스와 원복 기준은 유지합니다.
- 31~50장 배경의 생성 원본 연결 20개를 포함한 기존 대조 36개, 새 보스 5종의 실제 원본과 생성 ID를 기록합니다. 복구하지 못한 초기 PC 기록·정확한 프롬프트를 확인했다고 꾸미지 않습니다.
- 게임 내 특정 타 게임명으로 화풍을 설명한 문구를 일반적인 측면 전투 설명으로 바꿉니다. 소스 ZIP에 Safari web/ 실행부와 RIGHTS.md도 포함합니다.

## 보존 사항

현재 게임 아트와 음악, 보스 연출, 50장 캠페인, 전투·성장·배치 규칙, 저장 구조·진행·수집 데이터를 유지합니다. 기본 원복 기준은 [1.99.165 + Safari](ROLLBACK_BASELINE.md)입니다. Android·OTA 개인키는 GitHub Actions cheonsu-release에 유지합니다.

## 최종 공개 산출물

| 항목 | 공개 결과 |
| --- | --- |
| 게임 / Android | 1.99.167 / versionCode 366 |
| 최종 소스 | `7f1e8ee3fa93ab33db57abcaec4cde6a4f6d0a68` |
| 공개 릴리스 | [v1.99.167](https://github.com/h0623-dev/cheonsu/releases/tag/v1.99.167) · `draft=false` · 2026-10-07 16:18:25 KST |
| Cloud Quality | [37581891272 / 작업 112663331047](https://github.com/h0623-dev/cheonsu/actions/runs/37581891272/job/112663331047) · 전체 `completed / success` · 16:08:35 KST 최종 갱신 |
| Android APK and OTA | [37581891654 / 작업 112663223646](https://github.com/h0623-dev/cheonsu/actions/runs/37581891654/job/112663223646) · 전체 `completed / success` · 16:18:43 KST 최종 갱신 |
| 실제 OTA 채널 | [별도 updates 브랜치 latest.json](https://raw.githubusercontent.com/h0623-dev/cheonsu/updates/latest.json) · 1.99.167 |
| OTA 번들 / 지원 범위 | `1.99.167-23c8a8340fdc` / Android 350~366 |
| OTA 메타데이터 생성 | 2026-10-07 16:16:28.983 KST · 공개 발행 시각과 구분 |
| Safari | [천수 웹](https://cheonsu-safari-production.up.railway.app) · 최종 릴리스와 같은 소스 · 15:38:40 KST `SUCCESS` · 서비스 온라인 |

| 공개 파일 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| [cheonsu_1.99.167_ota.zip](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.167/cheonsu_1.99.167_ota.zip) | 278914422 | `23c8a8340fdc36e3255d85abe5a05cbe90a12845a06634d60fb7563c6fa12014` |
| [cheonsu_1.99.167_update_debug.apk](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.167/cheonsu_1.99.167_update_debug.apk) | 287687265 | `984ec2cdbe55e9c96bdc9b82ebdc942c055b9b55cee853393a03e1e544229618` |
| [cheonsu_development_1.99.167.zip](https://github.com/h0623-dev/cheonsu/releases/download/v1.99.167/cheonsu_development_1.99.167.zip) | 842372850 | `d85cd1d17ee1d42f94554a1b9a9977b8f95912a4e21d7734435e20a545798d9e` |

세 파일 모두 GitHub 공개 메타데이터에서 `uploaded` 상태입니다. 크기·SHA-256·공개 여부는 자동 발행 로그와 GitHub 메타데이터에서 읽은 값이며 에이전트의 재다운로드·해시·인증서·서명 대조 결과가 아닙니다. 자동 발행 스크립트는 제작 파일과 GitHub 자산의 digest·크기를 대조하고 APK·OTA 주소에 HEAD 접근을 수행한 뒤 공개 업데이트 포인터를 갱신합니다. 이를 공개 파일 전체 재다운로드 검사로 표현하지 않습니다.

소스 ZIP은 최종 릴리스 소스의 스냅샷과 제작 시 생성한 법적 고지를 포함합니다. 발행 후 기록한 이 최종 배포 문서 갱신까지 포함한 파일은 아닙니다. Android·OTA 개인키는 기존 cheonsu-release 환경에서 사용했고 자동 정리 단계도 성공했습니다. main에 남은 오래된 업데이트 JSON으로 공개 채널을 초기화하거나 낮추지 않습니다.

## 기존 자동 Actions 완료 결과

최종 소스의 두 실행 모두 단위 **792개 통과 / 실패 0**과 필수 브라우저 검사 **10개 성공**으로 완료했습니다. Android는 APK 제작·기존 APK 검사·서명 OTA 제작·APK/OTA 대응 검사·소스 ZIP 제작·공개 발행까지 성공했습니다. 이전 1.99.166의 수치를 이번 검사 결과로 대신하지 않습니다.

완료한 Cloud 로그에는 50장 확장 전투 진입 35회·전직 72회·승리/합류 16회·실제 AI 반격 16회·4개 화면에서 오류 0이 기록돼 있습니다. 타격 연출은 1280×900, 390×844, 320×740, 844×390 각각 109종의 일반 공격·스킬 및 접촉·반격·회피·회복·수호·결정타·취소·회전이 통과했습니다. 이 세부 수치를 별도의 전체 검사 개수처럼 중복 합산하지 않습니다.

npm 고지 생성은 96개 런타임 의존성의 원문을 제작했습니다. 최종 Android 생산 로그에는 **Maven 구성 요소 79개·원문 고지 216개**가 15:33:36 KST에 제작됐다고 기록돼 있습니다. 이는 서로 다른 수집 범위이며 npm 96개와 합쳐 고유 라이브러리 수로 표시하지 않습니다. APK와 OTA의 웹 파일은 **각 2,726개**이며 기존 자동 서명·플러그인·복구·원본 주소 보호 검사도 PASS입니다. 자동 Actions 결과는 에이전트의 직접 QA나 Android·아이폰 실기기 설치·플레이 검사와 구분합니다.

## 제작 중 발생한 오류와 해결

첫 소스 `f96e8708db15a9d4259572310fe78e27e2df2eec`의 Cloud [37581049535](https://github.com/h0623-dev/cheonsu/actions/runs/37581049535)와 Android [37581049493](https://github.com/h0623-dev/cheonsu/actions/runs/37581049493)는 음악 라이선스를 과거 `CC BY 3.0` 문자열로 고정한 기존 단위 항목 때문에 791/792로 중단됐습니다. 실제 고지인 `CC BY 3.0 US`와 공식 US 링크로 기준을 갱신했고 음원 72개의 해시·용량·개수·음정 검사는 유지했습니다. MP3 파일이나 재생 실패로 보고된 오류는 아닙니다.

후속 소스 `4a933ee4b46b1d814bb77c037518630d05d982eb`의 Android [37581307721](https://github.com/h0623-dev/cheonsu/actions/runs/37581307721)는 단위를 통과했으나, 15:27:04 KST에 Firebase `firebase-appcheck-interop:17.0.0`의 정상적인 빈 제3자 고지 파일을 생산 오류로 처리해 중단됐습니다. 공식 AAR는 목록 JSON이 `{}`, 텍스트는 0바이트였습니다. 빈 원본의 경로·바이트·내용과 목록 상태를 보존하도록 수집기를 보완했습니다. 필수 POM·라이선스 전문 실패 및 JSON이 가리키는 원문 범위가 없는 경우의 차단은 유지합니다.

최종 소스에서 두 오류를 해결하고 위의 전체 성공·공개 결과를 얻었습니다. 실패한 실행을 완료 결과로 집계하지 않습니다. 에이전트의 직접 검사나 검증용 수동 CI는 실행하지 않았습니다.

## Safari 공개

최종 배포 ID는 `48b9fe7b-079e-47e6-8f3e-08b790532e62`입니다. 최종 Android 소스와 동일한 `7f1e8ee3fa93ab33db57abcaec4cde6a4f6d0a68`로 다시 제작하여 2026-10-07 **15:38:40 KST**에 `SUCCESS`가 됐고 실행 인스턴스 1개·서비스 온라인이 보고됐습니다. 웹 주소·저장 위치는 유지합니다.

첫 구현 소스의 배포 `4675e95f-34b5-4feb-a8c8-586dbe2f2be7`도 15:23:46 KST에 성공했지만 최종 소스의 배포와 구분합니다. 소스 커밋 고정과 `watchPatterns=[]` 구성을 유지하며, 이후 문서 갱신만으로 웹 버전이 바뀌지 않습니다. [Safari 운영 기록](SAFARI_WEB.md).

## 직접 검사와 법적 판단 범위

**사용자 지시에 따라 수정 후 별도 검증은 실행하지 않았습니다.** 직접 린트·테스트·브라우저 QA·검증 빌드·아티팩트 재다운로드 대조나 수동 검사 CI를 실행하지 않았습니다. 기존 자동 Actions의 완료 결과 읽기 및 요청한 산출물의 필수 생산·서명·배포와 구분합니다.

이번 정리는 라이선스·출처와 배포물의 기술적 정리입니다. 모든 아트·음악의 유사성 감정, 천수/Cheonsu 상표권 조사, 게임물 등급분류 또는 Google Play 정식 출시를 완료한 것은 아닙니다. 저작권 등록은 일반적인 출시 필수 조건이 아닙니다. [권리 안내](../RIGHTS.md)와 [법률 검토 범위](legal/RELEASE_RIGHTS_SCOPE.md)를 참조하세요.
