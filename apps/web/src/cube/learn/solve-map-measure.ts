// 해법 지도의 평균 수 재기(solve-map.ts MAP_MEASURE). 시험(solve-map.test.ts)만 부른다: 화면은 남긴 숫자를 읽는다.
// 대회 섞기(cube-scramble "333") 씨앗마다 해법을 끝까지 돌려 길마다 친 수를 센다(ll-compare.ts turnCount:
// x·y·z는 빼고 U2·M도 한 수). 초보자·2단계·ZZ는 단원 규칙, CFOP·루는 컴퓨터 해법(@game/cube-ai).
import { type HumanSolve, solveCfop, solveRoux } from "@game/cube-ai";
import { solvedCube } from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import type { PuzzleState } from "@game/puzzle-core";

import { type PathStageId, play, runStage, stepMoves } from "./beginner-path";
import { turnCount, yellowCrossByFormula } from "./ll-compare";
import type { MapMethodId } from "./solve-map";
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
  "two-look": (text) => {
    const { s, run } = beginnerLower(play(solvedCube(3), text));
    const cross = yellowCrossByFormula(s);
    return { ...run, "two-look-cross": cross, ...twoLookFrom(play(s, cross)) };
  },
  cfop: (text) =>
    bySolver(solveCfop(play(solvedCube(3), text)), [
      ["cross", ["cross"]],
      ["f2l-pair-1", ["f2l-1"]],
      ["f2l-pair-2", ["f2l-2"]],
      ["f2l-pair-3", ["f2l-3"]],
      ["f2l-pair-4", ["f2l-4"]],
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
      "zz-left": z.left,
      "zz-right": z.right,
      ...twoLookFrom(s),
    };
  },
};

/** 섞기 하나를 해법으로 끝까지: 길 id → 친 수. 잴 길이 없는 해법은 빈 것 */
export function methodRun(id: MapMethodId, text: string): Run {
  return RUNS[id]?.(text) ?? {};
}

export interface MapMeasure {
  seeds: number;
  /** 해법마다 끝까지 친 수의 평균(반올림) */
  turns: Partial<Record<MapMethodId, number>>;
  /** 해법마다 길별 평균(반올림). 루의 `cmll`은 위 코너 방향·자리 두 길을 합친 값 */
  steps: Partial<Record<MapMethodId, Record<string, number>>>;
}

/** 씨앗 1~seeds로 잰다 */
export function measureMap(seeds: number): MapMeasure {
  const texts = Array.from(
    { length: seeds },
    (_, i) => scramble("333", i + 1).text,
  );
  const mean = (xs: number[]) =>
    Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const turns: MapMeasure["turns"] = {};
  const steps: MapMeasure["steps"] = {};
  for (const [id, f] of Object.entries(RUNS) as [
    MapMethodId,
    (t: string) => Run,
  ][]) {
    const runs = texts.map(f);
    turns[id] = mean(runs.map((r) => turnCount(Object.values(r))));
    steps[id] = Object.fromEntries(
      Object.keys(runs[0] as Run).map((edge) => [
        edge,
        mean(runs.map((r) => turnCount([r[edge] ?? ""]))),
      ]),
    );
  }
  return { seeds, turns, steps };
}
