import { FACES } from "@game/cube-solver";
import { EDGE_FACELETS } from "./cubie";
import { OPPOSITE } from "./facelets";
import { type Solve, uTurn, yTurn } from "./solve";

/**
 * 배우기에서 가르치는 방식 그대로의 흰 십자와 첫 층 꼭짓점(흰 면 위, docs/47 0절 2026-11-04).
 * 첫 화면 연출(초보자 해법)만 쓴다. 컴퓨터 대결 계획(`botPlan`)은 기존 해법을 그대로 써서
 * 다른 기기가 다시 계산한 계획과 어긋나지 않는다.
 *
 * 흐름(2026-11-05 사용자): 맞추는 면(흰 면, U)은 돌리지 않는다. 넣을 조각을 안전한 층(맞추는 면의
 * 반대쪽, D)으로 빼고, 안전한 층만 돌려 들어갈 자리 밑에 둔 뒤 정해진 수로 넣는다.
 *
 * 십자(2026-11-27, docs/47 16-34): 3×3 처음 맞추기 강의 경우별 정해진 길(웹 `learn/beginner-path.ts` 흰 십자)과 같다.
 * 넣을 엣지 블럭은 짝 색 센터를 앞으로 쥐고(y) 아래 층에서 올린다. 경우 이름도 그 길의 네 경우다.
 * 1. 아래 층, 흰색이 아래(`down`): D로 아래-앞에 두고 `F2`.
 * 2. 아래 층, 흰색이 옆(`down-side`): D로 아래-오른쪽에 두고 `R F' R'`(세우고, 올리고, 되돌린다).
 * 3. 가운데 층(`middle`): 블럭을 앞-오른쪽에 쥐고 `R' D' R`로 아래 층(아래-앞)에 내린 뒤 1이나 2.
 * 4. 위 층, 제자리가 아니거나 뒤집힘(`top`): 블럭을 위-앞에 쥐고 `F2`로 내린 뒤 1이나 2.
 * 차례(2026-11-05 사용자 「먼저 큐브 전체를 돌려서 맞출 공간을 정면에 둔 후에 면을 돌려서 대상 조각을 앞으로 가져와서
 * 넣어줘」): 걸음마다 ① 큐브 돌리기(y) ② 반대 면(D)으로 자리 밑에 ③ 공식. 엣지 블럭 하나의 걸음(내리기 → 올리기)을
 * 살피는 자리 하나에 묶어, 살피는 자리마다 엣지 블럭이 하나씩 맞는다. 아래 층 블럭부터 넣으므로 내리기·올리기 사이에
 * 다른 흰 엣지가 제자리에 들지 않는다.
 *
 * 첫 층 꼭짓점: 넣을 칸을 앞-오른쪽 위(UFR)에 오게 y로 돌려 쥐고, 그 흰 꼭짓점을 D로 바로 밑(DFR)에
 * 데려와 넣는다. 기본은 지름길(2026-11-05 사용자): 흰색이 오른쪽이면 `R' D' R`, 앞이면 `F D F'`, 아래면
 * `R' D2 R D`로 오른쪽을 보게 돌린 뒤 `R' D' R`. 제 칸에서 돌아가 있으면 흰색이 보는 쪽 지름길로 한 번 빼고
 * (끝에 D로 칸 밑에 되돌림) 같은 지름길로 넣는다. 윗층 엉뚱한 자리에 박힌 꼭짓점은 그 칸을 UFR에 두고
 * `R' D' R D` 한 번으로 뺀다. `repeat`이면 배우기 첫 방법대로 `R' D' R D`를 흰색이 위로 올 때까지 되풀이한다.
 *
 * 모두 흰 가운데가 위에 있는 기준 방향 글자(`Solve.rel()`)로 판단한다.
 *
 * 마지막 층(파일 끝, 노란 면 위)도 배우기 순서·쥐는 법·횟수 그대로다: 노란 십자 → 옆면 맞추기 →
 * 꼭짓점 자리 → 꼭짓점 방향(docs/47 8-2 표, `learn/lessons-333.ts`). 2×2는 꼭짓점 자리·방향만 쓰고
 * 「3×3을 아는 사람의 2×2」 규칙(제자리가 꼭 하나인 U 자리, 대각이면 0인 자리에서 한 번)을 따른다.
 */

export const TAUGHT_CORNER_TRIGGER = "R' D' R D";
/** 코너 돌리기를 거꾸로(2026-11-10 단원): 다섯 번·네 번 칠 자리를 한 번·두 번으로 */
export const TAUGHT_CORNER_TRIGGER_BACK = "D' R' D R";

type FaceLetter = (typeof FACES)[number];
const faceOf = (i: number) => FACES[Math.floor(i / 9)] as FaceLetter;

/** 흰 면을 위로 든다(흰 가운데가 이미 위면 그대로) */
export function whiteUp(s: Solve): void {
  for (const r of ["", "x2", "x", "x'", "z", "z'"]) {
    if (s.clone().apply(r).f[4] === "U") {
      s.apply(r);
      return;
    }
  }
  throw new Error("흰 가운데를 찾지 못했다");
}

/** 흰 십자·첫 층 코너를 맞추는 면(흰 면 위). 이 면은 돌리지 않는다 */
export const TAUGHT_SOLVED_FACE: FaceLetter = "U";
/** 안전한 층: 맞추는 면의 반대쪽. 맞춘 조각이 없어 마음껏 돌린다 */
export const TAUGHT_SAFE_FACE: FaceLetter = OPPOSITE[TAUGHT_SOLVED_FACE];

/** 흰 십자 공식(웹 `learn/beginner-path.ts`와 같다) */
export const TAUGHT_CROSS_UP = "F2";
export const TAUGHT_CROSS_SIDE_UP = "R F' R'";
export const TAUGHT_CROSS_MIDDLE_DOWN = "R' D' R";
export const TAUGHT_CROSS_TOP_DOWN = "F2";

/** 흰 십자의 경우(웹 `beginner-path.ts` 흰 십자 단계의 경우 id) */
export type CrossCase = "down" | "down-side" | "middle" | "top";

const CASE_ORDER: readonly CrossCase[] = ["down", "down-side", "middle", "top"];
/** 옆 색(실제 색 글자) 차례: 초록·빨강·파랑·주황(웹 `SIDE_COLORS`) */
const SIDE_COLORS: readonly FaceLetter[] = ["F", "R", "B", "L"];
const Y4 = ["", "y", "y'", "y2"];
const D4 = ["", "D", "D'", "D2"];

/** 흰-`color` 엣지 블럭의 흰 스티커·짝 색 스티커가 보는 면 */
function whiteEdgeAt(
  t: Solve,
  color: FaceLetter,
): { wf: FaceLetter; cf: FaceLetter } {
  for (const [a, b] of EDGE_FACELETS) {
    if (t.f[a] === "U" && t.f[b] === color)
      return { wf: faceOf(a), cf: faceOf(b) };
    if (t.f[b] === "U" && t.f[a] === color)
      return { wf: faceOf(b), cf: faceOf(a) };
  }
  throw new Error(`흰 엣지 블럭 없음: ${color}`);
}

/** 그 색 센터가 있는 면 */
const centerFace = (t: Solve, color: FaceLetter) =>
  FACES[
    [0, 1, 2, 3, 4, 5].find((k) => t.f[k * 9 + 4] === color) as number
  ] as FaceLetter;

const crossEdgeOk = (t: Solve, color: FaceLetter) => {
  const e = whiteEdgeAt(t, color);
  return e.wf === centerFace(t, "U") && e.cf === centerFace(t, color);
};

const isAt = (t: Solve, color: FaceLetter, faces: [FaceLetter, FaceLetter]) => {
  const e = whiteEdgeAt(t, color);
  return faces.includes(e.wf) && faces.includes(e.cf);
};

function firstTurn(
  s: Solve,
  turns: readonly string[],
  ok: (t: Solve) => boolean,
): string {
  const t = turns.find((x) => ok(s.clone().apply(x)));
  if (t === undefined) throw new Error("쥘 방향을 찾지 못했다");
  return t;
}

const joinMoves = (...xs: string[]) => xs.filter(Boolean).join(" ");

/** 흰 십자 한 걸음: 쥐는 수(y·D)와 공식(웹 `beginner-path.ts` `crossNext`와 같은 규칙) */
export function crossStep(
  s: Solve,
  color: FaceLetter,
): { kind: CrossCase; hold: string; alg: string } {
  const { wf, cf } = whiteEdgeAt(s, color);
  if (wf === "D" || cf === "D") {
    const side = cf === "D";
    const y = firstTurn(s, Y4, (t) => centerFace(t, color) === "F");
    const d = firstTurn(s.clone().apply(y), D4, (t) =>
      isAt(t, color, ["D", side ? "R" : "F"]),
    );
    return side
      ? { kind: "down-side", hold: joinMoves(y, d), alg: TAUGHT_CROSS_SIDE_UP }
      : { kind: "down", hold: joinMoves(y, d), alg: TAUGHT_CROSS_UP };
  }
  if (wf !== "U" && cf !== "U") {
    const y = firstTurn(s, Y4, (t) => isAt(t, color, ["F", "R"]));
    return { kind: "middle", hold: y, alg: TAUGHT_CROSS_MIDDLE_DOWN };
  }
  const y = firstTurn(s, Y4, (t) => isAt(t, color, ["U", "F"]));
  return { kind: "top", hold: y, alg: TAUGHT_CROSS_TOP_DOWN };
}

const length = (alg: string) => (alg ? alg.split(" ").length : 0);

/** 그 엣지 블럭을 제자리에 넣을 때까지의 걸음(가운데·위 층이면 내리고 아래 층에서 올린다) */
function crossPiece(s: Solve, color: FaceLetter): string {
  const t = s.clone();
  const parts: string[] = [];
  for (let i = 0; !crossEdgeOk(t, color); i++) {
    if (i > 1) throw new Error("흰 엣지 블럭이 두 걸음 안에 들지 않는다");
    const st = crossStep(t, color);
    const moves = joinMoves(st.hold, st.alg);
    parts.push(moves);
    t.apply(moves);
  }
  return parts.join(" ");
}

/**
 * 다음에 넣을 흰 엣지 하나와 그 수(내리기부터 올리기까지). 아래 층 블럭부터(경우 차례: 아래 층 흰색 아래 → 옆 →
 * 가운데 층 → 위 층), 같은 경우 안에서는 수가 가장 적은 것, 같으면 초록·빨강·파랑·주황 차례.
 * `kind`는 첫 걸음의 경우, `color`는 지금 쥔 방향에서 그 블럭의 짝 색 센터가 있는 면. 십자가 다 됐으면 null.
 */
export function nextCrossEdge(
  s: Solve,
): { kind: CrossCase; color: FaceLetter; alg: string } | null {
  const todo = SIDE_COLORS.filter((c) => !crossEdgeOk(s, c));
  if (todo.length === 0) return null;
  let best: { kind: CrossCase; color: FaceLetter; alg: string } | null = null;
  for (const c of todo) {
    const kind = crossStep(s, c).kind;
    const alg = crossPiece(s, c);
    const better =
      best === null ||
      CASE_ORDER.indexOf(kind) < CASE_ORDER.indexOf(best.kind) ||
      (kind === best.kind && length(alg) < length(best.alg));
    if (better) best = { kind, color: centerFace(s, c), alg };
  }
  return best;
}

/** 배우는 방식 흰 십자(흰 면 위). 엣지 블럭마다 살피고 하나씩 넣는다 */
export function crossTaught(s: Solve): void {
  for (let i = 0; ; i++) {
    if (i > 4) throw new Error("십자 단계가 끝나지 않는다");
    const next = nextCrossEdge(s);
    if (!next) return;
    s.look();
    s.apply(next.alg);
  }
}

const cornerOk = (cp: number[], co: number[], slot: number) =>
  cp[slot] === slot && co[slot] === 0;

const dTurn = (a: number) => ["", "D", "D2", "D'"][a] as string;

/**
 * 첫 층 코너 지름길(흰 면 위, 넣는 칸은 앞-오른쪽 위). 칸 밑(앞-오른쪽 아래)에서 흰색이 보는 쪽마다.
 * 아래는 오른쪽을 보게 돌린 뒤(`R' D2 R D`) 오른쪽 지름길. 맞춘 면(U)은 돌리지 않는다
 */
export const TAUGHT_CORNER_SHORTCUT = {
  right: "R' D' R",
  front: "F D F'",
  down: "R' D2 R D R' D' R",
} as const;

/**
 * 제 칸(앞-오른쪽 위)에서 돌아간 코너: 흰색이 보는 쪽 지름길로 빼고 D로 칸 밑에 되돌리면 흰색이 같은 쪽을
 * 본다. 그대로 같은 지름길로 넣는다
 */
export const TAUGHT_CORNER_SLOT = {
  right: "R' D' R D R' D' R",
  front: "F D F' D' F D F'",
} as const;

export interface CornerOptions {
  /** 지름길 대신 `R' D' R D`를 흰색이 위로 올 때까지 되풀이(배우기 첫 방법) */
  repeat?: boolean;
}

/**
 * 흰 스티커가 보는 쪽(조각 방향으로, 2×2·3×3 같음). 칸 밑(DFR): 0 아래, 1 앞, 2 오른쪽.
 * 제 칸(UFR): 1 오른쪽, 2 앞
 */
const BOTTOM_WHITE = ["down", "front", "right"] as const;
const SLOT_WHITE = { 1: "right", 2: "front" } as const;

/**
 * 지름길로 다음 코너 하나를 넣는다. 아래층 흰 코너 가운데 쥐기(y)·칸 밑으로(D)·공식을 합쳐 가장 짧은 것.
 * 없으면 제 칸에서 돌아간 코너, 그것도 없으면 엉뚱한 칸에 박힌 코너를 한 번 뺀다
 */
function cornerShortcutStep(s: Solve): void {
  let best: string | null = null;
  for (let k = 0; k < 4; k++) {
    const t = s.clone().apply(yTurn(k));
    if (t.cubie().cp.indexOf(0) < 4) continue;
    const a = [0, 1, 2, 3].find(
      (a) => t.clone().apply(dTurn(a)).cubie().cp[4] === 0,
    ) as number;
    const co = t.clone().apply(dTurn(a)).cubie().co[4] as 0 | 1 | 2;
    const white = BOTTOM_WHITE[co];
    const alg = [yTurn(k), dTurn(a), TAUGHT_CORNER_SHORTCUT[white]]
      .filter(Boolean)
      .join(" ");
    if (best === null || length(alg) < length(best)) best = alg;
  }
  if (best !== null) {
    s.apply(best);
    return;
  }
  const wrong = [0, 1, 2, 3].filter((j) => {
    const t = s.clone().apply(yTurn(j)).cubie();
    return !cornerOk(t.cp, t.co, 0);
  });
  const own = wrong.find((j) => s.clone().apply(yTurn(j)).cubie().cp[0] === 0);
  if (own !== undefined) {
    const co = s.clone().apply(yTurn(own)).cubie().co[0] as 1 | 2;
    s.apply(yTurn(own)).apply(TAUGHT_CORNER_SLOT[SLOT_WHITE[co]]);
    return;
  }
  s.apply(yTurn(wrong[0] as number)).apply(TAUGHT_CORNER_TRIGGER);
}

/** 배우는 방식 첫 층 꼭짓점(흰 면 위). 기본은 지름길, `repeat`이면 `R' D' R D` 되풀이 */
export function cornersTaught(s: Solve, opts: CornerOptions = {}): void {
  const U_CORNERS = [0, 1, 2, 3];
  for (let iter = 0; ; iter++) {
    if (iter > 20) throw new Error("첫 층 꼭짓점 단계가 끝나지 않는다");
    const c = s.cubie();
    if (U_CORNERS.every((i) => cornerOk(c.cp, c.co, i))) return;
    s.look();
    if (!opts.repeat) {
      cornerShortcutStep(s);
      continue;
    }
    // 아래층에 흰 꼭짓점이 있으면: 그 제자리를 UFR로 돌려 쥐고, D로 바로 밑에 데려와 되풀이
    const k = [0, 1, 2, 3].find(
      (k) => s.clone().apply(yTurn(k)).cubie().cp.indexOf(0) >= 4,
    );
    if (k !== undefined) {
      s.apply(yTurn(k));
      const a = [0, 1, 2, 3].find(
        (a) => s.clone().apply(dTurn(a)).cubie().cp[4] === 0,
      ) as number;
      s.apply(dTurn(a));
      // 칸 밑(DFR) 흰색: 오른쪽 한 번, 아래 세 번, 앞 거꾸로 한 번(배우기 단원과 같은 횟수)
      const co = s.cubie().co[4] as 0 | 1 | 2;
      s.apply(
        co === 2
          ? TAUGHT_CORNER_TRIGGER
          : co === 1
            ? TAUGHT_CORNER_TRIGGER_BACK
            : `${TAUGHT_CORNER_TRIGGER} ${TAUGHT_CORNER_TRIGGER} ${TAUGHT_CORNER_TRIGGER}`,
      );
      continue;
    }
    // 제 칸에서 돌아갔으면 흰색 오른쪽 두 번, 앞 거꾸로 두 번
    const own = [0, 1, 2, 3].find((j) => {
      const t = s.clone().apply(yTurn(j)).cubie();
      return t.cp[0] === 0 && t.co[0] !== 0;
    });
    if (own !== undefined) {
      s.apply(yTurn(own));
      const f =
        s.cubie().co[0] === 1
          ? TAUGHT_CORNER_TRIGGER
          : TAUGHT_CORNER_TRIGGER_BACK;
      s.apply(`${f} ${f}`);
      continue;
    }
    // 아래층에 없으면 윗층에 잘못 박힌 꼭짓점을 UFR로 돌려 한 번 뺀다
    const j = [0, 1, 2, 3].find((j) => {
      const t = s.clone().apply(yTurn(j)).cubie();
      return !cornerOk(t.cp, t.co, 0);
    }) as number;
    s.apply(yTurn(j)).apply(TAUGHT_CORNER_TRIGGER);
  }
}

// ---------- 둘째 층(흰 면 아래, 늘 앞-오른쪽 칸) ----------

/** 둘째 층: 앞 위 엣지를 앞-오른쪽 칸으로(앞에서 들어옴) */
export const TAUGHT_MIDDLE_FROM_FRONT = "U R U' R' U' F' U F";
/** 둘째 층: 오른쪽 위 엣지를 앞-오른쪽 칸으로(오른쪽에서 들어옴) */
export const TAUGHT_MIDDLE_FROM_RIGHT = "U' F' U F U R U' R'";

/**
 * 둘째 층 엣지(2026-11-05 사용자 「2층도 마찬가지」). 넣는 곳은 늘 앞-오른쪽 칸(FR)이다: 넣을 칸을 y로
 * 앞-오른쪽에 가져오고, 윗면(반대 면)을 돌려 엣지를 앞 위(옆색이 앞 센터와 같게) 또는 오른쪽 위(옆색이
 * 오른쪽 센터와 같게)에 두고 그 쪽 공식을 쓴다. 왼쪽 칸 공식(`U' L' U L U F U' F'`)은 쓰지 않는다.
 * 윗층에 넣을 엣지가 없으면 잘못 든 칸을 앞-오른쪽으로 가져와 앞 공식으로 빼낸다.
 */
export function middleTaught(s: Solve): void {
  const ok = (ep: number[], eo: number[], i: number) =>
    ep[i] === i && eo[i] === 0;
  for (let iter = 0; ; iter++) {
    if (iter > 20) throw new Error("둘째 층 단계가 끝나지 않는다");
    const c = s.cubie();
    if ([8, 9, 10, 11].every((i) => ok(c.ep, c.eo, i))) return;
    s.look();
    let best: { pre: string; alg: string } | null = null;
    for (let k = 0; k < 4; k++)
      for (let a = 0; a < 4; a++) {
        const pre = [yTurn(k), uTurn(a)].filter(Boolean).join(" ");
        const t = s.clone().apply(pre);
        const r = t.rel();
        const ep = t.cubie().ep;
        const alg =
          (ep[1] as number) >= 8 && r[19] === "F" && r[7] === "R"
            ? TAUGHT_MIDDLE_FROM_FRONT
            : (ep[0] as number) >= 8 && r[10] === "R" && r[5] === "F"
              ? TAUGHT_MIDDLE_FROM_RIGHT
              : null;
        if (!alg) continue;
        if (!best || length(pre) < length(best.pre)) best = { pre, alg };
      }
    if (best) {
      s.apply(best.pre).apply(best.alg);
      continue;
    }
    const k = [0, 1, 2, 3].find((k) => {
      const t = s.clone().apply(yTurn(k)).cubie();
      return !ok(t.ep, t.eo, 8);
    }) as number;
    s.apply(yTurn(k)).apply(TAUGHT_MIDDLE_FROM_FRONT);
  }
}

// ---------- 마지막 층(배우기 「노란 십자」~「꼭짓점 방향」, docs/47 8-2 표) ----------

/** 노란 십자: 가로줄은 가로로, ㄱ자는 뒤·왼쪽으로(U로) 쥐고. 점은 그대로 */
export const TAUGHT_EO = "F R U R' U' F'";
/** 옆면 맞추기: 맞은 두 모서리를 뒤·오른쪽에 두고(y로 쥐고) 앞·왼쪽을 바꾼다(수네 + U) */
export const TAUGHT_EDGE_SWAP = "R U R' U R U2 R' U";
/** 꼭짓점 자리: 제자리 하나를 앞-오른쪽 위에 두고(y로 쥐고) 나머지 셋을 돌린다 */
export const TAUGHT_CORNER_CYCLE = "U R U' L' U R' U' L";

function llGuard(count: number, limit: number, what: string): void {
  if (count > limit) throw new Error(`${what} 단계가 끝나지 않는다`);
}

/** 노란 십자 거꾸로: ㄱ자(뒤·왼쪽)를 한 번에 십자로 */
export const TAUGHT_EO_BACK = "F U R U' R' F'";

/**
 * 노란 십자(3×3, 2026-11-10 단원과 같은 길). 일자는 가로로 쥐고 공식 한 번, ㄱ자는 노란 두 칸을 뒤·왼쪽에 두고
 * 거꾸로 한 번, 점은 그대로 공식 한 번(앞·오른쪽 ㄱ자가 생김) 뒤 ㄱ자대로. 많아야 두 번
 */
export function yellowCrossTaught(s: Solve): void {
  for (let iter = 0; ; iter++) {
    llGuard(iter, 2, "노란 십자");
    const r0 = s.rel();
    if ([1, 3, 5, 7].every((i) => r0[i] === "U")) return;
    s.look();
    let next: string | null = null;
    for (let a = 0; a < 4 && next === null; a++) {
      const r = s.clone().apply(uTurn(a)).rel();
      const up = (i: number) => r[i] === "U";
      if (up(3) && up(5) && !up(1) && !up(7)) next = `${uTurn(a)} ${TAUGHT_EO}`;
      else if (up(1) && up(3) && !up(5) && !up(7))
        next = `${uTurn(a)} ${TAUGHT_EO_BACK}`;
    }
    s.apply(next ?? TAUGHT_EO);
  }
}

/** 십자 자리(UR UF UL UB)의 옆 스티커 */
const CROSS_SIDE = [10, 19, 37, 46];

/** 위 모서리(UR UF UL UB)의 옆색이 옆 가운데와 같은가 */
export const edgeSidesMatched = (rel: string) =>
  CROSS_SIDE.map((i) => rel[i] === faceOf(i));

/**
 * 옆면 맞추기(3×3). U를 돌려 옆색이 맞은 모서리가 둘 이상인 자리를 찾는다. 이웃한 둘이면 y로 뒤·오른쪽에
 * 쥐고 한 번, 마주 보면 그대로 한 번 해서 이웃한 둘을 만든 뒤 한 번 더. 많아야 두 번. 끝에 U로 옆색을 맞춘다
 */
export function llEdgesTaught(s: Solve): void {
  for (let iter = 0; ; iter++) {
    llGuard(iter, 2, "옆면 맞추기");
    const all = [0, 1, 2, 3].find((a) =>
      edgeSidesMatched(s.clone().apply(uTurn(a)).rel()).every(Boolean),
    );
    if (all !== undefined) {
      s.apply(uTurn(all));
      return;
    }
    s.look();
    // U를 한 칸씩 돌려 보며 처음으로 둘 이상 맞는 자리(2026-11-10 단원과 같은 차례)
    const a = [0, 1, 2, 3].find(
      (a) =>
        edgeSidesMatched(s.clone().apply(uTurn(a)).rel()).filter(Boolean)
          .length >= 2,
    );
    if (a === undefined) throw new Error("옆색이 맞은 모서리 둘을 찾지 못했다");
    s.apply(uTurn(a));
    // 이웃한 둘이면 뒤·오른쪽(UB·UR)에, 마주 본 둘이면 앞·뒤(UF·UB)에 쥐고 한 번
    const k = [0, 1, 2, 3].find((k) => {
      const m = edgeSidesMatched(s.clone().apply(yTurn(k)).rel());
      return (m[0] && m[3]) || (m[1] && m[3] && !m[0] && !m[2]);
    }) as number;
    s.apply(yTurn(k)).apply(TAUGHT_EDGE_SWAP);
  }
}

/** 제자리(방향은 상관없이) 위 꼭짓점 번호 */
export const placedTop = (s: Solve) => {
  const cp = s.cubie().cp;
  return [0, 1, 2, 3].filter((j) => cp[j] === j);
};

/** 꼭짓점 자리 거꾸로: 남은 셋을 반대로 돌린다 */
export const TAUGHT_CORNER_CYCLE_BACK = "L' U R U' L U R' U'";

/**
 * 제자리 꼭짓점 하나를 앞-오른쪽 위로 y 쥐고(이미 거기면 그대로), 앞-왼쪽 위 꼭짓점의 제자리가 대각선 건너편
 * (뒤-오른쪽 위)이면 공식, 바로 뒤(뒤-왼쪽 위)면 거꾸로. `back`이 거짓이면 공식만(2×2, 1~2번)
 */
function cycleAround(s: Solve, back = false): void {
  const k = [0, 1, 2, 3].find(
    (k) => s.clone().apply(yTurn(k)).cubie().cp[0] === 0,
  );
  if (k === undefined) throw new Error("제자리 꼭짓점을 찾지 못했다");
  s.apply(yTurn(k));
  // 앞-왼쪽 위(UFL, 1번 자리) 조각이 뒤-왼쪽 위(ULB, 2번) 것이면 거꾸로
  const behind = s.cubie().cp[1] === 2;
  s.apply(back && behind ? TAUGHT_CORNER_CYCLE_BACK : TAUGHT_CORNER_CYCLE);
}

/**
 * 꼭짓점 자리(3×3, 위 모서리가 다 맞은 뒤). 제자리는 0·1·4개뿐이다. 하나면 그것을 앞-오른쪽 위에 쥐고
 * 앞-왼쪽 위 꼭짓점을 보고 공식이나 거꾸로 한 번. 없으면 쥔 그대로 한 번 해서 하나를 만든다.
 */
export function llCornerPlaceTaught(s: Solve): void {
  for (let iter = 0; ; iter++) {
    llGuard(iter, 2, "꼭짓점 자리");
    const placed = placedTop(s).length;
    if (placed === 4) return;
    s.look();
    if (placed === 1) {
      cycleAround(s, true);
      continue;
    }
    if (placed !== 0) throw new Error(`제자리 꼭짓점이 ${placed}개다`);
    // 제자리가 없으면 쥔 그대로 한 번(꼭 하나가 생긴다, 2026-11-10 단원)
    s.apply(TAUGHT_CORNER_CYCLE);
  }
}

/**
 * 2×2 꼭짓점 자리. 위 모서리가 없어 U를 돌려도 된다: U를 돌려 제자리가 꼭 하나인 자리를 찾아 그것을
 * 앞-오른쪽 위에 쥐고 공식. 그런 자리가 없으면(대각 바꿈, 제자리가 2·0·2·0) 0인 자리에서 한 번
 * (배우기 「3×3을 아는 사람의 2×2」의 꼭짓점 자리와 같은 규칙).
 */
export function cornerPlace2Taught(s: Solve): void {
  for (let iter = 0; ; iter++) {
    llGuard(iter, 3, "꼭짓점 자리");
    const counts = [0, 1, 2, 3].map(
      (a) => placedTop(s.clone().apply(uTurn(a))).length,
    );
    const all = counts.indexOf(4);
    if (all >= 0) {
      s.apply(uTurn(all));
      return;
    }
    s.look();
    const one = counts.indexOf(1);
    if (one >= 0) {
      s.apply(uTurn(one));
      cycleAround(s);
      continue;
    }
    const zero = counts.indexOf(0);
    if (zero < 0) throw new Error("제자리가 없는 U 자리를 찾지 못했다");
    s.apply(uTurn(zero)).apply(TAUGHT_CORNER_CYCLE);
  }
}

/**
 * 꼭짓점 방향(2×2·3×3 공통). 풀 꼭짓점을 U만 돌려 앞-오른쪽 위로 가져와 `R' D' R D`를 그 꼭짓점의 노란색이
 * 위를 볼 때까지(2번 또는 4번) 되풀이한다. 그 사이 아래 두 층이 흐트러졌다가 다 끝나면 돌아온다.
 * 큐브는 돌려 쥐지 않는다. 끝에 U로 옆색을 맞춘다.
 */
export function llCornerTwistTaught(
  s: Solve,
  opts: { back?: boolean } = {},
): void {
  for (let iter = 0; ; iter++) {
    llGuard(iter, 4, "꼭짓점 방향");
    const c = s.cubie();
    if ([0, 1, 2, 3].every((j) => c.co[j] === 0)) break;
    s.look();
    const a = [0, 1, 2, 3].find(
      (a) => s.clone().apply(uTurn(a)).cubie().co[0] !== 0,
    ) as number;
    s.apply(uTurn(a));
    // 3×3(2026-11-10 단원): 노랑이 오른쪽(co 1)이면 두 번, 앞(co 2)이면 거꾸로 두 번
    if (opts.back) {
      const f =
        s.cubie().co[0] === 1
          ? TAUGHT_CORNER_TRIGGER
          : TAUGHT_CORNER_TRIGGER_BACK;
      s.apply(`${f} ${f}`);
      continue;
    }
    const piece = s.cubie().cp[0];
    for (let r = 0; ; r++) {
      llGuard(r, 4, "꼭짓점 돌리기");
      const t = s.cubie();
      if (r > 0 && t.cp[0] === piece && t.co[0] === 0) break;
      s.apply(TAUGHT_CORNER_TRIGGER);
    }
  }
  const a = [0, 1, 2, 3].find((a) => s.clone().apply(uTurn(a)).isSolved());
  if (a === undefined) throw new Error("꼭짓점 방향 뒤에 맞지 않았다");
  s.apply(uTurn(a));
}
