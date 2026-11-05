import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import type { Transport } from "@/net/transport";
import { type Scrambler, scrambleSeed } from "./race-game";
import { CubeRoom, type RoomState } from "./room";
import { averageOf5, matchOver, standings } from "./standings";

/** 큐브 대결 방: 대기실 → 판 → 결과(ManualClock·DelayNet, 결정적) */

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

/** 내 대결이 풀리면 `delay` 뒤 섞기의 거꾸로를 한 번에 둔다 */
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

describe("큐브 대결 방", () => {
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

  it("4×4·5×5로 바꿔도 컴퓨터가 남고, 빈자리에 더할 수 있다", () => {
    const { clock, host, guest } = setup();
    host.addBot("beginner");
    host.setSettings({ n: 5 });
    host.addBot("expert");
    clock.advance(100);
    expect(guest.state?.settings.n).toBe(5);
    expect(guest.state?.players.map((p) => [p.id, p.bot])).toEqual([
      ["h", undefined],
      ["g", undefined],
      ["bot1", "beginner"],
      ["bot2", "expert"],
    ]);
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

describe("큐브 대결 방: 남의 결과를 꾸미지 못한다", () => {
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

  it("판을 여는 방 상태에서 방장이 b에게만 a의 기기를 h로 바꿔 보내면 b는 그 표를 받지 않는다(사람은 자기 기기만)", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    // 방장 h가 b에게 가는 판 여는 방 상태만 고쳐 쓴다
    net.filter = (m, from, to) => {
      const msg = m as { type?: string; state?: RoomState };
      if (
        from === "h" &&
        to === "b" &&
        msg.type === "cube-room" &&
        msg.state?.status === "racing"
      )
        for (const p of msg.state.players) if (p.id === "a") p.device = "h";
      return m;
    };
    const rooms = Object.fromEntries(
      (["h", "a", "b"] as const).map((id) => [
        id,
        new CubeRoom({
          transport: net.join(id),
          clock,
          isHost: id === "h",
          name: id,
          scrambler: fake,
          ...(id === "h" ? { settings: { n: 2, inspection: false } } : {}),
        }),
      ]),
    ) as Record<"h" | "a" | "b", CubeRoom>;
    clock.advance(100);
    const lobby = rooms.b.state?.v;
    expect(rooms.h.startRound()).toBe(true);
    clock.advance(100);
    expect(rooms.a.state?.status).toBe("racing");
    expect(rooms.b.state?.v).toBe(lobby);
    expect(rooms.b.state?.players.find((p) => p.id === "a")?.device).toBe("a");
    expect(rooms.b.session()).toBeUndefined();
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

describe("큐브 대결 방: 한 기기·이름 흉내", () => {
  it("④ 방장 기기의 사람과 컴퓨터가 함께 손님 하한을 크게 지어내도 기기 하나로만 세어(컴퓨터는 증인 아님) 손님 시간은 「확인 안 됨」(순위 없음)이다", () => {
    const { clock, net, host, guest } = setup();
    host.addBot("expert");
    clock.advance(100);
    // 방장 기기에서 나가는 손님 하한(방장 사람·컴퓨터 둘 다)을 9,999초 늘린다
    net.filter = (m, from) => {
      const env = m as {
        type?: string;
        m?: { type?: string; of?: string; bound?: number | null };
      };
      if (
        from === "h" &&
        env.type === "cube-race" &&
        env.m?.type === "race-bound" &&
        env.m.of === "g" &&
        typeof env.m.bound === "number"
      )
        env.m.bound += 9_999_000;
      return m;
    };
    solveWhenReleased(clock, guest, 300);
    expect(host.startRound()).toBe(true);
    runUntil(
      clock,
      () => guest.rounds.length === 1 && host.rounds.length === 1,
      120_000,
      50,
    );
    const g = guest.rounds[0]?.result.players.g;
    expect(Object.keys(g?.bounds ?? {})).toEqual(["h"]);
    expect(g?.disputed).toBe(true);
    // 판에 셋(방장·컴퓨터·손님)이라 판 전체가 아니라 손님만 순위 없음
    expect(g?.unranked).toBe(true);
    expect(g?.accepted).toBeUndefined();
    expect(guest.rounds[0]?.result.noDecision).toBeUndefined();
    // 거짓을 보낸 방장 기기는 자기 참값을 가진다(컴퓨터 하한은 거기서도 쓰지 않는다)
    expect(Object.keys(host.rounds[0]?.result.players.g?.bounds ?? {})).toEqual(
      ["h"],
    );
  });

  it("채팅은 메시지에 적힌 이름 대신 보낸 기기의 참가자 이름으로 보이고, 같은 이름은 「이름 (2)」로 구분한다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const heard: { name: string; text: string }[] = [];
    const host = new CubeRoom({
      transport: net.join("h"),
      clock,
      isHost: true,
      name: "방장",
      scrambler: fake,
      onChat: (m) => heard.push({ name: m.name, text: m.text }),
    });
    const t = net.join("g");
    const guest = new CubeRoom({
      transport: t,
      clock,
      isHost: false,
      name: "방장",
      scrambler: fake,
    });
    clock.advance(100);
    t.send({ type: "cube-chat", id: "x", name: "방장", text: "내가 방장" });
    clock.advance(100);
    expect(heard).toEqual([{ name: "방장 (2)", text: "내가 방장" }]);
    expect(host.playerName("h")).toBe("방장");
    expect(guest.playerName("g")).toBe("방장 (2)");
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
    expect(matchOver({ format: "firstTo", target: 2 }, rounds)).toBe(true);
    expect(matchOver({ format: "firstTo", target: 3 }, rounds)).toBe(false);
    expect(standings("firstTo", ["a", "b"], rounds)[0]).toMatchObject({
      id: "a",
      wins: 2,
    });
  });

  it("판정 없음(두 기기 기록이 다름) 판은 승수·평균·판 수에 넣지 않는다", () => {
    const voided = {
      result: {
        ranking: ["b", "a"],
        noDecision: true,
        players: {
          a: {
            id: "a",
            status: "done" as const,
            moves: 1,
            disputed: true,
            unranked: true,
            reported: 1,
          },
          b: { id: "b", status: "done" as const, moves: 1, accepted: 9 },
        },
      },
    };
    expect(matchOver({ format: "single", target: 1 }, [voided])).toBe(false);
    expect(matchOver({ format: "firstTo", target: 1 }, [voided])).toBe(false);
    const rows = standings("ao5", ["a", "b"], [voided]);
    expect(rows.every((r) => r.times.length === 0 && r.wins === 0)).toBe(true);
  });
});
