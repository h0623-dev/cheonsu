# README_CODEX_HANDOFF.md

이 압축 파일은 천수 프로젝트를 Codex가 이해하도록 만드는 문서 묶음입니다.

## 적용 위치

GitHub 저장소 루트에 아래 파일들을 넣으세요.

```text
AGENTS.md
docs/CHEONSU_CONTEXT.md
docs/CHEONSU_ROADMAP.md
README_CODEX_HANDOFF.md
```

## 파일 역할

### AGENTS.md

Codex가 저장소를 작업할 때 따라야 하는 지침입니다.

### docs/CHEONSU_CONTEXT.md

천수의 전체 기획, 세계관, 현재 구현 상태, 시스템 구조를 설명합니다.

### docs/CHEONSU_ROADMAP.md

Codex에게 순서대로 지시할 수 있는 작업 프롬프트 모음입니다.

## Codex 첫 작업 추천

Codex에 처음 줄 지시문:

```text
AGENTS.md와 docs/CHEONSU_CONTEXT.md, docs/CHEONSU_ROADMAP.md를 읽고 현재 천수 프로젝트 상태를 요약해 주세요.
그 다음 v0.14 반격 시스템을 구현하기 위한 변경 계획을 먼저 제안해 주세요.
아직 코드는 수정하지 마세요.
```

계획이 괜찮으면 두 번째 지시문:

```text
v0.14 반격 시스템을 구현해 주세요.
기존 기능을 유지하고 npm run build가 통과해야 합니다.
변경 후 테스트 방법을 정리해 주세요.
```

## 작업 원칙

- 한 번에 한 기능만 시킨다.
- Codex가 만든 변경은 반드시 실행 테스트한다.
- 동작이 깨지면 다음 기능으로 넘어가지 않는다.
- 저장/이어하기는 매번 테스트한다.
