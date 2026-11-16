import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, OffsetClock, runUntil } from "@/net/race/race-fixture";
import type { RaceResult } from "@/net/race/types";
import { type Scrambler, scrambleSeed } from "./race-game";
import { CubeRoom, REJOIN_GRACE_MS, type RoomSettings } from "./room";
import type { SeatStore } from "./seat";

/**
 * 새로고침 뒤 대결 자리 되찾기(docs/47 9-11). 새로고침은 「방을 버리고 연결이 끊긴 뒤, 같은 탭 저장소로 새 연결의 방을 만든다」로
 * 흉내 낸다. 새 연결은 아이디가 다르고(trystero가 새로 정한다), 새 페이지의 시계는 0 근처에서 다시 잰다.
 */

const SCRAMBLES = ["R U F", "F R' U", "U2 R F'"];
const fake: Scrambler = (event, seed) => ({
  event,
  text: SCRAMBLES[seed % SCRAMBLES.length] as string,
  official: false,
});

/** 탭의 sessionStorage 흉내 */
function memoryStore(): SeatStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => {
      data.set(k, v);
    },
  };
}

const SETTINGS: Partial<RoomSettings> = {
  n: 2,
  inspection: false,
  timeLimitSec: 60,
};

function setup(players = ["g"], settings = SETTINGS) {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const wall = () => clock.now() + 1_700_000_000_000;
  const host = new CubeRoom({
    transport: net.join("h"),
    clock,
    wall,
    isHost: true,
    name: "방장",
    scrambler: fake,
    settings,
  });
  const stores = new Map<string, ReturnType<typeof memoryStore>>();
  const guests = new Map<string, CubeRoom>();
  for (const id of players) {
    const store = memoryStore();
    stores.set(id, store);
    guests.set(
      id,
      new CubeRoom({
        transport: net.join(id),
        clock,
        wall,
        isHost: false,
        hostId: "h",
        name: `손님 ${id}`,
        scrambler: fake,
        seat: store,
      }),
    );
  }
  clock.advance(200);
  /** 손님 `id`의 탭을 새로 고친다: 방을 버리고 끊긴 뒤 `awayMs` 지나 새 연결 `next`로 같은 탭 저장소를 들고 돌아온다 */
  const reload = (room: CubeRoom, next: string, awayMs: number) => {
    const store = stores.get(room.me) as ReturnType<typeof memoryStore>;
    room.dispose();
    net.disconnect(room.device);
    clock.advance(awayMs);
    const fresh = new CubeRoom({
      transport: net.join(next),
      // 새 페이지의 세션 시계는 처음부터 다시 잰다
      clock: new OffsetClock(clock, -clock.now() + 3),
      wall,
      isHost: false,
      hostId: "h",
      name: `손님 ${room.me}`,
      scrambler: fake,
      seat: store,
    });
    return fresh;
  };
  return { clock, net, host, guests, stores, reload };
}

/** 내 섞기를 푸는 수(섞기의 거꾸로) */
function solutionOf(room: CubeRoom): CubeMove[] {
  const seed = room.session()?.snapshot().seed as string;
  const text = SCRAMBLES[scrambleSeed(seed) % SCRAMBLES.length] as string;
  return invertMoves(parseMoves(2, text)) as CubeMove[];
}

function raceOn(room: CubeRoom) {
  return room.session()?.snapshot().phase === "race";
}

describe("큐브 대결 방: 새로고침 뒤 자리 되찾기", () => {
  it("판 도중 손님이 새로고침하면 같은 참가자 자리로 돌아와 맞추던 큐브·시간·상대 상황을 이어 가고, 모든 기기가 같은 결과를 낸다", () => {
    const { clock, host, guests, reload } = setup();
    const guest = guests.get("g") as CubeRoom;
    expect(host.startRound()).toBe(true);
    runUntil(clock, () => raceOn(guest) && raceOn(host));
    const moves = solutionOf(guest);
    expect(guest.play(moves[0] as CubeMove).ok).toBe(true);
    // 방장은 조금 뒤 한 수 둔다(상대 상황)
    expect(host.play(solutionOf(host)[0] as CubeMove).ok).toBe(true);
    clock.advance(100);
    const cubeBefore = guest.session()?.stateOf("g");
    const elapsedBefore = guest.session()?.snapshot().elapsed as number;

    const back = reload(guest, "g2", 2_000);
    expect(back.me).toBe("g");
    expect(back.device).toBe("g2");
    runUntil(
      clock,
      () => raceOn(back) && back.state?.players[1]?.device === "g2",
    );
    // 같은 참가자 표, 같은 큐브 상태, 상대가 둔 수도 다시 받았다
    expect(back.state?.players.map((p) => p.id)).toEqual(["h", "g"]);
    expect(host.state?.players.map((p) => [p.id, p.device])).toEqual([
      ["h", "h"],
      ["g", "g2"],
    ]);
    expect(back.session()?.stateOf("g")).toEqual(cubeBefore);
    expect(back.session()?.moveLog("h")).toHaveLength(1);
    // 비운 2초도 흘렀다(멈추지 않음)
    expect(back.session()?.snapshot().elapsed).toBeGreaterThanOrEqual(
      elapsedBefore + 2_000,
    );
    for (const m of moves.slice(1)) expect(back.play(m).ok).toBe(true);
    runUntil(clock, () => host.rounds.length === 1 && back.rounds.length === 1);
    const a = host.rounds[0]?.result as RaceResult;
    expect(back.rounds[0]?.result).toEqual(a);
    expect(a.players.g).toMatchObject({ status: "done", moves: moves.length });
    expect(a.players.g?.reported).toBeGreaterThan(elapsedBefore + 2_000);
  });

  it("살펴보기 중 새로고침해도 풀림 시각이 그대로라 살펴보기를 늘리지 못한다", () => {
    const { clock, host, guests, reload } = setup(["g"], {
      ...SETTINGS,
      inspection: true,
    });
    const guest = guests.get("g") as CubeRoom;
    host.startRound();
    runUntil(clock, () => guest.session()?.snapshot().phase === "inspect");
    clock.advance(3_000);
    const left = guest.session()?.snapshot().inspectionLeft as number;
    const at = clock.now();
    const back = reload(guest, "g2", 4_000);
    runUntil(clock, () => back.session()?.snapshot().seed !== undefined);
    expect(back.session()?.snapshot().seed).toBe(
      host.session()?.snapshot().seed,
    );
    expect(back.session()?.snapshot().inspectionLeft).toBe(
      left - (clock.now() - at),
    );
  });

  it("판 사이에 나간 손님은 30초 안에 돌아오면 같은 자리로, 넘기면 표에서 빠진다", () => {
    const { clock, net, host, guests, reload } = setup(["g", "k"]);
    const g = guests.get("g") as CubeRoom;
    const k = guests.get("k") as CubeRoom;
    const back = reload(g, "g2", REJOIN_GRACE_MS - 1_000);
    runUntil(clock, () => host.state?.players[1]?.device === "g2");
    // 다른 손님도 저마다 확인하고 받는다
    runUntil(clock, () => k.state?.players[1]?.device === "g2");
    clock.advance(5_000);
    expect(host.state?.players.map((p) => p.id)).toEqual(["h", "g", "k"]);
    expect(back.state?.players.map((p) => p.id)).toEqual(["h", "g", "k"]);

    // k는 돌아오지 않는다
    k.dispose();
    net.disconnect("k");
    clock.advance(REJOIN_GRACE_MS - 1_000);
    expect(host.state?.players.map((p) => p.id)).toEqual(["h", "g", "k"]);
    // 자리를 남겨 둔 채 끊긴 사람은 새 판에 넣지 않는다
    clock.advance(2_000);
    expect(host.state?.players.map((p) => p.id)).toEqual(["h", "g"]);
    expect(back.state?.players.map((p) => p.id)).toEqual(["h", "g"]);
  });

  it("자리를 남겨 둔 채 끊긴 손님은 새 판에 넣지 않는다", () => {
    const { clock, net, host, guests } = setup(["g", "k"]);
    const k = guests.get("k") as CubeRoom;
    k.dispose();
    net.disconnect("k");
    clock.advance(1_000);
    expect(host.startRound()).toBe(true);
    expect(host.state?.race?.players).toEqual(["h", "g"]);
  });

  it("방장이 확인하지 못한 자리(토큰이 다른 남겨 둔 자리)는 되찾지 못하고 새 손님으로 들어간다", () => {
    const { clock, net, host } = setup([]);
    const store = memoryStore();
    store.set(
      "seat",
      JSON.stringify({
        v: 1,
        me: "someone",
        host: "h",
        n: 0,
        given: { h: "엉뚱한-토큰" },
        got: {},
      }),
    );
    const room = new CubeRoom({
      transport: net.join("z"),
      clock,
      isHost: false,
      hostId: "h",
      name: "새 손님",
      scrambler: fake,
      seat: store,
    });
    expect(room.me).toBe("someone");
    clock.advance(200);
    expect(room.me).toBe("z");
    expect(room.reclaiming).toBeNull();
    expect(host.state?.players.map((p) => [p.id, p.device])).toEqual([
      ["h", "h"],
      ["z", "z"],
    ]);
  });
});

describe("큐브 대결 방: 되찾기로 남의 자리를 가로채지 못한다", () => {
  it("다른 손님이 되찾기 증명을 엿들어 자기 연결로 다시 보내도 받지 않는다(증명에 새 연결 아이디가 들어 있다)", () => {
    const { clock, net, host, guests, reload } = setup(["g", "m"]);
    const k = guests.get("m") as CubeRoom;
    expect(k).toBeDefined();
    // 엿듣는 사람 m이 받은 g2의 인사를 그대로 방장에게 다시 보낸다
    let heard: unknown;
    net.filter = (message, from, to) => {
      const msg = message as { type?: string };
      if (from === "g2" && to === "m" && msg.type === "cube-hello")
        heard = message;
      // g2의 첫 인사가 방장에게 늦게 닿게 해 가로채는 쪽이 먼저 닿게 한다
      if (from === "g2" && to === "h" && msg.type === "cube-hello" && !heard)
        return null;
      return message;
    };
    host.startRound();
    runUntil(clock, () => raceOn(host));
    const back = reload(guests.get("g") as CubeRoom, "g2", 500);
    runUntil(clock, () => heard !== undefined);
    const attacker = net.join("m2");
    attacker.send(heard);
    clock.advance(200);
    // 방장은 g의 기기를 m2로 옮기지 않았다
    expect(host.state?.players.find((p) => p.id === "g")?.device).not.toBe(
      "m2",
    );
    // m2가 g 이름으로 보낸 수도 받지 않는다
    expect(host.session()?.moveLog("g")).toHaveLength(0);
    // 진짜 g2는 다시 인사하면 받아 준다
    delete net.filter;
    net.disconnect("g2");
    net.reconnect("g2");
    runUntil(clock, () => host.state?.players[1]?.device === "g2");
    expect(back.me).toBe("g");
  });

  it("옛 번호의 증명은 받지 않는다(두 번 새로고침한 뒤 첫 연결 아이디로 첫 증명을 다시 보내도 자리를 돌려놓지 못한다)", () => {
    const { clock, net, host, guests, reload } = setup(["g"]);
    let first: unknown;
    net.filter = (message, from) => {
      if (from === "g2" && (message as { type?: string }).type === "cube-hello")
        first ??= message;
      return message;
    };
    const g2 = reload(guests.get("g") as CubeRoom, "g2", 500);
    runUntil(clock, () => host.state?.players[1]?.device === "g2");
    const g3 = reload(g2, "g3", 500);
    runUntil(clock, () => host.state?.players[1]?.device === "g3");
    expect(g3.reclaiming).toBe(2);
    // g2 아이디를 흉내 내는 고친 클라이언트가 첫 증명(번호 1)을 다시 보낸다
    expect(first).toBeDefined();
    delete net.filter;
    const replay = net.join("g2");
    net.reconnect("g2");
    clock.advance(0);
    replay.send(first);
    clock.advance(200);
    expect(host.state?.players[1]?.device).toBe("g3");
    expect(g3.state?.players[1]?.device).toBe("g3");
  });
});
