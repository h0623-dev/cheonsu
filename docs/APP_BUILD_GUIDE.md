# 천수 앱 빌드 가이드

천수는 React + Vite 웹 빌드를 Capacitor로 감싸 Android 앱으로 만들 수 있습니다.

## 현재 준비 상태

- PWA manifest 준비 완료: `public/manifest.webmanifest`
- 서비스 워커 준비 완료: `public/service-worker.js`, `public/sw.js`
- Capacitor 설정 완료: `capacitor.config.json`
- Android 프로젝트 생성 완료: `android/`
- Android 앱 ID: `com.cheonsu.game`
- Android 앱 이름: `천수`
- 현재 앱 버전: `1.83`
- Android `versionCode`: `183`

참고: 네이티브 Capacitor 앱 안에서는 서비스 워커 등록을 건너뜁니다. 웹/PWA 캐시는 유지하되, APK에서는 새 버전 설치로 리소스를 갱신하는 방향입니다.

## 개발 중 실시간 플레이

```bash
npm run dev
```

브라우저에서 엽니다.

```text
http://localhost:5173/
```

## Android 프로젝트 동기화

웹 빌드를 만들고 Android 프로젝트에 복사합니다.

```bash
npm run android:sync
```

내부적으로 다음을 실행합니다.

```bash
npm run build
npx cap sync android
```

## Android Studio에서 열기

Android Studio가 설치되어 있으면 다음 명령으로 엽니다.

```bash
npm run android:open
```

Android Studio에서 기기 또는 에뮬레이터를 선택한 뒤 Run을 누르면 테스트 설치가 됩니다.

## 디버그 APK 만들기

JDK와 Android SDK가 설치되어 있어야 합니다.

```bash
npm run android:apk
```

성공하면 APK는 보통 아래 위치에 생성됩니다.

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 현재 PC 빌드 상태

현재 PC는 Android Studio 내장 JDK와 Android SDK 경로를 잡아 디버그 APK 빌드가 가능합니다.

프로젝트별 SDK 경로는 아래 파일에 기록되어 있습니다.

```text
android/local.properties
```

다른 PC에서 빌드할 때 `JAVA_HOME` 또는 Android SDK 경로 오류가 나오면 아래 준비물을 확인합니다.

필요한 설치:

- Android Studio
- Android SDK Platform 35
- JDK 17 이상
- `JAVA_HOME` 환경 변수

Android Studio를 설치하면 내장 JDK를 사용할 수 있습니다.
보통 경로는 아래와 같습니다.

```text
C:\Program Files\Android\Android Studio\jbr
```

환경 변수 예시:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

설치 후 다시 실행합니다.

```bash
npm run android:apk
```
