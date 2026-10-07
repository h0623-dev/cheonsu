# 미사용 구형 이미지와 템플릿 정리

작성일: 2026-10-07 KST.

사용자는 전체 저작권·출처 정리를 승인했으며, 초기 아트도 Codex로 제작했다고 확인했습니다. 생성 기록의 공백만으로 타사 작품이나 침해 자료로 판정하지 않습니다. 이 정리는 현재 게임에서 표시하지 않는 초기 이미지와 개발 템플릿을 새 배포 소스에서 제외하는 작업입니다.

## 제거 범위

총 25개 파일을 작업 소스에서 제거했습니다. 이미지에 있는 권리자 표시를 지우거나 다른 이름으로 바꾸어 재사용하지 않습니다.

| 구분 | 파일 수 | 정리 이유 |
| --- | ---: | --- |
| 초기 전체 메뉴 이미지 | 2 | 현재 화면에서는 사용하지 않으며 `© 2024 STUDIO ASCENSION. ALL RIGHTS RESERVED.`라는 확인되지 않은 권리자 표시가 포함되어 있습니다. 표시만 지우지 않고 파일 전체를 배포 소스에서 제외합니다. |
| 초기 참조 이미지 | 9 | 현재 게임에서 사용하지 않는 콘셉트 보드 조각입니다. 일부에 천수 제목이 있으며, 다른 게임의 이미지라고 단정하지 않습니다. |
| 초기 간이 콘셉트 이미지 | 9 | 현재 게임에서 사용하지 않는 초기 레이아웃 시안입니다. |
| Vite·React 개발 템플릿 이미지 | 5 | 게임과 관계없는 로고·개발 템플릿 장식·소셜 아이콘 모음입니다. 현재 페이지의 앱 아이콘은 `public/art/world-v2/icon-192.png`를 사용합니다. |

정확한 제거 경로:

```text
public/ui/cheonsu_main_menu_art.png
public/ui/main_menu_bg.png
public/art/ref-battle.png
public/art/ref-camp.png
public/art/ref-campaign.png
public/art/ref-cutscene.png
public/art/ref-equipment.png
public/art/ref-menu.png
public/art/ref-opening.png
public/art/ref-support.png
public/art/ref-victory.png
public/art/concept-battle.png
public/art/concept-camp.png
public/art/concept-campaign.png
public/art/concept-cutscene.png
public/art/concept-equipment.png
public/art/concept-menu.png
public/art/concept-opening.png
public/art/concept-support.png
public/art/concept-victory.png
public/favicon.svg
public/icons.svg
src/assets/hero.png
src/assets/react.svg
src/assets/vite.svg
```

## 연결 정리와 보존

수정 전 소스의 정적 참조 조사에서는 위 이미지의 게임 화면 표시·동적 경로 조합을 찾지 못했고, 다음 서비스 워커의 사전 캐시 경로 3개가 남아 있었습니다. 삭제 파일을 계속 내려받지 않도록 그 경로만 목록에서 제거했습니다.

- `public/sw.js`: `/ui/cheonsu_main_menu_art.png`.
- `public/service-worker.js`: `/favicon.svg`, `/ui/main_menu_bg.png`.

사용 중인 캐릭터·대기·전투·대화 이미지, 지형, 실제 앱 아이콘, 기존 저장·진행도·수집 데이터는 이 정리 범위에 포함하지 않습니다. 기존 저장이나 캐시를 일괄 초기화하는 로직도 추가하지 않습니다. 구 홍보 이미지, 초기 초상화, 레거시 fallback 등 나머지 파일은 출처 기록이 부족하다는 이유만으로 임의 제거하지 않습니다.

Vite의 `public` 복사와 `scripts/package-source.mjs`의 소스 파일 수집은 현재 소스를 사용하므로, 이 파일들은 이후 최종 소스로 새로 제작하는 APK·OTA·Safari 웹·개발 소스 ZIP의 입력에서 제외됩니다. 이 문서는 이미 공개된 과거 버전의 다운로드 파일이나 사용자가 가진 로컬 복사본을 변경했다는 뜻이 아닙니다. 새 버전의 제작·배포 완료 여부는 해당 빌드 문서를 따릅니다.

제거 전 파일은 Git 이력의 전체 소스 커밋 `91f3feb77220fd53dd1547a9620723af40f7a132`에 남습니다. 공유 Git 이력이나 고정 원복 브랜치를 강제 변경하지 않았습니다. 역사적 원본은 권리자 표시를 포함한 원래 상태로 보존됩니다. 다시 배포할 때에는 사용 여부와 출처 기록을 먼저 판단합니다.

## 수행 범위

기존 코드·문서·캐시 목록을 읽어 제거 범위를 결정하고 파일 및 캐시 경로를 정리했습니다. 게임 실행·브라우저 QA·테스트·린트·검증 빌드는 수행하지 않았습니다. 법률상 비침해를 보증하거나 모든 아트의 권리 심사를 마쳤다는 의미가 아닙니다.

사용자 지시에 따라 수정 후 별도 검증은 실행하지 않았습니다.
