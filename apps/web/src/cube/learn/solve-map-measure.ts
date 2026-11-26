// 해법 지도의 평균 수 재기(solve-map.ts MAP_MEASURE). 시험(solve-map.test.ts)만 부른다: 화면은 남긴 숫자를 읽는다.
// 대회 섞기(cube-scramble "333") 씨앗마다 해법을 끝까지 돌려 길마다 친 수를 센다(ll-compare.ts turnCount:
// x·y·z는 빼고 U2·M도 한 수). 초보자·2단계·ZZ는 단원 규칙, CFOP·루는 컴퓨터 해법(@game/cube-ai).
import { type HumanSolve, solveCfop, solveRoux } from "@game/cube-ai";
import { isRotation, parseMoves, solvedCube } from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import type { PuzzleState } from "@game/puzzle-core";

import { type PathStageId, play, runStage, stepMoves } from "./beginner-path";
import {
  BEGINNER_222_STAGES,
  FROM333_222_STAGES,
  play as play222,
  solve222,
} from "./beginner-path-222";
import { type Edge5Step, runEdges555, stepMoves5 } from "./big-edges-555";
import {
  type BigPathStep,
  playN,
  runCenters,
  runEdges444,
  stepMovesBig,
} from "./big-path";
import { solveReduced } from "./big-solve";
import { yellowCrossByFormula } from "./ll-compare";
import type { MapMethodId } from "./solve-map";
import {
  runTwistFirstStage,
  type TwistFirstStageId,
  twistFirstMoves,
} from "./twist-first-path";
import { solveYau, type YauStageId } from "./yau-solve";
import { runZzLl, solveZzByRules, stepMovesLl } from "./zz-path";

/** 한 판: 길 id → 그 길에서 친 수(공백으로 이은 표기) */
type Run = Record<string, string>;

const join = (xs: string[]) => xs.filter(Boolean).join(" ");

function beginnerLower(s0: PuzzleState): { s: PuzzleState; run: Run } {
  let s = s0;
  const run: Run = {};
  const legs: [string, PathStageId][] = [
    ["cross", "cross"],
    ["first-corners", "corners"],
    ["second-layer", "second"],
  ];
  for (const [edge, id] of legs) {
    const flip = id === "second" ? "z2" : "";
    s = play(s, flip);
    const r = runStage(id, s);
    s = r.state;
    run[edge] = join([flip, ...r.steps.map(stepMoves)]);
  }
  return { s, run };
}

/** 2단계 OLL·PLL(ZZ·페트루스와 같은 runZzLl)의 세 길 */
function twoLookFrom(s: PuzzleState): Run {
  const rest = runZzLl(s);
  const by = (...stages: string[]) =>
    join(rest.steps.filter((x) => stages.includes(x.stage)).map(stepMovesLl));
  return {
    "two-look-face": by("oll"),
    "two-look-corners": by("pll-corners"),
    "two-look-edges": by("align", "pll-edges"),
  };
}

function bySolver(sol: HumanSolve, legs: [string, string[]][]): Run {
  return Object.fromEntries(
    legs.map(([edge, names]) => [
      edge,
      join(
        sol.stages
          .filter((x) => names.includes(x.name))
          .map((x) => sol.moves.slice(x.start, x.end).join(" ")),
      ),
    ]),
  );
}

const RUNS: Partial<Record<MapMethodId, (text: string) => Run>> = {
  beginner: (text) => {
    const { s: start, run } = beginnerLower(play(solvedCube(3), text));
    let s = start;
    const legs: [string, PathStageId][] = [
      ["beginner-yellow-cross", "yellow-cross"],
      ["beginner-edges", "edges"],
      ["beginner-corner-place", "corner-place"],
      ["beginner-corner-twist", "corner-twist"],
    ];
    for (const [edge, id] of legs) {
      const r = runStage(id, s);
      s = r.state;
      run[edge] = join(r.steps.map(stepMoves));
    }
    return run;
  },
  "beginner-twist-first": (text) => {
    const { s: start, run } = beginnerLower(play(solvedCube(3), text));
    let s = start;
    for (const [edge, id] of [
      ["beginner-yellow-cross", "yellow-cross"],
      ["beginner-edges", "edges"],
    ] as const) {
      const r = runStage(id, s);
      s = r.state;
      run[edge] = join(r.steps.map(stepMoves));
    }
    const legs: [string, TwistFirstStageId][] = [
      ["twist-first", "twist"],
      ["twist-first-place", "place"],
    ];
    for (const [edge, id] of legs) {
      const r = runTwistFirstStage(id, s);
      s = r.state;
      run[edge] = join(r.steps.map(twistFirstMoves));
    }
    return run;
  },
  "two-look": (text) => {
    const { s, run } = beginnerLower(play(solvedCube(3), text));
    const cross = yellowCrossByFormula(s);
    return { ...run, "two-look-cross": cross, ...twoLookFrom(play(s, cross)) };
  },
  cfop: (text) =>
    bySolver(solveCfop(play(solvedCube(3), text)), [
      ["cross", ["cross"]],
      // 짝 넷을 한 걸음으로(컴퓨터 해법의 짝 단계 넷을 이어 센다)
      ["f2l", ["f2l-1", "f2l-2", "f2l-3", "f2l-4"]],
      ["oll", ["oll"]],
      ["pll", ["pll"]],
    ]),
  // 루 컴퓨터 해법은 CMLL을 한 번에 푼다(두 걸음으로 나누지 않음): 위 코너 방향·자리 두 길은 따로 재지 못해 함께 둔다
  roux: (text) =>
    bySolver(solveRoux(play(solvedCube(3), text)), [
      ["roux-fb", ["fb"]],
      ["roux-sb", ["sb"]],
      ["cmll", ["cmll"]],
      ["lse-eo", ["lse-eo"]],
      ["lse-ulur", ["lse-ulur"]],
      ["lse-ep", ["lse-ep"]],
    ]),
  zz: (text) => {
    const z = solveZzByRules(text);
    // z.eoline은 흰 면 아래로 쥐는 z2부터다
    const s = play(
      play(solvedCube(3), text),
      join([z.eoline, z.left, z.right]),
    );
    return {
      eoline: z.eoline,
      "zz-blocks": join([z.left, z.right]),
      ...twoLookFrom(s),
    };
  },
};

// ── 2×2 ─────────────────────────────────────────────

/** 2×2 단원 규칙(beginner-path-222.ts)으로 단계마다 친 수 */
function run222(
  text: string,
  stages: typeof BEGINNER_222_STAGES,
  edges: string[],
): Run {
  const r = solve222(play222(solvedCube(2), text), stages);
  return Object.fromEntries(edges.map((e, i) => [e, r.moves[i] ?? ""]));
}

// ── 4×4·5×5: 앞부분(단원 규칙) + 3×3처럼(축소법 풀이 solveReduced, 초보자 마무리) ─────────

/** 패리티 고리의 수(길이 아니라 「3×3 맞추기」 칸 옆 고리라 길별 평균에는 넣지 않는다) */
const PARITY_KEY = { oll: "parity:oll", pll: "parity:pll" } as const;

/** solveReduced(초보자 규칙)를 「3×3 맞추기」 칸과 패리티 고리 둘로 나눈다 */
function tailRun(n: 4 | 5, start: PuzzleState, edge333: string): Run {
  const r = solveReduced(n, start);
  const run: Run = { [edge333]: "" };
  if (n === 4) {
    run[PARITY_KEY.oll] = "";
    run[PARITY_KEY.pll] = "";
  }
  for (const st of r.stages) {
    const key =
      st.id === "oll-parity"
        ? PARITY_KEY.oll
        : st.id === "pll-parity"
          ? PARITY_KEY.pll
          : edge333;
    run[key] = join([run[key] ?? "", st.moves]);
  }
  return run;
}

const reduction = (n: 4 | 5, lowerEdge: string) => (text: string) => {
  let s = playN(n, solvedCube(n), text);
  const centers = runCenters(n, s);
  s = centers.state;
  const edges = n === 4 ? runEdges444(s) : runEdges555(s);
  s = edges.state;
  return {
    [`${n}${n}${n}-centers`]: join(centers.steps.map(stepMovesBig)),
    [`${n}${n}${n}-edges`]: join(
      n === 4
        ? (edges.steps as BigPathStep[]).map(stepMovesBig)
        : (edges.steps as Edge5Step[]).map(stepMoves5),
    ),
    ...tailRun(n, s, lowerEdge),
  };
};

const YAU_EDGES: [string, YauStageId][] = [
  ["yau-ud-centers", "centers-ud"],
  ["yau-cross3", "cross3"],
  ["yau-side-centers", "centers-rest"],
  ["yau-last-cross", "last-cross"],
  ["yau-edges", "edges"],
];

const yau = (lowerEdge: string) => (text: string) => {
  const start = playN(4, solvedCube(4), text);
  const sol = solveYau(start);
  const run: Run = {};
  let s = start;
  for (const [edge, id] of YAU_EDGES) {
    const m = sol.stages.find((x) => x.id === id)?.moves ?? "";
    run[edge] = m;
    s = playN(4, s, m);
  }
  return { ...run, ...tailRun(4, s, lowerEdge) };
};

/** 해법마다: 큐브 크기·섞기 종목·한 판 재기 */
const RUNS_BY: Partial<
  Record<
    MapMethodId,
    {
      n: number;
      event: "222" | "333" | "444" | "555";
      f: (text: string) => Run;
    }
  >
> = {
  ...Object.fromEntries(
    Object.entries(RUNS).map(([id, f]) => [id, { n: 3, event: "333", f }]),
  ),
  "222-beginner": {
    n: 2,
    event: "222",
    f: (t) =>
      run222(t, BEGINNER_222_STAGES, [
        "222-first-layer",
        "222-top-face",
        "222-top-layer",
      ]),
  },
  "222-from333": {
    n: 2,
    event: "222",
    f: (t) =>
      run222(t, FROM333_222_STAGES, [
        "222-first-layer",
        "222-corner-place",
        "222-corner-twist",
      ]),
  },
  "444-reduction": {
    n: 4,
    event: "444",
    f: reduction(4, "444-reduction:333"),
  },
  "444-yau": { n: 4, event: "444", f: yau("444-yau:333") },
  "555-reduction": {
    n: 5,
    event: "555",
    f: reduction(5, "555-reduction:333"),
  },
};

/** 친 수(큐브 전체 돌리기 x·y·z는 빼고 한 층·여러 층 돌리기 모두 한 수) */
function turnCountN(n: number, steps: string[]): number {
  return steps.reduce(
    (sum, alg) =>
      sum + parseMoves(n, alg).filter((m) => !isRotation(n, m)).length,
    0,
  );
}

/** 섞기 하나를 해법으로 끝까지: 길 id → 친 수. 잴 길이 없는 해법은 빈 것 */
export function methodRun(id: MapMethodId, text: string): Run {
  return RUNS_BY[id]?.f(text) ?? {};
}

export interface MapMeasure {
  seeds: number;
  /** 해법마다 끝까지 친 수의 평균(반올림). 모든 길을 잰 해법만 */
  turns: Partial<Record<MapMethodId, number>>;
  /**
   * 해법마다 길별 평균(반올림). 루의 `cmll`은 위 코너 방향·자리 두 길을 합친 값. 4×4 패리티 길은 패리티가 없던
   * 판도 0수로 넣은 평균이다
   */
  steps: Partial<Record<MapMethodId, Record<string, number>>>;
  /** 4×4 축소법 판에서 패리티가 나온 비율(%)과 나왔을 때 친 수의 평균 */
  parity: {
    oll: { rate: number; turns: number };
    pll: { rate: number; turns: number };
  };
}

/** 씨앗 1~seeds로 잰다 */
export function measureMap(seeds: number): MapMeasure {
  const texts = new Map<string, string[]>();
  const textsOf = (event: "222" | "333" | "444" | "555") => {
    let hit = texts.get(event);
    if (!hit) {
      hit = Array.from(
        { length: seeds },
        (_, i) => scramble(event, i + 1).text,
      );
      texts.set(event, hit);
    }
    return hit;
  };
  const mean = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  const turns: MapMeasure["turns"] = {};
  const steps: MapMeasure["steps"] = {};
  const byId = new Map<MapMethodId, Run[]>();
  for (const [id, r] of Object.entries(RUNS_BY) as [
    MapMethodId,
    NonNullable<(typeof RUNS_BY)[MapMethodId]>,
  ][]) {
    const runs = textsOf(r.event).map(r.f);
    byId.set(id, runs);
    turns[id] = mean(runs.map((x) => turnCountN(r.n, Object.values(x))));
    // 패리티 고리는 길이 아니라 따로 센다(아래 parity)
    steps[id] = Object.fromEntries(
      Object.keys(runs[0] as Run)
        .filter((k) => !k.startsWith("parity:"))
        .map((edge) => [
          edge,
          mean(runs.map((x) => turnCountN(r.n, [x[edge] ?? ""]))),
        ]),
    );
  }
  const red = byId.get("444-reduction") ?? [];
  const parityOf = (edge: string) => {
    const hit = red.filter((x) => x[edge]);
    return {
      rate: Math.round((hit.length / Math.max(1, red.length)) * 100),
      turns: mean(hit.map((x) => turnCountN(4, [x[edge] ?? ""]))),
    };
  };
  return {
    seeds,
    turns,
    steps,
    parity: {
      oll: parityOf(PARITY_KEY.oll),
      pll: parityOf(PARITY_KEY.pll),
    },
  };
}
