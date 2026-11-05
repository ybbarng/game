import {
  applyMoves,
  type CubeMove,
  formatMove,
  invertMoves,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { ScrambleEvent } from "@game/cube-scramble";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import { RaceSession } from "@/net/race/race-session";
import { groupSplits } from "../progress/splits";
import { RaceHub } from "./hub";
import { type CubeAct, createCubeRaceGame, type Scrambler } from "./race-game";
import {
  liveOrder,
  pickToasts,
  type StageEntry,
  StageTracker,
  splitCell,
  splitColumns,
  splitsFromLog,
} from "./race-stages";

/**
 * 대결 실시간 단계 표시(docs/51 1-3). 이정표는 이미 받은 수 기록에서 각 기기가 계산한다:
 * 같은 수열을 받은 기기는 같은 칩·시각을 내고, 보내는 말은 바뀌지 않는다.
 */

const SCRAMBLE = "R U R' U' F2 D L B'";
const fake: Scrambler = (event: ScrambleEvent) => ({
  event,
  text: SCRAMBLE,
  official: false,
});

type Session = RaceSession<CubeAct, PuzzleState>;

/** 대결 틀이 쓰는 말 종류(`net/race/messages.ts`). 단계 표시를 넣은 뒤에도 이것만 오간다 */
const RACE_MESSAGES = new Set([
  "race-commit",
  "race-reveal",
  "race-seed",
  "race-moves",
  "race-done",
  "race-retire",
  "race-bound",
]);

describe("대결 단계: 기기마다 같다", () => {
  it("같은 수열을 받은 두 기기가 같은 이정표·시각을 내고, 보내는 말은 그대로다", () => {
    const clock = new ManualClock();
    const net = new DelayNet(clock);
    // 오가는 말을 모두 적는다(종류와 칸 이름)
    const sent: { type: string; keys: string }[] = [];
    net.filter = (m) => {
      // 허브 봉투(`{type: "cube-race", f, to?, m}`) 안의 대결 말
      const env = m as { type: string; m: Record<string, unknown> };
      expect(env.type).toBe("cube-race");
      const msg = env.m;
      sent.push({
        type: String(msg.type),
        keys: Object.keys(msg).sort().join(","),
      });
      return m;
    };
    const devices: Record<string, string[]> = { a: ["a"], b: ["b"] };
    const sessions = new Map<string, Session>();
    for (const [device, people] of Object.entries(devices)) {
      const hub = new RaceHub({
        transport: net.join(device),
        clock,
        owner: (p) => Object.keys(devices).find((d) => devices[d]?.includes(p)),
        participantsOf: (d) => devices[d] ?? [],
      });
      const game = createCubeRaceGame(3, fake);
      for (const id of people) {
        let k = 0;
        sessions.set(
          id,
          new RaceSession({
            game,
            transport: hub.local(id),
            clock,
            race: "r1",
            players: ["a", "b"],
            options: { inspectionMs: 1_000, timeLimitMs: 120_000 },
            random: () => `${id}-${k++}`,
          }),
        );
      }
    }
    const a = sessions.get("a") as Session;
    const b = sessions.get("b") as Session;
    for (const s of sessions.values()) s.start();
    runUntil(clock, () => a.snapshot().phase === "race");
    // a가 섞기의 거꾸로를 들쭉날쭉한 간격으로 둔다(중간에 큐브 돌리기 하나)
    const moves = [
      ...invertMoves(parseMoves(3, SCRAMBLE)).slice(0, 4),
      ...parseMoves(3, "y y'"),
      ...invertMoves(parseMoves(3, SCRAMBLE)).slice(4),
    ];
    const gaps = [310, 120, 980, 45, 200, 200, 640, 75, 1_210, 90];
    let j = 0;
    const step = () => {
      const r = a.play(moves[j] as CubeMove);
      expect(r.ok).toBe(true);
      j++;
      if (j < moves.length) clock.after(gaps[j] ?? 100, step);
    };
    clock.after(gaps[0] as number, step);
    runUntil(clock, () => b.moveLog("a").length === moves.length);

    const start = a.startState() as PuzzleState;
    expect(b.startState()).toEqual(start);
    const onA = splitsFromLog(3, start, a.moveLog("a"));
    const onB = splitsFromLog(3, b.startState() as PuzzleState, b.moveLog("a"));
    expect(onA.length).toBeGreaterThan(1);
    expect(onB).toEqual(onA);
    expect(groupSplits(onB)).toEqual(groupSplits(onA));
    // 시각은 대결 시계(풀림 기준, 수에 단 시각)다: 맞춘 시각이 그 사람이 알린 시간과 같다
    runUntil(clock, () => b.snapshot().peers[0]?.status === "done");
    const reported = b.snapshot().peers.find((p) => p.id === "a")?.reported;
    expect(onB.find((s) => s.id === "ll")?.ms).toBe(reported);

    for (const m of sent) expect(RACE_MESSAGES.has(m.type)).toBe(true);
    // 수 묶음 말의 칸은 예전 그대로(이정표 칸이 없다)
    const movesMsg = sent.find((m) => m.type === "race-moves");
    expect(movesMsg?.keys).toBe("attempt,moves,race,type");
  });

  it("이어서 세어도 한 번에 센 것과 같다", () => {
    const start = applyMoves(3, solvedCube(3), parseMoves(3, SCRAMBLE));
    const log = invertMoves(parseMoves(3, SCRAMBLE)).map((mv, i) => ({
      m: formatMove(3, mv),
      t: 500 * (i + 1),
    }));
    const whole = splitsFromLog(3, start, log);
    const tracker = new StageTracker(3, start);
    tracker.update("a", log.slice(0, 3));
    tracker.update("a", log.slice(0, 6));
    expect(tracker.update("a", log)).toEqual(whole);
    expect(whole.at(-1)).toEqual({ id: "ll", ms: 4_000 });
  });
});

const g = (ids: string[], ms: number) => ({
  ids,
  main: ids[0] as string,
  label: ids[0] as string,
  full: ids.join(" · "),
  ms,
  lap: 0,
});

describe("앞선 차례와 톡 고르기", () => {
  it("맞춘 사람 → 더 나아간 이정표 → 먼저 지난 사람 → 못 맞춤·기권", () => {
    const entries: StageEntry[] = [
      { id: "p1", status: "playing", groups: [g(["cross"], 3_000)] },
      { id: "p2", status: "forfeit", groups: [] },
      {
        id: "p3",
        status: "playing",
        groups: [g(["cross"], 2_000), g(["f2l1"], 6_000)],
      },
      { id: "p4", status: "playing", groups: [g(["cross"], 2_500)] },
      { id: "p5", status: "done", reported: 30_000, groups: [] },
      { id: "p6", status: "playing", groups: [] },
      { id: "p7", status: "dnf", groups: [] },
      { id: "p8", status: "done", reported: 25_000, groups: [] },
    ];
    expect(liveOrder(entries)).toEqual([
      "p8",
      "p5",
      "p3",
      "p4",
      "p1",
      "p6",
      "p7",
      "p2",
    ]);
  });

  it("4명까지는 이정표를 지난 사람 모두", () => {
    const order = ["a", "b", "c", "d"];
    expect(pickToasts(["d", "a"], { order, prevLeader: "a", me: "b" })).toEqual(
      ["d", "a"],
    );
  });

  it("4명이 넘으면 1등이 바뀐 때와 나·내 바로 앞뒤만", () => {
    const order = ["a", "b", "c", "me", "e", "f", "g"];
    // 1등은 그대로(a), 멀리 있는 a·g는 빠지고 나와 앞뒤(c·e)만
    expect(
      pickToasts(["a", "c", "me", "e", "g"], {
        order,
        prevLeader: "a",
        me: "me",
      }),
    ).toEqual(["c", "me", "e"]);
    // b가 1등이 되면 b도 띄운다
    expect(
      pickToasts(["b", "f"], {
        order: ["b", "a", "c", "me", "e", "f", "g"],
        prevLeader: "a",
        me: "me",
      }),
    ).toEqual(["b"]);
    // 보는 사람(판에 들지 않음)은 1등이 바뀔 때만
    expect(
      pickToasts(["c", "b"], {
        order: ["b", ...order],
        prevLeader: "a",
        me: "x",
      }),
    ).toEqual(["b"]);
  });
});

describe("결과 상자의 구간 기록 열", () => {
  it("사람들 칩의 대표 단계를 진행 차례로, 다 맞춘 순간에 함께 켜진 칸은 비운다", () => {
    const one = [
      { id: "cross", ms: 2_000 },
      { id: "f2l1", ms: 5_000 },
      { id: "oll", ms: 20_000 },
      { id: "ll", ms: 20_000 },
    ];
    const two = [
      { id: "cross", ms: 3_000 },
      { id: "eoline", ms: 3_000 },
      { id: "oll", ms: 18_000 },
      { id: "ll", ms: 24_000 },
    ];
    expect(splitColumns([groupSplits(one), groupSplits(two)])).toEqual([
      "cross",
      "eoline",
      "f2l1",
      "oll",
    ]);
    expect(splitCell(one, "oll")).toBeNull();
    expect(splitCell(two, "oll")).toBe(18_000);
    expect(splitCell(two, "f2l1")).toBeNull();
  });
});
