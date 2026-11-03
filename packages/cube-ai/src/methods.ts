import { FACES, type Face, solve2x2, solve3x3 } from "@game/cube-solver";
import type { PuzzleState } from "@game/puzzle-core";
import {
  BEGINNER,
  CPLL,
  EO_2LOOK,
  EPLL,
  OCLL,
  OCLL_2X2,
  OLL,
  PLL,
} from "./algs";
import { solveBigExpert, solveBigHuman } from "./big";
import { cornerFacelets, FACE_MOVE_COUNT, faceMoveName } from "./cubie";
import { OPPOSITE, toFacelets } from "./facelets";
import {
  applyMatch,
  lowerSolved,
  topCornersPermuted,
  topEdgesOriented,
  topOriented,
} from "./ll";
import { coordsOf, heuristic, idaSearch, type Tracked } from "./search";
import { type HumanSolve, Solve, type StageName, uTurn, yTurn } from "./solve";

/**
 * 사람 흉내 해법. 모두 상태 → 수 목록(WCA 표기)과 단계 경계. 같은 상태면 늘 같은 수가 나온다.
 *
 * 3×3은 흰 면을 아래(D)로 돌려 쥐고(첫 수가 z2 같은 큐브 돌리기) 시작한다.
 * 2×2는 가운데가 없어 흰 꼭짓점 하나를 기준으로 방향을 정한다(큐브를 돌리지 않는다).
 */

export type BotLevel = "beginner" | "intermediate" | "advanced" | "expert";

export const BOT_LEVELS: readonly BotLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
];

export const BOT_LEVEL_LABELS: Readonly<Record<BotLevel, string>> = {
  beginner: "입문",
  intermediate: "중수",
  advanced: "고수",
  expert: "초고수",
};

const ALL_MOVES = Array.from({ length: FACE_MOVE_COUNT }, (_, i) => i);
/** F2L은 D를 돌리지 않는다(사람이 거의 쓰지 않는다) */
const NO_D_MOVES = ALL_MOVES.filter((m) => Math.floor(m / 3) !== 3);

function applyPath(s: Solve, path: readonly number[]): void {
  s.apply(path.map(faceMoveName).join(" "));
}

/** 반복이 끝나지 않는 것을 막는 안전장치 */
function guard(count: number, limit: number, what: string): void {
  if (count > limit) throw new Error(`${what} 단계가 끝나지 않는다`);
}

// ---------- 3×3 공통 단계 ----------

/** 흰 가운데를 아래로 */
function whiteDown(s: Solve): void {
  for (const r of ["", "z2", "x", "x'", "z", "z'"]) {
    const t = s.clone().apply(r);
    if (t.f[31] === "U") {
      s.apply(r);
      return;
    }
  }
  throw new Error("흰 가운데를 찾지 못했다");
}

const CROSS_EDGES = [4, 5, 6, 7];

/** 십자 모서리를 하나씩(앞·오른쪽·뒤·왼쪽 차례) 이미 놓은 것을 지키며 넣는다(입문·중수) */
function crossOneByOne(s: Solve): void {
  const order = [5, 4, 7, 6];
  for (let k = 1; k <= 4; k++) {
    s.look();
    const pieces = order.slice(0, k).sort((a, b) => a - b);
    const tracked: Tracked[] = pieces.map((piece) => ({ kind: "e", piece }));
    const hs = [
      heuristic(
        tracked,
        tracked.map((_, i) => i),
      ),
    ];
    const path = idaSearch(
      coordsOf(s.cubie(), tracked),
      tracked,
      hs,
      ALL_MOVES,
    );
    if (!path) throw new Error("십자를 찾지 못했다");
    applyPath(s, path);
  }
}

/** 십자를 한 번에 가장 짧게(고수, 8수 안) */
function crossOptimal(s: Solve): void {
  const tracked: Tracked[] = CROSS_EDGES.map((piece) => ({ kind: "e", piece }));
  const hs = [heuristic(tracked, [0, 1, 2, 3])];
  const path = idaSearch(coordsOf(s.cubie(), tracked), tracked, hs, ALL_MOVES, {
    maxDepth: 8,
  });
  if (!path) throw new Error("십자를 찾지 못했다");
  applyPath(s, path);
}

const cornerOk = (cp: number[], co: number[], slot: number) =>
  cp[slot] === slot && co[slot] === 0;

/**
 * 첫 층 꼭짓점(2×2·3×3 공통, 초보자 방법). 흰 꼭짓점이 위층에 있으면 그 자리가 앞 오른쪽에
 * 오게 큐브를 돌리고(y), U로 바로 위에 둔 뒤 `R U R' U'`를 맞을 때까지 되풀이한다.
 * 위층에 없고 아래층에 잘못 들어 있으면 그 자리를 앞 오른쪽으로 돌려 한 번 꺼낸다.
 */
function firstLayerCorners(s: Solve): void {
  const D_CORNERS = [4, 5, 6, 7];
  for (let iter = 0; ; iter++) {
    guard(iter, 20, "첫 층 꼭짓점");
    s.look();
    const c = s.cubie();
    if (D_CORNERS.every((i) => cornerOk(c.cp, c.co, i))) return;
    let k = [0, 1, 2, 3].find((k) => {
      const t = s.clone().apply(yTurn(k)).cubie();
      return t.cp.indexOf(4) < 4;
    });
    if (k !== undefined) {
      s.apply(yTurn(k));
      const a = [0, 1, 2, 3].find(
        (a) => s.clone().apply(uTurn(a)).cubie().cp[0] === 4,
      ) as number;
      s.apply(uTurn(a));
      for (let r = 0; ; r++) {
        guard(r, 6, "꼭짓점 넣기");
        const t = s.cubie();
        if (cornerOk(t.cp, t.co, 4)) break;
        s.apply(BEGINNER.cornerTrigger);
      }
      continue;
    }
    k = [0, 1, 2, 3].find((k) => {
      const t = s.clone().apply(yTurn(k)).cubie();
      return !cornerOk(t.cp, t.co, 4);
    }) as number;
    s.apply(yTurn(k)).apply(BEGINNER.cornerTrigger);
  }
}

/** 둘째 층 모서리(초보자 방법) */
function middleEdges(s: Solve): void {
  const ok = (ep: number[], eo: number[], i: number) =>
    ep[i] === i && eo[i] === 0;
  for (let iter = 0; ; iter++) {
    guard(iter, 20, "둘째 층");
    s.look();
    const c = s.cubie();
    if ([8, 9, 10, 11].every((i) => ok(c.ep, c.eo, i))) return;
    let placed = false;
    // 위층에서 노란색 없는 모서리를 찾아, 앞 스티커가 앞 가운데와 같은 색이 되게 맞춘다
    for (let k = 0; k < 4 && !placed; k++) {
      for (let a = 0; a < 4 && !placed; a++) {
        const t = s.clone().apply(yTurn(k)).apply(uTurn(a));
        const rel = t.rel();
        if ((t.cubie().ep[1] as number) >= 8 && rel[19] === "F") {
          s.apply(yTurn(k)).apply(uTurn(a));
          s.apply(rel[7] === "R" ? BEGINNER.edgeRight : BEGINNER.edgeLeft);
          placed = true;
        }
      }
    }
    if (placed) continue;
    // 위층에 없으면 잘못 든 모서리를 앞 오른쪽으로 돌려 꺼낸다
    const k = [0, 1, 2, 3].find((k) => {
      const t = s.clone().apply(yTurn(k)).cubie();
      return !ok(t.ep, t.eo, 8);
    }) as number;
    s.apply(yTurn(k)).apply(BEGINNER.edgeRight);
  }
}

/** 노란 십자(초보자): 가로줄이면 F R U R' U' F', ㄱ자(뒤·왼쪽)면 F U R U' R' F', 점이면 아무 쪽에서 */
function yellowCross(s: Solve): void {
  for (let iter = 0; ; iter++) {
    guard(iter, 5, "노란 십자");
    s.look();
    if (topEdgesOriented(s.rel())) return;
    let done = false;
    for (let a = 0; a < 4 && !done; a++) {
      const r = s.clone().apply(uTurn(a)).rel();
      const up = (i: number) => r[i] === "U";
      if (up(3) && up(5) && !up(1) && !up(7)) {
        s.apply(uTurn(a)).apply(BEGINNER.crossLine);
        done = true;
      } else if (up(1) && up(3) && !up(5) && !up(7)) {
        s.apply(uTurn(a)).apply(BEGINNER.crossL);
        done = true;
      }
    }
    if (!done) s.apply(BEGINNER.crossLine);
  }
}

/**
 * 노란 면(초보자, 수네만). 앞 왼쪽 위 꼭짓점을 보고 U를 맞춘다:
 * 맞은 꼭짓점이 하나면 그것을, 없으면 노란색이 왼쪽을 보는 것을, 둘이면 노란색이 앞을 보는 것을.
 */
function yellowFace(s: Solve): void {
  const n = s.n;
  const tops = cornerFacelets(n)
    .slice(0, 4)
    .map((c) => c[0] as number);
  const [ufU, ufF, ufL] = cornerFacelets(n)[1] as [number, number, number];
  for (let iter = 0; ; iter++) {
    guard(iter, 8, "노란 면");
    s.look();
    const rel = s.rel();
    if (topOriented(rel, n)) return;
    const count = tops.filter((i) => rel[i] === "U").length;
    const want = count === 1 ? ufU : count === 0 ? ufL : ufF;
    const a = [0, 1, 2, 3].find(
      (a) => s.clone().apply(uTurn(a)).rel()[want] === "U",
    );
    s.apply(uTurn(a ?? 0)).apply(BEGINNER.sune);
  }
}

/** 위 꼭짓점 자리(초보자): 같은 색 두 개(전조등)를 뒤에 두고 공식, 없으면 아무 데서나 */
function topCorners(s: Solve): void {
  const n = s.n;
  const nn = n * n;
  for (let iter = 0; ; iter++) {
    guard(iter, 4, "위 꼭짓점 자리");
    s.look();
    if (topCornersPermuted(s.rel(), n)) return;
    const a = [0, 1, 2, 3].find((a) => {
      const r = s.clone().apply(uTurn(a)).rel();
      return r[5 * nn] === r[5 * nn + n - 1];
    });
    s.apply(uTurn(a ?? 0)).apply(BEGINNER.cornerSwap);
  }
}

/** 윗층 꼭짓점을 옆 가운데에 맞추는 U */
function alignTop(s: Solve): void {
  const nn = s.n * s.n;
  const a = [0, 1, 2, 3].find((a) => {
    const r = s.clone().apply(uTurn(a)).rel();
    return r[2 * nn] === "F" && r[nn] === "R";
  });
  s.apply(uTurn(a ?? 0));
}

/** 위 모서리 자리(초보자): 다 맞은 면을 뒤로 돌려 쥐고 공식 */
function topEdges(s: Solve): void {
  alignTop(s);
  for (let iter = 0; ; iter++) {
    guard(iter, 4, "위 모서리 자리");
    s.look();
    if (s.isSolved()) return;
    const k = [0, 1, 2, 3].find((k) => {
      const r = s.clone().apply(yTurn(k)).rel();
      return r[45] === "B" && r[46] === "B" && r[47] === "B";
    });
    s.apply(yTurn(k ?? 0)).apply(BEGINNER.edgeCycle);
  }
}

// ---------- F2L(고수) ----------

const PAIR_NAMES: readonly StageName[] = ["f2l-1", "f2l-2", "f2l-3", "f2l-4"];

/**
 * F2L 네 쌍. 남은 쌍마다 "이미 맞춘 십자·쌍을 지키며 이 쌍을 넣는 가장 짧은 수"를
 * 길이 0부터 함께 찾아, 가장 짧게 끝나는 쌍부터 넣는다(사람이 쉬운 쌍을 먼저 찾는 것과 같다).
 */
function f2lPairs(s: Solve): void {
  insertBySearch(s, true, PAIR_NAMES);
}

/**
 * 십자와 이미 넣은 것을 지키며 쉬운 것부터 하나씩 넣는다.
 * `pairs`면 꼭짓점·모서리 쌍(F2L), 아니면 첫 층 꼭짓점만(중수). `names`가 있으면 하나마다 단계로 묶는다.
 */
function insertBySearch(
  s: Solve,
  pairs: boolean,
  names: readonly StageName[] | null,
): void {
  const done: number[] = [];
  for (let step = 0; step < 4; step++) {
    s.look();
    const remaining = [0, 1, 2, 3].filter((p) => !done.includes(p));
    let found: { pair: number; path: number[] } | null = null;
    for (let depth = 0; depth <= 16 && !found; depth++) {
      for (const pair of remaining) {
        const tracked: Tracked[] = CROSS_EDGES.map((piece) => ({
          kind: "e",
          piece,
        }));
        const hs = [heuristic(tracked, [0, 1, 2, 3])];
        for (const q of [...done, pair]) {
          if (pairs) {
            tracked.push(
              { kind: "c", piece: 4 + q },
              { kind: "e", piece: 8 + q },
            );
            hs.push(
              heuristic(tracked, [tracked.length - 2, tracked.length - 1]),
            );
          } else {
            tracked.push({ kind: "c", piece: 4 + q });
            hs.push(heuristic(tracked, [tracked.length - 1]));
          }
        }
        const path = idaSearch(
          coordsOf(s.cubie(), tracked),
          tracked,
          hs,
          NO_D_MOVES,
          { depth },
        );
        if (path) {
          found = { pair, path };
          break;
        }
      }
    }
    if (!found) throw new Error("넣을 수를 찾지 못했다");
    applyPath(s, found.path);
    done.push(found.pair);
    const name = names?.[step];
    if (name) s.stage(name);
  }
}

// ---------- 3×3 해법 ----------

const f2lOk = (s: Solve) => lowerSolved(s.rel(), s.n);

function start3(state: PuzzleState): Solve {
  return new Solve(3, toFacelets(3, state));
}

/**
 * 3×3 사람 해법을 차례(`Step`)로 둔다. 함수는 3×3 수를 두고, 글자 칸("oll-parity"·"pll-parity")은
 * 4×4에서 사람이 패리티를 알아차리는 자리다(OLL 앞·PLL 앞). 3×3에서는 그냥 지나간다.
 * 4×4·5×5 해법(`big.ts`)이 같은 차례를 축소가 끝난 큐브에 그대로 쓴다.
 */
export type ParityCheck = "oll-parity" | "pll-parity";
export type Step = ((s: Solve) => void) | ParityCheck;

/** 층별 첫 두 층. 중수(`smartCorners`)는 꼭짓점을 되풀이 공식 대신 짧은 수로 넣는다 */
function firstTwoLayersBeginner(s: Solve, smartCorners = false): void {
  whiteDown(s);
  crossOneByOne(s);
  s.stage("cross");
  if (smartCorners) insertBySearch(s, false, null);
  else firstLayerCorners(s);
  s.stage("corners");
  middleEdges(s);
  s.stage("middle");
}

/** 입문: 층별 맞추기(초보자 공식만) */
export const BEGINNER3_STEPS: readonly Step[] = [
  (s) => firstTwoLayersBeginner(s),
  "oll-parity",
  (s) => {
    yellowCross(s);
    s.stage("eo");
    yellowFace(s);
    s.stage("co");
  },
  "pll-parity",
  (s) => {
    topCorners(s);
    s.stage("cp");
    topEdges(s);
    s.stage("ep");
  },
];

/**
 * 중수: 층별 + 짧은 공식. 첫 층 꼭짓점은 되풀이 공식 대신 짧은 수로 넣고(익숙해진 사람처럼),
 * 윗층은 2단계 OLL(십자 3·꼭짓점 7)·2단계 PLL(꼭짓점 2·모서리 4).
 */
export const INTERMEDIATE3_STEPS: readonly Step[] = [
  (s) => firstTwoLayersBeginner(s, true),
  "oll-parity",
  (s) => {
    applyMatch(s, EO_2LOOK, (t) => f2lOk(t) && topEdgesOriented(t.rel()));
    s.stage("eo");
    applyMatch(s, OCLL, (t) => f2lOk(t) && topOriented(t.rel(), 3));
    s.stage("co");
  },
  "pll-parity",
  (s) => {
    applyMatch(
      s,
      CPLL,
      (t) =>
        f2lOk(t) && topOriented(t.rel(), 3) && topCornersPermuted(t.rel(), 3),
    );
    s.stage("cp");
    applyMatch(s, EPLL, (t) => t.isSolved(), true);
    s.stage("ep");
  },
];

const PLL_ALGS = PLL.map(([, alg]) => alg);

/** 고수: CFOP(십자, F2L 네 쌍, OLL 57, PLL 21) */
export const CFOP_STEPS: readonly Step[] = [
  (s) => {
    whiteDown(s);
    crossOptimal(s);
    s.stage("cross");
    f2lPairs(s);
  },
  "oll-parity",
  (s) => {
    applyMatch(s, OLL, (t) => f2lOk(t) && topOriented(t.rel(), 3));
    s.stage("oll");
  },
  "pll-parity",
  (s) => {
    applyMatch(s, PLL_ALGS, (t) => t.isSolved(), true);
    s.stage("pll");
  },
];

/** 3×3에서는 패리티 칸을 건너뛰고 차례대로 둔다 */
function run3(steps: readonly Step[], state: PuzzleState): HumanSolve {
  const s = start3(state);
  for (const step of steps) if (typeof step === "function") step(s);
  return finish(s);
}

/** 3×3 입문: 층별 맞추기(초보자 공식만) */
export function solveBeginner3(state: PuzzleState): HumanSolve {
  return run3(BEGINNER3_STEPS, state);
}

/** 3×3 중수: 층별 + 2단계 OLL·PLL */
export function solveIntermediate3(state: PuzzleState): HumanSolve {
  return run3(INTERMEDIATE3_STEPS, state);
}

/** 3×3 고수: CFOP(십자, F2L 네 쌍, OLL 57, PLL 21) */
export function solveCfop(state: PuzzleState): HumanSolve {
  return run3(CFOP_STEPS, state);
}

/** 3×3 초고수: 2단계 해법(사람을 넘는 짧은 해) */
export function solveExpert3(state: PuzzleState): HumanSolve {
  const s = start3(state);
  s.apply(solve3x3(s.rel()));
  s.stage("solve");
  return finish(s);
}

// ---------- 2×2 ----------

/**
 * 2×2 기준 방향: 흰 꼭짓점 하나(아래층에 있으면 그것)를 "아래 앞 오른쪽" 조각으로 본다.
 * 그 조각의 스티커를 흰색부터 시계 방향으로 읽으면 (아래, 앞, 오른쪽) 색이다.
 */
function start2(state: PuzzleState): Solve {
  const f = toFacelets(2, state);
  const slots = cornerFacelets(2);
  const order = [4, 5, 6, 7, 0, 1, 2, 3];
  for (const slot of order) {
    const t = (slots[slot] as number[]).map((i) => f[i] as Face);
    const w = t.indexOf("U");
    if (w < 0) continue;
    const down = t[w] as Face;
    const front = t[(w + 1) % 3] as Face;
    const right = t[(w + 2) % 3] as Face;
    const frame: Face[] = [...FACES];
    frame[3] = down;
    frame[2] = front;
    frame[1] = right;
    frame[0] = OPPOSITE[down];
    frame[5] = OPPOSITE[front];
    frame[4] = OPPOSITE[right];
    return new Solve(2, f, frame);
  }
  throw new Error("흰 꼭짓점을 찾지 못했다");
}

/** 2×2 첫 층을 가장 짧게(고수) */
function firstLayerOptimal(s: Solve): void {
  const tracked: Tracked[] = [4, 5, 6, 7].map((piece) => ({
    kind: "c",
    piece,
  }));
  const hs = [heuristic(tracked, [0, 1, 2, 3])];
  const path = idaSearch(coordsOf(s.cubie(), tracked), tracked, hs, ALL_MOVES);
  if (!path) throw new Error("첫 층을 찾지 못했다");
  applyPath(s, path);
}

function lastLayer2(s: Solve): void {
  applyMatch(s, OCLL_2X2, (t) => f2lOk(t) && topOriented(t.rel(), 2));
  s.stage("oll");
  applyMatch(s, CPLL, (t) => t.isSolved(), true);
  s.stage("pll");
}

/** 2×2 입문: 첫 층 → 윗면(수네) → 윗층 자리 */
export function solveBeginner2(state: PuzzleState): HumanSolve {
  const s = start2(state);
  firstLayerCorners(s);
  s.stage("first-layer");
  yellowFace(s);
  s.stage("co");
  topCorners(s);
  alignTop(s);
  if (!s.isSolved()) throw new Error("2×2 윗층이 맞지 않았다");
  s.stage("cp");
  return finish(s);
}

/** 2×2 중수: 첫 층(초보자) → 윗면 공식 7개 → 윗층 공식 2개 */
export function solveIntermediate2(state: PuzzleState): HumanSolve {
  const s = start2(state);
  firstLayerCorners(s);
  s.stage("first-layer");
  lastLayer2(s);
  return finish(s);
}

/** 2×2 고수: 가장 짧은 첫 층 → 윗면 공식 7개 → 윗층 공식 2개 */
export function solveAdvanced2(state: PuzzleState): HumanSolve {
  const s = start2(state);
  firstLayerOptimal(s);
  s.stage("first-layer");
  lastLayer2(s);
  return finish(s);
}

/** 2×2 초고수: 최적 해(11수 안) */
export function solveExpert2(state: PuzzleState): HumanSolve {
  const s = start2(state);
  s.apply(solve2x2(s.f.join("")));
  s.stage("solve");
  return finish(s);
}

function finish(s: Solve): HumanSolve {
  if (!s.isSolved()) throw new Error("다 맞추지 못했다");
  return s.result();
}

/** 단계·크기로 해법 고르기(2×2~5×5). 4×4·5×5는 축소법 뒤 같은 단계의 3×3 해법 */
export function solveHuman(
  level: BotLevel,
  size: number,
  state: PuzzleState,
): HumanSolve {
  if (size === 3) {
    if (level === "beginner") return solveBeginner3(state);
    if (level === "intermediate") return solveIntermediate3(state);
    if (level === "advanced") return solveCfop(state);
    return solveExpert3(state);
  }
  if (size === 2) {
    if (level === "beginner") return solveBeginner2(state);
    if (level === "intermediate") return solveIntermediate2(state);
    if (level === "advanced") return solveAdvanced2(state);
    return solveExpert2(state);
  }
  if (size === 4 || size === 5) {
    if (level === "beginner")
      return solveBigHuman(BEGINNER3_STEPS, size, state);
    if (level === "intermediate")
      return solveBigHuman(INTERMEDIATE3_STEPS, size, state);
    if (level === "advanced") return solveBigHuman(CFOP_STEPS, size, state);
    return solveBigExpert(size, state);
  }
  throw new RangeError(`${size}×${size} 컴퓨터는 아직 없다`);
}
