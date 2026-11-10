/**
 * 게임 등록부. 첫 화면(게임 목록)이 이 순서대로 보여 준다(docs/18 5절, docs/19).
 * 새 게임은 여기에 한 줄 더하고 `app/<id>/page.tsx`를 둔다.
 */
export type GameEntry = {
  id:
    | "mighty"
    | "hearts"
    | "omok"
    | "janggi"
    | "chess"
    | "baduk"
    | "nyrongppong"
    | "gostop"
    | "minhwatu"
    | "baseball"
    | "stardraw"
    | "yut"
    | "galaxy"
    | "onecard"
    | "cube";
  name: string;
  englishName: string;
  /** 목록에 보일 한 줄 설명 */
  tagline: string;
  players: string;
  path: string;
};

export const GAMES: readonly GameEntry[] = [
  {
    id: "omok",
    name: "오목",
    englishName: "Gomoku",
    tagline: "가로·세로·대각선으로 돌 다섯 개를 먼저 잇는 사람이 이긴다",
    players: "2명",
    path: "/omok",
  },
  {
    id: "janggi",
    name: "장기",
    englishName: "Janggi",
    tagline:
      "기물 열여섯 개로 상대 궁을 피할 곳 없이 몬다. 한국 장기 규칙 그대로",
    players: "2명",
    path: "/janggi",
  },
  {
    id: "baduk",
    name: "바둑",
    englishName: "Baduk",
    tagline: "돌을 번갈아 놓아 더 넓게 차지한다. 9·13·19줄",
    players: "2명",
    path: "/baduk",
  },
  {
    id: "chess",
    name: "체스",
    englishName: "Chess",
    tagline: "상대 킹을 피할 곳 없이 몰면 이긴다. 국제 규칙 그대로",
    players: "2명",
    path: "/chess",
  },
  {
    id: "mighty",
    name: "마이티",
    englishName: "Mighty",
    tagline:
      "점수 카드를 가장 많이 따겠다고 건 사람이 숨은 짝과 함께 나머지와 겨루는 대학가 카드게임",
    players: "2~7명",
    path: "/mighty",
  },
  {
    id: "hearts",
    name: "하트",
    englishName: "Hearts",
    tagline:
      "하트 카드와 스페이드 Q를 가져오지 않게 피하는 카드게임. 윈도우 하트 규칙",
    players: "4명",
    path: "/hearts",
  },
  {
    id: "gostop",
    name: "고스톱",
    englishName: "Go-Stop",
    tagline:
      "같은 달끼리 짝 맞춰 카드를 모으고, 점수가 나면 고? 스톱? 둘이나 셋이서",
    players: "2~3명",
    path: "/gostop",
  },
  {
    id: "minhwatu",
    name: "민화투",
    englishName: "Minhwatu",
    tagline: "같은 달끼리 짝을 맞춰 가져와 카드 점수로 겨루는 화투",
    players: "2~4명",
    path: "/minhwatu",
  },
  {
    id: "nyrongppong",
    name: "나이롱뽕",
    englishName: "Nairong-ppong",
    tagline:
      "남이 버린 카드와 같은 달 두 장이 있으면 뽕! 손에 남은 카드 숫자 합을 가장 작게 줄이는 화투",
    players: "2~5명",
    path: "/nyrongppong",
  },
  {
    id: "onecard",
    name: "원카드",
    englishName: "One Card",
    tagline:
      "무늬나 숫자를 맞춰 먼저 다 내라. 한 장 남으면 버린 더미를 탁, 원카드!",
    players: "2~5명",
    path: "/onecard",
  },
  {
    id: "baseball",
    name: "숫자야구",
    englishName: "Number Baseball",
    tagline:
      "상대가 숨긴 수를 물어 가며 좁혀 먼저 맞힌다. 숨긴 수는 각자 기기에만",
    players: "1~2명",
    path: "/baseball",
  },
  {
    id: "stardraw",
    name: "하늘의 별 따기",
    englishName: "Stardraw",
    tagline:
      "카노푸스 우주국이 다음에 빛날 별을 가장 잘 예측하는 우주인을 찾는다",
    players: "누구나",
    path: "/stardraw",
  },
  {
    id: "yut",
    name: "윷놀이",
    englishName: "Yut",
    tagline:
      "윷가락을 던져 내 말을 먼저 판 한 바퀴 돌린다. 던진 결과는 모두의 기기가 함께 정한다",
    players: "2~4명",
    path: "/yut",
  },
  {
    id: "galaxy",
    name: "은하 한 바퀴",
    englishName: "Galaxy Loop",
    tagline:
      "주사위를 굴려 계절 하늘을 돌며 별을 산다. 남이 내 별에 멈추면 이용료를 받고, 같은 별자리를 모을수록 더 받는다",
    players: "2~4명",
    path: "/galaxy",
  },
  {
    id: "cube",
    name: "큐브 맞추기",
    englishName: "Cube",
    tagline:
      "키보드나 휴대폰으로 돌리는 3D 큐브. 처음 맞추는 법부터 실물 타이머·공식 훈련, 같은 섞기로 대결",
    players: "1~8명",
    path: "/cube",
  },
];
