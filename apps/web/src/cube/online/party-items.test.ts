import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { DelayNet, OffsetClock, runUntil } from "@/net/race/race-fixture";
import type { CheckpointLog } from "@/net/race/types";
import { checkBotRun, planHere } from "./bot-racer";
import { findMarksOf } from "./item-find";
import {
  type drawItem,
  FIND_MS,
  GRAY_MS,
  type ItemKind,
  itemUseText,
  SCREEN_HIT_MS,
  SWAP_MS,
  trackOf,
  undoMoves,
} from "./items";
import {
  ITEM_BAD_HIT,
  ITEM_NO_HIT,
  ITEM_NOT_HELD,
  judgeParty,
  type PartyInput,
} from "./party";
import { type Scrambler, stateHash } from "./race-game";
import { CubeRoom, DEFAULT_SETTINGS, raceOptionsFor } from "./room";

/**
 * 아이템전(docs/51 3-3, docs/47 9-7). 순수 판정(`judgeParty` + 아이템)과 기기마다 RaceHub 하나인 방(ManualClock·DelayNet)으로 본다.
 * 뽑기는 시험용 `draw`로 정해 둔다(모든 기기에 같은 것을 넣는다. 실제 뽑기의 결정성·확률은 items.test.ts)
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

const solved = (t: number) => ({
  status: "done" as const,
  done: { t, bounds: {}, settled: true },
});

/** 받는 사람·이정표 순번마다 정한 아이템(없으면 방패) */
const stub =
  (table: Record<string, ItemKind[]>): typeof drawItem =>
  (_seed, player, milestone) =>
    table[player]?.[milestone - 1] ?? "shield";

function judge(
  logs: PartyInput["logs"],
  table: Record<string, ItemKind[]>,
  o: Partial<PartyInput> = {},
) {
  return judgeParty({
    n: 2,
    players: Object.keys(logs),
    logs,
    disputeMs: 1_000,
    final: false,
    hp: false,
    items: { seed: "s", draw: stub(table) },
    ...o,
  });
}

describe("아이템 판정", () => {
  it("이정표에서 받고(그때 순위 줄로 뽑는다), 가진 것이 있으면 버린다. 방패는 받는 순간 켜진다", () => {
    const seen: string[] = [];
    const r = judgeParty({
      n: 2,
      players: ["a", "b"],
      logs: {
        a: log([
          [1_000, ["layer1"]],
          [3_000, ["oll"]],
        ]),
        b: log([
          [2_000, ["layer1"]],
          [4_000, []],
        ]),
      },
      disputeMs: 1_000,
      final: false,
      hp: false,
      items: {
        seed: "s",
        draw: (_s, p, m, st) => {
          seen.push(`${p}${m}:${st}`);
          return p === "b" ? "shield" : "fog";
        },
      },
    });
    // a가 먼저 첫 층 → 1등 줄, b는 늦게 같은 수 → 꼴찌 줄. a의 윗면은 이미 가진 안개가 있어 버린다
    expect(seen).toEqual(["a1:first", "b1:last", "a2:first"]);
    expect(r.items?.slot).toEqual({ a: "fog", b: null });
    expect(r.items?.guard).toEqual({ a: false, b: true });
    expect(r.items?.grants.map((g) => g.kept)).toEqual([true, true, false]);
  });

  it("갖지 않은 아이템을 쓰면 빠진다(고친 클라이언트). 받기 전에 쓴 것도 같다", () => {
    const r = judge(
      {
        a: log([
          [500, ["!u1:mix"]],
          [1_000, ["layer1"]],
        ]),
        b: log([[3_000, ["layer1"]]]),
      },
      { a: ["mix"] },
    );
    expect(r.items?.out).toEqual({ a: ITEM_NOT_HELD });
    expect(r.left.a).toBe(500);
  });

  it("방해는 맞추는 중인 가장 앞선 상대에게 간다. 방패가 하나를 막고, 다음 것은 맞는다", () => {
    const r = judge(
      {
        a: log([
          [1_000, ["layer1"]],
          [2_000, ["!u1:fog"]],
          [3_000, ["oll"]],
          [4_000, ["!u2:fog"]],
        ]),
        b: log([
          [1_500, ["layer1"]],
          [5_000, []],
        ]),
      },
      { a: ["fog", "fog"], b: ["shield"] },
    );
    expect(r.items?.hits.map((h) => [h.to, h.blocked])).toEqual([
      ["b", true],
      ["b", false],
    ]);
    expect(r.items?.guard.b).toBe(false);
  });

  it("한 수 섞기: 맞은 사람이 같은 수를 맞은 뒤에 넣는다. 넣기 전에 지난 이정표는 넣은 때로 미룬다", () => {
    const moves = (() => {
      const r = judge(
        {
          a: log([
            [1_000, ["layer1"]],
            [2_000, ["!u1:mix"]],
          ]),
          b: log([
            [1_500, []],
            [9_000, []],
          ]),
        },
        { a: ["mix"] },
      );
      return r.items?.owed.b?.[0]?.moves as string;
    })();
    expect(moves).toBeTruthy();
    const r = judge(
      {
        a: log([
          [1_000, ["layer1"]],
          [2_000, ["!u1:mix"]],
        ]),
        // b는 2.3초에 첫 층(아직 넣지 않음), 2.6초에 넣는다
        b: log([
          [2_300, ["layer1"]],
          [2_600, [`!h1|a|1|${moves}`]],
        ]),
      },
      { a: ["mix"], b: ["fog"] },
    );
    expect(r.items?.owed.b).toBeUndefined();
    expect(r.items?.grants.find((g) => g.p === "b")?.at).toBe(2_600);
    expect(r.items?.out).toEqual({});
    // 다른 수를 넣거나 맞기 전에 넣으면 빠진다
    const bad = judge(
      {
        a: log([
          [1_000, ["layer1"]],
          [2_000, ["!u1:mix"]],
        ]),
        b: log([[2_600, ["!h1|a|1|R"]]]),
      },
      { a: ["mix"] },
    );
    expect(bad.items?.out.b).toBe(moves === "R" ? undefined : ITEM_BAD_HIT);
  });

  it("섞기를 넣지 않고 맞추면: 맞은 뒤 3초 안이면 받아 주고, 넘으면 그 맞춤을 받지 않는다", () => {
    const at = (t: number) =>
      judge(
        {
          a: log([
            [1_000, ["layer1"]],
            [2_000, ["!u1:mix"]],
          ]),
          b: log([[1_500, []]], solved(t)),
        },
        { a: ["mix"] },
        { final: true },
      );
    expect(at(4_000).items?.out).toEqual({});
    expect(at(5_500).items?.out).toEqual({ b: ITEM_NO_HIT });
  });

  it("시간 줍기(체력바 + 아이템): 깎인 체력을 한 번 깎인 만큼 채운다(100까지)", () => {
    const r = judge(
      {
        a: log([[1_000, ["layer1"]]]),
        b: log([
          [1_500, ["layer1"]],
          [2_500, ["!u1:heal"]],
          [3_000, []],
        ]),
      },
      { a: ["fog"], b: ["heal"] },
      { hp: true },
    );
    expect(r.hp.b).toBe(100);
    expect(r.items?.uses[0]).toMatchObject({ item: "heal", healed: 50 });
  });
});

it("미뤄 둔 몫과 시간 줍기가 같은 순간이면 깎기 먼저, 그다음 시간 줍기, 탈락은 둘 다 센 뒤에 본다(그 순간의 탈락을 막는다)", () => {
  const ladder = ["cross", "f2l1", "f2l2", "f2l3", "layer1"];
  const r = judgeParty({
    n: 3,
    players: ["a", "b"],
    logs: {
      // a는 b보다 늦게 십자를 지나 시간 줍기를 받고, 8초(미뤄 둔 윗면 몫과 같은 판정 시각)에 쓴다
      a: log([
        [5_500, ["cross"]],
        [8_000, ["!u1:heal"]],
        [9_000, []],
      ]),
      // b는 다섯을 따로(a 100 → 20), 7초에 둘째 층·윗면을 한꺼번에(7초에 −16 → 4, 8초에 미뤄 둔 −16)
      b: log([
        ...ladder.map((id, k) => [1_000 * (k + 1), [id]] as MarkSpec),
        [7_000, ["layer2", "oll"]],
      ]),
    },
    disputeMs: 1_000,
    final: false,
    hp: true,
    items: { seed: "s", draw: stub({ a: ["heal"] }) },
  });
  expect(r.hits.map((h) => h.at)).toEqual([
    1_000, 2_000, 3_000, 4_000, 5_000, 7_000, 8_000,
  ]);
  expect(r.items?.uses[0]).toMatchObject({ at: 8_000, item: "heal" });
  expect(r.knockedOut).toEqual({});
  expect(r.hp.a).toBe(4);
});

// ---- 기기마다 RaceHub 하나 ----

/** 2×2 섞기: 거꾸로 두면 2수째 첫 층, 9수째 윗면, 26수째 다 맞춤(party.test.ts와 같다) */
const SCRAMBLE =
  "F R U' R' U' R U R' F' R U R' U' R' F R F' R U R' U R U2 R' R F";
const fake: Scrambler = (event) => ({
  event,
  text: SCRAMBLE,
  official: false,
});
const SOLUTION = invertMoves(parseMoves(2, SCRAMBLE)) as CubeMove[];
const Y = parseMoves(2, "y y'") as CubeMove[];

function room(
  net: DelayNet,
  id: string,
  clock: ManualClock | OffsetClock,
  isHost: boolean,
  table: Record<string, ItemKind[]>,
  party: "items" | "hp-items" = "items",
  scrambler: Scrambler = fake,
  n = 2,
) {
  return new CubeRoom({
    transport: net.join(id),
    clock,
    isHost,
    ...(isHost ? {} : { hostId: "h" }),
    name: id,
    scrambler,
    drawItem: stub(table),
    ...(isHost
      ? { settings: { n, inspection: false, timeLimitSec: 60, party } }
      : {}),
  });
}

/** 풀림 뒤 `at` ms에 일을 한다 */
function at(
  clock: ManualClock,
  r: CubeRoom,
  steps: { at: number; run: (r: CubeRoom) => void }[],
) {
  let race = "";
  r.onChange(() => {
    const s = r.session();
    if (!s || s.snapshot().phase !== "race" || race === r.state?.race?.id)
      return;
    race = r.state?.race?.id ?? "";
    for (const step of steps) clock.after(step.at, () => step.run(r));
  });
}

const play = (moves: readonly CubeMove[]) => (r: CubeRoom) => {
  for (const m of moves) r.play(m);
};
const wiggle = play(Y);
/** 판정이 확실해지려면 상대 수가 와야 한다: 일정한 간격으로 큐브를 돌렸다 되돌린다 */
const wiggles = (from: number, to: number, every = 300) =>
  Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) => ({
    at: from + i * every,
    run: wiggle,
  }));

/** 판정이 확실해져 쓸 수 있을 때까지 일정한 간격으로 쓰기를 해 본다(한 번 쓰면 그만) */
const spendUntil = (from: number, to: number, every = 200) => {
  let done = false;
  return Array.from(
    { length: Math.floor((to - from) / every) + 1 },
    (_, i) => ({
      at: from + i * every,
      run: (r: CubeRoom) => {
        if (!done) done = r.spendItem() !== null;
      },
    }),
  );
};

function playRound(clock: ManualClock, rooms: CubeRoom[]) {
  expect(rooms[0]?.startRound()).toBe(true);
  runUntil(clock, () => rooms.every((r) => r.rounds.length === 1), 120_000, 20);
}

describe("아이템전(기기마다)", () => {
  it("한 수 섞기: 맞은 기기가 같은 수를 넣고, 두 기기가 그 사람 상태·판 기록을 같게 낸다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    net.setDelay("h", "g", 120);
    net.setDelay("g", "h", 90);
    const table = { h: ["mix" as ItemKind], g: ["fog" as ItemKind] };
    const host = room(net, "h", clock, true, table);
    const guest = room(net, "g", clock, false, table);
    clock.advance(500);
    expect(guest.state?.settings.party).toBe("items");
    let used: ItemKind | null = null;
    at(clock, host, [
      { at: 1_000, run: play(SOLUTION.slice(0, 2)) },
      ...wiggles(1_300, 3_400),
      {
        at: 2_000,
        run: (r) => {
          used = r.spendItem();
        },
      },
      { at: 6_000, run: play(SOLUTION.slice(2)) },
    ]);
    at(clock, guest, [
      ...wiggles(1_200, 3_600),
      {
        at: 4_000,
        run: (r) => {
          // 넣은 섞기를 되돌리고 끝까지
          const hit = r
            .session()
            ?.moveLog("g")
            .find((x) => x.m.startsWith("!hit|"));
          const text = hit?.m.split("|")[3] as string;
          play([...undoMoves(2, text), ...SOLUTION])(r);
        },
      },
    ]);
    playRound(clock, [host, guest]);
    expect(used).toBe("mix");
    const h = host.rounds[0];
    expect(guest.rounds[0]).toEqual(h);
    expect(h?.items?.used.h).toEqual(["mix"]);
    expect(h?.items?.hit.g).toEqual(["mix"]);
    expect(h?.items?.out).toEqual({});
    expect(h?.logs.g?.some((x) => x.m.startsWith("!hit|h|1|"))).toBe(true);
    expect(h?.result.players.g?.status).toBe("done");
    expect(h?.result.ranking[0]).toBe("g");
    // 모든 기기가 그 사람 상태에 같은 수를 끼워 다시 적용했다
    expect(stateHash(host.anySession()?.stateOf("g") as PuzzleState)).toBe(
      stateHash(guest.session()?.stateOf("g") as PuzzleState),
    );
  });

  it("쓴 시각은 증인 하한으로 확인한다: 고친 클라이언트가 일찍 썼다고 적어도 정직한 두 기기가 확인한 같은 시각을 쓴다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const table = { c: ["fog" as ItemKind] };
    const host = room(net, "h", clock, true, table);
    const cheatClock = new OffsetClock(clock, 0);
    const cheat = room(net, "c", cheatClock, false, table);
    const other = room(net, "o", clock, false, table);
    clock.advance(100);
    at(clock, cheat, [
      { at: 1_000, run: play(SOLUTION.slice(0, 2)) },
      {
        at: 4_000,
        run: (r) => {
          // 시계를 2.5초 뒤로 돌려 「1.5초에 썼다」고 적는다
          cheatClock.offset -= 2_500;
          r.spendItem();
          cheatClock.offset += 2_500;
        },
      },
      { at: 4_500, run: wiggle },
      { at: 8_000, run: play(SOLUTION.slice(2)) },
    ]);
    for (const r of [host, other])
      at(clock, r, [
        ...wiggles(1_200, 5_000),
        { at: 9_000, run: play(SOLUTION) },
      ]);
    playRound(clock, [host, other]);
    const use = cheat
      .session()
      ?.moveLog("c")
      .find((x) => x.m === "!u:fog");
    expect(use?.t).toBeLessThan(2_000);
    for (const r of [host, other]) {
      const party = r.party();
      expect(party?.items?.uses[0]?.at).toBeGreaterThan(3_500);
    }
    expect(host.party()?.items?.uses).toEqual(other.party()?.items?.uses);
    expect(host.rounds[0]?.items).toEqual(other.rounds[0]?.items);
  });

  it("방패가 방해 하나를 막는다(두 기기가 같게 본다)", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const table = { h: ["swap" as ItemKind], g: ["shield" as ItemKind] };
    const host = room(net, "h", clock, true, table);
    const guest = room(net, "g", clock, false, table);
    clock.advance(100);
    at(clock, guest, [
      { at: 800, run: play(SOLUTION.slice(0, 2)) },
      ...wiggles(1_100, 3_500),
      { at: 6_000, run: play(SOLUTION.slice(2)) },
    ]);
    at(clock, host, [
      { at: 1_000, run: play(SOLUTION.slice(0, 2)) },
      ...wiggles(1_200, 3_500),
      { at: 2_000, run: (r) => r.spendItem() },
      { at: 7_000, run: play(SOLUTION.slice(2)) },
    ]);
    playRound(clock, [host, guest]);
    expect(host.rounds[0]?.items).toEqual(guest.rounds[0]?.items);
    expect(host.rounds[0]?.items?.blocked.g).toBe(1);
    expect(host.rounds[0]?.items?.hit.g).toEqual([]);
  });

  it("되감기는 내 마지막 3수를 되돌리고(수로 세지 않는다), 힌트는 다음 수까지 켜진다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const table = { h: ["rewind" as ItemKind, "hint" as ItemKind] };
    const host = room(net, "h", clock, true, table);
    const guest = room(net, "g", clock, false, table);
    clock.advance(100);
    let afterTwo = "";
    const hintOn: boolean[] = [];
    at(clock, host, [
      {
        at: 1_000,
        run: (r) => {
          play(SOLUTION.slice(0, 2))(r);
          afterTwo = stateHash(r.session()?.stateOf("h") as PuzzleState);
        },
      },
      { at: 1_200, run: play(SOLUTION.slice(2, 5)) },
      ...wiggles(1_300, 4_000).filter((s) => s.at > 2_100),
      { at: 2_000, run: (r) => r.spendItem() },
      // 되감은 3수를 다시 두고 윗면까지 → 힌트를 받아 쓴다
      { at: 4_200, run: play(SOLUTION.slice(2, 9)) },
      ...wiggles(4_500, 6_000).filter((s) => s.at < 5_000),
      {
        at: 5_500,
        run: (r) => {
          r.spendItem();
          hintOn.push(!!r.itemScreen()?.hint);
          play(SOLUTION.slice(9, 10))(r);
          hintOn.push(!!r.itemScreen()?.hint);
        },
      },
      { at: 6_500, run: play(SOLUTION.slice(10)) },
    ]);
    at(clock, guest, [
      ...wiggles(1_100, 6_000),
      { at: 7_000, run: play(SOLUTION) },
    ]);
    const states: string[] = [];
    host.onChange(() => {
      const s = host.session();
      const log = s?.moveLog("h") ?? [];
      if (log.at(-1)?.m === itemUseText("rewind") && states.length === 0)
        states.push(stateHash(s?.stateOf("h") as PuzzleState));
    });
    playRound(clock, [host, guest]);
    expect(states[0]).toBe(afterTwo);
    // 다른 기기도 같은 상태로 다시 적용했다
    const glog = guest.rounds[0]?.logs.h ?? [];
    expect(glog.some((x) => x.m === "!u:rewind")).toBe(true);
    expect(host.rounds[0]?.items).toEqual(guest.rounds[0]?.items);
    expect(host.rounds[0]?.items?.used.h).toEqual(["rewind", "hint"]);
    expect(hintOn).toEqual([true, false]);
    expect(host.rounds[0]?.result.players.h?.status).toBe("done");
  });

  it("시간 줍기는 체력바와 맞물린다(두 기기가 같은 체력)", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const table = { h: ["heal" as ItemKind], g: ["fog" as ItemKind] };
    const host = room(net, "h", clock, true, table, "hp-items");
    const guest = room(net, "g", clock, false, table, "hp-items");
    clock.advance(100);
    at(clock, guest, [
      { at: 800, run: play(SOLUTION.slice(0, 2)) },
      ...wiggles(1_000, 4_000),
      { at: 9_000, run: play(SOLUTION.slice(2)) },
    ]);
    const hp: number[] = [];
    at(clock, host, [
      { at: 1_000, run: play(SOLUTION.slice(0, 2)) },
      ...wiggles(1_200, 4_000),
      {
        at: 2_500,
        run: (r) => {
          hp.push(r.party()?.hp.h ?? -1);
          r.spendItem();
        },
      },
      { at: 3_500, run: (r) => hp.push(r.party()?.hp.h ?? -1) },
    ]);
    playRound(clock, [host, guest]);
    expect(hp).toEqual([50, 100]);
    expect(host.rounds[0]?.party).toEqual(guest.rounds[0]?.party);
    expect(host.rounds[0]?.items?.used.h).toEqual(["heal"]);
  });

  it("화면 방해는 그 기기 화면에서만 정한 시간 동안: 색 뒤집기 4초·흑백 화면 4초·안개 3초, 그 동안 상태는 그대로", () => {
    for (const [item, ms, flag] of [
      ["swap", SWAP_MS, "swap"],
      ["gray", GRAY_MS, "gray"],
      ["fog", SCREEN_HIT_MS, "fog"],
    ] as const) {
      const clock = new ManualClock();
      const net = new DelayNet(clock);
      const table = { g: [item as ItemKind] };
      const host = room(net, "h", clock, true, table);
      const guest = room(net, "g", clock, false, table);
      clock.advance(100);
      at(clock, guest, [
        { at: 800, run: play(SOLUTION.slice(0, 2)) },
        ...wiggles(1_000, 3_000),
        { at: 1_500, run: (r) => r.spendItem() },
      ]);
      at(clock, host, wiggles(900, 3_000));
      expect(host.startRound()).toBe(true);
      runUntil(clock, () => !!host.itemScreen()?.[flag], 30_000, 10);
      const before = stateHash(host.session()?.stateOf("h") as PuzzleState);
      const notice = host.itemScreen()?.notices[0];
      expect(notice).toMatchObject({ item, by: "g", blocked: false });
      clock.advance(ms - 50);
      expect(host.itemScreen()?.[flag]).toBe(true);
      expect(stateHash(host.session()?.stateOf("h") as PuzzleState)).toBe(
        before,
      );
      clock.advance(100);
      expect(host.itemScreen()?.[flag]).toBe(false);
      // 쓴 쪽 화면은 그대로
      expect(guest.itemScreen()?.[flag]).toBe(false);
      host.dispose();
      guest.dispose();
    }
  });

  it("다른 사람 자리의 맞은 방해: 쓴 쪽 화면에도 그 방해가 이어지는 동안 보이고, 내가 맞은 것은 넣지 않는다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const table = { g: ["gray" as ItemKind] };
    const host = room(net, "h", clock, true, table);
    const guest = room(net, "g", clock, false, table);
    clock.advance(100);
    at(clock, guest, [
      { at: 800, run: play(SOLUTION.slice(0, 2)) },
      ...wiggles(1_000, 3_000),
      { at: 1_500, run: (r) => r.spendItem() },
    ]);
    at(clock, host, wiggles(900, 3_000));
    expect(host.startRound()).toBe(true);
    runUntil(clock, () => (guest.peerNotices().h?.length ?? 0) > 0, 30_000, 10);
    expect(guest.peerNotices().h?.[0]).toMatchObject({
      item: "gray",
      by: "g",
      blocked: false,
    });
    expect(host.peerNotices().h).toBeUndefined();
    clock.advance(GRAY_MS - 50);
    expect(guest.peerNotices().h?.length).toBe(1);
    clock.advance(100);
    expect(guest.peerNotices().h).toBeUndefined();
    host.dispose();
    guest.dispose();
  });

  it("찾아 주기(3×3): 쓰면 다음 이정표의 안 맞은 조각이 빛나고 5초 뒤 꺼진다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const scramble3: Scrambler = (event) => ({
      event,
      text: "R U",
      official: false,
    });
    const table = { h: Array(7).fill("find") as ItemKind[] };
    const host = room(net, "h", clock, true, table, "items", scramble3, 3);
    const guest = room(net, "g", clock, false, table, "items", scramble3, 3);
    clock.advance(100);
    const Y3 = parseMoves(3, "y y'") as CubeMove[];
    const w3 = (from: number, to: number) =>
      Array.from({ length: (to - from) / 300 + 1 }, (_, i) => ({
        at: from + i * 300,
        run: play(Y3),
      }));
    at(clock, host, [
      { at: 1_000, run: play(parseMoves(3, "U'") as CubeMove[]) },
      ...w3(1_200, 2_400),
    ]);
    at(clock, guest, w3(1_100, 2_400));
    expect(host.startRound()).toBe(true);
    runUntil(clock, () => !!host.heldItem("h"), 30_000, 10);
    const state = host.session()?.stateOf("h") as PuzzleState;
    expect(host.spendItem()).toBe("find");
    const want = findMarksOf(state);
    expect(want).not.toBeNull();
    expect(host.itemScreen()?.find).toEqual(want);
    clock.advance(FIND_MS - 10);
    expect(host.itemScreen()?.find).toEqual(want);
    clock.advance(20);
    expect(host.itemScreen()?.find).toBeNull();
    host.dispose();
    guest.dispose();
  });

  it("컴퓨터도 아이템을 받아 정해진 때 쓰고, 맞은 섞기는 되돌린다. 다른 기기의 계획 확인이 통과한다", async () => {
    const clock = new ManualClock();
    const host = new CubeRoom({
      clock,
      isHost: true,
      name: "나",
      scrambler: fake,
      botPlan: planHere,
      drawItem: stub({ me: ["mix"], bot1: ["fog", "fog"] }),
      settings: { n: 2, inspection: false, timeLimitSec: 180, party: "items" },
    });
    host.addBot("beginner");
    at(clock, host, [
      { at: 300, run: play(SOLUTION.slice(0, 2)) },
      ...wiggles(500, 90_000, 400),
      ...spendUntil(1_000, 6_000),
      { at: 100_000, run: play(SOLUTION.slice(2)) },
    ]);
    playRound(clock, [host]);
    const r = host.rounds[0];
    expect(r?.items?.used.me).toEqual(["mix"]);
    expect(r?.items?.hit.bot1).toEqual(["mix"]);
    expect(r?.items?.used.bot1?.length).toBeGreaterThan(0);
    const botLog = r?.logs.bot1 ?? [];
    expect(botLog.some((x) => x.m.startsWith("!hit|me|1|"))).toBe(true);
    expect(r?.result.players.bot1?.status).toBe("done");
    expect(
      await checkBotRun(
        "beginner",
        2,
        r?.start as PuzzleState,
        r?.seed as string,
        "bot1",
        botLog,
      ),
    ).toBe(true);
    // 계획보다 빨리 둔 것처럼 시각을 당기면 드러난다
    const faster = botLog.map((x, i) =>
      i === botLog.length - 1 ? { ...x, t: x.t - 5_000 } : x,
    );
    expect(
      await checkBotRun(
        "beginner",
        2,
        r?.start as PuzzleState,
        r?.seed as string,
        "bot1",
        faster,
      ),
    ).toBe(false);
  });

  it("옛 방 상태도 읽힌다: 파티 칸이 없으면 일반, 체력바만이면 예전 지문. 아이템전은 지문에 모드를 넣는다", () => {
    const plain = raceOptionsFor(DEFAULT_SETTINGS);
    expect(plain.checkpoints).toBeUndefined();
    expect(plain.gameOptions).toBeUndefined();
    expect(
      raceOptionsFor({ ...DEFAULT_SETTINGS, party: "hp" }).gameOptions,
    ).toEqual({ party: "hp" });
    const items = raceOptionsFor({ ...DEFAULT_SETTINGS, party: "items" });
    expect(items.checkpoints).toBe(true);
    expect(items.gameOptions).toEqual({ party: "items" });
    // 손님은 아이템전 방 상태를 받는다(옛 화면은 버린다: party.test.ts)
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    const host = room(net, "h", clock, true, {}, "hp-items");
    const guest = room(net, "g", clock, false, {});
    clock.advance(100);
    expect(guest.state?.settings.party).toBe("hp-items");
    // 일반 대결에서는 특별한 수를 둘 수 없다
    const normal = new CubeRoom({
      clock,
      isHost: true,
      name: "나",
      scrambler: fake,
      settings: { n: 2, inspection: false, timeLimitSec: 60 },
    });
    expect(normal.spendItem()).toBeNull();
    host.dispose();
    guest.dispose();
    normal.dispose();
  });
});

it("되돌리기 수(넣은 섞기 거꾸로)", () => {
  expect(undoMoves(3, "R U'").map((m) => [m.axis, m.turns])).toEqual([
    ["y", 1],
    ["x", 3],
  ]);
  expect(trackOf({ perm: new Uint16Array(), twist: new Uint8Array() })).toEqual(
    { uses: [], hits: [], recent: [] },
  );
});
