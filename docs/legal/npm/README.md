# npm 의존성 법적 고지 제작

`scripts/generate-third-party-notices.mjs`는 설치된 `node_modules`와 `package-lock.json`으로 배포용 고지를 제작합니다. 테스트나 라이선스 허용 여부를 판정하는 프로그램이 아닙니다. 선언된 개발 전용 의존성을 제외한 전체 목록을 보수적으로 수록하므로 타입·서버·iOS 의존성이 들어 있어도 해당 코드가 모든 배포본에서 실행된다는 뜻은 아닙니다.

## 보존하는 자료

- 각 패키지의 이름, 설치·고정 버전, 저장소 주소, npm 무결성 식별자.
- 패키지에 포함된 LICENSE, COPYING, NOTICE, CopyrightNotice 및 별도 제3자 고지 파일의 전문.
- 패키지 원본 소스에 들어 있는 저작권·라이선스 주석. 동일 패키지 내 반복 주석은 한 번 싣고 원래 파일 위치를 모두 기록합니다.
- Lucide의 ISC뿐 아니라 Feather 파생 아이콘의 MIT 고지, tslib의 별도 저작권 고지.
- 원문별 출처와 SHA-256. 영문 라이선스와 권리자 표시는 번역하거나 천수의 명의로 바꾸지 않습니다.

## Firebase 보충 원문

Firebase 11.10.0의 npm 패키지 중 45개에는 패키지 루트의 LICENSE 파일이 없습니다. `supplements.json`은 **이름과 정확한 버전**을 `firebase@11.10.0` 릴리스의 공통 LICENSE에 연결합니다.

- 공식 태그: `firebase@11.10.0`
- 고정 커밋: `3c759f0c0c5e5e164a51d8b9c89655d54047bed0`
- 원문: <https://github.com/firebase/firebase-js-sdk/blob/3c759f0c0c5e5e164a51d8b9c89655d54047bed0/LICENSE>
- 저장 사본: `upstream/firebase-11.10.0-LICENSE.txt`

공통 원문의 Apache-2.0, protobuf 관련 BSD, tslib 관련 내용 전체를 보존합니다. 특정 실행 화면이 이 구성요소를 모두 쓴다고 주장하지 않습니다. 패키지별 권리자 문구는 설치된 원본 소스의 고지 주석을 추가로 수록합니다. 버전이 바뀌거나 고지 파일이 없는 다른 의존성이 추가되면 새 버전에 맞는 원문과 매핑을 마련해야 하며, 기존 Firebase 원문을 다른 버전에 자동 재사용하지 않습니다.

## 배포 경로

고지는 `public/legal/npm/`에 생성되므로 Android 웹 자산, signed OTA, Safari 웹, 개발 소스 ZIP에 함께 포함할 수 있습니다.

- `THIRD_PARTY_NOTICES.txt`: 전체 고지 전문.
- `manifest.json`: 패키지·원문 출처 목록.
- `packages/`: 패키지별 원문 고지.

기본 Android 웹 빌드의 `prebuild`와 독립 Safari 제작 스크립트에서 고지 생성을 수행합니다. 생성 시 설치 버전과 lockfile이 다르거나 필요한 원문이 없으면 잘못된 고지를 제작하지 않도록 중단합니다. 네트워크에서 자료를 새로 내려받지 않습니다.

두 Vite 빌드는 실제 웹 번들에 포함된 의존성 목록도 `legal/bundled-web-notices.md`에 별도로 내보냅니다. Vite의 기본 숨김 경로 `.vite/`는 Android 자산 제외 규칙과 충돌할 수 있어 사용하지 않습니다. Vite의 고지 수집만으로는 원본 고지 파일이 없는 Firebase 및 Android 네이티브 의존성을 모두 다룰 수 없으므로, 이 npm 고지 및 별도 Android 고지를 함께 배포합니다.

외부 구성요소의 고지를 제공하는 것은 천수 자체 코드·이야기·아트에 대한 재사용 허락과 별개입니다.
