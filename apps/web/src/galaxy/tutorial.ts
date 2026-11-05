import {
  type Action,
  BANK,
  BOARD_SIZE,
  bidCommitment,
  bidSalt,
  boardOfSky,
  CARD_AMOUNTS,
  cardById,
  createGalaxyScenario,
  DEFAULT_SKY,
  FACT_LIMITS,
  type GalaxyBoard,
  type GalaxyState,
  type GalaxyView,
  type GameEvent,
  matchesFact,
  NUMBERS,
  rentOf,
  type ScenarioStar,
  SHORT_RULES,
  STANDARD_RULES,
  type StarFact,
} from "@game/galaxy-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

import { lyText, magText, money } from "./format";

/*
 * 은하 한 바퀴 배우기(docs/48 10절, 9단원). 숫자는 모두 엔진 표(NUMBERS·CARD_AMOUNTS·FACT_LIMITS)와
 * 사계절 하늘 자료에서 읽어 글과 규칙이 어긋나지 않게 한다. 미션은 굴림 눈을 정해 둔 장면에서 한다(`practice.ts`).
 */

/** 판 그림 장면(미션도 이것). 적지 않은 것은 새 판과 같다 */
export interface BoardScene {
  kind: "board";
  positions?: number[];
  cash?: number[];
  stars?: ScenarioStar[];
  jailed?: number[];
  /** 미션: 굴림 눈을 차례로(누가 굴리든) */
  dice?: [number, number][];
  /** 그림 아래 보일 공문 번호 */
  card?: number;
  /** 판에서 테두리로 짚어 줄 칸 */
  marked?: number[];
}

/** 별자리 하나의 선 그림. `star`가 있으면 그 별을 반짝인다. 이름은 퀴즈라 보이지 않는다 */
export interface SkyScene {
  kind: "sky";
  /** 별자리 IAU 약어(예: "Ori") */
  group: string;
  /** 반짝일 별 id(예: "Betelgeuse") */
  star?: string;
}

/** 두 별 견주기(이름·별자리·색만, 숫자는 보이지 않는다) */
export interface PairScene {
  kind: "pair";
  stars: [string, string];
}

export type GalaxyScene = BoardScene | SkyScene | PairScene;

export type GalaxyLesson = Lesson<GalaxyView, GameEvent, GalaxyScene, Action>;
type Mission = Extract<GalaxyLesson["steps"][number], { kind: "mission" }>;
type Context = MissionContext<GalaxyView, GameEvent>;

/** 배우기 판: 둘이서(나와 입문 컴퓨터), 기본 판, 제철 하늘은 끈다(이용료 계산을 단순하게) */
export const GALAXY_TUTORIAL_RULES = {
  ...STANDARD_RULES,
  players: 2 as const,
  seasonal: false,
  moon: false,
};

/** 실전 단원: 짧은 판 둘이서 */
export const GALAXY_REAL_RULES = { ...SHORT_RULES, players: 2 as const };

/** 미션 컴퓨터 단계(입문) */
export const GALAXY_TUTORIAL_LEVEL = 0;

/** 배우기 판(사계절 하늘) */
export const TUTORIAL_BOARD: GalaxyBoard = boardOfSky(DEFAULT_SKY);

/** 별 id → 칸 */
export function squareOfStar(id: string): number {
  const sq = TUTORIAL_BOARD.squares.find((s) => s.star?.star.id === id);
  if (!sq) throw new Error(`판에 없는 별 ${id}`);
  return sq.index;
}

/** 별 id → 칸의 별(값·별자리 번호 포함) */
export function boardStar(id: string) {
  const sq = TUTORIAL_BOARD.squares[squareOfStar(id)];
  if (!sq?.star) throw new Error(`판에 없는 별 ${id}`);
  return sq.star;
}

/** 별자리 IAU 약어 → 판 위 별자리 */
export function boardGroup(id: string) {
  const g = TUTORIAL_BOARD.groups.find((x) => x.id === id);
  if (!g) throw new Error(`판에 없는 별자리 ${id}`);
  return g;
}

const ko = (id: string) => boardStar(id).star.ko;
const groupKo = (id: string) => boardGroup(id).ko;
/** 받침이 있으면 「이」, 없으면 「가」(한글 끝 글자 기준) */
export function subject(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? "이" : "가";
}
/** 천분율 → 별 값의 몇 % */
const pct = (permille: number) => `${permille / 10}%`;
const lyOf = (id: string) => lyText(boardStar(id).star.ly) ?? "";
const kOf = (id: string) => `${boardStar(id).star.k.toLocaleString("ko-KR")} K`;

/** 장면으로 만든 상태(나는 0번 자리, 차례는 나) */
export function sceneState(scene: BoardScene): GalaxyState {
  return createGalaxyScenario({
    board: TUTORIAL_BOARD,
    rules: GALAXY_TUTORIAL_RULES,
    ...(scene.positions ? { positions: scene.positions } : {}),
    ...(scene.cash ? { cash: scene.cash } : {}),
    ...(scene.stars ? { stars: scene.stars } : {}),
    ...(scene.jailed ? { jailed: scene.jailed } : {}),
  });
}

/** 장면에서 이 별의 이용료 */
function rentIn(scene: BoardScene, id: string): number {
  return rentOf(sceneState(scene), squareOfStar(id));
}

/** 내 별 목록 → 장면의 별 */
const mine = (...ids: string[]): ScenarioStar[] =>
  ids.map((id) => ({ square: squareOfStar(id), owner: 0 }));

/* ───────────── 미션 판단 ───────────── */

/** 내 차례가 끝났다(상대 차례가 시작됐다) */
function turnPassed({ view, events }: Context): boolean {
  return events.some((e) => e.type === "turnStarted" && e.seat !== view.mySeat);
}

function gameEnded({ events }: Context): boolean {
  return events.some((e) => e.type === "gameEnded");
}

/** 조건이 맞으면 성공, 실패 조건이거나 내 차례가 넘어가면(판이 끝나면) 실패 */
function until(
  ok: (ctx: Context) => boolean,
  bad: (ctx: Context) => boolean = () => false,
) {
  return (ctx: Context): MissionStatus => {
    if (ok(ctx)) return "success";
    if (bad(ctx) || turnPassed(ctx) || gameEnded(ctx)) return "fail";
    return null;
  };
}

/* ───────────── 장면 ───────────── */

/** 이 별에서 `steps`칸 뒤 칸(장면을 판 배치가 바뀌어도 맞게 별에서 거꾸로 센다) */
function stepsBefore(id: string, steps: number): number {
  return (squareOfStar(id) - steps + BOARD_SIZE) % BOARD_SIZE;
}

/** 2단원 미션: 1·1로 내 별 벨라트릭스(한 번 더) → 2·3으로 우주국에 멈춘다 */
const SALARY: BoardScene = {
  kind: "board",
  positions: [stepsBefore("Bellatrix", 2), 0],
  stars: mine("Bellatrix"),
  // 별빛이 넉넉하면 지원금이 줄어(16절) 미션은 지원금을 다 받는 별빛으로 시작한다
  cash: [NUMBERS.salaryFree, NUMBERS.startFunds.standard],
  dice: [
    [1, 1],
    [2, 3],
  ],
};

/** 3단원 미션: 3·4로 시리우스에 멈춘다 */
const BUY: BoardScene = {
  kind: "board",
  positions: [stepsBefore("Sirius", 7), 0],
  dice: [[3, 4]],
  marked: [squareOfStar("Sirius")],
};

/** 4단원 미션: 베텔게우스·리겔을 가졌고, 2·4로 벨라트릭스에 멈춘다 */
const COMPLETE: BoardScene = {
  kind: "board",
  positions: [stepsBefore("Bellatrix", 6), 0],
  stars: mine("Betelgeuse", "Rigel"),
  dice: [[2, 4]],
  marked: [squareOfStar("Bellatrix")],
};

/** 6단원 미션에서 컴퓨터가 가진 별빛(입문은 별 값 안에서 내므로 이 값을 낸다) */
const AUCTION_BOT_CASH = 50;
/** 6단원 미션: 2·4로 레굴루스에 멈춘다. 컴퓨터는 별빛이 ✦50뿐이다 */
const AUCTION: BoardScene = {
  kind: "board",
  positions: [stepsBefore("Regulus", 6), 0],
  cash: [NUMBERS.startFunds.standard, AUCTION_BOT_CASH],
  dice: [[2, 4]],
  marked: [squareOfStar("Regulus")],
};

/** 봉투 입찰 미션의 내 봉투(시험이 쓴다. 화면에서는 저장소가 같은 소금으로 만든다) */
function myBid(value: number): Action[] {
  const key = sceneState(AUCTION).keys[0] ?? "";
  const index = 0;
  const salt = bidSalt(key, index);
  return [
    { type: "bid", hash: bidCommitment(index, value, salt) },
    { type: "bidReveal", value, salt },
  ];
}

/* ───────────── 숫자(엔진 표에서) ───────────── */

const SIRIUS_ALONE: BoardScene = { kind: "board", stars: mine("Sirius") };
const SIRIUS_RENT = rentIn(SIRIUS_ALONE, "Sirius");
const ORION_DONE: BoardScene = {
  kind: "board",
  stars: [
    ...mine("Betelgeuse", "Bellatrix"),
    { square: squareOfStar("Rigel"), owner: 0, level: 2 },
  ],
};
const RIGEL_LEVEL2_RENT = rentIn(ORION_DONE, "Rigel");
const groupsByBase = [...TUTORIAL_BOARD.groups].sort((a, b) => b.base - a.base);
const TOP_GROUP = groupsByBase[0] ?? TUTORIAL_BOARD.groups[0];
const LOW_GROUP = groupsByBase[groupsByBase.length - 1] ?? TOP_GROUP;

/** 공문 퀴즈: 가진 별 가운데 조건에 맞는 별 수 × 금액 */
function factPay(ids: string[], fact: StarFact, each: number): number {
  return (
    ids.filter((id) => matchesFact(boardStar(id).star, fact)).length * each
  );
}
const FAR_STARS = ["Betelgeuse", "Rigel", "Bellatrix", "Wezen"];
const FAR_PAY = factPay(FAR_STARS, "far", CARD_AMOUNTS.far);
const BRIGHT_STARS = ["Sirius", "Adhara", "Wezen", "Regulus"];
const BRIGHT_PAY = factPay(
  BRIGHT_STARS,
  "firstMagnitude",
  CARD_AMOUNTS.firstMagnitude,
);

/** 금액 보기 넷: 정답 근처의 배수(정답 자리는 `at`) */
function amountOptions(
  answer: number,
  each: number,
  at: number,
): { options: string[]; answer: number } {
  const values = [0, 1, 2, 3].map((i) => answer + (i - at) * each);
  const shift = Math.max(0, -Math.min(...values) / each);
  const shown = values.map((v) => v + shift * each);
  return {
    options: shown.map((v) => money(v)),
    answer: shown.indexOf(answer),
  };
}

/** 퀴즈 보기에서 정답을 `at` 자리에 둔다 */
function placed(correct: string, others: string[], at: number) {
  const options = [...others];
  options.splice(at, 0, correct);
  return { options, answer: at };
}

/* ───────────── 별자리 익히기 ───────────── */

/** 별자리 모양 알아보기 한 줄(7단원) */
export const SHAPE_HINTS: Readonly<Record<string, string>> = {
  Peg: "가을 하늘의 큰 네모(페가수스 사각형)에 목과 앞다리가 붙은 모양이에요.",
  And: "페가수스 사각형의 한 모서리(알페라츠)에서 비스듬히 뻗어 나간 별 줄이에요.",
  Ori: "가운데 나란한 세 별(허리띠)을 네 별이 둘러싼 모래시계 모양이에요.",
  CMa: "밤하늘에서 가장 밝은 시리우스를 머리 쪽에 두고, 아래로 다리와 꼬리가 뻗은 개 모양이에요.",
  Leo: "머리 쪽이 뒤집힌 물음표(낫) 모양이고, 뒤쪽이 삼각형이에요.",
  Boo: "기다란 연(또는 아이스크림 콘) 모양이고, 아래 끝에 아크투루스가 있어요.",
  Lyr: "밝은 베가 곁에 작은 평행사변형이 매달린 모양이에요.",
  Aql: "밝은 알타이르 양쪽에 별이 하나씩 나란히 선, 날개를 편 새 모양이에요.",
};

/** 7단원 퀴즈 차례와 보기(정답 자리를 고르게 섞었다) */
const SHAPE_QUIZ: [string, string[], number][] = [
  ["Ori", ["CMa", "Leo", "Peg"], 0],
  ["Peg", ["And", "Lyr", "Aql"], 2],
  ["CMa", ["Ori", "Boo", "And"], 1],
  ["Lyr", ["Aql", "Peg", "Leo"], 3],
  ["Leo", ["Boo", "CMa", "Lyr"], 0],
  ["Aql", ["Lyr", "Ori", "Boo"], 1],
  ["Boo", ["Leo", "And", "Aql"], 2],
  ["And", ["Peg", "CMa", "Ori"], 3],
];

/** 8단원: 반짝이는 별 이름 맞히기 */
const STAR_QUIZ: [string, string, string[], number, string][] = [
  [
    "CMa",
    "Sirius",
    ["Adhara", "Wezen", "Rigel"],
    0,
    "밤하늘에서 가장 밝은 별이에요.",
  ],
  [
    "Lyr",
    "Vega",
    ["Sulafat", "Sheliak", "Altair"],
    1,
    "여름 대삼각형의 한 꼭짓점이에요.",
  ],
  [
    "Ori",
    "Betelgeuse",
    ["Rigel", "Bellatrix", "Arcturus"],
    2,
    "오리온의 어깨에 있는 붉은 초거성이에요.",
  ],
  [
    "Boo",
    "Arcturus",
    ["Muphrid", "Izar", "Regulus"],
    3,
    "봄 하늘에서 가장 밝은 별로, 주황빛이에요.",
  ],
];

type Compare = "brighter" | "hotter" | "farther";
const COMPARE_WORD: Record<Compare, string> = {
  brighter: "더 밝은",
  hotter: "더 뜨거운",
  farther: "더 먼",
};

/** 두 별 가운데 더 밝은·뜨거운·먼 별 id(같으면 null) */
export function winnerOf(
  a: string,
  b: string,
  by: Compare,
  board: GalaxyBoard = TUTORIAL_BOARD,
): string | null {
  const star = (id: string) => {
    const s = board.squares.find((q) => q.star?.star.id === id)?.star?.star;
    if (!s) throw new Error(`판에 없는 별 ${id}`);
    return s;
  };
  const x = star(a);
  const y = star(b);
  const value = (s: typeof x) =>
    by === "brighter" ? -s.mag : by === "hotter" ? s.k : (s.ly ?? 0);
  if (value(x) === value(y)) return null;
  return value(x) > value(y) ? a : b;
}

/** 견주기 풀이 한 줄: 두 별의 값과 까닭 */
export function compareExplain(
  a: string,
  b: string,
  by: Compare,
  board: GalaxyBoard = TUTORIAL_BOARD,
): string {
  const s = (id: string) => {
    const found = board.squares.find((q) => q.star?.star.id === id)?.star?.star;
    if (!found) throw new Error(`판에 없는 별 ${id}`);
    return found;
  };
  const win = winnerOf(a, b, by, board);
  const name = (id: string) => s(id).ko;
  const val = (id: string) =>
    by === "brighter"
      ? magText(s(id).mag)
      : by === "hotter"
        ? `${s(id).k.toLocaleString("ko-KR")} K`
        : (lyText(s(id).ly) ?? "거리 모름");
  const why =
    by === "brighter"
      ? "등급은 숫자가 작을수록 밝아요."
      : by === "hotter"
        ? "푸른 별일수록 뜨겁고 붉은 별일수록 차가워요."
        : "광년이 클수록 멀어요.";
  return `${name(a)} ${val(a)} · ${name(b)} ${val(b)}. ${why} **${win ? name(win) : ""}**${win ? subject(name(win)) : ""} ${COMPARE_WORD[by]} 별이에요.`;
}

/** 8단원 견주기 넷 */
const COMPARE_QUIZ: [string, string, Compare][] = [
  ["Rigel", "Betelgeuse", "brighter"],
  ["Vega", "Arcturus", "hotter"],
  ["Sirius", "Wezen", "farther"],
  ["Regulus", "Altair", "brighter"],
];

function compareStep(
  [a, b, by]: [string, string, Compare],
  at: number,
): GalaxyLesson["steps"][number] {
  const win = winnerOf(a, b, by);
  if (!win) throw new Error(`${a}·${b}는 견줄 수 없다`);
  const lose = win === a ? b : a;
  return {
    kind: "quiz",
    question: `두 별 가운데 **${COMPARE_WORD[by]}** 별은?`,
    scene: { kind: "pair", stars: [a, b] },
    ...placed(ko(win), [ko(lose)], at),
    explain: compareExplain(a, b, by),
  };
}

/* ───────────── 단원 ───────────── */

const salaryMission: Mission = {
  kind: "mission",
  title: "우주국 지나기",
  objective: `주사위를 굴려 **우주국**을 지나 지원금 ${money(NUMBERS.salary)}을 받으세요. 같은 눈이 나오면 한 번 더 굴려요.`,
  hint: "**주사위 굴리기**를 눌러요. 같은 눈이면 한 번 더 눌러요.",
  scenario: SALARY,
  check: until(({ view, events }) =>
    events.some(
      (e) =>
        e.type === "pay" &&
        e.reason === "salary" &&
        e.from === BANK &&
        e.to === view.mySeat,
    ),
  ),
  success: `지원금 ${money(NUMBERS.salary)}을 받았어요! 우주국을 지날 때마다 받아요.`,
  fail: "이번엔 끝까지 굴려 우주국을 지나 보세요.",
  solution: [{ type: "roll" }, { type: "roll" }],
  mistake: [{ type: "resign" }],
};

const buyMission: Mission = {
  kind: "mission",
  title: "별 사기",
  objective: `주사위를 굴려 멈춘 **${ko("Sirius")}**(${money(boardStar("Sirius").value)})를 사세요.`,
  hint: "사기 창에서 **사기**를 눌러요.",
  scenario: BUY,
  check: until(
    ({ view, events }) =>
      events.some((e) => e.type === "bought" && e.seat === view.mySeat),
    ({ view, events }) =>
      events.some(
        (e) => e.type === "auctionStarted" && e.passer === view.mySeat,
      ),
  ),
  success: `${ko("Sirius")}를 샀어요! 이제 남이 멈추면 이용료를 받아요.`,
  fail: "넘기면 봉투 입찰이 열려요. 이번엔 **사기**를 눌러 보세요.",
  solution: [{ type: "roll" }, { type: "buy" }],
  mistake: [{ type: "roll" }, { type: "pass" }],
};

const completeMission: Mission = {
  kind: "mission",
  title: "완성하고 2단 올리기",
  objective: `${ko("Betelgeuse")}·${ko("Rigel")}을 가졌어요. **${ko("Bellatrix")}**를 사서 ${groupKo("Ori")}를 완성하고, 정거장 하나를 **2단**으로 올리세요.`,
  hint: `산 뒤 **정거장 관리**를 열어 ${groupKo("Ori")} 별의 **올리기**를 눌러요.`,
  scenario: COMPLETE,
  check: until(
    ({ view, events }) =>
      events.some(
        (e) => e.type === "built" && e.seat === view.mySeat && e.level >= 2,
      ),
    ({ view, events }) =>
      events.some(
        (e) => e.type === "auctionStarted" && e.passer === view.mySeat,
      ),
  ),
  success: `${groupKo("Ori")}를 완성하고 2단을 올렸어요! 이용료가 크게 올랐어요.`,
  fail: "차례를 마치기 전에 **정거장 관리**에서 올리기를 눌러 보세요.",
  solution: [
    { type: "roll" },
    { type: "buy" },
    { type: "build", square: squareOfStar("Rigel") },
  ],
  mistake: [{ type: "roll" }, { type: "buy" }, { type: "end" }],
};

const auctionMission: Mission = {
  kind: "mission",
  title: "입찰로 사기",
  objective: `컴퓨터의 별빛은 ${money(AUCTION_BOT_CASH)}뿐이에요. **${ko("Regulus")}**에 멈추면 사지 말고 **넘긴** 뒤, 봉투에 컴퓨터보다 높은 값을 적어 사세요.`,
  hint: `사기 창에서 **넘기기**, 봉투에 ${money(AUCTION_BOT_CASH + 10)} 이상을 적어 내요.`,
  scenario: AUCTION,
  check: ({ view, events }) => {
    for (const e of events) {
      if (e.type === "bought" && e.seat === view.mySeat) return "fail";
      if (e.type === "auctionEnded")
        return e.result.winner === view.mySeat ? "success" : "fail";
    }
    return turnPassed({ view, events }) || gameEnded({ view, events })
      ? "fail"
      : null;
  },
  success: `입찰로 ${ko("Regulus")}를 샀어요! 제값(${money(boardStar("Regulus").value)})보다 싸게 살 수도 있어요.`,
  fail: `이번엔 **넘긴** 뒤 ${money(AUCTION_BOT_CASH)}보다 높게 적어 보세요. 같은 값이면 넘긴 사람 다음 사람이 앞서요.`,
  solution: [
    { type: "roll" },
    { type: "pass" },
    ...myBid(AUCTION_BOT_CASH + 10),
  ],
  mistake: [{ type: "roll" }, { type: "pass" }, ...myBid(AUCTION_BOT_CASH)],
};

const realMission: Mission = {
  kind: "mission",
  title: "짧은 판 1등",
  objective:
    "입문 컴퓨터와 **짧은 판**을 처음부터 끝까지 두어 **1등**을 하세요.",
  hint: "별자리를 모으는 별부터 사고, 완성하면 정거장을 올려요.",
  scenario: null,
  check: ({ view, events }) => {
    const ended = events.find((e) => e.type === "gameEnded");
    if (ended?.type !== "gameEnded") return null;
    const row = ended.result?.standings.find((s) => s.seat === view.mySeat);
    return row?.rank === 1 ? "success" : "fail";
  },
  success: "1등이에요! 이제 컴퓨터 단계를 올리거나 친구와 해 보세요.",
  fail: "아쉬워요. 별자리를 완성해 정거장을 올리면 이용료가 커져요.",
};

const startFunds = NUMBERS.startFunds.standard;
const turns2 = NUMBERS.turns.standard[2];
const grants = NUMBERS.observatory[4];

export const GALAXY_LESSONS: readonly GalaxyLesson[] = [
  {
    id: "goal",
    title: "은하 한 바퀴는 어떤 게임?",
    summary: "계절 하늘을 돌며 별을 사고, 자산이 가장 많으면 1등",
    steps: [
      {
        kind: "explain",
        title: "계절 하늘을 한 바퀴씩",
        body: [
          "판은 **32칸**이에요. 네 변이 **가을·겨울·봄·여름** 하늘이고, 변마다 실제 별자리 둘의 별 여섯이 있어요.",
          "주사위 둘을 굴려 우주선을 옮기고, 멈춘 별을 **사요**. 남이 내 별에 멈추면 **정거장 이용료**를 받아요.",
        ],
        scene: { kind: "board" },
      },
      {
        kind: "explain",
        title: "별빛은 이 판의 점수예요",
        body: [
          `돈 대신 **별빛**(✦)을 써요. 처음에 ${money(startFunds)}을 받고, 첫 차례에서 뒤 자리일수록 ${money(NUMBERS.lateSeatBonus)}씩 더 받아요(먼저 사는 쪽이 앞서지 않게).`,
          "별빛은 이 판 안에서만 쓰는 점수예요. 판이 끝나면 사라지고, 실제 돈이나 물건과 바꿀 수 없어요.",
          `판이 끝나면 **자산**(별빛 + 가진 별 값의 80% + 정거장 + 완성한 별자리마다 그 별자리 별 하나 값)이 가장 많은 사람이 1등이에요. 기본 판은 둘이면 한 사람이 ${turns2}차례씩 해요.`,
        ],
      },
      {
        kind: "quiz",
        question: "판이 끝나면 별빛은 어떻게 될까요?",
        options: [
          "다음 판으로 이어진다",
          "판과 함께 사라진다",
          "실제 돈으로 바꿀 수 있다",
          "별 도감 선물로 바뀐다",
        ],
        answer: 1,
        explain: "별빛은 **그 판 안에서만** 쓰는 점수예요.",
      },
      {
        kind: "quiz",
        question: "1등은 무엇으로 정할까요?",
        options: [
          "가진 별 수",
          "한 바퀴 돈 횟수",
          "자산(별빛 + 별 + 정거장 + 완성 별자리)",
          "별빛만",
        ],
        answer: 2,
        explain:
          "**자산**으로 정해요. 별빛을 아껴도, 별을 사 두어도 자산이 돼요.",
      },
    ],
  },
  {
    id: "dice",
    title: "주사위와 한 바퀴",
    summary: "두 눈의 합만큼 가고, 우주국을 지나면 지원금",
    steps: [
      {
        kind: "explain",
        title: "두 눈의 합만큼",
        body: [
          "주사위 **둘**을 굴려 나온 눈을 더한 만큼 앞으로 가요.",
          "**같은 눈**이 나오면 멈춘 칸의 일을 하고 **한 번 더** 굴려요. 한 차례에 세 번째 같은 눈이면 **소행성대**에 걸려요.",
        ],
        scene: { kind: "board", marked: [8] },
      },
      {
        kind: "explain",
        title: "우주국 지원금",
        body: [
          "오른쪽 아래 **카노푸스 우주국**에서 출발해요.",
          `우주국을 **지나거나 멈추면** 지원금 ${money(NUMBERS.salary)}을 받아요. 별빛이 ${money(NUMBERS.salaryFree)} 넘게 있으면 넘는 몫의 5분의 1만큼 덜 받아요. 한 바퀴(32칸)는 네 차례쯤 걸려요.`,
        ],
        scene: { kind: "board", marked: [0] },
      },
      {
        kind: "quiz",
        question: "주사위가 **4와 4**예요. 어떻게 될까요?",
        options: [
          "4칸 가고 차례가 끝난다",
          "8칸 가고 차례가 끝난다",
          "소행성대로 간다",
          "8칸 가고 한 번 더 굴린다",
        ],
        answer: 3,
        explain:
          "같은 눈이라 **8칸** 가서 칸의 일을 한 뒤 **한 번 더** 굴려요.",
      },
      salaryMission,
    ],
  },
  {
    id: "buy",
    title: "별 사기와 이용료",
    summary: "밝은 별자리일수록 비싸고, 이용료도 크다",
    steps: [
      {
        kind: "explain",
        title: "밝은 별자리가 비싸요",
        body: [
          "주인 없는 별에 멈추면 살 수 있어요. 사면 **정거장 1단**이 함께 서요.",
          `별 값은 별자리 **밝기 순서**로 정해요. 가장 밝은 ${TOP_GROUP?.ko} 별은 ${money(TOP_GROUP?.base ?? 0)}, 가장 어두운 ${LOW_GROUP?.ko} 별은 ${money(LOW_GROUP?.base ?? 0)}이에요.`,
          `별자리 안에서 가장 밝은 별은 ${money(NUMBERS.brightestBonus)} 더 비싸요(${ko("Sirius")} ${money(boardStar("Sirius").value)}).`,
        ],
        scene: { kind: "board", marked: [squareOfStar("Sirius")] },
      },
      {
        kind: "explain",
        title: "정거장 이용료",
        body: [
          "남의 별에 멈추면 그 별 주인에게 **정거장 이용료**를 내요. 내 별에 멈추면 아무 일 없어요.",
          `1단 정거장은 별 값의 ${pct(NUMBERS.rent.single)}(10 단위로 반올림)예요.`,
        ],
        scene: SIRIUS_ALONE,
      },
      {
        kind: "quiz",
        question: `${ko("Sirius")}(${money(boardStar("Sirius").value)}) 1단 정거장에 멈췄어요. 이용료는?`,
        scene: { ...SIRIUS_ALONE, marked: [squareOfStar("Sirius")] },
        ...amountOptions(SIRIUS_RENT, 20, 1),
        explain: `별 값의 ${pct(NUMBERS.rent.single)}를 10 단위로 반올림해 **${money(SIRIUS_RENT)}**이에요.`,
      },
      buyMission,
    ],
  },
  {
    id: "link",
    title: "별자리 잇기와 정거장",
    summary: "같은 별자리를 모으면 이용료가 오르고, 완성하면 정거장을 올린다",
    steps: [
      {
        kind: "explain",
        title: "별자리 선이 이어져요",
        body: [
          `같은 별자리 별을 **둘** 가지면 둘 사이에 별자리 선이 이어지고, 1단 이용료가 별 값의 ${pct(NUMBERS.rent.single)} → ${pct(NUMBERS.rent.pair)}로 올라요.`,
          `**셋 모두** 가지면 **별자리 완성**이에요. 이용료가 ${pct(NUMBERS.rent.complete)}가 되고, 판이 끝날 때 자산에 그 별자리 별 하나 값(밝은 별자리일수록 커요)을 더해요.`,
        ],
        scene: { kind: "board", stars: mine("Betelgeuse", "Rigel") },
      },
      {
        kind: "explain",
        title: "정거장 올리기",
        body: [
          "완성한 별자리는 정거장을 **2단 → 3단 → 큰 정거장**으로 올릴 수 있어요. 한 별자리 안에서는 고르게 올려요(단 차이는 1까지).",
          `한 단 값은 그 별자리 별 값의 절반이에요(${groupKo("Ori")} ${money(boardGroup("Ori").levelCost)}). 이용료는 2단 ${pct(NUMBERS.rent.level2)}, 3단 ${pct(NUMBERS.rent.level3)}, 큰 정거장 ${pct(NUMBERS.rent.grand)}예요.`,
          "올린 정거장은 자산에 한 단 값의 절반만 잡혀요. 남은 차례에 이용료로 되찾을 수 있을 때 올려요.",
        ],
        scene: ORION_DONE,
      },
      {
        kind: "quiz",
        question: `${groupKo("Ori")}를 완성하고 ${ko("Rigel")}(${money(boardStar("Rigel").value)})에 **2단**을 올렸어요. ${ko("Rigel")} 이용료는?`,
        scene: { ...ORION_DONE, marked: [squareOfStar("Rigel")] },
        ...amountOptions(RIGEL_LEVEL2_RENT, 40, 2),
        explain: `2단은 별 값의 ${pct(NUMBERS.rent.level2)}라 **${money(RIGEL_LEVEL2_RENT)}**이에요.`,
      },
      completeMission,
    ],
  },
  {
    id: "notice",
    title: "우주국 공문과 소행성대",
    summary: "공문은 별의 밝기·온도·거리로 계산한다",
    steps: [
      {
        kind: "explain",
        title: "우주국 공문",
        body: [
          "변마다 하나씩 있는 **공문** 칸에 멈추면 공문 한 장을 펴서 따라요.",
          "여러 장이 **별의 실제 값**(밝기·온도·거리)으로 계산해요. 별을 알면 공문을 미리 읽을 수 있어요.",
        ],
        scene: { kind: "board", marked: [4, 12, 20, 28], card: 4 },
      },
      {
        kind: "quiz",
        question: `별 넷을 가졌어요. 「${cardById(4).title}」 공문이면 얼마를 받을까요?`,
        scene: { kind: "board", stars: mine(...FAR_STARS), card: 4 },
        ...amountOptions(FAR_PAY, CARD_AMOUNTS.far, 0),
        explain: `${FACT_LIMITS.far}광년보다 먼 별은 ${FAR_STARS.filter((id) =>
          matchesFact(boardStar(id).star, "far"),
        )
          .map((id) => `${ko(id)}(${lyOf(id)})`)
          .join(
            "·",
          )}이에요. ${ko("Bellatrix")}(${lyOf("Bellatrix")})는 빠져서 **${money(FAR_PAY)}**이에요.`,
      },
      {
        kind: "quiz",
        question: `별 넷을 가졌어요. 「${cardById(2).title}」 공문이면 얼마를 받을까요?`,
        scene: { kind: "board", stars: mine(...BRIGHT_STARS), card: 2 },
        ...amountOptions(BRIGHT_PAY, CARD_AMOUNTS.firstMagnitude, 2),
        explain: `${FACT_LIMITS.firstMagnitude}등급까지라 ${ko("Adhara")}(${magText(boardStar("Adhara").star.mag)})도 들어가고 ${ko("Wezen")}(${magText(boardStar("Wezen").star.mag)})은 빠져요. **${money(BRIGHT_PAY)}**이에요.`,
      },
      {
        kind: "explain",
        title: "소행성대·관측지·혜성",
        body: [
          `**소행성대**: 공문이나 세 번째 같은 눈으로 오면 걸려요. 다음 차례에 ${money(NUMBERS.asteroidFine)}을 내고 바로 나가거나, 굴려서 같은 눈이면 나가요. 아니면 한 차례 쉬고 그다음엔 그냥 나가요. 그냥 멈추면 지나가는 길이에요.`,
          `**관측지**: 멈추면 자산 순위가 낮을수록 관측 지원금을 더 받아요(넷이면 꼴찌 ${money(grants[3])}, 1위는 없음).`,
          "**혜성**: 주사위를 한 번 더 굴려 그만큼 더 가요.",
        ],
        scene: { kind: "board", marked: [8, 16, 24] },
      },
      {
        kind: "quiz",
        question: "소행성대에 걸렸어요. 이번 차례에 **바로** 나가려면?",
        options: [
          "공문 칸을 기다린다",
          `${money(NUMBERS.asteroidFine)}을 내고 굴린다`,
          "지원금을 돌려준다",
          "다른 우주인과 자리를 바꾼다",
        ],
        answer: 1,
        explain: `${money(NUMBERS.asteroidFine)}을 내면 바로 나가 굴려요. 굴려서 같은 눈이 나와도 나가요.`,
      },
    ],
  },
  {
    id: "auction",
    title: "봉투 입찰과 사들이기",
    summary: "사지 않은 별은 모두가 몰래 값을 적어 낸다",
    steps: [
      {
        kind: "explain",
        title: "봉투 입찰",
        body: [
          "멈춘 사람이 별을 사지 않고 **넘기면**, 모두가 봉투에 값을 **몰래 한 번** 적어 내요(✦10부터 10 단위, 가진 별빛까지).",
          "가장 높은 값을 낸 사람이 그 값에 사요. 같으면 넘긴 사람 **다음** 사람부터 앞서요. 아무도 안 내면 주인 없는 별로 남아요.",
          "친구와 할 때도 방장이 남의 봉투를 먼저 볼 수 없어요. 모두 낸 뒤에 함께 열어요.",
        ],
        scene: { kind: "board", marked: [squareOfStar("Regulus")] },
      },
      {
        kind: "quiz",
        question:
          "내가 넘긴 별에 나와 다음 사람이 둘 다 **✦50**을 냈어요. 누가 살까요?",
        options: ["나", "넘긴 사람 다음 사람", "아무도 못 산다", "다시 낸다"],
        answer: 1,
        explain: "값이 같으면 **넘긴 사람 다음** 사람부터 앞서요.",
      },
      {
        kind: "explain",
        title: "사들이기",
        body: [
          `남의 별에 멈춰 이용료를 낸 뒤, 그 별을 값의 ${NUMBERS.takeover / 1000}배에 주인에게서 **사들일** 수 있어요. 주인은 거절할 수 없어요.`,
          "주인이 완성한 별자리의 별과 맡긴 별은 사들일 수 없어요.",
          "별자리를 완성하려면 사들이기가 지름길이에요.",
        ],
      },
      auctionMission,
    ],
  },
  {
    id: "shapes",
    title: "별자리 익히기 ①",
    summary: "선 그림을 보고 여덟 별자리 이름 맞히기",
    steps: [
      {
        kind: "explain",
        title: "판 위 여덟 별자리",
        body: [
          `가을 ${groupKo("Peg")}·${groupKo("And")}, 겨울 ${groupKo("Ori")}·${groupKo("CMa")}, 봄 ${groupKo("Leo")}·${groupKo("Boo")}, 여름 ${groupKo("Lyr")}·${groupKo("Aql")}예요.`,
          "판 가운데 하늘에 실제 별자리 선이 흐리게 그려져 있어요. 모양을 익히면 밤하늘에서도 찾을 수 있어요.",
        ],
        scene: { kind: "sky", group: "Ori" },
      },
      ...SHAPE_QUIZ.map(([id, others, at]): GalaxyLesson["steps"][number] => ({
        kind: "quiz",
        question: "이 선 그림은 어느 별자리일까요?",
        scene: { kind: "sky", group: id },
        ...placed(groupKo(id), others.map(groupKo), at),
        explain: `**${groupKo(id)}**이에요. ${SHAPE_HINTS[id] ?? ""}`,
      })),
    ],
  },
  {
    id: "stars",
    title: "별자리 익히기 ②",
    summary: "밝은 별 이름과 밝기·온도·거리 견주기",
    steps: [
      {
        kind: "explain",
        title: "등급·온도·거리",
        body: [
          `**등급**은 숫자가 작을수록 밝아요. ${ko("Sirius")}는 ${magText(boardStar("Sirius").star.mag)}으로 밤하늘에서 가장 밝아요.`,
          `**온도**는 색으로 보여요. 푸른 별이 뜨겁고 붉은 별이 차가워요(${ko("Rigel")} ${kOf("Rigel")}, ${ko("Betelgeuse")} ${kOf("Betelgeuse")}).`,
          `**거리**는 광년으로 재요. ${ko("Sirius")}는 ${lyOf("Sirius")}, 같은 별자리의 ${ko("Wezen")}은 ${lyOf("Wezen")} 떨어져 있어요.`,
        ],
        scene: { kind: "pair", stars: ["Rigel", "Betelgeuse"] },
      },
      ...STAR_QUIZ.map(
        ([group, id, others, at, fact]): GalaxyLesson["steps"][number] => ({
          kind: "quiz",
          question: `${groupKo(group)}에서 반짝이는 별의 이름은?`,
          scene: { kind: "sky", group, star: id },
          ...placed(ko(id), others.map(ko), at),
          explain: `**${ko(id)}**(${magText(boardStar(id).star.mag)})예요. ${fact}`,
        }),
      ),
      ...COMPARE_QUIZ.map((q, i) => compareStep(q, i % 2)),
    ],
  },
  {
    id: "real",
    title: "실전",
    summary: "입문 컴퓨터와 짧은 판 한 판",
    steps: [
      {
        kind: "explain",
        title: "이기는 요령",
        body: [
          "같은 별자리 별을 모아요. 둘이면 이용료가 오르고, 셋이면 정거장을 올릴 수 있어요.",
          "올리기 전에 별빛을 조금 남겨 두세요. 남의 큰 정거장에 멈추면 이용료가 커요.",
          `짧은 판은 처음에 별 ${NUMBERS.dealStars.short}개를 받고 시작해요. 받은 별의 별자리부터 노려 보세요.`,
        ],
      },
      realMission,
    ],
  },
];
