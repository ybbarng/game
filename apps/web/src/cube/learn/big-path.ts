// 4×4·5×5 센터와 4×4 마지막 엣지 짝 넷의 경우별 정해진 길(docs/47 16-15). 3×3은 beginner-path.ts, 2×2는 beginner-path-222.ts.
// 단계마다 지금 모양을 보고 경우 하나를 고르고, 그 경우의 쥐는 수와 공식을 낸다. 「될 때까지」가 없다:
// 센터는 공식 한 번에 넣을 면의 센터 블럭이 꼭 하나 늘고, 엣지는 공식 한 번에 앞-오른쪽 줄이 묶인다(뒤집기 뒤 한 번 더).
// 단원 글(lessons-big.ts)이 이 공식과 경우를 쓰고, 시험(big-path.test.ts)이 무작위 상태를 이 규칙만으로 끝내는지 본다.
import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

// ── 공식 ──────────────────────────────────────────────

/**
 * 센터 블럭 넣기(옆면 → 윗면): 앞면 오른쪽 아래 센터 블럭이 윗면으로 올라가고, 윗면 왼쪽 뒤 센터 블럭이 앞면으로 내려간다.
 * 윗면·앞면 말고는 센터 블럭이 그대로다(2R이 옮긴 아랫면·뒷면 줄은 2R'로 돌아온다). 5×5에서는 구석 쪽 센터 블럭에 쓴다
 */
export const CENTER_IN = "2R U 2R'";
/** 센터 블럭 넣기(아랫면 → 윗면): 아랫면 오른쪽 뒤 센터 블럭이 윗면으로, 윗면 왼쪽 뒤 센터 블럭이 아랫면으로 */
export const CENTER_IN_DOWN = "2R2 U 2R2";
/** 5×5 십자 쪽 센터 블럭 넣기(옆면 → 윗면): 앞면 아래 십자 칸 → 윗면 앞 십자 칸 → 앞면 왼쪽 십자 칸. 다른 센터 블럭은 그대로 */
export const CROSS_IN = "3R U 2L' U' 3R' U 2L U'";
/** 5×5 십자 쪽 센터 블럭 넣기(아랫면 → 윗면): 아랫면 뒤 십자 칸 → 윗면 앞 십자 칸 → 아랫면 왼쪽 십자 칸 */
export const CROSS_IN_DOWN = "3R2 U 2L2 U' 3R2 U 2L2 U'";
/** 엣지 뒤집기: 앞-오른쪽 줄의 두 날개가 위·아래 자리를 바꾼다. 위 층 엣지는 묶인 채 자리만 돈다 */
export const EDGE_FLIP = "R U R' F R' F' R";

// ── 단계와 경우 ───────────────────────────────────────

export type BigPathStageId =
  | "444-centers"
  | "555-centers"
  | "444-first-edges"
  | "444-last-edges";

export interface BigPathCase {
  id: string;
  /** 모양(눈으로 보는 것) */
  shape: string;
  /** 쥐는 법(공식 앞에 할 일) */
  hold: string;
  /** 칠 공식 */
  alg: string;
  /** 이 공식 뒤 넘어가는 경우(없으면 하나가 끝남) */
  next?: string;
}

/** 센터를 만드는 면 차례(색 번호: 흰0 빨1 초2 노3 주4 파5). 주황은 앞의 다섯을 맞추면 저절로 맞는다 */
export const CENTER_ORDER = [0, 3, 2, 1, 5] as const;
export const COLOR_NAMES = ["흰", "빨간", "초록", "노란", "주황", "파란"];

const CENTER_CASES: BigPathCase[] = [
  {
    id: "side",
    shape: "넣을 센터 블럭이 앞이나 뒤 옆면에 있음",
    hold: "그 면을 앞으로(y2), F로 그 블럭을 앞면 오른쪽 아래 칸에, U로 윗면 왼쪽 뒤 칸에 아직 맞지 않은 센터 블럭을",
    alg: CENTER_IN,
  },
  {
    id: "down",
    shape: "넣을 센터 블럭이 아랫면에 있음",
    hold: "D로 그 블럭을 아랫면 오른쪽 뒤 칸에, U로 윗면 왼쪽 뒤 칸에 아직 맞지 않은 센터 블럭을",
    alg: CENTER_IN_DOWN,
  },
];

const CROSS_CASES: BigPathCase[] = [
  {
    id: "cross-side",
    shape: "넣을 십자 쪽 센터 블럭이 앞이나 뒤 옆면에 있음",
    hold: "그 면을 앞으로(y2), F로 그 블럭을 앞면 아래 십자 칸에, U로 윗면 앞 십자 칸에 아직 맞지 않은 센터 블럭을",
    alg: CROSS_IN,
  },
  {
    id: "cross-down",
    shape: "넣을 십자 쪽 센터 블럭이 아랫면에 있음",
    hold: "D로 그 블럭을 아랫면 뒤 십자 칸에, U로 윗면 앞 십자 칸에 아직 맞지 않은 센터 블럭을",
    alg: CROSS_IN_DOWN,
  },
];

const EDGE_CASES: BigPathCase[] = [
  {
    id: "low",
    shape: "앞-오른쪽 줄 아래 날개의 짝이 다른 줄의 아래에 있음",
    hold: "Dw로 그 짝을 앞-오른쪽 아래로(앞-왼쪽이면 Dw, 뒤-오른쪽이면 Dw', 뒤-왼쪽이면 Dw2)",
    alg: `Dw ${EDGE_FLIP} Dw'`,
  },
  {
    id: "high",
    shape: "앞-오른쪽 줄 위 날개의 짝이 다른 줄의 위에 있음",
    hold: "Uw로 그 짝을 앞-오른쪽 위로(뒤-오른쪽이면 Uw, 앞-왼쪽이면 Uw', 뒤-왼쪽이면 Uw2)",
    alg: `Uw ${EDGE_FLIP} Uw'`,
  },
  {
    id: "flip",
    shape:
      "아래 날개의 짝은 다른 줄의 위에, 위 날개의 짝은 다른 줄의 아래에 있음",
    hold: "그대로",
    alg: EDGE_FLIP,
    next: "low",
  },
];

// 4×4 처음 엣지 여덟(파일 끝 nextFirstEdge)
/** 묶은 줄 올리기: 앞-오른쪽 → 위-앞, 위-뒤 → 앞-오른쪽(위 층의 다른 엣지는 자리만 돈다) */
export const STORE_UP = "R U R'";
/** 위 층에서 내리기: 위-뒤 → 앞-왼쪽(앞-왼쪽 엣지는 위 층으로) */
export const DROP_FROM_UP = "L' U' L";
/** 아래 층에서 내리기: 아래-뒤 → 앞-왼쪽(앞-왼쪽 엣지는 아래 층으로) */
export const DROP_FROM_DOWN = "L D L'";

export const FIRST_EDGE_CASES: BigPathCase[] = [
  {
    id: "store",
    shape: "앞-오른쪽 줄이 묶였고 위 층에 묶이지 않은 엣지가 있음",
    hold: "U로 위 층의 묶이지 않은 엣지를 위-뒤에",
    alg: STORE_UP,
  },
  {
    id: "turn-over",
    shape: "앞-오른쪽 줄이 묶였고 위 층 넷이 모두 묶인 엣지",
    hold: "그대로",
    alg: "x2",
    next: "store",
  },
  {
    id: "drop-up",
    shape:
      "앞-오른쪽 두 날개의 짝이 모두 가운데 줄에 없고, 아래 날개의 짝이 위 층에 있음",
    hold: "U로 그 짝이 든 엣지를 위-뒤에",
    alg: DROP_FROM_UP,
  },
  {
    id: "drop-down",
    shape:
      "앞-오른쪽 두 날개의 짝이 모두 가운데 줄에 없고, 아래 날개의 짝이 아래 층에 있음",
    hold: "D로 그 짝이 든 엣지를 아래-뒤에",
    alg: DROP_FROM_DOWN,
  },
];

export const BIG_PATH_CASES: Record<BigPathStageId, BigPathCase[]> = {
  "444-centers": CENTER_CASES,
  "555-centers": [...CENTER_CASES, ...CROSS_CASES],
  "444-first-edges": [...FIRST_EDGE_CASES, ...EDGE_CASES],
  "444-last-edges": EDGE_CASES,
};

export function bigPathCase(stage: BigPathStageId, id: string): BigPathCase {
  const c = BIG_PATH_CASES[stage].find((x) => x.id === id);
  if (!c) throw new Error(`경우 없음: ${stage} ${id}`);
  return c;
}

// ── 공통 ──────────────────────────────────────────────

export const playN = (n: number, s: PuzzleState, alg: string) =>
  alg.trim() ? applyMoves(n, s, parseMoves(n, alg)) : s;

const join = (...xs: string[]) =>
  xs.filter(Boolean).join(" ").trim().replace(/\s+/g, " ");

export type Pick = (count: number) => number;
const FIRST: Pick = () => 0;

const U = 0;
const R = 1;
const F = 2;
const D = 3;
const L = 4;
const B = 5;

function firstTurn(
  n: number,
  s: PuzzleState,
  turns: readonly string[],
  ok: (t: PuzzleState) => boolean,
): string {
  const t = turns.find((x) => ok(playN(n, s, x)));
  if (t === undefined) throw new Error("돌릴 방향을 찾지 못했다");
  return t;
}

export interface BigPathStep {
  stage: BigPathStageId;
  caseId: string;
  /** 쥐는 수(큐브 돌리기·면 돌리기) */
  hold: string;
  alg: string;
  /** 센터: 넣는 면의 색 */
  color?: number;
}

export const stepMovesBig = (st: BigPathStep) => join(st.hold, st.alg);

// ── 센터 ──────────────────────────────────────────────

/** 스티커 번호(면 × n² + 줄 × n + 칸, 면마다 바깥에서 볼 때 왼쪽 위가 0. 윗면은 앞면이 아래쪽, 아랫면은 앞면이 위쪽) */
const at = (n: number, f: number, r: number, c: number) =>
  f * n * n + r * n + c;

/** 센터 블럭 무리: 4×4는 넷 하나, 5×5는 구석 쪽 넷(x)과 십자 쪽 넷(t) */
type Orbit = "x" | "t";
function orbitCells(n: number, o: Orbit): [number, number][] {
  if (n === 4)
    return [
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ];
  return o === "x"
    ? [
        [1, 1],
        [1, 3],
        [3, 1],
        [3, 3],
      ]
    : [
        [1, 2],
        [2, 1],
        [2, 3],
        [3, 2],
      ];
}

/** 무리마다 공식이 쓰는 칸: 가져올 칸(앞면·아랫면)과 비울 윗면 칸 */
function orbitSpots(n: number, o: Orbit) {
  const last = n - 2;
  if (o === "x")
    return {
      from: [last, last] as const,
      to: [1, 1] as const,
      side: CENTER_IN,
      down: CENTER_IN_DOWN,
      sideCase: "side",
      downCase: "down",
    };
  return {
    from: [3, 2] as const,
    to: [3, 2] as const,
    side: CROSS_IN,
    down: CROSS_IN_DOWN,
    sideCase: "cross-side",
    downCase: "cross-down",
  };
}

/** 지금 쥔 방향에서 면마다 맞춘 상태의 색(맞춘 큐브에 같은 큐브 돌리기를 한 것) */
function frameColors(n: number, turns: string): number[] {
  const c = faceColors(n, playN(n, solvedCube(n), turns));
  return [0, 1, 2, 3, 4, 5].map((f) => c[f * n * n] as number);
}

const Y4 = ["", "y", "y'", "y2"];
const FACE4 = (f: "F" | "D" | "U") => ["", f, `${f}'`, `${f}2`];
const ROTATIONS = (() => {
  const out: string[] = [];
  for (const a of ["", "x", "x'", "x2", "z", "z'"])
    for (const b of Y4) out.push(join(a, b));
  return out;
})();

/**
 * 그 색 센터를 만들 때의 쥐기(흰 위·초록 앞에서): 그 색 면을 위로. 옆면 넷은 흰·노란 면을 왼쪽·오른쪽에(흰 면 오른쪽).
 * 흰색은 그대로, 노란색은 x2
 */
function holdOk(fc: number[], color: number): boolean {
  if (fc[U] !== color) return false;
  if (color === 0 || color === 3) return fc[F] === (color === 0 ? 2 : 5);
  return fc[R] === 0;
}
export function holdFor(n: number, color: number): string {
  return firstTurnRot(n, (fc) => holdOk(fc, color));
}
function firstTurnRot(
  n: number,
  ok: (fc: number[]) => boolean,
  before = "",
): string {
  const t = ROTATIONS.find((r) => ok(frameColors(n, join(before, r))));
  if (t === undefined) throw new Error("쥘 방향을 찾지 못했다");
  return t;
}

export interface CenterRun {
  state: PuzzleState;
  steps: BigPathStep[];
  /** 끝났을 때 쥔 방향(흰 위·초록 앞에서 한 큐브 돌리기 모두) */
  turns: string;
}

/**
 * 센터를 규칙대로 끝까지. 흰 위·초록 앞으로 쥔 상태에서 시작하고(4×4는 「지금 윗면을 흰 면, 앞면을 초록 면으로」 정한다),
 * 흰 → 노랑 → 초록 → 빨강 → 파랑 차례로 그 면을 위로 쥐고 하나씩 넣는다. 5×5는 면마다 구석 쪽 넷 → 십자 쪽 넷
 */
export function runCenters(
  n: 4 | 5,
  start: PuzzleState,
  pick: Pick = FIRST,
): CenterRun {
  const steps: BigPathStep[] = [];
  let s = start;
  let turns = "";
  const done: number[] = [];
  for (const color of CENTER_ORDER) {
    // 그 색 면을 위로: 지금 쥔 방향에서 바로 쥐는 돌리기를 찾는다
    const rot = firstTurnRot(n, (fc) => holdOk(fc, color), turns);
    s = playN(n, s, rot);
    turns = join(turns, rot);
    let first = true;
    for (const orbit of n === 4
      ? (["x"] as Orbit[])
      : (["x", "t"] as Orbit[])) {
      for (let guard = 0; ; guard++) {
        if (guard > 8) throw new Error("센터가 끝나지 않는다");
        const st = nextCenterStep(n, s, { color, turns, done, orbit }, pick);
        if (!st) break;
        s = playN(n, s, stepMovesBig(st));
        turns = join(turns, st.y);
        steps.push({
          stage: st.stage,
          caseId: st.caseId,
          hold: join(first ? rot : "", st.hold),
          alg: st.alg,
          color,
        });
        first = false;
      }
    }
    done.push(color);
  }
  return { state: s, steps, turns };
}

export interface CenterContext {
  /** 넣는 면의 색(그 면을 위로 쥐었다) */
  color: number;
  /** 흰 위·초록 앞에서 지금까지 한 큐브 돌리기 */
  turns: string;
  /** 다 맞춘 면의 색 */
  done: readonly number[];
  /** 5×5의 무리(구석 쪽 x·십자 쪽 t). 4×4는 x */
  orbit: Orbit;
}

/** 센터 한 걸음(그 무리가 다 들었으면 null). `y`는 쥐기 가운데 큐브 돌리기(다음 걸음의 쥔 방향에 더한다) */
export function nextCenterStep(
  n: 4 | 5,
  s: PuzzleState,
  ctx: CenterContext,
  pick: Pick = FIRST,
): (BigPathStep & { y: string }) | null {
  const { color, turns, done, orbit } = ctx;
  const stage: BigPathStageId = n === 4 ? "444-centers" : "555-centers";
  const cells = orbitCells(n, orbit);
  const sp = orbitSpots(n, orbit);
  const col = faceColors(n, s);
  const onFace = (f: number) =>
    cells.filter(([r, c]) => col[at(n, f, r, c)] === color).length;
  if (onFace(U) === 4) return null;
  const fc = frameColors(n, turns);
  const free = (f: number) =>
    fc[f] !== color && !done.includes(fc[f] as number);
  // 가져올 곳: 흰·노란 면을 만들 때는 옆면 넷, 그 밖에는 앞·뒤(흰·노란 면이 왼쪽·오른쪽), 그리고 아랫면
  const sources: { face: number; y: string }[] = [];
  for (const [face, y] of [
    [F, ""],
    [B, "y2"],
    [R, "y"],
    [L, "y'"],
  ] as const) {
    if ((face === R || face === L) && done.length >= 2) continue;
    if (free(face) && onFace(face) > 0) sources.push({ face, y });
  }
  if (free(D) && onFace(D) > 0) sources.push({ face: D, y: "" });
  if (sources.length === 0) throw new Error("가져올 센터 블럭이 없다");
  const src = sources[pick(sources.length)] as { face: number; y: string };
  const t1 = playN(n, s, src.y);
  const fromFace = src.face === D ? D : F;
  const f = firstTurn(
    n,
    t1,
    FACE4(src.face === D ? "D" : "F"),
    (t) => faceColors(n, t)[at(n, fromFace, sp.from[0], sp.from[1])] === color,
  );
  const u = firstTurn(
    n,
    playN(n, t1, f),
    FACE4("U"),
    (t) => faceColors(n, t)[at(n, U, sp.to[0], sp.to[1])] !== color,
  );
  return {
    stage,
    caseId: src.face === D ? sp.downCase : sp.sideCase,
    hold: join(src.y, f, u),
    alg: src.face === D ? sp.down : sp.side,
    color,
    y: src.y,
  };
}

// ── 4×4 마지막 엣지 짝 넷 ─────────────────────────────

type Slot = "FR" | "FL" | "BR" | "BL";
const SLOTS: Slot[] = ["FR", "FL", "BR", "BL"];
const SLOT_FACES: Record<Slot, [number, number]> = {
  FR: [F, R],
  FL: [F, L],
  BR: [B, R],
  BL: [B, L],
};

/** 가운데 줄 넷의 날개 조각 자리: [줄][위·아래] */
const WINGS_444: Record<Slot, [number, number]> = (() => {
  const topo = cubeTopology(4);
  const out = {} as Record<Slot, [number, number]>;
  for (const slot of SLOTS) {
    const faces = SLOT_FACES[slot];
    const wings = topo.pieces
      .map((p, i) => ({ p, i }))
      .filter(
        ({ p }) =>
          p.kind === "wing" &&
          p.stickers.length === 2 &&
          faces.every((f) =>
            p.stickers.some((st) => topo.stickers[st]?.face === f),
          ),
      )
      .sort((a, b) => b.p.position[1] - a.p.position[1]);
    out[slot] = [wings[0]?.i as number, wings[1]?.i as number];
  }
  return out;
})();

/** 날개 자리에 든 조각의 두 색(차례 없음) */
function wingColors(col: Uint8Array, piece: number): string {
  const topo = cubeTopology(4);
  return (topo.pieces[piece]?.stickers ?? [])
    .map((st) => col[st] as number)
    .sort()
    .join();
}

/** 가운데 줄 넷 가운데 묶인 줄(두 날개 색이 같음) */
export function pairedSlots(s: PuzzleState): Slot[] {
  const col = faceColors(4, s);
  return SLOTS.filter(
    (sl) =>
      wingColors(col, WINGS_444[sl][0]) === wingColors(col, WINGS_444[sl][1]),
  );
}

/** 앞-오른쪽 날개(위 0·아래 1)와 같은 색 날개가 다른 줄의 어디에 있나 */
function partnerOf(
  s: PuzzleState,
  level: 0 | 1,
): { slot: Slot; level: 0 | 1 } | null {
  const col = faceColors(4, s);
  const want = wingColors(col, WINGS_444.FR[level]);
  for (const slot of SLOTS) {
    if (slot === "FR") continue;
    for (const lv of [0, 1] as const)
      if (wingColors(col, WINGS_444[slot][lv]) === want)
        return { slot, level: lv };
  }
  return null;
}

const Y_TO_FR: Record<Slot, string> = { FR: "", FL: "y'", BR: "y", BL: "y2" };
/** 그 줄의 아래 날개를 Dw로 앞-오른쪽 아래로 */
const DW_TO_FR: Record<Slot, string> = {
  FR: "",
  FL: "Dw",
  BR: "Dw'",
  BL: "Dw2",
};
const UW_TO_FR: Record<Slot, string> = {
  FR: "",
  FL: "Uw'",
  BR: "Uw",
  BL: "Uw2",
};
const inv = (m: string) =>
  m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`;

/** 4×4 마지막 엣지 짝 넷의 다음 한 걸음(끝났으면 null). 묶인 엣지 여덟은 위·아래 층에 있어야 한다 */
export function nextLastEdge(
  s: PuzzleState,
  pick: Pick = FIRST,
): BigPathStep | null {
  const stage: BigPathStageId = "444-last-edges";
  const open = SLOTS.filter((sl) => !pairedSlots(s).includes(sl));
  if (open.length === 0) return null;
  // 앞-오른쪽이 이미 묶이지 않은 줄이면 그대로 쓴다(쥐기를 줄인다)
  const slot = open.includes("FR") ? "FR" : (open[pick(open.length)] as Slot);
  const y = Y_TO_FR[slot];
  const t = playN(4, s, y);
  const low = partnerOf(t, 1);
  if (low && low.level === 1) {
    const dw = DW_TO_FR[low.slot];
    return {
      stage,
      caseId: "low",
      hold: y,
      alg: join(dw, EDGE_FLIP, inv(dw)),
    };
  }
  const high = partnerOf(t, 0);
  if (high && high.level === 0) {
    const uw = UW_TO_FR[high.slot];
    return {
      stage,
      caseId: "high",
      hold: y,
      alg: join(uw, EDGE_FLIP, inv(uw)),
    };
  }
  return { stage, caseId: "flip", hold: y, alg: EDGE_FLIP };
}

export function runLastEdges(
  s: PuzzleState,
  pick: Pick = FIRST,
  limit = 12,
): { state: PuzzleState; steps: BigPathStep[] } {
  const steps: BigPathStep[] = [];
  let state = s;
  for (;;) {
    const st = nextLastEdge(state, pick);
    if (!st) return { state, steps };
    steps.push(st);
    if (steps.length > limit) throw new Error("엣지 짝이 끝나지 않는다");
    state = playN(4, state, stepMovesBig(st));
  }
}

export const LAST_EDGE_WINGS = WINGS_444;

// ── 4×4 처음 엣지 여덟(2026-11-10) ─────────────────────
// 묶을 줄은 늘 앞-오른쪽. 묶으면 R U R'로 위 층에 올려 모으고(위 층의 묶이지 않은 엣지를 위-뒤에 두면 그 엣지가
// 앞-오른쪽으로 내려온다), 위 층이 묶인 엣지로 차면 x2로 뒤집어 새 위 층을 채운다. 짝 날개가 가운데 줄에 없으면
// 위 층(U로 위-뒤 → L' U' L)이나 아래 층(D로 아래-뒤 → L D L')에서 앞-왼쪽 줄로 내린다. 위·아래 층에 묶이지 않은
// 엣지가 없어지면 마지막 넷(nextLastEdge)이다. 바깥 층만 돌리는 수는 엣지 짝을 풀지 않고, Dw·Uw 경우는 앞-오른쪽
// 위 날개와 다른 줄 아래(위) 날개만 맞바꿔 묶인 줄을 풀지 않는다.

/** 4×4 엣지 줄 열둘(두 면)과 그 줄의 날개 둘(위·앞쪽 먼저가 아니라 높이 순, 가로 줄은 둘 다 같은 높이) */
type Line = { name: string; wings: [number, number] };
const LINES_444: Line[] = (() => {
  const topo = cubeTopology(4);
  const names: [string, number, number][] = [
    ["UF", U, F],
    ["UR", U, R],
    ["UB", U, B],
    ["UL", U, L],
    ["DF", D, F],
    ["DR", D, R],
    ["DB", D, B],
    ["DL", D, L],
    ["FR", F, R],
    ["FL", F, L],
    ["BR", B, R],
    ["BL", B, L],
  ];
  return names.map(([name, a, b]) => {
    const wings = topo.pieces
      .map((p, i) => ({ p, i }))
      .filter(
        ({ p }) =>
          p.kind === "wing" &&
          p.stickers.length === 2 &&
          [a, b].every((f) =>
            p.stickers.some((st) => topo.stickers[st]?.face === f),
          ),
      )
      .sort((x, y) => y.p.position[1] - x.p.position[1]);
    return {
      name,
      wings: [wings[0]?.i as number, wings[1]?.i as number],
    };
  });
})();
const lineByName = (name: string) =>
  LINES_444.find((l) => l.name === name) as Line;

function linePaired444(col: Uint8Array, line: Line): boolean {
  return wingColors(col, line.wings[0]) === wingColors(col, line.wings[1]);
}

/** 위·아래 층의 묶이지 않은 줄 */
function openOuter(col: Uint8Array, layer: "U" | "D"): Line[] {
  return LINES_444.filter(
    (l) => l.name.startsWith(layer) && !linePaired444(col, l),
  );
}

/** 4×4 처음 엣지 여덟의 다음 한 걸음. 위·아래 층에 묶이지 않은 엣지가 없으면 null(마지막 넷으로) */
export function nextFirstEdge(s: PuzzleState): BigPathStep | null {
  const stage: BigPathStageId = "444-first-edges";
  const col = faceColors(4, s);
  if (openOuter(col, "U").length === 0 && openOuter(col, "D").length === 0)
    return null;
  const fr = lineByName("FR");
  if (linePaired444(col, fr)) {
    if (openOuter(col, "U").length === 0)
      return { stage, caseId: "turn-over", hold: "", alg: "x2" };
    const u = firstTurn(
      4,
      s,
      FACE4("U"),
      (t) => !linePaired444(faceColors(4, t), lineByName("UB")),
    );
    return { stage, caseId: "store", hold: u, alg: STORE_UP };
  }
  const partnerOfWing = (wing: number) => {
    const w = wingColors(col, wing);
    const line = LINES_444.find(
      (l) => l.name !== "FR" && l.wings.some((x) => wingColors(col, x) === w),
    );
    if (!line) throw new Error("짝 날개가 없다");
    return line;
  };
  const want = wingColors(col, fr.wings[1]);
  const partner = partnerOfWing(fr.wings[1]);
  const outside = (l: Line) => l.name[0] === "U" || l.name[0] === "D";
  const layer = partner.name[0] === "U" ? "U" : "D";
  // 두 날개의 짝이 모두 위·아래 층에 있을 때만 내린다(하나라도 가운데 줄이면 Dw·Uw·뒤집기)
  if (outside(partner) && outside(partnerOfWing(fr.wings[0]))) {
    const target = lineByName(layer === "U" ? "UB" : "DB");
    const turn = firstTurn(4, s, FACE4(layer), (t) => {
      const c = faceColors(4, t);
      return target.wings.some((w) => wingColors(c, w) === want);
    });
    return {
      stage,
      caseId: layer === "U" ? "drop-up" : "drop-down",
      hold: turn,
      alg: layer === "U" ? DROP_FROM_UP : DROP_FROM_DOWN,
    };
  }
  // 짝이 가운데 줄에 있으면 마지막 넷과 같은 세 경우(Dw·Uw·뒤집기)
  const st = nextLastEdge(s);
  if (!st) throw new Error("앞-오른쪽이 묶이지 않았는데 걸음이 없다");
  return { ...st, stage };
}

/** 센터가 맞은 4×4의 엣지 열둘을 규칙대로: 처음 여덟(올려 모으기) → 마지막 넷 */
export function runEdges444(
  s: PuzzleState,
  limit = 80,
): { state: PuzzleState; steps: BigPathStep[] } {
  const steps: BigPathStep[] = [];
  let state = s;
  for (;;) {
    const st = nextFirstEdge(state);
    if (!st) break;
    steps.push(st);
    if (steps.length > limit) throw new Error("처음 엣지가 끝나지 않는다");
    state = playN(4, state, stepMovesBig(st));
  }
  const last = runLastEdges(state);
  return { state: last.state, steps: [...steps, ...last.steps] };
}
