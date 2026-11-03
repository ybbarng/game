import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import type { Transport } from "@/net/transport";
import { type Scrambler, scrambleSeed } from "./race-game";
import { CubeRoom, type RoomState } from "./room";
import { averageOf5, matchOver, standings } from "./standings";

/** 큐브 경주 방: 대기실 → 판 → 결과(ManualClock·DelayNet, 결정적) */

const SHORT = ["R U", "F R'", "U2 R F'"];
const fake: Scrambler = (event, seed) => ({
  event,
  text: SHORT[seed % SHORT.length] as string,
  official: false,
});

function setup() {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const host = new CubeRoom({
    transport: net.join("h"),
    clock,
    isHost: true,
    name: "방장",
    scrambler: fake,
    settings: { n: 2, inspection: false, timeLimitSec: 60 },
  });
  const guest = new CubeRoom({
    transport: net.join("g"),
    clock,
    isHost: false,
    name: "  손님   하나 ",
    scrambler: fake,
  });
  clock.advance(100);
  return { clock, net, host, guest };
}

/** 내 경주가 풀리면 `delay` 뒤 섞기의 거꾸로를 한 번에 둔다 */
function solveWhenReleased(clock: ManualClock, room: CubeRoom, delay: number) {
  let done = "";
  room.onChange(() => {
    const s = room.session();
    const snap = s?.snapshot();
    if (!s || snap?.phase !== "race" || done === `${room.state?.race?.id}`)
      return;
    done = `${room.state?.race?.id}`;
    const text = fake("222", scrambleSeed(snap.seed as string)).valueOf() as {
      text: string;
    };
    const moves = invertMoves(parseMoves(2, text.text));
    clock.after(delay, () => {
      for (const m of moves) s.play(m as CubeMove);
    });
  });
}

describe("큐브 경주 방", () => {
  it("손님이 들어오면 이름이 실린 방 상태를 받고, 방장이 컴퓨터를 더해 판을 열면 모두 같은 결과를 낸다", () => {
    const { clock, host, guest } = setup();
    expect(guest.state?.players.map((p) => p.name)).toEqual([
      "방장",
      "손님 하나",
    ]);
    host.setSettings({ format: "ao5" });
    host.addBot("expert");
    clock.advance(100);
    expect(guest.state?.players).toHaveLength(3);
    expect(guest.state?.settings.format).toBe("ao5");

    solveWhenReleased(clock, host, 500);
    solveWhenReleased(clock, guest, 300);
    for (let round = 1; round <= 2; round++) {
      expect(host.startRound()).toBe(true);
      runUntil(
        clock,
        () => host.rounds.length === round && guest.rounds.length === round,
        120_000,
        50,
      );
      expect(guest.rounds[round - 1]?.result).toEqual(
        host.rounds[round - 1]?.result,
      );
      runUntil(clock, () => guest.state?.status === "between");
    }
    const players = host.state?.players.map((p) => p.id) as string[];
    const table = standings("ao5", players, host.rounds);
    expect(table.map((r) => r.id)).toEqual(
      standings("ao5", players, guest.rounds).map((r) => r.id),
    );
    // 섞기 글·수 기록이 남아 다시 볼 수 있다
    const last = guest.rounds.at(-1);
    expect(last?.scramble.length).toBeGreaterThan(0);
    expect(last?.logs.bot1?.length).toBeGreaterThan(0);
    expect(host.state?.status).toBe("between");
  });

  it("판 도중에는 설정을 바꾸거나 사람을 뺄 수 없다", () => {
    const { host } = setup();
    expect(host.startRound()).toBe(true);
    host.setSettings({ n: 3 });
    host.removePlayer("g");
    expect(host.state?.settings.n).toBe(2);
    expect(host.state?.players).toHaveLength(2);
  });

  it("연결 아이디가 컴퓨터 아이디 모양(bot2)인 손님은 받지 않아 방이 멈추지 않는다", () => {
    const { clock, net, host, guest } = setup();
    net.join("bot2").send({ type: "cube-hello", name: "끼어든 사람" });
    clock.advance(100);
    host.addBot("expert");
    clock.advance(100);
    // 받았다면 손님은 그 뒤 방 상태(사람 bot2가 든 표)를 모두 버려 v가 멈춘다
    expect(guest.state?.v).toBe(host.state?.v);
    expect(guest.state?.players.map((p) => p.id)).toEqual(["h", "g", "bot1"]);
  });

  it("4×4 이상으로 바꾸면 컴퓨터를 뺀다(컴퓨터는 2×2·3×3만)", () => {
    const { clock, host, guest } = setup();
    host.fillWithBots("beginner");
    expect(host.state?.players).toHaveLength(8);
    host.setSettings({ n: 4 });
    clock.advance(100);
    expect(guest.state?.players.map((p) => p.id)).toEqual(["h", "g"]);
  });
});

/**
 * 남의 결과 꾸미기(검토에서 재현한 공격). 방장 h, 손님 a·b·M. 그물이라 누구나 한 사람에게만 직접 보낼 수 있다.
 * 공격자는 b에게만 "a의 기기는 나"라는 방 상태를 보내고, a 이름으로 0.1초 만에 맞춘 수를 보낸다.
 * a는 아무것도 두지 않으므로 정직한 결과는 a DNF다.
 */
function attackSetup() {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const ids = ["h", "a", "b", "M"] as const;
  const t = Object.fromEntries(ids.map((id) => [id, net.join(id)])) as Record<
    (typeof ids)[number],
    Transport
  >;
  const rooms = Object.fromEntries(
    ids.map((id) => [
      id,
      new CubeRoom({
        transport: t[id],
        clock,
        isHost: id === "h",
        name: id,
        scrambler: fake,
        ...(id === "h"
          ? { settings: { n: 2, inspection: false, timeLimitSec: 60 } }
          : {}),
      }),
    ]),
  ) as Record<(typeof ids)[number], CubeRoom>;
  clock.advance(100);
  return { clock, t, rooms };
}

/** 방 상태를 고쳐 쓴 사본 */
function forged(state: RoomState, patch: Partial<RoomState>): RoomState {
  return { ...(JSON.parse(JSON.stringify(state)) as RoomState), ...patch };
}

/** `who`가 0.1초 만에 맞춘 것처럼 수·맞춤 알림을 `from` 연결로 `to`에게만 보낸다 */
function sendFakeSolve(
  from: Transport,
  to: string,
  victim: CubeRoom,
  who: string,
) {
  const snap = victim.session()?.snapshot();
  const game = victim.game();
  const race = victim.state?.race?.id;
  if (!snap?.seed || !game || !race) throw new Error("판이 열리지 않음");
  const { text } = fake("222", scrambleSeed(snap.seed)) as { text: string };
  const moves = invertMoves(parseMoves(2, text)).map((m, i) => ({
    i,
    m: game.encodeMove(m as CubeMove),
    t: 30 + i * 30,
  }));
  const wrap = (m: unknown) => ({ type: "cube-race", f: who, m });
  from.send(
    wrap({ type: "race-moves", race, attempt: snap.attempt, moves }),
    to,
  );
  from.send(
    wrap({
      type: "race-done",
      race,
      attempt: snap.attempt,
      n: moves.length,
      t: 102,
    }),
    to,
  );
}

describe("큐브 경주 방: 남의 결과를 꾸미지 못한다", () => {
  const raceOn = (clock: ManualClock, rooms: Record<string, CubeRoom>) =>
    runUntil(clock, () =>
      Object.values(rooms).every(
        (r) => r.session()?.snapshot().phase === "race",
      ),
    );
  const roundOver = (clock: ManualClock, rooms: Record<string, CubeRoom>) =>
    runUntil(
      clock,
      () => Object.values(rooms).every((r) => r.rounds.length === 1),
      120_000,
      100,
    );

  it("손님 M이 b에게만 '방장은 M, a의 기기는 M'인 방 상태를 보내고 a 이름으로 수를 보내도 b는 받지 않는다", () => {
    const { clock, t, rooms } = attackSetup();
    expect(rooms.h.startRound()).toBe(true);
    raceOn(clock, rooms);
    const state = rooms.M.state as RoomState;
    t.M.send(
      {
        type: "cube-room",
        state: forged(state, {
          v: state.v + 1000,
          host: "M",
          players: state.players.map((p) =>
            p.id === "a" ? { ...p, device: "M" } : p,
          ),
        }),
      },
      "b",
    );
    clock.advance(30);
    sendFakeSolve(t.M, "b", rooms.b, "a");
    roundOver(clock, rooms);
    expect(rooms.b.state?.host).toBe("h");
    expect(rooms.b.rounds[0]?.result.players.a?.status).toBe("dnf");
    expect(rooms.b.rounds[0]?.result).toEqual(rooms.h.rounds[0]?.result);
  });

  it("방장 h가 b에게만 a의 기기를 h로(또는 a를 컴퓨터로) 바꾼 방 상태를 보내도 b는 a 이름의 수를 h에게서 받지 않는다", () => {
    const { clock, t, rooms } = attackSetup();
    expect(rooms.h.startRound()).toBe(true);
    raceOn(clock, rooms);
    const state = rooms.h.state as RoomState;
    t.h.send(
      {
        type: "cube-room",
        state: forged(state, {
          v: state.v + 1,
          players: state.players.map((p) =>
            p.id === "a" ? { ...p, device: "h" } : p,
          ),
        }),
      },
      "b",
    );
    t.h.send(
      {
        type: "cube-room",
        state: forged(state, {
          v: state.v + 2,
          players: state.players.map((p) =>
            p.id === "a" ? { ...p, device: "h", bot: "beginner" } : p,
          ),
        }),
      },
      "b",
    );
    clock.advance(30);
    sendFakeSolve(t.h, "b", rooms.b, "a");
    roundOver(clock, rooms);
    expect(rooms.b.rounds[0]?.result.players.a?.status).toBe("dnf");
    expect(rooms.b.rounds[0]?.result).toEqual(rooms.h.rounds[0]?.result);
  });

  it("판 도중 방장이 참가자 표를 바꾼 방 상태를 보내도 그 판은 열 때의 표대로 받는다", () => {
    const { clock, t, rooms } = attackSetup();
    solveWhenReleased(clock, rooms.a, 300);
    expect(rooms.h.startRound()).toBe(true);
    raceOn(clock, rooms);
    const state = rooms.h.state as RoomState;
    t.h.send(
      {
        type: "cube-room",
        state: forged(state, {
          v: state.v + 1,
          players: state.players.filter((p) => p.id !== "a"),
        }),
      },
      "b",
    );
    roundOver(clock, rooms);
    expect(rooms.b.rounds[0]?.result.players.a?.status).toBe("done");
    expect(rooms.b.rounds[0]?.result).toEqual(rooms.h.rounds[0]?.result);
  });

  /**
   * 먼저 꾸민 손님: b가 들어오는 순간(hello를 받자마자) M이 "방장은 M"인 방 상태를 b에게 보낸다.
   * 방장 h의 답은 늦게 닿는다(h→b 200ms, M→b 5ms)
   */
  function earlyForger(hostId?: string) {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    net.setDelay("h", "b", 200);
    net.setDelay("M", "b", 5);
    const h = new CubeRoom({
      transport: net.join("h"),
      clock,
      isHost: true,
      name: "h",
      scrambler: fake,
    });
    const M = net.join("M");
    M.onMessage((raw, from) => {
      const m = raw as { type?: string };
      if (m.type !== "cube-hello" || from !== "b") return;
      const state: RoomState = forged(h.state as RoomState, {
        v: 1000,
        host: "M",
        players: [
          { id: "M", name: "M", device: "M" },
          { id: "b", name: "b", device: "b" },
        ],
      });
      M.send({ type: "cube-room", state }, "b");
    });
    const b = new CubeRoom({
      transport: net.join("b"),
      clock,
      isHost: false,
      ...(hostId ? { hostId } : {}),
      name: "b",
      scrambler: fake,
    });
    clock.advance(500);
    return { h, b };
  }

  it("링크에 방장 아이디가 없으면(옛 링크) 방장보다 먼저 방 상태를 보낸 손님을 방장으로 믿는다(못 막는 것)", () => {
    const { b } = earlyForger();
    expect(b.state?.host).toBe("M");
  });

  it("링크에 방장 아이디가 있으면 방장보다 먼저 방 상태를 보낸 손님을 믿지 않는다", () => {
    const { h, b } = earlyForger("h");
    expect(b.state?.host).toBe("h");
    expect(b.state?.v).toBe(h.state?.v);
    expect(b.state?.players.map((p) => p.id)).toEqual(["h", "b"]);
  });

  it("손님이 보낸 round:0 방 상태로 남의 판 기록을 지우거나 판 진행을 바꾸지 못한다", () => {
    const { clock, t, rooms } = attackSetup();
    expect(rooms.h.startRound()).toBe(true);
    roundOver(clock, rooms);
    runUntil(clock, () => rooms.b.state?.status === "over");
    const state = rooms.M.state as RoomState;
    const { race: _race, ...rest } = state;
    t.M.send(
      {
        type: "cube-room",
        state: {
          ...rest,
          v: state.v + 1000,
          host: "M",
          round: 0,
          status: "lobby",
        },
      },
      "b",
    );
    t.M.send(
      {
        type: "cube-room",
        state: forged(state, { v: state.v + 1000, status: "between" }),
      },
      "b",
    );
    clock.advance(100);
    expect(rooms.b.rounds).toHaveLength(1);
    expect(rooms.b.state?.round).toBe(1);
    expect(rooms.b.state?.status).toBe("over");
  });
});

describe("종합 순위", () => {
  it("5판 평균은 가장 좋은·나쁜 판을 빼고, 못 맞춘 판이 둘이면 DNF", () => {
    expect(averageOf5([10, 20, 30, 40, 50])).toBe(30);
    expect(averageOf5([10, null, 30, 40, 50])).toBe(40);
    expect(averageOf5([10, null, 30, null, 50])).toBeNull();
    expect(averageOf5([10, 20])).toBe(15);
  });

  it("먼저 N판: 이긴 판 수로 끝난다", () => {
    const win = (id: string) => ({
      result: {
        ranking: [id, id === "a" ? "b" : "a"],
        players: {
          a: { id: "a", status: "done" as const, moves: 1, accepted: 1 },
          b: { id: "b", status: "done" as const, moves: 1, accepted: 2 },
        },
      },
    });
    const rounds = [win("a"), win("b"), win("a")];
    expect(matchOver("firstTo", 2, rounds)).toBe(true);
    expect(matchOver("firstTo", 3, rounds)).toBe(false);
    expect(standings("firstTo", ["a", "b"], rounds)[0]).toMatchObject({
      id: "a",
      wins: 2,
    });
  });
});
