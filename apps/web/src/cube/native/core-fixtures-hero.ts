/**
 * Rust 코어 공통 시험 자료: 홈 시연의 해법 고르기(`hero/methods.ts`, docs/52 5-6 「남은 것」 1). 지금은 3×3
 * 프리드리히(`3-cfop`): 여섯 색으로 모두 풀어 십자 수가 가장 적은 색(같으면 앞 차례)을 첫 면으로 고른다.
 * 사이트 `solveWithFirst`는 해법을 늦게 불러오느라 비동기라, 같은 차례(`FIRST_COLOR_ORDER`)와 같은 셈(`stageCost`)으로
 * 여기서 바로 고른다. 꼴과 다시 쓰는 법은 `core-fixtures.ts` 머리말과 같다. 화면은 이 파일을 부르지 않는다(시험 전용).
 */
import {
  type HumanSolve,
  STAGE_LABELS,
  solveBeginner3,
  solveCfop,
} from "@game/cube-ai";
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import { createRng, nextFloat } from "@game/mighty-engine";

import {
  heroTiming,
  orientForSolve,
  orientSteps,
  randomScramble,
  scrambleSteps,
  solveSteps,
} from "../hero/loop";
import {
  FIRST_COLOR_ORDER,
  findHeroMethod,
  type HeroSolve,
  heroStageLabel,
  stageCost,
} from "../hero/methods";
import { presentSolve } from "../hero/present";
import { fixtureJson } from "./core-fixtures";

/** 사이트 `solveWithFirst`를 바로(비동기 없이): 초보자는 흰색, 프리드리히는 십자가 가장 싼 색 */
function solveFirstSync(
  method: string,
  state: ReturnType<typeof solvedCube>,
): { raw: HumanSolve; first: number } {
  if (method === "3-beginner")
    return { raw: solveBeginner3(state, { taught: true }), first: 0 };
  let best: { raw: HumanSolve; first: number; cost: number } | null = null;
  for (const first of FIRST_COLOR_ORDER) {
    const raw = solveCfop(state, { first });
    const cost = stageCost(raw, "cross");
    if (!best || cost < best.cost) best = { raw, first, cost };
  }
  if (!best) throw new Error("풀지 못했다");
  return best;
}

/**
 * Cubie 홈 시연 한 판(docs/52 5-6 「남은 것」 1): 씨앗 → 섞기(`randomScramble`, mulberry32) → 쥐는 방향 맞추기 →
 * 해법(첫 면 색) → 보여 주기 변환(`presentSolve`) → 연출 차례(`scrambleSteps`·`orientSteps`·`solveSteps`, 강조 「잠깐」).
 * 미니 화면은 떠 있을 때 한 판마다 연출을 새로 시작해 그 크기 해법 차례의 첫 해법(번갈아면 초보자)을 쓴다
 */
export function buildHeroShow(): string {
  const cases: unknown[] = [];
  const t = heroTiming(3);
  for (const method of ["3-beginner", "3-cfop"]) {
    const def = findHeroMethod(method);
    if (!def) throw new Error(method);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const rng = createRng(seed);
      const sc = randomScramble(() => nextFloat(rng), t.scrambleLength, 3);
      let state = solvedCube(3);
      for (const m of sc) state = applyMoves(3, state, parseMoves(3, m));
      const orient = orientForSolve(3, state);
      if (orient.length)
        state = applyMoves(3, state, parseMoves(3, orient.join(" ")));
      const { raw, first } = solveFirstSync(method, state);
      const p = presentSolve(3, state, raw, def.view, first);
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
      cases.push({
        method,
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
      });
    }
  }
  return fixtureJson(
    {
      what: "Cubie 홈 시연 한 판: 씨앗(mulberry32) → 섞기·쥐는 방향 맞추기, 첫 면 색, 보여 주기 변환 뒤 수·단계(이름·꼬리표)·살피는 자리·찾는 돌리기·쉬는 자리·강조(자리·종류·따로·확인·스티커), 연출 걸음([수 또는 빈 글(멈춤), ms, 꼬리표 번호, 강조 수])",
    },
    cases,
  );
}

export function buildHero(): string {
  const def = findHeroMethod("3-cfop");
  if (!def || def.first === "white") throw new Error("3-cfop은 색 중립이다");
  const stage = def.first.cheapest;
  const cases: unknown[] = [];
  for (const seed of [51, 52, 53, 54, 55, 56, 57, 58]) {
    const sc = scramble("333", seed).text;
    const state = applyMoves(3, solvedCube(3), parseMoves(3, sc));
    const costs: number[] = [];
    let best: { first: number; cost: number } | null = null;
    let chosen = solveCfop(state, { first: 0 });
    for (const first of FIRST_COLOR_ORDER) {
      const raw = solveCfop(state, { first });
      const cost = stageCost(raw, stage);
      costs.push(cost);
      if (!best || cost < best.cost) {
        best = { first, cost };
        chosen = raw;
      }
    }
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
