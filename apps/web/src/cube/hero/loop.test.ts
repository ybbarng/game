import { isSolved } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import {
  HeroLoop,
  heroTiming,
  randomScramble,
  SCRAMBLING_LABEL,
  scrambleSteps,
  solveSteps,
} from "./loop";
import {
  HERO_ALTERNATE,
  type HeroSize,
  type HeroSolve,
  heroRotation,
  solveForHero,
} from "./methods";

const T3 = heroTiming(3);

/** 정해진 차례로 수를 내는 rng(시험을 결정적으로) */
function seq(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

/** 이미 끝난 약속의 뒤 처리를 마저 돌린다(시간을 기다리는 것이 아니다) */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("randomScramble", () => {
  it("같은 면을 잇달아 돌리지 않고, 같은 축을 셋 잇달아 돌리지 않는다", () => {
    const rng = seq(7);
    const axis = (f: string) => "UDRLFB".indexOf(f) >> 1;
    for (let t = 0; t < 30; t++) {
      const s = randomScramble(rng);
      expect(s).toHaveLength(20);
      const faces = s.map((m) => m[0] as string);
      for (let i = 1; i < faces.length; i++) {
        const a = faces[i] as string;
        expect(a).not.toBe(faces[i - 1]);
        if (i >= 2)
          expect(
            axis(a) === axis(faces[i - 1] as string) &&
              axis(a) === axis(faces[i - 2] as string),
          ).toBe(false);
      }
      for (const m of s) expect(m).toMatch(/^[UDRLFB]['2]?$/);
    }
  });

  it("4×4 이상은 바깥 두 층도 섞는다", () => {
    const s = randomScramble(seq(3), 40, 4);
    expect(s.some((m) => m.includes("w"))).toBe(true);
    for (const m of s) expect(m).toMatch(/^[UDRLFB]w?['2]?$/);
  });
});

describe("차례 만들기", () => {
  it("섞기는 「섞는 중」 수들 뒤에 해법 이름으로 멈춘다", () => {
    const steps = scrambleSteps(["R", "U'"], "프리드리히", T3);
    expect(steps.map((s) => s.label)).toEqual([
      SCRAMBLING_LABEL,
      SCRAMBLING_LABEL,
      "프리드리히",
    ]);
    expect(steps[2]).toMatchObject({ kind: "wait" });
  });

  it("풀이는 단계마다 꼬리표를 바꾸고, 수 없는 단계는 건너뛰고, 단계 사이·살피는 자리에서 멈춘다", () => {
    const solve: HeroSolve = {
      moves: ["F", "R", "U", "R'", "U'"],
      stages: [
        { label: "십자", start: 0, end: 2 },
        { label: "첫 층 꼭짓점", start: 2, end: 2 },
        { label: "둘째 층 모서리", start: 2, end: 5 },
      ],
      looks: [4],
    };
    const steps = solveSteps(solve, "초보자 해법", T3);
    expect(
      steps.map((s) => (s.kind === "move" ? s.move : `(${s.label})`)),
    ).toEqual([
      "F",
      "R",
      "(초보자 해법 · 둘째 층 모서리)",
      "U",
      "R'",
      "(초보자 해법 · 둘째 층 모서리)",
      "U'",
      "(초보자 해법 · 맞춤)",
    ]);
    expect(steps[0]?.label).toBe("초보자 해법 · 십자");
    // 꼬리표는 마침표 없이
    for (const s of steps) expect(s.label.endsWith(".")).toBe(false);
  });
});

/** 연출을 시계로 돌려 수와 꼬리표를 모은다 */
function harness(
  solve: (m: string, s: PuzzleState) => Promise<HeroSolve>,
  n: HeroSize = 3,
  choice: string = HERO_ALTERNATE,
) {
  const clock = new ManualClock();
  const moves: string[] = [];
  const labels: string[] = [];
  const resets: PuzzleState[] = [];
  let last: Promise<unknown> = Promise.resolve();
  const loop = new HeroLoop({
    n,
    methods: heroRotation(n, choice),
    clock,
    rng: seq(42),
    solve: (m, s) => {
      const p = solve(m, s);
      last = p.catch(() => undefined);
      return p;
    },
    onMove: (m) => moves.push(m),
    onLabel: (l) => labels.push(l),
    onReset: (s) => resets.push(s),
  });
  /** 이 판의 풀이가 오고 연출이 받아 둘 때까지 */
  const settled = async () => {
    await last;
    await flush();
  };
  return { clock, loop, moves, labels, resets, settled };
}

describe("HeroLoop", () => {
  it("섞기 → 멈춤 → 초보자 해법으로 맞춤 → 멈춤 → 프리드리히 차례로 되풀이한다", async () => {
    const h = harness(solveForHero);
    h.loop.start();
    expect(h.labels).toEqual([SCRAMBLING_LABEL]);
    expect(h.moves).toHaveLength(1);
    h.clock.advance(T3.scrambleMove * 19);
    expect(h.moves).toHaveLength(20);
    expect(isSolved(3, h.loop.current)).toBe(false);
    h.clock.advance(T3.scrambleMove);
    expect(h.loop.currentLabel).toBe("초보자 해법");
    await h.settled();
    // 풀이가 와 있어도 섞은 뒤 멈춤은 지킨다
    const before = h.moves.length;
    h.clock.advance(T3.afterScramble - 1);
    expect(h.moves).toHaveLength(before);
    h.clock.advance(1);
    expect(h.loop.currentLabel).toBe("초보자 해법 · 십자");

    while (!h.loop.currentLabel.endsWith("맞춤")) h.clock.advance(50);
    expect(isSolved(3, h.loop.current)).toBe(true);
    expect(h.labels).toContain("초보자 해법 · 둘째 층 모서리");

    h.clock.advance(T3.solved);
    expect(h.loop.currentLabel).toBe(SCRAMBLING_LABEL);
    expect(h.loop.currentMethod).toBe("3-cfop");
    h.clock.advance(T3.scrambleMove * 20);
    await h.settled();
    h.clock.advance(T3.afterScramble);
    expect(h.loop.currentLabel).toBe("프리드리히 · 십자");
    while (!h.loop.currentLabel.endsWith("맞춤")) h.clock.advance(50);
    expect(isSolved(3, h.loop.current)).toBe(true);
    expect(h.labels.some((l) => l.startsWith("프리드리히 · F2L"))).toBe(true);
    expect(h.resets).toHaveLength(0);
  });

  it("해법 하나를 고르면 그것만 되풀이하고, 2×2도 그 해법 이름·단계로 맞춘다", async () => {
    const h = harness(solveForHero, 2, "2-algs");
    const t = heroTiming(2);
    h.loop.start();
    h.clock.advance(t.scrambleMove * t.scrambleLength);
    expect(h.loop.currentLabel).toBe("공식 해법");
    await h.settled();
    h.clock.advance(t.afterScramble);
    expect(h.loop.currentLabel).toBe("공식 해법 · 첫 층");
    while (!h.loop.currentLabel.endsWith("맞춤")) h.clock.advance(50);
    expect(isSolved(2, h.loop.current)).toBe(true);
    h.clock.advance(t.solved);
    expect(h.loop.currentMethod).toBe("2-algs");
  });

  it("풀이가 늦으면 섞은 뒤 기다렸다가 오면 이어 간다", async () => {
    let resolve: ((s: HeroSolve) => void) | null = null;
    const h = harness(
      () =>
        new Promise<HeroSolve>((r) => {
          resolve = r;
        }),
    );
    h.loop.start();
    h.clock.advance(T3.scrambleMove * 20 + T3.afterScramble);
    h.clock.advance(5000);
    expect(h.moves).toHaveLength(20);
    expect(h.loop.currentLabel).toBe("초보자 해법");
    (resolve as unknown as (s: HeroSolve) => void)({
      moves: ["R"],
      stages: [{ label: "십자", start: 0, end: 1 }],
      looks: [],
    });
    await h.settled();
    expect(h.moves).toHaveLength(21);
    expect(h.loop.currentLabel).toBe("초보자 해법 · 십자");
  });

  it("멈추면 시간이 흘러도 수를 두지 않고, 이으면 그 자리에서 간다", () => {
    const h = harness(solveForHero);
    h.loop.start();
    h.clock.advance(T3.scrambleMove * 4);
    expect(h.moves).toHaveLength(5);
    h.loop.pause();
    h.clock.advance(10_000);
    expect(h.moves).toHaveLength(5);
    expect(h.clock.pending()).toBe(0);
    h.loop.resume();
    expect(h.moves).toHaveLength(5);
    h.clock.advance(T3.scrambleMove);
    expect(h.moves).toHaveLength(6);
    h.loop.stop();
    h.loop.resume();
    h.clock.advance(10_000);
    expect(h.moves).toHaveLength(6);
  });

  it("풀이를 못 만들면(축소법이 막힘 등) 그 판을 건너뛰고 맞춘 큐브에서 다음 해법으로 다시 섞는다", async () => {
    const h = harness(() => Promise.reject(new Error("막힘")));
    h.loop.start();
    h.clock.advance(T3.scrambleMove * 20);
    await h.settled();
    h.clock.advance(T3.afterScramble);
    expect(h.resets).toHaveLength(1);
    expect(isSolved(3, h.resets[0] as PuzzleState)).toBe(true);
    expect(h.loop.currentMethod).toBe("3-cfop");
    expect(h.loop.currentLabel).toBe(SCRAMBLING_LABEL);
  });
});

describe("해법 표", () => {
  it("크기마다 해법이 둘 이상 있고, id가 겹치지 않고, 고른 해법이 다른 크기면 「번갈아」로", () => {
    const ids = new Set<string>();
    for (const n of [2, 3, 4, 5] as const) {
      const all = heroRotation(n, HERO_ALTERNATE);
      expect(all.length).toBeGreaterThanOrEqual(2);
      for (const m of all) {
        expect(m.size).toBe(n);
        expect(ids.has(m.id)).toBe(false);
        ids.add(m.id);
      }
    }
    expect(heroRotation(3, "3-cfop").map((m) => m.id)).toEqual(["3-cfop"]);
    expect(heroRotation(4, "3-cfop").map((m) => m.id)).toEqual([
      "4-beginner",
      "4-cfop",
    ]);
  });

  it("표에 없는 해법은 거부한다", async () => {
    await expect(
      solveForHero("없음", (await import("@game/cube-engine")).solvedCube(3)),
    ).rejects.toThrow();
  });
});
