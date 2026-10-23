# 천수 공개 배포 저장소 작업 규칙

- 이 저장소 객체 ID는 1430565223입니다. APK·서명 OTA·공개 배포 기록과 고정된 서명·배포 제어 코드만 보관합니다.
- 게임 개발 원본은 비공개 h0623-dev/cheonsu-source, 객체 ID 1248868923입니다. 새로운 게임 개발·수정은 그 원본 저장소에서 진행합니다.
- 게임 소스·아트 원본·원본 Git 이력과 commit/tree·개발 ZIP·개인키·서명키·토큰을 이 공개 저장소에 push하거나 업로드하지 않습니다.
- 공개 cheonsu-release Environment는 Branch main 규칙 하나만 허용합니다. 플랫폼의 main 전용 제한과 workflow의 승인된 전체 control SHA 고정을 유지합니다.
- 비공개 원본의 코드를 서명 job에서 실행하지 않습니다. 원본 산출물은 고정된 공개 제어 코드의 GitHub API 출처 승인 절차를 거칩니다.
- 기존 서비스·다운로드·업데이트 URL, signed updates/latest.json 원문·서명 신뢰, 사용자 저장 데이터와 Android 인증서를 유지합니다.
- 기존 공개 Git 이력을 reset·force-push하지 않고 공개 업데이트 포인터를 낮추거나 과거 버전으로 되돌리지 않습니다.
- 비공개 Notion 페이지의 개인 주소·본문·개인 저장 데이터를 이 공개 저장소에 복제하지 않습니다.
