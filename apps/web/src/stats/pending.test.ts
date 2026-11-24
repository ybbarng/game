// @vitest-environment jsdom

import { omokBotFor } from "@game/omok-ai";
import { STANDARD_RULES } from "@game/omok-engine";
import { beforeEach, describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";
import { settleOwnAudit } from "@/net/own-audit";
import { omokKit } from "@/omok/kit";

import { heldStats } from "./pending";
import { StatsRecorder, type StatsTarget } from "./recorder";
import { loadStats } from "./records";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

const KEY = "online:room1#1";

/** 두 판 먼저 이기기 오목을 연다. 기록기가 이 대국을 따라간다 */
function openMatch(target: StatsTarget) {
  const match = new LocalMatch({
    kit: omokKit,
    rules: { ...STANDARD_RULES, winsToFinish: 2 },
    seed: 7,
    bot: omokBotFor(0),
  });
  const recorder = new StatsRecorder(omokKit.stats, target);
  for (const s of match.drain()) recorder.observe(s);
  match.subscribe((s) => recorder.observe(s));
  return match;
}

/** 내 차례에 기권해 판을 지고, 다음 판으로 넘긴다 */
function loseRound(match: ReturnType<typeof openMatch>): void {
  match.submit({ type: "resign" });
  if (match.current().phase === "roundEnd") match.submit({ type: "continue" });
}

/** 두 판을 내리 져 게임을 끝낸다 */
function playToEnd(match: ReturnType<typeof openMatch>): void {
  loseRound(match);
  loseRound(match);
  expect(match.current().phase).toBe("gameOver");
}

const guest: StatsTarget = {
  game: "omok",
  mode: "online",
  key: KEY,
  hold: true,
};

function counts() {
  const { rounds, games } = loadStats();
  return { rounds: rounds.length, games: games.length };
}

describe("검증을 기다리는 참가자 기록", () => {
  it("게임이 끝나도 검증 결과가 나오기 전에는 내 기록에 넣지 않는다", () => {
    playToEnd(openMatch(guest));
    expect(counts()).toEqual({ rounds: 0, games: 0 });
    expect(heldStats(KEY)?.rounds.length).toBe(2);
    expect(heldStats(KEY)?.games.length).toBe(1);
  });

  it("검증을 통과하면 기다리던 판과 게임을 내 기록에 넣는다", async () => {
    playToEnd(openMatch(guest));
    await settleOwnAudit(KEY, null);
    expect(counts()).toEqual({ rounds: 2, games: 1 });
    expect(loadStats().games[0]).toMatchObject({ id: KEY, mode: "online" });
  });

  it("검증이 실패한 게임은 판도 게임도 내 기록에 넣지 않는다", async () => {
    playToEnd(openMatch(guest));
    await settleOwnAudit(KEY, "나: 방장이 내 비밀 값을 바꿨어요.");
    expect(counts()).toEqual({ rounds: 0, games: 0 });
    expect(heldStats(KEY)).toMatchObject({
      verdict: "invalid",
      rounds: [],
      games: [],
    });
  });

  it("결과가 먼저 나오면 그 뒤에 끝나는 판도 같은 결과를 따른다", async () => {
    const passed = openMatch(guest);
    await settleOwnAudit(KEY, null);
    playToEnd(passed);
    expect(counts()).toEqual({ rounds: 2, games: 1 });

    localStorage.clear();
    const other = "online:room2#1";
    const failed = openMatch({ ...guest, key: other });
    await settleOwnAudit(other, "나: 기록이 달라요.");
    playToEnd(failed);
    expect(counts()).toEqual({ rounds: 0, games: 0 });
  });

  it("검증 전에 창을 닫으면 확인하지 못한 기록은 다음에 열어도 남지 않는다", async () => {
    playToEnd(openMatch(guest));
    // 창을 닫으면 탭 저장소(sessionStorage)가 사라진다. 다음에 연 창에서 늦게 온 결과도 넣을 것이 없다.
    sessionStorage.clear();
    expect(counts()).toEqual({ rounds: 0, games: 0 });
    await settleOwnAudit(KEY, null);
    expect(counts()).toEqual({ rounds: 0, games: 0 });
  });

  it("같은 탭에서 새로고침하면 기다리던 기록을 이어 받아 같은 판을 두 번 넣지 않는다", async () => {
    const match = openMatch(guest);
    loseRound(match);
    // 새로고침한 기기의 새 기록기가 같은 대국을 처음부터 다시 본다.
    const again = new StatsRecorder(omokKit.stats, guest);
    for (const s of match.drain()) again.observe(s);
    match.subscribe((s) => again.observe(s));
    loseRound(match);
    await settleOwnAudit(KEY, null);
    expect(counts()).toEqual({ rounds: 2, games: 1 });
  });

  it("방장·혼자 하기 기록은 기다리지 않고 바로 넣는다", () => {
    playToEnd(openMatch({ game: "omok", mode: "solo", key: "solo:7" }));
    expect(counts()).toEqual({ rounds: 2, games: 1 });
    expect(heldStats("solo:7")).toBeUndefined();
  });
});
