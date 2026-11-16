import { levelText } from "@game/cube-ai";
import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, OffsetClock, runUntil } from "@/net/race/race-fixture";
import type { RaceResult } from "@/net/race/types";
import { BOT_HOST_RELOAD, type Scrambler, scrambleSeed } from "./race-game";
import {
  CubeRoom,
  HOST_REJOIN_GRACE_MS,
  REJOIN_GRACE_MS,
  type RoomSettings,
} from "./room";
import type { SeatStore } from "./seat";

/**
 * 방장 새로고침 뒤 방 되찾기(docs/47 9-11 「방장 되찾기」). 새로고침은 「방을 버리고 연결이 끊긴 뒤, 같은 탭 저장소로 새 연결의
 * 방을 만든다」로 흉내 낸다(손님 되찾기 시험 `rejoin.test.ts`와 같다). 새 연결은 아이디가 다르고, 새 페이지의 시계는 0 근처에서
 * 다시 잰다. 방장 참가자 아이디는 그대로이고 기기 칸만 새 연결로 바뀐다.
 */

const SCRAMBLES = ["R U F", "F R' U", "U2 R F'"];
const fake: Scrambler = (event, seed) => ({
  event,
  text: SCRAMBLES[seed % SCRAMBLES.length] as string,
  official: false,
});

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
  const hostStore = memoryStore();
  const host = new CubeRoom({
    transport: net.join("h"),
    clock,
    wall,
    isHost: true,
    name: "방장",
    scrambler: fake,
    settings,
    seat: hostStore,
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
  /** 방장 탭이 끊긴다(새로고침의 앞 절반) */
  const leave = (room: CubeRoom) => {
    room.dispose();
    net.disconnect(room.device);
  };
  /** 방장 탭을 새 연결 `next`로 같은 탭 저장소를 들고 다시 연다(새로고침의 뒤 절반) */
  const reopenHost = (next: string) =>
    new CubeRoom({
      transport: net.join(next),
      clock: new OffsetClock(clock, -clock.now() + 3),
      wall,
      isHost: true,
      name: "방장",
      scrambler: fake,
      seat: hostStore,
    });
  /** 방장 탭을 새로 고친다: 끊긴 뒤 `awayMs` 지나 새 연결로 돌아온다 */
  const reloadHost = (room: CubeRoom, next: string, awayMs: number) => {
    leave(room);
    clock.advance(awayMs);
    return reopenHost(next);
  };
  /** 손님 탭을 새로 고친다 */
  const reloadGuest = (room: CubeRoom, next: string, awayMs: number) => {
    const store = stores.get(room.me) as ReturnType<typeof memoryStore>;
    leave(room);
    clock.advance(awayMs);
    return new CubeRoom({
      transport: net.join(next),
      clock: new OffsetClock(clock, -clock.now() + 3),
      wall,
      isHost: false,
      hostId: "h",
      name: `손님 ${room.me}`,
      scrambler: fake,
      seat: store,
    });
  };
  return {
    clock,
    net,
    host,
    guests,
    leave,
    reopenHost,
    reloadHost,
    reloadGuest,
  };
}

function solutionOf(room: CubeRoom): CubeMove[] {
  const seed = room.session()?.snapshot().seed as string;
  const text = SCRAMBLES[scrambleSeed(seed) % SCRAMBLES.length] as string;
  return invertMoves(parseMoves(2, text)) as CubeMove[];
}

function raceOn(room: CubeRoom) {
  return room.session()?.snapshot().phase === "race";
}

function devices(room: CubeRoom) {
  return room.state?.players.map((p) => [p.id, p.device]);
}

/** 한 판을 둘 다 맞춰 끝낸다 */
function finishRound(clock: ManualClock, rooms: CubeRoom[], round: number) {
  runUntil(clock, () => rooms.every(raceOn));
  for (const r of rooms)
    for (const m of solutionOf(r)) expect(r.play(m).ok).toBe(true);
  runUntil(clock, () => rooms.every((r) => r.rounds.length === round));
}

describe("큐브 대결 방: 방장 새로고침 뒤 방 되찾기", () => {
  it("대기실에서 방장이 새로 고치면 손님은 같은 방에 남아 기다리고, 방장 자리를 확인한 새 연결과 다음 판을 연다", () => {
    const { clock, host, guests, leave, reopenHost } = setup();
    const guest = guests.get("g") as CubeRoom;
    leave(host);
    clock.advance(1_000);
    // 끊긴 동안: 방이 끝난 것이 아니라 방장을 기다린다
    expect(guest.hostAway).toBe(true);
    expect(guest.hostLeft).toBe(false);
    const back = reopenHost("h2");
    expect(back.me).toBe("h");
    runUntil(clock, () => guest.state?.host === "h2");
    expect(guest.hostAway).toBe(false);
    expect(devices(guest)).toEqual([
      ["h", "h2"],
      ["g", "g"],
    ]);
    expect(devices(back)).toEqual(devices(guest));
    // 손님은 끊기지 않았다고 본다: 다음 판에 든다
    expect(back.startRound()).toBe(true);
    expect(back.state?.race?.players).toEqual(["h", "g"]);
    finishRound(clock, [back, guest], 1);
    expect(guest.rounds[0]?.result).toEqual(back.rounds[0]?.result);
  });

  it("방장이 30초 안에 돌아오지 않으면 손님에게 방이 끝났다고 알린다", () => {
    const { clock, host, guests, leave } = setup();
    const guest = guests.get("g") as CubeRoom;
    leave(host);
    clock.advance(HOST_REJOIN_GRACE_MS - 1);
    expect(guest.hostLeft).toBe(false);
    clock.advance(100);
    expect(guest.hostLeft).toBe(true);
    expect(guest.hostAway).toBe(false);
  });

  it("판 사이에 방장이 새로 고쳐도 판 기록·판 번호가 이어지고, 비운 동안 나간 손님은 30초 뒤 빠진다", () => {
    const { clock, host, guests, leave, reloadHost } = setup(["g", "k"], {
      ...SETTINGS,
      format: "ao5",
    });
    const g = guests.get("g") as CubeRoom;
    const k = guests.get("k") as CubeRoom;
    expect(host.startRound()).toBe(true);
    finishRound(clock, [host, g, k], 1);
    runUntil(clock, () => g.state?.status === "between");
    // 방장이 비운 동안 k도 나간다
    leave(k);
    const back = reloadHost(host, "h2", 3_000);
    runUntil(clock, () => g.state?.host === "h2");
    expect(back.rounds.map((r) => r.result)).toEqual(
      host.rounds.map((r) => r.result),
    );
    expect(back.state?.round).toBe(1);
    expect(back.state?.status).toBe("between");
    clock.advance(REJOIN_GRACE_MS + 1_000);
    expect(back.state?.players.map((p) => p.id)).toEqual(["h", "g"]);
    expect(back.startRound()).toBe(true);
    runUntil(clock, () => g.state?.round === 2);
    finishRound(clock, [back, g], 2);
    expect(g.rounds[1]?.result).toEqual(back.rounds[1]?.result);
  });

  it("판 도중 방장이 새로 고쳐도(컴퓨터 없음) 방장 자리·큐브·시간을 이어 가고, 모든 기기가 같은 결과를 낸다", () => {
    const { clock, host, guests, reloadHost } = setup();
    const guest = guests.get("g") as CubeRoom;
    expect(host.startRound()).toBe(true);
    runUntil(clock, () => raceOn(guest) && raceOn(host));
    const mine = solutionOf(host);
    expect(host.play(mine[0] as CubeMove).ok).toBe(true);
    expect(guest.play(solutionOf(guest)[0] as CubeMove).ok).toBe(true);
    clock.advance(100);
    const cubeBefore = host.session()?.stateOf("h");
    const elapsedBefore = host.session()?.snapshot().elapsed as number;
    const seed = host.session()?.snapshot().seed;

    const back = reloadHost(host, "h2", 2_000);
    runUntil(clock, () => raceOn(back) && guest.state?.host === "h2");
    // 같은 섞기, 같은 큐브, 상대 수도 다시 받았다. 비운 2초도 흘렀다
    expect(back.session()?.snapshot().seed).toBe(seed);
    expect(back.session()?.stateOf("h")).toEqual(cubeBefore);
    runUntil(clock, () => back.session()?.moveLog("g").length === 1);
    expect(back.session()?.snapshot().elapsed).toBeGreaterThanOrEqual(
      elapsedBefore + 2_000,
    );
    for (const m of mine.slice(1)) expect(back.play(m).ok).toBe(true);
    for (const m of solutionOf(guest).slice(1))
      expect(guest.play(m).ok).toBe(true);
    runUntil(
      clock,
      () => back.rounds.length === 1 && guest.rounds.length === 1,
    );
    const a = back.rounds[0]?.result as RaceResult;
    expect(guest.rounds[0]?.result).toEqual(a);
    expect(a.players.h).toMatchObject({ status: "done", moves: mine.length });
    expect(a.players.h?.reported).toBeGreaterThan(elapsedBefore + 2_000);
  });

  it("살펴보기 중 방장이 새로 고쳐도 섞기와 풀림 시각이 그대로라 살펴보기를 늘리지 못한다", () => {
    const { clock, host, guests, reloadHost } = setup(["g"], {
      ...SETTINGS,
      inspection: true,
    });
    const guest = guests.get("g") as CubeRoom;
    host.startRound();
    runUntil(
      clock,
      () =>
        host.session()?.snapshot().phase === "inspect" &&
        guest.session()?.snapshot().phase === "inspect",
    );
    clock.advance(3_000);
    const seed = host.session()?.snapshot().seed;
    const left = host.session()?.snapshot().inspectionLeft as number;
    const at = clock.now();
    const back = reloadHost(host, "h2", 4_000);
    runUntil(clock, () => back.session()?.snapshot().seed !== undefined);
    expect(back.session()?.snapshot().seed).toBe(seed);
    expect(guest.session()?.snapshot().seed).toBe(seed);
    expect(back.session()?.snapshot().inspectionLeft).toBe(
      left - (clock.now() - at),
    );
  });

  it("컴퓨터가 든 판: 풀린 뒤 방장이 새로 고치면 컴퓨터는 그 판을 그만두고, 사람끼리는 그대로 겨룬다", () => {
    const { clock, host, guests, reloadHost } = setup();
    const guest = guests.get("g") as CubeRoom;
    host.addBot(levelText("novice"));
    clock.advance(100);
    expect(host.startRound()).toBe(true);
    runUntil(clock, () => raceOn(guest) && raceOn(host));
    clock.advance(500);
    const back = reloadHost(host, "h2", 1_000);
    runUntil(
      clock,
      () =>
        guest
          .session()
          ?.snapshot()
          .peers.find((p) => p.id === "bot1")?.status === "dnf",
    );
    runUntil(clock, () => raceOn(back));
    for (const r of [back, guest])
      for (const m of solutionOf(r)) expect(r.play(m).ok).toBe(true);
    runUntil(
      clock,
      () => back.rounds.length === 1 && guest.rounds.length === 1,
    );
    const a = back.rounds[0]?.result as RaceResult;
    expect(guest.rounds[0]?.result).toEqual(a);
    expect(a.players.bot1).toMatchObject({
      status: "dnf",
      reason: BOT_HOST_RELOAD,
    });
    expect(a.players.h?.status).toBe("done");
    expect(a.players.g?.status).toBe("done");
  });

  it("컴퓨터가 든 판: 풀리기 전(살펴보기 중) 방장이 새로 고치면 컴퓨터는 같은 약속으로 이어 맞춘다", () => {
    const { clock, host, guests, reloadHost } = setup(["g"], {
      ...SETTINGS,
      inspection: true,
    });
    const guest = guests.get("g") as CubeRoom;
    host.addBot(levelText("pro"));
    clock.advance(100);
    host.startRound();
    runUntil(
      clock,
      () =>
        host.session()?.snapshot().phase === "inspect" &&
        guest.session()?.snapshot().phase === "inspect",
    );
    const seed = host.session()?.snapshot().seed;
    const back = reloadHost(host, "h2", 1_000);
    runUntil(clock, () => back.session()?.snapshot().seed !== undefined);
    expect(back.session()?.snapshot().seed).toBe(seed);
    runUntil(
      clock,
      () =>
        guest
          .session()
          ?.snapshot()
          .peers.find((p) => p.id === "bot1")?.status === "done",
    );
    for (const r of [back, guest])
      for (const m of solutionOf(r))
        expect([r.me, r.session()?.snapshot().phase, r.play(m)]).toMatchObject([
          r.me,
          "race",
          { ok: true },
        ]);
    runUntil(
      clock,
      () => back.rounds.length === 1 && guest.rounds.length === 1,
    );
    expect(guest.rounds[0]?.result).toEqual(back.rounds[0]?.result);
    expect(guest.rounds[0]?.result.players.bot1?.status).toBe("done");
  });

  it("방장이 새로 고친 뒤 손님이 새로 고쳐도 새 방장 연결의 같은 방으로 돌아온다", () => {
    const { clock, host, guests, reloadHost, reloadGuest } = setup();
    const back = reloadHost(host, "h2", 1_000);
    const guest = guests.get("g") as CubeRoom;
    runUntil(clock, () => guest.state?.host === "h2");
    const g2 = reloadGuest(guest, "g2", 1_000);
    runUntil(clock, () => back.state?.players[1]?.device === "g2");
    runUntil(clock, () => g2.state?.players[1]?.device === "g2");
    expect(g2.me).toBe("g");
    expect(g2.state?.host).toBe("h2");
    expect(g2.hostAway).toBe(false);
  });
});

describe("큐브 대결 방: 방장 되찾기로 방장 자리를 가로채지 못한다", () => {
  it("다른 손님이 방장 자리 증명을 엿들어 자기 연결로 다시 보내도 방장으로 받지 않는다", () => {
    const { clock, net, host, guests, leave, reopenHost } = setup(["g", "m"]);
    const g = guests.get("g") as CubeRoom;
    let heard: unknown;
    net.filter = (message, from, to) => {
      const msg = message as { type?: string };
      if (from === "h2" && to === "m" && msg.type === "cube-hello")
        heard = message;
      // 진짜 방장의 인사는 g에게 닿지 않게 해 가로채는 쪽만 닿게 한다
      if (from === "h2" && to === "g" && msg.type === "cube-hello") return null;
      return message;
    };
    leave(host);
    clock.advance(500);
    reopenHost("h2");
    runUntil(clock, () => heard !== undefined);
    const attacker = net.join("m2");
    attacker.send(heard);
    // 방장 흉내: 가로챈 증명 뒤에 방 상태도 보낸다
    attacker.send({
      type: "cube-room",
      state: {
        ...g.state,
        v: (g.state?.v ?? 0) + 10,
        host: "m2",
        players: g.state?.players.map((p) =>
          p.id === "h" ? { ...p, device: "m2" } : p,
        ),
      },
    });
    clock.advance(500);
    expect(g.state?.host).toBe("h");
    expect(g.hostAway).toBe(true);
    // 진짜 새 방장 연결은 받아 준다
    delete net.filter;
    net.disconnect("h2");
    net.reconnect("h2");
    runUntil(clock, () => g.state?.host === "h2");
  });

  it("옛 번호의 방장 증명은 받지 않는다(두 번 새로고침한 뒤 첫 연결 아이디로 첫 증명을 다시 보내도 방장 연결을 돌려놓지 못한다)", () => {
    const { clock, net, host, guests, reloadHost } = setup();
    const g = guests.get("g") as CubeRoom;
    let first: unknown;
    net.filter = (message, from) => {
      if (from === "h2" && (message as { type?: string }).type === "cube-hello")
        first ??= message;
      return message;
    };
    const h2 = reloadHost(host, "h2", 500);
    runUntil(clock, () => g.state?.host === "h2");
    const h3 = reloadHost(h2, "h3", 500);
    runUntil(clock, () => g.state?.host === "h3");
    expect(h3.reclaiming).toBe(2);
    expect(first).toBeDefined();
    delete net.filter;
    const replay = net.join("h2");
    net.reconnect("h2");
    clock.advance(0);
    replay.send(first);
    clock.advance(500);
    // g는 여전히 h3을 방장 연결로 본다: 그 뒤 h3이 알린 설정을 받는다
    h3.setSettings({ timeLimitSec: 120 });
    clock.advance(500);
    expect(g.state?.settings.timeLimitSec).toBe(120);
    expect(devices(g)).toEqual([
      ["h", "h3"],
      ["g", "g"],
    ]);
  });

  it("손님 자리 저장(토큰)으로는 방장 자리를 되살리지 못한다", () => {
    const { clock, net, guests } = setup();
    const g = guests.get("g") as CubeRoom;
    const store = memoryStore();
    // 손님 g의 탭 저장소를 들고 방장 탭으로 열어도 방장 자리(참가자 h)로 되살리지 않는다
    store.set(
      "seat",
      JSON.stringify({ v: 1, me: "g", host: "h", n: 0, given: {}, got: {} }),
    );
    const room = new CubeRoom({
      transport: net.join("x"),
      clock,
      isHost: true,
      name: "방장",
      scrambler: fake,
      seat: store,
    });
    clock.advance(200);
    expect(room.me).toBe("x");
    expect(room.reclaiming).toBeNull();
    expect(g.state?.host).toBe("h");
  });
});
