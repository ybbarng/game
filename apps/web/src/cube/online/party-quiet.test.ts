import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import { PARTY_KO, PARTY_KO_QUIET, PARTY_OVER, quietEnd } from "./party";
import type { Scrambler } from "./race-game";
import { CubeRoom } from "./room";

/**
 * 체력 0인데 스스로 탈락을 알리지 않는 고친 클라이언트(docs/47 9-6 「알리지 않은 탈락」). 다른 기기가 수 기록으로 확실한 탈락을
 * 직접 계산해 알면 그 사람을 기다리지 않고 판을 닫는다. 세 기기(기기마다 RaceHub 하나), ManualClock·DelayNet이라 결정적이다.
 */

/** 2×2 섞기: 거꾸로 두면 2수째 첫 층, 9수째 윗면, 26수째 다 맞춤(party.test.ts와 같다) */
const SCRAMBLE =
  "F R U' R' U' R U R' F' R U R' U' R' F R F' R U R' U R U2 R' R F";
const fake: Scrambler = (event) => ({ event, text: SCRAMBLE, official: false });
const SOLUTION = invertMoves(parseMoves(2, SCRAMBLE)) as CubeMove[];
const WIGGLE = parseMoves(2, "y y'") as CubeMove[];
const LIMIT_SEC = 60;

function room(net: DelayNet, id: string, clock: ManualClock, isHost: boolean) {
  return new CubeRoom({
    transport: net.join(id),
    clock,
    isHost,
    ...(isHost ? {} : { hostId: "h" }),
    name: id,
    scrambler: fake,
    ...(isHost
      ? {
          settings: {
            n: 2,
            inspection: false,
            timeLimitSec: LIMIT_SEC,
            party: "hp" as const,
          },
        }
      : {}),
  });
}

/** 판이 풀리면 한 번 부른다 */
function onRace(r: CubeRoom, fn: () => void) {
  let race = "";
  r.onChange(() => {
    const s = r.session();
    if (s?.snapshot().phase !== "race" || race === r.state?.race?.id) return;
    race = r.state?.race?.id ?? "";
    fn();
  });
}

/** 풀림 뒤 `at` ms에 해답의 [from, to) 수를 둔다. 그 사이 `every` ms마다 큐브만 돌렸다 되돌린다(판정이 확실해지게 수가 간다) */
function plan(
  clock: ManualClock,
  r: CubeRoom,
  steps: { at: number; from: number; to: number }[],
  every = 250,
) {
  onRace(r, () => {
    const s = r.session();
    if (!s) return;
    for (const step of steps)
      clock.after(step.at, () => {
        for (const m of SOLUTION.slice(step.from, step.to)) s.play(m);
      });
    const tick = () => {
      if (s.snapshot().phase !== "race") return;
      for (const m of WIGGLE) s.play(m);
      clock.after(every, tick);
    };
    clock.after(100, tick);
  });
}

/** 고친 클라이언트: 스스로 그만두기(`race-retire`)를 보내지 않는다 */
function silence(r: CubeRoom) {
  onRace(r, () => {
    const s = r.session();
    if (s) s.retire = () => {};
  });
}

/**
 * 방장 h·정직한 o·체력이 0이 될 c. 2×2 셋이면 이정표 하나에 25씩.
 * h 첫 층(1초)·윗면(2초) → o·c 50, o 첫 층(2.5초) → c 25, o 윗면(3초) → c 0. h 다 맞춤(5초) → h 승.
 */
function setup(opts: { quiet: boolean; slowToHost?: number }) {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  net.setDelay("h", "o", 120);
  net.setDelay("o", "h", 60);
  net.setDelay("c", "o", 90);
  const host = room(net, "h", clock, true);
  const other = room(net, "o", clock, false);
  const cheat = room(net, "c", clock, false);
  clock.advance(100);
  plan(clock, host, [
    { at: 1_000, from: 0, to: 2 },
    { at: 2_000, from: 2, to: 9 },
    { at: 5_000, from: 9, to: 26 },
  ]);
  plan(clock, other, [
    { at: 2_500, from: 0, to: 2 },
    { at: 3_000, from: 2, to: 9 },
  ]);
  plan(clock, cheat, [], 200);
  if (opts.quiet) silence(cheat);
  const slow = opts.slowToHost;
  if (slow !== undefined)
    // 탈락 직전부터 c의 수가 방장에게 늦게 닿는다
    onRace(host, () => clock.after(2_800, () => net.setDelay("c", "h", slow)));
  expect(host.startRound()).toBe(true);
  return { clock, net, host, other, cheat, t0: clock.now() };
}

const closed = (r: CubeRoom) => r.rounds.length === 1;
const reasonOf = (r: CubeRoom, id: string) =>
  r.rounds[0]?.result.players[id]?.reason;

describe("체력 0인데 알리지 않음", () => {
  it("남은 사람이 다 끝나면 제한 시간 전에 판이 닫히고, 두 기기가 같은 판 기록을 낸다", () => {
    const { clock, host, other, t0 } = setup({ quiet: true });
    runUntil(clock, () => closed(host) && closed(other), 30_000, 20);
    // 제한 시간(60초)까지 끌리지 않는다: 판정이 확실해진 뒤 기다림(3초) 안쪽
    expect(clock.now() - t0).toBeLessThan(12_000);
    const h = host.rounds[0];
    expect(other.rounds[0]).toEqual(h);
    expect(h?.party).toMatchObject({
      winner: "h",
      end: "solved",
      hp: { h: 100, o: 50, c: 0 },
      places: { h: 1, o: 2, c: 3 },
    });
    expect(h?.result.ranking).toEqual(["h", "o", "c"]);
    expect(reasonOf(host, "c")).toBe(PARTY_KO_QUIET);
    expect(reasonOf(host, "o")).toBe(PARTY_OVER);
    // c의 기록은 탈락 시각까지로 자른다(기기마다 그 뒤 수를 받은 데까지가 달라도 같다)
    const ko = h?.party?.knockedOut.c as number;
    expect(h?.logs.c?.length).toBeGreaterThan(0);
    expect(h?.logs.c?.every((x) => x.t <= ko)).toBe(true);
  });

  it("정직한 사람(스스로 알림)은 그대로다", () => {
    const { clock, host, other, cheat } = setup({ quiet: false });
    runUntil(clock, () => closed(host) && closed(other), 30_000, 20);
    const h = host.rounds[0];
    expect(other.rounds[0]).toEqual(h);
    expect(reasonOf(host, "c")).toBe(PARTY_KO);
    expect(h?.party?.winner).toBe("h");
    expect(h?.party?.knockedOut.c).toBeGreaterThanOrEqual(3_000);
    // 스스로 그만두기 전에 둔 수가 모두 남는다(자르지 않는다)
    runUntil(clock, () => closed(cheat), 30_000, 20);
    expect(h?.logs.c).toEqual(cheat.rounds[0]?.logs.c);
  });

  it("수 기록이 덜 온 동안은 닫지 않는다. 다 오면 닫고 결과가 같다", () => {
    const { clock, host, other, t0 } = setup({
      quiet: true,
      slowToHost: 6_000,
    });
    runUntil(clock, () => closed(other), 30_000, 20);
    // 방장은 c의 탈락 뒤 수를 아직 받지 못했다: 확실하지 않으니 c를 기다린다
    expect(closed(host)).toBe(false);
    const s = host.session();
    expect(s?.snapshot().peers.find((p) => p.id === "c")?.status).toBe(
      "playing",
    );
    const ko = other.rounds[0]?.party?.knockedOut.c as number;
    expect(Math.max(...(s?.moveLog("c").map((x) => x.t) ?? []))).toBeLessThan(
      ko,
    );
    runUntil(clock, () => closed(host), 30_000, 20);
    expect(clock.now() - t0).toBeLessThan(LIMIT_SEC * 1_000);
    expect(host.rounds[0]).toEqual(other.rounds[0]);
    expect(reasonOf(host, "c")).toBe(PARTY_KO_QUIET);
  });
});

describe("확정 조건(quietEnd)", () => {
  const base = {
    hp: {},
    knockedOut: {},
    left: {},
    unranked: [],
    hits: [],
    until: 0,
    ranking: [],
    places: {},
  };
  it("체력 0 → 아이템 규칙 위반 → 판이 정해짐 차례로, 그 판정 시각까지", () => {
    expect(quietEnd({ ...base, knockedOut: { a: 3_000 } }, "a")).toEqual({
      reason: PARTY_KO_QUIET,
      upTo: 3_000,
    });
    expect(quietEnd(base, "a")).toBeUndefined();
    const decided = { at: 5_000, winner: "b", end: "solved" as const };
    expect(quietEnd({ ...base, decided }, "a")?.upTo).toBe(5_000);
    // 다툼으로 먼저 빠진 사람은 빠진 시각까지
    expect(quietEnd({ ...base, decided, left: { a: 4_000 } }, "a")?.upTo).toBe(
      4_000,
    );
    const items = {
      slot: {},
      guard: {},
      grants: [],
      uses: [],
      hits: [],
      owed: {},
      out: { a: "갖지 않은 아이템을 씀" },
    };
    expect(quietEnd({ ...base, items, left: { a: 2_000 } }, "a")).toEqual({
      reason: "갖지 않은 아이템을 씀(알리지 않음)",
      upTo: 2_000,
    });
  });
});
