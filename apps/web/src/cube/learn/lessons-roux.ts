// 3×3 루(Roux, docs/47 8-2): 첫 블록 → 둘째 블록 → CMLL → LSE(EO → UL·UR → 가운데 줄).
// 시연·해 보기의 수는 `@game/cube-ai`의 solveRoux가 대회 섞기(3×3 씨앗 21·7)를 실제로 푼 단계별 수다.
// 맞는지는 judge.test.ts가 엔진으로 확인한다(상황에서는 아직 목표가 아니고, 모범 답을 두면 목표가 된다).
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

/** 위 코너가 모두 옆을 보는 모양(더블 수네). 흰 면 아래로 쥔 두 블록은 지킨다 */
export const CMLL_H = "R U R' U R U' R' U R U2 R'";
/** 나쁜 엣지 넷(위 왼쪽·오른쪽·앞, 아래 앞)을 고치는 수 */
export const LSE_EO4 = "M' U M";
/** 첫 블록 요령: 위에 붙은 짝(엣지 블럭이 위-왼쪽)을 왼쪽 칸에 넣는 수(CFOP 오른쪽에서 넣기 U R U' R'의 거울) */
export const ROUX_PAIR_LEFT = "U' L' U L";

/** 섞기와 앞 단계까지의 수를 이어 「이 단계 시작 상황」을 만든다 */
const upTo = (...parts: string[]) => ({ alg: parts.join(" ") });

// 시연용(3×3 섞기 씨앗 21)
const S21 = "L2 D2 U' L2 F2 D F2 U2 B2 D' L' F' R2 B U' F2 U R B L R2";
const FB21 = "z2 y B L D R2 U F M F";
const SB21 = "Rw2 U M2 U R2 U M2 U2 Rw U R'";
const CMLL21 = "U R U2 R' U' R U' R' U2";
const EO21 = "M2 U' M' U M";
const ULUR21 = "M2 U' M U2 M U'";
const EP21 = "U2 M U2 M2 U2 M U2";

// 해 보기용(3×3 섞기 씨앗 7)
const S7 = "U' B2 D' R2 D L2 U L2 F' R2 D' L R B' U' F U2 B2 D2 U'";
const FB7 = "z2 y B' U' M' D R2 F' M2 F'";
const SB7 = "U2 R U Rw' U2 Rw2 U R2 U R' U' R U R' U' R";
const CMLL7 = "U2 R2 D R' U2 R D' R' U2 R' U R' F R' B2 R F' R' B2 R2";
const EO7 = "M' U M";
const ULUR7 = "U2 M U2 M U'";
const EP7 = "U2 M' U2 M'";

const intro: Lesson = {
  id: "roux-intro",
  size: 3,
  title: "루 한눈에",
  summary: "블록 둘을 만들고, 가운데 층(M)과 윗면(U)만으로 끝내요.",
  steps: [
    {
      kind: "find",
      body: "CFOP 다음으로 많이 쓰는 빠른 방법, 루를 배워요. 루는 질 루(Gilles Roux)가 만든 방법이에요. 루는 조각을 하나씩 넣지 않고 덩어리로 모아요. 여러 조각이 제자리에 맞아 붙은 덩어리를 「블록」이라고 해요. 조각 하나는 지금까지처럼 「엣지 블럭」, 「코너 블럭」이라고 부르고, 덩어리는 늘 「블록」이라고 적어요. 블록은 「1×2×3 블록」처럼 크기를 붙여 불러요. 루는 왼쪽과 오른쪽에 1×2×3 블록을 하나씩 만들고, 위 층 코너 넷을 맞춘 뒤, 남은 엣지 여섯을 가운데 층과 윗면만 돌려 끝내요. 화면은 흰 면을 아래로 든 맞춘 큐브에서 두 블록만 보이게 한 모습이에요. 왼쪽 블록의 코너 블럭 둘(흰색과 빨간색이 붙은 것)을 눌러 보세요. 블록의 색은 섞기마다 고를 수 있어서, 다음 단원에서는 초록 블록을 만들어요.",
      setup: { alg: "z2" },
      mask: "roux-blocks",
      find: { piece: "corner", has: ["U", "R"] },
      count: 2,
    },
    {
      kind: "demo",
      body: "섞인 큐브를 루로 끝까지 맞춰 볼게요. 왼쪽 블록 → 오른쪽 블록 → 위 층 코너 블럭 넷의 방향과 자리를 맞추는 단계(CMLL) → 남은 엣지 블럭 여섯을 맞추는 단계(LSE) 차례예요.",
      setup: upTo(S21),
      alg: [FB21, SB21, CMLL21, EO21, ULUR21, EP21].join(" "),
    },
    {
      kind: "demo",
      body: "가운데 층 M은 왼쪽 면(L)과 같은 쪽으로 돌아요. M'은 그 반대예요.",
      alg: "M M' M' M",
    },
    {
      kind: "try",
      body: "가운데 층과 윗면만 돌려 다 맞춰 보세요.",
      setup: upTo("M' U2 M"),
      alg: "M' U2 M",
      goal: "solved",
    },
  ],
};

const firstBlock: Lesson = {
  id: "roux-fb",
  size: 3,
  title: "첫 블록",
  summary: "왼쪽에 1×2×3 블록. 사각형(1×2×2)을 먼저, 그다음 짝 하나.",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 루의 흐름을 봤어요. 이번에는 첫 단계, 왼쪽 1×2×3 블록을 만들어요. 왼쪽 블록에는 왼쪽 센터 블럭, 아래-왼쪽 엣지 블럭, 왼쪽 가운데 층의 앞·뒤 엣지 블럭, 아래 층 왼쪽의 코너 블럭 둘이 들어가요. 블록은 왼쪽 센터 블럭의 색으로 불러요. 어느 색으로 만들어도 되는데, 이 섞기에서는 초록 블록(왼쪽 센터 블럭이 초록인 블록)이 짧아서 초록 블록을 만들어요. 화면의 섞인 큐브는 초록 블록에 들어갈 조각만 보이게 했어요. 블록 바닥에 갈 흰-초록 엣지 블럭을 찾아 눌러 보세요.",
      setup: upTo(S21),
      mask: "roux-fb:F",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "quiz",
      body: "첫 블록에는 정해진 공식이 없지만 차례는 정해져 있어요. ① 블록이 들어갈 쪽을 왼쪽에 두고 흰 면을 아래로 쥐어요. ② 블록 바닥, 곧 아래-왼쪽 엣지 블럭부터 넣어요. ③ 아래 층 왼쪽 코너 블럭과 그 위 가운데 층 엣지 블럭을 위 층에서 짝으로 붙여 앞-왼쪽 칸이나 뒤-왼쪽 칸에 넣어요. 바닥과 짝 하나가 맞으면 1×2×2 블록(사각형)이 돼요. ④ 남은 짝도 같은 법으로 붙여 나머지 칸에 넣어요. 짝을 붙이고 넣는 법은 CFOP의 F2L 짝과 같고, 칸이 왼쪽에 있으니 오른쪽에서 넣기를 거울로 비춰 L과 U로 넣어요. 짝은 위 층에서 붙이고 L과 U로 왼쪽 칸에 넣어요. 블록에 이미 넣은 조각만 지키면 다른 면도 돌려도 돼요.",
      setup: upTo(S21),
      mask: "roux-fb:F",
      quiz: {
        question: "첫 블록에서 가장 먼저 넣는 조각은?",
        choices: [
          "블록 바닥이 될 아래-왼쪽 엣지 블럭",
          "앞쪽 코너 블럭",
          "뒤쪽 짝",
        ],
        answer: 0,
        why: "바닥 엣지 블럭이 먼저 있어야 짝을 그 위에 붙여 사각형이 돼요.",
      },
    },
    {
      kind: "try",
      body: "대표 경우: 바닥과 뒤쪽 짝이 맞고, 앞-왼쪽 칸에 넣을 짝이 위 층에 붙어 있어요. 엣지 블럭이 위-왼쪽에 있으면 CFOP 오른쪽에서 넣기(U R U' R')를 거울로 비춘 U' L' U L로 넣어요. 쳐 보세요.",
      setup: { alg: setupFor(ROUX_PAIR_LEFT, "z2") },
      alg: ROUX_PAIR_LEFT,
      goal: "roux-fb",
      mask: "roux-blocks",
    },
    {
      kind: "demo",
      body: "실제 섞기에서 해 봐요. 아래-왼쪽 엣지 블럭과 앞쪽 짝으로 사각형을 먼저 만들고, 뒤쪽 짝을 붙여요. 섞인 큐브는 흰 면이 위인 채 시작해서, 처음에 z2로 흰 면을 아래로 뒤집고 y로 초록 블록이 들어갈 쪽을 왼쪽에 쥐어요.",
      setup: upTo(S21),
      alg: FB21,
    },
    {
      kind: "try",
      body: "다른 섞기에서 왼쪽에 첫 블록을 만들어 보세요.",
      setup: upTo(S7),
      alg: FB7,
      goal: "roux-fb",
    },
    {
      kind: "try",
      body: "무작위로 섞인 큐브에서도 해 보세요. 흰 면은 아래로 둔 채, 지금 왼쪽에 있는 센터 블럭의 색으로 왼쪽에 블록을 만들어요. 바닥 엣지 블럭 → 앞쪽 짝 → 뒤쪽 짝 차례예요.",
      setup: { rule: "random-cross" },
      goal: "roux-fb",
    },
  ],
};

const secondBlock: Lesson = {
  id: "roux-sb",
  size: 3,
  title: "둘째 블록",
  summary: "오른쪽에 같은 블록. 첫 블록을 지키려고 R·r·M·U만 돌려요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 왼쪽 블록을 만들었어요. 이번에는 오른쪽에도 1×2×3 블록을 만들어요. 차례는 첫 블록과 같아요: 바닥(아래-오른쪽) 엣지 블럭 → 앞쪽 짝 → 뒤쪽 짝. 이제 첫 블록을 지켜야 하니 오른쪽 면(R), 오른쪽 두 층(r, 화면 표기 Rw), 가운데 층(M), 윗면(U)만 돌려요.",
      setup: { alg: "z2" },
      mask: "roux-fb",
      quiz: {
        question: "왼쪽 블록이 다 됐어요. 돌리면 블록이 깨지는 것은?",
        choices: ["R", "M", "F"],
        answer: 2,
        why: "F는 왼쪽 블록의 앞쪽 조각을 끌고 가요. R과 M은 왼쪽 블록에 닿지 않아요.",
      },
    },
    {
      kind: "demo",
      body: "아래-오른쪽 엣지 블럭을 M과 U로 데려와 사각형을 만들고, 남은 짝을 R·U로 넣어요.",
      setup: upTo(S21, FB21),
      alg: SB21,
    },
    {
      kind: "try",
      body: "첫 블록을 지키며 오른쪽 블록을 만들어 보세요.",
      setup: upTo(S7, FB7),
      alg: SB7,
      goal: "roux-sb",
    },
    {
      kind: "try",
      body: "첫 블록만 맞은 큐브에서 둘째 블록을 만들어 보세요.",
      setup: { rule: "roux-fb-solved" },
      goal: "roux-sb",
      mask: "roux-blocks",
    },
  ],
};

const cmll: Lesson = {
  id: "roux-cmll",
  size: 3,
  title: "위 층 코너(CMLL)",
  summary: "두 블록을 지키며 위 층 코너 넷을 맞춰요. 처음엔 두 번에 나눠요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 두 블록을 만들었어요. 이번에는 두 블록을 지키며 위 층 코너 블럭 넷의 방향과 자리를 맞춰요. 이 단계를 CMLL이라고 불러요. 이름은 Corners of the Last Layer(마지막 층 코너)에 M을 붙인 것인데, 가운데 층 M은 상관하지 않는다는 뜻이에요. 그래서 위 층 엣지 블럭은 신경 쓰지 않아요. 공식 42개로 한 번에 하지만, 처음엔 두 번에 나눠요. ① CFOP 2단계 OLL의 코너 단계(수네 등 7개)로 위 층 코너의 노랑을 모두 위로, ② 헤드라이트를 보고 코너 자리 공식으로 자리를 맞춰요. ①의 공식은 위를 보는 노란 코너 수와 옆면의 노란 스티커 자리로 골라요. M을 빼고 R·U·F·D·B를 쓰는 공식도 끝나면 두 블록이 돌아와요.",
      setup: { alg: setupFor(CMLL_H, "z2") },
      mask: "cmll",
      quiz: {
        question: "위를 보는 노란 코너는 몇 개일까요?",
        choices: ["0개", "1개", "2개"],
        answer: 0,
        why: "하나도 없어요. 노란 칸이 모두 옆을 봐요. 옆을 보는 노란 칸 모양을 보고 공식을 골라요.",
      },
    },
    {
      kind: "demo",
      body: "다른 섞기의 시연이에요. 이 큐브는 위를 보는 노란 코너가 하나인 안티수네 모양이에요. 수네를 거꾸로 돌린 공식인 안티수네 한 번이면 맞아요.",
      setup: upTo(S21, FB21, SB21),
      alg: CMLL21,
    },
    {
      kind: "try",
      body: "노란 면을 먼저 맞추면 옆면 한 곳에 헤드라이트가 생겨요(CFOP 2단계 PLL에서 본, 옆면 한 줄 양 끝의 코너 블럭 둘이 서로 바르게 이웃한 면). 모범 답은 두 공식이에요. 앞의 U2 R2 D R' U2 R D' R' U2 R'은 이 모양에서 위 층 코너 블럭 넷의 노랑을 모두 위로 돌리는 코너 단계 공식이에요. 그다음 U로 헤드라이트를 뒤에 두고, 위 층 코너 셋의 자리를 돌리는 공식 R' F R' B2 R F' R' B2 R2(A퍼뮤라고 불러요)로 코너 자리를 맞춰요. 헤드라이트가 없으면 Y퍼뮤, 네 면 모두 헤드라이트면 코너 자리는 끝이에요. 위 층 엣지가 흐트러져도 다음 단계에서 맞추니 괜찮아요.",
      setup: upTo(S7, FB7, SB7),
      alg: CMLL7,
      goal: "cmll",
    },
    {
      kind: "try",
      body: "두 블록이 맞은 큐브에서 위 층 코너를 맞춰 보세요.",
      setup: { rule: "roux-blocks-solved" },
      goal: "cmll",
      mask: "cmll",
    },
  ],
};

const lse: Lesson = {
  id: "roux-lse",
  size: 3,
  title: "남은 엣지 여섯(LSE)",
  summary:
    "M과 U만으로 세 걸음: 엣지 방향 → 왼쪽·오른쪽 위 엣지 → 가운데 층 엣지.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 위 층 코너까지 맞췄어요. 남은 것은 위 층 엣지 넷과 아래 층 앞·뒤 엣지 둘, 모두 엣지 블럭 여섯이에요. 이 단계를 LSE(Last Six Edges, 남은 엣지 여섯)라고 하고, M과 U만 돌려요. M을 돌리면 위·아래 센터 블럭도 따라 움직이니, 끝에는 위·아래 센터 블럭을 흰·노랑 제자리로 되돌려요. 먼저 엣지 방향(EO)을 맞춰요. 흰·노랑 칸이 위나 아래를 보면 좋은 엣지, 옆을 보면 나쁜 엣지예요. 위·아래 센터도 흰·노랑으로 둬요.",
      setup: { alg: setupFor(LSE_EO4, "z2") },
      mask: "eo-edges",
      quiz: {
        question: "윗층과 아래 앞·뒤의 엣지 여섯 중 나쁜 엣지는 몇 개일까요?",
        choices: ["0개", "2개", "4개"],
        answer: 2,
        why: "위 왼쪽·오른쪽·앞, 아래 앞 엣지의 흰·노랑 칸이 옆을 봐요. M' U M 한 번이면 넷이 함께 고쳐져요.",
      },
    },
    {
      kind: "demo",
      body: "나쁜 엣지를 M' U M 같은 짧은 수로 고쳐요. 이 시연의 앞 M2 U'는 나쁜 엣지를 M' U M이 한꺼번에 고칠 자리로 옮기는 수예요.",
      setup: upTo(S21, FB21, SB21, CMLL21),
      alg: EO21,
    },
    {
      kind: "try",
      body: "나쁜 엣지를 고쳐 보세요.",
      setup: upTo(S7, FB7, SB7, CMLL7),
      alg: EO7,
      goal: "lse-eo",
    },
    {
      kind: "try",
      body: "다른 상황에서도 엣지 방향을 맞춰 보세요.",
      setup: { rule: "roux-cmll-solved" },
      goal: "lse-eo",
    },
    {
      kind: "demo",
      body: "다음은 위-왼쪽(UL)과 위-오른쪽(UR) 엣지 블럭을 제자리에 넣어요. 둘을 아래(앞·뒤)에 모았다가 M2로 함께 올려요.",
      setup: upTo(S21, FB21, SB21, CMLL21, EO21),
      alg: ULUR21,
    },
    {
      kind: "try",
      body: "왼쪽·오른쪽 위 엣지를 제자리에 넣어 보세요.",
      setup: upTo(S7, FB7, SB7, CMLL7, EO7),
      alg: ULUR7,
      goal: "lse-ulur",
    },
    {
      kind: "try",
      body: "다른 상황에서도 해 보세요.",
      setup: { rule: "roux-eo-solved" },
      goal: "lse-ulur",
    },
    {
      kind: "demo",
      body: "마지막으로 가운데 층에 남은 엣지 블럭 넷(위-앞·위-뒤·아래-앞·아래-뒤)을 M과 U2로 맞춰요. 영어 자료에서는 이 걸음을 4c라고 불러요. 루의 넷째 단계인 LSE의 세 번째 걸음이라는 뜻이에요.",
      setup: upTo(S21, FB21, SB21, CMLL21, EO21, ULUR21),
      alg: EP21,
    },
    {
      kind: "try",
      body: "가운데 층에 남은 엣지 블럭 넷을 맞춰 끝내 보세요.",
      setup: upTo(S7, FB7, SB7, CMLL7, EO7, ULUR7),
      alg: EP7,
      goal: "solved",
    },
    {
      kind: "try",
      body: "다른 상황에서도 끝내 보세요.",
      setup: { rule: "roux-ulur-solved" },
      goal: "solved",
    },
  ],
};

export const ROUX: Course = {
  id: "roux",
  size: 3,
  title: "루(Roux)",
  summary: "왼쪽 블록 → 오른쪽 블록 → 위 층 코너(CMLL) → 남은 엣지 여섯(LSE).",
  lessons: [intro, firstBlock, secondBlock, cmll, lse],
};
