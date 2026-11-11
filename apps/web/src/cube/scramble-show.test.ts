import { formatMove } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import {
  movesShowMs,
  planMs,
  planScrambleShow,
  resolveScrambleShow,
  ScrambleShow,
  type ScrambleShowTarget,
  SPIN_MS,
} from "./scramble-show";

/** 장면 대신 부른 차례를 적는다 */
function recorder(n = 3) {
  const log: string[] = [];
  const target: ScrambleShowTarget = {
    solved: () => log.push("solved"),
    turn: (m, ms) => log.push(`${formatMove(n, m)}@${ms}`),
    spin: (ms) => log.push(`spin@${ms}`),
    paint: () => log.push("paint"),
    scrambled: () => log.push("scrambled"),
  };
  return { log, target };
}

describe("섞기 연출 고르기", () => {
  it("크기에 맞게: 5×5까지 하나씩 빠르게, 6×6·7×7은 짧은 연출", () => {
    for (const n of [2, 3, 4, 5])
      expect(resolveScrambleShow("auto", n, false)).toBe("moves");
    for (const n of [6, 7])
      expect(resolveScrambleShow("auto", n, false)).toBe("spin");
  });

  it("고른 값은 크기와 상관없이 그대로, 움직임 줄이기면 늘 바로", () => {
    expect(resolveScrambleShow("moves", 7, false)).toBe("moves");
    expect(resolveScrambleShow("spin", 2, false)).toBe("spin");
    expect(resolveScrambleShow("instant", 3, false)).toBe("instant");
    for (const s of ["auto", "moves", "spin"] as const)
      expect(resolveScrambleShow(s, 3, true)).toBe("instant");
  });

  it("하나씩 빠르게 시간: 3×3 20수 1초, 5×5 60수도 2초 안쪽, 더 길어도 2초", () => {
    expect(movesShowMs(20)).toBe(1000);
    expect(movesShowMs(11)).toBeLessThan(1000);
    expect(movesShowMs(60)).toBeLessThanOrEqual(2000);
    expect(movesShowMs(60)).toBeGreaterThan(movesShowMs(40));
    expect(movesShowMs(100)).toBe(2000);
    const plan = planScrambleShow("moves", 3, "R U R' U' F2 B D L' R2 U");
    expect(plan.kind).toBe("moves");
    expect(planMs(plan)).toBeCloseTo(movesShowMs(10), 6);
  });

  it("짧은 연출은 크기와 상관없이 0.5초, 읽을 수 없는 섞기는 바로", () => {
    expect(planScrambleShow("spin", 7, "R")).toEqual({
      kind: "spin",
      ms: SPIN_MS,
    });
    expect(SPIN_MS).toBe(500);
    expect(planScrambleShow("moves", 3, "").kind).toBe("instant");
    expect(planScrambleShow("moves", 3, "Q?").kind).toBe("instant");
  });
});

describe("섞기 연출 진행", () => {
  it("하나씩 빠르게: 맞춘 큐브에서 수마다 같은 간격으로 돌리고 끝나면 섞인 모양·onDone", () => {
    const clock = new ManualClock();
    const show = new ScrambleShow(clock);
    const { log, target } = recorder();
    let done = 0;
    show.play(
      { kind: "moves", moves: planMoves("R U F"), stepMs: 100 },
      target,
      () => done++,
    );
    expect(show.running).toBe(true);
    expect(log).toEqual(["solved", "R@100"]);
    clock.advance(99);
    expect(log).toEqual(["solved", "R@100"]);
    clock.advance(1);
    expect(log.at(-1)).toBe("U@100");
    clock.advance(100);
    expect(log.at(-1)).toBe("F@100");
    expect(done).toBe(0);
    clock.advance(100);
    expect(log.at(-1)).toBe("scrambled");
    expect(done).toBe(1);
    expect(show.running).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it("짧은 연출: 한 바퀴 돌리고 반 바퀴에 섞인 모양으로 칠하고, 다 돌면 끝", () => {
    const clock = new ManualClock();
    const show = new ScrambleShow(clock);
    const { log, target } = recorder();
    let done = 0;
    show.play({ kind: "spin", ms: 500 }, target, () => done++);
    expect(log).toEqual(["spin@500"]);
    clock.advance(250);
    expect(log).toEqual(["spin@500", "paint"]);
    expect(done).toBe(0);
    clock.advance(250);
    expect(log).toEqual(["spin@500", "paint", "scrambled"]);
    expect(done).toBe(1);
  });

  it("바로: 섞인 모양으로 칠하고 onDone을 바로 부른다", () => {
    const clock = new ManualClock();
    const show = new ScrambleShow(clock);
    const { log, target } = recorder();
    let done = 0;
    show.play({ kind: "instant" }, target, () => done++);
    expect(log).toEqual(["scrambled"]);
    expect(done).toBe(1);
    expect(show.running).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it("연출 중 키(finish): 바로 섞인 모양으로 두고 onDone, 남은 수는 돌리지 않는다", () => {
    const clock = new ManualClock();
    const show = new ScrambleShow(clock);
    const { log, target } = recorder();
    let done = 0;
    show.play(
      { kind: "moves", moves: planMoves("R U F"), stepMs: 100 },
      target,
      () => done++,
    );
    clock.advance(100);
    expect(show.finish()).toBe(true);
    expect(log).toEqual(["solved", "R@100", "U@100", "scrambled"]);
    expect(done).toBe(1);
    clock.advance(1_000);
    expect(log).toHaveLength(4);
    expect(done).toBe(1);
    // 끝난 뒤의 finish는 아무것도 하지 않는다
    expect(show.finish()).toBe(false);
    expect(done).toBe(1);
  });

  it("다시 섞기(cancel → play): 앞 연출은 onDone 없이 멈추고 새 연출만 끝을 알린다", () => {
    const clock = new ManualClock();
    const show = new ScrambleShow(clock);
    const first = recorder();
    const second = recorder();
    const done: string[] = [];
    show.play({ kind: "spin", ms: 500 }, first.target, () => done.push("a"));
    clock.advance(100);
    show.cancel();
    expect(first.log).toEqual(["spin@500", "scrambled"]);
    clock.advance(1_000);
    expect(done).toEqual([]);
    show.play({ kind: "spin", ms: 500 }, second.target, () => done.push("b"));
    // play가 돌던 연출을 바꿔도 앞 것은 끝을 알리지 않는다
    show.play({ kind: "spin", ms: 500 }, second.target, () => done.push("c"));
    clock.advance(500);
    expect(done).toEqual(["c"]);
    expect(first.log).toEqual(["spin@500", "scrambled"]);
  });

  it("drop: 장면을 건드리지 않고 멈춘다(맞춘 상태로·다시 보기)", () => {
    const clock = new ManualClock();
    let changes = 0;
    const show = new ScrambleShow(clock, () => changes++);
    const { log, target } = recorder();
    let done = 0;
    show.play({ kind: "spin", ms: 500 }, target, () => done++);
    expect(changes).toBe(1);
    show.drop();
    expect(changes).toBe(2);
    clock.advance(1_000);
    expect(log).toEqual(["spin@500"]);
    expect(done).toBe(0);
    expect(show.running).toBe(false);
  });
});

function planMoves(text: string) {
  const p = planScrambleShow("moves", 3, text);
  if (p.kind !== "moves") throw new Error("moves");
  return p.moves;
}
