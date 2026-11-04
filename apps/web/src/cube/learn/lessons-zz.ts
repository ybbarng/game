// 3×3 ZZ와 페트루스(docs/47 8-2). ZZ: EO라인 → 왼쪽·오른쪽 블록(R·U·L만) → 윗면(꼭짓점 7가지) → PLL.
// 페트루스는 짧은 소개(2×2×2 → 2×2×3 → 모서리 방향 → 나머지).
// ZZ 시연·해 보기의 수는 `@game/cube-ai`의 solveZZ가 대회 섞기(3×3 씨앗 21·7)를 실제로 푼 단계별 수다.
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const upTo = (...parts: string[]) => ({ alg: parts.join(" ") });
/** 흰 면을 아래로 쥔(z2) 맞춘 큐브에서 이 풀이로 풀리는 상황 */
const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

/** 모서리 방향 알아보기 문제와 해 보기의 상황(흰 면 아래로 쥔 큐브에서 이 수로 다 좋아진다) */
export const EO_CHECK = "F R B";
/** 페트루스 첫 블록(2×2×2)을 맞추는 수 */
const PETRUS_222 = "D' L B'";

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
  summary: "처음에 모서리 방향을 맞춰 두면, 그다음은 R·U·L만 돌려요.",
  steps: [
    {
      kind: "look",
      body: "ZZ는 즈비그녜프 즈보로프스키(Zbigniew Zborowski)가 만든 방법이에요. 흰 면을 아래로 들고 시작해요. 큐브 전체를 돌려 흰 면을 아래로 보내 보세요.",
      look: { color: "U", on: "D" },
    },
    {
      kind: "demo",
      body: "섞인 큐브를 ZZ로 끝까지 맞춰 볼게요. EO라인 → 왼쪽 블록 → 오른쪽 블록 → 윗면 → PLL 차례예요.",
      setup: upTo(S21),
      alg: [EOL21, LEFT21, RIGHT21, OLL21, PLL21].join(" "),
    },
    {
      kind: "quiz",
      body: "처음에 모서리 방향(EO)을 모두 맞추고 아래 앞·뒤 모서리를 놓아요(EO라인). 앞·뒤를 4분의 1 돌리면 모서리 방향이 다시 흐트러져요.",
      quiz: {
        question: "EO라인 뒤 블록을 만들 때는 어느 면만 돌릴까요?",
        choices: ["R·U·L", "F·B·U", "M·U"],
        answer: 0,
        why: "F·B를 안 돌리니 좋은 모서리가 그대로예요. 그래서 윗면은 꼭짓점만 남아요.",
      },
    },
  ],
};

const zzEo: Lesson = {
  id: "zz-eo",
  size: 3,
  title: "모서리 방향(EO)",
  summary: "앞·뒤를 4분의 1 돌릴 때만 모서리 방향이 바뀌어요.",
  steps: [
    {
      kind: "quiz",
      body: "앞(F)이나 뒤(B)를 4분의 1 돌리면 모서리가 「뒤집혀」 나쁜 모서리가 돼요. R·U·L·D와 F2·B2로는 바뀌지 않아요. 흰 면을 아래로 든 맞춘 큐브에서 F를 한 번 돌렸어요.",
      setup: { alg: "z2 F" },
      mask: "eo-edges",
      quiz: {
        question: "나쁜 모서리는 몇 개일까요?",
        choices: ["0개", "2개", "4개"],
        answer: 2,
        why: "앞면 모서리 넷이 모두 뒤집혀요. F'으로 되돌리면 다시 좋아져요.",
      },
    },
    {
      kind: "demo",
      body: "F를 한 번 돌리면 앞면 모서리 넷이 나쁜 방향이 돼요. F'으로 되돌려요.",
      setup: { alg: "z2" },
      alg: "F F'",
      mask: "eo-edges",
    },
    {
      kind: "quiz",
      body: "알아보는 법: 흰·노랑 칸(없으면 초록·파랑 칸)을 기준 칸으로 봐요. 위·아래 층 모서리는 기준 칸이 위나 아래를 보면, 가운데 층 모서리는 기준 칸이 앞이나 뒤를 보면 좋은 모서리예요.",
      setup: flip(EO_CHECK),
      mask: "eo-edges",
      quiz: {
        question: "위-왼쪽 모서리는 좋은 모서리일까요?",
        choices: ["좋은 모서리예요", "나쁜 모서리예요"],
        answer: 0,
        why: "기준 칸(흰·노랑)이 위를 봐요. 위-앞 모서리는 기준 칸이 앞을 봐서 나쁜 모서리예요.",
      },
    },
    {
      kind: "quiz",
      body: "가운데 층 모서리는 기준이 달라요. 기준 칸이 앞이나 뒤를 보면 좋은 모서리예요.",
      setup: flip(EO_CHECK),
      mask: "eo-edges",
      quiz: {
        question: "앞-오른쪽(가운데 층) 모서리는 좋은 모서리일까요?",
        choices: ["좋은 모서리예요", "나쁜 모서리예요"],
        answer: 1,
        why: "기준 칸(흰·노랑)이 앞·뒤가 아니라 오른쪽을 봐서 나쁜 모서리예요.",
      },
    },
    {
      kind: "try",
      body: "나쁜 모서리를 모두 좋게 바꿔 보세요. 흰 면을 아래, 초록 면을 앞으로 들고 해요.",
      setup: flip(EO_CHECK),
      alg: EO_CHECK,
      goal: "eo",
      mask: "eo-edges",
    },
    {
      kind: "try",
      body: "나쁜 모서리가 넷이에요. 앞면에 모아 F 한 번으로 고쳐 보세요.",
      setup: flip("U F"),
      alg: "U F",
      goal: "eo",
      mask: "eo-edges",
    },
  ],
};

const zzEoLine: Lesson = {
  id: "zz-eoline",
  size: 3,
  title: "EO라인",
  summary: "모서리 방향 + 아래 앞·뒤 모서리. 살펴보기 동안 계획해요.",
  steps: [
    {
      kind: "find",
      body: "EO라인은 모서리 방향을 맞추면서 아래 앞(DF)과 아래 뒤(DB) 모서리도 제자리에 놓는 단계예요. 아래에 흰 줄 하나가 생겨요. 처음엔 방향을 먼저, 줄을 나중에 해도 돼요. 아래 앞에 갈 흰-초록 모서리를 찾아 눌러 보세요.",
      setup: upTo(S21),
      mask: "eo-edges",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "demo",
      body: "큐브를 흰 면 아래로 쥐고, 나쁜 모서리를 F·B로 고치며 줄 모서리를 아래로 데려와요.",
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
      body: "EO라인 뒤에는 R·U·L만 돌려 왼쪽과 오른쪽에 1×2×3 블록을 만들어요. 큐브를 다시 쥘 일이 없어 손이 빨라요. 흰 면이 아래, 초록이 앞이면 왼쪽은 빨강이에요. 왼쪽 블록의 앞 꼭짓점(흰-빨강-초록)을 찾아 눌러 보세요.",
      setup: upTo(S21, EOL21),
      mask: "f2l",
      find: { piece: "corner", colors: ["U", "R", "F"] },
    },
    {
      kind: "demo",
      body: "왼쪽 블록: 아래 왼쪽 모서리와 짝 하나로 사각형을 만들고, 다른 짝을 붙여요.",
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
      body: "오른쪽 블록도 같아요. 왼쪽 블록을 깨지 않게 L을 돌렸으면 되돌려요.",
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
  summary: "노란 십자는 저절로 있어요. 꼭짓점 공식 7개 → PLL.",
  steps: [
    {
      kind: "quiz",
      body: "모서리 방향이 이미 맞아 노란 십자가 늘 있어요. 그래서 윗면은 꼭짓점 공식 7개(수네 등)로 끝나요. 그다음은 PLL이에요. 더 나아가면 COLL(꼭짓점을 한 번에)이나 ZBLL(마지막 층을 공식 하나로)도 있어요. 공식은 위를 보는 노란 꼭짓점 수로 골라요.",
      setup: upTo(S7, EOL7, LEFT7, RIGHT7),
      mask: "oll",
      quiz: {
        question: "위를 보는 노란 꼭짓점은 몇 개일까요?",
        choices: ["0개", "1개", "2개"],
        answer: 1,
        why: "하나예요. 그 꼭짓점을 왼쪽 앞에 두고 수네를 해요. 바로 다음 해 보기 상황이에요.",
      },
    },
    {
      kind: "demo",
      body: "T 모양: 윗면을 한 번에 노랗게 해요.",
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
      body: "PLL로 끝내 보세요.",
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
  summary: "EO라인 → 왼쪽·오른쪽 블록(R·U·L만) → 윗면 꼭짓점 → PLL.",
  lessons: [zzIntro, zzEo, zzEoLine, zzF2l, zzLl],
};

const petrus: Lesson = {
  id: "petrus-intro",
  size: 3,
  title: "페트루스 한눈에",
  summary: "2×2×2 → 2×2×3 → 모서리 방향 → 나머지 F2L(R·U) → 마지막 층.",
  steps: [
    {
      kind: "find",
      body: "페트루스는 라르스 페트루스(Lars Petrus)가 만든 방법이에요. 작은 블록을 키워 가며 맞춰요. 블록 뒤에 모서리 방향을 고치는 생각이 ZZ로 이어졌어요. 첫 블록은 왼쪽-뒤-아래 2×2×2예요. 그 꼭짓점(노랑-주황-파랑)을 찾아 눌러 보세요.",
      setup: { alg: setupFor(PETRUS_222) },
      mask: "all",
      find: { piece: "corner", colors: ["D", "L", "B"] },
    },
    {
      kind: "try",
      body: "왼쪽-뒤-아래에 2×2×2 블록을 만들어 보세요. 꼭짓점 하나, 모서리 셋, 가운데 셋이에요.",
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
      body: "나쁜 모서리를 고쳐 보세요. 그러면 남은 F2L은 R과 U만으로 끝나요.",
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
  summary: "작은 블록을 키우고, 모서리 방향을 고친 뒤 R·U만으로 F2L.",
  lessons: [petrus],
};
