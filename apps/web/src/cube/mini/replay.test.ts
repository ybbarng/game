import {
  applyMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { ReplayPlayer } from "../replay-player";
import { IdleShow, type IdleTiming } from "./idle";
import {
  IDLE_REPLAY_TIMING,
  idleReplaySteps,
  pickIdleReplay,
  replayMoveMs,
} from "./replay";
import type { MiniRecord } from "./store";

/** 떠 있을 때 내 판 다시 보기(docs/47 15-13): 고르기·걸음·쉬기 움직임과 이어 붙이기 */

/** Cubie가 남기는 꼴의 판: 섞기 "R U F"를 거꾸로 맞춘 기록 */
function solve(at: number, ms: number, replay?: string): MiniRecord {
  return {
    at,
    no: at,
    n: 3,
    mode: "solo",
    ms,
    penalty: 0,
    moves: 3,
    scramble: "R U F",
    seed: at,
    inspection: false,
    inputs: ["keyboard"],
    ...(replay === undefined
      ? {}
      : { replay, splits: `cross@${Math.round(ms / 2)}` }),
  };
}

/** 맞춘 시간 `ms`에 맞춘 다시 보기 글(멈춤이 1초 아래가 되게 수를 고르게 나눈다) */
function replayOf(ms: number): string {
  const moves = ["F'", "U'", "R'"];
  const count = Math.max(3, Math.ceil(ms / 900));
  return Array.from({ length: count }, (_, i) => {
    // 앞의 수는 F F' 짝으로 채우고 끝 세 수가 실제로 맞춘다
    const left = count - i;
    const m = left <= 3 ? moves[3 - left] : i % 2 === 0 ? "F" : "F'";
    return `${m}@${Math.round((ms * i) / (count - 1))}`;
  }).join(" ");
}

describe("pickIdleReplay", () => {
  const recent = solve(3, 30_000, replayOf(30_000));
  const fast = solve(2, 12_000, replayOf(12_000));
  const old = solve(1, 20_000); // 다시 보기 글이 없는 옛 판
  const records = [recent, fast, old];

  it("최고 기록 판과 최근 판을 번갈아 고른다", () => {
    expect(pickIdleReplay(records, [], 0)).toBe(fast);
    expect(pickIdleReplay(records, [], 1)).toBe(recent);
    expect(pickIdleReplay(records, [], 2)).toBe(fast);
  });

  it("최고 5판(목록에서 밀려난 판)도 최고 기록 후보다", () => {
    const kept = solve(0, 9_000, replayOf(9_000));
    expect(pickIdleReplay(records, [kept], 0)).toBe(kept);
  });

  it("다시 보기 글이 없거나 맞춘 과정이 상한보다 길면 고르지 않는다", () => {
    expect(pickIdleReplay([old], [], 0)).toBeNull();
    const long = solve(4, 70_000, replayOf(70_000));
    expect(pickIdleReplay([long, old], [], 1)).toBeNull();
    // 최근 판이 길면 최근 차례에도 다른 판
    expect(pickIdleReplay([long, fast], [], 1)).toBe(fast);
    expect(IDLE_REPLAY_TIMING.maxSolveMs).toBe(60_000);
  });
});

describe("idleReplaySteps", () => {
  it("맞춘 큐브에서 섞기를 빠르게 보인 뒤 맞춘 과정을 그때 시각대로, 끝나면 맞춘 큐브", () => {
    const r = solve(1, 2_000, "F'@0 U'@1200 R'@2000");
    const steps = idleReplaySteps(3, r);
    const { scrambleStepMs: s, gapMs: g } = IDLE_REPLAY_TIMING;
    expect(steps.map((x) => [x.part, x.at])).toEqual([
      ["scramble", 0],
      ["scramble", s],
      ["scramble", 2 * s],
      ["solve", 2 * s + g],
      // 1.2초 멈춤은 1초로 줄인다
      ["solve", 2 * s + g + 1000],
      ["solve", 2 * s + g + 1800],
    ]);
    let state = solvedCube(3);
    for (const x of steps) state = applyMoves(3, state, x.moves);
    expect(isSolved(3, state)).toBe(true);
  });
});

/**
 * 화면(`MiniCubeApp`)이 잇는 그대로: 쉬기 움직임의 `replay`가 `ReplayPlayer`로 장면(여기서는 상태 하나)에 수를 넣고,
 * `restore`가 장면을 엔진 상태로 다시 칠한다
 */
describe("떠 있을 때 다시 보기", () => {
  const T: IdleTiming = {
    firstMs: 1000,
    heroEveryMs: 10_000,
    jiggleEveryMs: 5000,
    jiggleStepMs: 100,
    jiggleMoves: 4,
  };

  function setup(records: MiniRecord[]) {
    const clock = new ManualClock();
    const log: string[] = [];
    // 사용자가 맞춰 둔 엔진 상태(맞춘 큐브를 x로 돌려 든 채)
    const engine = applyMoves(3, solvedCube(3), parseMoves(3, "x"));
    let scene: PuzzleState = engine;
    let turn = 0;
    const show = new IdleShow(
      clock,
      {
        solved: () => isSolved(3, engine),
        replay: (done) => {
          const r = pickIdleReplay(records, [], turn);
          if (!r) return null;
          turn++;
          log.push(`replay${r.at}`);
          scene = solvedCube(3);
          const p = new ReplayPlayer(clock, idleReplaySteps(3, r), {
            onStep: (s) => {
              scene = applyMoves(3, scene, s.moves);
            },
            onEnd: done,
          });
          p.play();
          return () => p.stop();
        },
        hero: () => {
          log.push("hero");
          return () => undefined;
        },
        jiggle: () => () => undefined,
        restore: () => {
          scene = engine;
          log.push("restore");
        },
      },
      T,
    );
    return { clock, log, show, scene: () => scene, engine };
  }

  it("재료가 있으면 홈 시연 대신 내 판을, 끝나면 맞춘 상태로 되돌리고 다음 간격에는 다른 판", () => {
    const recent = solve(2, 3_000, "F'@0 U'@1500 R'@3000");
    const fast = solve(1, 2_000, "F'@0 U'@1000 R'@2000");
    const { clock, log, show, scene, engine } = setup([recent, fast]);
    show.setActive(true);
    clock.advance(1000);
    expect(show.showing).toBe("replay");
    expect(log).toEqual(["replay1"]);
    // 섞기 세 수까지 보이면 섞인 상태
    clock.advance(2 * IDLE_REPLAY_TIMING.scrambleStepMs);
    expect(isSolved(3, scene())).toBe(false);
    // 섞기 + 쉼 + 맞춘 과정 2초 + 끝 멈춤
    clock.advance(IDLE_REPLAY_TIMING.gapMs + 2000 + 600);
    expect(show.showing).toBeNull();
    expect(log).toEqual(["replay1", "restore"]);
    expect(scene()).toBe(engine);
    clock.advance(T.heroEveryMs);
    expect(log.at(-1)).toBe("replay2");
  });

  it("다시 보는 중에 포커스를 받으면 바로 멈추고 장면을 엔진 상태로 돌려 놓는다", () => {
    const { clock, log, show, scene, engine } = setup([
      solve(1, 2_000, "F'@0 U'@1000 R'@2000"),
    ]);
    show.setActive(true);
    clock.advance(1000 + 2 * IDLE_REPLAY_TIMING.scrambleStepMs);
    expect(isSolved(3, scene())).toBe(false);
    show.setActive(false);
    expect(show.showing).toBeNull();
    expect(scene()).toBe(engine);
    // 멈춘 재생이 뒤늦게 수를 넣지 않는다
    clock.advance(60_000);
    expect(scene()).toBe(engine);
    expect(log).toEqual(["replay1", "restore"]);
  });

  it("재료가 없으면 지금처럼 홈 시연", () => {
    const { clock, log, show } = setup([solve(1, 2_000)]);
    show.setActive(true);
    clock.advance(1000);
    expect(show.showing).toBe("hero");
    expect(log).toEqual(["hero"]);
  });
});

describe("replayMoveMs", () => {
  const steps = [0, 500, 560, 590].map((at) => ({
    at,
    moves: [],
    part: "solve" as const,
  }));
  it("설정의 회전 시간으로, 다음 수가 더 빨리 오면 그 간격의 0.9배로(40ms 아래로는 줄이지 않는다)", () => {
    expect(replayMoveMs(steps, 0, 90)).toBe(90);
    expect(replayMoveMs(steps, 1, 90)).toBe(54);
    expect(replayMoveMs(steps, 2, 90)).toBe(40);
    expect(replayMoveMs(steps, 3, 90)).toBe(90);
  });
});
