import { getBossSpriteKey } from './bossArt.js';
import { getBattlefieldPlan } from './battlefieldPlans.js';
import { formatAttackRange } from '../engine/movement.js';
import { getSkillStatus } from '../engine/statusEngine.js';
import { STATUS_INFO } from './statuses.js';

// Presentation only. These records never replace a unit's name, art, statistics,
// mission, terrain, phase rules or saved data. Names reflect chapterIdentity.js,
// including the living Garon in chapter 28 and his stolen image in chapter 30.
const chapter = (bossName, stageName, epithet, quote, tone, scene, artKey, atmosphere, phaseQuote, rankLabel = '적 지휘관') =>
  Object.freeze({ bossName, stageName, epithet, quote, tone, scene, artKey, atmosphere, phaseQuote, rankLabel });

export const BOSS_PRESENTATIONS = Object.freeze({
  1: chapter('초소장', '국경 초소', '국경을 가르는 철벽',
    '멈춰라. 이 국경을 넘을 자는 내가 정한다.', 'commander', 'border', 'boss_commander',
    '길목에 선 군기가 바람을 가르고, 무거운 갑주 소리가 진군을 막는다.', '이 초소가 무너지기 전에는 물러서지 않는다.'),
  2: chapter('도적장', '협곡 매복', '협곡에 드리운 흉검',
    '이 길을 택한 대가는 검으로 받아 내겠다.', 'commander', 'ravine', 'boss_commander',
    '좁은 협곡에 발소리가 메아리치고, 바위 너머로 적장의 칼날이 드러난다.', '물러설 길을 찾는 건 네 쪽이다.'),
  3: chapter('흑천 가론', '성문 돌파', '검은 맹세의 기사',
    '살아서 이 문까지 왔군. 이제 너희의 맹세를 보겠다.', 'abyss', 'gate', 'boss_abyss',
    '닫힌 성문 아래, 오래된 기사단의 검이 다시 들린다.', '그 검에 담긴 약속을 끝까지 지켜 보아라.', '관문의 강적'),
  4: chapter('화염 마도사', '불타는 숲', '잿빛 숲의 불씨',
    '불길 속의 목소리도, 네 이름도 여기 남겨라.', 'ember', 'forest', 'boss_ember',
    '숲의 잿가루가 붉게 떠오르고, 불빛 사이에서 지팡이가 빛난다.', '꺼진 줄 알았느냐. 불은 아직 남아 있다.'),
  5: chapter('요새 기사단장', '무너진 요새', '무너져도 꺾이지 않는 성벽',
    '벽은 무너졌다. 하지만 내 명령은 무너지지 않았다.', 'commander', 'fortress', 'boss_commander',
    '깨진 성벽 너머 군기가 솟고, 요새의 마지막 지휘관이 검을 겨눈다.', '이 폐허마저 내 등 뒤로는 넘겨주지 않는다.'),
  6: chapter('빙결 마녀', '얼어붙은 계곡', '침묵을 가둔 겨울',
    '이 얼음 아래에서는 어떤 이름도 사라지지 않는다.', 'frost', 'bridge', 'boss_frost',
    '빙교 아래 불꽃이 갇혀 있고, 계곡의 냉기가 한 사람에게 모인다.', '끝내 이 고요를 깨겠다는 것이냐.', '봉화의 수호자'),
  7: chapter('그림자 지휘관', '그림자 숲', '수맥을 삼킨 검은 깃발',
    '숲이 감춘 길을 찾았군. 돌아가는 길도 찾을 수 있겠느냐.', 'shadow', 'forest', 'boss_abyss',
    '안개가 나무 사이를 흐르고, 빛이 닿지 않는 자리에 적장의 윤곽이 선다.', '끝까지 따라와 보아라. 이 숲의 가장 깊은 곳까지.'),
  8: chapter('혈마도사', '붉은 여울', '붉은 기억의 집전자',
    '흐르는 것은 물이 아니다. 너희가 잃어버릴 기억이다.', 'ember', 'river', 'boss_ember',
    '여울 밑 수정이 핏빛으로 울리고, 강 건너 의식의 주인이 모습을 드러낸다.', '흩어진 목소리를 다시 내게 돌려라.'),
  9: chapter('폐허 약탈단장', '폐허의 시장', '꺼지지 않은 등불의 약탈자',
    '돌아올 사람이 없다면, 이 거리의 주인은 나다.', 'commander', 'ruins', 'boss_commander',
    '빈 가게의 등불 아래로 칼끝이 스치고, 시장의 마지막 길이 가로막힌다.', '등불 하나까지 내 손에서 가져가 보아라.'),
  10: chapter('주술핵 수호자', '흑야의 탑', '갇힌 목소리의 문지기',
    '탑의 노래는 멎지 않는다. 너희의 목소리도 보태리라.', 'shadow', 'tower', 'boss_oracle',
    '성벽 안쪽에서 겹친 목소리가 울리고, 주술핵을 지키는 그림자가 일어선다.', '이 안에 남은 목소리는 누구도 놓아주지 않는다.'),
  11: chapter('항구 지휘관', '불길한 항구', '귀환로를 막은 군기',
    '출항 명령은 내려졌다. 부두에서 한 걸음도 더 오지 마라.', 'commander', 'harbor', 'boss_commander',
    '검은 선체 뒤로 봉화가 오르고, 부두의 군기가 바닷바람에 펼쳐진다.', '마지막 배가 떠날 때까지 이 길을 지킨다.'),
  12: chapter('재의 대주교', '재의 왕좌', '재 위에 세운 거짓 구원',
    '잃은 이를 되찾고 싶다면, 남은 것을 내놓아라.', 'ember', 'throne', 'boss_commander',
    '봉화의 힘이 왕좌 아래 모이고, 재 속에 묻힌 기도문이 붉게 빛난다.', '내 구원을 거부한 대가를 보아라.', '왕좌의 지배자'),
  13: chapter('이름을 거두는 자', '암살자의 골목', '기록에서 지워진 칼날',
    '네 이름이 사라지면, 누가 네가 왔음을 기억하겠느냐.', 'shadow', 'alley', 'boss_commander',
    '도성 골목의 마지막 등불이 흔들리고, 이름 없는 명령이 칼끝에 실린다.', '남은 이름까지 모두 가져가겠다.'),
  14: chapter('사원의 계약 감시자', '저주받은 사원', '영원을 강요하는 인장',
    '맹세는 이미 새겨졌다. 살아 있는 자도 이를 거스를 수 없다.', 'shadow', 'temple', 'boss_oracle',
    '사원 벽의 지워진 이름들 위로, 낡은 계약의 인장이 떠오른다.', '계약을 지우려면 그 무게부터 견뎌라.'),
  15: chapter('장막의 파수꾼', '달 없는 협곡', '달빛을 끊은 장막',
    '이곳의 밤은 끝나지 않는다. 돌아가라.', 'abyss', 'ravine', 'boss_abyss',
    '달 없는 협곡의 수림에 검은 막이 내려앉고, 그 아래 파수꾼이 선다.', '끝을 보겠다면 이 밤을 넘어 보아라.'),
  16: chapter('사슬 감옥장', '사슬 감옥', '빙교를 잠근 쇠사슬',
    '여기에는 이름도 귀환도 없다. 명령만 있을 뿐이다.', 'frost', 'prison', 'boss_commander',
    '감옥으로 이어지는 빙교 위에서 쇠사슬과 무거운 검이 함께 울린다.', '마지막 문은 아직 내 손에 있다.'),
  17: chapter('그림자 성벽장', '그림자 성벽', '옛 군령의 검은 성벽',
    '너희가 세운 방어다. 넘어설 수 있다면 와라.', 'shadow', 'wall', 'boss_commander',
    '성벽 아래 수로에 옛 기사단의 신호가 비치고, 적장의 그림자가 길게 늘어진다.', '그 신호를 기억하는 것은 너희만이 아니다.'),
  18: chapter('밤의 집행자', '밤의 집행자', '왕의 목소리를 훔친 자',
    '명령을 믿은 것은 너희다. 그 피의 무게도 함께 지거라.', 'abyss', 'altar', 'boss_commander',
    '심연의 제단 위에서 거짓 왕명이 울리고, 밤의 집행자가 전면에 나선다.', '끝까지 내 목소리를 거역하겠다는 것이냐.', '그림자 전쟁의 주인'),
  19: chapter('묘역의 기억 수호자', '옛 천수의 묘', '이름만 남은 묘역의 검',
    '잠든 이름을 깨우지 마라. 너희의 기억도 여기 묻으리라.', 'frost', 'tomb', 'boss_abyss',
    '눈 덮인 묘비 사이로 바람이 멎고, 시신 없는 무덤의 수호자가 일어선다.', '잊히지 않으려는 맹세는 아직 끝나지 않았다.'),
  20: chapter('왕도 점령대장', '무너진 왕도', '얼어붙은 왕관의 군령',
    '주인이 떠나도 왕도는 남는다. 이 거리는 내 명령을 따른다.', 'frost', 'capital', 'boss_commander',
    '무너진 왕도의 눈길에 군화 소리가 번지고, 낡은 왕관의 깃발이 펼쳐진다.', '왕도가 무너져도 이 군기는 꺾이지 않는다.'),
  21: chapter('금서의 사제', '심연의 도서관', '진실을 봉한 마지막 장',
    '펼쳐서는 안 될 기록이 있다. 네가 읽을 마지막 문장을 골라라.', 'shadow', 'library', 'boss_oracle',
    '얼음섬 위 서가에서 책장이 떨리고, 금서를 지키는 사제가 길을 막는다.', '진실의 무게를 네가 감당할 수 있겠느냐.'),
  22: chapter('검은 기도의 대행자', '검은 기도실', '혼자를 부르는 기도',
    '모두를 구하고 싶다면, 너 하나만 이리로 오라.', 'abyss', 'chapel', 'boss_abyss',
    '무너진 기도실에 다정한 듯 낯선 목소리가 울리고, 제단의 그림자가 움직인다.', '결국 누군가는 이 자리에 남아야 한다.'),
  23: chapter('황혼 다리의 수문장', '황혼의 다리', '저무는 길의 마지막 검',
    '함께 건너겠다고? 이 다리는 그런 약속을 들어준 적 없다.', 'frost', 'bridge', 'boss_commander',
    '얼어붙은 협곡 위에 황혼이 걸리고, 다리 끝의 검이 마지막 빛을 가른다.', '단 한 걸음도 더 내주지 않겠다.'),
  24: chapter('흑야의 심장', '흑야의 심장', '잊힌 이름들의 검은 맥박',
    '잊지 마라… 우리를 이 밤에 남기지 마라.', 'abyss', 'core', 'boss_abyss',
    '관문 너머에서 검은 맥박이 울리고, 빼앗긴 기억들이 하나의 그림자로 모인다.', '우리를 다시 지우게 두지 않겠다.', '흑야의 근원'),
  25: chapter('환영 계단의 감시자', '끝없는 계단', '귀환을 잃은 순례의 끝',
    '얼마나 올라왔는지 기억하느냐. 아직 첫 계단이다.', 'shadow', 'stair', 'boss_commander',
    '되풀이되는 계단의 분기점에서, 움직이지 않던 감시자가 천천히 검을 든다.', '지친 발로 그 약속을 어디까지 옮기겠느냐.'),
  26: chapter('붉은 수정의 포식자', '붉은 달의 성소', '거짓 달을 삼킨 칼날',
    '하늘을 보아라. 너희의 기억이 저 달을 채운다.', 'ember', 'altar', 'boss_ember',
    '성소의 수정이 붉은 달을 비추고, 그 빛을 삼킨 형체가 길을 막는다.', '아직 차지 않았다. 남은 기억도 내놓아라.'),
  27: chapter('옛 계약의 집행체', '천공 관문', '한 사람을 고르는 관문',
    '계약을 이행하라. 가장 강한 한 사람만 남아라.', 'abyss', 'gate', 'boss_commander',
    '천공으로 이어지는 검은 교량 위에, 변하지 않은 계약의 군령이 내려온다.', '새 약속은 인정되지 않는다. 계약을 이행하라.'),
  28: chapter('흑천 가론', '잊힌 수호자', '돌아오지 못한 맹세',
    '그 말이 검보다 무겁다면, 내 맹세를 넘어 보아라.', 'abyss', 'waterway', 'boss_abyss',
    '폐성의 수문 앞에서 오래된 기사가 홀로 검을 들고, 기사단의 이름이 다시 울린다.', '끝까지 나를 데려가겠다면, 물러서지 마라.', '마지막 수호자의 시험'),
  29: chapter('흑야의 선봉', '파멸의 평원', '새벽을 삼키는 선봉',
    '돌아갈 곳은 없다. 마지막 길마저 밤에 잠기리라.', 'abyss', 'ruins', 'boss_abyss',
    '부서진 평원의 길마다 검은 기운이 번지고, 흑야의 선봉이 귀환로를 가른다.', '새벽에 닿기 전에 너희의 약속부터 꺾겠다.'),
  30: chapter('흑야의 잔영', '마지막 천수', '빼앗긴 맹세의 왕좌',
    '모두 돌아가겠다는 약속은, 이 밤을 넘지 못한다.', 'abyss', 'throne', 'boss_abyss',
    '최후의 왕좌에서 가론의 갑옷을 훔친 잔영이 일어나, 기사단의 맹세와 마주 선다.', '너희가 지킨 모든 이름을 이 밤에 가두리라.', '흑야 최종 결전'),
  31: chapter('갈대등 무리장', '돌아온 파도', '닫힌 해안의 철갑',
    '길목은 닫혔다. 옛 명령이 끝날 때까지.', 'tide', 'harbor', 'crab_guard',
    '방파제에 파도가 부서지고, 해안의 군락을 이끄는 거대한 등껍질이 솟는다.', '이 껍질 아래 명령은 아직 살아 있다.'),
  32: chapter('비늘가시 지휘사수', '물길의 창', '석교를 겨눈 차가운 눈',
    '두 다리의 끝은 하나다. 네 발걸음은 이미 보인다.', 'tide', 'bridge', 'eel_archer',
    '물길의 두 석교 사이에서 비늘이 번쩍이고, 팽팽한 활시위가 길을 겨눈다.', '마지막 발걸음까지 놓치지 않겠다.'),
  33: chapter('포자등 군락주', '포자가 핀 수문', '꺼지지 않는 군락의 등불',
    '뿌리는 이어져 있다. 한 줄기를 꺾어도 끝나지 않는다.', 'tide', 'waterway', 'spore_colony',
    '수문 양쪽으로 포자의 빛이 번지고, 가장 큰 군락이 느리게 고개를 든다.', '이 수문을 감싼 뿌리는 아직 남아 있다.'),
  34: chapter('조개암초 파수장', '두 개의 귀환로', '귀환로에 걸린 닻',
    '어느 길로 오든, 마지막 문은 내가 지킨다.', 'tide', 'ruins', 'crab_guard',
    '침수된 창고의 두 길이 만나는 곳에서, 암초 같은 갑각이 문을 가린다.', '이 문을 지나려면 끝까지 밀고 와라.'),
  35: chapter('심해 수문장 모르칸', '심해의 수문장', '옛 바다를 잠근 열쇠',
    '수문의 권한은 넘겨주지 않는다. 바다의 명령은 하나다.', 'tide', 'waterway', 'tide_keeper',
    '원형 안뜰의 물결이 거대한 창을 향해 모이고, 심해의 수문장이 계단 위에 선다.', '닫힌 물길의 무게를 견뎌 보아라.', '해안의 지배자'),
  36: chapter('눈안개 무리장', '눈 아래의 발자국', '설원을 울리는 흰 뿔',
    '낯선 발자국은 이 능선을 넘지 못한다.', 'frost', 'highland', 'mist_ram',
    '눈다짐 능선에 굵은 발굽 자국이 찍히고, 눈안개 속의 뿔이 드러난다.', '끝까지 올라왔다면 물러서지 마라.'),
  37: chapter('빙정날개 군주', '바람 속의 손길', '냉기를 가르는 수정 날개',
    '온기를 좇는 발걸음이 여기까지 들리는구나.', 'frost', 'highland', 'crystal_insect',
    '온천 위 수증기 사이로 수정 날개가 펼쳐지고, 바람이 날카로운 소리를 낸다.', '바람이 멎어도 이 날개는 꺾이지 않는다.'),
  38: chapter('온천도롱뇽 우두머리', '따뜻한 돌', '뒤틀린 샘의 불꽃',
    '샘의 명령은 바뀌지 않는다. 다가오지 마라.', 'ember', 'highland', 'spring_salamander',
    '눈 덮인 돌길에서 뜨거운 김이 피어나고, 샘을 지키던 불꽃이 적을 향한다.', '이 온기를 네게 내줄 수는 없다.'),
  39: chapter('설원 샘의 파수장', '흰 능선의 약속', '온기의 문턱에 선 뿔',
    '샘으로 가는 길은 아직 열리지 않았다.', 'frost', 'ravine', 'mist_ram',
    '두 귀환길 사이로 흰 능선이 솟고, 샘의 파수장이 눈길을 깊게 밟는다.', '한 걸음 더 오려면 이 뿔을 넘어라.'),
  40: chapter('빙정 여왕 세르카', '얼음에 갇힌 온기', '온기를 가둔 백색 왕관',
    '샘의 온기는 의식의 것이다. 누구에게도 나누지 않겠다.', 'frost', 'altar', 'frost_queen',
    '치유샘을 둘러싼 수정이 왕관처럼 빛나고, 흰 냉기 속에서 여왕이 눈을 뜬다.', '이 의식이 끝나기 전에는 겨울도 끝나지 않는다.', '고원의 지배자'),
  41: chapter('금실 인형장', '멎지 않는 망치', '주인 없는 공방의 검',
    '작업은 끝나지 않았다. 정지 명령은 없다.', 'resonance', 'workshop', 'gold_puppet',
    '빈 공방에서 망치 소리가 겹치고, 금실에 걸린 검이 작업대를 떠난다.', '멈추지 마라. 명령은 아직 남아 있다.'),
  42: chapter('가면종 감독관', '종을 멈출 시간', '귀환을 허락하지 않는 종',
    '자리를 이탈하지 마라. 다음 종이 울릴 때까지.', 'resonance', 'workshop', 'bell_keeper',
    '조립실의 빈 가면들이 같은 방향을 향하고, 감독관의 종이 낮게 울린다.', '종이 멎으면 너희도 멈추는 것이다.'),
  43: chapter('접힌 서고의 기록장', '접힌 기록실', '이름을 접어 버린 서고',
    '너희의 이름은 불필요하다. 번호만 남겨라.', 'resonance', 'archive', 'scroll_spirit',
    '접힌 기록실의 문장이 허공에 풀리고, 지워진 이름 위로 새로운 명령이 덮인다.', '찢어진 기록도 명령을 잊지 않는다.'),
  44: chapter('공방 공정장', '이름 없는 작업대', '끝나지 않는 공정의 칼날',
    '작업대는 비어도 공정은 계속된다.', 'resonance', 'workshop', 'gold_puppet',
    '세 작업로의 금실이 중앙으로 모이고, 마지막 공정장이 검을 맞물린다.', '마지막 공정까지 누구도 나갈 수 없다.'),
  45: chapter('공명 집행관 아르켄', '공명의 집행관', '옛 서명만 읽는 심판',
    '공동 권한은 등록되어 있지 않다. 집행을 시작한다.', 'resonance', 'workshop', 'resonance_judge',
    '제어실의 모든 고리가 하나의 음으로 울리고, 집행관의 창에 옛 서명이 빛난다.', '판결은 철회되지 않는다. 다시 집행한다.', '공방의 지배자'),
  46: chapter('월식 무리장', '별이 남긴 길', '별빛을 밟는 밤의 발톱',
    '별의 길에도 주인은 있다. 네 냄새는 낯설다.', 'shadow', 'starfield', 'eclipse_cat',
    '숲 회랑의 별빛 사이에서 눈동자가 열리고, 달그늘의 발톱이 땅을 누른다.', '끝까지 이 길을 쫓아오겠다는 것이냐.'),
  47: chapter('잉크덩굴 군락핵', '뿌리의 언어', '옛 이름에 감긴 검은 뿌리',
    '지워진 이름을 다시 부르지 마라. 뿌리가 듣고 있다.', 'shadow', 'forest', 'ink_vine',
    '제단의 오래된 문장 사이로 잉크가 번지고, 뒤엉킨 뿌리의 중심이 움직인다.', '이 숲의 기억은 아직 놓아주지 않는다.'),
  48: chapter('빈 갑옷의 선도자', '빈 갑옷의 행렬', '돌아올 사람 없는 의장대',
    '대열을 유지하라. 빈자리는 명령으로 채운다.', 'starlight', 'starfield', 'hollow_armor',
    '세 회랑에서 주인 없는 갑옷이 울리고, 행렬의 맨 앞에서 의장봉이 내려온다.', '아무도 돌아오지 않아도 이 대열은 남는다.'),
  49: chapter('첫 맹세의 전위', '모든 이름의 응답', '마지막 인장을 지키는 방패',
    '옛 맹세의 인장 없이는 이 다리를 건널 수 없다.', 'starlight', 'bridge', 'hollow_armor',
    '모든 이름이 모이는 다리 위에서, 첫 계약의 방패가 마지막 통로를 가린다.', '그 많은 목소리가 하나의 맹세보다 무겁겠느냐.'),
  50: chapter('첫 맹세 수호체 아스테르', '함께 여는 새벽', '한 사람을 남기는 별의 계약',
    '귀환 인원 초과. 맹세를 지킬 한 사람을 남겨라.', 'starlight', 'seal', 'oath_guardian',
    '원형 제단의 별빛이 거대한 검에 모이고, 첫 계약을 지키던 수호체가 깨어난다.', '함께 돌아가는 맹세는 기록에 없다. 증명하라.', '마지막 맹세'),
});

export const BOSS_PRESENTATION_TONES = Object.freeze({
  commander: Object.freeze({ accent: '#e4c789', glow: '#c68b3c' }),
  ember: Object.freeze({ accent: '#ffc193', glow: '#e8562e' }),
  frost: Object.freeze({ accent: '#c2ecff', glow: '#67b9df' }),
  shadow: Object.freeze({ accent: '#d8b4e6', glow: '#9361b3' }),
  abyss: Object.freeze({ accent: '#cab8ff', glow: '#7960ce' }),
  tide: Object.freeze({ accent: '#9ee2d7', glow: '#369baf' }),
  resonance: Object.freeze({ accent: '#f3d99b', glow: '#bc8442' }),
  starlight: Object.freeze({ accent: '#ede3ff', glow: '#ae9ade' }),
});

function skillThreat(boss) {
  if (!boss) return '적 지휘관의 공격 사거리를 확인하고 전열을 맞추세요.';
  const normal = `일반 공격 ${formatAttackRange(boss)}칸`;
  if (boss.skillType !== 'attack' || !boss.skill) return normal;
  const status = getSkillStatus(boss, 'skill');
  const statusName = status && STATUS_INFO[status.type]?.name;
  return `${normal} · ${boss.skill} ${formatAttackRange(boss, 'skill')}칸${statusName ? ` · ${statusName}` : ''}`;
}

function hazardDescription(stageId, boss, phaseActive) {
  if (!boss) return '';
  if (stageId <= 30) return phaseActive
    ? '위험 칸에 공격을 예고합니다. 다음 적 턴 전에 표시된 칸을 벗어나세요.'
    : '체력이 절반 이하가 되면 어둠의 파동과 위험 칸 예고가 시작됩니다.';
  return boss.hazardLabel
    ? `${boss.hazardLabel}: 짝수 라운드에 위험 칸을 예고합니다. 다음 적 턴 전에 피하세요.`
    : '';
}

function phaseUnit(boss) {
  if (!boss || boss.phase2) return boss;
  if (boss.expansionEnemy) {
    const skill = boss.phaseSkill || boss.skillSpec;
    return skill ? { ...boss, skill: skill.name, skillType: skill.type,
      skillRange: skill.range, skillMinRange: skill.minRange, skillSpec: skill } : boss;
  }
  return { ...boss, range: Math.max(boss.range || 1, 2), skill: '어둠의 파동', skillRange: 2 };
}

/** Live battle units are authoritative, including old saves and current phases. */
export function getBossPresentation(stage, boss) {
  const id = typeof stage === 'number' ? stage : stage?.id;
  const stageId = Number.isInteger(id) ? id : 1;
  const profile = BOSS_PRESENTATIONS[stageId] || BOSS_PRESENTATIONS[1];
  const unit = boss || stage?.units?.find(candidate => candidate.type === 'boss');
  const active = Boolean(unit?.phase2);
  const plan = getBattlefieldPlan(stageId);
  const palette = BOSS_PRESENTATION_TONES[profile.tone];
  const nextPhase = phaseUnit(unit);
  const support = unit?.supportSkillDescription || '';
  const hazard = hazardDescription(stageId, unit, active);
  return {
    stageId,
    stageTitle: stage?.title || `${stageId}장. ${profile.stageName}`,
    title: profile.epithet,
    epithet: profile.epithet,
    quote: profile.quote,
    threat: skillThreat(unit),
    support,
    hazard,
    arenaLabel: plan.name,
    atmosphere: profile.atmosphere,
    rankLabel: profile.rankLabel,
    tone: profile.tone,
    scene: profile.scene,
    artKey: (unit && getBossSpriteKey(unit)) || profile.artKey,
    accent: palette.accent,
    glow: palette.glow,
    phase: {
      active,
      label: active ? '2페이즈 · 각성' : '1페이즈',
      title: `${profile.epithet} · 각성`,
      quote: profile.phaseQuote,
      threat: `${skillThreat(nextPhase)} · 공격 +2 · 방어 +1`,
      hazard: hazardDescription(stageId, nextPhase, true),
      threshold: 0.5,
      thresholdHp: Number.isFinite(unit?.maxHp) ? Math.ceil(unit.maxHp * 0.5) : null,
    },
  };
}
