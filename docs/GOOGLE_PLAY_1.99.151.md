# Google 로그인 및 Play 출시 준비

기준일: 2026-10-01. 현재 버전 1.99.151 / Android 350 / 패키지 com.cheonsu.game.

## 현재 상태

- 공격 또는 공격 스킬의 대상을 선택하면 별도의 전투 예측창 없이 바로 실행합니다. 대상 선택 전 취소, 사거리, 쿨다운, 행동 잠금, 적 반격 검사는 유지합니다.
- 타이틀의 계정 버튼, 설정의 계정 탭, Google 로그인/로그아웃/계정 삭제 코드를 추가했습니다. 저장 파일을 로그인 계정으로 전송하거나 덮어쓰지 않습니다. 클라우드 저장은 이번 범위에 포함하지 않습니다.
- **실제 로그인은 미개통입니다.** Firebase 프로젝트와 Android OAuth 설정을 아직 받지 못했습니다. 현재 버튼은 연결 준비 상태이며 가짜 로그인이나 임의 프로젝트를 사용하지 않습니다.
- Android compile/target API 36, Gradle 플러그인 8.9.2, Capacitor 7용 Firebase Authentication 7.5.0 및 Firebase Web 11.10.0을 사용합니다. Google 로그인은 Android Credential Manager, 웹은 Firebase 팝업 방식을 사용합니다.
- 개발 APK는 기존 debug 인증서와 GitHub 서명 자동 패치를 유지합니다. Play release 빌드는 LiveUpdate 플러그인을 등록하지 않아 GitHub 패치를 내려받지 않고 스토어 업데이트만 사용합니다.
- Firebase 설정이 없으면 네이티브 로그인 플러그인을 등록하지 않습니다. 앱 실행 시 미설정 Firebase 때문에 오프라인 게임까지 실패하지 않도록 한 조치입니다. 두 플러그인은 android/settings.gradle에서 명시적으로 의존하며 MainActivity에서 조건부 등록합니다.
- 이번 네이티브 변경은 기존 APK에 OTA만으로 적용할 수 없습니다. 350 미만 APK는 새 APK 설치 안내를 받습니다. 자동 패치 채널 자체는 새 APK용으로 계속 배포합니다.
- **Play 공개 출시/심사 제출은 하지 않았습니다.** unsigned AAB는 패키징 검증용이며 콘솔 업로드용이 아닙니다.

## 사용자에게 필요한 정보

1. Firebase 프로젝트 ID와 웹 앱의 공개 설정(apiKey/authDomain/projectId/appId).
2. 같은 프로젝트에서 내려받은 Android google-services.json. 등록 패키지는 com.cheonsu.game입니다.
3. Google Play Console 개발자 계정 개설 및 본인/조직 확인 완료 여부.
4. 출시 운영자 이름, 지원 이메일, 공개 개인정보 처리방침 URL과 앱 외부 계정 삭제 요청 URL.
5. 기존 정식 업로드 서명 키 보유 여부. 비밀번호·서비스 계정 개인 키·keystore를 GitHub나 채팅에 붙이지 마세요.

## Google 연결 절차

1. 사용자 소유 Firebase 프로젝트에서 Android 앱 com.cheonsu.game과 웹 앱을 등록합니다. Authentication → Sign-in method에서 Google을 활성화하고 지원 이메일을 지정합니다.
2. Firebase Android 앱에 개발 APK의 SHA-1/SHA-256 인증서를 등록합니다. 정식 출시에는 업로드 키뿐 아니라 **Play 앱 서명 키**의 SHA-1/SHA-256도 추가해야 합니다. Play가 설치 APK를 다시 서명하기 때문입니다.
3. Android 설정 파일을 android/app/google-services.json에 둡니다. 웹 OAuth client_type=3이 포함되어야 하며, JSON과 웹 설정의 프로젝트가 같아야 합니다. 이 파일은 Git과 소스 ZIP에서 제외됩니다.
4. src/data/accountConfig.json의 공개 Firebase 설정, 운영자·문의·정책 URL을 채우고 enabled를 true로 바꿉니다. Web apiKey는 클라이언트 식별용 공개 값이며 서버 비밀 키가 아닙니다. Firebase 콘솔에서 승인 도메인에 실제 웹 호스트를 등록합니다. 개발용 localhost도 필요한 경우 명시적으로 추가합니다.
5. 최소 수집 범위는 기본 Google 프로필입니다. Drive/Gmail 등의 추가 권한은 요청하지 않습니다. 인증 토큰은 SDK가 관리하며 게임 저장, 로그, ZIP에 복사하지 않습니다.
6. 새로운 버전으로 APK를 다시 빌드합니다. google-services.json 변경은 네이티브 지문에 포함되므로 최소 APK 버전과 docs/update-native-baseline.json도 검토하여 갱신합니다.
7. 실기기에서 최초 로그인, 취소, 오프라인, 재실행, 로그아웃, 다른 계정 선택, 최근 인증이 필요한 삭제를 검사합니다. 로그인 전후 저장·골드·장비가 같은지 확인합니다.

## Play 제출 절차

1. 기존 테스트 APK는 개발용 debug 서명입니다. Play에는 별도 안전하게 보관하는 업로드 키와 Play App Signing을 사용합니다. 서명이 달라지면 테스트 APK 위에 Play 앱을 바로 덮어쓸 수 없으므로 사전에 저장을 내보내고 별도 이전 절차를 검증합니다. 사용자에게 앱 삭제를 먼저 지시하지 마세요.
2. 셸 환경에 CHEONSU_UPLOAD_KEYSTORE(절대 경로), CHEONSU_UPLOAD_STORE_PASSWORD, CHEONSU_UPLOAD_KEY_ALIAS, CHEONSU_UPLOAD_KEY_PASSWORD를 설정합니다. CI에서는 비밀 저장소를 사용합니다. 키와 비밀번호는 소스/문서에 넣지 않습니다.
3. public/legal의 페이지는 **미완성 준비본**입니다. 운영자·수집 목적·제3자/국외 처리·보관 기간·연락처·시행일을 실제 운영과 법률 검토에 맞춰 완성하고 공개 HTTPS 페이지에 호스팅합니다. 외부 삭제 페이지는 단순 안내뿐 아니라 앱 없이도 접수하고 본인 확인할 수 있는 실제 경로가 있어야 합니다.
4. Play Console에서 게임/한국어/무료 또는 유료 여부를 결정하고 앱을 생성합니다. 이름·짧은 설명·상세 설명, 512x512 아이콘, 1024x500 그래픽, 실제 플레이 스크린샷을 준비합니다. 광고/구매/대상 연령/콘텐츠 등급/앱 접근 안내/데이터 보안 양식은 실제 기능에 맞춰 작성합니다.
5. 본 앱의 로그인 사용자는 이메일/이름/계정 식별자가 인증 서비스에 처리됩니다. 기기 저장이 로컬이라는 이유로 앱 전체를 수집 없음으로 일괄 선언하지 마세요. Firebase SDK의 데이터 공개 가이드와 현재 코드에 맞춰 수집·공유·보안 목적을 확인합니다. 분석/광고 SDK는 이번 패치에서 추가하지 않았습니다.
6. 배경·캐릭터·음원·폰트·아이콘의 상업 배포 권리를 전수 확인합니다. 준비 문서에 권리 검수가 완료됐다고 미리 표시하지 않았습니다.
7. 확인을 마친 항목만 docs/play-release-review.json에서 true로 바꿉니다. npm run release:check는 누락을 표시하며 npm run android:aab는 미완료 상태의 제출 빌드를 차단합니다. npm run android:aab:check는 로컬 기술 검증용으로만 체크를 생략합니다.
8. 서명된 AAB를 내부 테스트에 먼저 올리고, 사전 출시 보고서와 실제 Galaxy 제스처/3버튼, 세로/가로, Android 16 edge-to-edge, 오프라인, 16KB 환경을 검증합니다. 현재 직접 확인할 Android 기기는 연결되어 있지 않습니다.
9. 2023-11-13 이후 생성한 개인 개발자 계정은 조건에 해당하면 비공개 테스트 12명·연속 14일 요건 등을 충족한 뒤 프로덕션 액세스를 신청합니다. 본인 계정 콘솔에 표시되는 최신 조건을 최종 확인합니다. 승인/기간/게시를 보장하지 않습니다.

## 스토어 문구 초안

이름: 천수

짧은 설명: 기사단을 이끌고 봉화의 비밀을 좇는 턴제 전술 RPG

상세 설명: 천수 기사단과 함께 30개 전장을 지나 왕도로 향하세요. 지형과 무기의 사거리를 살피고, 동료마다 다른 기술을 조합해 전투를 이끌어 갑니다. 마을에서 장비와 훈련을 준비하고 전장에 숨겨진 보물을 찾아 기사단을 성장시키세요. 플레이 진행은 기기에 저장됩니다. Google 계정 로그인과 클라우드 저장은 별개의 기능이며 현재 클라우드 동기화는 제공하지 않습니다.

로그인 개통 여부, 유료/광고 여부와 최종 콘텐츠에 맞춰 제출 전에 수정해야 합니다.

## 공식 근거

- API 36: https://developer.android.com/google/play/requirements/target-sdk
- Firebase Android Google 로그인: https://firebase.google.com/docs/auth/android/google-signin
- Capacitor Firebase 플러그인: https://capawesome.io/docs/sdks/capacitor/firebase/authentication/
- Firebase 개인정보/데이터 공개: https://firebase.google.com/support/privacy
- 계정 삭제: https://support.google.com/googleplay/android-developer/answer/13327111
- 앱 등록: https://support.google.com/googleplay/android-developer/answer/9859152
- 개인 계정 테스트: https://support.google.com/googleplay/android-developer/answer/14151465
- 16KB 호환: https://developer.android.com/guide/practices/page-sizes
- Google 로그인 로고: https://developers.google.com/identity/branding-guidelines
