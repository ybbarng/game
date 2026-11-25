// 해법 지도(solve-map.ts) 자료를 엔진으로 확인한다.
// 1. 그래프: 해법마다 다 섞임에서 다 맞음까지 길이 이어지고, 단원 id가 실제 단원이다.
// 2. 공식 수: 길마다 공식 모음·단원 공식에서 센 값이다.
// 3. 지점 정의: 단원 규칙(또는 단원이 쓰는 공식)으로 앞 지점에서 다음 지점에 닿는다. 그림은 해법을 따라 맞은 칸이 늘기만 한다.
// 4. 평균 수: MAP_MEASURE가 지금 규칙·해법으로 잰 값이다.
import { solveCfop, solveRoux } from "@game/cube-ai";
import { faceColors, solvedCube } from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { ZZ_PAIRS } from "../practice/zz";
import { ALL_ALG_CASES } from "./alg-sets";
import { TWO_LOOK_OLL } from "./algs-2look";
import { PLL_CASES } from "./algs-pll";
import { type PathStageId, play, reps, runStage, TWIST } from "./beginner-path";
import {
  BEGINNER_222_STAGES,
  FROM333_222_STAGES,
  play as play222,
  solve222,
} from "./beginner-path-222";
import { playN } from "./big-path";
import { solveReduced } from "./big-solve";
import { COURSES } from "./courses";
import { goalMet, stateForRule } from "./judge";
import { yellowCrossByFormula } from "./ll-compare";
import {
  edgeById,
  lessonFor,
  MAP_EDGES,
  MAP_LANES,
  MAP_METHODS,
  MAP_NODES,
  MAP_PREP,
  MAP_SIZES,
  type MapEdge,
  type MapMethodId,
  type MapNodeId,
  methodFormulaCount,
  methodNodes,
  methodSize,
  newFormulas,
  nodeById,
  nodeMask,
  nodeSize,
  PARITY_AT,
  PARITY_FORMULAS,
  PARITY_LOOPS,
} from "./solve-map";
import { methodRun } from "./solve-map-measure";
import { runZzLl, solveZzByRules, stepMovesLl } from "./zz-path";

const lessons = new Map(
  COURSES.flatMap((c) => c.lessons.map((l) => [l.id, { l, course: c.id }])),
);
const method = (id: MapMethodId) =>
  MAP_METHODS.find((m) => m.id === id) as (typeof MAP_METHODS)[number];

/** 코너 여덟이 센터 기준 제자리·바른 방향(엣지는 보지 않는다) */
const cornersOnly = (s: PuzzleState) => {
  const c = faceColors(3, s);
  return [0, 1, 2, 3, 4, 5].every((f) =>
    [0, 2, 6, 8].every((k) => c[f * 9 + k] === c[f * 9 + 4]),
  );
};

/** 지점마다 판정(엔진 목표 이름으로). 짝 지점은 십자 + 맞은 F2L 칸 수 */
const PAIRS = ["FR", "FL", "BR", "BL"] as const;
const pairsDone = (s: PuzzleState) =>
  PAIRS.filter((p) => goalMet(3, s, `f2l-pair:${p}`)).length;
/** 노란 센터 면의 네 구석 칸 가운데 노란 칸 수(위 코너 블럭 가운데 노랑이 위를 보는 것) */
const yellowCorners = (s: PuzzleState) => {
  const c = faceColors(3, s);
  const top = [0, 1, 2, 3, 4, 5].find((f) => c[f * 9 + 4] === 3) as number;
  return [0, 2, 6, 8].filter((k) => c[top * 9 + k] === 3).length;
};
type Reached = (s: PuzzleState) => boolean;
const REACHED = {
  scrambled: () => true,
  cross: (s) => goalMet(3, s, "white-cross"),
  "first-layer": (s) => goalMet(3, s, "first-layer"),
  "pair-1": (s) => goalMet(3, s, "cross") && pairsDone(s) >= 1,
  "pair-2": (s) => goalMet(3, s, "cross") && pairsDone(s) >= 2,
  "pair-3": (s) => goalMet(3, s, "cross") && pairsDone(s) >= 3,
  f2l: (s) => goalMet(3, s, "f2l"),
  "yellow-cross": (s) => goalMet(3, s, "yellow-cross"),
  "yellow-edges": (s) => goalMet(3, s, "yellow-edges"),
  "ll-corners-placed": (s) => goalMet(3, s, "ll-corners-placed"),
  "ll-corners-oriented": (s) =>
    goalMet(3, s, "yellow-edges") && goalMet(3, s, "oll"),
  oll: (s) => goalMet(3, s, "oll"),
  "pll-corners": (s) => goalMet(3, s, "yellow-corners"),
  solved: (s) => goalMet(3, s, "ll"),
  eoline: (s) => goalMet(3, s, "eoline"),
  "zz-left": (s) => goalMet(3, s, "zz-left"),
  "roux-fb": (s) => goalMet(3, s, "roux-fb"),
  "roux-sb": (s) => goalMet(3, s, "roux-sb"),
  "roux-co": (s) => goalMet(3, s, "roux-sb") && yellowCorners(s) === 4,
  cmll: (s) => goalMet(3, s, "cmll"),
  "lse-eo": (s) => goalMet(3, s, "lse-eo"),
  "lse-ulur": (s) => goalMet(3, s, "lse-ulur"),
  "petrus-222": (s) => goalMet(3, s, "petrus-222"),
  "petrus-223": (s) => goalMet(3, s, "petrus-223"),
  "petrus-eo": (s) => goalMet(3, s, "petrus-223") && goalMet(3, s, "eo"),
  "corners-first": (s) => cornersOnly(s),
} satisfies Partial<Record<MapNodeId, Reached>>;

/** 다른 크기 지점(그 크기 상태로 본다) */
const REACHED_N: Partial<Record<MapNodeId, (s: PuzzleState) => boolean>> = {
  "2-first-layer": (s) => goalMet(2, s, "2x2-first-layer"),
  "2-top-face": (s) => goalMet(2, s, "2x2-top-face"),
  "2-corners-placed": (s) => goalMet(2, s, "2x2-corners-placed"),
  "2-solved": (s) => goalMet(2, s, "ll"),
  "4-centers": (s) => goalMet(4, s, "centers"),
  "4-paired": (s) => goalMet(4, s, "edges-paired"),
  "4-ud-centers": (s) => goalMet(4, s, "yau-ud-centers"),
  "4-cross3": (s) => goalMet(4, s, "yau-cross3"),
  "4-yau-centers": (s) => goalMet(4, s, "yau-centers"),
  "4-yau-cross": (s) => goalMet(4, s, "yau-cross"),
  "4-yau-paired": (s) =>
    goalMet(4, s, "yau-cross") && goalMet(4, s, "edges-paired"),
  "4-solved": (s) => goalMet(4, s, "ll"),
  "5-centers": (s) => goalMet(5, s, "centers"),
  "5-paired": (s) => goalMet(5, s, "edges-paired"),
  "5-solved": (s) => goalMet(5, s, "ll"),
};

/** 길을 차례로 지나며 지점마다 판정한 결과(닿지 못한 지점 이름 목록, 빈 목록이면 모두 닿음) */
function walk(start: PuzzleState, legs: [MapNodeId, string][]): string[] {
  let s = start;
  const missed: string[] = [];
  for (const [node, moves] of legs) {
    s = play(s, moves);
    if (!(REACHED as Partial<Record<MapNodeId, Reached>>)[node]?.(s))
      missed.push(node);
  }
  return missed;
}

const SEEDS = [1, 2, 3, 4, 5];
const scrambled = (seed: number) =>
  play(solvedCube(3), scramble("333", seed).text);
const U4 = ["", "U", "U'", "U2"];
/** 공식 앞에 쥐는 수(윗면 돌리기 × 큐브 돌려 쥐기) */
const HOLDS = U4.flatMap((u) => ["", "y", "y'", "y2"].map((y) => `${u} ${y}`));

/** 쥐는 수 + 공식을 depth번까지 이어 쳐서 pred가 되는 첫 상태(처음부터 맞으면 그대로) */
function reach(
  s: PuzzleState,
  algs: string[],
  holds: string[],
  depth: number,
  pred: (s: PuzzleState) => boolean,
): PuzzleState | undefined {
  let layer = [s];
  for (let d = 0; ; d++) {
    const hit = layer.find(pred);
    if (hit || d === depth) return hit;
    layer = layer.flatMap((x) =>
      holds.flatMap((h) => algs.map((a) => play(x, `${h} ${a}`))),
    );
  }
}

describe("그래프", () => {
  it("해법마다 그 크기의 다 섞임에서 다 맞음까지 길이 끊기지 않고 이어지고, 지점은 모두 해법과 같은 크기다", () => {
    for (const m of MAP_METHODS) {
      const n = methodSize(m);
      const nodes = methodNodes(m);
      const pre = n === 3 ? "" : `${n}-`;
      expect([m.id, nodes[0], nodes.at(-1)]).toEqual([
        m.id,
        `${pre}scrambled`,
        `${pre}solved`,
      ]);
      expect(
        nodes.filter((id) => nodeSize(id) !== n),
        m.id,
      ).toEqual([]);
      m.edges.forEach((id, i) => {
        expect(edgeById(id)?.from, `${m.id} ${id}`).toBe(nodes[i]);
      });
    }
  });

  it("지점은 그 지점을 지나는 해법 가운데 가장 왼쪽(쉬운) 해법의 칸에 있다(패리티 역은 곁에)", () => {
    const wrong = MAP_NODES.filter((n) => {
      const lanes = MAP_METHODS.filter((m) =>
        methodNodes(m).includes(n.id),
      ).map((m) => MAP_LANES[m.id] as number);
      return n.col !== Math.min(...lanes);
    }).map((n) => n.id);
    expect(wrong).toEqual([]);
    // 초보자 길은 왼쪽 끝에 곧게 내려온다
    expect(
      methodNodes(method("beginner")).map((id) => nodeById(id).col),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("모든 지점과 길이 적어도 한 해법에 쓰인다", () => {
    const used = new Set(MAP_METHODS.flatMap((m) => m.edges));
    expect(MAP_EDGES.filter((e) => !used.has(e.id)).map((e) => e.id)).toEqual(
      [],
    );
    const nodes = new Set(MAP_METHODS.flatMap(methodNodes));
    expect(MAP_NODES.filter((n) => !nodes.has(n.id)).map((n) => n.id)).toEqual(
      [],
    );
  });

  it("길의 단원 id는 모두 실제 단원이다", () => {
    expect(
      MAP_EDGES.flatMap((e) => e.lessons).filter((id) => !lessons.has(id)),
    ).toEqual([]);
  });

  it("길을 누르면 해법 과정의 단원을, 과정에 없으면 길의 첫 단원을 연다", () => {
    const courseOf = (id: string) => lessons.get(id)?.course;
    const open = (edge: string, m: MapMethodId) =>
      lessonFor(edgeById(edge) as MapEdge, method(m), courseOf);
    expect([
      open("cross", "cfop"),
      open("cross", "beginner"),
      open("cross", "two-look"),
      open("two-look-face", "zz"),
      open("two-look-face", "two-look"),
      open("eoline", "zz"),
      open("twist-first", "beginner-twist-first"),
    ]).toEqual([
      "cfop-cross",
      "333-safe-turns",
      "333-safe-turns",
      "zz-ll",
      "cfop-2look-oll",
      "zz-eo",
      undefined,
    ]);
  });

  it("단원이 없는 걸음은 코너 방향 먼저 하는 초보자 둘, 페트루스 F2L 마무리, 사이트에 없는 마지막 층 갈래·코너 먼저다", () => {
    expect(MAP_EDGES.filter((e) => !e.lessons.length).map((e) => e.id)).toEqual(
      [
        "twist-first",
        "twist-first-place",
        "petrus-f2l",
        "coll",
        "zbll",
        "1lll",
        "cf-corners",
        "cf-edges",
        // 5×5 「3×3 맞추기」(5×5 과정에 3×3처럼 단원이 없다. 누르면 3×3 지도로)
        "555-reduction:333",
      ],
    );
  });

  it("사이트에 단원이 있는 해법만 기본으로 보이고, 나머지는 접어 둔다", () => {
    expect(MAP_METHODS.filter((m) => !m.extra).map((m) => m.id)).toEqual([
      "beginner",
      "beginner-twist-first",
      "two-look",
      "cfop",
      "roux",
      "zz",
      "petrus",
      "222-beginner",
      "222-from333",
      "ortega",
      "444-reduction",
      "444-yau",
      "555-reduction",
    ]);
  });

  it("준비 칸의 단원은 3×3 처음 맞추기 과정에서 흰 십자 걸음보다 앞에 있다", () => {
    const course = COURSES.find((c) => c.id === "333-beginner");
    const order = course?.lessons.map((l) => l.id) ?? [];
    const cross = order.indexOf("333-safe-turns");
    expect(
      MAP_PREP.map((id) => order.indexOf(id) < cross && order.includes(id)),
    ).toEqual(MAP_PREP.map(() => true));
  });
});

describe("공식 수", () => {
  it("길마다 공식 수는 공식 모음 상황 수·단원 공식 수다", () => {
    expect(
      Object.fromEntries(
        MAP_EDGES.map((e) => [e.id, e.formulas?.length ?? null]),
      ),
    ).toEqual({
      cross: 0,
      "first-corners": 1,
      "second-layer": 2,
      "f2l-pair-1": 41,
      "f2l-pair-2": 41,
      "f2l-pair-3": 41,
      "f2l-pair-4": 41,
      "beginner-yellow-cross": 1,
      "beginner-edges": 1,
      "beginner-corner-place": 1,
      "beginner-corner-twist": 1,
      "twist-first": 1,
      "twist-first-place": 1,
      "two-look-cross": 3,
      "two-look-face": 7,
      "two-look-corners": 2,
      "two-look-edges": 4,
      oll: 57,
      pll: 21,
      "roux-fb": 0,
      "roux-sb": 0,
      "roux-co": 7,
      "roux-cp": 2,
      "lse-eo": 0,
      "lse-ulur": 0,
      "lse-ep": 0,
      eoline: 0,
      "zz-left": 12,
      "zz-right": 12,
      "petrus-222": 0,
      "petrus-223": 0,
      "petrus-eo": 0,
      "petrus-f2l": 0,
      coll: null,
      zbll: null,
      "1lll": null,
      "cf-corners": null,
      "cf-edges": null,
      "222-first-layer": 1,
      "222-top-face": 1,
      "222-top-layer": 1,
      "222-corner-place": 1,
      "222-corner-twist": 1,
      "ortega-face": 0,
      "ortega-oll": 7,
      "ortega-pbl": 5,
      "444-centers": null,
      "444-edges": null,
      "yau-ud-centers": null,
      "yau-cross3": null,
      "yau-side-centers": null,
      "yau-last-cross": null,
      "yau-edges": null,
      "555-centers": null,
      "555-edges": 2,
      // 큰 큐브 「3×3 맞추기」: 고르는 3×3 해법마다 달라 비운다
      "444-reduction:333": null,
      "444-yau:333": null,
      "555-reduction:333": null,
    });
  });

  it("해법마다 배우는 공식 수(같은 공식은 한 번)", () => {
    expect(
      Object.fromEntries(MAP_METHODS.map((m) => [m.id, methodFormulaCount(m)])),
    ).toEqual({
      beginner: 6,
      "beginner-twist-first": 6,
      "two-look": 19,
      cfop: 119,
      roux: 9,
      zz: 25,
      petrus: 13,
      "zz-coll": null,
      "zz-zbll": null,
      "cfop-1lll": null,
      "corners-first": null,
      "222-beginner": 3,
      "222-from333": 2,
      ortega: 12,
      // 앞부분(센터·엣지) 공식을 셀 기준이 없어 비운다
      "444-reduction": null,
      "444-yau": null,
      "555-reduction": null,
    });
  });

  it("앞 길에서 배운 공식은 뒤 길에서 새로 세지 않는다(F2L 짝 둘째부터, 초보자 코너 방향)", () => {
    const cfop = newFormulas(method("cfop"));
    expect(
      ["f2l-pair-1", "f2l-pair-2", "f2l-pair-4"].map((id) => cfop.get(id)),
    ).toEqual([41, 0, 0]);
    expect(newFormulas(method("beginner")).get("beginner-corner-twist")).toBe(
      0,
    );
  });

  it("공식 모음 상황 id는 실제 상황이고, 초보자 공식은 그 단원 수에 들어 있다", () => {
    const caseIds = new Set([
      ...ALL_ALG_CASES.map((c) => c.id),
      ...ZZ_PAIRS.map((c) => c.id),
    ]);
    for (const e of MAP_EDGES) {
      const lessonAlgs = e.lessons.flatMap(
        (id) =>
          lessons
            .get(id)
            ?.l.steps.flatMap((st) => [
              st.alg ?? "",
              st.setup && "alg" in st.setup ? st.setup.alg : "",
            ]) ?? [],
      );
      // 큰 큐브 뒤 묶음은 3×3 길의 공식을 합친 것이라 그 3×3 길에서 본다
      if (e.jump) continue;
      for (const f of e.formulas ?? []) {
        if (caseIds.has(f)) continue;
        // 단원 공식 그대로(초보자): 그 길의 단원(단원 없는 길은 초보자 과정 어디든)에 쓰인다
        const where = e.lessons.length
          ? lessonAlgs
          : [...lessons.values()]
              .filter((x) => x.course === "333-beginner")
              .flatMap((x) => x.l.steps.map((st) => st.alg ?? ""));
        expect(
          where.some((a) => a.includes(f)),
          `${e.id}: ${f}`,
        ).toBe(true);
      }
    }
  });
});

describe("지점 정의", () => {
  it("초보자: 단원 규칙으로 맞추면 단계마다 다음 지점에 닿는다", () => {
    const legs: [MapNodeId, PathStageId][] = [
      ["cross", "cross"],
      ["first-layer", "corners"],
      ["f2l", "second"],
      ["yellow-cross", "yellow-cross"],
      ["yellow-edges", "edges"],
      ["ll-corners-placed", "corner-place"],
      ["solved", "corner-twist"],
    ];
    for (const seed of SEEDS) {
      let s = scrambled(seed);
      const missed: string[] = [];
      for (const [node, stage] of legs) {
        if (stage === "second") s = play(s, "z2");
        s = runStage(stage, s).state;
        if (!(REACHED as Partial<Record<MapNodeId, Reached>>)[node]?.(s))
          missed.push(node);
      }
      expect(missed, `씨앗 ${seed}`).toEqual([]);
    }
  });

  it("2단계 OLL·PLL·ZZ 마지막 층: 노란 십자 → 노란 면 → 위 코너 → 다 맞음", () => {
    for (const seed of SEEDS) {
      const start = stateForRule("f2l-solved", seed);
      const cross = yellowCrossByFormula(start);
      const rest = runZzLl(play(start, cross));
      const by = (stage: string) =>
        rest.steps
          .filter((x) => x.stage === stage)
          .map(stepMovesLl)
          .join(" ");
      expect(
        walk(start, [
          ["yellow-cross", cross],
          ["oll", by("oll")],
          ["pll-corners", by("pll-corners")],
          ["solved", `${by("align")} ${by("pll-edges")}`],
        ]),
        `씨앗 ${seed}`,
      ).toEqual([]);
    }
  });

  it("CFOP: 컴퓨터 해법의 단계마다 십자 → 짝 하나·둘·셋 → 아래 두 층 → 노란 면 → 다 맞음", () => {
    const order: [MapNodeId, string][] = [
      ["cross", "cross"],
      ["pair-1", "f2l-1"],
      ["pair-2", "f2l-2"],
      ["pair-3", "f2l-3"],
      ["f2l", "f2l-4"],
      ["oll", "oll"],
      ["solved", "pll"],
    ];
    for (const seed of SEEDS) {
      const start = scrambled(seed);
      const sol = solveCfop(start);
      const legs = order.map(([node, name]): [MapNodeId, string] => {
        const st = sol.stages.find((x) => x.name === name);
        return [node, st ? sol.moves.slice(st.start, st.end).join(" ") : ""];
      });
      expect(walk(start, legs), `씨앗 ${seed}`).toEqual([]);
    }
  });

  it("루: 컴퓨터 해법의 단계마다 첫 블록 → 두 블록 → 위 코너 → LSE 둘 → 다 맞음", () => {
    const order: [MapNodeId, string[]][] = [
      ["roux-fb", ["fb"]],
      ["roux-sb", ["sb"]],
      ["cmll", ["cmll"]],
      ["lse-eo", ["lse-eo"]],
      ["lse-ulur", ["lse-ulur"]],
      ["solved", ["lse-ep"]],
    ];
    for (const seed of SEEDS) {
      const start = scrambled(seed);
      const sol = solveRoux(start);
      const legs = order.map(([node, names]): [MapNodeId, string] => [
        node,
        sol.stages
          .filter((x) => names.includes(x.name))
          .map((x) => sol.moves.slice(x.start, x.end).join(" "))
          .join(" "),
      ]);
      expect(walk(start, legs), `씨앗 ${seed}`).toEqual([]);
    }
  });

  it("루 CMLL 두 걸음: 두 블록에서 노란 면 코너 공식 하나로 위 코너 방향, A·Y퍼뮤 하나로 위 코너", () => {
    const corners = TWO_LOOK_OLL.filter((c) => c.group === "corners").map(
      (c) => c.algs[0] as string,
    );
    const perms = PLL_CASES.filter((c) => ["pll-aa", "pll-y"].includes(c.id))
      .flatMap((c) => c.algs)
      .filter((a) => !a.includes("x"));
    for (const seed of SEEDS) {
      const start = stateForRule("roux-blocks-solved", seed);
      const co = reach(start, corners, U4, 1, REACHED["roux-co"]);
      expect(co, `씨앗 ${seed} 방향`).toBeDefined();
      const cp = reach(co as PuzzleState, perms, HOLDS, 2, REACHED.cmll);
      expect(cp, `씨앗 ${seed} 자리`).toBeDefined();
    }
  });

  it("ZZ: 단원 규칙으로 EO라인 → 왼쪽 블록 → 노란 십자(오른쪽 블록까지 하면 위 엣지 방향이 맞아 있다)", () => {
    for (const seed of SEEDS) {
      const z = solveZzByRules(scramble("333", seed).text);
      expect(
        walk(scrambled(seed), [
          ["eoline", z.eoline],
          ["zz-left", z.left],
          ["yellow-cross", z.right],
          ["solved", z.ll],
        ]),
        `씨앗 ${seed}`,
      ).toEqual([]);
    }
  });

  it("페트루스 지점은 페트루스 단원이 판정하는 목표 그대로다", () => {
    const goals = lessons
      .get("petrus-intro")
      ?.l.steps.flatMap((st) => (st.goal ? [st.goal] : []));
    expect(new Set(goals)).toEqual(new Set(["petrus-222", "petrus-223", "eo"]));
  });

  it("코너 방향 먼저: 코너마다 R' D' R D를 되풀이하면 위 코너 방향, A퍼뮤로 다 맞음", () => {
    const aPerm = PLL_CASES.find((c) => c.id === "pll-aa")?.algs[0] as string;
    for (const seed of SEEDS.slice(0, 3)) {
      let s = stateForRule("ll-edges-solved", seed);
      for (let i = 0; i < 4; i++) {
        const tries = [0, 2, 4].map((k) => play(s, reps(TWIST, k)));
        s = tries.reduce((a, b) =>
          yellowCorners(b) > yellowCorners(a) ? b : a,
        );
        s = play(s, "U");
      }
      expect(REACHED["ll-corners-oriented"](s), `씨앗 ${seed} 방향`).toBe(true);
      expect(
        reach(s, [aPerm], HOLDS, 2, REACHED.solved),
        `씨앗 ${seed} 자리`,
      ).toBeDefined();
    }
  });

  it("코너 여덟: 엣지만 흐트러진 큐브는 코너 여덟 지점이고 다 맞음은 아니다", () => {
    const hPerm = play(solvedCube(3), "M2 U M2 U2 M2 U M2");
    expect([REACHED["corners-first"](hPerm), REACHED.solved(hPerm)]).toEqual([
      true,
      false,
    ]);
    expect(REACHED["corners-first"](play(solvedCube(3), "R U R' U'"))).toBe(
      false,
    );
  });

  it("2×2: 단원 규칙(처음 맞추기·3×3을 아는 사람)으로 단계마다 다음 지점에 닿는다", () => {
    for (const [stages, nodes] of [
      [BEGINNER_222_STAGES, ["2-first-layer", "2-top-face", "2-solved"]],
      [FROM333_222_STAGES, ["2-first-layer", "2-corners-placed", "2-solved"]],
    ] as const)
      for (const seed of SEEDS.slice(0, 3)) {
        let s = play222(solvedCube(2), scramble("222", seed).text);
        const r = solve222(s, stages);
        const missed = nodes.filter((node, i) => {
          s = play222(s, r.moves[i] ?? "");
          return !REACHED_N[node]?.(s);
        });
        expect(missed, `씨앗 ${seed}`).toEqual([]);
      }
  });

  it("4×4·5×5: 앞부분 단원 규칙으로 3×3처럼까지, 3×3 맞추기(축소법 풀이, 패리티 포함)로 다 맞음", () => {
    for (const id of ["444-reduction", "444-yau", "555-reduction"] as const) {
      const m = method(id);
      const n = methodSize(m) as 4 | 5;
      const nodes = methodNodes(m);
      for (const seed of SEEDS.slice(0, 2)) {
        const text = scramble(n === 4 ? "444" : "555", seed).text;
        const run = methodRun(id, text);
        let s = playN(n, solvedCube(n), text);
        const missed: string[] = [];
        m.edges.forEach((e, i) => {
          // 3×3 맞추기 칸은 패리티 고리의 수도 풀이 차례대로 섞여 있어 축소법 풀이를 그대로 친다
          const moves = e.endsWith(":333")
            ? solveReduced(n, s)
                .stages.map((x) => x.moves)
                .join(" ")
            : (run[e] ?? "");
          s = playN(n, s, moves);
          const node = nodes[i + 1] as MapNodeId;
          if (!REACHED_N[node]?.(s)) missed.push(node);
        });
        expect(missed, `${id} 씨앗 ${seed}`).toEqual([]);
      }
    }
  });

  it("패리티 고리는 4×4에만 둘(OLL·PLL), 이름은 눈에 띄는 자리, 공식은 패리티 공식 모음이다", () => {
    expect(
      Object.fromEntries(
        MAP_SIZES.map((n) => [
          n,
          PARITY_LOOPS[n].map((l) => [l.name, l.sub, l.formulas.length]),
        ]),
      ),
    ).toEqual({
      2: [],
      3: [],
      4: [
        ["토끼이빨", "OLL 패리티 · OLL에서 보임", 1],
        ["바보토끼이빨", "PLL 패리티 · PLL에서 보임", 1],
      ],
      5: [],
    });
    expect(PARITY_LOOPS[4].map((l) => l.formulas)).toEqual([
      PARITY_FORMULAS.oll,
      PARITY_FORMULAS.pll,
    ]);
  });

  it("3×3 지도 「4×4에서 옴」의 패리티 우회 역 자리는 그 해법이 지나는 지점이고, OLL 쪽이 PLL 쪽보다 앞이다", () => {
    for (const [id, at] of Object.entries(PARITY_AT)) {
      const nodes = methodNodes(method(id as MapMethodId));
      const i = nodes.indexOf(at.oll);
      const j = nodes.indexOf(at.pll);
      expect([i >= 0, j > i], id).toEqual([true, true]);
    }
  });

  it("그림은 해법을 따라 보이는 칸이 늘기만 한다(앞 지점에 보인 칸은 다음 지점에도 보인다)", () => {
    const shown = (id: MapNodeId) =>
      nodeMask(id).flatMap((v, s) => (v === "visible" ? [s] : []));
    const lost: string[] = [];
    for (const m of MAP_METHODS) {
      const nodes = methodNodes(m);
      nodes.slice(1).forEach((to, i) => {
        const from = nodes[i] as MapNodeId;
        const next = new Set(shown(to));
        if (shown(from).some((s) => !next.has(s))) lost.push(`${from}→${to}`);
      });
    }
    expect(lost).toEqual([]);
  });

  it("지점 그림은 같은 크기 안에서 모두 서로 다르다", () => {
    const keys = MAP_NODES.map(
      (n) => `${n.size ?? 3}:${nodeMask(n.id).join(",")}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
