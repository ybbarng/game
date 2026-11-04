// 3×3 루(Roux, docs/47 8-2): 첫 블록 → 둘째 블록 → CMLL → LSE(EO → UL·UR → 가운데 줄).
// 시연·해 보기의 수는 `@game/cube-ai`의 solveRoux가 대회 섞기(3×3 씨앗 21·7)를 실제로 푼 단계별 수다.
// 맞는지는 judge.test.ts가 엔진으로 확인한다(상황에서는 아직 목표가 아니고, 모범 답을 두면 목표가 된다).
import type { Course, Lesson } from "./types";

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
      kind: "text",
      body: "루는 질 루(Gilles Roux)가 만든 방법이에요. 왼쪽과 오른쪽에 1×2×3 블록을 하나씩 만들고, 위 꼭짓점 넷을 맞춘 뒤, 남은 모서리 여섯을 가운데 층과 윗면만 돌려 끝내요. 수가 적고 외울 공식도 적어요.",
    },
    {
      kind: "demo",
      body: "섞인 큐브를 루로 끝까지 맞춰 볼게요. 왼쪽 블록 → 오른쪽 블록 → 위 꼭짓점 → 모서리 여섯 차례예요.",
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
      kind: "text",
      body: "흰 면을 아래로 들고 왼쪽에 블록을 만들어요. 왼쪽 가운데, 아래 왼쪽 모서리, 왼쪽 앞·뒤 모서리, 아래 왼쪽 꼭짓점 둘이에요. 정해진 공식은 없어요. 조각을 보며 짧게 모아요.",
    },
    {
      kind: "demo",
      body: "아래 왼쪽 모서리와 앞쪽 짝으로 사각형을 먼저 만들고, 뒤쪽 짝을 붙여요. 처음에 큐브를 돌려 블록이 가장 쉬운 쪽을 왼쪽에 둬요.",
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
      body: "무작위로 섞인 큐브에서도 해 보세요. 어느 색 블록이든 왼쪽에 있으면 돼요.",
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
      kind: "text",
      body: "오른쪽에도 1×2×3 블록을 만들어요. 이제 첫 블록을 지켜야 하니 오른쪽 면(R), 오른쪽 두 층(r, 화면 표기 Rw), 가운데 층(M), 윗면(U)만 돌려요. 가운데 층은 마음대로 돌려도 괜찮아요.",
    },
    {
      kind: "demo",
      body: "아래 오른쪽 모서리를 M과 U로 데려와 사각형을 만들고, 남은 짝을 R·U로 넣어요.",
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
  title: "위 꼭짓점(CMLL)",
  summary: "두 블록을 지키며 위 꼭짓점 넷을 맞춰요. 처음엔 두 번에 나눠요.",
  steps: [
    {
      kind: "text",
      body: "CMLL(Corners of the Last Layer, 마지막 층 꼭짓점)은 위 꼭짓점 넷의 방향과 자리를 맞추는 단계예요. 모서리는 신경 쓰지 않아요. 공식 42개로 한 번에 하지만, 처음엔 노란 면 맞추기(수네 등 7개) → 꼭짓점 자리(2개)로 나눠도 돼요.",
    },
    {
      kind: "demo",
      body: "꼭짓점이 수네 모양이에요. 수네를 거꾸로 돌리면 한 번에 맞아요.",
      setup: upTo(S21, FB21, SB21),
      alg: CMLL21,
    },
    {
      kind: "try",
      body: "노란 면을 먼저 맞추고(전조등 모양), 꼭짓점 자리를 맞춰 보세요.",
      setup: upTo(S7, FB7, SB7),
      alg: CMLL7,
      goal: "cmll",
    },
    {
      kind: "try",
      body: "두 블록이 맞은 큐브에서 위 꼭짓점을 맞춰 보세요.",
      setup: { rule: "roux-blocks-solved" },
      goal: "cmll",
      mask: "cmll",
    },
  ],
};

const lse: Lesson = {
  id: "roux-lse",
  size: 3,
  title: "남은 모서리 여섯(LSE)",
  summary:
    "M과 U만으로 세 걸음: 모서리 방향 → 왼쪽·오른쪽 위 모서리 → 가운데 줄.",
  steps: [
    {
      kind: "text",
      body: "LSE(Last Six Edges, 남은 모서리 여섯)는 M과 U만 돌려요. 먼저 모서리 방향(EO)을 맞춰요. 흰·노랑 칸이 위나 아래를 보면 좋은 모서리, 옆을 보면 나쁜 모서리예요. 위·아래 가운데도 흰·노랑으로 둬요.",
    },
    {
      kind: "demo",
      body: "나쁜 모서리를 M' U M 같은 짧은 수로 고쳐요.",
      setup: upTo(S21, FB21, SB21, CMLL21),
      alg: EO21,
    },
    {
      kind: "try",
      body: "나쁜 모서리를 고쳐 보세요.",
      setup: upTo(S7, FB7, SB7, CMLL7),
      alg: EO7,
      goal: "lse-eo",
    },
    {
      kind: "try",
      body: "다른 상황에서도 모서리 방향을 맞춰 보세요.",
      setup: { rule: "roux-cmll-solved" },
      goal: "lse-eo",
    },
    {
      kind: "demo",
      body: "다음은 왼쪽 위(UL)와 오른쪽 위(UR) 모서리예요. 둘을 아래(앞·뒤)에 모았다가 M2로 함께 올려요.",
      setup: upTo(S21, FB21, SB21, CMLL21, EO21),
      alg: ULUR21,
    },
    {
      kind: "try",
      body: "왼쪽·오른쪽 위 모서리를 제자리에 넣어 보세요.",
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
      body: "마지막으로 가운데 줄 모서리 넷(4c)을 M과 U2로 맞춰요.",
      setup: upTo(S21, FB21, SB21, CMLL21, EO21, ULUR21),
      alg: EP21,
    },
    {
      kind: "try",
      body: "가운데 줄 모서리를 맞춰 끝내 보세요.",
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
  summary: "왼쪽 블록 → 오른쪽 블록 → 위 꼭짓점(CMLL) → 남은 모서리 여섯(LSE).",
  lessons: [intro, firstBlock, secondBlock, cmll, lse],
};
