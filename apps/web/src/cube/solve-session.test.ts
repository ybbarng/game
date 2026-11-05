import { invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import type { SolveRecord } from "./records";
import {
  type SessionCue,
  SolveSession,
  type SolveSessionOptions,
} from "./solve-session";

const SCRAMBLE = "R U F' D2";

function setup(over: Partial<SolveSessionOptions> = {}) {
  const clock = new ManualClock();
  const cues: SessionCue[] = [];
  const records: SolveRecord[] = [];
  const s = new SolveSession({
    n: 3,
    mode: "solo",
    inspection: true,
    clock,
    onCue: (c) => cues.push(c),
    onRecord: (r) => records.push(r),
    ...over,
  });
  /** 표기 글을 한 수씩 넣는다 */
  const type = (text: string) => {
    for (const m of parseMoves(3, text)) s.input(m, text);
  };
  /** 섞기를 거꾸로 넣어 맞춘다 */
  const solve = () => {
    for (const m of invertMoves(parseMoves(3, SCRAMBLE))) s.input(m, "");
  };
  return { clock, cues, records, s, type, solve };
}

describe("혼자 맞추기", () => {
  it("살펴보기: 8·12초 알림, 큐브 돌리기는 시간을 열지 않고 첫 면 돌리기가 연다", () => {
    const { clock, cues, s, type } = setup();
    s.start(SCRAMBLE, 42);
    expect(s.phase).toBe("inspect");
    clock.advance(8_000);
    expect(cues).toEqual(["inspect8"]);
    type("x");
    expect(s.phase).toBe("inspect");
    expect(s.moveCount).toBe(0);
    clock.advance(4_000);
    expect(cues).toEqual(["inspect8", "inspect12"]);
    type("R");
    expect(s.phase).toBe("solving");
    expect(s.moveCount).toBe(1);
    clock.advance(1_000);
    expect(s.elapsed()).toBe(1_000);
  });

  it("맞추면 멈추고 시간·수·소리·기록(섞기 글과 씨앗 포함)", () => {
    const { clock, cues, records, s, solve } = setup();
    s.start(SCRAMBLE, 42);
    clock.advance(3_000);
    solve();
    // 마지막 수 전에 시간이 흐른 것은 없다: 첫 수와 마지막 수가 같은 순간
    expect(s.phase).toBe("done");
    expect(s.result).toMatchObject({ ms: 0, penalty: 0, moves: 4 });
    expect(cues).toContain("solved");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      scramble: SCRAMBLE,
      seed: 42,
      n: 3,
      mode: "solo",
      moves: 4,
    });
  });

  it("구간 기록: 이정표를 처음 지난 시각을 지난 차례로 남기고, 기록에 함께 저장한다", () => {
    const { clock, records, s, type } = setup({ inspection: false });
    s.start("U R");
    clock.advance(1_000);
    type("R'");
    // 첫 수가 시간을 연다: 위층만 어긋난 상태라 아래 두 층·블록이 한꺼번에 켜진다
    expect(s.splitOf("cross")).toBe(0);
    expect(s.splitOf("layer2")).toBe(0);
    expect(s.splitOf("ll")).toBeUndefined();
    expect(s.bestProgress).toBeGreaterThan(0.9);
    clock.advance(1_500);
    type("U'");
    expect(s.phase).toBe("done");
    expect(s.splitOf("ll")).toBe(1_500);
    expect(records[0]?.splits).toMatch(/^cross@0 .*ll@1500$/);
  });

  it("구간 기록은 새 판·맞춘 상태로에서 지우고, 블라인드는 재지 않는다", () => {
    const { s, type } = setup({ inspection: false });
    s.start("U R");
    type("R'");
    expect(s.splits.length).toBeGreaterThan(0);
    s.start("U R");
    expect(s.splits).toEqual([]);
    expect(s.bestProgress).toBe(0);
    const blind = setup({ mode: "blind" });
    blind.s.start("U R");
    blind.s.advance();
    blind.type("R'");
    expect(blind.s.splits).toEqual([]);
  });

  it("시간은 첫 면 돌리기부터 맞춘 수까지", () => {
    const { clock, s } = setup();
    s.start(SCRAMBLE);
    const [first, ...rest] = invertMoves(parseMoves(3, SCRAMBLE));
    if (!first) throw new Error("수가 없다");
    s.input(first, "");
    for (const m of rest) {
      clock.advance(500);
      s.input(m, "");
    }
    expect(s.result?.ms).toBe(1_500);
  });

  it("15초 넘겨 시작하면 +2", () => {
    const { clock, s, solve } = setup();
    s.start(SCRAMBLE);
    clock.advance(15_500);
    solve();
    expect(s.result).toMatchObject({ penalty: 2_000 });
  });

  it("17초가 지나도록 시작하지 않으면 DNF", () => {
    const { clock, cues, records, s } = setup();
    s.start(SCRAMBLE);
    clock.advance(17_000);
    expect(s.phase).toBe("done");
    expect(s.result).toMatchObject({ ms: null, dnfReason: "inspection" });
    expect(cues.at(-1)).toBe("dnf");
    expect(records[0]?.ms).toBeNull();
  });

  it("정리한 세션은 늦게 온 섞기로 다시 열리지 않고 소리·기록도 내지 않는다", () => {
    // 섞기 준비 중에 크기를 바꾸면 옛 세션이 정리된 뒤 섞기 답이 온다
    const { clock, cues, records, s } = setup();
    s.dispose();
    s.start(SCRAMBLE, 1);
    expect(s.phase).toBe("free");
    clock.advance(20_000);
    expect(cues).toEqual([]);
    expect(records).toEqual([]);
  });

  it("살펴보기 중에 정리하면 남은 알림·DNF가 나지 않는다", () => {
    const { clock, cues, records, s } = setup();
    s.start(SCRAMBLE);
    clock.advance(5_000);
    s.dispose();
    clock.advance(20_000);
    expect(cues).toEqual([]);
    expect(records).toEqual([]);
  });

  it("살펴보기를 끄면 섞은 뒤 첫 면 돌리기로 바로 시작", () => {
    const { clock, s, type } = setup({ inspection: false });
    s.start(SCRAMBLE);
    expect(s.phase).toBe("ready");
    clock.advance(60_000);
    type("y");
    expect(s.phase).toBe("ready");
    type("U");
    expect(s.phase).toBe("solving");
    expect(s.result).toBeNull();
  });

  it("되돌리기는 거꾸로 수를 한 수로 넣고, 되돌린 것을 다시 되돌리지는 않는다", () => {
    const { s, type } = setup({ inspection: false });
    type("R U");
    expect(s.moveCount).toBe(2);
    expect(s.undo()).toMatchObject({ axis: "y", turns: 3 });
    expect(s.undo()).toMatchObject({ axis: "x", turns: 3 });
    expect(s.undo()).toBeNull();
    expect(s.moveCount).toBe(4);
    expect(s.phase).toBe("free");
  });

  it("다시 보기 글은 맞추기 시작부터의 시각(살펴보기 중 큐브 돌리기는 음수)", () => {
    const { clock, records, s, type, solve } = setup();
    s.start(SCRAMBLE);
    type("y");
    clock.advance(2_000);
    type("y'");
    solve();
    expect(records[0]?.replay?.split(" ").slice(0, 2)).toEqual([
      "y@-2000",
      "y'@0",
    ]);
  });
});

describe("가상 블라인드", () => {
  it("외우기 동안 면 돌리기는 막고 큐브 돌리기만, 시작하면 모두 가리고, 맞추고 끝내면 시간", () => {
    const { clock, cues, records, s, type, solve } = setup({ mode: "blind" });
    s.start(SCRAMBLE, 7);
    expect(s.phase).toBe("memo");
    expect(s.mask).toBeNull();
    expect(s.input(parseMoves(3, "R")[0] as never, "R")).toBe("blocked");
    type("x");
    type("x'");
    clock.advance(20_000);
    expect(s.advance()).toBe("memoEnd");
    expect(s.phase).toBe("blindSolve");
    expect(s.mask?.every((v) => v === "hidden")).toBe(true);
    clock.advance(30_000);
    solve();
    // 맞아도 「끝」을 누를 때까지 멈추지 않는다(실물 블라인드처럼)
    expect(s.phase).toBe("blindSolve");
    clock.advance(1_000);
    expect(s.advance()).toBe("blindEnd");
    expect(s.mask).toBeNull();
    expect(s.result).toMatchObject({
      ms: 51_000,
      memoMs: 20_000,
      execMs: 31_000,
      moves: 4,
    });
    expect(cues.at(-1)).toBe("solved");
    expect(records[0]).toMatchObject({ mode: "blind", memoMs: 20_000 });
  });

  it("틀린 채로 끝내면 DNF", () => {
    const { s, type } = setup({ mode: "blind" });
    s.start(SCRAMBLE);
    s.advance();
    type("R");
    s.advance();
    expect(s.result).toMatchObject({ ms: null, dnfReason: "unsolved" });
  });
});
