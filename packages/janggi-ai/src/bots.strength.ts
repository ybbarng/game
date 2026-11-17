import {
  createMatch,
  type JanggiRules,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
} from "@game/janggi-engine";
import { createRng } from "@game/mighty-engine";
import { expect, it } from "vitest";

import {
  createJanggiDeepBot,
  type JanggiBot,
  janggiBeginnerBot,
  janggiExpertBot,
  janggiIntermediateBot,
  janggiMasterBot,
  MASTER_BUDGET,
} from "./bots";
import { deepSearch } from "./deep";
import { playGame } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다(오목 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

const RULES: JanggiRules = STANDARD_RULES;
const GAMES = Number(process.env.JANGGI_GAMES ?? 20);

/** `strong`이 초·한을 번갈아 쥐고 `games`판 두어 이긴 판을 센다 */
function duel(strong: JanggiBot, weak: JanggiBot, games: number) {
  let wins = 0;
  const kinds: Record<string, number> = {};
  let plies = 0;
  for (let seed = 1; seed <= games; seed++) {
    const seat = seed % 2;
    const bots: [JanggiBot, JanggiBot] =
      seat === 0 ? [strong, weak] : [weak, strong];
    const end = playGame(bots, RULES, seed);
    const won = end.wins[seat] === 1;
    if (won) wins++;
    // 점수로 끝난 판은 마지막 수를 누가 뒀는지도 적는다(빅장·되풀이를 누가 만들었나).
    const last = end.played.at(-1)?.side;
    const strongSide = end.choSeat === seat ? "c" : "h";
    const how =
      end.result?.kind === "score"
        ? `${end.result.reason}(${last === strongSide ? "내가" : "상대가"})`
        : end.result?.kind;
    const kind = `${won ? "승" : "패"}-${how}`;
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    plies += end.played.length;
  }
  console.log(
    `${strong.name} 대 ${weak.name}: ${wins}승 / ${games}판`,
    JSON.stringify(kinds),
    `한 판 평균 ${Math.round(plies / games)}수`,
  );
  return wins;
}

it("초고수 한 수에 걸리는 시간", () => {
  const times: number[] = [];
  const depths: number[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    let { state } = createMatch(RULES, seed);
    const rng = createRng(seed + 1);
    // 상대는 중수: 판이 오래 가서 가운데·끝판의 수도 잰다.
    for (let i = 0; i < 400 && state.phase !== "gameOver"; i++) {
      if (state.phase !== "setup" && state.phase !== "play") break;
      const seat = pendingSeats(state)[0] as number;
      const view = viewOf(state, seat);
      let action: ReturnType<JanggiBot["decide"]>;
      if (seat === seed % 2 && view.decision?.kind === "move") {
        const t = performance.now();
        const r = deepSearch(view, rng, MASTER_BUDGET);
        times.push(performance.now() - t);
        depths.push(r.depth);
        action = r.move ? { type: "move", ...r.move } : { type: "pass" };
      } else action = janggiIntermediateBot.decide(view, rng);
      const r = step(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
  }
  times.sort((a, b) => a - b);
  depths.sort((a, b) => a - b);
  console.log(
    `초고수 한 수: 가운데 ${times[times.length >> 1]?.toFixed(0)}ms, 열에 아홉 ${times[Math.floor(times.length * 0.9)]?.toFixed(0)}ms 안, 가장 긴 ${times.at(-1)?.toFixed(0)}ms (${times.length}수), 읽은 깊이 가운데 ${depths[depths.length >> 1]}`,
  );
});

/** 정렬한 값에서 가운데·열에 아홉·가장 긴 값 */
function spread(sorted: number[]) {
  return {
    median: sorted[sorted.length >> 1] ?? 0,
    p90: sorted[Math.floor(sorted.length * 0.9)] ?? 0,
    max: sorted.at(-1) ?? 0,
  };
}

// 휴대폰에서 화면이 굳는지 볼 때 쓴다(docs/22 「휴대폰에서 멈춤」). 상대를 고수로 두어 기물이 많이 남은
// 중반 판을 만들고, 20~80수째(두 편 합)의 초고수 수만 잰다. 판마다 첫 수 차례를 바꾼다.
it("중반 초고수 한 수에 걸리는 시간", () => {
  const times: number[] = [];
  const nodes: number[] = [];
  const games = Number(process.env.JANGGI_MID_GAMES ?? 12);
  for (let seed = 1; seed <= games; seed++) {
    let { state } = createMatch(RULES, seed);
    const rng = createRng(seed + 1);
    for (let i = 0; i < 400 && state.phase !== "gameOver"; i++) {
      if (state.phase !== "setup" && state.phase !== "play") break;
      const seat = pendingSeats(state)[0] as number;
      const view = viewOf(state, seat);
      const ply = view.played.length;
      if (ply > 80) break;
      let action: ReturnType<JanggiBot["decide"]>;
      if (seat === seed % 2 && view.decision?.kind === "move") {
        const t = performance.now();
        const r = deepSearch(view, rng, MASTER_BUDGET);
        const ms = performance.now() - t;
        if (ply >= 20) {
          times.push(ms);
          nodes.push(r.nodes);
        }
        action = r.move ? { type: "move", ...r.move } : { type: "pass" };
      } else action = janggiExpertBot.decide(view, rng);
      const r = step(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
  }
  times.sort((a, b) => a - b);
  nodes.sort((a, b) => a - b);
  const t = spread(times);
  const n = spread(nodes);
  console.log(
    `중반 초고수 한 수(상대 고수, ${games}판 20~80수째, ${times.length}수): 가운데 ${t.median.toFixed(0)}ms, 열에 아홉 ${t.p90.toFixed(0)}ms, 가장 긴 ${t.max.toFixed(0)}ms · 노드 가운데 ${n.median}, 열에 아홉 ${n.p90}, 가장 많은 ${n.max}`,
  );
});

it("초고수가 고수를 이긴다", () => {
  expect(duel(janggiMasterBot, janggiExpertBot, GAMES)).toBeGreaterThanOrEqual(
    Math.ceil(GAMES * 0.75),
  );
});

it("계획을 세우는 초고수가 계획 없는 같은 탐색보다 낫거나 같다", () => {
  const noPlan = createJanggiDeepBot(
    { ...MASTER_BUDGET, plan: false },
    "janggi-master-noplan",
  );
  const games = Math.max(10, GAMES >> 1);
  expect(duel(janggiMasterBot, noPlan, games)).toBeGreaterThanOrEqual(
    games >> 1,
  );
});

it("단계가 높을수록 이긴다", () => {
  expect(
    duel(janggiIntermediateBot, janggiBeginnerBot, 10),
  ).toBeGreaterThanOrEqual(8);
  expect(
    duel(janggiExpertBot, janggiIntermediateBot, 10),
  ).toBeGreaterThanOrEqual(7);
});
