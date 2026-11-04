import {
  applyMoves,
  type CubeMove,
  faceColors,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import {
  HeroLoop,
  heroTiming,
  ORIENT_LABEL,
  orientForSolve,
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
  /** 겹치는 층(같은 축, 층 범위가 겹침)을 잇달아 두지 않고, 같은 축 셋을 잇달아 두지 않는다 */
  function checkRules(n: number, s: readonly string[]) {
    const ms = s.map((t) => parseMoves(n, t)[0] as CubeMove);
    for (let i = 1; i < ms.length; i++) {
      const a = ms[i] as CubeMove;
      const b = ms[i - 1] as CubeMove;
      expect(
        a.axis === b.axis && a.from <= b.to && b.from <= a.to,
        s.join(" "),
      ).toBe(false);
      if (i >= 2)
        expect(a.axis === b.axis && a.axis === ms[i - 2]?.axis).toBe(false);
    }
  }
  const isRotation = (t: string) => /^[xyz]/.test(t);

  it("3×3: 면 돌리기에 큐브 돌리기(x y z)와 가운데 층(M E S)이 적어도 하나씩 섞인다", () => {
    const rng = seq(7);
    for (let t = 0; t < 30; t++) {
      const s = randomScramble(rng);
      expect(s).toHaveLength(20);
      checkRules(3, s);
      for (const m of s) expect(m).toMatch(/^[UDRLFBMESxyz]['2]?$/);
      expect(s.some(isRotation)).toBe(true);
      expect(s.some((m) => /^[MES]/.test(m))).toBe(true);
      // 큐브 돌리기를 잇달아 두지 않는다
      for (let i = 1; i < s.length; i++)
        expect(
          isRotation(s[i] as string) && isRotation(s[i - 1] as string),
        ).toBe(false);
    }
  });

  it("4×4는 바깥 두 층(Rw)·안쪽 한 층(2R)·큐브 돌리기를 섞고, 정가운데 층(M)은 없다", () => {
    const rng = seq(3);
    for (let t = 0; t < 10; t++) {
      const s = randomScramble(rng, 30, 4);
      checkRules(4, s);
      for (const m of s)
        expect(m).toMatch(/^(2?[UDRLFB]|[UDRLFB]w|[xyz])['2]?$/);
      expect(s.some(isRotation)).toBe(true);
      expect(s.some((m) => /^2/.test(m))).toBe(true);
    }
    expect(randomScramble(seq(3), 60, 4).some((m) => m.includes("w"))).toBe(
      true,
    );
  });

  it("5×5는 정가운데 층(M E S)과 둘째 층(2R)을 함께 쓰고, 2×2는 큐브 돌리기만 더한다", () => {
    const five = randomScramble(seq(5), 80, 5);
    checkRules(5, five);
    expect(five.some((m) => /^[MES]/.test(m))).toBe(true);
    expect(five.some((m) => /^2[UDRLFB]/.test(m))).toBe(true);
    for (let t = 0; t < 10; t++) {
      const two = randomScramble(seq(t + 1), 11, 2);
      checkRules(2, two);
      for (const m of two) expect(m).toMatch(/^[UDRLFBxyz]['2]?$/);
      expect(two.some(isRotation)).toBe(true);
    }
  });
});

describe("orientForSolve", () => {
  const centersHome = (n: number, s: PuzzleState) => {
    const c = (n - 1) / 2;
    const colors = faceColors(n, s);
    return [0, 1, 2, 3, 4, 5].every((f) => colors[f * n * n + c * n + c] === f);
  };
  it("홀수 크기는 섞기 뒤 센터 블럭이 제자리(흰 위·초록 앞)로 오게 돌리고, 짝수 크기는 돌리지 않는다", () => {
    let turned = 0;
    for (const n of [3, 5] as const)
      for (let seed = 1; seed <= 20; seed++) {
        const s = play(n, solvedCube(n), randomScramble(seq(seed), 20, n));
        const o = orientForSolve(n, s);
        expect(o.length).toBeLessThanOrEqual(2);
        for (const t of o) expect(t).toMatch(/^[xyz]['2]?$/);
        if (o.length) turned++;
        expect(centersHome(n, play(n, s, o))).toBe(true);
      }
    expect(turned).toBeGreaterThan(0);
    expect(orientForSolve(3, solvedCube(3))).toEqual([]);
    expect(orientForSolve(4, play(4, solvedCube(4), ["x", "y"]))).toEqual([]);
  });
});

const play = (n: number, s: PuzzleState, moves: readonly string[]) =>
  moves.length ? applyMoves(n, s, parseMoves(n, moves.join(" "))) : s;

/** 연출이 3×3 해법에 넘기는 상태(섞은 뒤 방향 맞추기까지) */
const stateForSolve = (s: PuzzleState) => play(3, s, orientForSolve(3, s));

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
        { label: "첫 층 코너", start: 2, end: 2 },
        { label: "둘째 층 엣지", start: 2, end: 5 },
      ],
      looks: [4],
    };
    const steps = solveSteps(solve, "초보자 해법", T3);
    expect(
      steps.map((s) => (s.kind === "move" ? s.move : `(${s.label})`)),
    ).toEqual([
      "F",
      "R",
      "(초보자 해법 · 둘째 층 엣지)",
      "U",
      "R'",
      "(초보자 해법 · 둘째 층 엣지)",
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
  seed = 42,
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
    rng: seq(seed),
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
  /** 조건이 맞을 때까지 시계를 조금씩 감는다(상한은 멈춘 시험을 잡는 안전장치) */
  const advanceUntil = (cond: () => boolean, step = 10) => {
    for (let t = 0; !cond(); t += step) {
      if (t > 600_000) throw new Error("조건이 맞지 않는다");
      clock.advance(step);
    }
  };
  return { clock, loop, moves, labels, resets, settled, advanceUntil };
}

describe("HeroLoop", () => {
  it("섞기 → 멈춤 → 초보자 해법으로 맞춤 → 멈춤 → 프리드리히 차례로 되풀이한다", async () => {
    const h = harness(solveForHero);
    h.loop.start();
    expect(h.labels).toEqual([SCRAMBLING_LABEL]);
    expect(h.moves).toHaveLength(1);
    h.advanceUntil(() => h.loop.currentLabel !== SCRAMBLING_LABEL);
    expect(h.moves).toHaveLength(20);
    expect(isSolved(3, h.loop.current)).toBe(false);
    expect(h.loop.currentLabel).toBe("초보자 해법");
    await h.settled();
    // 풀이가 와 있어도 섞은 뒤 멈춤은 지킨다(섞기 끝에서 이미 몇 ms 감았을 수 있어 한 걸음 앞에서 본다)
    const before = h.moves.length;
    h.clock.advance(T3.afterScramble - 10);
    expect(h.moves).toHaveLength(before);
    h.advanceUntil(() => h.loop.currentLabel !== "초보자 해법", 1);
    expect(["초보자 해법 · 십자", `초보자 해법 · ${ORIENT_LABEL}`]).toContain(
      h.loop.currentLabel,
    );

    h.advanceUntil(() => h.loop.currentLabel.endsWith("맞춤"));
    expect(isSolved(3, h.loop.current)).toBe(true);
    expect(h.labels).toContain("초보자 해법 · 둘째 층 엣지");

    h.clock.advance(T3.solved);
    expect(h.loop.currentLabel).toBe(SCRAMBLING_LABEL);
    expect(h.loop.currentMethod).toBe("3-cfop");
    h.advanceUntil(() => h.loop.currentLabel === "프리드리히");
    await h.settled();
    h.advanceUntil(() => h.loop.currentLabel.includes("·"));
    h.advanceUntil(() => !h.loop.currentLabel.endsWith(ORIENT_LABEL));
    expect(h.loop.currentLabel).toBe("프리드리히 · 십자");
    h.advanceUntil(() => h.loop.currentLabel.endsWith("맞춤"));
    expect(isSolved(3, h.loop.current)).toBe(true);
    expect(h.labels.some((l) => l.startsWith("프리드리히 · F2L"))).toBe(true);
    expect(h.resets).toHaveLength(0);
  });

  it("해법 하나를 고르면 그것만 되풀이하고, 2×2도 그 해법 이름·단계로 맞춘다", async () => {
    const h = harness(solveForHero, 2, "2-algs");
    const t = heroTiming(2);
    h.loop.start();
    h.advanceUntil(() => h.loop.currentLabel === "공식 해법");
    await h.settled();
    h.advanceUntil(() => h.loop.currentLabel !== "공식 해법");
    // 2×2는 센터 블럭이 없어 방향 맞추기 없이 바로 첫 단계
    expect(h.loop.currentLabel).toBe("공식 해법 · 첫 층");
    h.advanceUntil(() => h.loop.currentLabel.endsWith("맞춤"));
    expect(isSolved(2, h.loop.current)).toBe(true);
    h.clock.advance(t.solved);
    expect(h.loop.currentMethod).toBe("2-algs");
  });

  // 섞기에 큐브 돌리기·가운데 층이 섞여도 해법마다 섞기 → (방향 맞추기) → 단계 차례 → 맞춤까지 간다.
  // 섞는 rng를 판마다 달리해 방향 맞추기가 있는 판과 없는 판을 함께 본다
  it.each([
    ["3-beginner", "십자", [1, 2, 3]],
    ["3-cfop", "십자", [1, 2, 3]],
    ["3-roux", "첫 블록", [1, 2]],
    ["3-zz", "EO라인", [1, 2]],
    ["2-beginner", "첫 층", [1, 2]],
    ["4-cfop", "흰·노랑 센터", [1]],
  ] as const)(
    "%s: 돌리기·가운데 층이 섞인 섞기 뒤에도 단계 차례대로 맞춘다",
    async (id, first, seeds) => {
      let oriented = 0;
      for (const seed of seeds) {
        const n = Number(id[0]) as HeroSize;
        const h = harness(solveForHero, n, id, seed);
        const label = heroRotation(n, id)[0]?.label as string;
        h.loop.start();
        h.advanceUntil(() => h.loop.currentLabel === label);
        const scramble = [...h.moves];
        expect(scramble.some((m) => /^[xyz]/.test(m))).toBe(true);
        if (n >= 3)
          expect(scramble.some((m) => /^([MES]|2[UDRLFB])/.test(m))).toBe(true);
        const want = orientForSolve(n, h.loop.current);
        await h.settled();
        h.advanceUntil(() => h.loop.currentLabel !== label);
        if (want.length) {
          // 방향 맞추기를 먼저 보이고, 끝나면 센터가 제자리(흰 위·초록 앞)에서 첫 단계가 시작한다
          expect(h.loop.currentLabel).toBe(`${label} · ${ORIENT_LABEL}`);
          h.advanceUntil(
            () => h.moves.length === scramble.length + want.length,
            1,
          );
          expect(orientForSolve(n, h.loop.current)).toEqual([]);
          h.advanceUntil(() => !h.loop.currentLabel.endsWith(ORIENT_LABEL));
          expect(
            h.moves.slice(scramble.length, scramble.length + want.length),
          ).toEqual(want);
        }
        expect(h.loop.currentLabel).toBe(`${label} · ${first}`);
        const stages = new Set<string>();
        h.advanceUntil(() => {
          stages.add(h.loop.currentLabel);
          return h.loop.currentLabel.endsWith("맞춤");
        });
        expect(isSolved(n, h.loop.current)).toBe(true);
        // 단계가 셋 이상 차례로 지나간다(꼬리표가 바뀐다)
        expect(stages.size).toBeGreaterThan(3);
        expect(h.resets).toHaveLength(0);
        if (want.length) oriented++;
      }
      // 홀수 크기는 고른 씨앗 가운데 방향 맞추기가 든 판이 있다(그 길도 본다)
      if (Number(id[0]) % 2 === 1) expect(oriented).toBeGreaterThan(0);
    },
  );

  it("풀이가 늦으면 섞은 뒤 기다렸다가 오면 이어 간다", async () => {
    let resolve: ((s: HeroSolve) => void) | null = null;
    const h = harness(
      () =>
        new Promise<HeroSolve>((r) => {
          resolve = r;
        }),
    );
    h.loop.start();
    // 섞기(큐브 돌리기는 조금 느리다)와 섞은 뒤 멈춤을 넉넉히 넘긴다
    h.clock.advance(T3.scrambleMove * 20 * 2 + T3.afterScramble);
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
    expect(["초보자 해법 · 십자", `초보자 해법 · ${ORIENT_LABEL}`]).toContain(
      h.loop.currentLabel,
    );
  });

  /** 답하지 않는 풀이(멈춘 워커처럼). 나중에 답하게 할 수 있다 */
  function silentSolve() {
    const answers: ((s: HeroSolve) => void)[] = [];
    const solve = () =>
      new Promise<HeroSolve>((r) => {
        answers.push(r);
      });
    return { solve, answers };
  }

  /** 섞기와 섞은 뒤 멈춤을 다 두고 풀이를 기다리기 시작한 순간까지 */
  function untilWaiting(h: ReturnType<typeof harness>) {
    h.advanceUntil(() => h.loop.currentLabel === "초보자 해법", 1);
    h.clock.advance(T3.afterScramble);
  }

  it("풀이가 상한 안에 안 오면 해법 이름만 띄운 채 멈춰 있지 않고, 맞춘 큐브에서 다음 해법으로 다시 섞는다", async () => {
    const s = silentSolve();
    const h = harness(s.solve);
    h.loop.start();
    untilWaiting(h);
    const moves = h.moves.length;
    h.clock.advance(T3.solveWait - 1);
    expect(h.loop.currentLabel).toBe("초보자 해법");
    expect(h.moves).toHaveLength(moves);
    expect(h.resets).toHaveLength(0);
    h.clock.advance(1);
    expect(h.resets).toHaveLength(1);
    expect(isSolved(3, h.resets[0] as PuzzleState)).toBe(true);
    expect(h.loop.currentMethod).toBe("3-cfop");
    expect(h.loop.currentLabel).toBe(SCRAMBLING_LABEL);
    // 늦게 온 앞 판의 답은 버린다(지금 판의 섞기를 그대로 이어 간다)
    s.answers[0]?.({
      moves: ["R"],
      stages: [{ label: "십자", start: 0, end: 1 }],
      looks: [],
    });
    await flush();
    expect(h.loop.currentLabel).toBe(SCRAMBLING_LABEL);
    expect(h.loop.currentMethod).toBe("3-cfop");
    h.clock.advance(T3.scrambleMove * 2);
    expect(h.loop.currentLabel).toBe(SCRAMBLING_LABEL);
  });

  it("멈춘 동안(안 보임·탭 숨김)은 풀이 기다림을 재지 않고, 이으면 처음부터 다시 잰다", () => {
    const s = silentSolve();
    const h = harness(s.solve);
    h.loop.start();
    untilWaiting(h);
    h.clock.advance(T3.solveWait - 100);
    h.loop.pause();
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(T3.solveWait * 10);
    expect(h.resets).toHaveLength(0);
    h.loop.resume();
    expect(h.loop.currentLabel).toBe("초보자 해법");
    h.clock.advance(T3.solveWait - 1);
    expect(h.resets).toHaveLength(0);
    h.clock.advance(1);
    expect(h.resets).toHaveLength(1);
  });

  it("풀이가 상한 앞에 오면 상한은 꺼지고 그대로 맞춘다", async () => {
    const s = silentSolve();
    const h = harness((m, st) => {
      const p = s.solve();
      // 첫 판만 늦게 답한다(상한 바로 앞에)
      if (s.answers.length > 1) return solveForHero(m, st);
      return p;
    });
    h.loop.start();
    untilWaiting(h);
    const state = h.loop.current;
    h.clock.advance(T3.solveWait - 1);
    s.answers[0]?.(await solveForHero("3-beginner", stateForSolve(state)));
    await flush();
    expect(h.loop.currentLabel).not.toBe("초보자 해법");
    expect(h.clock.pending()).toBe(1);
    h.advanceUntil(() => h.loop.currentLabel.endsWith("맞춤"));
    expect(isSolved(3, h.loop.current)).toBe(true);
    expect(h.resets).toHaveLength(0);
  });

  it("멈추면 시간이 흘러도 수를 두지 않고, 이으면 그 자리에서 간다", () => {
    const h = harness(solveForHero);
    h.loop.start();
    h.advanceUntil(() => h.moves.length === 5, 1);
    h.loop.pause();
    h.clock.advance(10_000);
    expect(h.moves).toHaveLength(5);
    expect(h.clock.pending()).toBe(0);
    h.loop.resume();
    expect(h.moves).toHaveLength(5);
    // 멈춘 걸음을 처음부터 다시 기다린다(큐브 돌리기는 조금 느리다)
    h.clock.advance(T3.scrambleMove - 1);
    expect(h.moves).toHaveLength(5);
    h.advanceUntil(() => h.moves.length === 6, 1);
    h.loop.stop();
    h.loop.resume();
    h.clock.advance(10_000);
    expect(h.moves).toHaveLength(6);
  });

  it("풀이를 못 만들면(축소법이 막힘 등) 그 판을 건너뛰고 맞춘 큐브에서 다음 해법으로 다시 섞는다", async () => {
    const h = harness(() => Promise.reject(new Error("막힘")));
    h.loop.start();
    h.advanceUntil(() => h.loop.currentLabel !== SCRAMBLING_LABEL, 1);
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

  it.each(["3-roux", "3-zz"])(
    "%s는 섞인 큐브를 맞추고 단계마다 이름 꼬리표가 붙는다",
    async (id) => {
      const { applyMoves, parseMoves, randomCubeState, isSolved } =
        await import("@game/cube-engine");
      const { STAGE_LABELS } = await import("@game/cube-ai");
      const names = new Set(Object.values(STAGE_LABELS));
      const start = randomCubeState(3, 5);
      const r = await solveForHero(id, start);
      expect(
        isSolved(3, applyMoves(3, start, parseMoves(3, r.moves.join(" ")))),
      ).toBe(true);
      expect(r.stages.length).toBeGreaterThan(2);
      for (const s of r.stages) expect(names.has(s.label), s.label).toBe(true);
    },
  );

  it("표에 없는 해법은 거부한다", async () => {
    await expect(
      solveForHero("없음", (await import("@game/cube-engine")).solvedCube(3)),
    ).rejects.toThrow();
  });
});
