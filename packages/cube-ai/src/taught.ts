import { FACES } from "@game/cube-solver";
import { frontCrossInsert, type SideFace } from "./cross-front";
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
 * 십자(「항상 D면으로 내려서 옮겨서 올려」): 엣지는 늘 앞면(F)으로 내리고 올린다. 넣을 자리를 y로 앞에
 * 가져오고, 수는 F·D·y뿐이다(`cross-front.ts`가 경우마다 가장 짧은 꼴을 찾는다). 경우 이름은
 * `learn/lessons-333.ts` 「흰 십자」의 다섯 경우다.
 * 1. 아래층, 흰색이 아래: D로 자리 밑에 두고 y로 앞에 가져와 `F2`.
 * 2. 아래층, 흰색이 옆: 가운데 줄로 올렸다가 y로 돌려 F로 올린다(`D y F y' F'`).
 * 3. 가운데 줄: F로 아래층에 내렸다가 올린다(`F F2`, 합치면 `F'`).
 * 4. 윗층 흰색 위, 엉뚱한 자리: y로 앞에 가져와 `F2`로 내린 뒤 1.
 * 5. 윗층에서 뒤집힘: F로 내린 뒤 2.
 *
 * 첫 층 꼭짓점: 넣을 칸을 앞-오른쪽 위(UFR)에 오게 y로 돌려 쥐고, 그 흰 꼭짓점을 D로 바로 밑(DFR)에
 * 데려와 `R' D' R D`를 흰색이 위로 올 때까지 되풀이한다. 윗층 엉뚱한 자리에 박힌 꼭짓점은 그 칸을
 * UFR에 두고 `R' D' R D` 한 번으로 뺀다.
 *
 * 모두 흰 가운데가 위에 있는 기준 방향 글자(`Solve.rel()`)로 판단한다.
 *
 * 마지막 층(파일 끝, 노란 면 위)도 배우기 순서·쥐는 법·횟수 그대로다: 노란 십자 → 옆면 맞추기 →
 * 꼭짓점 자리 → 꼭짓점 방향(docs/47 8-2 표, `learn/lessons-333.ts`). 2×2는 꼭짓점 자리·방향만 쓰고
 * 「3×3을 아는 사람의 2×2」 규칙(제자리가 꼭 하나인 U 자리, 대각이면 0인 자리에서 한 번)을 따른다.
 */

export const TAUGHT_CORNER_TRIGGER = "R' D' R D";

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

interface WhiteEdge {
  slot: number;
  /** 흰 스티커 자리 */
  white: number;
  /** 다른 색 스티커 자리 */
  other: number;
  /** 다른 색(제자리 옆면) */
  color: FaceLetter;
}

function whiteEdges(rel: string): WhiteEdge[] {
  const out: WhiteEdge[] = [];
  EDGE_FACELETS.forEach(([a, b], slot) => {
    if (rel[a] === "U")
      out.push({ slot, white: a, other: b, color: rel[b] as FaceLetter });
    else if (rel[b] === "U")
      out.push({ slot, white: b, other: a, color: rel[a] as FaceLetter });
  });
  return out;
}

/** 십자 자리(UR UF UL UB)의 옆 스티커 */
const CROSS_SIDE = [10, 19, 37, 46];

function crossSolvedSlots(rel: string): number[] {
  return [0, 1, 2, 3].filter((j) => {
    const [a, b] = EDGE_FACELETS[j] as readonly [number, number];
    return rel[a] === "U" && rel[b] === faceOf(b);
  });
}

/** 흰 십자·첫 층 코너를 맞추는 면(흰 면 위). 이 면은 돌리지 않는다 */
export const TAUGHT_SOLVED_FACE: FaceLetter = "U";
/** 안전한 층: 맞추는 면의 반대쪽. 맞춘 조각이 없어 마음껏 돌린다 */
export const TAUGHT_SAFE_FACE: FaceLetter = OPPOSITE[TAUGHT_SOLVED_FACE];
const SAFE = TAUGHT_SAFE_FACE;

export type CrossCase =
  | "down-white-down"
  | "middle"
  | "down-white-side"
  | "top-flipped"
  | "top-wrong";

const CASE_ORDER: readonly CrossCase[] = [
  "down-white-down",
  "down-white-side",
  "middle",
  "top-wrong",
  "top-flipped",
];

const touches = (slot: number, face: FaceLetter) =>
  (EDGE_FACELETS[slot] as readonly number[]).some((i) => faceOf(i) === face);

function caseOf(e: WhiteEdge): CrossCase {
  if (touches(e.slot, SAFE))
    return faceOf(e.white) === SAFE ? "down-white-down" : "down-white-side";
  if (!touches(e.slot, TAUGHT_SOLVED_FACE)) return "middle";
  return faceOf(e.white) === TAUGHT_SOLVED_FACE ? "top-wrong" : "top-flipped";
}

const length = (alg: string) => (alg ? alg.split(" ").length : 0);

/**
 * 다음에 넣을 흰 엣지 하나와 그 수. 쉬운 경우(1→5 차례)의 엣지부터, 그 경우 안에서는 가장 짧게 넣는 것.
 * 수는 F·D·y뿐이고(`cross-front.ts`) 이미 넣은 엣지는 그대로 남는다. 십자가 다 됐으면 null.
 */
export function nextCrossEdge(
  s: Solve,
): { kind: CrossCase; color: FaceLetter; alg: string } | null {
  const rel = s.rel();
  const solved = crossSolvedSlots(rel);
  if (solved.length === 4) return null;
  const todo = whiteEdges(rel).filter(
    (e) => !(e.slot < 4 && solved.includes(e.slot)),
  );
  for (const kind of CASE_ORDER) {
    let best: { color: FaceLetter; alg: string } | null = null;
    for (const e of todo.filter((x) => caseOf(x) === kind)) {
      const alg = frontCrossInsert(e.white, e.color as SideFace, solved);
      if (best === null || length(alg) < length(best.alg))
        best = { color: e.color, alg };
    }
    if (best) return { kind, ...best };
  }
  throw new Error("십자 엣지를 넣을 수를 찾지 못했다");
}

/** 배우는 방식 흰 십자(흰 면 위). 모서리마다 살피고 하나씩 넣는다 */
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

/** 배우는 방식 첫 층 꼭짓점(흰 면 위, `R' D' R D`) */
export function cornersTaught(s: Solve): void {
  const U_CORNERS = [0, 1, 2, 3];
  for (let iter = 0; ; iter++) {
    if (iter > 20) throw new Error("첫 층 꼭짓점 단계가 끝나지 않는다");
    const c = s.cubie();
    if (U_CORNERS.every((i) => cornerOk(c.cp, c.co, i))) return;
    s.look();
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
      for (let r = 0; ; r++) {
        if (r > 6) throw new Error("꼭짓점 넣기가 끝나지 않는다");
        const t = s.cubie();
        if (cornerOk(t.cp, t.co, 0)) break;
        s.apply(TAUGHT_CORNER_TRIGGER);
      }
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

/** 노란 십자(3×3). 점 → ㄱ자 → 가로줄 → 십자, 같은 공식 많아야 세 번 */
export function yellowCrossTaught(s: Solve): void {
  for (let iter = 0; ; iter++) {
    llGuard(iter, 3, "노란 십자");
    const r0 = s.rel();
    if ([1, 3, 5, 7].every((i) => r0[i] === "U")) return;
    s.look();
    let hold = "";
    for (let a = 0; a < 4; a++) {
      const r = s.clone().apply(uTurn(a)).rel();
      const up = (i: number) => r[i] === "U";
      const line = up(3) && up(5) && !up(1) && !up(7);
      const ell = up(1) && up(3) && !up(5) && !up(7);
      if (line || ell) {
        hold = uTurn(a);
        break;
      }
    }
    s.apply(hold).apply(TAUGHT_EO);
  }
}

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
    let done = false;
    for (let a = 0; a < 4 && !done; a++) {
      for (let k = 0; k < 4 && !done; k++) {
        const m = edgeSidesMatched(
          s.clone().apply(uTurn(a)).apply(yTurn(k)).rel(),
        );
        // 오른쪽(UR)·뒤(UB)가 맞음
        if (m[0] && m[3]) {
          s.apply(uTurn(a)).apply(yTurn(k)).apply(TAUGHT_EDGE_SWAP);
          done = true;
        }
      }
    }
    if (done) continue;
    // 이웃한 둘이 없으면 마주 본 둘(일자): 그 자리로 U를 돌리고 쥔 그대로 한 번
    const a = [0, 1, 2, 3].find(
      (a) =>
        edgeSidesMatched(s.clone().apply(uTurn(a)).rel()).filter(Boolean)
          .length >= 2,
    );
    if (a === undefined) throw new Error("옆색이 맞은 모서리 둘을 찾지 못했다");
    s.apply(uTurn(a)).apply(TAUGHT_EDGE_SWAP);
  }
}

/** 제자리(방향은 상관없이) 위 꼭짓점 번호 */
export const placedTop = (s: Solve) => {
  const cp = s.cubie().cp;
  return [0, 1, 2, 3].filter((j) => cp[j] === j);
};

/** 제자리 꼭짓점 하나를 앞-오른쪽 위로 y 쥐고(이미 거기면 그대로) 공식 */
function cycleAround(s: Solve): void {
  const k = [0, 1, 2, 3].find(
    (k) => s.clone().apply(yTurn(k)).cubie().cp[0] === 0,
  );
  if (k === undefined) throw new Error("제자리 꼭짓점을 찾지 못했다");
  s.apply(yTurn(k)).apply(TAUGHT_CORNER_CYCLE);
}

/**
 * 꼭짓점 자리(3×3, 위 모서리가 다 맞은 뒤). 제자리는 0·1·4개뿐이다. 하나면 그것을 앞-오른쪽 위에 쥐고
 * 1~2번. 없으면 한 번 해서 하나를 만든다(아무 쪽에서 해도 되므로, 다음이 한 번에 끝나는 쪽에서 쥔다).
 */
export function llCornerPlaceTaught(s: Solve): void {
  for (let iter = 0; ; iter++) {
    llGuard(iter, 2, "꼭짓점 자리");
    const placed = placedTop(s).length;
    if (placed === 4) return;
    s.look();
    if (placed === 1) {
      cycleAround(s);
      continue;
    }
    if (placed !== 0) throw new Error(`제자리 꼭짓점이 ${placed}개다`);
    const k =
      [0, 1, 2, 3].find((k) => {
        const t = s.clone().apply(yTurn(k)).apply(TAUGHT_CORNER_CYCLE);
        if (placedTop(t).length !== 1) return false;
        cycleAround(t);
        return placedTop(t).length === 4;
      }) ?? 0;
    s.apply(yTurn(k)).apply(TAUGHT_CORNER_CYCLE);
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
export function llCornerTwistTaught(s: Solve): void {
  for (let iter = 0; ; iter++) {
    llGuard(iter, 4, "꼭짓점 방향");
    const c = s.cubie();
    if ([0, 1, 2, 3].every((j) => c.co[j] === 0)) break;
    s.look();
    const a = [0, 1, 2, 3].find(
      (a) => s.clone().apply(uTurn(a)).cubie().co[0] !== 0,
    ) as number;
    s.apply(uTurn(a));
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
