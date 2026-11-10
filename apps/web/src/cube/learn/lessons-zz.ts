// 3×3 ZZ와 페트루스(docs/47 8-2). ZZ: EO라인 → 왼쪽·오른쪽 블록(R·U·L만) → 윗면(코너 7가지) → PLL.
// 페트루스는 짧은 소개(2×2×2 → 2×2×3 → 엣지 방향 → 나머지).
// ZZ 시연·해 보기의 수는 `@game/cube-ai`의 solveZZ가 대회 섞기(3×3 씨앗 21·7)를 실제로 푼 단계별 수다.
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const upTo = (...parts: string[]) => ({ alg: parts.join(" ") });
/** 흰 면을 아래로 쥔(z2) 맞춘 큐브에서 이 풀이로 풀리는 상황 */
const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

/** 엣지 방향 알아보기 문제와 해 보기의 상황(흰 면 아래로 쥔 큐브에서 이 수로 다 좋아진다) */
export const EO_CHECK = "F R B";
/** 페트루스 첫 블록(2×2×2)을 맞추는 수 */
const PETRUS_222 = "D' L B'";
/** ZZ 블록 요령: 위에 붙은 짝(엣지 블럭이 위-오른쪽)을 오른쪽 칸에 넣는 수. F를 쓰지 않는다(CFOP 오른쪽에서 넣기) */
export const ZZ_PAIR_RIGHT = "U R U' R'";

// 시연용(3×3 섞기 씨앗 21)
const S21 = "L2 D2 U' L2 F2 D F2 U2 B2 D' L' F' R2 B U' F2 U R B L R2";
const EOL21 = "z2 F U D L B U2 F'";
const LEFT21 = "L U R U' L' U2 L' U' L U L'";
const RIGHT21 = "R' U2 R2 U2 R' U2 R' U' R U' R' U2 R'";
const OLL21 = "U' Rw U R' U' Rw' F R F'";
const PLL21 = "U M' U M2 U M2 U M' U2 M2";

// 해 보기용(3×3 섞기 씨앗 7)
const S7 = "U' B2 D' R2 D L2 U L2 F' R2 D' L R B' U' F U2 B2 D2 U'";
const EOL7 = "z2 B U F L' D B";
const LEFT7 = "L' U2 L U' L' U' R U L' U' L";
const RIGHT7 = "R' U R U2 R' U2 R2 U' R2 U' R'";
const OLL7 = "U' R U R' U R U2 R'";
const PLL7 = "U' R U R' F' R U R' U' R' F R2 U' R' U";

const zzIntro: Lesson = {
  id: "zz-intro",
  size: 3,
  title: "ZZ 한눈에",
  summary: "처음에 엣지 방향을 맞춰 두면, 그다음은 R·U·L만 돌려요.",
  steps: [
    {
      kind: "look",
      body: "CFOP와 다른 길로 빨리 맞추는 방법, ZZ를 배워요. ZZ는 즈비그녜프 즈보로프스키(Zbigniew Zborowski)가 만든 방법이에요. 흰 면을 아래로 들고 시작해요. 큐브 전체를 돌려 흰 면을 아래로 보내 보세요.",
      look: { color: "U", on: "D" },
    },
    {
      kind: "demo",
      body: "섞인 큐브를 ZZ로 끝까지 맞춰 볼게요. EO라인(엣지 방향 맞추기 + 아래-앞·아래-뒤 엣지 블럭 놓기, 시연은 흰 면이 위인 섞인 큐브를 z2로 뒤집어 시작해요) → 왼쪽 블록 → 오른쪽 블록 → 윗면 → PLL 차례예요. 여러 조각이 제자리에 맞아 붙은 덩어리를 「블록」이라고 해요. 조각 하나는 지금까지처럼 「엣지 블럭」, 「코너 블럭」이라고 부르고, 덩어리는 늘 「블록」이라고 적어요.",
      setup: upTo(S21),
      alg: [EOL21, LEFT21, RIGHT21, OLL21, PLL21].join(" "),
    },
    {
      kind: "quiz",
      body: "R·U·L·D만 돌려서 제자리에 바른 방향으로 넣을 수 있는 엣지 블럭을 「좋은 엣지」, 그렇지 않은 것을 「나쁜 엣지」라고 해요. 처음에 엣지 블럭 열둘의 방향(EO)을 모두 좋게 맞추고 아래-앞·아래-뒤 엣지 블럭을 제자리에 놓아요(EO라인). 앞·뒤를 4분의 1 돌리면 엣지 방향이 다시 흐트러져요.",
      quiz: {
        question: "EO라인 뒤 블록을 만들 때는 어느 면만 돌릴까요?",
        choices: ["R·U·L", "F·B·U", "M·U"],
        answer: 0,
        why: "F·B를 안 돌리니 좋은 엣지가 그대로예요(D는 아래 줄을 옮기니 블록에서는 쓰지 않아요). 위 층 엣지가 모두 좋은 엣지면 노랑이 위를 보니, 마지막 층에서는 노란 십자가 이미 있고 위 층 코너의 방향과 마지막 층 자리(PLL)만 남아요.",
      },
    },
  ],
};

const zzEo: Lesson = {
  id: "zz-eo",
  size: 3,
  title: "엣지 방향(EO)",
  summary: "앞·뒤를 4분의 1 돌릴 때만 엣지 방향이 바뀌어요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 ZZ의 흐름을 봤어요. 이번에는 ZZ의 핵심인 엣지 방향, 곧 좋은 엣지와 나쁜 엣지를 자세히 봐요. 앞(F)이나 뒤(B)를 4분의 1 돌리면 그 면의 엣지 블럭이 「뒤집혀」 좋고 나쁨이 뒤바뀌어요. 맞춘 큐브에서 돌리면 좋은 엣지가 나쁜 엣지가 돼요. R·U·L·D와 F2·B2로는 바뀌지 않아요. 흰 면을 아래로 든 맞춘 큐브에서 F를 한 번 돌렸어요.",
      setup: { alg: "z2 F" },
      mask: "eo-edges",
      quiz: {
        question: "나쁜 엣지는 몇 개일까요?",
        choices: ["0개", "2개", "4개"],
        answer: 2,
        why: "앞면의 엣지 블럭 넷이 모두 뒤집혀요. F'으로 되돌리면 다시 좋아져요.",
      },
    },
    {
      kind: "demo",
      body: "F를 한 번 돌리면 앞면의 엣지 블럭 넷이 나쁜 엣지가 돼요. F'으로 되돌려요.",
      setup: { alg: "z2" },
      alg: "F F'",
      mask: "eo-edges",
    },
    {
      kind: "quiz",
      body: "알아보는 법: 엣지 블럭의 흰·노랑 칸(없으면 초록·파랑 칸)을 기준 칸으로 봐요. 위·아래 층 엣지는 기준 칸이 위나 아래를 보면, 가운데 층 엣지는 기준 칸이 앞이나 뒤를 보면 좋은 엣지예요.",
      setup: flip(EO_CHECK),
      mask: "eo-edges",
      quiz: {
        question: "위-왼쪽 엣지는 좋은 엣지일까요?",
        choices: ["좋은 엣지예요", "나쁜 엣지예요"],
        answer: 0,
        why: "기준 칸(흰·노랑)이 위를 봐요. 위-앞 엣지 블럭은 기준 칸이 앞을 봐서 나쁜 엣지예요.",
      },
    },
    {
      kind: "quiz",
      body: "가운데 층 엣지는 기준이 달라요. 기준 칸이 앞이나 뒤를 보면 좋은 엣지예요.",
      setup: flip(EO_CHECK),
      mask: "eo-edges",
      quiz: {
        question: "가운데 층의 앞-오른쪽 엣지 블럭은 좋은 엣지일까요?",
        choices: ["좋은 엣지예요", "나쁜 엣지예요"],
        answer: 1,
        why: "기준 칸(흰·노랑)이 앞·뒤가 아니라 오른쪽을 봐서 나쁜 엣지예요.",
      },
    },
    {
      kind: "try",
      body: "고치는 법: F나 B를 4분의 1 돌리면 그 면 엣지 블럭 넷의 좋고 나쁨이 모두 뒤바뀌어요. 그래서 나쁜 엣지 넷을 앞면(또는 뒷면)에 모아 F(B)를 한 번 돌리면 넷이 함께 좋아져요. 모을 때는 엣지 방향을 바꾸지 않는 U·R·L·D를 써요. 지금은 나쁜 엣지 넷이 위 층과 앞면에 있어요. U로 앞면에 모으고 F 한 번으로 고쳐 보세요.",
      setup: flip("U F"),
      alg: "U F",
      goal: "eo",
      mask: "eo-edges",
    },
    {
      kind: "try",
      body: "나쁜 엣지가 여럿 흩어져 있어요. 흰 면을 아래, 초록 면을 앞으로 들고 해요. 앞면에 나쁜 엣지 넷이 모여 있으면 F로 고치고, R로 다른 나쁜 엣지 넷을 뒷면에 모아 B로 고쳐요.",
      setup: flip(EO_CHECK),
      alg: EO_CHECK,
      goal: "eo",
      mask: "eo-edges",
    },
  ],
};

const zzEoLine: Lesson = {
  id: "zz-eoline",
  size: 3,
  title: "EO라인",
  summary: "엣지 방향 + 아래 앞·뒤 엣지. 살펴보기 동안 계획해요.",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 좋은 엣지와 나쁜 엣지를 알아봤어요. EO라인은 엣지 방향을 모두 좋게 맞추면서 아래-앞(DF)과 아래-뒤(DB) 엣지 블럭도 제자리에 놓는 단계예요. 아래-앞과 아래-뒤에 흰 엣지 블럭 둘이 한 줄로 놓여요. 처음엔 방향을 먼저, 줄을 나중에 해도 돼요. 아래 앞에 갈 흰-초록 엣지 블럭을 찾아 눌러 보세요.",
      setup: upTo(S21),
      mask: "eo-edges",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "demo",
      body: "큐브를 흰 면 아래로 쥐고, 나쁜 엣지를 F·B로 고치며 줄 엣지를 아래로 데려와요.",
      setup: upTo(S21),
      alg: EOL21,
      mask: "eo-edges",
    },
    {
      kind: "try",
      body: "다른 섞기에서 EO라인을 만들어 보세요.",
      setup: upTo(S7),
      alg: EOL7,
      goal: "eoline",
      mask: "eo-edges",
    },
    {
      kind: "try",
      body: "무작위로 섞인 큐브에서도 해 보세요.",
      setup: { rule: "random-cross" },
      goal: "eoline",
      mask: "eo-edges",
    },
  ],
};

const zzF2l: Lesson = {
  id: "zz-f2l",
  size: 3,
  title: "블록(ZZF2L)",
  summary: "R·U·L만 돌려 왼쪽 블록, 오른쪽 블록.",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 EO라인을 만들었어요. 이제 R·U·L만 돌려 왼쪽과 오른쪽에 1×2×3 블록을 만들어 아래 두 층을 채워요. 큐브를 다시 쥘 일이 없어 손이 빨라요. 흰 면이 아래, 초록이 앞이면 왼쪽은 빨강이에요. 왼쪽 블록에 들어갈 앞쪽 코너 블럭(흰-빨강-초록)을 찾아 눌러 보세요.",
      setup: upTo(S21, EOL21),
      mask: "f2l",
      find: { piece: "corner", colors: ["U", "R", "F"] },
    },
    {
      kind: "quiz",
      body: "블록은 차례대로 쌓아요. ① 블록 바닥(아래-왼쪽 또는 아래-오른쪽) 엣지 블럭 → ② 코너 블럭과 가운데 층 엣지 블럭의 짝 하나 → ③ 남은 짝. 바닥과 짝 하나가 맞으면 1×2×2 블록(사각형)이 돼요. 짝을 붙이고 넣는 법은 CFOP의 F2L 짝과 같지만, F·B를 돌리면 엣지 방향이 깨지니 「앞에서 넣기」(U' F' U F) 대신 U를 돌려 엣지 블럭을 위-오른쪽에 두고 「오른쪽에서 넣기」(U R U' R')만 써요. 왼쪽 블록은 엣지 블럭을 위-왼쪽에 두고 그 거울 U' L' U L이에요. 큐브를 돌려 쥐지 않고(y 없이) 블록 쪽 면을 그대로 돌려요.",
      setup: upTo(S21, EOL21),
      mask: "f2l",
      quiz: {
        question: "ZZ 블록에서 짝을 넣을 때 쓰지 않는 것은?",
        choices: [
          "U' F' U F(앞에서 넣기)",
          "U R U' R'(오른쪽에서 넣기)",
          "U' L' U L",
        ],
        answer: 0,
        why: "F를 4분의 1 돌리면 엣지 방향이 깨져요. R·U·L만 쓰는 넣기로 바꿔요.",
      },
    },
    {
      kind: "try",
      body: "대표 경우: 오른쪽 블록의 앞 칸(앞-오른쪽)에 넣을 짝이 위 층에 붙어 있고 엣지 블럭이 위-오른쪽에 있어요. U R U' R'로 넣어 보세요.",
      setup: flip(ZZ_PAIR_RIGHT),
      alg: ZZ_PAIR_RIGHT,
      goal: "f2l",
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "실제 섞기에서 해 봐요. 왼쪽 블록: 아래-왼쪽 엣지 블럭과 짝 하나로 사각형을 만들고, 다른 짝을 붙여요.",
      setup: upTo(S21, EOL21),
      alg: LEFT21,
      mask: "f2l",
    },
    {
      kind: "try",
      body: "R·U·L만 돌려 왼쪽 블록을 만들어 보세요.",
      setup: upTo(S7, EOL7),
      alg: LEFT7,
      goal: "zz-left",
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "오른쪽 블록도 같아요. 이제 L을 돌리면 왼쪽 블록이 깨지니, 오른쪽 블록은 R과 U만으로 만들어요.",
      setup: upTo(S21, EOL21, LEFT21),
      alg: RIGHT21,
      mask: "f2l",
    },
    {
      kind: "try",
      body: "오른쪽 블록을 만들어 아래 두 층을 끝내 보세요.",
      setup: upTo(S7, EOL7, LEFT7),
      alg: RIGHT7,
      goal: "f2l",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "EO라인만 맞은 큐브에서 두 블록을 만들어 보세요.",
      setup: { rule: "zz-eoline-solved" },
      goal: "f2l",
      mask: "f2l",
    },
  ],
};

const zzLl: Lesson = {
  id: "zz-ll",
  size: 3,
  title: "마지막 층",
  summary: "노란 십자는 저절로 있어요. 위 층 코너 공식 7개 → PLL.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 두 블록으로 아래 두 층을 채웠어요. 엣지 방향이 이미 맞아 노란 십자가 늘 있어요. 그래서 윗면은 CFOP 2단계 OLL의 코너 단계 공식 7개(수네 등)로 끝나요. 그다음은 PLL이에요. 더 나아가면 COLL(위 층 코너의 방향과 자리를 한 번에)이나 ZBLL(마지막 층을 공식 하나로)도 있어요. 공식은 위를 보는 노란 코너 수로 골라요.",
      setup: upTo(S7, EOL7, LEFT7, RIGHT7),
      mask: "oll",
      quiz: {
        question: "위를 보는 노란 코너는 몇 개일까요?",
        choices: ["0개", "1개", "2개"],
        answer: 1,
        why: "하나예요. 그 코너 블럭을 앞-왼쪽 위에 두면 앞-오른쪽 위 코너 블럭의 노랑이 앞을 봐서 수네를 해요. 다음 시연을 본 뒤 나오는 해 보기가 이 상황이에요.",
      },
    },
    {
      kind: "demo",
      body: "다른 섞기의 시연이에요. 노란 코너 둘이 위를 보는 T 모양이라 그 모양의 공식 한 번으로 위 층 코너의 노랑을 모두 위로 해요. 공식 속 Rw는 소문자 r(오른쪽 두 층)과 같아요.",
      setup: upTo(S21, EOL21, LEFT21, RIGHT21),
      alg: OLL21,
      mask: "oll",
    },
    {
      kind: "try",
      body: "수네로 윗면을 노랗게 만들어 보세요.",
      setup: upTo(S7, EOL7, LEFT7, RIGHT7),
      alg: OLL7,
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "try",
      body: "노란 십자가 있는 큐브에서 윗면을 맞춰 보세요.",
      setup: { rule: "yellow-cross-solved" },
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "try",
      body: "PLL로 끝내 보세요. 힌트의 공식은 한 번에 끝내는 전체 PLL 가운데 J퍼뮤예요. 아직 모르면 CFOP 2단계 PLL(코너 → 엣지)로 풀어도 돼요.",
      setup: upTo(S7, EOL7, LEFT7, RIGHT7, OLL7),
      alg: PLL7,
      goal: "ll",
      mask: "pll",
    },
  ],
};

export const ZZ: Course = {
  id: "zz",
  size: 3,
  title: "ZZ",
  summary: "EO라인 → 왼쪽·오른쪽 블록(R·U·L만) → 윗면 코너 → PLL.",
  lessons: [zzIntro, zzEo, zzEoLine, zzF2l, zzLl],
};

const petrus: Lesson = {
  id: "petrus-intro",
  size: 3,
  title: "페트루스 한눈에",
  summary: "2×2×2 → 2×2×3 → 엣지 방향 → 나머지 F2L(R·U) → 마지막 층.",
  steps: [
    {
      kind: "find",
      body: "ZZ보다 먼저 나온, 블록을 키워 가는 방법 페트루스를 짧게 봐요. 페트루스는 라르스 페트루스(Lars Petrus)가 만든 방법이에요. ZZ에서처럼 「블록」은 여러 조각이 붙은 덩어리예요. 작은 블록을 키워 가며 맞추고, 블록 뒤에 엣지 방향을 고쳐요. 이 생각이 ZZ로 이어졌어요. 흰 면을 위, 초록 면을 앞으로 든 그대로 해요. 첫 블록은 뒤-왼쪽 아래 구석의 2×2×2 블록이에요. 그 구석의 코너 블럭(노랑-주황-파랑)을 찾아 눌러 보세요.",
      setup: { alg: setupFor(PETRUS_222) },
      mask: "all",
      find: { piece: "corner", colors: ["D", "L", "B"] },
    },
    {
      kind: "try",
      body: "뒤-왼쪽 아래 구석에 2×2×2 블록을 만들어 보세요. 코너 블럭 하나, 엣지 블럭 셋, 센터 블럭 셋이에요.",
      setup: { alg: setupFor(PETRUS_222) },
      alg: PETRUS_222,
      goal: "petrus-222",
    },
    {
      kind: "try",
      body: "블록을 앞으로 넓혀 2×2×3을 만들어 보세요. 뒤쪽 2×2×2는 지켜요.",
      setup: { alg: setupFor("F2 U F2") },
      alg: "F2 U F2",
      goal: "petrus-223",
    },
    {
      kind: "try",
      body: "블록을 다 만든 뒤에는 나쁜 엣지를 고쳐요. 그러면 남은 F2L은 R과 U만으로 끝나요. 이 연습은 뒤-왼쪽 아래의 2×2×2 블록만 맞은 큐브라, 그 블록을 지키며 나쁜 엣지를 고쳐 보세요. 공식 안의 F는 지키는 블록에 닿지 않아요.",
      setup: { alg: setupFor("U F R U' R' F'") },
      alg: "U F R U' R' F'",
      goal: "eo",
      mask: "eo-edges",
    },
  ],
};

export const PETRUS: Course = {
  id: "petrus",
  size: 3,
  title: "페트루스(소개)",
  summary: "작은 블록을 키우고, 엣지 방향을 고친 뒤 R·U만으로 F2L.",
  lessons: [petrus],
};
