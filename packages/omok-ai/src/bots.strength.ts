import { createRng } from "@game/mighty-engine";
import {
  createMatch,
  type OmokRules,
  pendingSeats,
  step,
  viewOf,
} from "@game/omok-engine";
import { expect, it } from "vitest";

import {
  createOmokSearchBot,
  type OmokBot,
  omokBeginnerBot,
  omokExpertBot,
  omokIntermediateBot,
  omokMasterBot,
} from "./bots";
import { playGame } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다. 통과한 시험의 console은 가려져 stderr에 쓴다.
declare const process: { stderr: { write(text: string): void } };
const console = {
  log: (...args: unknown[]) => process.stderr.write(`${args.join(" ")}\n`),
};
declare const performance: { now(): number };

const STANDARD: OmokRules = { variant: "standard", winsToFinish: 1 };
/** 게임 기본값(2026-10-29 사용자) */
const RENJU: OmokRules = { variant: "renju", winsToFinish: 1 };

/** `strong`이 흑백을 번갈아 쥐고 `games`판 두어 이긴 판·비긴 판을 센다 */
function duel(
  strong: OmokBot,
  weak: OmokBot,
  games: number,
  rules: OmokRules = STANDARD,
) {
  let wins = 0;
  let draws = 0;
  for (let seed = 1; seed <= games; seed++) {
    const seat = seed % 2;
    const bots: [OmokBot, OmokBot] =
      seat === 0 ? [strong, weak] : [weak, strong];
    const end = playGame(bots, rules, seed);
    if (end.wins[seat] === 1) wins++;
    else if (end.result?.kind === "draw") draws++;
  }
  console.log(
    `${strong.name} 대 ${weak.name}(${rules.variant}): ${wins}승 ${draws}무 / ${games}판`,
  );
  return wins;
}

it("단계가 높을수록 이긴다", () => {
  expect(duel(omokIntermediateBot, omokBeginnerBot, 20)).toBeGreaterThanOrEqual(
    16,
  );
  expect(duel(omokExpertBot, omokIntermediateBot, 20)).toBeGreaterThanOrEqual(
    14,
  );
});

it("사 몰아붙이기를 읽으면 고수를 이긴다", () => {
  expect(
    duel(createOmokSearchBot(4, true), omokExpertBot, 20),
  ).toBeGreaterThanOrEqual(12);
});

it("초고수는 고수와 사 읽는 봇을 이긴다", () => {
  expect(duel(omokMasterBot, omokExpertBot, 20)).toBeGreaterThanOrEqual(16);
  expect(
    duel(omokMasterBot, createOmokSearchBot(4, true), 20),
  ).toBeGreaterThanOrEqual(14);
});

/** `bot`이 `foe`와 몇 판 두며 한 수마다 걸린 시간을 잰다 */
function timing(
  label: string,
  bot: OmokBot,
  foe: OmokBot,
  games: number,
  rules: OmokRules = STANDARD,
) {
  const times: number[] = [];
  for (let seed = 1; seed <= games; seed++) {
    let { state } = createMatch(rules, seed);
    const rng = createRng(seed + 1);
    const mine = seed % 2;
    while (state.phase === "play") {
      const seat = pendingSeats(state)[0] as number;
      const who = seat === mine ? bot : foe;
      const t = performance.now();
      const action = who.decide(viewOf(state, seat), rng);
      if (who === bot) times.push(performance.now() - t);
      const r = step(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
  }
  times.sort((a, b) => a - b);
  console.log(
    `${label} 한 수(${rules.variant}, ${times.length}수): 가운데 ${times[times.length >> 1]?.toFixed(0)}ms, 90% ${times[Math.floor(times.length * 0.9)]?.toFixed(0)}ms, 가장 긴 ${times.at(-1)?.toFixed(0)}ms`,
  );
}

it("한 수에 걸리는 시간", () => {
  timing("고수", omokExpertBot, omokIntermediateBot, 2);
  timing("초고수", omokMasterBot, omokExpertBot, 6);
});

// 게임 기본값인 렌주로도 잰다(2026-11-03 game-85 검토). 아직 이 맥에서 돌리지 않았다(로컬 성능 측정 자제).
it("렌주: 초고수는 고수를 이기고, 시간 안에 둔다", () => {
  expect(duel(omokMasterBot, omokExpertBot, 20, RENJU)).toBeGreaterThanOrEqual(
    14,
  );
  timing("초고수", omokMasterBot, omokExpertBot, 6, RENJU);
});
