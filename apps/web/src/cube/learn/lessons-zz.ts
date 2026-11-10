// 3×3 ZZ와 페트루스(docs/47 8-2). ZZ: EO라인 → 왼쪽·오른쪽 블록(R·U·L만) → 윗면(코너 7가지) → PLL.
// 페트루스는 짧은 소개(2×2×2 → 2×2×3 → 엣지 방향 → 나머지).
// ZZ 시연·해 보기의 수는 `@game/cube-ai`의 solveZZ가 대회 섞기(3×3 씨앗 21·7)를 실제로 푼 단계별 수다.
import { solvedCube } from "@game/cube-engine";

import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";
import { nextEo, nextLine, play3, runZz, stepMovesZz } from "./zz-path";

/** zz-path.ts 규칙이 그 상태에서 내는 수(엣지 방향만, 또는 방향 + 줄) */
function ruleMoves(start: string, withLine: boolean): string {
  const eo = runZz(play3(solvedCube(3), start), nextEo);
  const line = withLine ? runZz(eo.state, nextLine).steps : [];
  return [...eo.steps, ...line].map(stepMovesZz).join(" ");
}

const upTo = (...parts: string[]) => ({ alg: parts.join(" ") });
/** 흰 면을 아래로 쥔(z2) 맞춘 큐브에서 이 풀이로 풀리는 상황 */
const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

/** 엣지 방향 알아보기 문제와 해 보기의 상황(흰 면 아래로 쥔 큐브에서 이 수로 다 좋아진다) */
export const EO_CHECK = "F R B";
/** 페트루스 첫 블록(2×2×2)을 맞추는 수 */
const PETRUS_222 = "D' L B'";
/** 페트루스 2×2×2 마지막 짝: 코너 블럭 뒤-왼쪽 위, 엣지 블럭 위-왼쪽 → 뒤-왼쪽 칸 */
export const PETRUS_BACK_PAIR = "U L U' L'";
/** 페트루스 2×2×3 앞쪽 짝: 코너 블럭 앞-왼쪽 위, 엣지 블럭 위-왼쪽 → 앞-왼쪽 칸 */
export const PETRUS_FRONT_PAIR = "U' L' U L";
/** ZZ 블록 요령: 위에 붙은 짝(엣지 블럭이 위-오른쪽)을 오른쪽 칸에 넣는 수. F를 쓰지 않는다(CFOP 오른쪽에서 넣기) */
export const ZZ_PAIR_RIGHT = "U R U' R'";
/** 오른쪽 블록 뒤 칸(뒤-오른쪽): 엣지 블럭 위-오른쪽, 코너 블럭 뒤-오른쪽 위. 앞 칸 공식의 앞뒤를 바꾼 꼴 */
export const ZZ_PAIR_BACK = "U' R' U R";
/** 엣지 방향 해 보기 둘(규칙이 낸 수) */
export const EO_GATHER = ruleMoves(setupFor("U F", "z2"), false);
export const EO_SCATTERED = ruleMoves(setupFor(EO_CHECK, "z2"), false);

// 시연용(3×3 섞기 씨앗 21)
const S21 = "L2 D2 U' L2 F2 D F2 U2 B2 D' L' F' R2 B U' F2 U R B L R2";
const EOL21 = "z2 F U D L B U2 F'";
const LEFT21 = "L U R U' L' U2 L' U' L U L'";
/** EO라인 단원의 시연·해 보기: 규칙(엣지 방향 → 줄)이 낸 수. 블록 단원은 위 EOL21·EOL7 상태에서 이어 간다 */
const EOLINE_RULE_21 = `z2 ${ruleMoves(`${S21} z2`, true)}`;
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
const EOLINE_RULE_7 = `z2 ${ruleMoves(`${S7} z2`, true)}`;

const zzIntro: Lesson = {
  id: "zz-intro",
  size: 3,
  title: "ZZ 한눈에",
  summary: "처음에 엣지 방향을 맞춰 두면, 그다음은 R·U·L만 돌려요.",
  steps: [
    {
      kind: "look",
      body: "CFOP와 다른 길로 빨리 맞추는 방법, ZZ를 배워요. ZZ는 즈비그녜프 즈보로프스키(Zbigniew Zborowski)가 만든 방법이에요. 흰 면을 아래로 들고 시작해요. 초록 면을 앞에 둔 채 z2(앞에서 보아 시계 방향으로 반 바퀴)로 큐브 전체를 돌려 흰 면을 아래로 보내 보세요.",
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
      body: "앞에서는 맞춘 큐브에서 F 한 번으로 생긴 나쁜 엣지를 봤어요. 이번에는 섞인 큐브에서 알아보는 법이에요. 화면은 흰 면을 아래로 쥔 큐브를 F R B로 풀리게 섞은 상태예요(B' R' F'를 친 것). 알아보는 법: 엣지 블럭의 흰·노랑 칸(없으면 초록·파랑 칸)을 기준 칸으로 봐요. 위·아래 층 엣지는 기준 칸이 위나 아래를 보면, 가운데 층 엣지는 기준 칸이 앞이나 뒤를 보면 좋은 엣지예요.",
      setup: flip(EO_CHECK),
      mask: "eo-edges",
      quiz: {
        question: "위-왼쪽 엣지 블럭은 좋은 엣지일까요?",
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
      body: "고치는 법: F를 4분의 1 돌리면 앞면 엣지 블럭 넷의 좋고 나쁨이 모두 뒤바뀌어요. 그래서 나쁜 엣지 넷을 앞면 네 자리(앞-오른쪽·앞-왼쪽·위-앞·아래-앞)에 모아 F를 한 번 돌리면 넷이 함께 좋아져요. 모을 때는 엣지 방향을 바꾸지 않는 U·D·R·L을 써요. 앞면 자리마다 그 자리를 지나는 층이 하나씩 있어요: 앞-오른쪽은 R, 앞-왼쪽은 L, 위-앞은 U, 아래-앞은 D. 지금은 나쁜 엣지 셋이 앞면에, 하나가 위 층에 있어요. U로 위-앞에 데려오고 F 한 번으로 고쳐 보세요.",
      setup: flip("U F"),
      alg: EO_GATHER,
      goal: "eo",
      mask: "eo-edges",
    },
    {
      kind: "quiz",
      body: "나쁜 엣지는 늘 짝수(0·2·4…)예요. 경우는 둘이에요. ① 넷 이상이면 앞면 자리를 앞-오른쪽 → 앞-왼쪽 → 위-앞 → 아래-앞 차례로 봐요. 좋은 엣지가 있는 자리는 그 자리의 층을 돌려 같은 층의 나쁜 엣지를 데려와요(앞-오른쪽: 아래-오른쪽에서 R, 뒤-오른쪽에서 R2, 위-오른쪽에서 R'. 앞-왼쪽: 위-왼쪽 L, 뒤-왼쪽 L2, 아래-왼쪽 L'. 위-앞: 위-오른쪽 U, 위-뒤 U2, 위-왼쪽 U'. 아래-앞: 아래-왼쪽 D, 아래-뒤 D2, 아래-오른쪽 D'). 이미 모은 앞면의 나쁜 엣지 블럭은 그대로 있어야 해요. 그 층에 나쁜 엣지가 없으면, 나쁜 엣지를 다른 층으로 그 자리의 층에 옮기고 → 그 자리의 층을 돌려 넣고 → 다른 층을 되돌려요(예: 뒤-왼쪽의 나쁜 엣지를 위-앞으로 L U' L'). 앞면에 넷(넷이 안 되면 셋)이 모이면 F. 그러면 나쁜 엣지가 둘 이상 줄어요. ② 둘이면 앞면에 꼭 하나만 있게 하고 F(앞면에 없으면 ①의 차례로 하나만 데려오고, 둘 다 있으면 아래 문제처럼 하나를 빼요). 그러면 넷이 되고, ①로 한 번 더 고쳐요.",
      mask: "eo-edges",
      quiz: {
        question: "나쁜 엣지가 둘이고 둘 다 앞면에 있어요. 어떻게 할까요?",
        choices: [
          "앞면 자리 차례로 처음 나오는 나쁜 엣지를 그 자리의 층 한 번(R·L·U·D)으로 앞면 밖으로 빼고 F",
          "그대로 F",
        ],
        answer: 0,
        why: "F는 앞면 넷의 좋고 나쁨을 모두 뒤바꿔서, 나쁜 둘·좋은 둘이면 다시 나쁜 둘이 남아요. 하나만 두면 F 뒤 나쁜 엣지가 넷이 돼 ①로 고칠 수 있어요.",
      },
    },
    {
      kind: "try",
      body: "나쁜 엣지가 여럿 흩어져 있어요. 흰 면을 아래, 초록 면을 앞으로 들고 앞 단계의 ①·② 차례로 고쳐 보세요.",
      setup: flip(EO_CHECK),
      alg: EO_SCATTERED,
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
      body: "앞 단원에서 좋은 엣지와 나쁜 엣지를 알아봤어요. EO라인은 엣지 방향을 모두 좋게 맞추면서 아래-앞(DF)과 아래-뒤(DB) 엣지 블럭도 제자리에 놓는 단계예요. 흰 면을 아래로(z2) 쥐었을 때 아래-앞에 흰-초록, 아래-뒤에 흰-파랑 엣지 블럭이 한 줄로 놓여요. 앞 단원 차례로 방향을 모두 고친 뒤 줄을 놓아요. 아래-앞에 갈 흰-초록 엣지 블럭을 찾아 눌러 보세요.",
      setup: upTo(S21),
      mask: "eo-edges",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "quiz",
      body: "줄 놓기는 엣지 방향을 바꾸지 않는 수(U·D·R·L과 F2·B2)만 써요. 흰-초록 엣지 블럭부터 아래-앞에: 위 층에 있으면 U로 위-앞에 두고(위-오른쪽 U, 위-뒤 U2, 위-왼쪽 U') F2. 가운데 층이면 R·L로 위 층에 올린 뒤(앞-오른쪽 R, 뒤-오른쪽 R', 앞-왼쪽 L', 뒤-왼쪽 L) 위 층과 같이. 아래 층이면 D로 아래-앞에(아래-왼쪽 D, 아래-뒤 D2, 아래-오른쪽 D'). 그다음 흰-파랑 엣지 블럭을 아래-뒤에: 위 층이면 U로 위-뒤에 두고 B2, 가운데 층이면 같은 R·L로 올리고, 아래-오른쪽·아래-왼쪽이면 R2·L2로 위 층에 올려요. 이때 D는 흰-초록 엣지 블럭을 옮기니 쓰지 않아요.",
      setup: upTo(S21),
      mask: "eo-edges",
      quiz: {
        question:
          "흰-초록은 아래-앞에 놓았어요. 흰-파랑 엣지 블럭이 아래-오른쪽에 있으면?",
        choices: ["R2로 위 층에 올려 U'로 위-뒤에 두고 B2", "D로 아래-뒤에"],
        answer: 0,
        why: "D를 돌리면 아래-앞의 흰-초록 엣지 블럭도 옮겨 가요. R2·U'·B2는 아래-앞을 건드리지 않고 엣지 방향도 그대로예요.",
      },
    },
    {
      kind: "demo",
      body: "큐브를 흰 면 아래로 쥐고(z2), 나쁜 엣지를 앞 단원 차례로 고친 뒤 줄 엣지 둘을 놓아요.",
      setup: upTo(S21),
      alg: EOLINE_RULE_21,
      mask: "eo-edges",
    },
    {
      kind: "try",
      body: "다른 섞기에서 EO라인을 만들어 보세요. 흰 면을 아래로 쥐고(z2) 시작해요.",
      setup: upTo(S7),
      alg: EOLINE_RULE_7,
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
      body: "블록은 차례대로 쌓아요. ① 블록 바닥(아래-왼쪽 또는 아래-오른쪽) 엣지 블럭 → ② 코너 블럭과 가운데 층 엣지 블럭의 짝 하나 → ③ 남은 짝. 바닥과 짝 하나가 맞으면 1×2×2 블록(사각형)이 돼요. 바닥 엣지 블럭(왼쪽 블록은 흰-빨강을 아래-왼쪽에, 오른쪽 블록은 흰-주황을 아래-오른쪽에)은 엣지 방향이 맞아 있어 위 층에 오면 흰색이 늘 위를 봐요. 위 층이면 U로 그 자리 바로 위(위-왼쪽·위-오른쪽)에 두고 L2·R2, 가운데 층이면 먼저 위 층으로 올려요(앞-왼쪽 L', 뒤-왼쪽 L, 앞-오른쪽 R, 뒤-오른쪽 R'). 왼쪽 블록의 바닥 엣지 블럭이 아래-오른쪽에 있으면 R2로 올려요. 오른쪽 블록은 왼쪽 블록을 지키려고 R·U만 써요. 짝을 붙이고 넣는 법은 CFOP의 F2L 짝과 같지만, F·B를 돌리면 엣지 방향이 깨지니 「앞에서 넣기」(U' F' U F) 대신 U를 돌려 엣지 블럭을 위-오른쪽에 두고 「오른쪽에서 넣기」(U R U' R')만 써요. 왼쪽 블록은 엣지 블럭을 위-왼쪽에 두고 그 거울 U' L' U L이에요. 뒤 칸(뒤-오른쪽·뒤-왼쪽)은 앞뒤를 바꾼 꼴이에요. 엣지 블럭을 위-오른쪽(왼쪽 블록은 위-왼쪽)에, 코너 블럭을 넣을 칸 바로 위에 붙여 두고 오른쪽 뒤 칸은 U' R' U R, 왼쪽 뒤 칸은 U L U' L'. 큐브를 돌려 쥐지 않고(y 없이) 블록 쪽 면을 그대로 돌려요.",
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
      body: "대표 경우: 화면은 오른쪽 블록의 앞 칸(앞-오른쪽) 짝만 빠진 큐브예요. 넣을 짝이 위 층에 붙어 있고, 엣지 블럭은 위-오른쪽, 코너 블럭은 앞-오른쪽 위(흰색이 앞을 봄)에 있어요. U R U' R'로 넣어 보세요.",
      setup: flip(ZZ_PAIR_RIGHT),
      alg: ZZ_PAIR_RIGHT,
      goal: "f2l",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "뒤 칸: 오른쪽 블록의 뒤 칸(뒤-오른쪽)에 넣을 짝이 위 층에 붙어 있어요. 엣지 블럭은 위-오른쪽, 코너 블럭은 뒤-오른쪽 위(흰색이 뒤를 봄)예요. 큐브를 돌리지 않고 U' R' U R로 넣어 보세요.",
      setup: flip(ZZ_PAIR_BACK),
      alg: ZZ_PAIR_BACK,
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
      body: "ZZ보다 먼저 나온, 블록을 키워 가는 방법 페트루스를 짧게 봐요. 페트루스는 라르스 페트루스(Lars Petrus)가 만든 방법이에요. ZZ에서처럼 「블록」은 여러 조각이 붙은 덩어리예요. 작은 블록을 키워 가며 맞추고, 블록을 만든 다음 엣지 방향을 고쳐요. 이 생각이 ZZ로 이어졌어요. 흰 면을 위, 초록 면을 앞으로 든 그대로 해요. 첫 블록은 뒤-왼쪽 아래 구석의 2×2×2 블록이에요. 그 구석의 코너 블럭(노랑-주황-파랑)을 찾아 눌러 보세요.",
      setup: { alg: setupFor(PETRUS_222) },
      mask: "all",
      find: { piece: "corner", colors: ["D", "L", "B"] },
    },
    {
      kind: "try",
      body: "뒤-왼쪽 아래 구석에 2×2×2 블록을 만들어 보세요. 코너 블럭 하나, 엣지 블럭 셋, 센터 블럭 셋이에요. 이 큐브는 세 수만 섞여 있어요.",
      setup: { alg: setupFor(PETRUS_222) },
      alg: PETRUS_222,
      goal: "petrus-222",
    },
    {
      kind: "quiz",
      body: "섞인 큐브에서 2×2×2 블록을 만드는 차례예요. 흰 면 위·초록 앞으로 쥔 그대로 해요. 엣지 블럭 하나를 놓는 법은 늘 같은 세 경우예요. 가운데 층이나 아래 층(제자리에 바르게 있지 않은 곳)에 있으면 먼저 위 층으로 올려요(앞-오른쪽 R, 뒤-오른쪽 R', 앞-왼쪽 F, 뒤-왼쪽 B', 아래-앞 F2, 아래-오른쪽 R2, 아래-뒤 B2, 아래-왼쪽 L2). 위 층에서 노란색이 위를 보면 윗면을 돌려(U·U'·U2 가운데 그 자리로 가는 하나) 제자리 바로 위에 두고 반 바퀴, 옆을 보면 윗면을 돌려 정한 자리에 두고(그러면 노란색이 그 자리의 옆면을 봐요) 두 수를 쳐요. ① 노랑-주황 엣지 블럭 → 아래-왼쪽: 노란색이 위면 U로 위-왼쪽에 두고 L2, 옆이면 U로 위-앞에 두고 F' L. 아래 층에서 노란색이 아래를 보면 올리지 않고 아랫면을 돌려(D·D'·D2 가운데 하나) 바로 아래-왼쪽에 옮겨요. 제자리에서 뒤집혀 있으면 L2로 올려요. ② 노랑-파랑 엣지 블럭 → 아래-뒤: 노란색이 위면 U로 위-뒤에 두고 B2, 옆이면 U로 위-오른쪽에 두고 R B'. ①을 옮기는 L·D는 쓰지 않아요(아래-왼쪽에서 올리기도 없어요). ③ 코너 블럭(노랑-주황-파랑)과 주황-파랑 엣지 블럭을 CFOP F2L 짝처럼 위 층에서 붙여, 뒤-왼쪽 칸에 넣어요. 코너 블럭이 뒤-왼쪽 위, 엣지 블럭이 위-왼쪽에 붙어 있으면 U L U' L'이에요.",
      quiz: {
        question:
          "①에서 노랑-주황 엣지 블럭이 위-뒤에 있고 노란색이 위를 봐요. 어떻게 할까요?",
        choices: ["U'로 위-왼쪽에 두고 L2", "B2로 아래-뒤에"],
        answer: 0,
        why: "노란색이 위를 보니 U로 제자리(아래-왼쪽) 바로 위인 위-왼쪽에 두고 반 바퀴(L2)예요. B2는 아래-뒤로 보내요.",
      },
    },
    {
      kind: "try",
      body: "③의 대표 경우예요. 엣지 블럭 둘은 놓였고, 코너 블럭(노랑-주황-파랑)이 뒤-왼쪽 위, 주황-파랑 엣지 블럭이 위-왼쪽에 붙어 있어요. U L U' L'로 넣어 2×2×2를 끝내 보세요.",
      setup: { alg: setupFor(PETRUS_BACK_PAIR) },
      alg: PETRUS_BACK_PAIR,
      goal: "petrus-222",
    },
    {
      kind: "quiz",
      body: "2×2×2를 앞으로 넓혀 2×2×3을 만들어요. 블록을 옮기는 L·B·D는 쓰지 않아요. ① 노랑-초록 엣지 블럭 → 아래-앞: 2×2×2와 같은 세 경우예요. 올리기는 앞-오른쪽 R, 뒤-오른쪽 R', 앞-왼쪽 F, 아래-오른쪽 R2, 아래-앞(제자리에서 뒤집힘) F2. 위 층에서 노란색이 위면 U로 위-앞에 두고 F2, 옆이면 U로 위-오른쪽에 두고 R' F. ② 코너 블럭(노랑-주황-초록)과 주황-초록 엣지 블럭을 위 층에서 짝으로 붙여 앞-왼쪽 칸에: 코너 블럭이 앞-왼쪽 위, 엣지 블럭이 위-왼쪽이면 U' L' U L. L을 쓰지만 L'·L이 짝을 지어 뒤쪽 블록은 돌아와요.",
      quiz: {
        question:
          "노랑-초록 엣지 블럭이 앞-오른쪽에 있어요. 먼저 무엇을 할까요?",
        choices: ["R로 위 층에 올려요", "D로 옮겨요"],
        answer: 0,
        why: "가운데 층이면 먼저 위 층으로 올려요(앞-오른쪽은 R). 그다음 노란색이 위면 U로 위-앞에 두고 F2, 옆이면 U로 위-오른쪽에 두고 R' F. D는 뒤쪽 블록을 옮겨요.",
      },
    },
    {
      kind: "try",
      body: "②의 대표 경우예요. 노랑-초록 엣지 블럭은 놓였고, 코너 블럭(노랑-주황-초록)이 앞-왼쪽 위, 주황-초록 엣지 블럭이 위-왼쪽에 붙어 있어요. U' L' U L로 2×2×3을 끝내 보세요.",
      setup: { alg: setupFor(PETRUS_FRONT_PAIR) },
      alg: PETRUS_FRONT_PAIR,
      goal: "petrus-223",
    },
    {
      kind: "try",
      body: "블록을 다 만든 뒤에는 나쁜 엣지를 고쳐요. 그러면 남은 F2L은 R과 U만으로 끝나요. 고치는 법은 ZZ 엣지 방향 단원과 같고, 이 소개에서는 대표 경우 하나만 해요. 화면은 아래 두 층이 맞고 위 층에 나쁜 엣지 넷이 생긴 큐브예요. U F R U' R' F'로 고쳐 보세요. 맨 앞 F와 맨 끝 F'가 짝을 지어 아래 두 층은 그대로예요.",
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
