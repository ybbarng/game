import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, OffsetClock, runUntil } from "@/net/race/race-fixture";
import type { CheckpointLog, RaceResult } from "@/net/race/types";
import { judgeParty, PARTY_KO, PARTY_OVER, type PartyInput } from "./party";
import type { Scrambler } from "./race-game";
import { CubeRoom, DEFAULT_SETTINGS, raceOptionsFor } from "./room";
import { pointsMatch, rankPoints } from "./standings";

/**
 * 파티 모드 체력바 대결(docs/51 3-2, docs/47 9-6).
 * 순수 판정(`judgeParty`)과 두·세 기기 방(기기마다 RaceHub 하나, ManualClock·DelayNet)으로 본다.
 */

// ---- 순수 판정 ----

type MarkSpec = [t: number, ids: string[], bounds?: Record<string, number>];

function log(marks: MarkSpec[], o: Partial<CheckpointLog> = {}): CheckpointLog {
  return {
    status: "playing",
    horizon: Number.POSITIVE_INFINITY,
    last: marks.at(-1)?.[0] ?? 0,
    marks: marks.map(([t, ids, bounds], i) => ({
      at: i + 1,
      t,
      ids,
      bounds: bounds ?? {},
      settled: true,
    })),
    ...o,
  };
}

const solved = (t: number, bounds: Record<string, number> = {}) => ({
  status: "done" as const,
  done: { t, bounds, settled: true },
});

function judge(
  logs: PartyInput["logs"],
  o: Partial<PartyInput> = {},
): ReturnType<typeof judgeParty> {
  return judgeParty({
    n: 3,
    players: Object.keys(logs),
    logs,
    disputeMs: 1_000,
    final: false,
    ...o,
  });
}

const LADDER3 = ["cross", "f2l1", "f2l2", "f2l3", "layer1", "layer2", "oll"];

describe("체력 판정", () => {
  it("먼저 지난 사람이 아직 못 지난 사람을 깎고, 같은 시각에 지나면 서로 깎지 않는다", () => {
    const r = judge({
      a: log([
        [1_000, ["cross"]],
        [5_000, ["f2l1"]],
      ]),
      b: log([
        [2_000, ["cross"]],
        [4_000, ["f2l1", "f2l2"]],
        [7_000, ["f2l3"]],
      ]),
    });
    // a의 십자 −16(b), b의 F2L 1·2·3 −48(a). a의 F2L 1은 b가 먼저 지나 깎지 않는다
    expect(r.hp).toEqual({ a: 100 - 48, b: 100 - 16 });
    expect(r.hits.map((h) => [h.by, h.id, h.to])).toEqual([
      ["a", "cross", ["b"]],
      ["b", "f2l1", ["a"]],
      ["b", "f2l2", ["a"]],
      ["b", "f2l3", ["a"]],
    ]);

    const tie = judge({
      a: log([[3_000, ["cross"]]]),
      b: log([[3_000, ["cross"]]]),
    });
    expect(tie.hp).toEqual({ a: 100, b: 100 });
  });

  it("일곱 이정표를 모두 뒤지면 윗면에서 0이 되고, 남은 한 사람이 이긴다", () => {
    const r = judge({
      a: log(LADDER3.map((id, i) => [1_000 * (i + 1), [id]] as MarkSpec)),
      b: log([]),
    });
    expect(r.knockedOut).toEqual({ b: 7_000 });
    expect(r.decided).toEqual({ at: 7_000, winner: "a", end: "last" });
    expect(r.ranking).toEqual(["a", "b"]);
    expect(r.places).toEqual({ a: 1, b: 2 });
    // 여섯째 뒤에는 4가 남는다(20% 아래 경고)
    const six = judge({
      a: log(
        LADDER3.slice(0, 6).map((id, i) => [1_000 * (i + 1), [id]] as MarkSpec),
      ),
      b: log([]),
    });
    expect(six.hp.b).toBe(4);
    expect(six.decided).toBeUndefined();
  });

  it("끝까지 맞추면 이긴다(같은 수에서 지난 이정표는 하나 몫만 먼저 깎고, 맞춤이 판을 정한다)", () => {
    const r = judge({
      a: log([[1_000, ["cross"]]]),
      b: log(
        [
          [2_000, ["cross"]],
          [9_000, ["f2l1", "oll"]],
        ],
        solved(9_000),
      ),
    });
    expect(r.decided).toEqual({ at: 9_000, winner: "b", end: "solved" });
    expect(r.hp).toEqual({ a: 100 - 16, b: 100 - 16 });
    expect(r.ranking).toEqual(["b", "a"]);
  });

  it("한 수에 이정표 둘을 지나면(2×2 윗면 건너뜀) 처음 50, 1초 뒤 50이 깎인다. 미뤄 둔 몫은 그 시각이 확실해질 때 판정한다", () => {
    const skip = log([[5_000, ["layer1", "oll"]]]);
    const r = judge({ a: log([]), b: skip }, { n: 2 });
    expect(r.hits.map((h) => [h.at, h.id, h.to])).toEqual([
      [5_000, "layer1", ["a"]],
      [6_000, "oll", ["a"]],
    ]);
    expect(r.knockedOut).toEqual({ a: 6_000 });
    expect(r.decided).toEqual({ at: 6_000, winner: "b", end: "last" });
    // a의 수를 5.5초까지만 받았다: 6초 몫은 아직 판정하지 않는다
    const wait = judge({ a: log([], { horizon: 5_500 }), b: skip }, { n: 2 });
    expect(wait.hp.a).toBe(50);
    expect(wait.decided).toBeUndefined();
    expect(wait.until).toBe(5_500);
  });

  it("그 1초 안에 맞는 쪽이 그 이정표를 지나면 남은 몫은 깎지 않는다", () => {
    const r = judge(
      {
        a: log([[5_800, ["layer1", "oll"]]]),
        b: log([[5_000, ["layer1", "oll"]]]),
      },
      { n: 2, final: true },
    );
    expect(r.hits.map((h) => [h.at, h.id])).toEqual([[5_000, "layer1"]]);
    expect(r.hp).toEqual({ a: 50, b: 100 });
    // 판정 시각과 같은 때 지나도 깎지 않는다(같은 시각은 먼저가 아니다)
    const tie = judge(
      { a: log([[6_000, ["oll"]]]), b: log([[5_000, ["layer1", "oll"]]]) },
      { n: 2, final: true },
    );
    expect(tie.hp.a).toBe(50);
  });

  it("3×3에서 셋을 한꺼번에 지나면 16씩 세 번, 1초 간격으로 깎는다", () => {
    const r = judge({
      a: log([]),
      b: log([[3_000, ["cross", "f2l1", "f2l2"]]]),
    });
    expect(r.hits.map((h) => [h.at, h.id, h.damage])).toEqual([
      [3_000, "cross", 16],
      [4_000, "f2l1", 16],
      [5_000, "f2l2", 16],
    ]);
    expect(r.hp.a).toBe(100 - 48);
  });

  it("셋 이상이면 깎는 양을 나눠 꼴찌가 이정표마다 같은 양을 잃고, 0이 된 사람은 더 깎지도 깎이지도 않는다", () => {
    const n2 = { n: 2 };
    const r = judge(
      {
        a: log([
          [1_000, ["layer1"]],
          [3_000, ["oll"]],
        ]),
        b: log([
          [2_000, ["layer1"]],
          [3_500, ["oll"]],
        ]),
        c: log([[4_000, ["layer1", "oll"]]]),
      },
      n2,
    );
    // 2×2 깎는 양 50, 맞수 둘이라 25씩. b는 a에게 두 번, c는 a·b에게 두 번씩 → 0(3.5초), 4초의 c 이정표는 깎지 않는다
    expect(r.knockedOut).toEqual({ c: 3_500 });
    expect(r.hp).toEqual({ a: 100, b: 50, c: 0 });
    expect(r.decided).toBeUndefined();
    // 판 끝(제한 시간): 남은 사람 가운데 체력이 높은 사람
    const end = judge(
      {
        a: log([
          [1_000, ["layer1"]],
          [3_000, ["oll"]],
        ]),
        b: log([
          [2_000, ["layer1"]],
          [3_500, ["oll"]],
        ]),
        c: log([[4_000, ["layer1", "oll"]]]),
      },
      { ...n2, final: true },
    );
    expect(end.decided).toEqual({
      at: Number.POSITIVE_INFINITY,
      winner: "a",
      end: "time",
    });
    expect(end.ranking).toEqual(["a", "b", "c"]);
    expect(end.places).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("시각은 증인 하한으로 확인한 것을 쓴다(일찍 적은 시각을 믿지 않는다)", () => {
    const r = judge({
      a: log([[2_500, ["cross"]]]),
      // b는 1초라고 적었지만 증인 둘이 3.8초쯤 닿았다고 본다
      b: log([[1_000, ["cross"], { a: 3_820, c: 3_830 }]]),
      c: log([]),
    });
    expect(r.hits[0]).toMatchObject({ by: "a", id: "cross" });
    expect(r.hp.a).toBe(100);
    expect(r.hp.b).toBe(92);
  });

  it("판 도중에는 확실한 데까지만: 아직 못 받은 수·다 받지 못한 하한의 시각 앞까지", () => {
    const a = log(LADDER3.map((id, i) => [1_000 * (i + 1), [id]] as MarkSpec));
    // b의 수는 6.5초까지만 받았다: 7초 윗면 판정은 기다린다
    const wait = judge({ a, b: log([], { horizon: 6_500 }) });
    expect(wait.decided).toBeUndefined();
    expect(wait.hp.b).toBe(4);
    expect(wait.until).toBe(6_500);
    // a의 윗면 하한을 아직 다 받지 못했다
    const pending = log(
      LADDER3.map((id, i) => [1_000 * (i + 1), [id]] as MarkSpec),
    );
    (pending.marks[6] as { settled: boolean }).settled = false;
    expect(judge({ a: pending, b: log([]) }).decided).toBeUndefined();
    // 받고 나면 판 끝의 판정과 같다
    const live = judge({ a, b: log([], { horizon: 7_001 }) });
    const final = judge({ a, b: log([]) }, { final: true });
    expect(live.decided).toEqual(final.decided);
    expect(live.hp).toEqual(final.hp);
  });

  it("1:1에서 시각이 다툼이면 판정하지 않고, 셋 이상이면 그 사람만 순위 없이 뺀다", () => {
    const one = judge({
      a: log([[1_000, ["cross"]]]),
      b: log([[2_000, ["cross"], { a: 9_000 }]]),
    });
    expect(one.decided).toEqual({ at: 2_000, winner: null, end: "noDecision" });
    const three = judge(
      {
        a: log([[1_000, ["cross"]]], solved(4_000)),
        b: log([[2_000, ["cross"], { a: 9_000 }]]),
        c: log([]),
      },
      { final: true },
    );
    expect(three.unranked).toEqual(["b"]);
    expect(three.decided?.winner).toBe("a");
    expect(three.ranking).toEqual(["a", "c", "b"]);
    expect(three.places.b).toBeUndefined();
  });

  it("점수: 체력바 판은 체력 판정의 승자·등수로 센다", () => {
    const result: RaceResult = {
      ranking: ["a", "b"],
      players: {
        a: { id: "a", status: "dnf", moves: 3 },
        b: { id: "b", status: "dnf", moves: 1 },
      },
    };
    const party = {
      winner: "a",
      end: "last" as const,
      places: { a: 1, b: 2 },
      hp: { a: 100, b: 0 },
      knockedOut: { b: 7_000 },
    };
    expect(rankPoints(result, undefined, party)).toEqual({ a: 2, b: 1 });
    const rules = {
      format: "points",
      target: 3,
      rounds: 3,
      scoring: "wins",
    } as const;
    const m = pointsMatch(rules, [{ result, party }]);
    expect(Object.fromEntries(m.scores)).toEqual({ a: 1, b: 0 });
  });
});

// ---- 기기마다 RaceHub 하나 ----

/** 2×2 섞기: 거꾸로 두면 2수째 첫 층, 9수째 윗면, 26수째 다 맞춤 */
const SCRAMBLE =
  "F R U' R' U' R U R' F' R U R' U' R' F R F' R U R' U R U2 R' R F";
const fake: Scrambler = (event) => ({
  event,
  text: SCRAMBLE,
  official: false,
});
const SOLUTION = invertMoves(parseMoves(2, SCRAMBLE)) as CubeMove[];

function room(
  net: DelayNet,
  id: string,
  clock: ManualClock | OffsetClock,
  isHost: boolean,
) {
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
            timeLimitSec: 60,
            party: "hp" as const,
          },
        }
      : {}),
  });
}

/** 풀림 뒤 `at` ms에 해답의 [from, to) 수를 둔다 */
function plan(
  clock: ManualClock,
  r: CubeRoom,
  steps: { at: number; from: number; to: number }[],
  before?: (k: number) => void,
) {
  let race = "";
  r.onChange(() => {
    const s = r.session();
    if (!s) return;
    if (s.snapshot().phase !== "race" || race === r.state?.race?.id) return;
    race = r.state?.race?.id ?? "";
    for (const [k, step] of steps.entries())
      clock.after(step.at, () => {
        before?.(k);
        for (const m of SOLUTION.slice(step.from, step.to)) s.play(m);
      });
  });
}

function playRound(clock: ManualClock, rooms: CubeRoom[]) {
  expect(rooms[0]?.startRound()).toBe(true);
  runUntil(clock, () => rooms.every((r) => r.rounds.length === 1), 120_000, 20);
}

const reasonOf = (r: CubeRoom, id: string) =>
  r.rounds[0]?.result.players[id]?.reason;

describe("체력바 대결(기기마다)", () => {
  it("체력 0 → 그 기기가 스스로 탈락 → 남은 한 사람이 이긴다. 두 기기가 같은 판 기록을 낸다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const host = room(net, "h", clock, true);
    const guest = room(net, "g", clock, false);
    clock.advance(100);
    expect(guest.state?.settings.party).toBe("hp");
    // 방장은 윗면 뒤에도 계속 둔다(판 도중 판정은 그 사람의 다음 수가 와야 그 시각을 확실히 안다)
    plan(clock, host, [
      { at: 1_000, from: 0, to: 2 },
      { at: 2_000, from: 2, to: 9 },
      { at: 2_600, from: 9, to: 12 },
    ]);
    playRound(clock, [host, guest]);
    const h = host.rounds[0];
    expect(guest.rounds[0]).toEqual(h);
    expect(h?.party).toMatchObject({
      winner: "h",
      end: "last",
      hp: { h: 100, g: 0 },
      places: { h: 1, g: 2 },
    });
    expect(h?.result.ranking).toEqual(["h", "g"]);
    expect(reasonOf(host, "g")).toBe(PARTY_KO);
    expect(reasonOf(host, "h")).toBe(PARTY_OVER);
  });

  it("한 순간에 이정표 둘을 지나면 50, 1초 뒤 50: 지연이 다른 두 기기가 같은 체력·같은 탈락 시각을 낸다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    net.setDelay("h", "g", 260);
    net.setDelay("g", "h", 140);
    const host = room(net, "h", clock, true);
    const guest = room(net, "g", clock, false);
    clock.advance(1_000);
    const wiggle = parseMoves(2, "y y'") as CubeMove[];
    // 방장은 큐브만 돌렸다 되돌린다(판정이 확실해지게 수가 간다)
    plan(
      clock,
      host,
      Array.from({ length: 12 }, (_, k) => ({
        at: 800 + k * 300,
        from: 0,
        to: 0,
      })),
      () => {
        for (const m of wiggle) host.play(m);
      },
    );
    // 손님은 한 순간에 첫 층·윗면까지(9수)
    plan(clock, guest, [{ at: 1_500, from: 0, to: 9 }]);
    playRound(clock, [host, guest]);
    const h = host.rounds[0];
    expect(guest.rounds[0]).toEqual(h);
    const ko = h?.party?.knockedOut.h as number;
    const first = host.party()?.hits[0]?.at as number;
    expect(host.party()?.hits.map((x) => x.id)).toEqual(["layer1", "oll"]);
    expect(ko - first).toBe(1_000);
    expect(guest.party()?.hits).toEqual(host.party()?.hits);
    expect(h?.party).toMatchObject({ winner: "g", end: "last", hp: { h: 0 } });
  });

  it("끝까지 맞추면 이긴다. 지연을 넣어도 두 기기가 같은 체력·같은 승자", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    net.setDelay("h", "g", 250);
    net.setDelay("g", "h", 180);
    const host = room(net, "h", clock, true);
    const guest = room(net, "g", clock, false);
    clock.advance(1_000);
    plan(clock, host, [{ at: 1_000, from: 0, to: 2 }]);
    plan(clock, guest, [{ at: 1_500, from: 0, to: 26 }]);
    playRound(clock, [host, guest]);
    const h = host.rounds[0];
    expect(guest.rounds[0]).toEqual(h);
    // 방장 첫 층(1초) → 손님 −50, 손님 윗면(1.5초) → 방장 −50, 손님 다 맞춤
    expect(h?.party).toMatchObject({
      winner: "g",
      end: "solved",
      hp: { h: 50, g: 50 },
    });
    expect(h?.result.ranking).toEqual(["g", "h"]);
    expect(h?.result.players.g?.status).toBe("done");
  });

  it("시각을 일찍 적어 보낸 고친 클라이언트는 확인한 시각으로 판정한다(세 기기, 정직한 두 기기가 같은 값)", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const host = room(net, "h", clock, true);
    const cheatClock = new OffsetClock(clock, 0);
    const cheat = room(net, "c", cheatClock, false);
    const other = room(net, "o", clock, false);
    clock.advance(100);
    // 방장: 2.5초 첫 층, 5초 윗면, 6초 다 맞춤
    plan(clock, host, [
      { at: 2_500, from: 0, to: 2 },
      { at: 5_000, from: 2, to: 9 },
      { at: 6_000, from: 9, to: 26 },
    ]);
    // 고친 클라이언트: 4초에 첫 층을 지나며 시계를 3초 뒤로 돌려 「1초」를 단다
    plan(clock, cheat, [{ at: 4_000, from: 0, to: 2 }], () => {
      cheatClock.offset -= 3_000;
    });
    playRound(clock, [host, other]);
    const h = host.rounds[0];
    expect(other.rounds[0]?.party).toEqual(h?.party);
    expect(other.rounds[0]?.result.ranking).toEqual(h?.result.ranking);
    // 단 시각을 믿었다면 방장이 깎였을 것이다. 확인한 시각으로는 방장이 먼저다
    expect(h?.party).toMatchObject({
      winner: "h",
      end: "solved",
      hp: { h: 100, c: 50, o: 25 },
    });
    expect(cheat.session()?.moveLog("c")[0]?.t).toBeLessThan(1_500);
  });

  it("옛 방 상태(파티 칸 없음)는 일반 대결로 받고, 고를 수 없는 파티 값·5판 평균과 함께는 버린다", () => {
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
          format: "single",
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
    old.send(state(2, {}));
    clock.advance(100);
    expect(guest.state?.v).toBe(2);
    expect(guest.state?.settings.party).toBeUndefined();
    old.send(state(3, { party: "freeze" }));
    old.send(state(4, { party: "hp", format: "ao5" }));
    clock.advance(100);
    expect(guest.state?.v).toBe(2);
    old.send(state(5, { party: "hp" }));
    clock.advance(100);
    expect(guest.state?.settings.party).toBe("hp");

    // 일반 대결은 지문이 예전과 같다(중간 지점·게임 설정 없음)
    const plain = raceOptionsFor(DEFAULT_SETTINGS);
    expect(plain.checkpoints).toBeUndefined();
    expect(plain.gameOptions).toBeUndefined();
    const party = raceOptionsFor({ ...DEFAULT_SETTINGS, party: "hp" });
    expect(party.checkpoints).toBe(true);
    expect(party.gameOptions).toEqual({ party: "hp" });
  });

  it("방장이 체력바를 5판 평균으로 바꾸려 하면 한 판으로 돌린다. 「평균 대비」는 체력바에서 쓰지 않는다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const host = room(net, "h", clock, true);
    host.setSettings({ format: "ao5" });
    expect(host.state?.settings.format).toBe("single");
    host.setHandicap({ score: "avg", delay: { h: 2 } });
    const guest = room(net, "g", clock, false);
    clock.advance(100);
    playRound(clock, [host, guest]);
    expect(host.rounds[0]?.handicap).toEqual({
      delaySec: { h: 2 },
      goal: {},
    });
  });
});
