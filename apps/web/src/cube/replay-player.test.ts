import {
  applyMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { ReplayPlayer, replayLength, solveSteps } from "./replay-player";

/** 기록 다시 보기(docs/47 15-13): 다시 보기 글 → 걸음, 시계에 맞춘 재생 */

describe("solveSteps", () => {
  it("첫 수가 0ms, 수 사이 멈춤은 1초까지 줄이고, 읽지 못하는 수는 건너뛴다", () => {
    const steps = solveSteps(3, "R@500 U@800 Q@900 R'@5000 U'@5100");
    expect(steps.map((s) => s.at)).toEqual([0, 300, 1400, 1500]);
    expect(steps.every((s) => s.part === "solve")).toBe(true);
    expect(replayLength("R@500 U@800 Q@900 R'@5000 U'@5100")).toBe(1500);
    expect(solveSteps(3, undefined)).toEqual([]);
    expect(replayLength(undefined)).toBe(0);
  });

  it("섞인 상태에서 걸음을 모두 두면 맞춘 큐브가 된다", () => {
    const scramble = "R U R' F2";
    let state = applyMoves(3, solvedCube(3), parseMoves(3, scramble));
    for (const s of solveSteps(3, "F2@0 R@400 U'@700 R'@900"))
      state = applyMoves(3, state, s.moves);
    expect(isSolved(3, state)).toBe(true);
  });
});

describe("ReplayPlayer", () => {
  function setup() {
    const clock = new ManualClock();
    const log: string[] = [];
    const steps = solveSteps(3, "R@0 U@1000 F@1500");
    const p = new ReplayPlayer(clock, steps, {
      onStep: (_s, i) => log.push(`step${i}`),
      onEnd: () => log.push("end"),
      onReset: () => log.push("reset"),
    });
    return { clock, log, p };
  }

  it("걸음을 그때 시각대로 내보내고 끝 멈춤 뒤 끝난다", () => {
    const { clock, log, p } = setup();
    p.play();
    clock.advance(0);
    expect(log).toEqual(["step0"]);
    clock.advance(999);
    expect(p.played).toBe(1);
    clock.advance(1);
    expect(p.played).toBe(2);
    clock.advance(500);
    expect(log).toEqual(["step0", "step1", "step2"]);
    expect(p.status).toBe("playing");
    clock.advance(600);
    expect(log.at(-1)).toBe("end");
    expect(p.status).toBe("done");
  });

  it("멈추면 그 자리에 서고, 이어 보면 남은 시간만큼 뒤에 다음 걸음", () => {
    const { clock, log, p } = setup();
    p.play();
    clock.advance(400);
    p.pause();
    expect(p.status).toBe("paused");
    clock.advance(60_000);
    expect(log).toEqual(["step0"]);
    p.toggle();
    clock.advance(599);
    expect(p.played).toBe(1);
    clock.advance(1);
    expect(p.played).toBe(2);
  });

  it("처음부터: 그림을 되돌리고 첫 걸음부터. 끝난 뒤 이어 보기도 처음부터", () => {
    const { clock, log, p } = setup();
    p.play();
    clock.advance(1200);
    p.restart();
    clock.advance(0);
    expect(log).toEqual(["step0", "step1", "reset", "step0"]);
    clock.advance(10_000);
    expect(p.status).toBe("done");
    log.length = 0;
    p.play();
    clock.advance(0);
    expect(log).toEqual(["reset", "step0"]);
  });

  it("버리면 더 내보내지 않는다", () => {
    const { clock, log, p } = setup();
    p.play();
    clock.advance(0);
    p.stop();
    clock.advance(60_000);
    expect(log).toEqual(["step0"]);
  });
});
