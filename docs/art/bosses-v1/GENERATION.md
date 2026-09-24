# 보스 전용 이미지

- 도구: 내장 image_gen, 신규 생성, 투명 배경.
- 원본: source.png (1374 x 1145), 5행 x 6동작.
- 행: 지휘관 / 서리 여왕 / 잿불 군주 / 대사제 / 심연 군주.
- 열: 대기 / 달리기 A / 달리기 B / 준비 / 공격 / 피격. 복귀는 대기 자세를 재사용.
- 재현: node scripts/prepare-boss-art.cjs 후 node scripts/normalize-map-sprites.cjs.
- 일반 적과 별도 이미지 경로를 사용. 맵은 기존 아군과 같은 400px 높이, 448px 발 기준선. 늑대는 네발 체형 유지.
- 도구 생성 경로: exec-adb2b6ec-aaea-49e9-930c-c1c0b1c0cf31.png.
- 알파 연결 경계가 접하는 준비 자세/마법 끝부분은 검수한 좌표로 분리하고 작은 이웃 조각은 제외.

## 생성 프롬프트

Use case: stylized-concept. Asset type: original tactical RPG boss sprite atlas, 6 columns by 5 rows, 1800x1500 if possible. Transparent RGBA background, no ground, no labels, no text, no gridlines. Each cell is isolated with generous 10 percent padding, no crossing into another cell. Hand-painted Korean fantasy strategy RPG look with detailed face, fabric folds, metal armor, natural 5-head body proportions, soft daylight, crisp silhouette. ALL CHARACTERS FACE RIGHT, THREE QUARTER SIDE VIEW, entire body and entire weapons visible. Same height and costume in each row. Columns are six visibly distinct full body motion frames: 1 relaxed combat ready, 2 running right with left leg forward, 3 running right with right leg forward, 4 windup sword raised or staff pulled back, 5 powerful committed strike or spell cast toward right, 6 recoiling backwards after being hit. Row 1: fortress commander, large ivory and antique gold armor, burgundy cape, winged helmet with face visible, enormous ornate silver greatsword. Row 2: ice queen sorceress, elegant white and pale cyan robes, silver frost crown, tall ice crystal staff, silver hair. Row 3: ember sovereign, charcoal and bronze plate armor, long vermilion cloak, flaming curved blade, crowned helmet. Row 4: occult high priest, ivory and violet ceremonial vestments, turquoise jewel staff, circular gold halo behind head, wise stern face. Row 5: abyss emperor, black and silver layered armor, teal cape, broken silver crown, crescent greatsword with subtle turquoise glow. Clearly original distinct boss identities, not ordinary soldiers, no exaggerated giant scale or huge aura. Consistent warm upper left lighting, playable sprite sheet, beautiful restrained painterly rendering, no photorealism, no pixel art.
