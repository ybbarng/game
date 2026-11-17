/**
 * Rust 코어 공통 시험 자료: 홈 시연(`hero/methods.ts` 표의 해법 전부, docs/52 5-6 「남은 것」 1·5-10).
 * 첫 면 색은 늘 흰색이거나, 여섯 색으로 모두 풀어 첫 단계 수가 가장 적은 색(같으면 앞 차례)이다.
 * 사이트 `solveWithFirst`는 해법을 늦게 불러오느라 비동기라, 같은 해법(`HERO_SYNC`)·같은 차례(`FIRST_COLOR_ORDER`)·같은
 * 셈(`stageCost`)으로 여기서 바로 고른다(`HERO_SYNC`가 표와 같은지는 `core-fixtures-hero.test.ts`가 `solveForHero`와 견준다).
 * 꼴과 다시 쓰는 법은 `core-fixtures.ts` 머리말과 같다. 화면은 이 파일을 부르지 않는다(시험 전용).
 */
import {
  type HumanSolve,
  STAGE_LABELS,
  type StageName,
  solveBeginner2,
  solveBeginner3,
  solveCfop,
  solveHuman,
  solveIntermediate2,
  solveRoux,
  solveZZ,
} from "@game/cube-ai";
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import { createRng, nextFloat } from "@game/mighty-engine";
import type { PuzzleState } from "@game/puzzle-core";

import {
  heroTiming,
  orientForSolve,
  orientSteps,
  randomScramble,
  scrambleSteps,
  solveSteps,
} from "../hero/loop";
import type { HeroSize } from "../hero/methods";
import {
  FIRST_COLOR_ORDER,
  findHeroMethod,
  type HeroSolve,
  heroStageLabel,
  stageCost,
} from "../hero/methods";
import { presentSolve } from "../hero/present";
import { solveYauHuman } from "../learn/yau-hero";
import { fixtureJson } from "./core-fixtures";

const TAUGHT = { taught: true } as const;

/** `HERO_METHODS`의 `solve`를 바로(비동기 없이). 표에 해법을 더하면 여기에도 더한다 */
export const HERO_SYNC: Readonly<
  Record<
    string,
    (s: PuzzleState, first: number, until?: StageName) => HumanSolve
  >
> = {
  "2-beginner": (s) => solveBeginner2(s, TAUGHT),
  "2-algs": (s, first, until) => solveIntermediate2(s, { first, until }),
  "3-beginner": (s) => solveBeginner3(s, TAUGHT),
  "3-cfop": (s, first, until) => solveCfop(s, { first, until }),
  "3-roux": (s, first, until) => solveRoux(s, { first, until }),
  "3-zz": (s, first, until) => solveZZ(s, { first, until }),
  ...Object.fromEntries(
    ([4, 5, 6, 7] as const).flatMap((n) => [
      [
        `${n}-beginner`,
        (s: PuzzleState) => solveHuman("beginner", n, s, undefined, TAUGHT),
      ],
      [
        `${n}-cfop`,
        (s: PuzzleState, first: number, until?: StageName) =>
          solveHuman("advanced", n, s, undefined, { first, until }),
      ],
    ]),
  ),
  "4-yau": (s, first, until) => solveYauHuman(s, first, until),
};

/** 사이트 `solveWithFirst`를 바로(비동기 없이): 늘 흰색, 아니면 첫 단계가 가장 싼 색 */
function solveFirstSync(
  method: string,
  state: PuzzleState,
): { raw: HumanSolve; first: number } {
  const def = findHeroMethod(method);
  const solve = HERO_SYNC[method];
  if (!def || !solve) throw new Error(`모르는 해법: ${method}`);
  if (def.first === "white") return { raw: solve(state, 0), first: 0 };
  // 사이트와 같이 색마다 그 단계까지만 풀어 견주고, 고른 색 하나만 끝까지 푼다
  const stage = def.first.cheapest as StageName;
  let best: { first: number; cost: number } | null = null;
  for (const first of FIRST_COLOR_ORDER) {
    const cost = stageCost(solve(state, first, stage), stage);
    if (!best || cost < best.cost) best = { first, cost };
  }
  if (!best) throw new Error("풀지 못했다");
  return { raw: solve(state, best.first), first: best.first };
}

/** 씨앗 → 섞기(mulberry32)·쥐는 방향 맞춘 뒤 풀 상태(사이트 `HeroLoop.beginCycle`) */
export function heroStart(
  n: HeroSize,
  seed: number,
): { scramble: string[]; orient: string[]; state: PuzzleState } {
  const t = heroTiming(n);
  const rng = createRng(seed);
  const sc = randomScramble(() => nextFloat(rng), t.scrambleLength, n);
  let state = solvedCube(n);
  for (const m of sc) state = applyMoves(n, state, parseMoves(n, m));
  const orient = orientForSolve(n, state);
  if (orient.length)
    state = applyMoves(n, state, parseMoves(n, orient.join(" ")));
  return { scramble: sc, orient, state };
}

/** 2×2·3×3 해법(씨앗 8개씩). 큰 큐브는 풀이가 길고 느려 `buildHeroShowBig`(따로 파일)에 */
export function buildHeroShow(): string {
  return heroShowJson(
    ["2-beginner", "2-algs", "3-beginner", "3-cfop", "3-roux", "3-zz"],
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
}

/** `hero-show-big.json`의 판 차례: 4×4~7×7 축소법 둘(씨앗 하나씩, 4×4는 패리티가 나오는 씨앗 둘) */
export const HERO_SHOW_BIG_CASES: readonly (readonly [
  method: string,
  seed: number,
])[] = [4, 5, 6, 7].flatMap((n) =>
  ["beginner", "cfop"].flatMap((m) =>
    (n === 4 ? [1, 2] : [1]).map((seed) => [`${n}-${m}`, seed] as const),
  ),
);

/**
 * 4×4 야우(씨앗 다섯: 패리티가 나오는 판, 첫 면 색이 흰색이 아닌 판, 흰 십자 셋 뒤 흰-주황 엣지 블럭까지 제자리라 옆 센터
 * 쥐기를 흰-주황 자리로 골라야 하는 판 1029(첫 면 노랑, docs/47 16-22)을 함께)
 */
export const HERO_SHOW_YAU_SEEDS: readonly number[] = [1, 2, 3, 4, 1029];

export function buildHeroShowYau(): string {
  return heroShowJson(["4-yau"], [...HERO_SHOW_YAU_SEEDS]);
}

export function buildHeroShowBig(): string {
  return fixtureJson(
    HERO_SHOW_META,
    HERO_SHOW_BIG_CASES.map(([m, seed]) => heroShowCase(m, seed)),
  );
}

const HERO_SHOW_WHAT =
  "Cubie 홈 시연 한 판: 해법(method, 크기 size) × 씨앗(mulberry32) → 섞기·쥐는 방향 맞추기, 첫 면 색, 보여 주기 변환 뒤 수·단계(이름·꼬리표)·살피는 자리·찾는 돌리기·쉬는 자리·강조(자리·종류·따로·확인·스티커), 연출 걸음([수 또는 빈 글(멈춤), ms, 꼬리표 번호, 강조 수])";

/** 홈 시연 자료(`hero-show.json`·`hero-show-big.json`)의 머리 */
export const HERO_SHOW_META = { what: HERO_SHOW_WHAT };

function heroShowJson(methods: string[], seeds: number[]): string {
  const cases = methods.flatMap((m) => seeds.map((s) => heroShowCase(m, s)));
  return fixtureJson(HERO_SHOW_META, cases);
}

/**
 * Cubie 홈 시연 한 판(docs/52 5-6 「남은 것」 1): 씨앗 → 섞기(`randomScramble`, mulberry32) → 쥐는 방향 맞추기 →
 * 해법(첫 면 색) → 보여 주기 변환(`presentSolve`) → 연출 차례(`scrambleSteps`·`orientSteps`·`solveSteps`, 강조 「잠깐」).
 * 미니 화면은 떠 있을 때 한 판마다 연출을 새로 시작해 그 크기 해법 차례의 첫 해법(번갈아면 초보자)을 쓴다
 */
export function heroShowCase(
  method: string,
  seed: number,
): { first: number; moves: string } & Record<string, unknown> {
  const def = findHeroMethod(method);
  if (!def) throw new Error(method);
  const n = def.size;
  const t = heroTiming(n);
  const { scramble: sc, orient, state } = heroStart(n, seed);
  const { raw, first } = solveFirstSync(method, state);
  const p = presentSolve(n, state, raw, def.view, first);
  const hero: HeroSolve = {
    first,
    moves: p.moves,
    stages: p.stages.map((s) => ({
      label: heroStageLabel(s.name, first, STAGE_LABELS),
      start: s.start,
      end: s.end,
    })),
    looks: p.looks,
    searches: p.searches,
    marks: p.marks,
    gaps: p.gaps,
  };
  const steps = [
    ...scrambleSteps(sc, def.label, t),
    ...orientSteps(orient, def.label, t),
    ...solveSteps(hero, def.label, t),
  ];
  const labels: string[] = [];
  const labelIndex = (l: string) => {
    const i = labels.indexOf(l);
    if (i >= 0) return i;
    labels.push(l);
    return labels.length - 1;
  };
  return {
    method,
    size: n,
    seed,
    scramble: sc.join(" "),
    orient: orient.join(" "),
    first,
    moves: p.moves.join(" "),
    stages: p.stages.map((s, i) => [
      s.name,
      hero.stages[i]?.label,
      s.start,
      s.end,
    ]),
    looks: p.looks,
    searches: p.searches,
    gaps: p.gaps,
    marks: p.marks.map(({ at, mark }) => [
      at,
      mark.kind,
      mark.solo ? 1 : 0,
      mark.check ? 1 : 0,
      mark.stickers.join(","),
    ]),
    steps: steps.map((s) =>
      s.kind === "move"
        ? [s.move, s.ms, labelIndex(s.label), 0]
        : [
            "",
            s.ms,
            labelIndex(s.label),
            (s as { marks?: unknown[] }).marks?.length ?? 0,
          ],
    ),
    labels,
  };
}

export function buildHero(): string {
  const def = findHeroMethod("3-cfop");
  if (!def || def.first === "white") throw new Error("3-cfop은 색 중립이다");
  const stage = def.first.cheapest as StageName;
  const cases: unknown[] = [];
  for (const seed of [51, 52, 53, 54, 55, 56, 57, 58]) {
    const sc = scramble("333", seed).text;
    const state = applyMoves(3, solvedCube(3), parseMoves(3, sc));
    const costs: number[] = [];
    let best: { first: number; cost: number } | null = null;
    // 색마다 십자까지만 풀어 견주고(단계 수는 끝까지 푼 판과 같다), 고른 색 하나만 끝까지 푼다
    for (const first of FIRST_COLOR_ORDER) {
      const cost = stageCost(solveCfop(state, { first, until: stage }), stage);
      costs.push(cost);
      if (!best || cost < best.cost) best = { first, cost };
    }
    const chosen = solveCfop(state, { first: best?.first ?? 0 });
    cases.push({
      method: def.id,
      alg: sc,
      costs,
      first: best?.first,
      moves: chosen.moves.join(" "),
      stages: chosen.stages.map((s) => [s.name, s.start, s.end]),
    });
  }
  return fixtureJson(
    {
      what: "홈 시연 해법 고르기: 섞기(alg) → 첫 면 색마다 첫 단계 수(costs, 흰 빨강 초록 노랑 주황 파랑), 고른 색(first)과 그 색의 풀이 수·단계",
    },
    cases,
  );
}
