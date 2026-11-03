import type { Axis, CubeMove } from "./move";
import { assertSize } from "./topology";

/**
 * 표기 읽기·쓰기.
 *
 * 읽기: WCA 표기 `R U2 F' Rw 3Rw2 x y' z2`, 안쪽 한 층 `2R`, 여러 안쪽 층 `2-3Rw`,
 * 소문자 `r u`(= Rw, `3r` = 3Rw), 가운데 층 `M E S`(홀수 크기만, 정가운데 한 층),
 * 큐브 돌리기 `x y z`. 괄호는 무시한다(공식 묶음 표시). 반대 표시는 `'`와 `’` 모두 받는다.
 * 쓰기: WCA 표기. WCA에 없는 안쪽 층은 `2R`·`2-3Rw`, 홀수 크기의 정가운데 한 층은 `M E S`로 쓴다.
 */

export class NotationError extends Error {
  constructor(
    message: string,
    /** 잘못된 토막이 시작하는 글자 위치(0부터) */
    readonly index: number,
    readonly token: string,
  ) {
    super(`${message} (${index + 1}번째 글자 「${token}」)`);
    this.name = "NotationError";
  }
}

interface FaceSpec {
  axis: Axis;
  /** + 쪽 면(R·U·F)이면 true */
  positive: boolean;
}

const FACE_SPECS: Readonly<Record<string, FaceSpec>> = {
  R: { axis: "x", positive: true },
  L: { axis: "x", positive: false },
  U: { axis: "y", positive: true },
  D: { axis: "y", positive: false },
  F: { axis: "z", positive: true },
  B: { axis: "z", positive: false },
};

/** 가운데 층: M은 L, E는 D, S는 F와 같은 방향 */
const SLICE_SPECS: Readonly<Record<string, FaceSpec>> = {
  M: { axis: "x", positive: false },
  E: { axis: "y", positive: false },
  S: { axis: "z", positive: true },
};

const TOKEN = /^(?:(\d+)(?:-(\d+))?)?([RLUDFBrludfbMESxyz])(w?)(\d?)(['’]?)$/;

type Turns = 1 | 2 | 3;

function toAxisMove(
  n: number,
  spec: FaceSpec,
  p: number,
  q: number,
  turns: Turns,
): CubeMove {
  if (spec.positive) return { axis: spec.axis, from: p, to: q, turns };
  return {
    axis: spec.axis,
    from: n + 1 - q,
    to: n + 1 - p,
    turns: (4 - turns) as Turns,
  };
}

function parseToken(n: number, token: string, index: number): CubeMove {
  const m = TOKEN.exec(token);
  if (!m) throw new NotationError("알 수 없는 표기", index, token);
  const [, aText, bText, letter = "", w, amountText, prime] = m;
  const fail = (why: string): never => {
    throw new NotationError(why, index, token);
  };

  let turns: Turns = 1;
  if (amountText === "2") turns = 2;
  else if (amountText === "3") turns = 3;
  else if (amountText !== "" && amountText !== "1") fail("돌리는 양은 1·2·3만");
  if (prime) turns = (turns === 2 ? 2 : 4 - turns) as Turns;

  const a = aText === undefined ? undefined : Number(aText);
  const b = bText === undefined ? undefined : Number(bText);

  if (letter === "x" || letter === "y" || letter === "z") {
    if (a !== undefined || w) fail("큐브 돌리기에는 층 번호·w를 붙이지 않는다");
    return { axis: letter, from: 1, to: n, turns };
  }

  const slice = SLICE_SPECS[letter];
  if (slice) {
    if (a !== undefined || w) fail("가운데 층에는 층 번호·w를 붙이지 않는다");
    if (n % 2 === 0) fail(`${n}×${n}에는 정가운데 층이 없다`);
    const mid = (n + 1) / 2;
    return toAxisMove(n, slice, mid, mid, turns);
  }

  const lower = letter !== letter.toUpperCase();
  const spec = FACE_SPECS[letter.toUpperCase()];
  if (!spec) return fail("알 수 없는 면");
  if (lower && w) fail("소문자 면에는 w를 붙이지 않는다");
  const wide = lower || w === "w";

  let p: number;
  let q: number;
  if (b !== undefined) {
    p = a as number;
    q = b;
    if (p > q) fail("층 범위는 작은 수부터");
  } else if (wide) {
    p = 1;
    q = a ?? 2;
  } else {
    p = a ?? 1;
    q = p;
  }
  if (p < 1 || q > n) fail(`${n}×${n}에 없는 층`);
  return toAxisMove(n, spec, p, q, turns);
}

/** 표기 → 수 목록. 잘못된 표기는 `NotationError`(위치 포함) */
export function parseMoves(n: number, text: string): CubeMove[] {
  assertSize(n);
  const moves: CubeMove[] = [];
  const re = /[^\s()]+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    moves.push(parseToken(n, m[0], m.index));
  }
  return moves;
}

const SUFFIX: Readonly<Record<Turns, string>> = { 1: "", 2: "2", 3: "'" };
const POS_FACE: Readonly<Record<Axis, string>> = { x: "R", y: "U", z: "F" };
const NEG_FACE: Readonly<Record<Axis, string>> = { x: "L", y: "D", z: "B" };
const SLICE_NAME: Readonly<Record<Axis, string>> = { x: "M", y: "E", z: "S" };

/** 수 하나 → 표기 */
export function formatMove(n: number, m: CubeMove): string {
  const inv = (4 - m.turns) as Turns;
  if (m.from === 1 && m.to === n) return `${m.axis}${SUFFIX[m.turns]}`;
  if (m.from === 1)
    return `${wideName(POS_FACE[m.axis], m.to)}${SUFFIX[m.turns]}`;
  if (m.to === n) {
    return `${wideName(NEG_FACE[m.axis], n + 1 - m.from)}${SUFFIX[inv]}`;
  }
  if (m.from === m.to) {
    const l = m.from;
    if (n % 2 === 1 && l === (n + 1) / 2) {
      // M·E는 반대쪽(L·D) 방향, S는 F 방향
      return `${SLICE_NAME[m.axis]}${SUFFIX[m.axis === "z" ? m.turns : inv]}`;
    }
    if (l <= n + 1 - l) return `${l}${POS_FACE[m.axis]}${SUFFIX[m.turns]}`;
    return `${n + 1 - l}${NEG_FACE[m.axis]}${SUFFIX[inv]}`;
  }
  // 바깥층에 닿지 않는 여러 층
  if (m.from - 1 <= n - m.to) {
    return `${m.from}-${m.to}${POS_FACE[m.axis]}w${SUFFIX[m.turns]}`;
  }
  return `${n + 1 - m.to}-${n + 1 - m.from}${NEG_FACE[m.axis]}w${SUFFIX[inv]}`;
}

function wideName(face: string, depth: number): string {
  if (depth === 1) return face;
  if (depth === 2) return `${face}w`;
  return `${depth}${face}w`;
}

/** 수 목록 → 표기(빈칸으로 잇는다) */
export function formatMoves(n: number, moves: readonly CubeMove[]): string {
  return moves.map((m) => formatMove(n, m)).join(" ");
}
