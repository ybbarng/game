import { parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import {
  addCrossRecord,
  CROSS_RECORDS_KEY,
  crossStats,
  loadCrossRecords,
} from "./records";
import { analyzeRound } from "./scramble";
import {
  type CrossConditions,
  type CrossRecord,
  CrossSession,
  conditionKey,
  DEFAULT_CONDITIONS,
  limitFor,
} from "./session";

const SCRAMBLE = "R U F' L2 D B' R2 U' F";
const ROUND = analyzeRound(SCRAMBLE, [0], false);
const BEST = ROUND.solutions[0]?.moves ?? "";

function setup(cond: Partial<CrossConditions> = {}) {
  const clock = new ManualClock();
  const records: CrossRecord[] = [];
  const s = new CrossSession({
    clock,
    onRecord: (r) => records.push(r),
    wallNow: () => 1,
  });
  const c = { ...DEFAULT_CONDITIONS, ...cond };
  s.start(ROUND, c);
  const play = (text: string) => {
    for (const m of parseMoves(3, text)) s.input(m);
  };
  return { s, clock, records, play, c };
}

describe("십자 훈련 한 판", () => {
  it("살펴보기 중 큐브 돌리기는 시작이 아니고, 최적 해를 치면 성공", () => {
    const { s, clock, records, play } = setup({ limit: "opt" });
    expect(ROUND.optimal).toBeGreaterThan(0);
    play("y x'");
    play("x y'");
    expect(s.phase).toBe("inspect");
    clock.advance(4_000);
    play(BEST);
    expect(s.phase).toBe("done");
    expect(s.result).toMatchObject({
      ok: true,
      moves: ROUND.optimal,
      optimal: ROUND.optimal,
      inspectMs: 4_000,
      penalty: 0,
      color: 0,
    });
    expect(records).toHaveLength(1);
    expect(records[0]?.cond).toBe(
      conditionKey({ ...DEFAULT_CONDITIONS, limit: "opt" }),
    );
  });

  it("반 바퀴는 한 수: 같은 면을 잇달아 돌리면 합친다", () => {
    const { s, play } = setup({ limit: "none" });
    play("U U");
    expect(s.moves).toBe(1);
    play("U'");
    expect(s.moves).toBe(1);
    play("U'");
    expect(s.moves).toBe(0);
    play("R");
    s.undo();
    expect(s.moves).toBe(0);
    play("M");
    expect(s.moves).toBe(2);
    play("x U");
    expect(s.moves).toBe(3);
  });

  it("수 제한을 넘는 순간 실패", () => {
    const { s, records, play } = setup({ limit: "opt" });
    const limit = limitFor("opt", ROUND.optimal) as number;
    // 같은 면이 이어지지 않게 R L을 번갈아 친다
    for (let i = 0; i <= limit && s.phase !== "done"; i++)
      play(i % 2 ? "L" : "R");
    expect(s.phase).toBe("done");
    expect(s.result).toMatchObject({ ok: false, reason: "over" });
    expect(s.result?.moves).toBe(limit + 1);
    expect(records[0]?.ok).toBe(false);
  });

  it("15초를 넘겨 시작하면 +2, 17초가 되면 DNF", () => {
    const a = setup();
    a.clock.advance(15_500);
    a.play(BEST);
    expect(a.s.result?.penalty).toBe(2_000);

    const b = setup();
    b.clock.advance(16_999);
    expect(b.s.phase).toBe("inspect");
    b.clock.advance(1);
    expect(b.s.result).toMatchObject({ ok: false, reason: "inspection" });
  });

  it("8초 살펴보기는 10초에 DNF, 무제한은 끝나지 않는다", () => {
    const a = setup({ inspection: 8 });
    a.clock.advance(10_000);
    expect(a.s.result?.reason).toBe("inspection");

    const b = setup({ inspection: "none" });
    b.clock.advance(120_000);
    expect(b.s.phase).toBe("inspect");
    b.play(BEST);
    expect(b.s.result).toMatchObject({ ok: true, penalty: 0 });
  });

  it("계획 후 가리고: 치는 동안 가리고, 「끝」에 십자가 없으면 실패", () => {
    const { s, play } = setup({ style: "blind", limit: "none" });
    expect(s.mask).toBeNull();
    play("R");
    expect(s.hidden).toBe(true);
    expect(s.mask?.every((v) => v === "hidden")).toBe(true);
    s.declareDone();
    expect(s.result).toMatchObject({ ok: false, reason: "unsolved" });
    expect(s.mask).toBeNull();
  });

  it("계획 후 가리고: 십자가 되면 바로 성공", () => {
    const { s, play } = setup({ style: "blind" });
    play(BEST);
    expect(s.result?.ok).toBe(true);
  });

  it("같은 섞기 다시: 처음 상태로 돌아가 새로 잰다", () => {
    const { s, clock, play, c } = setup();
    play("R U");
    s.start(ROUND, c);
    expect(s.phase).toBe("inspect");
    expect(s.moves).toBe(0);
    clock.advance(1_000);
    play(BEST);
    expect(s.result?.ok).toBe(true);
  });
});

describe("십자 훈련 기록", () => {
  const store = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };
  const rec = (over: Partial<CrossRecord> = {}): CrossRecord => ({
    at: 1,
    cond: "a",
    ok: true,
    moves: 6,
    optimal: 5,
    solveMs: 3_000,
    inspectMs: 9_000,
    penalty: 0,
    scramble: SCRAMBLE,
    ...over,
  });

  it("저장하고 다시 읽는다(새것이 앞), 모양이 틀린 줄은 버린다", () => {
    const s = store();
    addCrossRecord(rec({ at: 1 }), s);
    addCrossRecord(rec({ at: 2 }), s);
    expect(loadCrossRecords(s).map((r) => r.at)).toEqual([2, 1]);
    s.setItem(
      CROSS_RECORDS_KEY,
      JSON.stringify({
        records: [rec(), { ...rec(), moves: "x" }, { ...rec(), penalty: 5 }],
      }),
    );
    expect(loadCrossRecords(s)).toHaveLength(1);
    s.setItem(CROSS_RECORDS_KEY, "{망가짐");
    expect(loadCrossRecords(s)).toEqual([]);
  });

  it("조건별 성공률·평균 더 친 수·평균 살펴보기", () => {
    const list = [
      rec({ moves: 7, inspectMs: 10_000 }),
      rec({ moves: 5, inspectMs: 6_000 }),
      rec({ ok: false, reason: "over", moves: 8, inspectMs: 8_000 }),
      rec({ ok: false, reason: "inspection", inspectMs: 17_000 }),
      rec({ cond: "b" }),
    ];
    const st = crossStats(list, "a");
    expect(st.count).toBe(4);
    expect(st.successRate).toBe(0.5);
    expect(st.avgExtra).toBe(1);
    expect(st.avgInspectMs).toBe(8_000);
    expect(crossStats(list, "없음").successRate).toBeNull();
  });
});
