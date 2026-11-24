import { describe, expect, it } from "vitest";

import {
  endsWithRetire,
  type FairReplayGame,
  type FairVerifyInput,
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

describe("게임 끝: 패를 모르는 판이 끝까지 치지 않은 판인가(unopenedRoundProblem)", () => {
  it("첫 판 도중에 그만둔 게임은 첫 판 패를 몰라도 문제없다(끝까지 치지 않은 판)", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(),
        log: [play, retire],
        seen: views(1, 1),
        watchedFrom: 1,
      }),
    ).toBeNull();
  });

  it("둘째 판 도중에 그만둔 게임은 첫 판(끝낸 판) 패를 알면 문제없다", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(1),
        log: [play, play, retire],
        seen: views(1, 2),
        watchedFrom: 1,
      }),
    ).toBeNull();
  });

  it("끝낸 첫 판의 패를 모른 채 둘째 판에서 그만두면 그 판을 짚는다(불리한 판을 숨기고 그만두기)", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(),
        log: [play, play, retire],
        seen: views(1, 2),
        watchedFrom: 1,
      }),
    ).toBe("1판은 끝났는데 카드가 다 열리지 않아 다시 계산하지 못했어요.");
  });

  it("끝까지 친 게임(기록 끝이 끝내기가 아님)은 마지막 판 패를 몰라도 짚는다", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(1),
        log: [play, play],
        seen: views(1, 2),
        watchedFrom: 1,
      }),
    ).toBe("2판은 끝났는데 카드가 다 열리지 않아 다시 계산하지 못했어요.");
  });

  it("새로고침해 둘째 판부터 지켜본 기기는 첫 판 패를 몰라도 짚지 않는다(이 기기가 다시 계산할 수 없는 판)", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(),
        log: [play, play, retire],
        seen: views(2, 3),
        watchedFrom: 2,
      }),
    ).toBeNull();
  });

  it("판 번호가 없는 화면(원카드)은 이 규칙으로 보지 않는다(게임의 다시 계산이 본다)", () => {
    expect(
      unopenedRoundProblem({
        deals: opened(),
        log: [play],
        seen: [JSON.stringify({ phase: "play" })],
        watchedFrom: 1,
      }),
    ).toBeNull();
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
    inFlight = false,
  ): FairVerifyInput => ({
    game: stoppedAtStart,
    rules: {} as never,
    seed: 1,
    seat: 1,
    log: log as never,
    deals: opened(),
    botSeats: new Set<number>(),
    bot: null,
    sent: [JSON.stringify(play.action)],
    seen,
    inFlight,
  });

  it("게임 끝 검증은 첫 판 도중에 그만둔 게임을 통과시킨다", async () => {
    expect(await verifyFairLog(input([play, retire], views(1)))).toEqual({
      ok: true,
    });
  });

  it("게임 끝 검증은 끝낸 판의 패를 모르면 누가 했는지 모른 채 짚는다", async () => {
    expect(
      await verifyFairLog(input([play, play, retire], views(1, 2))),
    ).toEqual({
      ok: false,
      seat: null,
      reason: "1판은 끝났는데 카드가 다 열리지 않아 다시 계산하지 못했어요.",
    });
  });

  it("게임 중 검증(판 끝마다)은 다음 판 패를 아직 모르는 것이 정상이라 짚지 않는다", async () => {
    expect(await verifyFairLog(input([play, play], views(1, 2), true))).toEqual(
      { ok: true },
    );
  });
});
