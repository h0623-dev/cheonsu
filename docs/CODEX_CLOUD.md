# Codex Cloud 개발 환경

2026-10-05 KST 최신 사용자 지시에 따라 코드 수정 후 에이전트의 별도 검증은 생략합니다. 새 작업은 먼저 루트 `AGENTS.md`와 [검증 생략 스킬](../.agents/skills/cheonsu-no-post-change-validation/SKILL.md)을 읽습니다. 아래 검사 절차가 있다는 이유로 테스트·린트·스모크·브라우저 QA를 자동 실행하지 않습니다. 요청한 산출물 제작과 기존 자동 Actions는 스킬에 명시한 범위로 구분합니다.

## 작업 구조

요청 → Codex Cloud에서 `h0623-dev/cheonsu` 수정 → PR 검사 → `main` 반영 → GitHub Actions에서 APK/서명 OTA 제작·검증·배포.

PC 작업 폴더는 백업으로 유지합니다. 이 로컬 대화 자체가 클라우드 실행으로 바뀌지는 않습니다. 이후 요청은 ChatGPT/Codex에서 이 저장소의 **Cloud 환경을 선택한 작업**에 전달합니다. PC 전원이 꺼져 있어도 이미 시작된 클라우드 작업과 Actions는 PC에 의존하지 않습니다.

## 환경 설정

1. ChatGPT 설정 → Codex 클라우드 → 환경 만들기에서 `h0623-dev/cheonsu`를 선택합니다. GitHub 연결이 요구되면 이 저장소에 필요한 권한만 승인합니다.
2. 이름은 `cheonsu`, 공개 범위는 개인용으로 선택합니다. Node.js 24 환경에서 설치 명령은 `node scripts/setup-cloud.mjs`입니다.
3. 설치·시작 설정을 검토하고 **게시(Publish)** 완료를 확인합니다. 설정 파일만 GitHub에 올린 것은 환경 게시 완료가 아닙니다.
4. 새 작업에서 작업 위치 Cloud와 `cheonsu` 환경을 선택합니다. 미리보기 명령은 `npm run dev -- --host 0.0.0.0 --port 5173`이며 사용 중인 포트라면 다른 포트를 사용합니다.

레거시 환경을 쓰는 경우 수동 설정 스크립트는 다음과 같습니다. Node 24는 기본 이미지에 없다면 이미지의 nvm으로 설치합니다. 새 환경으로 마이그레이션할 때도 설치 스크립트를 유지합니다.

```sh
if command -v nvm >/dev/null 2>&1; then nvm install 24; nvm use 24; fi
node scripts/setup-cloud.mjs
```

매 작업 시작 시 `npm ci`와 `npm run setup`으로 캐시를 최신 의존성에 맞춥니다. 설치 단계에는 npm/Playwright 및 Linux 패키지 저장소 접근이 필요합니다. 작업 중 추가 네트워크가 필요하면 필요한 도메인만 허용합니다. 서명키, 장기 GitHub 토큰, OpenAI API 키를 환경 변수나 설정 스크립트에 넣지 않습니다.

공식 설정 절차: https://learn.chatgpt.com/docs/environments/cloud-environments

## 검사와 배포

- `Cloud Quality`: main push와 PR에 대해 설치, 린트, 단위 검사, 웹 빌드, Chromium 3개 화면 크기 검사를 실행합니다. 이 작업에는 서명키가 제공되지 않습니다.
- `Android APK and OTA`: main에 게임 소스/리소스/버전/Android 설정 변경 시 실행하며 수동 실행도 가능합니다. Android SDK 36, JDK 21, Node 24를 사용합니다.
- APK 인증서, 버전, 내장 웹 파일 전체의 SHA-256, OTA 공개키/롤백 설정, 브라우저 스모크 검사를 확인합니다. 서명 OTA와 통소스를 만든 후 검증이 성공해야 공개 배포합니다.
- 수동 실행의 `publish=false`는 빌드 검증 전용입니다. 결과는 실행 페이지의 Artifacts에 14일간 보관하며 공개 패치 채널을 바꾸지 않습니다.
- `publish=true` 또는 main의 게임 변경은 새 게임 버전만 배포합니다. 이미 배포한 버전 이하이면 중단합니다. 배포 동시 실행을 막고 모든 파일의 공개 다운로드를 확인한 뒤 채널 포인터를 바꿉니다.
- 스모크 검사는 타이틀·도감·설정·저장·이어하기·이미지·오류·화면 너비를 확인합니다. 모든 전투/실기기 QA를 대체하지 않습니다. 전투 변경은 기존 해당 분야 검사와 Android 실기기 확인도 필요합니다.

실행 페이지: https://github.com/h0623-dev/cheonsu/actions

## 서명키 관리

사용자 승인에 따라 기존 Android 키와 OTA 키를 GitHub Actions **환경 Secrets**에 암호화 등록합니다.

- 환경: `cheonsu-release`, 배포 가능 브랜치: `main`만 허용.
- `ANDROID_DEBUG_KEYSTORE_BASE64`: 기존 개발용 Android 키. 인증서가 기존 앱과 같아야 설치 업데이트가 가능합니다.
- `OTA_PRIVATE_KEY_PEM`: 기존 OTA 개인키. `src/data/updateTrust.json`의 공개키와 일치해야 합니다.
- 러너의 임시 디렉터리에만 복원하고 작업 종료 시 삭제합니다. 코드, ZIP, APK, 로그, Codex Cloud에는 키를 포함하지 않습니다.
- PR 코드는 이 환경에 접근하지 않습니다. main에 들어가는 코드·워크플로를 검토해야 하며 배포 환경의 브랜치 제한을 해제하지 않습니다.
- Play Store용 업로드 서명키/계정 설정은 별도입니다. 이 구성은 기존 설치형 개발 APK 및 승인된 OTA 채널용입니다.

## 완료 판단

클라우드 작업을 만들 수 있는 계정 연결, 환경 게시, GitHub 소스 반영, 클라우드 검사 및 APK 빌드의 실제 성공을 각각 확인합니다. 환경 생성 화면 오류/계정 승인/Actions 실패가 남으면 그 부분을 미완료로 보고합니다. 게임 변경이 없는 인프라 준비에서는 기존 1.99.153 공개 릴리스와 휴대폰 패치 채널을 유지합니다.
