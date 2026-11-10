// 블라인드 올드 포흐만(docs/47 7절). 외우기 → 안 보고 맞추기. 조각을 하나씩 버퍼에서 제자리로 보낸다.
import { BLD_ALGS, BLD_CORNER_TARGETS, BLD_EDGE_TARGETS } from "./bld";
import { invertAlg, setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const algOf = (id: string): string => {
  const a = BLD_ALGS.find((c) => c.id === id)?.algs[0];
  if (a === undefined) throw new Error(`공식 없음: ${id}`);
  return a;
};
const T = algOf("bld-op-edge");
const Y = algOf("bld-op-corner");
const PARITY = algOf("bld-op-parity");

const setupOf = (
  list: { letter: string; setup: string }[],
  letter: string,
): string => {
  const t = list.find((x) => x.letter === letter);
  if (t === undefined) throw new Error(`글자 없음: ${letter}`);
  return t.setup;
};
/** 글자 하나 보내기: 준비 → 바꾸기 → 준비 되돌리기 */
const send = (swap: string, setup: string) =>
  `${setup} ${swap} ${invertAlg(setup)}`.trim();
export const edge = (letter: string) =>
  send(T, setupOf(BLD_EDGE_TARGETS, letter));
export const corner = (letter: string) =>
  send(Y, setupOf(BLD_CORNER_TARGETS, letter));
/** 글자 줄을 차례로 보내는 풀이 */
export const sendEdges = (letters: string) =>
  letters.split(" ").map(edge).join(" ");
export const sendCorners = (letters: string) =>
  letters.split(" ").map(corner).join(" ");

// 외우기 연습 상황(풀이의 거꾸로). flow-advanced.test.ts가 엔진으로 글자 줄을 따라가 맞는지 본다
export const MEMO_EDGES_2 = "C U";
export const MEMO_EDGES_4 = "C J W H";
export const MEMO_CORNERS_2 = "C H";
/** 제자리에서 뒤집힌 위-앞 엣지와 버퍼: 위-앞 조각의 두 글자 C, I를 차례로 */
export const FLIPPED_EDGE = "C I";

const intro: Lesson = {
  id: "bld-intro",
  size: 3,
  title: "블라인드란",
  summary:
    "섞인 큐브를 보고 외운 뒤, 눈을 가리고 맞춰요. 올드 포흐만은 공식 셋으로 돼요.",
  steps: [
    {
      kind: "look",
      body: "블라인드는 두 부분이에요. 먼저 외우기예요. 면은 돌리지 않고 큐브 전체만 돌려 가며 보고 외워요. 다음은 맞추기예요. 모든 칸이 까맣게 가려진 채 외운 대로 맞춰요. 블라인드는 흰 면을 위, 초록 면을 앞에 두고 들어요. 섞인 큐브를 큐브 전체 돌리기로 둘러보세요.",
      setup: { rule: "bld-random" },
    },
    {
      kind: "find",
      body: "올드 포흐만(옛 포흐만 방법)은 조각을 하나씩 옮겨요. 「버퍼」라는 정해진 자리에 있는 조각을 그 조각의 제자리로 보내면, 그 자리에 있던 조각이 버퍼로 와요. 이것을 버퍼에 자기 조각이 올 때까지 되풀이해요. 엣지 버퍼(위-오른쪽, 흰-빨강)를 눌러 보세요.",
      find: { piece: "edge", colors: ["U", "R"] },
    },
    {
      kind: "find",
      body: "엣지는 버퍼가 위-오른쪽, 바꾸기 공식은 T퍼뮤. 코너는 버퍼가 위-뒤-왼쪽, 바꾸기 공식은 변형 Y퍼뮤. 보낼 자리를 바꾸기 자리로 옮기는 「준비 수」를 하고, 바꾸기 공식을 한 뒤, 준비 수를 거꾸로 되돌려요. 코너 버퍼(위-뒤-왼쪽)를 찾아 눌러 보세요(거울에서도 돼요).",
      find: { piece: "corner", colors: ["U", "B", "L"] },
    },
  ],
};

const letters: Lesson = {
  id: "bld-letters",
  size: 3,
  title: "글자 붙이기",
  summary: "스티커마다 글자 하나. 외울 때는 글자 두 개씩 낱말로 묶어요.",
  steps: [
    {
      kind: "quiz",
      body: "엣지 스티커 24개, 코너 스티커 24개에 A부터 X까지 글자를 붙여요. 면마다 넷씩: 위 A~D, 왼쪽 E~H, 앞 I~L, 오른쪽 M~P, 뒤 Q~T, 아래 U~X. 면을 정면에서 바로 본다고 생각하고 시계 방향으로 붙이는데, 엣지는 위 칸부터, 코너는 왼쪽 위 칸부터 시작해요. 엣지와 코너가 같은 글자를 따로 써요.",
      quiz: {
        question: "앞면 위 칸 엣지 스티커의 글자는 무엇일까요?",
        choices: ["A", "E", "I", "M"],
        answer: 2,
        why: "앞면은 I~L이고 위 칸부터 시작하니 I예요.",
      },
    },
    {
      kind: "quiz",
      body: "코너는 왼쪽 위 칸이 첫 글자예요. 앞면이면 왼쪽 위 I, 오른쪽 위 J, 오른쪽 아래 K, 왼쪽 아래 L.",
      quiz: {
        question: "앞면 오른쪽 위 코너 스티커의 글자는 무엇일까요?",
        choices: ["I", "J", "K", "M"],
        answer: 1,
        why: "코너는 왼쪽 위 I부터 시계 방향이라 오른쪽 위는 J예요.",
      },
    },
    {
      kind: "quiz",
      body: "외우기: 버퍼 스티커의 색을 보고 그 색이 가야 할 자리의 글자를 적어요. 그 자리에 있는 스티커를 보고 다음 글자를, 버퍼 조각이 나올 때까지 이어 가요. 글자 둘씩 묶어 낱말이나 그림으로 떠올리면 오래 가요.",
      quiz: {
        question:
          "버퍼 자리 윗면 스티커가 흰색이고 옆 스티커가 초록이에요. 첫 글자는 무엇일까요?",
        choices: ["A", "C", "I"],
        answer: 1,
        why: "흰-초록 엣지의 흰 칸 자리는 위-앞, 윗면이라 C예요.",
      },
    },
    {
      kind: "quiz",
      body: "버퍼 조각이 나와서 글자가 끊겼는데 아직 안 맞은 조각이 남았으면 「고리 깨기」를 해요. 남은 조각의 스티커 하나를 골라 그 글자를 적고 이어 가다가, 같은 조각으로 돌아오면, 돌아온 쪽 스티커의 글자를 적고 고리를 닫아요.",
      setup: { rule: "bld-random" },
      quiz: {
        question:
          "버퍼 조각이 나와 글자가 끊겼는데 안 맞은 엣지가 남았어요. 어떻게 할까요?",
        choices: [
          "거기서 외우기를 끝내요",
          "남은 조각 하나를 골라 그 글자부터 이어 가요(고리 깨기)",
        ],
        answer: 1,
        why: "고리를 깨서 이어 가면 남은 조각도 모두 보낼 수 있어요.",
      },
    },
    {
      kind: "quiz",
      body: "제자리에 있지만 뒤집힌 엣지도 고리 깨기와 같아요. 그 조각의 스티커 글자 둘을 차례로 적어요. 엣지 하나만 뒤집힐 수는 없어서 늘 둘 이상 함께 뒤집혀요. 이 큐브는 버퍼(위-오른쪽)와 위-앞 엣지(윗면 칸 C, 앞면 칸 I)가 제자리에서 뒤집혀 있어요.",
      setup: { alg: setupFor(sendEdges(FLIPPED_EDGE)) },
      quiz: {
        question: "버퍼와 위-앞 엣지가 제자리에서 뒤집혔어요. 무엇을 외울까요?",
        choices: ["C I", "C", "외울 것이 없어요"],
        answer: 0,
        why: "버퍼에 제 조각이 있으니 고리 깨기로 C부터 적어요. C로 보내면 위-앞 조각이 버퍼에 오고, I로 보내면 둘 다 바르게 돌아가요.",
      },
    },
  ],
};

const edges: Lesson = {
  id: "bld-edges",
  size: 3,
  title: "엣지 보내기",
  summary:
    "버퍼(위-오른쪽)에서 글자 자리로. 준비 수 → T퍼뮤 → 준비 수 되돌리기.",
  steps: [
    {
      kind: "quiz",
      body: "바꾸기 자리는 위-왼쪽(D)이에요. T퍼뮤(R U R' U' R' F R2 U' R' U' R U R' F')는 버퍼 B와 D를 맞바꿔요(코너 둘도 함께 바뀌지만, 엣지를 두 번 보내면 다시 돌아와요). 글자마다 그 자리를 D로 옮기는 준비 수가 있어요(아래 표). 준비 수는 버퍼와 T퍼뮤가 바꾸는 코너를 건드리지 않아요.",
      sheet: "bld-edges",
      quiz: {
        question: "T퍼뮤는 버퍼 B와 어느 자리를 맞바꿀까요?",
        choices: ["A(위-뒤)", "C(위-앞)", "D(위-왼쪽)"],
        answer: 2,
        why: "D가 바꾸기 자리예요. 다른 글자는 준비 수로 D에 옮겨 와요.",
      },
    },
    {
      kind: "demo",
      body: "D: 준비 없이 바로 T퍼뮤.",
      setup: { alg: setupFor(edge("D")) },
      alg: edge("D"),
    },
    {
      kind: "demo",
      body: "C(위-앞): 준비 l2 D L2 → T퍼뮤 → 되돌리기 L2 D' l2. l2는 왼쪽 두 층을 함께 두 번 돌리기예요(Lw2와 같아요).",
      setup: { alg: setupFor(edge("C")) },
      alg: edge("C"),
    },
    {
      kind: "try",
      body: "글자 L(앞-왼쪽, 앞면 스티커)을 보내요. 준비 수는 L'.",
      setup: { alg: setupFor(edge("L")) },
      alg: edge("L"),
      goal: "solved",
    },
    {
      kind: "try",
      body: "글자 X(아래-왼쪽, 아랫면 스티커)를 보내요. 준비 수는 L2.",
      setup: { alg: setupFor(edge("X")) },
      alg: edge("X"),
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "표를 보지 않고 떠올려 봐요. 소문자 d는 아래 두 층을 함께 돌려요(d2는 두 번). 준비 수는 그 자리를 버퍼와 위 코너를 건드리지 않고 D로 옮기는 짧은 수예요.",
      quiz: {
        question: "글자 J(앞-오른쪽, 앞면 칸)의 준비 수는?",
        choices: ["d2 L", "L'", "D2 L2"],
        answer: 0,
        why: "d2(아래 두 층 두 번)로 앞-오른쪽을 뒤-왼쪽으로, L로 그 칸을 D 자리로 올려요.",
      },
    },
    {
      kind: "quiz",
      body: "외우기 연습: 엣지 둘만 섞인 큐브예요. 버퍼(위-오른쪽)의 윗면 칸 색을 보고 그 색이 갈 자리의 글자를 적고, 그 자리에 있는 조각을 보고 다음 글자를 적어요. 버퍼 조각이 나오면 끝이에요.",
      setup: { alg: setupFor(sendEdges(MEMO_EDGES_2)) },
      quiz: {
        question: "외울 글자 줄은 무엇일까요?",
        choices: ["U C", "C U", "C I"],
        answer: 1,
        why: "버퍼의 흰-초록 조각(흰 칸)은 C로, C 자리의 노랑-초록 조각(노란 칸)은 U로 가요.",
      },
    },
    {
      kind: "try",
      body: "외운 글자 둘(C, U)을 차례로 보내요. 두 번 보내면 T퍼뮤가 바꾼 코너도 돌아와요.",
      setup: { alg: setupFor(sendEdges(MEMO_EDGES_2)) },
      alg: sendEdges(MEMO_EDGES_2),
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "글자 넷짜리로 넓혀요. 같은 방법으로 버퍼에서 시작해 따라가요.",
      setup: { alg: setupFor(sendEdges(MEMO_EDGES_4)) },
      quiz: {
        question: "외울 글자 줄은 무엇일까요?",
        choices: ["C J W H", "C W J H", "H W J C"],
        answer: 0,
        why: "버퍼 → C → J → W → H 차례로 이어지고, H 자리에 버퍼 조각이 있어 끝나요.",
      },
    },
    {
      kind: "try",
      body: "외운 글자 넷(C J W H)을 차례로 보내요. 준비 수는 C가 l2 D L2, J가 d2 L, W가 D L2, H가 d L'이에요.",
      setup: { alg: setupFor(sendEdges(MEMO_EDGES_4)) },
      alg: sendEdges(MEMO_EDGES_4),
      goal: "solved",
    },
    {
      kind: "try",
      body: "버퍼와 위-앞 엣지가 제자리에서 뒤집혔어요. 글자 C, I를 차례로 보내요.",
      setup: { alg: setupFor(sendEdges(FLIPPED_EDGE)) },
      alg: sendEdges(FLIPPED_EDGE),
      goal: "solved",
    },
  ],
};

const corners: Lesson = {
  id: "bld-corners",
  size: 3,
  title: "코너 보내기",
  summary: "버퍼(위-뒤-왼쪽)에서 글자 자리로. 준비 수 → 변형 Y퍼뮤 → 되돌리기.",
  steps: [
    {
      kind: "quiz",
      body: "바꾸기 자리는 오른-아래-앞(P)이에요. 변형 Y퍼뮤 R U' R' U' R U R' F' R U R' U' R' F R는 버퍼 A와 P를 맞바꿔요(엣지 위-왼쪽·위-뒤도 함께 바뀌어요). 준비 수는 R·D·F만 써서 버퍼와 그 두 엣지를 건드리지 않아요(아래 표).",
      sheet: "bld-corners",
      quiz: {
        question: "변형 Y퍼뮤가 버퍼 A와 맞바꾸는 자리는 어디일까요?",
        choices: ["P(오른-아래-앞)", "V(아래-앞-오른쪽)", "C(위-앞-오른쪽)"],
        answer: 0,
        why: "P가 바꾸기 자리예요. V처럼 다른 글자는 준비 수로 P에 옮겨요.",
      },
    },
    {
      kind: "demo",
      body: "P: 준비 없이 바로.",
      setup: { alg: setupFor(corner("P")) },
      alg: corner("P"),
    },
    {
      kind: "try",
      body: "글자 V(아래-앞-오른쪽, 아랫면 스티커)를 보내요. 준비 수는 R' D'.",
      setup: { alg: setupFor(corner("V")) },
      alg: corner("V"),
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "외우기 연습: 코너 둘만 섞인 큐브예요. 버퍼(위-뒤-왼쪽)의 윗면 칸 색부터 따라가요.",
      setup: { alg: setupFor(sendCorners(MEMO_CORNERS_2)) },
      quiz: {
        question: "외울 글자 줄은 무엇일까요?",
        choices: ["H C", "C H", "C F"],
        answer: 1,
        why: "버퍼 조각의 흰 칸은 C(위-앞-오른쪽)로, 그 자리 조각의 칸은 H로 가요.",
      },
    },
    {
      kind: "try",
      body: "외운 글자 둘(C, H)을 차례로 보내요.",
      setup: { alg: setupFor(sendCorners(MEMO_CORNERS_2)) },
      alg: sendCorners(MEMO_CORNERS_2),
      goal: "solved",
    },
  ],
};

const parity: Lesson = {
  id: "bld-parity",
  size: 3,
  title: "패리티와 끝까지",
  drill: "bld-op",
  summary:
    "엣지 글자가 홀수 개면 엣지 뒤에 패리티 공식 한 번. 그리고 섞인 큐브로 처음부터 끝까지.",
  steps: [
    {
      kind: "quiz",
      body: "엣지 글자 수가 홀수면 T퍼뮤를 홀수 번 해서 코너 둘(위-앞-오른쪽, 위-뒤-오른쪽)이 바뀐 채 남아요. 엣지를 다 보낸 뒤 패리티 공식(PLL 공식 가운데 Ra퍼뮤에 U'를 더한 것, 다음 단계에서 봐요)을 한 번 해요. 코너 둘은 돌아오고 엣지 위-왼쪽·위-뒤가 바뀌는데, 코너 단계가 끝나면 함께 맞아요.",
      quiz: {
        question: "엣지 글자가 7개예요. 엣지를 다 보낸 뒤 무엇을 할까요?",
        choices: [
          "바로 코너를 보내요",
          "패리티 공식을 한 번 한 뒤 코너를 보내요",
        ],
        answer: 1,
        why: "홀수 개면 코너 둘이 바뀐 채 남아서 패리티 공식으로 되돌려요.",
      },
    },
    {
      kind: "demo",
      body: "패리티 공식.",
      setup: { alg: setupFor(PARITY) },
      alg: PARITY,
    },
    {
      kind: "try",
      body: "엣지 하나(C)를 보낸 뒤 패리티, 코너 하나(V)를 보내요. 글자가 홀수일 때의 차례예요.",
      setup: { alg: setupFor(`${edge("C")} ${PARITY} ${corner("V")}`) },
      alg: `${edge("C")} ${PARITY} ${corner("V")}`,
      goal: "solved",
    },
    {
      kind: "try",
      body: "섞인 큐브를 큐브 전체 돌리기로 둘러보며 외워요. 면을 처음 돌리는 순간 모든 칸이 까맣게 가려져요. 다 외운 뒤에 맞추기를 시작해요. 시간 제한은 없어요.",
      setup: { rule: "bld-random" },
      blindfold: true,
      goal: "solved",
    },
  ],
};

export const BLD_OP: Course = {
  id: "bld-op",
  size: 3,
  title: "블라인드(올드 포흐만)",
  summary: "외우기 → 가리고 맞추기. 공식 셋과 글자 붙이기.",
  lessons: [intro, letters, edges, corners, parity],
};
