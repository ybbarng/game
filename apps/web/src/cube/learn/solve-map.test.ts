// 해법 지도(solve-map.ts) 자료를 엔진으로 확인한다.
// 1. 그래프: 해법마다 다 섞임에서 다 맞음까지 길이 이어지고, 단원 id가 실제 단원이다.
// 2. 공식 수: 길마다 공식 모음·단원 공식에서 센 값이다.
// 3. 지점 정의: 단원 규칙(또는 단원이 쓰는 공식)으로 앞 지점에서 다음 지점에 닿는다. 그림은 해법을 따라 맞은 칸이 늘기만 한다.
// 4. 평균 수: MAP_MEASURE가 지금 규칙·해법으로 잰 값이다.
import { solveCfop, solveRoux } from "@game/cube-ai";
import {
  cubeTopology,
  faceColors,
  pieceFaces,
  solvedCube,
  stickerFace,
} from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { ZZ_PAIRS } from "../practice/zz";
import { ALL_ALG_CASES } from "./alg-sets";
import { TWO_LOOK_OLL } from "./algs-2look";
import { PLL_CASES } from "./algs-pll";
import { type PathStageId, play, runStage } from "./beginner-path";
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
  FINISH_METHODS,
  lessonFor,
  MAP_EDGES,
  MAP_LANES,
  MAP_METHODS,
  MAP_NODES,
  MAP_SIZES,
  type MapEdge,
  type MapMethodId,
  type MapNodeId,
  methodFormulaCount,
  methodNodes,
  methodSize,
  methodStages,
  newFormulas,
  nodeById,
  nodeMask,
  nodeSize,
  nodeState,
  nodeView,
  PARITY_AT,
  PARITY_FORMULAS,
  PARITY_LOOPS,
  pieceFacesNow,
} from "./solve-map";
import { methodRun } from "./solve-map-measure";
import { STAGE_SPECS } from "./stage-map";
import { runTwistFirstStage, type TwistFirstStageId } from "./twist-first-path";
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
  f2l: (s) => goalMet(3, s, "f2l"),
  "yellow-cross": (s) => goalMet(3, s, "yellow-cross"),
  "yellow-edges": (s) => goalMet(3, s, "yellow-edges"),
  "ll-corners-placed": (s) => goalMet(3, s, "ll-corners-placed"),
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
      open("twist-first-face", "beginner-twist-first"),
      open("beginner-yellow-cross", "beginner-twist-first"),
    ]).toEqual([
      "cfop-cross",
      "333-safe-turns",
      "333-safe-turns",
      "zz-ll",
      "cfop-2look-oll",
      "zz-eo",
      "333-tf-face",
      "333-ll-cross",
    ]);
  });

  it("단원이 없는 걸음은 페트루스 F2L 마무리, 사이트에 없는 마지막 층 갈래·코너 먼저다(코너 방향 먼저 걸음은 모두 강이 있다)", () => {
    expect(MAP_EDGES.filter((e) => !e.lessons.length).map((e) => e.id)).toEqual(
      [
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
      // 강의가 가르치는 F2L 공식만(docs/47 16-30). 짝 넷을 넣는 한 걸음
      f2l: 9,
      "beginner-yellow-cross": 1,
      "beginner-edges": 1,
      "beginner-corner-place": 1,
      "beginner-corner-twist": 1,
      "twist-first-face": 1,
      "twist-first-corners": 1,
      "twist-first-edges": 1,
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
      "zz-blocks": 12,
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
      // 엣지 돌리기는 노란 면 공식과 그 거울을 이은 것이지만 칠 공식으로는 하나로 센다
      "beginner-twist-first": 7,
      "two-look": 19,
      cfop: 87,
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

  it("앞 길에서 배운 공식은 뒤 길에서 새로 세지 않는다(첫 층 코너에서 배운 코너 돌리기)", () => {
    const beginner = newFormulas(method("beginner"));
    expect(
      ["first-corners", "beginner-corner-twist"].map((id) => beginner.get(id)),
    ).toEqual([1, 0]);
    const twistFirst = newFormulas(method("beginner-twist-first"));
    expect(
      ["twist-first-face", "twist-first-corners", "twist-first-edges"].map(
        (id) => twistFirst.get(id),
      ),
    ).toEqual([1, 1, 1]);
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

  it("CFOP: 컴퓨터 해법의 단계마다 십자 → 아래 두 층(짝 넷) → 노란 면 → 다 맞음", () => {
    const order: [MapNodeId, string[]][] = [
      ["cross", ["cross"]],
      ["f2l", ["f2l-1", "f2l-2", "f2l-3", "f2l-4"]],
      ["oll", ["oll"]],
      ["solved", ["pll"]],
    ];
    for (const seed of SEEDS) {
      const start = scrambled(seed);
      const sol = solveCfop(start);
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

  it("ZZ: 단원 규칙으로 EO라인 → 노란 십자(두 블록을 지으면 위 엣지 방향이 맞아 있다, 왼쪽 블록 뒤는 페트루스 엣지 방향과 같은 모습)", () => {
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

  it("코너 방향 먼저: 단원 규칙으로 노란 십자 → 노란 면 → 코너 자리 → 다 맞음", () => {
    const legs: [MapNodeId, TwistFirstStageId][] = [
      ["oll", "face"],
      ["pll-corners", "corners"],
      ["solved", "edges"],
    ];
    for (const seed of SEEDS) {
      let s = scrambled(seed);
      for (const stage of [
        "cross",
        "corners",
        "second",
        "yellow-cross",
      ] as const) {
        if (stage === "second") s = play(s, "z2");
        s = runStage(stage, s).state;
      }
      expect(REACHED["yellow-cross"](s), `씨앗 ${seed}`).toBe(true);
      const missed: string[] = [];
      for (const [node, stage] of legs) {
        s = runTwistFirstStage(stage, s).state;
        if (!(REACHED as Partial<Record<MapNodeId, Reached>>)[node]?.(s))
          missed.push(node);
      }
      expect(missed, `씨앗 ${seed}`).toEqual([]);
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

  it("다 섞임 그림은 움직이지 않는 센터만 색이다(3×3은 여섯 면 가운데, 5×5는 한가운데만, 2×2·4×4는 없음)", () => {
    const shown = (id: MapNodeId, n: number) => {
      const topo = cubeTopology(n);
      const mask = nodeMask(id);
      return topo.pieces.flatMap((p) =>
        p.stickers.some((s) => mask[s] === "visible") ? [p.kind] : [],
      );
    };
    expect({
      3: shown("scrambled", 3),
      5: shown("5-scrambled", 5),
      2: shown("2-scrambled", 2),
      4: shown("4-scrambled", 4),
    }).toEqual({
      3: Array(6).fill("center"),
      5: Array(6).fill("center"),
      2: [],
      4: [],
    });
  });

  it("고정 센터는 모든 지점에서 색이다(5×5 나머지 센터 칸은 센터 걸음 뒤부터)", () => {
    const hidden = MAP_NODES.flatMap((node) => {
      const topo = cubeTopology(node.size ?? 3);
      const mask = nodeMask(node.id);
      return topo.pieces.some(
        (p) =>
          p.kind === "center" && p.stickers.some((s) => mask[s] !== "visible"),
      )
        ? [node.id]
        : [];
    });
    expect(hidden).toEqual([]);
    const inner = (id: MapNodeId) => {
      const mask = nodeMask(id);
      return cubeTopology(5).pieces.filter(
        (p) =>
          p.kind === "innerCenter" &&
          p.stickers.every((s) => mask[s] === "visible"),
      ).length;
    };
    expect([inner("5-scrambled"), inner("5-centers")]).toEqual([0, 48]);
  });

  it("지점 그림은 같은 크기 안에서 모두 서로 다르다", () => {
    const keys = MAP_NODES.map(
      (n) => `${n.size ?? 3}:${nodeMask(n.id).join(",")}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("큰 큐브 엣지 짝 그림(짝은 맞았지만 제자리는 아님)", () => {
  const FACE = "URFDLB";
  const PAIRED: MapNodeId[] = ["4-paired", "5-paired", "4-yau-paired"];
  const key = (fs: readonly number[]) =>
    [...fs]
      .sort((a, b) => a - b)
      .map((f) => FACE[f])
      .join("");
  /** 엣지(날개·가운데 엣지 블럭)를 맞춘 상태의 면 둘로 묶는다 */
  const edgeGroups = (n: number, pieces: readonly number[]) => {
    const out = new Map<string, number[]>();
    for (const p of pieces) {
      const k = key(pieceFaces(n, p));
      out.set(k, [...(out.get(k) ?? []), p]);
    }
    return out;
  };
  const isEdge = (kind: string) => kind === "wing" || kind === "edge";

  it("그림 큐브는 맞춘 큐브에 바깥 한 층 돌리기만 한 것이고 센터 블럭은 모두 제 면에 있다", () => {
    for (const id of PAIRED) {
      const node = nodeById(id);
      const n = nodeSize(id);
      expect(
        (node.paired?.turns ?? "")
          .split(" ")
          .every((t) => /^[URFDLB]['2]?$/.test(t)),
        id,
      ).toBe(true);
      const s = nodeState(id);
      const off = cubeTopology(n).pieces.flatMap((p, i) =>
        (p.kind === "center" || p.kind === "innerCenter") &&
        pieceFacesNow(n, s, i).some(
          (f) => f !== (pieceFaces(n, i)[0] as number),
        )
          ? [i]
          : [],
      );
      expect(off, id).toEqual([]);
    }
  });

  it("두 날개 모두 제 색으로 보이는 엣지는 둘이고, 각각 날개가 모두 같은 엣지(짝)이며 위·앞·오른쪽 면에 걸친 남의 자리에 있다", () => {
    const got = Object.fromEntries(
      PAIRED.map((id) => {
        const n = nodeSize(id);
        const topo = cubeTopology(n);
        const mask = nodeMask(id);
        const s = nodeState(id);
        const shown = topo.pieces.flatMap((p, i) =>
          isEdge(p.kind) && p.stickers.every((x) => mask[x] === "visible")
            ? [i]
            : [],
        );
        // 야우의 흰 십자 엣지는 제자리라 따로 본다
        const moved = shown.filter(
          (p) => key(pieceFacesNow(n, s, p)) !== key(pieceFaces(n, p)),
        );
        const groups = [...edgeGroups(n, moved)].map(([home, ps]) => {
          const now = new Set(ps.map((p) => key(pieceFacesNow(n, s, p))));
          // 칸마다 놓인 면의 색(= 그 면 센터 색)과 다르면 「다름」: 센터 줄과 섞여 보이지 않는다
          const differ = ps.every((p) =>
            pieceFacesNow(n, s, p).every(
              (f, k) =>
                f !== stickerFace(n, topo.pieces[p]?.stickers[k] as number),
            ),
          );
          return `${home}→${[...now].join("|")}:${ps.length}${differ ? " 다름" : ""}`;
        });
        return [id, groups.sort()];
      }),
    );
    // 4×4 엣지는 날개 둘, 5×5는 날개 둘과 가운데 엣지 블럭 하나. 지금 자리는 그림의 보이는 면(U·R·F)에 걸친다
    expect(got).toEqual({
      "4-paired": ["RD→UF:2 다름", "UF→UR:2 다름"],
      "5-paired": ["RD→UF:3 다름", "UF→UR:3 다름"],
      "4-yau-paired": ["FD→RF:2 다름", "RD→FL:2 다름"],
    });
  });

  it("나머지 엣지는 회색이고 코너 블럭은 가리며, 야우 흰 십자 엣지는 제자리에서 제 색이다", () => {
    const got = Object.fromEntries(
      PAIRED.map((id) => {
        const n = nodeSize(id);
        const topo = cubeTopology(n);
        const mask = nodeMask(id);
        const s = nodeState(id);
        const count: Record<string, number> = {};
        topo.pieces.forEach((p, i) => {
          if (p.kind !== "corner" && !isEdge(p.kind)) return;
          const v = [...new Set(p.stickers.map((x) => mask[x]))].join("/");
          const home =
            key(pieceFacesNow(n, s, i)) === key(pieceFaces(n, i))
              ? "제자리"
              : "남의 자리";
          const label =
            `${p.kind === "corner" ? "corner" : "edge"} ${v} ${v === "visible" ? home : ""}`.trim();
          count[label] = (count[label] ?? 0) + 1;
        });
        return [id, count];
      }),
    );
    expect(got).toEqual({
      // 4×4 엣지 날개 24 = 보이는 짝 둘(날개 넷) + 회색 20
      "4-paired": {
        "corner hidden": 8,
        "edge visible 남의 자리": 4,
        "edge gray": 20,
      },
      // 5×5 엣지 조각 36 = 보이는 짝 둘(조각 여섯) + 회색 30
      "5-paired": {
        "corner hidden": 8,
        "edge visible 남의 자리": 6,
        "edge gray": 30,
      },
      // 흰 십자 넷(날개 여덟)은 제자리, 보이는 짝 둘(날개 넷), 회색 12
      "4-yau-paired": {
        "corner hidden": 8,
        "edge visible 제자리": 8,
        "edge visible 남의 자리": 4,
        "edge gray": 12,
      },
    });
  });
});

describe("다 맞음 그림의 쥐기(2026-11-26 사용자 「다 맞춤만 흰 면이 위라 어색」)", () => {
  const COLOR = ["흰", "빨강", "초록", "노랑", "주황", "파랑"];
  /** 그림에서 위·앞 면의 센터 색(큰 큐브는 안쪽 센터 칸) */
  const held = (n: number, s: PuzzleState) => {
    const c = faceColors(n, s);
    const k = n === 2 ? 0 : n + 1;
    return `${COLOR[c[0 * n * n + k] as number]} 위 · ${COLOR[c[2 * n * n + k] as number]} 앞`;
  };

  it("해법 하나의 띠(카드·펼친 칸)에서 다 맞음은 모든 해법에서 바로 앞 지점과 같은 면이 위·앞이다", () => {
    const off: string[] = [];
    const check = (m: (typeof MAP_METHODS)[number], as?: 4 | 5) => {
      const ns = methodNodes(m);
      const last = ns.at(-1) as MapNodeId;
      const prev = ns.at(-2) as MapNodeId;
      const n = as ?? nodeSize(last);
      const a = held(n, nodeState(prev, as, m));
      const b = held(n, nodeState(last, as, m));
      if (a !== b || nodeView(last, m) !== nodeView(prev, m))
        off.push(`${m.id}${as ? `@${as}` : ""}: ${a} → ${b}`);
    };
    for (const m of MAP_METHODS) check(m);
    // 큰 큐브 「3×3 맞추기」를 펼친 칸은 3×3 해법을 그 크기 큐브로 그린다
    for (const id of FINISH_METHODS)
      for (const as of [4, 5] as const) check(method(id), as);
    expect(off).toEqual([]);
  });

  it("지도의 다 맞음 칸은 들어오는 앞 단계 대부분처럼 노란 면이 위이고, 해법 띠의 다 맞음 쥐기는 해법마다 이렇다", () => {
    expect({
      3: held(3, nodeState("solved")),
      2: held(2, nodeState("2-solved")),
      // 큰 큐브 지도는 앞 단계(엣지 짝)가 모두 흰 면 위다
      4: held(4, nodeState("4-solved")),
      5: held(5, nodeState("5-solved")),
    }).toEqual({
      3: "노랑 위 · 초록 앞",
      2: "노랑 위 · 초록 앞",
      4: "흰 위 · 초록 앞",
      5: "흰 위 · 초록 앞",
    });
    const byHold = new Map<string, string[]>();
    for (const m of MAP_METHODS) {
      const last = methodNodes(m).at(-1) as MapNodeId;
      const h = held(nodeSize(last), nodeState(last, undefined, m));
      byHold.set(h, [...(byHold.get(h) ?? []), m.id]);
    }
    expect(Object.fromEntries(byHold)).toEqual({
      "노랑 위 · 초록 앞": [
        "beginner",
        "beginner-twist-first",
        "two-look",
        "cfop",
        "zz",
        "petrus",
        "zz-coll",
        "zz-zbll",
        "cfop-1lll",
        "222-beginner",
        "222-from333",
      ],
      // 루는 블록을 왼쪽·오른쪽에 두려고 y2로 쥔다
      "노랑 위 · 파랑 앞": ["roux"],
      // 앞 단계가 흰 면 위인 해법(억지로 바꾸지 않는다): 코너 먼저, 오르테가(흰 면 → 흰·노란 면), 큰 큐브 축소법·야우
      "흰 위 · 초록 앞": [
        "corners-first",
        "ortega",
        "444-reduction",
        "444-yau",
        "555-reduction",
      ],
    });
  });
});

describe("해법 카드 띠는 큰 단계만(2026-11-26 사용자 「CFOP가 단계가 적다는 것이 드러나지 않는다」)", () => {
  it("큰 단계는 해법이 지나는 지점을 차례대로 끊고, 세부 걸음을 빠짐없이 한 번씩 나눠 가지며, 마지막은 다 맞음이다", () => {
    const off = MAP_METHODS.flatMap((m) => {
      const st = methodStages(m);
      const edges = st.flatMap((s) => s.edges.map((e) => e.id));
      const ok =
        st.at(-1)?.to === methodNodes(m).at(-1) &&
        st.every((s) => s.edges.length > 0 && s.edges.at(-1)?.to === s.to) &&
        edges.join() === m.edges.join();
      return ok ? [] : [m.id];
    });
    expect(off).toEqual([]);
  });

  it("단계 지도가 있는 과정의 기본 해법은 카드 띠 칸 수가 그 과정의 단계 수와 같다(2단계 OLL·PLL은 OLL·PLL 안 걸음까지)", () => {
    // 2단계 OLL·PLL은 두 번에 나누는 것이 해법의 정체라 카드 띠에 OLL 둘·PLL 둘을 보인다(2026-11-26 사용자). 과정의
    // 단계 지도(아래 두 층·OLL·PLL 세 칸)보다 둘 많다
    const more: Partial<Record<string, number>> = { "two-look": 2 };
    const got = Object.fromEntries(
      MAP_METHODS.filter(
        (m) => !m.extra && m.course && STAGE_SPECS[m.course],
      ).map((m) => [
        m.id,
        [
          methodStages(m).length,
          (STAGE_SPECS[m.course as string]?.stages.length ?? 0) +
            (more[m.id] ?? 0),
        ],
      ]),
    );
    expect(Object.entries(got).filter(([, [a, b]]) => a !== b)).toEqual([]);
    // 단계 지도가 있는 해법을 빠뜨리지 않았는지
    expect(Object.keys(got).sort()).toEqual(
      [
        "beginner",
        "beginner-twist-first",
        "two-look",
        "cfop",
        "roux",
        "zz",
        "222-beginner",
        "222-from333",
        "ortega",
        "444-reduction",
        "444-yau",
        "555-reduction",
      ].sort(),
    );
  });

  it("CFOP 띠는 십자·F2L·OLL·PLL 네 칸이고, 해법 화면 걸음도 F2L이 하나다(짝 넷을 넣는 같은 일은 한 걸음)", () => {
    expect(
      methodStages(method("cfop")).map(
        (s) => `${s.to}:${s.edges.map((e) => e.id).join("+")}`,
      ),
    ).toEqual(["cross:cross", "f2l:f2l", "oll:oll", "solved:pll"]);
  });

  it("2단계 OLL·PLL 띠는 다 섞임 → 아래 두 층 → 노란 십자 → 노란 면 → 코너 자리 → 다 맞음", () => {
    const m = method("two-look");
    expect(
      [methodNodes(m)[0], ...methodStages(m).map((s) => s.to)].map(
        (id) => nodeById(id as MapNodeId).title,
      ),
    ).toEqual([
      "다 섞임",
      "아래 두 층",
      "노란 십자",
      "노란 면",
      "코너 자리",
      "다 맞음",
    ]);
  });

  it("같은 일을 되풀이하는 걸음은 하나다: 한 해법 안에서 같은 단원·같은 공식 묶음을 쓰는 걸음이 잇따르지 않는다", () => {
    // 공식 없는 걸음(LSE 셋·페트루스 블록처럼 한 단원 안에서 하는 일이 다른 것)은 공식으로 가를 수 없어 보지 않는다
    const repeats = MAP_METHODS.flatMap((m) =>
      m.edges.slice(1).flatMap((id, i) => {
        const a = edgeById(m.edges[i] as string) as MapEdge;
        const b = edgeById(id) as MapEdge;
        const same =
          a.lessons.length > 0 &&
          (a.formulas?.length ?? 0) > 0 &&
          a.lessons.join() === b.lessons.join() &&
          JSON.stringify(a.formulas) === JSON.stringify(b.formulas);
        return same ? [`${m.id}: ${a.id}+${b.id}`] : [];
      }),
    );
    expect(repeats).toEqual([]);
  });
});
