// 4×4 야우(Yau, docs/47 8-2): 흰·노랑 센터 → 흰 십자 엣지 셋 → 나머지 센터 넷 → 마지막 십자 엣지와
// 남은 엣지 묶기(3-2-3) → 3×3처럼(F2L부터) + 패리티.
// 표기: Rw = 바깥 두 층, 2R·2U = 바깥에서 둘째 층 하나만, Uw = 위 두 층.
// 공식이 그 일을 하는지(흰 십자·센터를 지키는지 등)는 judge.test.ts·judge-methods.test.ts가 엔진으로 확인한다.
import { PARITY_4X4 } from "./algs-big";
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const OLL_PARITY = PARITY_4X4.find((c) => c.id === "parity-4x4-oll")
  ?.algs[0] as string;

/** 흰 면을 아래로 쥔(z2) 맞춘 4×4에서 이 풀이로 풀리는 상황 */
const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

/** 흰 십자를 아래에 두고 엣지 짝 둘을 바꾸는 흐름(위 두 층만 돌렸다 되돌린다) */
export const YAU_PAIR = "Uw' R U R' F R' F' R Uw";
/** 흰·노랑 센터와 흰 십자를 지키고 옆 센터만 옮기는 흐름 */
export const YAU_SIDE_CENTERS = "2U R2 2U' R2";
/** 위에 짝지어 둔 흰 엣지 셋을 아래 십자 자리에 넣는 수 */
const CROSS3 = "R2 B2 L2";

const udCenters: Lesson = {
  id: "yau-ud-centers",
  size: 4,
  title: "흰·노랑 센터",
  summary: "축소법처럼 시작해요. 흰 센터와 그 맞은편 노란 센터.",
  steps: [
    {
      kind: "look",
      body: "야우는 로버트 야우(Robert Yau)가 만든 4×4 방법이에요. 센터를 다 맞추기 전에 흰 십자 엣지 셋을 먼저 넣어 두는 것이 다른 점이에요. 그러면 남은 엣지를 묶을 때 큐브를 덜 돌려 쥐어요. 첫 걸음은 흰 센터와 맞은편 노란 센터예요. 큐브를 둘러보며 노란 센터를 찾아 앞으로 가져와 보세요.",
      look: { color: "D", on: "F" },
    },
    {
      kind: "demo",
      body: "두 칸 막대를 두 층(Rw)으로 올려 흰 면에 붙여요.",
      setup: { alg: setupFor("Rw U2 Rw'") },
      alg: "Rw U2 Rw'",
    },
    {
      kind: "try",
      body: "흰 센터 막대를 제자리로 올려 보세요.",
      setup: { alg: setupFor("Rw U2 Rw'") },
      alg: "Rw U2 Rw'",
      goal: "yau-ud-centers",
    },
    {
      kind: "try",
      body: "섞인 4×4에서 흰 센터와 맞은편 노란 센터를 맞춰 보세요.",
      setup: { rule: "4x4-random" },
      goal: "yau-ud-centers",
    },
  ],
};

const cross3: Lesson = {
  id: "yau-cross3",
  size: 4,
  title: "흰 십자 엣지 셋",
  summary: "흰 면을 아래로. 날개 둘을 짝지어 십자 자리에 셋만 넣어요.",
  steps: [
    {
      kind: "find",
      body: "흰 센터를 아래로 들어요. 흰 엣지 날개 둘을 찾아 짝지은 뒤 십자 자리에 넣어요. 셋만 넣고 왼쪽 자리는 비워 둬요. 옆 센터가 아직이라 옆 색은 십자끼리만 맞으면 돼요. 흰-초록 날개 둘을 찾아 눌러 보세요.",
      setup: flip(CROSS3),
      find: { piece: "edge", colors: ["U", "F"] },
      count: 2,
    },
    {
      kind: "demo",
      body: "위에서 짝지은 흰 엣지 둘을 F2·R2로 아래에 넣어요.",
      setup: flip("F2 R2"),
      alg: "F2 R2",
    },
    {
      kind: "try",
      body: "흰 엣지 셋을 아래 십자 자리에 넣어 보세요.",
      setup: flip(CROSS3),
      alg: CROSS3,
      goal: "yau-cross3",
    },
    {
      kind: "try",
      body: "흰·노랑 센터만 맞은 4×4에서 십자 엣지 셋을 만들어 보세요.",
      setup: { rule: "4x4-yau-ud-centers" },
      goal: "yau-cross3",
    },
  ],
};

const sideCenters: Lesson = {
  id: "yau-side-centers",
  size: 4,
  title: "나머지 센터 넷",
  summary: "흰 십자를 지키며 옆 센터 넷. 안쪽 층을 돌렸으면 꼭 되돌려요.",
  steps: [
    {
      kind: "quiz",
      body: "남은 옆 센터 넷을 맞춰요. 흰 면을 아래, 초록을 앞에 두고 해요. 둘째 층(2U)으로 막대를 옆면으로 옮기고, 바깥 면을 돌린 뒤 되돌리면 흰 십자는 그대로예요.",
      setup: { alg: "z2" },
      quiz: {
        question: "흰 면이 아래, 초록이 앞이면 오른쪽 센터는 무슨 색일까요?",
        choices: ["빨강", "주황", "파랑"],
        answer: 1,
        why: "흰 면을 아래로 뒤집으면 빨강과 주황이 자리를 바꿔요. 오른쪽 주황, 뒤 파랑, 왼쪽 빨강이에요.",
      },
    },
    {
      kind: "demo",
      body: "2U로 센터 막대를 옮기고 R2로 바꿔 넣은 뒤 되돌려요.",
      setup: flip(YAU_SIDE_CENTERS),
      alg: YAU_SIDE_CENTERS,
    },
    {
      kind: "try",
      body: "흰 십자를 지키며 옆 센터를 맞춰 보세요.",
      setup: flip(YAU_SIDE_CENTERS),
      alg: YAU_SIDE_CENTERS,
      goal: "yau-centers",
    },
    {
      kind: "try",
      body: "흰 십자 셋까지 맞은 4×4에서 옆 센터 넷을 맞춰 보세요.",
      setup: { rule: "4x4-yau-cross3" },
      goal: "yau-centers",
    },
  ],
};

const edges: Lesson = {
  id: "yau-edges",
  size: 4,
  title: "엣지 묶기(3-2-3)",
  summary: "마지막 십자 엣지를 넣고, 남은 여덟을 Uw로 묶어요.",
  steps: [
    {
      kind: "turn",
      body: "비워 둔 자리에 마지막 흰 엣지를 넣어 십자를 끝내요. 남은 여덟 엣지는 셋 → 둘 → 셋씩 묶어서 「3-2-3」이라고 해요. 짝지을 날개를 앞-왼쪽과 앞-오른쪽에 두고, 위 두 층을 돌려 한 줄로 만든 뒤 바꿔 넣고 되돌려요. 먼저 Uw'를 쳐서 위 두 층을 돌려 보세요.",
      setup: flip(YAU_PAIR),
      alg: "Uw'",
    },
    {
      kind: "demo",
      body: "Uw'로 줄을 맞추고, R U R' F R' F' R로 묶인 엣지를 바꿔 넣고, Uw로 되돌려요. 흰 십자는 그대로예요.",
      setup: flip(YAU_PAIR),
      alg: YAU_PAIR,
    },
    {
      kind: "try",
      body: "흰 십자를 지키며 엣지 둘을 묶어 보세요.",
      setup: flip(YAU_PAIR),
      alg: YAU_PAIR,
      goal: "edges-paired",
    },
    {
      kind: "try",
      body: "센터와 흰 십자 셋이 맞은 4×4에서 마지막 십자 엣지를 넣어 보세요.",
      setup: { rule: "4x4-yau-centers" },
      goal: "yau-cross",
    },
    {
      kind: "try",
      body: "흰 십자까지 맞은 4×4에서 남은 엣지를 모두 묶어 보세요.",
      setup: { rule: "4x4-yau-cross" },
      goal: "edges-paired",
    },
  ],
};

const finish: Lesson = {
  id: "yau-finish",
  size: 4,
  title: "3×3처럼 끝내기",
  summary: "흰 십자는 이미 있으니 F2L부터. 패리티는 축소법과 같아요.",
  steps: [
    {
      kind: "quiz",
      body: "이제 바깥 층만 돌려 3×3처럼 풀어요. 흰 십자가 이미 있으니 F2L부터 시작해요. 3×3에 없는 모양(패리티)이 나오면 축소법과 같은 공식을 써요. 이 큐브는 윗면을 맞추는 중이에요.",
      setup: flip(OLL_PARITY),
      quiz: {
        question: "위를 보는 노란 엣지는 몇 개일까요?",
        choices: ["2개", "3개", "4개"],
        answer: 1,
        why: "셋이에요. 3×3에서는 늘 짝수 개라, 홀수면 OLL 패리티예요.",
      },
    },
    {
      kind: "demo",
      body: "OLL 패리티: 위-앞 엣지 하나를 뒤집어요.",
      setup: { alg: setupFor(OLL_PARITY) },
      alg: OLL_PARITY,
    },
    {
      kind: "try",
      body: "센터와 엣지가 묶인 4×4를 끝까지 맞춰 보세요.",
      setup: { rule: "4x4-reduced" },
      goal: "solved",
    },
  ],
};

export const YAU_444: Course = {
  id: "444-yau",
  size: 4,
  title: "4×4 야우(Yau)",
  summary: "흰·노랑 센터 → 흰 십자 셋 → 옆 센터 → 엣지 묶기 → 3×3처럼.",
  lessons: [udCenters, cross3, sideCenters, edges, finish],
};
