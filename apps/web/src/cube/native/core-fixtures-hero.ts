/**
 * Rust 코어 공통 시험 자료: 홈 시연의 해법 고르기(`hero/methods.ts`, docs/52 5-6 「남은 것」 1). 지금은 3×3
 * 프리드리히(`3-cfop`): 여섯 색으로 모두 풀어 십자 수가 가장 적은 색(같으면 앞 차례)을 첫 면으로 고른다.
 * 사이트 `solveWithFirst`는 해법을 늦게 불러오느라 비동기라, 같은 차례(`FIRST_COLOR_ORDER`)와 같은 셈(`stageCost`)으로
 * 여기서 바로 고른다. 꼴과 다시 쓰는 법은 `core-fixtures.ts` 머리말과 같다. 화면은 이 파일을 부르지 않는다(시험 전용).
 */
import { solveCfop } from "@game/cube-ai";
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";

import { FIRST_COLOR_ORDER, findHeroMethod, stageCost } from "../hero/methods";
import { fixtureJson } from "./core-fixtures";

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
