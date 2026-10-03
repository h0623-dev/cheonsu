// Narrative identities only; combat statistics, progress and saved battles remain unchanged.
export const CHAPTER_BOSS_NAMES = {
  13: '이름을 거두는 자', 14: '사원의 계약 감시자', 15: '장막의 파수꾼',
  16: '사슬 감옥장', 17: '그림자 성벽장', 19: '묘역의 기억 수호자',
  20: '왕도 점령대장', 21: '금서의 사제', 22: '검은 기도의 대행자',
  23: '황혼 다리의 수문장', 25: '환영 계단의 감시자', 26: '붉은 수정의 포식자',
  27: '옛 계약의 집행체', 28: '흑천 가론', 29: '흑야의 선봉', 30: '흑야의 잔영',
};
export const getChapterBossName = (stageId, fallback) => CHAPTER_BOSS_NAMES[stageId] || fallback;
