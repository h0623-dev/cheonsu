# 천수 마을 이미지 생성 기록

- 생성 도구: 내장 imagegen, 2026-09-26.
- 게임 적용: `public/art/world-v2/scenes/village.webp`, 1536 x 1024, WebP quality 92.
- 참조: 기존 천수 야영지 이미지의 회화적 스타일만 참조한 신규 이미지.
- 원본 PNG: 생성 도구의 로컬 출력에서 확인 후 프로젝트용 WebP로 변환. 실행 시 생성 도구/API/외부 호스팅에 의존하지 않습니다.
- 배치: 좌측 위 상점, 우측 위 여관, 좌측 아래 장비점, 우측 아래 훈련소, 하단 출전문. 인물/UI는 게임 코드가 별도로 렌더링합니다.

## 생성 프롬프트

Use case: stylized-concept. Asset type: a production background for a playable 2D Korean tactical fantasy RPG village hub. Generate a NEW environment in the painterly, softly textured hand-painted fantasy art direction of the reference camp image, matching natural green trees, muted teal roofs, weathered pale stone, restrained warm wood and clear daylight. Landscape 3:2 composition, high oblique overhead orthographic game camera, NOT a cinematic horizon view. The whole frame is usable town map ground. Four small buildings around a spacious connected central cobblestone plaza: upper left a provisions shop with green cloth canopy and crates, upper right a welcoming inn with red roof and hanging unlettered bed-shaped sign, lower left an armory/blacksmith with steel equipment and small forge, lower right a training pavilion with practice dummies. Doorways face the center plaza. At bottom center a stone road exits the town through an unobstructed archway. Dense trees and mossy stone boundaries along extreme edges only. Main building footprints occupy outer corners; all central paths are unobstructed, including wide horizontal and vertical routes. Large clean walkable center for a separately rendered player sprite. Crisp recognizable building silhouettes at small screen sizes. No people, no characters, no letters, no numbers, no UI, no map markers, no grid lines, no text overlays, no cards, no logos. Balanced quiet daylight, detailed but not cluttered, no blurred areas. The reference is STYLE ONLY, not an edit target.
