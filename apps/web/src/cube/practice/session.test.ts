import { type CubeMove, isSolved, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { twoHandKeymap } from "../input/keymaps";
import { goalMet } from "../learn/judge";
import { drawRound } from "./deck";
import { pickAlg } from "./pick-alg";
import { PRACTICE_N } from "./problem";
import { ROUND_SIZE } from "./round";
import {
  PracticeSession,
  type PracticeSessionOptions,
  SOLVED_PAUSE_MS,
  WRONG_SHOW_MS,
} from "./session";
import { stageById } from "./stages";
import { loadPractice } from "./store";
import type { PracticeStage } from "./types";

const keymap = twoHandKeymap();
const mv = (t: string): CubeMove => parseMoves(PRACTICE_N, t)[0] as CubeMove;

function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

function setup(
  stageId: string,
  extra: Partial<PracticeSessionOptions> = {},
): {
  s: PracticeSession;
  clock: ManualClock;
  storage: ReturnType<typeof memory>;
  stage: PracticeStage;
  cues: string[];
  repaints: number[];
} {
  const stage = stageById(stageId) as PracticeStage;
  const clock = new ManualClock();
  const storage = memory();
  const cues: string[] = [];
  const repaints: number[] = [];
  const s = new PracticeSession({
    stage,
    mode: "follow",
    keymap,
    clock,
    seed: () => 7,
    storage,
    onCue: (c) => cues.push(c),
    onRepaint: () => repaints.push(clock.now()),
    ...extra,
  });
  return { s, clock, storage, stage, cues, repaints };
}

/** 지금 문제의 공식을 끝까지 친다(수마다 시계를 100ms 감는다) */
function typeAll(s: PracticeSession, clock: ManualClock): void {
  for (const t of s.tokens.slice(s.at)) {
    clock.advance(100);
    expect(s.input(mv(t))).toBe("applied");
  }
}

describe("공식 연습 진행기(Cubie 미니 모드가 쓴다)", () => {
  it("출제는 사이트와 같은 drawRound·pickAlg: 같은 씨앗이면 같은 10문제", () => {
    const { s, stage } = setup("2look-oll");
    const want = drawRound(
      stage.cases.map((c) => c.id),
      {
        seed: 7,
        algOf: (id) =>
          pickAlg(stage.cases.find((c) => c.id === id) as never, keymap).alg,
        book: {},
        auf: stage.auf,
      },
    );
    expect(s.round.problems).toEqual(want);
    expect(s.round.problems).toHaveLength(ROUND_SIZE);
  });

  it("따라 치기: 틀린 수는 큐브에 넣지 않고 그 낱말을 1.5초 알리며, 콤보가 깨진다", () => {
    const { s, clock, cues } = setup("beginner-second");
    const start = s.state;
    const expected = s.tokens[0] as string;
    const wrongMove = expected.startsWith("D") ? "B" : "D";
    expect(s.input(mv(wrongMove))).toBe("rejected");
    expect(s.state).toBe(start);
    expect(s.wrong).toEqual({ index: 0, token: expected });
    expect(cues).toEqual(["invalid"]);
    clock.advance(WRONG_SHOW_MS - 1);
    expect(s.wrong).not.toBeNull();
    clock.advance(1);
    expect(s.wrong).toBeNull();
    // 끝까지 치면 다 맞춰지고 잠깐 멈춘 뒤 다음 문제
    typeAll(s, clock);
    expect(s.phase).toBe("pause");
    expect(isSolved(PRACTICE_N, s.state as never)).toBe(true);
    expect(cues).toEqual(["invalid", "solved"]);
    expect(s.round.combo.current).toBe(0);
    expect(s.input(mv("U"))).toBe("ignored");
    clock.advance(SOLVED_PAUSE_MS);
    expect(s.phase).toBe("play");
    expect(s.round.index).toBe(1);
    expect(s.at).toBe(0);
  });

  it("문제마다 연습 기록(틀림 포함)을 넣어 받은 저장소에 남긴다", () => {
    const { s, clock, storage } = setup("beginner-second");
    const id = s.round.current?.caseId as string;
    s.input(mv(s.tokens[0]?.startsWith("D") ? "B" : "D"));
    typeAll(s, clock);
    const rec = loadPractice(storage);
    expect(rec.follow[id]).toMatchObject({ solves: 1, fails: 1 });
    expect(rec.last).toBe("beginner-second");
  });

  it("10문제를 끊김 없이 치면 판 끝 결과가 나오고, 한 판 더는 새 판", () => {
    const { s, clock, storage, repaints } = setup("beginner-yellow-cross");
    for (let k = 0; k < ROUND_SIZE; k++) {
      expect(s.round.index).toBe(k);
      typeAll(s, clock);
      clock.advance(SOLVED_PAUSE_MS);
    }
    expect(s.phase).toBe("over");
    expect(s.summary).toMatchObject({ accuracy: 1, bestCombo: ROUND_SIZE });
    expect(s.summary?.slow.length).toBeGreaterThan(0);
    // 문제마다 장면을 통째 다시 칠했다(첫 문제 + 다음 아홉)
    expect(repaints).toHaveLength(ROUND_SIZE);
    expect(loadPractice(storage).rounds["beginner-yellow-cross"]).toEqual({
      follow: 1,
      see: 0,
    });
    s.newRound();
    expect(s.phase).toBe("play");
    expect(s.round.index).toBe(0);
    expect(s.summary).toBeNull();
  });

  it("보고 치기: 공식은 펼쳐야 보이고, 되돌리기를 받고, 목표 모양이면 맞춤(펼친 문제는 콤보에서 빠진다)", () => {
    const { s, clock } = setup("beginner-second", { mode: "see" });
    const before = s.state;
    expect(s.input(mv("U"))).toBe("applied");
    expect(s.undo()).toEqual(mv("U'"));
    expect(s.state).toEqual(before);
    expect(s.peek()).toBe(true);
    expect(s.peek()).toBe(false);
    for (const t of s.tokens) {
      clock.advance(100);
      s.input(mv(t));
    }
    expect(goalMet(PRACTICE_N, s.state as never, s.board?.goal as never)).toBe(
      true,
    );
    expect(s.phase).toBe("pause");
    expect(s.round.combo.current).toBe(0);
  });

  it("끝낸 진행기는 걸어 둔 시계를 풀고 수를 받지 않는다", () => {
    const { s, clock } = setup("beginner-second");
    typeAll(s, clock);
    s.dispose();
    clock.advance(SOLVED_PAUSE_MS);
    expect(s.phase).toBe("pause");
    expect(s.input(mv("U"))).toBe("ignored");
  });
});
