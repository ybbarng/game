import {
  type Action,
  type GameEvent,
  type OmokScenarioOptions,
  type OmokView,
  pointAt,
  STANDARD_RULES,
} from "@game/omok-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

/** 튜토리얼 장면: 놓인 돌에 더해 그림에만 쓰는 표시 */
export type OmokScene = Omit<OmokScenarioOptions, "rules"> & {
  /** 이긴 줄처럼 빨간 줄로 이어 보일 자리 */
  line?: string[];
  /** 둘 차례인 색의 금지 자리를 ×로 보인다 */
  forbidden?: boolean;
  /** 마지막 수처럼 점으로 짚어 보일 자리 */
  last?: string;
};
export type OmokLesson = Lesson<OmokView, GameEvent, OmokScene, Action>;
type Context = MissionContext<OmokView, GameEvent>;

/** 튜토리얼은 게임 기본값인 렌주 한 판으로 한다(2026-10-29 사용자가 기본을 렌주로) */
export const OMOK_TUTORIAL_RULES = {
  ...STANDARD_RULES,
  variant: "renju" as const,
};

/** 내가 처음 둔 자리 */
function myFirstPlace({ view, events }: Context): number | null {
  const placed = events.find(
    (e) => e.type === "placed" && e.seat === view.mySeat,
  );
  return placed?.type === "placed" ? placed.at : null;
}

/** 판이 끝났을 때 내가 이겼으면 성공 */
function wonRound({ view, events }: Context): MissionStatus {
  const ended = events.find((e) => e.type === "roundEnded");
  if (ended?.type !== "roundEnded") return null;
  return ended.result.kind !== "draw" && ended.result.seat === view.mySeat
    ? "success"
    : "fail";
}

/** 첫 수가 이 자리 가운데 하나면 성공 */
function firstAt(...names: string[]) {
  const targets = names.map(pointAt);
  return (ctx: Context): MissionStatus => {
    const at = myFirstPlace(ctx);
    if (at === null) return null;
    return targets.includes(at) ? "success" : "fail";
  };
}

const place = (name: string): Action => ({ type: "place", at: pointAt(name) });

/** 흑 넷이 한쪽만 막혀 있다. L8에 두면 다섯 */
const FIVE_SCENE: OmokScene = {
  black: ["H8", "I8", "J8", "K8"],
  white: ["G8", "H7", "I7", "J9"],
};

/** 백이 대각선으로 넷. 왼쪽 아래는 흑이 막았고 오른쪽 위 H8만 비었다 */
const BLOCK_SCENE: OmokScene = {
  black: ["C3", "K6", "L10", "M3"],
  white: ["D4", "E5", "F6", "G7"],
};

/** 흑 열린 셋. 양 끝 F8·J8 어느 쪽에 둬도 열린 넷 */
const OPEN_THREE_SCENE: OmokScene = {
  black: ["G8", "H8", "I8"],
  white: ["G6", "J11", "L4"],
};

/** H8에 두면 가로 셋과 세로 셋이 한꺼번에 생긴다(3·3) */
const DOUBLE_THREE_SCENE: OmokScene = {
  black: ["F8", "G8", "H9", "H10"],
  white: ["B2", "B14", "N2", "N14"],
  forbidden: true,
};

/**
 * 렌주 주형(처음 세 수). 흑 첫 돌 H8 기준. 이름·자리·평가는 docs/20 10절의 출처
 * (Nosovsky·Sokolsky 「Renju for Beginners」 RIF, Wikipedia 「Renju opening pattern」, 나무위키 「26주형」)가 같은 것만 썼다.
 * - `white`: 백 둘째 수. H9(가로·세로로 붙임)면 직접, I9(대각선으로 붙임)면 간접
 * - `third`: 흑 셋째 수(좌우 대칭인 다른 자리도 같은 주형)
 * - `verdict`: 렌주 연구의 평가. black 흑이 이긴다고 밝혀짐, even 비슷하거나 백이 조금 낫다, white 백이 이긴다고 밝혀짐
 */
export const OMOK_OPENINGS = {
  kagetsu: { name: "화월", white: "H9", third: "I9", verdict: "black" },
  hogetsu: { name: "포월", white: "I9", third: "I7", verdict: "black" },
  sosei: { name: "소성", white: "H9", third: "J10", verdict: "even" },
  chosei: { name: "장성", white: "I9", third: "J10", verdict: "even" },
  ryusei: { name: "류성", white: "I9", third: "J6", verdict: "even" },
  yusei: { name: "유성", white: "H9", third: "J6", verdict: "white" },
  suisei: { name: "혜성", white: "I9", third: "F6", verdict: "white" },
  kansei: { name: "한성", white: "H9", third: "H10", verdict: "black" },
  kyugetsu: { name: "구월", white: "H9", third: "I7", verdict: "black" },
} as const;

/** 주형 장면: 흑 H8, 백, 흑 셋째 수. 셋째 수를 점으로 짚는다 */
function openingScene(key: keyof typeof OMOK_OPENINGS): OmokScene {
  const o = OMOK_OPENINGS[key];
  return { black: ["H8", o.third], white: [o.white], last: o.third };
}

/** 흑 J8: 가로 G8~J8 사(F8은 백이 막음)와 세로 J8~J10 열린 셋이 함께 생기는 4·3 */
export const FOUR_THREE_SCENE: OmokScene = {
  black: ["G8", "H8", "I8", "J9", "J10"],
  white: ["F8", "D3", "M3", "D13", "M13"],
};

/**
 * 금지 자리로 몰기(나는 백). K8에 두면 백 G8·H8·I8·K8의 다섯 자리는 J8뿐인데,
 * J8은 흑에게 3·3(세로 J8~J10, 대각선 J8~L10)이라 흑이 막을 수 없다
 */
export const FOUL_TRAP_SCENE: OmokScene = {
  black: ["F8", "J9", "J10", "K9", "L10"],
  white: ["G8", "H8", "I8", "B2"],
};

/** 흑 띈 셋 G8·H8·J8. 가운데 I8을 채우면 열린 넷 */
export const SPLIT_THREE_SCENE: OmokScene = {
  black: ["G8", "H8", "J8"],
  white: ["G6", "J11", "L4"],
};

/** 백 열린 셋(대각선 E10~G12)이 있지만, 흑 K7이 4·3(세로 K4~K7 사 + 가로 K7~M7 열린 셋)이라 먼저 이긴다 */
export const RACE_SCENE: OmokScene = {
  black: ["K4", "K5", "K6", "L7", "M7"],
  white: ["K3", "E10", "F11", "G12", "B14"],
};

/** 백 열린 셋(세로 E5~E7). E8로 막으면 흑 E8·F8·G8 열린 셋도 생긴다. E4는 막기만 한다 */
export const BLOCK_BUILD_SCENE: OmokScene = {
  black: ["F8", "G8", "L3", "B13"],
  white: ["E5", "E6", "E7", "L12"],
};

export const OMOK_LESSONS: readonly OmokLesson[] = [
  {
    id: "goal",
    title: "오목은 어떤 게임?",
    summary: "흑부터 번갈아 두고, 다섯을 먼저 잇는 사람이 이긴다",
    steps: [
      {
        kind: "explain",
        title: "다섯을 먼저 이어요",
        body: [
          "오목은 가로·세로 **15줄** 판의 줄이 만나는 점에 돌을 두는 게임이에요.",
          "**흑이 먼저** 두고, 흑과 백이 한 수씩 번갈아 둬요. 한번 둔 돌은 옮기지 않아요.",
          "가로·세로·대각선 어느 쪽이든 내 돌 **다섯 개를 한 줄로** 먼저 이으면 이겨요.",
        ],
        scene: {
          black: ["E4", "F5", "G6", "H7", "I8"],
          white: ["E5", "F6", "G7", "J9"],
          line: ["E4", "I8"],
        },
      },
      {
        kind: "quiz",
        question: "다섯을 이은 것으로 치지 **않는** 것은?",
        options: ["가로 한 줄", "세로 한 줄", "대각선 한 줄", "ㄱ자로 꺾인 줄"],
        answer: 3,
        explain:
          "다섯은 **곧은 한 줄**이어야 해요. 꺾이거나 사이에 빈칸이 있으면 다섯이 아니에요.",
      },
      {
        kind: "mission",
        title: "다섯 잇기",
        objective: "흑 넷이 나란히 있어요. 한 수로 **다섯**을 만들어 이기세요.",
        hint: "왼쪽 끝은 백이 막았어요. **오른쪽 끝**에 두세요.",
        scenario: FIVE_SCENE,
        // 첫 수로 다섯이 되지 않았으면 실패
        check: (ctx) =>
          myFirstPlace(ctx) === null ? null : (wonRound(ctx) ?? "fail"),
        success: "다섯을 이었어요! 이렇게 한 줄을 먼저 완성하면 이겨요.",
        fail: "아직 다섯이 아니에요. 넷의 비어 있는 끝을 찾아보세요.",
        solution: [place("L8")],
        mistake: [place("A1")],
      },
    ],
  },
  {
    id: "block",
    title: "막기",
    summary: "상대의 넷은 바로, 열린 셋은 미리 막는다",
    steps: [
      {
        kind: "explain",
        title: "넷은 바로 막아요",
        body: [
          "상대가 넷을 만들면 다음 수에 다섯이 돼요. 그 끝을 **바로 막아야** 해요.",
          "그림의 백 넷은 왼쪽 아래를 흑이 막아 두었어요. 남은 끝은 하나뿐이에요.",
        ],
        scene: BLOCK_SCENE,
      },
      {
        kind: "explain",
        title: "열린 셋은 미리 막아요",
        body: [
          "양쪽 끝이 다 빈 넷을 **열린 넷**이라고 해요. 한 번에 한 곳만 막을 수 있어서, 열린 넷이 생기면 막을 수 없어요.",
          "그래서 상대가 양쪽이 빈 셋(**열린 셋**)을 만들면, 넷이 되기 전에 한쪽 끝을 막아 두는 게 좋아요.",
        ],
      },
      {
        kind: "quiz",
        question: "상대가 **열린 넷**을 만들었어요. 어떻게 될까요?",
        options: [
          "한쪽만 막을 수 있어 다음 수에 진다",
          "두 끝을 한 번에 막을 수 있다",
          "넷은 그냥 둬도 괜찮다",
        ],
        answer: 0,
        explain:
          "한 번에 돌 하나만 두니 두 끝을 다 막을 수 없어요. 그래서 **열린 셋일 때** 막아야 해요.",
      },
      {
        kind: "mission",
        title: "넷 막기",
        objective:
          "백이 대각선으로 넷을 만들었어요. 다섯이 되기 전에 **막으세요**.",
        hint: "백 넷의 **오른쪽 위 끝**이 비어 있어요.",
        scenario: BLOCK_SCENE,
        check: firstAt("H8"),
        success: "막았어요! 상대 넷을 보면 무엇보다 먼저 막아요.",
        fail: "그 수로는 백이 다섯을 만들 수 있어요. 백 넷의 빈 끝을 찾아보세요.",
        solution: [place("H8")],
        mistake: [place("A15")],
      },
    ],
  },
  {
    id: "attack",
    title: "열린 넷 만들기",
    summary: "열린 셋을 열린 넷으로 키우면 상대가 막을 수 없다",
    steps: [
      {
        kind: "explain",
        title: "이기는 길: 열린 넷",
        body: [
          "내 열린 셋의 끝에 하나를 더 두면 **열린 넷**이 돼요. 상대가 한쪽을 막아도 다른 쪽에 두면 다섯이에요.",
          "그래서 상대가 내 열린 셋을 막지 않았다면, 바로 열린 넷을 만들어 이길 수 있어요.",
        ],
        scene: OPEN_THREE_SCENE,
      },
      {
        kind: "quiz",
        question: "그림의 흑 셋을 **열린 넷**으로 만드는 자리는?",
        scene: OPEN_THREE_SCENE,
        options: ["F8 또는 J8", "H9", "E8", "H7"],
        answer: 0,
        explain:
          "셋의 **바로 옆** F8이나 J8에 두면 넷의 양쪽이 모두 비어 있어 열린 넷이 돼요. E8은 사이가 떠서 한쪽만 막으면 끝나요.",
      },
      {
        kind: "mission",
        title: "열린 넷",
        objective: "흑 열린 셋이 있어요. 한 수로 **열린 넷**을 만드세요.",
        hint: "셋의 **바로 왼쪽이나 오른쪽**에 두세요.",
        scenario: OPEN_THREE_SCENE,
        check: firstAt("F8", "J8"),
        success:
          "열린 넷이에요! 이제 백이 어느 쪽을 막아도 다른 쪽에 두면 이겨요.",
        fail: "그 수로는 열린 넷이 되지 않아요. 셋 바로 옆 끝을 찾아보세요.",
        solution: [place("J8")],
        mistake: [place("E8")],
      },
    ],
  },
  {
    id: "forbidden",
    title: "금지 수",
    summary:
      "렌주(기본)는 흑만 3·3·4·4·장목 금지, 일반 규칙은 흑백 모두 3·3 금지",
    steps: [
      {
        kind: "explain",
        title: "3·3은 둘 수 없어요",
        body: [
          "한 수로 **열린 셋 두 개**가 한꺼번에 생기는 자리를 **3·3**이라고 해요. 막을 수 없는 공격이라 금지예요.",
          "그림의 × 자리 H8에 흑을 두면 가로 셋과 세로 셋이 동시에 생겨요. 기본 규칙인 **렌주**에서는 흑이 3·3에 둘 수 없어요(일반 규칙은 백도 금지).",
          "게임에서는 내 차례에 금지 자리를 ×로 보여 줘요(시작 화면에서 끌 수 있어요).",
        ],
        scene: DOUBLE_THREE_SCENE,
      },
      {
        kind: "explain",
        title: "규칙 셋",
        body: [
          "**렌주(기본)**: 먼저 두는 흑이 유리해서 **흑만** 3·3, 4·4(넷 두 개), 장목(여섯 이상)이 금지예요. 백은 다섯 이상이면 이겨요.",
          "**일반**: 정확히 다섯이어야 이겨요(여섯 이상은 아니에요). 흑백 모두 3·3 금지.",
          "**자유**: 다섯 이상이면 이겨요. 금지가 없어요.",
        ],
      },
      {
        kind: "quiz",
        question: "× 자리(H8)에 흑을 두면 어떻게 될까요?",
        scene: DOUBLE_THREE_SCENE,
        options: ["둘 수 없다(3·3 금지)", "바로 이긴다", "백 돌 하나를 따낸다"],
        answer: 0,
        explain:
          "열린 셋이 둘 생기는 **3·3**이라 둘 수 없어요. 오목에는 바둑처럼 돌을 따내는 규칙이 없어요.",
      },
    ],
  },
  {
    id: "real",
    title: "실전",
    summary: "입문 컴퓨터와 처음부터 한 판",
    steps: [
      {
        kind: "explain",
        title: "두는 순서",
        body: [
          "한 수 두기 전에 이 차례로 살펴요.",
          "① 내가 **다섯**을 만들 수 있나? ② 상대 **넷**을 막아야 하나? ③ 내가 **열린 넷**을 만들 수 있나? ④ 상대 **열린 셋**을 막아야 하나?",
          "넷 다 아니면 내 돌 근처에 두어 셋을 키워요. 첫 수는 가운데(H8)가 좋아요.",
        ],
      },
      {
        kind: "mission",
        title: "첫 승리",
        objective: "흑으로 **입문 컴퓨터**와 한 판 두어 이기세요.",
        hint: "상대 넷과 열린 셋을 먼저 막고, 내 셋을 열린 넷으로 키우세요.",
        scenario: null,
        check: wonRound,
        success: "첫 승리예요! 이제 단계를 올려 중수·고수와 겨뤄 보세요.",
        fail: "아쉬워요. 상대 셋과 넷을 놓치지 않았는지 살피며 다시 해 봐요.",
      },
    ],
  },
  {
    id: "opening",
    title: "첫 세 수(주형)",
    summary: "백이 붙이는 두 방법과, 흑 셋째 수로 생기는 이름 있는 모양",
    steps: [
      {
        kind: "explain",
        title: "백은 흑 돌 옆에 붙여요",
        body: [
          "흑은 첫 수를 보통 판 가운데(**H8**)에 둬요. 어디에 둬도 되지만, 가운데가 사방으로 넓게 쓸 수 있어요.",
          "백은 둘째 수를 흑 돌 **바로 옆**에 붙여요. 가로나 세로로 붙이면 **직접**, 대각선으로 붙이면 **간접**이라고 해요.",
          "그림은 직접이에요. 백이 흑 돌 바로 위 H9에 붙었어요.",
        ],
        scene: { black: ["H8"], white: ["H9"], last: "H9" },
      },
      {
        kind: "explain",
        title: "간접, 그리고 주형",
        body: [
          "그림은 간접이에요. 백이 흑 돌 대각선 옆 I9에 붙었어요.",
          "흑은 셋째 수를 첫 돌에서 **두 칸 안**(가운데 5×5)에 두는 것이 보통이에요. 이렇게 생기는 처음 세 수의 모양을 **주형**이라고 해요. 직접 13가지, 간접 13가지, 모두 26가지이고 저마다 이름이 있어요.",
        ],
        scene: { black: ["H8"], white: ["I9"], last: "I9" },
      },
      {
        kind: "explain",
        title: "흑이 좋은 모양: 화월",
        body: [
          "**화월**(직접): 백이 H9에 붙으면 흑이 **I9**(또는 맞은편 G9)에 둬요. 셋째 돌이 첫 돌과 대각선으로, 백 돌과 가로로 맞닿아요.",
          "렌주 연구에서 **흑이 이긴다고 밝혀진** 주형이고, 흑이 이길 길이 특히 많다고 알려져 있어요.",
        ],
        scene: openingScene("kagetsu"),
      },
      {
        kind: "explain",
        title: "흑이 좋은 모양: 포월",
        body: [
          "**포월**(간접): 백이 I9에 붙으면 흑이 **I7**(또는 맞은편 G9)에 둬요. 셋째 돌이 첫 돌과 대각선으로 붙고, 백 돌과 세로 한 줄에 놓여요.",
          "화월과 함께 **흑이 이긴다고 밝혀진** 주형이고, 흑이 이길 길이 특히 많다고 알려져 있어요.",
        ],
        scene: openingScene("hogetsu"),
      },
      {
        kind: "explain",
        title: "흑이 피할 모양",
        body: [
          "**유성**(직접, 그림의 흑 J6)과 **혜성**(간접, 백 I9일 때 흑 F6)은 셋째 돌이 백 반대쪽으로 멀리 떨어진 모양이에요. 둘 다 **백이 이긴다고 밝혀진** 주형이에요.",
          "**소성**(직접, 흑 J10)·**장성**(간접, 흑 J10)·**류성**(간접, 흑 J6)처럼 두 칸씩 띄운 모양도 흑백이 비슷하거나 백이 조금 낫다고 봐요.",
        ],
        scene: openingScene("yusei"),
      },
      {
        kind: "explain",
        title: "처음엔 이렇게 두세요",
        body: [
          "**흑이면**: 가운데 H8 → 백이 붙으면 셋째 돌을 **첫 돌의 대각선 옆, 백 돌과 가로나 세로 한 줄**인 자리에 둬요. 백이 직접이면 화월, 간접이면 포월이 돼요.",
          "**백이면**: 흑 돌 바로 옆에 붙여요. 대회에서는 흑이 좋은 주형만 고르지 못하게 주형을 정해 주거나 흑백을 바꾸는(**스왑**) 초반 규칙을 써요. 이 게임에는 그런 규칙이 없어 흑이 셋째 수를 마음대로 고르니, 백은 흑이 셋을 만들 때마다 일찍 막아요.",
        ],
      },
      {
        kind: "quiz",
        question: "백이 H9에 붙었어요(직접). **화월**을 만드는 흑 셋째 수는?",
        scene: { black: ["H8"], white: ["H9"], last: "H9" },
        options: ["I9", "I7", "J6", "H10"],
        answer: 0,
        explain:
          "I9(또는 G9)는 첫 돌의 대각선 옆이면서 백 H9와 가로 한 줄이에요. I7은 구월, J6은 유성, H10은 한성이에요.",
      },
      {
        kind: "mission",
        title: "포월 두기",
        objective:
          "백이 I9에 대각선으로 붙었어요(간접). 흑 셋째 수로 **포월**을 만드세요.",
        hint: "첫 돌의 대각선 옆 가운데, 백 I9와 **가로나 세로 한 줄**에 놓이는 자리예요.",
        scenario: { black: ["H8"], white: ["I9"] },
        check: firstAt("I7", "G9"),
        success: "포월이에요! 흑이 이길 길이 많은 모양이에요.",
        fail: "그 자리는 포월이 아니에요. 첫 돌에 대각선으로 붙이되, 백 돌과 한 줄이 되게 해 봐요.",
        solution: [place("I7")],
        mistake: [place("F6")],
      },
    ],
  },
  {
    id: "colors",
    title: "흑과 백",
    summary: "먼저 두는 흑은 금지로 묶이고, 백은 그 금지를 노린다",
    steps: [
      {
        kind: "explain",
        title: "먼저 두는 흑이 유리해요",
        body: [
          "오목은 한 수 먼저 두는 흑이 유리해요. 금지가 없는 오목은 흑이 바르게 두면 **반드시 이긴다**는 것이 2001년에 컴퓨터로 밝혀졌어요.",
          "그래서 렌주는 **흑에게만** 3·3, 4·4, **장목**(여섯 이상 잇기)을 금지해요. 그래도 흑이 조금 더 유리하다고 봐요.",
        ],
      },
      {
        kind: "explain",
        title: "흑과 백은 이기는 길이 달라요",
        body: [
          "**흑**은 3·3과 4·4가 금지라, 막을 수 없는 공격을 주로 **4·3**으로 만들어요. 한 수로 **사**(한 수 더 두면 다섯이 되는 넷)와 **열린 셋**을 함께 만드는 거예요(다음 단원).",
          "**백**은 금지가 없어 3·3, 4·4로도 이기고, 여섯 이상 이어도 이겨요.",
        ],
      },
      {
        kind: "explain",
        title: "백의 무기: 금지 자리로 몰기",
        body: [
          "흑이 막아야 할 자리가 흑에게 금지면, 흑은 그 자리를 막을 수 없어요.",
          "그림에서 백 G8·H8·I8·K8의 다섯 자리는 J8 하나인데, J8은 흑에게 **3·3**이라 둘 수 없어요(× 자리). 백은 다음 수에 J8로 다섯을 만들어요.",
          "그래서 흑은 막을 자리가 금지가 되지 않게 돌을 놓고, 백은 흑의 금지 자리를 노려요.",
        ],
        scene: {
          black: FOUL_TRAP_SCENE.black,
          white: [...FOUL_TRAP_SCENE.white, "K8"],
          forbidden: true,
          last: "K8",
        },
      },
      {
        kind: "quiz",
        question: "렌주에서 **백만** 할 수 있는 것은?",
        options: ["3·3으로 이기기", "4·3으로 이기기", "다섯 만들기"],
        answer: 0,
        explain:
          "3·3은 흑에게만 금지예요. 4·3과 다섯은 흑백 모두 할 수 있어요.",
      },
      {
        kind: "mission",
        title: "금지 자리로 몰기",
        objective:
          "이번엔 내가 **백**이에요. 백 셋(G8·H8·I8)으로 넷을 만들되, 흑이 **막을 수 없는** 넷을 만드세요.",
        hint: "흑이 막아야 할 자리가 흑에게 3·3이 되게 해요. **J8을 비워 두고** 넷을 만들어 보세요.",
        scenario: FOUL_TRAP_SCENE,
        check: firstAt("K8"),
        success:
          "흑은 J8을 막을 수 없어요(3·3 금지). 다음 수에 J8로 다섯이에요!",
        fail: "그 넷은 흑이 막을 수 있어요. 막을 자리가 흑에게 금지가 되게 해 봐요.",
        solution: [place("K8")],
        mistake: [place("J8")],
      },
    ],
  },
  {
    id: "middle",
    title: "중반 원칙",
    summary: "4·3 만들기, 이은 셋과 띈 셋, 공격과 수비 고르기",
    steps: [
      {
        kind: "explain",
        title: "4·3을 노려요",
        body: [
          "**4·3**은 한 수로 사와 열린 셋을 함께 만드는 수예요. 상대가 사를 막으면, 남은 셋을 **열린 넷**(양쪽 끝이 빈 넷)으로 키워 이겨요.",
          "그림에서 흑이 J8에 두면 가로 G8~J8이 사(왼쪽 F8은 백이 막음), 세로 J8~J10이 열린 셋이 돼요.",
          "흑은 3·3·4·4가 금지라 4·3이 가장 중요한 이기는 모양이에요.",
        ],
        scene: FOUR_THREE_SCENE,
      },
      {
        kind: "mission",
        title: "4·3 만들기",
        objective: "한 수로 **사와 열린 셋**을 함께 만드세요.",
        hint: "가로 셋(G8·H8·I8)과 세로 둘(J9·J10)이 만나는 자리를 찾아요.",
        scenario: FOUR_THREE_SCENE,
        check: firstAt("J8"),
        success: "4·3이에요! 백이 K8을 막으면 세로를 열린 넷으로 키워 이겨요.",
        fail: "그 수로는 사와 열린 셋이 함께 생기지 않아요. 두 줄이 만나는 자리를 찾아봐요.",
        solution: [place("J8")],
        mistake: [place("J11")],
      },
      {
        kind: "explain",
        title: "이은 셋과 띈 셋",
        body: [
          "셋은 **이어서**(●●●) 만들 수도, 한 칸 **띄워서**(●●·●) 만들 수도 있어요. 양쪽 끝이 비어 있으면 둘 다 열린 셋이에요.",
          "띈 셋은 빈 가운데를 채우면 열린 넷이 돼요. 그래서 막는 쪽은 양 끝뿐 아니라 가운데 빈칸도 막을 수 있어요.",
          "상대 돌 사이에 빈칸이 있어도 셋인지 꼭 살펴요.",
        ],
        scene: SPLIT_THREE_SCENE,
      },
      {
        kind: "quiz",
        question: "흑 띈 셋(G8·H8·J8)을 **열린 넷**으로 만드는 자리는?",
        scene: SPLIT_THREE_SCENE,
        options: ["I8", "F8", "K8", "H9"],
        answer: 0,
        explain:
          "가운데 I8을 채우면 넷의 양쪽 끝 F8·K8이 비어 열린 넷이에요. F8이나 K8에 두면 넷이지만 다섯 자리가 I8 하나뿐이라 막혀요.",
      },
      {
        kind: "explain",
        title: "공격과 수비 고르기",
        body: [
          "한 수 두기 전에 이 차례로 살펴요. ① 내 **다섯** ② 상대 **넷** 막기 ③ 내가 사를 이어 두어 이기는 길 ④ 상대 **열린 셋** 막기 ⑤ 그 밖에는 막으면서 내 돌도 키우는 자리.",
          "사는 상대가 반드시 막아야 해요. 그래서 상대에게 열린 셋이 있어도, 내가 사로 끝까지 몰 수 있으면 먼저 이겨요. 사로만 몰아 이기는 수순을 **VCF**, 열린 셋까지 섞어 몰아 이기는 수순을 **VCT**라고 해요.",
          "열린 셋으로 몰 때는 상대가 막으면서 사로 되받아칠 수 있어, 더 조심해서 읽어야 해요.",
        ],
      },
      {
        kind: "mission",
        title: "공격이 먼저",
        objective:
          "백에게 대각선 **열린 셋**(E10·F11·G12)이 있어요. 그래도 흑이 먼저 이기는 수를 두세요.",
        hint: "막지 말고 **4·3**을 찾아요. 세로 셋(K4·K5·K6)과 가로 둘(L7·M7)이 만나는 자리예요.",
        scenario: RACE_SCENE,
        check: firstAt("K7"),
        success: "4·3이에요! 백은 사를 막느라 열린 셋을 키울 틈이 없어요.",
        fail: "그 수로는 흑이 먼저 이기지 못해요. 사로 몰아 이기는 길이 있으면 막기보다 먼저예요.",
        solution: [place("K7")],
        mistake: [place("D9")],
      },
      {
        kind: "mission",
        title: "막으면서 키우기",
        objective:
          "백 **열린 셋**(E5·E6·E7)을 막으세요. 막으면서 흑 **열린 셋**도 만드는 자리를 고르세요.",
        hint: "백 셋의 두 끝 가운데, 흑 F8·G8과 한 줄이 되는 쪽이에요.",
        scenario: BLOCK_BUILD_SCENE,
        check: firstAt("E8"),
        success:
          "막으면서 흑 E8·F8·G8 열린 셋을 만들었어요! 이번엔 백이 막아야 해요.",
        fail: "그 수는 막기만 하거나 막지 못해요. 막으면서 내 돌과 이어지는 끝을 찾아봐요.",
        solution: [place("E8")],
        mistake: [place("E4")],
      },
    ],
  },
];
