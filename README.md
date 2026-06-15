# 천수 (Cheonsu)

React + Vite 기반 모바일 세로 SRPG 프로토타입입니다.

현재 빌드: `v1.99.1`

## 개발 실행

```bash
npm install
npm run dev
```

브라우저 주소:

```text
http://localhost:5173/
```

## 웹 빌드

```bash
npm run build
```

## 앱 패키징 상태

천수는 Capacitor 기반 Android 앱 프로젝트가 준비되어 있습니다.

- 앱 ID: `com.cheonsu.game`
- 앱 이름: `천수`
- Android 프로젝트: `android/`
- 웹 빌드 출력: `dist/`
- Android 앱 버전: `1.99.1`
- Android `versionCode`: `200`
- 앱 내 업데이트 확인: `설정 > 앱 업데이트`
- 앱 아이콘: `public/icons/cheonsu-app-icon-master.png`

웹 빌드를 Android 프로젝트에 반영합니다.

```bash
npm run android:sync
```

Android Studio에서 프로젝트를 엽니다.

```bash
npm run android:open
```

디버그 APK를 만듭니다.

```bash
npm run android:apk
```

APK 생성 위치:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## APK 빌드 준비물

현재 프로젝트 설정은 앱 빌드 준비가 되어 있지만, 이 PC에서 APK를 만들려면 Android 빌드 환경이 필요합니다.

- Android Studio
- Android SDK Platform 35
- JDK 17 이상
- `JAVA_HOME` 환경 변수

자세한 절차는 [docs/APP_BUILD_GUIDE.md](docs/APP_BUILD_GUIDE.md)를 확인하세요.

## 참고 문서

- 앱 빌드 가이드: [docs/APP_BUILD_GUIDE.md](docs/APP_BUILD_GUIDE.md)
- 앱 업데이트 가이드: [docs/APP_UPDATE_GUIDE.md](docs/APP_UPDATE_GUIDE.md)
- 앱 출시 체크리스트: [docs/APP_RELEASE_CHECKLIST.md](docs/APP_RELEASE_CHECKLIST.md)
