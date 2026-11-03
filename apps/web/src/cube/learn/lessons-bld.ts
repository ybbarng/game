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
const edge = (letter: string) => send(T, setupOf(BLD_EDGE_TARGETS, letter));
const corner = (letter: string) => send(Y, setupOf(BLD_CORNER_TARGETS, letter));

const intro: Lesson = {
  id: "bld-intro",
  size: 3,
  title: "블라인드란",
  summary:
    "섞인 큐브를 보고 외운 뒤, 눈을 가리고 맞춘다. 올드 포흐만은 공식 셋으로 된다.",
  steps: [
    {
      kind: "text",
      body: "블라인드는 두 부분이다. 외우기(큐브를 돌리지 않고 보기만)와 맞추기(모든 칸이 까맣게 가려진 채). 외울 때는 큐브 전체를 돌려 보는 것만 되고 면은 돌릴 수 없다.",
    },
    {
      kind: "text",
      body: "올드 포흐만(옛 포흐만 방법)은 조각을 하나씩 옮긴다. 「버퍼」라는 정해진 자리에 있는 조각을 그 조각의 제자리로 보내면, 그 자리에 있던 조각이 버퍼로 온다. 이것을 버퍼에 자기 조각이 올 때까지 되풀이한다.",
    },
    {
      kind: "text",
      body: "모서리는 버퍼가 위-오른쪽, 바꾸기 공식은 T퍼뮤. 꼭짓점은 버퍼가 위-뒤-왼쪽, 바꾸기 공식은 변형 Y퍼뮤. 보낼 자리를 바꾸기 자리로 옮기는 「준비 수」를 하고, 바꾸기 공식을 한 뒤, 준비 수를 거꾸로 되돌린다.",
    },
  ],
};

const letters: Lesson = {
  id: "bld-letters",
  size: 3,
  title: "글자 붙이기",
  summary:
    "스티커마다 글자 하나(Speffz). 외울 때는 글자 두 개씩 낱말로 묶는다.",
  steps: [
    {
      kind: "text",
      body: "모서리 스티커 24개, 꼭짓점 스티커 24개에 A부터 X까지 글자를 붙인다. 면마다 위 칸부터 시계 방향으로 넷씩: 위 A~D, 왼쪽 E~H, 앞 I~L, 오른쪽 M~P, 뒤 Q~T, 아래 U~X. 모서리와 꼭짓점이 같은 글자를 따로 쓴다.",
    },
    {
      kind: "text",
      body: "외우기: 버퍼 스티커의 색을 보고 그 색이 가야 할 자리의 글자를 적는다. 그 자리에 있는 스티커를 보고 다음 글자를, 버퍼 조각이 나올 때까지 이어 간다. 글자 둘씩 묶어 낱말이나 그림으로 떠올리면 오래 간다.",
    },
    {
      kind: "text",
      body: "버퍼 조각이 나와서 글자가 끊겼는데 아직 안 맞은 조각이 남았으면 「고리 깨기」를 한다. 남은 조각의 스티커 하나를 골라 그 글자를 적고 이어 가다가, 같은 조각이 다시 나오면 처음 고른 그 글자를 한 번 더 적는다.",
    },
  ],
};

const edges: Lesson = {
  id: "bld-edges",
  size: 3,
  title: "모서리 보내기",
  summary:
    "버퍼(위-오른쪽)에서 글자 자리로. 준비 수 → T퍼뮤 → 준비 수 되돌리기.",
  steps: [
    {
      kind: "text",
      body: "바꾸기 자리는 위-왼쪽(D)이다. T퍼뮤는 버퍼 B와 D를 맞바꾼다(꼭짓점 둘도 함께 바뀌지만, 모서리를 두 번 보내면 다시 돌아온다). 글자마다 그 자리를 D로 옮기는 준비 수가 있다. 준비 수는 버퍼와 T퍼뮤가 바꾸는 꼭짓점을 건드리지 않는다.",
    },
    {
      kind: "demo",
      body: "D: 준비 없이 바로 T퍼뮤.",
      setup: { alg: setupFor(edge("D")) },
      alg: edge("D"),
    },
    {
      kind: "demo",
      body: "C(위-앞): 준비 l2 D L2 → T퍼뮤 → 되돌리기 L2 D' l2.",
      setup: { alg: setupFor(edge("C")) },
      alg: edge("C"),
    },
    {
      kind: "try",
      body: "글자 L(앞-왼쪽, 앞면 스티커)을 보낸다. 준비 수는 L'.",
      setup: { alg: setupFor(edge("L")) },
      alg: edge("L"),
      goal: "solved",
    },
    {
      kind: "try",
      body: "글자 X(아래-왼쪽, 아랫면 스티커)를 보낸다. 준비 수는 L2.",
      setup: { alg: setupFor(edge("X")) },
      alg: edge("X"),
      goal: "solved",
    },
    {
      kind: "try",
      body: "글자 둘(C, U)을 차례로 보낸다. 두 번 보내면 T퍼뮤가 바꾼 꼭짓점도 돌아온다.",
      setup: { alg: setupFor(`${edge("C")} ${edge("U")}`) },
      alg: `${edge("C")} ${edge("U")}`,
      goal: "solved",
    },
  ],
};

const corners: Lesson = {
  id: "bld-corners",
  size: 3,
  title: "꼭짓점 보내기",
  summary: "버퍼(위-뒤-왼쪽)에서 글자 자리로. 준비 수 → 변형 Y퍼뮤 → 되돌리기.",
  steps: [
    {
      kind: "text",
      body: "바꾸기 자리는 오른-아래-앞(P)이다. 변형 Y퍼뮤 R U' R' U' R U R' F' R U R' U' R' F R는 버퍼 A와 P를 맞바꾼다(모서리 위-왼쪽·위-뒤도 함께 바뀐다). 준비 수는 R·D·F만 써서 버퍼와 그 두 모서리를 건드리지 않는다.",
    },
    {
      kind: "demo",
      body: "P: 준비 없이 바로.",
      setup: { alg: setupFor(corner("P")) },
      alg: corner("P"),
    },
    {
      kind: "try",
      body: "글자 V(아래-앞-오른쪽, 아랫면 스티커)를 보낸다. 준비 수는 R' D'.",
      setup: { alg: setupFor(corner("V")) },
      alg: corner("V"),
      goal: "solved",
    },
    {
      kind: "try",
      body: "글자 둘(C, H)을 차례로 보낸다.",
      setup: { alg: setupFor(`${corner("C")} ${corner("H")}`) },
      alg: `${corner("C")} ${corner("H")}`,
      goal: "solved",
    },
  ],
};

const parity: Lesson = {
  id: "bld-parity",
  size: 3,
  title: "패리티와 끝까지",
  summary:
    "모서리 글자가 홀수 개면 모서리 뒤에 패리티 공식 한 번. 그리고 섞인 큐브로 처음부터 끝까지.",
  steps: [
    {
      kind: "text",
      body: "모서리 글자 수가 홀수면 T퍼뮤를 홀수 번 해서 꼭짓점 둘(위-앞-오른쪽, 위-뒤-오른쪽)이 바뀐 채 남는다. 모서리를 다 보낸 뒤 패리티 공식(Ra퍼뮤 + U')을 한 번 한다. 꼭짓점 둘은 돌아오고 모서리 위-왼쪽·위-뒤가 바뀌는데, 꼭짓점 단계가 끝나면 함께 맞는다.",
    },
    {
      kind: "demo",
      body: "패리티 공식.",
      setup: { alg: setupFor(PARITY) },
      alg: PARITY,
    },
    {
      kind: "try",
      body: "모서리 하나(C)를 보낸 뒤 패리티, 꼭짓점 하나(V)를 보낸다. 글자가 홀수일 때의 차례다.",
      setup: { alg: setupFor(`${edge("C")} ${PARITY} ${corner("V")}`) },
      alg: `${edge("C")} ${PARITY} ${corner("V")}`,
      goal: "solved",
    },
    {
      kind: "try",
      body: "섞인 큐브를 외우고, 가린 채 맞춘다. 처음엔 시간 제한 없이.",
      setup: { rule: "bld-random" },
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
