import { type CubeMove, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import type { Cue } from "@/game/sound";

import { EMPTY_FLOW, type FlowStrip, pushFlow } from "./flow/strip";
import {
  type CubeSound,
  comboSound,
  comboStep,
  raceInspectSound,
  raceMilestoneSound,
  soloSound,
} from "./game-sounds";
import { SolveSession } from "./solve-session";

/** 소리를 내는 대신 센다(화면의 `playCubeSound` 자리에 갈아 끼운다) */
function recorder() {
  const played: CubeSound[] = [];
  return {
    played,
    play: (s: CubeSound | null) => {
      if (s) played.push(s);
    },
    count: (cue: Cue) => played.filter((s) => s.cue === cue).length,
  };
}

describe("혼자 맞추기 소리", () => {
  it("이정표를 지날 때 띵을 한 번, 맞추면 맞춤 소리", () => {
    const clock = new ManualClock();
    const r = recorder();
    const s = new SolveSession({
      n: 3,
      mode: "solo",
      inspection: false,
      clock,
      onCue: (c) => r.play(soloSound(c)),
    });
    s.start("U R");
    for (const m of parseMoves(3, "R'")) s.input(m, "R'");
    expect(r.count("cubeMilestone")).toBe(1);
    clock.advance(1_000);
    for (const m of parseMoves(3, "U'")) s.input(m, "U'");
    expect(r.count("cubeMilestone")).toBe(1);
    expect(r.count("cubeSolved")).toBe(1);
  });

  it("골드 칩은 띵 대신 반짝임, 개인 최고는 맞춤 대신 팡파르", () => {
    expect(soloSound("milestone", { gold: true })).toEqual({ cue: "cubeGold" });
    expect(soloSound("milestone")).toEqual({ cue: "cubeMilestone" });
    expect(soloSound("solved", { best: true })).toEqual({ cue: "cubeBest" });
    expect(soloSound("solved")).toEqual({ cue: "cubeSolved" });
  });

  it("살펴보기는 8초 한 번·12초 두 번·15초 다른 소리, 체력 경고는 전용 경고음", () => {
    expect(soloSound("inspect8")).toEqual({ cue: "cubeInspect" });
    expect(soloSound("inspect12")).toEqual({ cue: "cubeInspect", times: 2 });
    expect(soloSound("inspect15")).toEqual({ cue: "cubeInspectEnd" });
    expect(soloSound("low")).toEqual({ cue: "cubeLow" });
  });
});

describe("흐름 콤보 단계 소리", () => {
  const R = parseMoves(3, "R")[0] as CubeMove;
  const U = parseMoves(3, "U")[0] as CubeMove;
  const Y = parseMoves(3, "y")[0] as CubeMove;

  /** 수를 `gap` 간격으로 넣으며 소리를 센다 */
  function run(moves: readonly CubeMove[], gap: number) {
    const r = recorder();
    let strip: FlowStrip = EMPTY_FLOW;
    moves.forEach((m, i) => {
      const after = pushFlow(strip, 3, m, 0, i * gap);
      r.play(comboSound(comboStep(strip, after)));
      strip = after;
    });
    return r.played;
  }

  it("4·12·24·40수에서 한 번씩, 단계가 오른다(수마다 내지 않는다)", () => {
    const moves = Array.from({ length: 45 }, (_, i) => (i % 2 ? U : R));
    expect(run(moves, 200)).toEqual([
      { cue: "cubeCombo", step: 1 },
      { cue: "cubeCombo", step: 2 },
      { cue: "cubeCombo", step: 3 },
      { cue: "cubeCombo", step: 4 },
    ]);
  });

  it("끊기면 나지 않고, 큐브 돌리기로는 단계가 오르지 않는다", () => {
    expect(run([R, U, R, U, R, U], 1_200)).toEqual([]);
    expect(run([R, U, R, Y, Y], 200)).toEqual([]);
  });
});

describe("대결 소리", () => {
  it("내가 이정표를 지나면 띵, 상대만 지나면 없음", () => {
    const base = { me: "a", prevLeader: "a", leader: "a" };
    expect(raceMilestoneSound({ ...base, passed: ["a"] })).toEqual({
      cue: "cubeMilestone",
    });
    expect(raceMilestoneSound({ ...base, passed: ["b"] })).toBeNull();
  });

  it("1등이 바뀌면 짧은 소리 하나(처음 1등이 정해질 때는 빼고), 내가 다 맞춘 때는 맞춤 소리가 맡는다", () => {
    expect(
      raceMilestoneSound({
        passed: ["a", "b"],
        me: "a",
        prevLeader: "a",
        leader: "b",
      }),
    ).toEqual({ cue: "cubeLead" });
    expect(
      raceMilestoneSound({
        passed: ["b"],
        me: "a",
        prevLeader: undefined,
        leader: "b",
      }),
    ).toBeNull();
    expect(
      raceMilestoneSound({
        passed: ["a"],
        me: "a",
        prevLeader: "b",
        leader: "a",
        meDone: true,
      }),
    ).toBeNull();
  });

  it("살펴보기 8초·12초를 넘는 때 한 번씩", () => {
    const r = recorder();
    let prev = 0;
    for (let ms = 0; ms <= 15_000; ms += 250) {
      r.play(raceInspectSound(prev, ms));
      prev = ms;
    }
    expect(r.played).toEqual([
      { cue: "cubeInspect" },
      { cue: "cubeInspect", times: 2 },
    ]);
  });
});
