// 3×3 초보자 층별 맞추기(docs/47 8-2). 처음부터 끝까지 순서대로 따라 하면 다 맞춘다.
// 처음엔 기본 방향(위 흰, 앞 초록)으로 들고 흰 십자를 만든 뒤, 큐브를 뒤집어(z2) 흰 면을 아래로 둔다.
// 「직접 해보기」의 상황은 모범 답의 거꾸로로 만든다(setupFor). 시험이 상황 → 모범 답 → 목표를 확인한다.
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const SEXY = "R U R' U'";
const RIGHT = "U R U' R' U' F' U F";
const LEFT = "U' L' U L U F U' F'";
const EO = "F R U R' U' F'";
const EO_L = "F U R U' R' F'";
const SUNE = "R U R' U R U2 R'";
const A_PERM = "R' F R' B2 R F' R' B2 R2";
const U_PERM = "R U' R U R U R U' R' U' R2";
const U_PERM_B = "R2 U R U R' U' R' U' R' U R'";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

const notation: Lesson = {
  id: "333-notation",
  size: 3,
  title: "표기 읽기",
  summary: "공식을 읽는 법. 면 이름 여섯 개와 돌리는 방향만 알면 된다.",
  steps: [
    {
      kind: "text",
      body: "큐브의 여섯 면에 이름이 있다. U 위, D 아래, R 오른쪽, L 왼쪽, F 앞, B 뒤. 처음에는 위가 흰색, 앞이 초록, 오른쪽이 빨강이 되게 든다(아래 노랑, 뒤 파랑, 왼쪽 주황).",
    },
    {
      kind: "text",
      body: "글자만 있으면 그 면을 마주 보고 시계 방향으로 한 번(90도) 돌린다. 작은따옴표(R')가 붙으면 반대 방향, 2가 붙으면(R2) 반 바퀴다.",
    },
    {
      kind: "demo",
      body: "R: 오른쪽 면을 오른쪽에서 봤을 때 시계 방향. 앞면 칸이 위로 올라간다.",
      alg: "R",
    },
    {
      kind: "demo",
      body: "R': 반대 방향. 위 칸이 앞으로 내려온다.",
      alg: "R'",
    },
    {
      kind: "demo",
      body: "U와 U': 윗면을 위에서 봤을 때 시계, 반시계. U는 앞면 칸이 왼쪽으로 간다.",
      alg: "U U'",
    },
    {
      kind: "demo",
      body: "F와 F2: 앞면을 마주 보고 시계 방향, 그리고 반 바퀴.",
      alg: "F F2",
    },
    {
      kind: "text",
      body: "x·y·z는 큐브 전체를 돌린다(x는 R 방향, y는 U 방향, z는 F 방향). Rw(또는 r)는 오른쪽 두 층을 함께, M은 가운데 세로줄을 L 방향으로 돌린다.",
    },
    {
      kind: "demo",
      body: "z2: 큐브 전체를 앞면 축으로 반 바퀴. 흰 면이 아래로 간다.",
      alg: "z2",
    },
    {
      kind: "try",
      body: "오른쪽 면이 한 번 돌아가 있다. 되돌려 보자.",
      setup: { alg: "R" },
      alg: "R'",
      goal: "solved",
    },
    {
      kind: "try",
      body: "윗면이 반 바퀴 돌아가 있다.",
      setup: { alg: "U2" },
      alg: "U2",
      goal: "solved",
    },
    {
      kind: "try",
      body: "R 다음 U를 돌렸다. 되돌릴 때는 거꾸로, 나중 것부터: U' 다음 R'.",
      setup: { alg: "R U" },
      alg: "U' R'",
      goal: "solved",
    },
    {
      kind: "try",
      body: "F R' U2를 돌린 큐브. 순서를 뒤집고 방향도 뒤집는다.",
      setup: { alg: "F R' U2" },
      alg: "U2 R F'",
      goal: "solved",
    },
    {
      kind: "text",
      body: "흔한 실수: 뒤에서 볼 면(B, L, D)의 시계 방향을 앞에서 본 방향으로 돌리는 것. 그 면을 마주 본다고 생각하고 돌린다.",
    },
  ],
};

const whiteCross: Lesson = {
  id: "333-white-cross",
  size: 3,
  title: "흰 십자",
  summary: "흰 가운데 둘레에 흰 모서리 넷을 붙인다. 옆면 색까지 맞춰야 한다.",
  steps: [
    {
      kind: "text",
      body: "면 가운데 칸은 움직이지 않는다. 그래서 가운데 색이 그 면의 색이다. 흰 면을 위로 들고, 흰색과 다른 색이 한 칸씩 붙은 모서리 조각 넷을 흰 가운데 둘레로 모은다.",
    },
    {
      kind: "text",
      body: "흰색만 위를 보면 안 된다. 모서리의 다른 색이 옆면 가운데 색과 같아야 한다. 초록-흰 모서리는 앞(초록) 위로, 빨강-흰 모서리는 오른쪽(빨강) 위로.",
    },
    {
      kind: "demo",
      body: "흰 모서리가 아래층에 있고 옆색(초록)이 이미 앞 가운데와 같다. 앞면을 반 바퀴 돌리면 위로 올라간다.",
      setup: { alg: "F2" },
      alg: "F2",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "흰 모서리가 아래층 오른쪽에 있다. 옆색이 앞 가운데와 같아질 때까지 아랫면을 돌린 뒤(D') 앞면을 반 바퀴.",
      setup: { alg: "F2 D" },
      alg: "D' F2",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "흰 모서리가 가운데 줄에 있다(앞-오른쪽, 흰색이 오른쪽을 본다). 앞면을 반시계로 한 번 돌리면 올라간다.",
      setup: { alg: "F" },
      alg: "F'",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 모서리 하나가 아래에 있다. 옆색을 맞추고 올려 보자.",
      setup: { alg: "R2 D2" },
      alg: "D2 R2",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 모서리 둘이 아래층에 있다. 하나씩 옆색을 맞춰 올린다.",
      setup: { alg: "F2 R2 D" },
      alg: "D' F2 R2",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 모서리 둘이 흐트러져 있다(하나는 가운데 줄, 하나는 아래층). 하나를 올릴 때 다른 것이 내려가지 않는지 보며 하나씩 올린다.",
      setup: { alg: "R' F" },
      alg: "F' R",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "아무렇게나 섞인 큐브에서 흰 십자를 만든다.",
      setup: { rule: "random-cross" },
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "text",
      body: "흔한 실수: 흰색만 위로 모으고(흰 꽃) 옆색을 안 보는 것. 옆면을 돌려 보면 십자 둘레 색이 가운데와 다르다. 모서리를 올리기 전에 아랫면을 돌려 옆색부터 맞춘다.",
    },
  ],
};

const firstCorners: Lesson = {
  id: "333-first-corners",
  size: 3,
  title: "첫 층 꼭짓점",
  summary:
    "큐브를 뒤집어 흰 면을 아래로 두고, 흰 꼭짓점 넷을 R U R' U' 하나로 넣는다.",
  steps: [
    {
      kind: "text",
      body: "이제 큐브를 뒤집어(z2) 흰 십자를 아래로, 노란 가운데를 위로 둔다. 앞은 그대로 초록이다. 흰색이 붙은 꼭짓점을 윗층에서 찾는다.",
    },
    {
      kind: "text",
      body: "그 꼭짓점의 다른 두 색을 보고, 넣을 자리(두 색 가운데 사이 아래) 바로 위로 윗면을 돌려 옮긴다. 그 자리를 앞-오른쪽으로 오게 들고 R U R' U'을 맞을 때까지 되풀이한다.",
    },
    {
      kind: "text",
      body: "되풀이 횟수는 흰색이 보는 쪽으로 정해진다. 흰색이 오른쪽을 보면 한 번, 위를 보면 세 번, 앞을 보면 다섯 번.",
    },
    {
      kind: "demo",
      body: "흰색이 오른쪽을 본다. R U R' U' 한 번.",
      setup: flip(SEXY),
      alg: SEXY,
      mask: "first-layer",
    },
    {
      kind: "demo",
      body: "흰색이 위를 본다. R U R' U'을 세 번.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY}`,
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰색이 앞을 본다. 다섯 번 돌려 넣어 보자.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY} ${SEXY} ${SEXY}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "꼭짓점이 넣을 자리 위에 있지 않다. 먼저 윗면을 돌려(U') 자리 위로 옮긴다.",
      setup: flip(`U' ${SEXY}`),
      alg: `U' ${SEXY}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "꼭짓점이 제자리에 들어가 있지만 돌아가 있다(흰색이 옆을 본다). 같은 공식을 더 돌리면 맞는다.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY} ${SEXY}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰 십자만 맞은 큐브에서 첫 층을 끝낸다.",
      setup: { rule: "cross-solved" },
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "text",
      body: "흔한 실수: 공식을 하다 말고 큐브를 다른 쪽으로 다시 드는 것. 한 꼭짓점이 맞을 때까지는 쥔 방향을 바꾸지 않는다. 다른 꼭짓점이 잠깐 흐트러져도 공식을 끝까지 하면 돌아온다.",
    },
  ],
};

const secondLayer: Lesson = {
  id: "333-second-layer",
  size: 3,
  title: "둘째 층 모서리",
  summary:
    "윗층의 노란색 없는 모서리를 가운데 줄로 내린다. 오른쪽·왼쪽 넣기 공식 두 개.",
  steps: [
    {
      kind: "text",
      body: "윗층에서 노란색이 없는 모서리를 찾는다. 그 모서리의 앞쪽 색이 앞 가운데와 같아지게 윗면을 돌린다(뒤집힌 T 모양).",
    },
    {
      kind: "text",
      body: "모서리의 위쪽 색이 오른쪽 면 색이면 오른쪽으로, 왼쪽 면 색이면 왼쪽으로 넣는다.",
    },
    {
      kind: "demo",
      body: "오른쪽으로 넣기: U R U' R' U' F' U F",
      setup: flip(RIGHT),
      alg: RIGHT,
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "왼쪽으로 넣기: U' L' U L U F U' F'",
      setup: flip(LEFT),
      alg: LEFT,
      mask: "f2l",
    },
    {
      kind: "try",
      body: "오른쪽으로 넣어 보자.",
      setup: flip(RIGHT),
      alg: RIGHT,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "왼쪽으로 넣어 보자.",
      setup: flip(LEFT),
      alg: LEFT,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "모서리가 앞-오른쪽 칸에 들어가 있지만 뒤집혀 있다. 오른쪽 넣기 공식으로 일단 빼내고(아무 모서리나 넣으면 빠진다), 다시 찾아 넣는다.",
      setup: flip(`${RIGHT} U2 ${RIGHT}`),
      alg: `${RIGHT} U2 ${RIGHT}`,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "첫 층만 맞은 큐브에서 둘째 층을 끝낸다.",
      setup: { rule: "first-layer-solved" },
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "text",
      body: "흔한 실수: 노란색이 붙은 모서리를 넣으려는 것. 노란 모서리는 윗층 것이다. 넣을 모서리가 위에 하나도 없으면 칸에 잘못 들어간 모서리를 빼낸다.",
    },
  ],
};

const yellowCross: Lesson = {
  id: "333-yellow-cross",
  size: 3,
  title: "노란 십자",
  summary:
    "윗면 모서리를 노랗게. 모양(점·ㄱ자·가로줄)을 보고 F R U R' U' F'을 쓴다.",
  steps: [
    {
      kind: "text",
      body: "윗면에서 노란 모서리만 본다(꼭짓점은 아직 안 본다). 가운데만 노란 「점」, 둘이 꺾인 「ㄱ자」, 둘이 마주 본 「가로줄」, 다 된 「십자」 넷 중 하나다.",
    },
    {
      kind: "demo",
      body: "가로줄: 줄이 가로(왼쪽-오른쪽)가 되게 들고 F R U R' U' F'.",
      setup: flip(EO),
      alg: EO,
      mask: "oll",
    },
    {
      kind: "demo",
      body: "ㄱ자: 노란 모서리 둘이 왼쪽과 뒤에 오게 들고 F U R U' R' F'.",
      setup: flip(EO_L),
      alg: EO_L,
      mask: "oll",
    },
    {
      kind: "try",
      body: "가로줄을 십자로.",
      setup: flip(EO),
      alg: EO,
      goal: "yellow-cross",
      mask: "oll",
    },
    {
      kind: "try",
      body: "ㄱ자를 십자로.",
      setup: flip(EO_L),
      alg: EO_L,
      goal: "yellow-cross",
      mask: "oll",
    },
    {
      kind: "try",
      body: "점: F R U R' U' F'을 하면 ㄱ자가 된다. 윗면을 돌려 ㄱ자를 왼쪽·뒤에 두고 ㄱ자 공식.",
      setup: flip(`${EO} U2 ${EO_L}`),
      alg: `${EO} U2 ${EO_L}`,
      goal: "yellow-cross",
      mask: "oll",
    },
    {
      kind: "try",
      body: "둘째 층까지 맞은 큐브에서 노란 십자를 만든다.",
      setup: { rule: "second-layer-solved" },
      goal: "yellow-cross",
      mask: "oll",
    },
    {
      kind: "text",
      body: "흔한 실수: ㄱ자를 다른 방향으로 들고 공식을 하는 것. 그러면 다시 ㄱ자나 점이 된다. 노란 두 칸이 왼쪽과 뒤에 오는지 확인한다.",
    },
  ],
};

const yellowFace: Lesson = {
  id: "333-yellow-face",
  size: 3,
  title: "노란 면",
  summary: "꼭짓점까지 윗면을 모두 노랗게. 수네(R U R' U R U2 R') 하나로 된다.",
  steps: [
    {
      kind: "text",
      body: "위를 보는 노란 꼭짓점 수를 센다. 하나면 그 꼭짓점을 왼쪽 앞에 둔다. 하나도 없으면 왼쪽 앞 꼭짓점의 노란색이 왼쪽 면을 보게, 둘이면 왼쪽 앞 꼭짓점의 노란색이 앞면을 보게 든다.",
    },
    {
      kind: "text",
      body: "그렇게 들고 수네(R U R' U R U2 R')를 한다. 한 번에 안 끝나면 다시 세어서 되풀이한다. 노란 십자는 깨지지 않는다.",
    },
    {
      kind: "demo",
      body: "노란 꼭짓점 하나가 왼쪽 앞: 수네 한 번이면 끝.",
      setup: flip(SUNE),
      alg: SUNE,
      mask: "oll",
    },
    {
      kind: "try",
      body: "수네 한 번.",
      setup: flip(SUNE),
      alg: SUNE,
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 노란 꼭짓점이 하나지만 다른 자리에 있다. 왼쪽 앞으로 옮기고 수네, 다시 세어 수네.",
      setup: { alg: setupFor("R U2 R' U' R U' R'", "z2") },
      alg: `U2 ${SUNE} U2 ${SUNE}`,
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 노란 꼭짓점이 없다. 쥐는 법대로 돌린 뒤 수네, 다시 세어 수네.",
      setup: { alg: setupFor("R U2 R' U' R U R' U' R U' R'", "z2") },
      alg: `U ${SUNE} ${SUNE}`,
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 노란 꼭짓점이 둘(대각선)이다. 수네를 세 번 하게 된다.",
      setup: { alg: setupFor("F' r U R' U' r' F R", "z2") },
      alg: `U' ${SUNE} ${SUNE} U2 ${SUNE}`,
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "try",
      body: "노란 십자까지 맞은 큐브에서 윗면을 끝낸다.",
      setup: { rule: "yellow-cross-solved" },
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "text",
      body: "흔한 실수: 수네 중간에 윗면이 엉망이 된 것 같아 멈추는 것. 아래 두 층은 공식이 끝나면 돌아온다. 일곱 수를 끝까지 한다.",
    },
  ],
};

const yellowCorners: Lesson = {
  id: "333-yellow-corners",
  size: 3,
  title: "위 꼭짓점 자리",
  summary: "윗층 꼭짓점을 제자리로. 헤드라이트를 뒤에 두고 A퍼뮤 하나.",
  steps: [
    {
      kind: "text",
      body: "옆면에서 위층 꼭짓점 두 칸이 같은 색이면 「헤드라이트」라 한다. 헤드라이트가 있는 면을 뒤로 두고 R' F R' B2 R F' R' B2 R2를 한다.",
    },
    {
      kind: "text",
      body: "헤드라이트가 하나도 없으면 아무 쪽에서나 한 번 하면 헤드라이트가 생긴다. 네 면 모두 헤드라이트면 꼭짓점은 다 맞았다. 끝나면 윗면을 돌려 옆색을 맞춘다.",
    },
    {
      kind: "demo",
      body: "헤드라이트가 뒤에 있다.",
      setup: flip(A_PERM),
      alg: A_PERM,
      mask: "pll",
    },
    {
      kind: "try",
      body: "헤드라이트를 뒤에 두고.",
      setup: flip(A_PERM),
      alg: A_PERM,
      goal: "yellow-corners",
      mask: "pll",
    },
    {
      kind: "try",
      body: "헤드라이트가 다른 쪽에 있다. 윗면을 돌려 뒤로 옮긴다.",
      setup: flip(`U ${A_PERM}`),
      alg: `U ${A_PERM}`,
      goal: "yellow-corners",
      mask: "pll",
    },
    {
      kind: "try",
      body: "헤드라이트가 없다. 한 번 하고, 생긴 헤드라이트를 뒤로 옮겨 한 번 더.",
      setup: flip(`${A_PERM} U ${A_PERM}`),
      alg: `${A_PERM} U ${A_PERM}`,
      goal: "yellow-corners",
      mask: "pll",
    },
    {
      kind: "try",
      body: "윗면이 노란 큐브에서 꼭짓점 자리를 맞춘다.",
      setup: { rule: "yellow-face-solved" },
      goal: "yellow-corners",
      mask: "pll",
    },
    {
      kind: "text",
      body: "흔한 실수: B2를 B로 한 번만 돌리는 것. 뒷면은 반 바퀴다. 뒤를 돌리기 어려우면 x를 넣은 같은 공식(x R' U R' D2 R U' R' D2 R2 x')을 써도 된다.",
    },
  ],
};

const yellowEdges: Lesson = {
  id: "333-yellow-edges",
  size: 3,
  title: "위 모서리 자리",
  summary: "마지막 단계. 다 맞은 면을 뒤에 두고 U퍼뮤.",
  steps: [
    {
      kind: "text",
      body: "옆면 하나가 통째로 맞았으면 그 면을 뒤로 두고 R U' R U R U R U' R' U' R2를 한다. 안 맞으면 한 번 더 하면 된다(반대로 도는 공식 R2 U R U R' U' R' U' R' U R'을 외워도 좋다).",
    },
    {
      kind: "text",
      body: "통째로 맞은 면이 없으면 아무 쪽에서나 한 번 하면 생긴다. 마지막에 윗면을 돌려 맞춘다.",
    },
    {
      kind: "demo",
      body: "맞은 면이 뒤에 있다.",
      setup: flip(U_PERM),
      alg: U_PERM,
    },
    {
      kind: "try",
      body: "맞은 면을 뒤에 두고.",
      setup: flip(U_PERM),
      alg: U_PERM,
      goal: "solved",
    },
    {
      kind: "try",
      body: "반대 방향이다. 같은 공식을 두 번 해도 되고, 반대 공식을 한 번 해도 된다.",
      setup: flip(U_PERM_B),
      alg: U_PERM_B,
      goal: "solved",
    },
    {
      kind: "try",
      body: "맞은 면이 없다(맞은편끼리 바뀜). 한 번 하고, 생긴 맞은 면을 뒤로 옮겨 다시.",
      setup: flip(`${U_PERM} U ${U_PERM} U'`),
      alg: `${U_PERM} U ${U_PERM} U'`,
      goal: "solved",
    },
    {
      kind: "try",
      body: "꼭짓점까지 맞은 큐브를 끝낸다. 축하한다, 큐브를 다 맞췄다!",
      setup: { rule: "corners-placed" },
      goal: "solved",
    },
    {
      kind: "text",
      body: "흔한 실수: 공식 끝의 R2를 R로 돌리는 것. 마지막은 반 바퀴다. 다 맞추면 처음부터 다시 섞어, 단계 이름을 떠올리며 끝까지 해 본다.",
    },
  ],
};

export const BEGINNER_333: Course = {
  id: "333-beginner",
  size: 3,
  title: "3×3 처음 맞추기(층별)",
  summary: "표기부터 마지막 층까지 여덟 단원. 공식 일곱 개로 끝까지 맞춘다.",
  lessons: [
    notation,
    whiteCross,
    firstCorners,
    secondLayer,
    yellowCross,
    yellowFace,
    yellowCorners,
    yellowEdges,
  ],
};
