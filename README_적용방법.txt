천수 v1.99.1 Android 느린 무기형 전투 모션 재보정

적용 방법:
1. 압축을 풉니다.
2. 기존 cheonsu 프로젝트 폴더에 그대로 덮어씁니다.
3. src/App.jsx, src/index.css, scripts/generate-classic-battle-assets.ps1, public/maps/classic/*.png, package.json, package-lock.json, public/manifest.webmanifest, public/service-worker.js, public/sw.js, public/updates/latest.json, android/app/build.gradle이 반영되어야 합니다.
4. 웹 테스트는 npm run dev로 실행합니다.
5. Android 앱 반영은 npm run android:sync로 실행합니다.
6. APK 생성은 npm run android:apk로 실행합니다.

이번 패치:
- SAVE_VERSION 1.99.1 적용
- public/sw.js 캐시 버전 cheonsu-v1-99-1 적용
- public/service-worker.js 캐시 버전 cheonsu-v1991 적용
- public/manifest.webmanifest version 1.99.1 적용
- package.json 버전 1.99.1 적용
- Android 앱 versionName 1.99.1 / versionCode 200 적용
- 공격 모션 시간을 약 1.0~1.5초대로 늘림
- 공격자 준비와 대상 타격 사이에 시간차 추가
- 타일 전체에 큰 무기/스킬 이펙트 추가
- 캐릭터 몸통 이동량을 더 줄이고 무기 궤적 중심으로 재보정

검증:
- npm.cmd run lint
- npm.cmd run build
- npm.cmd run android:sync
- npm.cmd run android:apk

APK 생성 위치:
android/app/build/outputs/apk/debug/app-debug.apk

테스트 포인트:
1. Android 앱을 v1.99.1 APK로 다시 설치
2. 1스테이지 전투 진입 후 공격 모션이 이전보다 느리게 보이는지 확인
3. 기본 공격이 몸통 박치기보다 큰 검격/무기 궤적으로 보이는지 확인
4. 활/저격/마법/방패/야수형 적 공격 모션이 구분되는지 확인
5. 이동, 공격, 스킬, 아이템, 턴종료가 기존처럼 동작하는지 확인
