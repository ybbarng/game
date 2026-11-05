import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import type { PlayerResult, RaceResult } from "@/net/race/types";
import type { Transport } from "@/net/transport";
import { type Scrambler, scrambleSeed } from "./race-game";
import {
  CubeRoom,
  matchRules,
  type RoomSettings,
  raceOptionsFor,
} from "./room";
import {
  type MatchRules,
  matchOver,
  pointsMatch,
  rankPoints,
  standings,
} from "./standings";

/** 점수제 여러 판(docs/51 3-1, docs/47 9-3): 점수는 각 기기가 자기 판 결과로 계산한다 */

// ---- 판 결과 만들기 ----

type Cell = number | "dnf" | "forfeit" | "disputed";

/** `{ a: 10, b: "dnf" }` → 판 결과. 숫자는 인정 시간 */
function round(
  cells: Record<string, Cell>,
  extra: Partial<RaceResult> = {},
): { result: RaceResult } {
  const players: Record<string, PlayerResult> = {};
  for (const [id, c] of Object.entries(cells)) {
    if (typeof c === "number")
      players[id] = { id, status: "done", moves: 1, accepted: c, reported: c };
    else if (c === "disputed")
      players[id] = {
        id,
        status: "done",
        moves: 1,
        reported: 1,
        disputed: true,
        unranked: true,
      };
    else players[id] = { id, status: c, moves: 0 };
  }
  const order = (id: string) => {
    const c = cells[id];
    if (typeof c === "number") return c;
    return c === "disputed" ? 1e9 : c === "dnf" ? 2e9 : 3e9;
  };
  const ranking = Object.keys(cells).sort((a, b) => order(a) - order(b));
  return { result: { ranking, players, ...extra } };
}

const wins5: MatchRules = {
  format: "points",
  target: 3,
  rounds: 5,
  scoring: "wins",
};
const rank3: MatchRules = {
  format: "points",
  target: 3,
  rounds: 3,
  scoring: "rank",
};

describe("점수제 계산", () => {
  it("순위 점수: m명이면 1등 m점 … 꼴찌 1점, 못 맞춤·기권·다툼은 0점, 같은 시간은 같은 등수", () => {
    expect(
      rankPoints(
        round({ a: 10, b: 20, c: 20, d: "dnf", e: "forfeit", f: "disputed" })
          .result,
      ),
    ).toEqual({ a: 6, b: 5, c: 5 });
    // 판정 없음 판은 아무도 점수가 없다
    expect(
      rankPoints(round({ a: 10, b: "disputed" }, { noDecision: true }).result),
    ).toEqual({});
  });

  it("이긴 판(5판): 1:1에서 먼저 세 판이면 일찍 끝나고, 따라잡힐 수 있으면 이어 간다", () => {
    const a = round({ a: 1, b: 2 });
    const b = round({ a: 2, b: 1 });
    expect(matchOver(wins5, [a, a])).toBe(false);
    expect(matchOver(wins5, [a, a, a])).toBe(true);
    expect(matchOver(wins5, [a, b, a, b])).toBe(false);
    expect(matchOver(wins5, [a, b, a, a])).toBe(true);
    const rows = standings(wins5, ["a", "b"], [a, b, a, a]);
    expect(rows.map((r) => [r.id, r.points, r.place])).toEqual([
      ["a", 3, 1],
      ["b", 1, 2],
    ]);
    expect(rows[0]?.roundPoints).toEqual([1, 0, 1, 1]);
  });

  it("순위 점수는 정한 판을 모두 치르고 합으로 가른다", () => {
    const rounds = [round({ a: 1, b: 2, c: 3 }), round({ a: 1, b: 2, c: 3 })];
    // a가 두 판 모두 이겨도 순위 점수는 끝까지 간다
    expect(matchOver(rank3, rounds)).toBe(false);
    rounds.push(round({ c: 1, a: 2, b: 3 }));
    expect(matchOver(rank3, rounds)).toBe(true);
    // a 3·3·2 = 8, b 2·2·1 = 5, c 1·1·3 = 5. 같은 점수는 같은 등수(차례는 마지막 판 순위)
    expect(
      standings(rank3, ["a", "b", "c"], rounds).map((r) => [
        r.id,
        r.points,
        r.place,
      ]),
    ).toEqual([
      ["a", 8, 1],
      ["c", 5, 2],
      ["b", 5, 2],
    ]);
  });

  it("동점이면 서든데스: 동점자 가운데 가장 빠른 사람이 이기고, 아무도 못 맞추면 한 판 더", () => {
    const rounds = [
      round({ a: 1, b: 2, c: 3 }),
      round({ b: 1, a: 2, c: 3 }),
      round({ c: 1, a: 2, b: 3 }),
    ];
    // a 3·2·2 = 7, b 2·3·1 = 6, c 1·1·3 = 5
    expect(matchOver(rank3, rounds)).toBe(true);
    const tie = [
      round({ a: 1, b: 2, c: 3 }),
      round({ b: 1, a: 2, c: 3 }),
      round({ c: 1, a: 3, b: 3 }),
    ];
    // a 3·2·2 = 7, b 2·3·2 = 7(같은 시간은 같은 등수), c 1·1·3 = 5
    let m = pointsMatch(rank3, tie);
    expect(m.over).toBe(false);
    expect(m.tied.sort()).toEqual(["a", "b"]);
    // 서든데스 판: c가 가장 빨라도 동점자가 아니라 셈하지 않는다. 동점자 둘 다 못 맞추면 한 판 더
    tie.push(round({ c: 1, a: "dnf", b: "dnf" }));
    m = pointsMatch(rank3, tie);
    expect([m.over, m.suddenDeath]).toEqual([false, 1]);
    tie.push(round({ c: 1, b: 5, a: 6 }));
    m = pointsMatch(rank3, tie);
    expect([m.over, m.suddenDeathWinner]).toEqual([true, "b"]);
    const rows = standings(rank3, ["a", "b", "c"], tie);
    // 서든데스는 점수를 더하지 않는다. 같은 점수에서 서든데스 승자가 1등
    expect(rows.map((r) => [r.id, r.points, r.place])).toEqual([
      ["b", 7, 1],
      ["a", 7, 2],
      ["c", 5, 3],
    ]);
    // 경기가 정해진 뒤 더 연 판은 셈에 넣지 않는다(방장이 판을 더 열어도 순위가 바뀌지 않는다)
    tie.push(round({ a: 1, b: 9, c: 9 }));
    expect(standings(rank3, ["a", "b", "c"], tie).map((r) => r.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("판정 없음 판은 판 수에 세지 않아 한 판 더 가고, 다툼(셋 이상)은 그 사람만 0점·승자 아님", () => {
    const voided = round({ a: "disputed", b: 9 }, { noDecision: true });
    const a = round({ a: 1, b: 2 });
    expect(matchOver(wins5, [a, voided, a])).toBe(false);
    expect(pointsMatch(wins5, [a, voided, a]).played).toBe(2);
    expect(matchOver(wins5, [a, voided, a, a])).toBe(true);
    // 셋 이상에서 다툼: 다툼인 a는 이 판에서 승자도 아니고 순위 점수도 0
    const disputed = round({ a: "disputed", b: 5, c: 6 });
    expect(rankPoints(disputed.result)).toEqual({ b: 3, c: 2 });
    const rows = standings(wins5, ["a", "b", "c"], [disputed]);
    expect(rows.find((r) => r.id === "b")?.points).toBe(1);
    expect(rows.find((r) => r.id === "a")?.points).toBe(0);
  });
});

// ---- 두 기기(방장·손님, 기기마다 RaceHub 하나) ----

const SHORT = ["R U", "F R'", "U2 R F'"];
const fake: Scrambler = (event, seed) => ({
  event,
  text: SHORT[seed % SHORT.length] as string,
  official: false,
});

/** 받은 방 상태의 설정을 바꿔 넘기는 연결(방장이 이 기기에만 다른 방 상태를 보낸 것과 같다) */
function tampered(base: Transport, patch: Partial<RoomSettings>): Transport {
  return {
    selfId: base.selfId,
    send: (m, to) => base.send(m, to),
    onMessage: (h) =>
      base.onMessage((m, from) => {
        const msg = m as { type?: string; state?: { settings: RoomSettings } };
        if (msg.type === "cube-room" && msg.state)
          h(
            {
              ...msg,
              state: {
                ...msg.state,
                settings: { ...msg.state.settings, ...patch },
              },
            },
            from,
          );
        else h(m, from);
      }),
    onPeerJoin: (h) => base.onPeerJoin(h),
    onPeerLeave: (h) => base.onPeerLeave(h),
    leave: () => base.leave(),
  };
}

function setup(
  settings: Partial<RoomSettings>,
  guestPatch?: Partial<RoomSettings>,
) {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const host = new CubeRoom({
    transport: net.join("h"),
    clock,
    isHost: true,
    name: "방장",
    scrambler: fake,
    settings: { n: 2, inspection: false, timeLimitSec: 60, ...settings },
  });
  const joined = net.join("g");
  const guest = new CubeRoom({
    transport: guestPatch ? tampered(joined, guestPatch) : joined,
    clock,
    isHost: false,
    hostId: "h",
    name: "손님",
    scrambler: fake,
  });
  clock.advance(100);
  return { clock, net, host, guest };
}

/** 판마다 풀림 뒤 `delays[판 번호 - 1]` ms에 섞기의 거꾸로를 둔다(null이면 두지 않음 = DNF) */
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
    const text = fake("222", scrambleSeed(snap.seed as string)) as {
      text: string;
    };
    const moves = invertMoves(parseMoves(2, text.text));
    clock.after(delay, () => {
      for (const m of moves) s.play(m as CubeMove);
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

describe("점수제 경기(두 기기)", () => {
  it("판 수·점수가 손님에게 전해지고, 두 기기가 같은 점수·서든데스·최종 순위를 낸다", () => {
    const { clock, host, guest } = setup({
      format: "points",
      rounds: 3,
      scoring: "rank",
    });
    expect(guest.state?.settings).toMatchObject({
      format: "points",
      rounds: 3,
      scoring: "rank",
    });
    // 방장 2점·손님 1점 / 손님 2점·방장 1점 / 둘 다 못 맞춤 → 3:3 → 서든데스(방장이 먼저)
    solveRounds(clock, host, [100, 50_000, null, 200]);
    solveRounds(clock, guest, [50_000, 100, null, 300]);
    for (let k = 1; k <= 3; k++) {
      playRound(clock, host, guest);
      expect(guest.rounds[k - 1]?.result).toEqual(host.rounds[k - 1]?.result);
    }
    const ids = ["h", "g"];
    const rules = {
      format: "points",
      target: 3,
      rounds: 3,
      scoring: "rank",
    } as const;
    const hm = pointsMatch(rules, host.rounds);
    expect(pointsMatch(rules, guest.rounds)).toEqual(hm);
    expect(Object.fromEntries(hm.scores)).toEqual({ h: 3, g: 3 });
    expect(hm.over).toBe(false);
    expect([...hm.tied].sort()).toEqual(["g", "h"]);
    expect(host.state?.status).toBe("between");
    expect(guest.matchOver()).toBe(false);
    playRound(clock, host, guest);
    expect(pointsMatch(rules, guest.rounds).suddenDeathWinner).toBe("h");
    expect(host.matchOver()).toBe(true);
    expect(guest.matchOver()).toBe(true);
    expect(host.state?.status).toBe("over");
    runUntil(clock, () => guest.state?.status === "over");
    const table = standings(rules, ids, host.rounds);
    expect(standings(rules, ids, guest.rounds)).toEqual(table);
    expect(table.map((r) => [r.id, r.points, r.place])).toEqual([
      ["h", 3, 1],
      ["g", 3, 2],
    ]);
    // 경기가 끝나면 방장도 판을 더 열지 못한다(새 경기부터)
    expect(host.startRound()).toBe(false);
  });

  it("방장이 한 손님에게만 다른 판 수를 알리면 판정 설정 지문이 달라 판이 열리지 않는다", () => {
    const { clock, host, guest } = setup(
      { format: "points", rounds: 5, scoring: "wins" },
      { rounds: 3 },
    );
    expect(guest.state?.settings.rounds).toBe(3);
    host.startRound();
    runUntil(
      clock,
      () => host.rounds.length === 1 && guest.rounds.length === 1,
      60_000,
      50,
    );
    const r = host.rounds[0]?.result;
    expect(r?.ranking.every((id) => r.players[id]?.status !== "done")).toBe(
      true,
    );
    expect(r?.cancelled ?? Object.values(r?.players ?? {})[0]?.reason).toMatch(
      /섞기 어긋남|열지 못/,
    );
    // 열지 못한 판은 판 수에 세지 않는다
    expect(
      pointsMatch(
        matchRules((host.state as { settings: RoomSettings }).settings),
        host.rounds,
      ).played,
    ).toBe(0);
  });
});

describe("옛 판과 함께 가기", () => {
  it("점수제가 아니면 판정 설정 지문이 예전과 같다(gameOptions 없음)", () => {
    const base: RoomSettings = {
      n: 3,
      format: "ao5",
      target: 3,
      inspection: true,
      timeLimitSec: 300,
    };
    expect(raceOptionsFor(base)).not.toHaveProperty("gameOptions");
    expect(raceOptionsFor({ ...base, rounds: 7, scoring: "rank" })).toEqual(
      raceOptionsFor(base),
    );
    expect(
      raceOptionsFor({ ...base, format: "points", rounds: 7, scoring: "rank" })
        .gameOptions,
    ).toEqual({ match: "points", rounds: 7, scoring: "rank" });
  });

  it("판 수·점수 칸이 없는 옛 방장의 방 상태도 받고, 점수제인데 판 수가 목록 밖이면 버린다", () => {
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
    const state = (v: number, settings: Record<string, unknown>) => ({
      type: "cube-room",
      state: {
        v,
        host: "h",
        settings: {
          n: 3,
          target: 3,
          inspection: true,
          timeLimitSec: 300,
          ...settings,
        },
        players: [{ id: "h", name: "옛 방장", device: "h" }],
        round: 0,
        status: "lobby",
      },
    });
    old.send(state(2, { format: "ao5" }));
    clock.advance(100);
    expect(guest.state?.settings.format).toBe("ao5");
    expect(guest.matchOver()).toBe(false);
    old.send(state(3, { format: "points", rounds: 1000, scoring: "wins" }));
    old.send(state(4, { format: "points", rounds: 5, scoring: "가장 늦게" }));
    clock.advance(100);
    expect(guest.state?.v).toBe(2);
    old.send(state(5, { format: "points", rounds: 7, scoring: "rank" }));
    clock.advance(100);
    expect(guest.state?.settings).toMatchObject({ rounds: 7, scoring: "rank" });
  });
});
