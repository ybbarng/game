import { describe, expect, it } from "vitest";

import {
  endsWithRetire,
  type FairReplayGame,
  type FairVerifyInput,
  finishedRoundOf,
  type HostRounds,
  unopenedRoundProblem,
  verifyFairLog,
} from "./fair-verify";

/** 받은 화면: 판 번호만 있으면 된다 */
const views = (...rounds: number[]) =>
  rounds.map((roundNumber) => JSON.stringify({ roundNumber }));
const play = { seat: 1, action: { type: "play" } };
const retire = { seat: 0, action: { type: "retire" } };
const opened = (...rounds: number[]) =>
  new Map(rounds.map((r) => [r, { cards: new Map() }]));
/** 방장 원본 화면에서 본 판: 가장 큰 판과 판 끝까지 간 판 */
const rounds = (last: number | null, ...finished: number[]): HostRounds => ({
  last,
  finished: new Set(finished),
});
const hidden = (round: number) =>
  `${round}판은 끝났는데 카드가 다 열리지 않아 다시 계산하지 못했어요.`;

describe("게임 끝: 패를 모르는 판이 끝까지 치지 않은 판인가(unopenedRoundProblem)", () => {
  it("첫 판 도중에 그만둔 게임은 첫 판 패를 몰라도 문제없다(끝까지 치지 않은 판)", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(),
        log: [play, retire],
        rounds: rounds(1),
        watchedFrom: 1,
      }),
    ).toBeNull();
  });

  it("둘째 판 도중에 그만둔 게임은 첫 판(끝낸 판) 패를 알면 문제없다", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(1),
        log: [play, play, retire],
        rounds: rounds(2, 1),
        watchedFrom: 1,
      }),
    ).toBeNull();
  });

  it("끝낸 첫 판의 패를 모른 채 둘째 판에서 그만두면 그 판을 짚는다(불리한 판을 숨기고 그만두기)", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(),
        log: [play, play, retire],
        rounds: rounds(2),
        watchedFrom: 1,
      }),
    ).toBe(hidden(1));
  });

  it("판 끝까지 친 직후 다음 판 화면 전에 그만두면, 마지막 판이어도 그 판 패를 몰라 짚는다", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(),
        log: [play, play, retire],
        rounds: rounds(1, 1),
        watchedFrom: 1,
      }),
    ).toBe(hidden(1));
  });

  it("끝까지 친 게임(기록 끝이 끝내기가 아님)은 마지막 판 패를 몰라도 짚는다", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(1),
        log: [play, play],
        rounds: rounds(2),
        watchedFrom: 1,
      }),
    ).toBe(hidden(2));
  });

  it("새로고침해 둘째 판부터 지켜본 기기는 첫 판 패를 몰라도 짚지 않는다(이 기기가 다시 계산할 수 없는 판)", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(),
        log: [play, play, retire],
        rounds: rounds(3, 1),
        watchedFrom: 2,
      }),
    ).toBeNull();
  });

  it("판 번호가 없는 게임(원카드)은 판 끝 신호만 본다: 그만둔 게임이면 통과, 판 끝까지 갔으면 짚는다", () => {
    const input = { deals: opened(), log: [play, retire], watchedFrom: 1 };
    expect([
      unopenedRoundProblem({ ...input, rounds: rounds(null) }),
      unopenedRoundProblem({ ...input, rounds: rounds(null, 1) }),
    ]).toEqual([null, hidden(1)]);
  });
});

describe("방장 원본 화면의 판 끝 신호(finishedRoundOf)", () => {
  it("마이티: 정산한 판(roundEnd, 정산 뒤 게임 끝)은 판 끝, 판 도중 그만둔 게임 끝은 아니다", () => {
    expect([
      finishedRoundOf("mighty", { roundNumber: 2, phase: "play" }),
      finishedRoundOf("mighty", { roundNumber: 2, phase: "roundEnd" }),
      finishedRoundOf("mighty", {
        roundNumber: 2,
        phase: "gameOver",
        result: { goal: 13 },
      }),
      finishedRoundOf("mighty", {
        roundNumber: 2,
        phase: "gameOver",
        result: null,
      }),
    ]).toEqual([null, 2, 2, null]);
  });

  it("하트: 정산한 판(roundEnd, 판 점수가 있는 게임 끝)은 판 끝, 판 도중 그만둔 게임 끝은 아니다", () => {
    expect([
      finishedRoundOf("hearts", { roundNumber: 1, phase: "play" }),
      finishedRoundOf("hearts", { roundNumber: 1, phase: "roundEnd" }),
      finishedRoundOf("hearts", {
        roundNumber: 1,
        phase: "gameOver",
        roundPoints: [0, 26, 0, 0],
      }),
      finishedRoundOf("hearts", {
        roundNumber: 1,
        phase: "gameOver",
        roundPoints: null,
      }),
    ]).toEqual([null, 1, 1, null]);
  });

  it("화투: 게임이 정한 판 끝(viewRoundOver)이고 그만둔 화면이 아니면 판 끝", () => {
    const hwatu = {
      viewRoundOver: (v: { phase: string }) =>
        v.phase === "roundEnd" || v.phase === "gameOver",
    };
    expect([
      finishedRoundOf(hwatu, { roundNumber: 1, phase: "play" }),
      finishedRoundOf(hwatu, { roundNumber: 1, phase: "roundEnd" }),
      finishedRoundOf(hwatu, {
        roundNumber: 1,
        phase: "gameOver",
        retired: true,
      }),
    ]).toEqual([null, 1, null]);
  });

  it("원카드: 끝났고 그만둔 것이 아니면 판 1이 판 끝", () => {
    expect([
      finishedRoundOf("onecard", { phase: "play" }),
      finishedRoundOf("onecard", { phase: "over" }),
      finishedRoundOf("onecard", { phase: "over", retired: true }),
    ]).toEqual([null, 1, null]);
  });
});

describe("그만둔 게임인가(endsWithRetire)", () => {
  it("기록 끝이 끝내기면 true, 아니거나 빈 기록이면 false", () => {
    expect([
      endsWithRetire([play, retire]),
      endsWithRetire([retire, play]),
      endsWithRetire([]),
    ]).toEqual([true, false, false]);
  });
});

describe("verifyFairLog: 다시 계산이 판 도중에 멈췄을 때", () => {
  /** 패를 모르는 첫 판에서 멈춘 다시 계산(게임 쪽 다시 계산은 첫 판 패가 없으면 처음에서 멈춘다) */
  const stoppedAtStart: FairReplayGame = {
    check: () => ({ ok: true, states: [], upTo: 0 }),
    viewOf: () => null,
    realAction: (action) => action,
  };
  const input = (
    log: (typeof play)[],
    seen: string[],
    options: { inFlight?: boolean; sent?: string[] } = {},
  ): FairVerifyInput => ({
    game: stoppedAtStart,
    rules: {} as never,
    seed: 1,
    seat: 1,
    log: log as never,
    deals: opened(),
    botSeats: new Set<number>(),
    bot: null,
    sent: options.sent ?? [JSON.stringify(play.action)],
    seen,
    inFlight: options.inFlight ?? false,
  });

  it("게임 끝 검증은 첫 판 도중에 그만둔 게임을 통과시킨다", async () => {
    expect(await verifyFairLog(input([play, retire], views(1)))).toEqual({
      ok: true,
    });
  });

  it("게임 끝 검증은 끝낸 판의 패를 모르면 누가 했는지 모른 채 짚는다", async () => {
    expect(
      await verifyFairLog(input([play, play, retire], views(1, 2))),
    ).toEqual({ ok: false, seat: null, reason: hidden(1) });
  });

  it("게임 중 검증(판 끝마다)은 다음 판 패를 아직 모르는 것이 정상이라 짚지 않는다", async () => {
    expect(
      await verifyFairLog(
        input([play, play], views(1, 2), {
          inFlight: true,
          sent: [JSON.stringify(play.action), JSON.stringify(play.action)],
        }),
      ),
    ).toEqual({ ok: true });
  });

  it("다시 계산하지 못한 뒤쪽에 내가 보내지 않은 내 수가 있으면 짚는다(방장이 내 수를 지어내 판을 끝낸 것처럼 꾸미기)", async () => {
    expect(await verifyFairLog(input([play, play, retire], views(1)))).toEqual({
      ok: false,
      seat: 0,
      reason: "기록 속 내 행동이 내가 보낸 것과 달라요.",
    });
  });
});
