# 천수 앱 업데이트 가이드

천수 v1.78부터 앱 안에서 최신 버전 정보를 확인할 수 있습니다.
현재 Android 클래식 SRPG 플레이 화면 빌드는 v1.83입니다.

## 기본 구조

앱은 설정 화면의 `앱 업데이트` 카드에서 업데이트 정보 JSON을 읽습니다.

기본 URL:

```text
/updates/latest.json
```

실제 배포에서는 이 JSON 파일을 외부에서 접근 가능한 주소에 올리고, 앱 설정의 `업데이트 정보 URL`에 그 주소를 입력합니다.

## latest.json 형식

```json
{
  "version": "1.83",
  "versionCode": 183,
  "releasedAt": "2026-06-06T12:00:00+09:00",
  "title": "천수 v1.83",
  "required": false,
  "apkUrl": "https://example.com/cheonsu_v183_android_apk.zip",
  "apkFileName": "cheonsu_v183_android_apk.zip",
  "notes": [
    "전투 화면을 개선했습니다.",
    "모바일 조작을 안정화했습니다."
  ]
}
```

## 직접 배포 흐름

1. 새 APK를 빌드합니다.

```bash
npm run android:sync
npm run android:apk
```

2. APK 또는 APK zip을 외부 저장소에 업로드합니다.
3. `latest.json`의 `version`, `versionCode`, `apkUrl`, `notes`를 새 버전에 맞게 수정합니다.
4. 수정한 `latest.json`을 외부 저장소에 업로드합니다.
5. 폰의 천수 앱에서 `설정 > 앱 업데이트 > 업데이트 확인`을 누릅니다.
6. 새 버전이 있으면 다운로드 링크를 열거나 복사합니다.

## 주의

- Google Play를 통하지 않는 APK 설치는 Android 보안상 사용자가 설치 확인을 직접 눌러야 합니다.
- Google Drive 공유 링크는 앱 내부 `fetch`에서 CORS 문제로 실패할 수 있습니다.
- 안정적인 테스트 배포에는 GitHub Releases, 정적 호스팅, 또는 Google Play 내부 테스트를 권장합니다.
- 네이티브 권한, 앱 아이콘, Android 설정이 바뀌는 업데이트는 APK 재설치가 필요합니다.
