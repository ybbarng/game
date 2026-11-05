import {
  applyMoves,
  type CubeMove,
  invertMoves,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import type { PlayerResult, RaceResult } from "@/net/race/types";
import type { Transport } from "@/net/transport";
import {
  activeHandicap,
  goalReached,
  handicapOk,
  handicapTags,
  helpScreen,
  ratioText,
  recentAverage,
  recommendDelays,
  scoreByAverage,
} from "./handicap";
import { type Scrambler, scrambleSeed } from "./race-game";
import {
  CubeRoom,
  type RoomSettings,
  type RoomState,
  raceOptionsFor,
} from "./room";
import { pointsMatch, rankPoints, standings } from "./standings";

/** 실력 차 균형(핸디캡, docs/51 4절, docs/47 9-5) */

function result(cells: Record<string, number | "dnf">): RaceResult {
  const players: Record<string, PlayerResult> = {};
  for (const [id, c] of Object.entries(cells))
    players[id] =
      typeof c === "number"
        ? { id, status: "done", moves: 1, accepted: c, reported: c }
        : { id, status: "dnf", moves: 0 };
  const ranking = Object.keys(cells).sort(
    (a, b) =>
      (typeof cells[a] === "number" ? (cells[a] as number) : 1e9) -
      (typeof cells[b] === "number" ? (cells[b] as number) : 1e9),
  );
  return { ranking, players };
}

describe("핸디캡 계산", () => {
  it("내 평균: 최근 12판 가운데 맞춘 판(벌점 포함)의 평균, 맞춘 판이 셋 아래면 없음", () => {
    const r = (ms: number | null, penalty = 0) => ({ ms, penalty });
    expect(recentAverage([r(10_000), r(null), r(20_000)])).toBeNull();
    expect(
      recentAverage([r(10_000), r(null), r(20_000), r(28_000, 2_000)]),
    ).toBe(20_000);
    // 13번째부터는 보지 않는다
    expect(
      recentAverage([...Array.from({ length: 12 }, () => r(10_000)), r(1)]),
    ).toBe(10_000);
  });

  it("출발 늦추기 추천: 가장 느린 평균에 맞춰 빠른 사람이 차이만큼(30초까지), 평균이 없으면 0", () => {
    expect(recommendDelays({ a: 20_400, b: 30_000, c: null })).toEqual({
      a: 10,
    });
    expect(recommendDelays({ a: 10_000, b: 90_000 })).toEqual({ a: 30 });
    expect(recommendDelays({ a: 10_000, b: null })).toEqual({});
  });

  it("평균 대비 순위: 느려도 내 평균보다 많이 빠르면 1등, 평균이 없으면 이 경기에서 처음 맞춘 판이 기준(그 판 0%)", () => {
    const avg = { a: 10_000, b: 40_000, c: null };
    const first = scoreByAverage(
      result({ a: 9_000, b: 30_000, c: 50_000 }),
      avg,
      [],
    );
    expect(first.ranking).toEqual(["b", "a", "c"]);
    expect(first.score.a).toBeCloseTo(-0.1);
    expect(first.score.b).toBeCloseTo(-0.25);
    expect(first.score.c).toBe(0);
    expect(first.baseline.c).toEqual({ ms: 50_000, from: "first" });
    expect(ratioText(first.score.b as number)).toBe("평균 대비 −25%");
    expect(ratioText(0.123)).toBe("평균 대비 +12%");
    // 다음 판: c의 기준은 첫 판 50초
    const prev = result({ a: 9_000, b: 30_000, c: 50_000 });
    const second = scoreByAverage(
      result({ a: 9_000, c: 35_000, b: "dnf" }),
      avg,
      [prev],
    );
    expect(second.ranking).toEqual(["c", "a", "b"]);
    expect(second.score.c).toBeCloseTo(-0.3);
    expect(second.score).not.toHaveProperty("b");
    // 첫 판을 못 맞춘 사람은 그 판에 점수가 없고, 처음 맞춘 판이 기준
    const late = scoreByAverage(result({ a: 9_000, c: 60_000 }), avg, [
      result({ a: 9_000, c: "dnf" }),
    ]);
    expect(late.score.c).toBe(0);
  });

  it("평균 대비 점수로 순위 점수·서든데스를 가른다", () => {
    const r = result({ a: 9_000, b: 30_000 });
    const score = { a: -0.1, b: -0.25 };
    expect(rankPoints(r, score)).toEqual({ b: 2, a: 1 });
    const rules = {
      format: "points",
      target: 3,
      rounds: 3,
      scoring: "rank",
    } as const;
    const rows = standings(rules, ["a", "b"], [{ result: r, score }]);
    expect(rows.map((x) => [x.id, x.points])).toEqual([
      ["b", 2],
      ["a", 1],
    ]);
  });

  it("목표 이정표: 어느 면이든 그 단계에 닿으면 끝, 목표가 없으면 다 맞춤", () => {
    const one = applyMoves(3, solvedCube(3), parseMoves(3, "F R U R' U' F'"));
    // 윗면 공식 하나는 아래 두 층을 그대로 두므로 첫 두 층에 닿아 있다
    expect(goalReached(3, one, "layer2")).toBe(true);
    expect(goalReached(3, one, "oll")).toBe(false);
    expect(goalReached(3, one, undefined)).toBe(false);
    expect(goalReached(3, solvedCube(3), undefined)).toBe(true);
  });

  it("핸디캡 글과 모양 확인: 컴퓨터는 빼고, 평균 대비면 목표는 쓰지 않는다", () => {
    const h = {
      delay: { a: 5, bot1: 9 },
      goal: { b: "layer2" as const },
    };
    const active = activeHandicap(h, ["a", "b"], {
      ao5: false,
      averageOf: () => null,
    });
    expect(active).toEqual({ delaySec: { a: 5 }, goal: { b: "layer2" } });
    expect(handicapTags(active, 3, "a")).toEqual(["+5초 늦게 출발"]);
    expect(handicapTags(active, 3, "b")).toEqual(["목표: 첫 두 층"]);
    const avg = activeHandicap({ ...h, score: "avg" }, ["a", "b"], {
      ao5: false,
      averageOf: (id) => (id === "a" ? 10_000 : null),
    });
    expect(avg.goal).toEqual({});
    expect(avg.avg).toEqual({ a: 10_000, b: null });
    // 5판 평균(시간 평균)에는 평균 대비를 쓰지 않는다
    expect(
      activeHandicap({ score: "avg" }, ["a"], {
        ao5: true,
        averageOf: () => 1,
      }).avg,
    ).toBeUndefined();
    expect(handicapOk({ delay: { a: 31 } }, 3)).toBe(false);
    expect(handicapOk({ delay: { a: 1.5 } }, 3)).toBe(false);
    expect(handicapOk({ goal: { a: "cross" } }, 2)).toBe(false);
    expect(handicapOk({ goal: { a: "cross" } }, 3)).toBe(true);
    expect(handicapOk({ score: "가장 늦게" }, 3)).toBe(false);
  });

  it("핸디캡이 없으면 판정 설정 지문이 예전과 같다", () => {
    const base: RoomSettings = {
      n: 3,
      format: "single",
      target: 3,
      inspection: true,
      timeLimitSec: 300,
    };
    const none = activeHandicap(undefined, ["a", "b"], {
      ao5: false,
      averageOf: () => null,
    });
    expect(raceOptionsFor(base, none)).toEqual(raceOptionsFor(base));
    expect(raceOptionsFor(base)).not.toHaveProperty("startDelayMs");
    expect(
      raceOptionsFor(base, { delaySec: { a: 5 }, goal: { b: "cross" } }),
    ).toMatchObject({
      startDelayMs: { a: 5_000 },
      gameOptions: { handicap: { goal: { b: "cross" } } },
    });
  });
});

// ---- 두 기기(방장·손님, 기기마다 RaceHub 하나) ----

const SHORT = ["R U", "F R'", "U2 R F'"];
const fake: Scrambler = (event, seed) => ({
  event,
  text: SHORT[seed % SHORT.length] as string,
  official: false,
});

/** 받은 방 상태를 바꿔 넘기는 연결(방장이 이 기기에만 다른 방 상태를 보낸 것과 같다) */
function tampered(
  base: Transport,
  change: (s: RoomState) => RoomState,
): Transport {
  return {
    selfId: base.selfId,
    send: (m, to) => base.send(m, to),
    onMessage: (h) =>
      base.onMessage((m, from) => {
        const msg = m as { type?: string; state?: RoomState };
        if (msg.type === "cube-room" && msg.state)
          h({ ...msg, state: change(msg.state) }, from);
        else h(m, from);
      }),
    onPeerJoin: (h) => base.onPeerJoin(h),
    onPeerLeave: (h) => base.onPeerLeave(h),
    leave: () => base.leave(),
  };
}

function setup(
  opts: {
    settings?: Partial<RoomSettings>;
    hostAvg?: number;
    guestAvg?: number;
    change?: (s: RoomState) => RoomState;
  } = {},
) {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const host = new CubeRoom({
    transport: net.join("h"),
    clock,
    isHost: true,
    name: "방장",
    ...(opts.hostAvg ? { avgs: { "2": opts.hostAvg } } : {}),
    scrambler: fake,
    settings: {
      n: 2,
      inspection: false,
      timeLimitSec: 60,
      ...opts.settings,
    },
  });
  const joined = net.join("g");
  const guest = new CubeRoom({
    transport: opts.change ? tampered(joined, opts.change) : joined,
    clock,
    isHost: false,
    hostId: "h",
    name: "손님",
    ...(opts.guestAvg ? { avgs: { "2": opts.guestAvg } } : {}),
    scrambler: fake,
  });
  clock.advance(100);
  return { clock, net, host, guest };
}

function inverse(room: CubeRoom): CubeMove[] {
  const seed = room.session()?.snapshot().seed as string;
  const text = (fake("222", scrambleSeed(seed)) as { text: string }).text;
  return invertMoves(parseMoves(2, text)) as CubeMove[];
}

/** 판마다 풀림 뒤 `delays[판 번호 - 1]` ms에 섞기의 거꾸로를 한꺼번에 둔다(null이면 두지 않음) */
function solveRounds(
  clock: ManualClock,
  room: CubeRoom,
  delays: (number | null)[],
) {
  let done = "";
  room.onChange(() => {
    const s = room.session();
    const snap = s?.snapshot();
    const race = room.state?.race?.id ?? "";
    if (!s || snap?.phase !== "race" || done === race) return;
    done = race;
    const delay = delays[(room.state?.round ?? 1) - 1];
    if (delay === null || delay === undefined) return;
    const moves = inverse(room);
    clock.after(delay, () => {
      for (const m of moves) s.play(m);
    });
  });
}

function playRound(clock: ManualClock, host: CubeRoom, guest: CubeRoom) {
  const k = host.rounds.length + 1;
  expect(host.startRound()).toBe(true);
  runUntil(
    clock,
    () => host.rounds.length === k && guest.rounds.length === k,
    120_000,
    50,
  );
  runUntil(clock, () => guest.state?.status !== "racing");
}

describe("핸디캡 대결(두 기기)", () => {
  it("출발 늦추기: 손님은 k초 전 수가 막히고, 두 기기가 같은 결과·핸디캡을 낸다", () => {
    const { clock, host, guest } = setup();
    host.setHandicap({ delay: { g: 5 } });
    clock.advance(100);
    expect(guest.state?.settings.handicap).toEqual({ delay: { g: 5 } });
    solveRounds(clock, host, [8_000]);
    let blocked: string | undefined;
    guest.onChange(() => {
      const s = guest.session();
      if (s?.snapshot().phase !== "race" || blocked !== undefined) return;
      const moves = inverse(guest);
      const first = s.play(moves[0] as CubeMove);
      blocked = first.ok ? "ok" : first.reason;
      clock.after(4_900, () => {
        expect(s.play(moves[0] as CubeMove).ok).toBe(false);
      });
      clock.after(5_000, () => {
        for (const m of moves) expect(s.play(m).ok).toBe(true);
      });
    });
    playRound(clock, host, guest);
    expect(blocked).toBe("출발 전");
    const h = host.rounds[0];
    const g = guest.rounds[0];
    expect(g?.result).toEqual(h?.result);
    expect(g?.handicap).toEqual(h?.handicap);
    expect(h?.handicap).toEqual({ delaySec: { g: 5 }, goal: {} });
    // 시간은 같은 풀림부터: 늦춘 5초가 들어 있어 8초인 방장보다 늦다
    expect(h?.result.players.g?.accepted).toBeGreaterThanOrEqual(5_000);
    expect(h?.result.ranking).toEqual(["g", "h"]);
  });

  it("목표 다르게: 목표 이정표에 닿은 수에서 끝나고, 두 기기가 같은 판정을 한다", () => {
    const { clock, host, guest } = setup();
    host.setHandicap({ goal: { g: "layer1" } });
    solveRounds(clock, host, [1_000]);
    solveRounds(clock, guest, [2_000]);
    playRound(clock, host, guest);
    const h = host.rounds[0] as NonNullable<(typeof host.rounds)[number]>;
    expect(guest.rounds[0]?.result).toEqual(h.result);
    expect(h.result.players.g?.status).toBe("done");
    // 손님은 첫 층에 닿은 수까지만, 방장은 끝까지
    const gLog = h.logs.g ?? [];
    expect(gLog.length).toBeLessThan((h.logs.h ?? []).length);
    const end = applyMoves(
      2,
      h.start,
      gLog.flatMap((x) => parseMoves(2, x.m)),
    );
    expect(goalReached(2, end, "layer1")).toBe(true);
    expect(goalReached(2, h.start, "layer1")).toBe(false);
    expect(h.handicap?.goal).toEqual({ g: "layer1" });
  });

  it("평균 대비: 두 기기가 같은 순위·점수를 내고, 느린 사람도 내 평균보다 많이 빠르면 1등", () => {
    const { clock, host, guest } = setup({
      settings: { format: "points", rounds: 3, scoring: "wins" },
      hostAvg: 10_000,
      guestAvg: 40_000,
    });
    expect(guest.state?.players.find((p) => p.id === "g")?.avgs).toEqual({
      "2": 40_000,
    });
    host.setHandicap({ score: "avg" });
    solveRounds(clock, host, [8_000, 12_000]);
    solveRounds(clock, guest, [30_000, 30_000]);
    playRound(clock, host, guest);
    playRound(clock, host, guest);
    for (const k of [0, 1])
      expect(guest.rounds[k]?.result).toEqual(host.rounds[k]?.result);
    expect(host.rounds[0]?.result.ranking).toEqual(["g", "h"]);
    expect(host.rounds[0]?.score?.h).toBeCloseTo(-0.2, 2);
    expect(host.rounds[1]?.result.ranking).toEqual(["g", "h"]);
    const rules = {
      format: "points",
      target: 3,
      rounds: 3,
      scoring: "wins",
    } as const;
    expect(pointsMatch(rules, guest.rounds)).toEqual(
      pointsMatch(rules, host.rounds),
    );
    expect(Object.fromEntries(pointsMatch(rules, host.rounds).scores)).toEqual({
      g: 2,
      h: 0,
    });
  });

  it("평균 대비: 방장이 손님의 평균을 바꿔 적으면 손님 기기가 자기 칸으로 맞춰 봐 판이 열리지 않는다", () => {
    const { clock, host, guest } = setup({ hostAvg: 10_000, guestAvg: 40_000 });
    const g = host.state?.players.find((p) => p.id === "g");
    if (g) g.avgs = { "2": 400_000 };
    host.setHandicap({ score: "avg" });
    solveRounds(clock, host, [1_000]);
    solveRounds(clock, guest, [1_000]);
    playRound(clock, host, guest);
    const r = host.rounds[0]?.result;
    expect(r?.ranking.every((id) => r.players[id]?.status !== "done")).toBe(
      true,
    );
    expect(r?.cancelled ?? Object.values(r?.players ?? {})[0]?.reason).toMatch(
      /섞기 어긋남|열지 못/,
    );
  });

  it("방장이 한 손님에게만 다른 출발 늦추기를 알리면 판이 열리지 않는다", () => {
    const { clock, host, guest } = setup({
      change: (s) => ({
        ...s,
        settings: { ...s.settings, handicap: { delay: { h: 3 } } },
      }),
    });
    host.setHandicap({ delay: { h: 10 } });
    playRound(clock, host, guest);
    const r = guest.rounds[0]?.result;
    expect(r?.ranking.every((id) => r.players[id]?.status !== "done")).toBe(
      true,
    );
  });

  it("옛 방 상태(핸디캡 칸 없음)는 받고, 고를 수 없는 핸디캡·평균은 버린다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const old = net.join("h");
    const guest = new CubeRoom({
      transport: net.join("g"),
      clock,
      isHost: false,
      hostId: "h",
      name: "손님",
      scrambler: fake,
    });
    const state = (
      v: number,
      settings: Record<string, unknown>,
      player: Record<string, unknown> = {},
    ) => ({
      type: "cube-room",
      state: {
        v,
        host: "h",
        settings: {
          n: 3,
          format: "single",
          target: 3,
          inspection: true,
          timeLimitSec: 300,
          ...settings,
        },
        players: [{ id: "h", name: "옛 방장", device: "h", ...player }],
        round: 0,
        status: "lobby",
      },
    });
    old.send(state(2, {}));
    clock.advance(100);
    expect(guest.state?.v).toBe(2);
    old.send(state(3, { handicap: { delay: { h: 99 } } }));
    old.send(state(4, { handicap: { goal: { h: "날개" } } }));
    old.send(state(5, {}, { avgs: { "3": -1 } }));
    old.send(state(6, {}, { avgs: "빠름" }));
    clock.advance(100);
    expect(guest.state?.v).toBe(2);
    old.send(state(7, { handicap: { delay: { h: 4 }, score: "avg" } }));
    clock.advance(100);
    expect(guest.state?.settings.handicap).toEqual({
      delay: { h: 4 },
      score: "avg",
    });
  });
});

describe("도움 다르게(docs/47 9-8)", () => {
  const base: RoomSettings = {
    n: 3,
    format: "single",
    target: 3,
    inspection: true,
    timeLimitSec: 300,
  };

  it("사람에게만 남기고, 결과 글·모양 확인·판정 설정 지문에 들어간다", () => {
    const active = activeHandicap(
      { help: { a: "hint", b: "blind", bot1: "plain" } },
      ["a", "b"],
      { ao5: false, averageOf: () => null },
    );
    expect(active).toEqual({
      delaySec: {},
      goal: {},
      help: { a: "hint", b: "blind" },
    });
    expect(handicapTags(active, 3, "a")).toEqual(["힌트 허용"]);
    expect(handicapTags(active, 3, "b")).toEqual(["가리고 맞추기"]);
    // 힌트는 3×3만 있어 다른 크기는 펼친 그림만 허용
    expect(handicapTags(active, 2, "a")).toEqual(["펼친 그림 허용"]);
    expect(handicapOk({ help: { a: "plain" } }, 2)).toBe(true);
    expect(handicapOk({ help: { a: "다 보기" } }, 3)).toBe(false);
    expect(handicapOk({ help: "hint" }, 3)).toBe(false);
    expect(raceOptionsFor(base, active)).toMatchObject({
      gameOptions: { handicap: { help: { a: "hint", b: "blind" } } },
    });
    // 아무도 고르지 않으면 칸이 없고 지문도 예전 그대로
    const none = activeHandicap({ help: {} }, ["a"], {
      ao5: false,
      averageOf: () => null,
    });
    expect(none).not.toHaveProperty("help");
    expect(raceOptionsFor(base, none)).toEqual(raceOptionsFor(base));
  });

  it("화면: 3D만은 펼친 그림을 끄고, 힌트는 3×3에서 맞추는 동안만, 가리기는 풀린 뒤 내가 맞추는 동안만", () => {
    const race = { phase: "race", playing: true };
    expect(helpScreen(undefined, 3, race)).toEqual({
      back: true,
      hint: false,
      hidden: false,
    });
    expect(helpScreen("plain", 3, race).back).toBe(false);
    expect(helpScreen("hint", 3, race).hint).toBe(true);
    expect(
      helpScreen("hint", 3, { phase: "inspect", playing: true }).hint,
    ).toBe(true);
    expect(helpScreen("hint", 2, race).hint).toBe(false);
    expect(helpScreen("hint", 3, { phase: "race", playing: false }).hint).toBe(
      false,
    );
    expect(helpScreen("blind", 3, race).hidden).toBe(true);
    expect(
      helpScreen("blind", 3, { phase: "inspect", playing: true }).hidden,
    ).toBe(false);
    expect(
      helpScreen("blind", 3, { phase: "finished", playing: false }).hidden,
    ).toBe(false);
    expect(
      helpScreen("blind", 3, { phase: "race", playing: false }).hidden,
    ).toBe(false);
  });

  it("두 기기: 손님이 같은 도움 설정을 받고, 같은 판 기록·결과를 낸다", () => {
    const { clock, host, guest } = setup();
    host.setHandicap({ help: { g: "hint", h: "blind" } });
    clock.advance(100);
    expect(guest.state?.settings.handicap).toEqual({
      help: { g: "hint", h: "blind" },
    });
    solveRounds(clock, host, [3_000]);
    solveRounds(clock, guest, [2_000]);
    playRound(clock, host, guest);
    const h = host.rounds[0];
    const g = guest.rounds[0];
    expect(h?.handicap).toEqual({
      delaySec: {},
      goal: {},
      help: { g: "hint", h: "blind" },
    });
    expect(g?.handicap).toEqual(h?.handicap);
    expect(g?.result).toEqual(h?.result);
    // 도움은 판정을 바꾸지 않는다: 먼저 맞춘 손님이 1등
    expect(h?.result.ranking).toEqual(["g", "h"]);
    expect(h?.result.players.g?.status).toBe("done");
  });

  it("방장이 한 손님에게만 다른 도움을 알리면 지문이 달라 판이 열리지 않는다", () => {
    const { clock, host, guest } = setup({
      change: (s) => ({
        ...s,
        settings: { ...s.settings, handicap: { help: { h: "hint" } } },
      }),
    });
    host.setHandicap({ help: { h: "blind" } });
    solveRounds(clock, host, [1_000]);
    solveRounds(clock, guest, [1_000]);
    playRound(clock, host, guest);
    const r = guest.rounds[0]?.result;
    expect(r?.ranking.every((id) => r.players[id]?.status !== "done")).toBe(
      true,
    );
  });

  it("옛 방 상태(도움 칸 없음)는 그대로 받고, 고를 수 없는 도움은 버린다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const old = net.join("h");
    const guest = new CubeRoom({
      transport: net.join("g"),
      clock,
      isHost: false,
      hostId: "h",
      name: "손님",
      scrambler: fake,
    });
    const state = (v: number, handicap?: unknown) => ({
      type: "cube-room",
      state: {
        v,
        host: "h",
        settings: {
          n: 3,
          format: "single",
          target: 3,
          inspection: true,
          timeLimitSec: 300,
          ...(handicap ? { handicap } : {}),
        },
        players: [{ id: "h", name: "옛 방장", device: "h" }],
        round: 0,
        status: "lobby",
      },
    });
    old.send(state(2, { delay: { h: 3 } }));
    clock.advance(100);
    expect(guest.state?.settings.handicap).toEqual({ delay: { h: 3 } });
    old.send(state(3, { help: { h: "다 보기" } }));
    clock.advance(100);
    expect(guest.state?.v).toBe(2);
    old.send(state(4, { help: { h: "plain" } }));
    clock.advance(100);
    expect(guest.state?.settings.handicap).toEqual({ help: { h: "plain" } });
  });
});
