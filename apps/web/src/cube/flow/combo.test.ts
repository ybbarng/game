import {
  AXES,
  applyMove,
  type CubeMove,
  faceColors,
  flowScore,
  isRotation,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import {
  COMBO_LOOK_BACK,
  COMBO_STEP_MOVES,
  COMBO_STEP_MOVES_2,
  type ComboState,
  comboLevel,
  comboNow,
  EMPTY_COMBO,
  longestCombo,
  pushCombo,
} from "./combo";

const m = (n: number, s: string) => parseMoves(n, s)[0] as CubeMove;

/** 수 글을 0.1초 간격으로 넣으며 수마다의 콤보 */
function play(n: number, alg: string) {
  let c = EMPTY_COMBO;
  let t = 0;
  const seen: number[] = [];
  for (const s of alg.split(" ")) {
    c = pushCombo(c, n, m(n, s), t);
    seen.push(c.combo);
    t += 100;
  }
  return seen;
}

describe("이어 치기", () => {
  /** 시계를 감으며 수를 둔다: [수, 앞 수부터 감을 ms] */
  function playAt(
    clock: ManualClock,
    steps: [string, number][],
    from: ComboState = EMPTY_COMBO,
  ) {
    let c = from;
    for (const [s, wait] of steps) {
      clock.advance(wait);
      c = pushCombo(c, 3, m(3, s), clock.now());
    }
    return c;
  }

  it("1초 안쪽으로 이어 치면 쌓이고, 1초 넘게 멈추면 끊겨 다시 1부터", () => {
    const clock = new ManualClock();
    let c = playAt(clock, [
      ["R", 0],
      ["U", 300],
      ["R'", 1_000], // 꼭 1초는 이어진 것
      ["U'", 200],
    ]);
    expect(comboNow(c, clock.now())).toBe(4);
    clock.advance(1_000);
    expect(comboNow(c, clock.now())).toBe(4);
    clock.advance(1);
    expect(comboNow(c, clock.now())).toBe(0);
    c = pushCombo(c, 3, m(3, "F"), clock.now());
    expect(c.combo).toBe(1);
  });

  it("큐브 돌리기는 올리지도 끊지도 않는다(돌리기만 하며 오래 멈추면 다음 면 돌리기에서 끊긴다)", () => {
    const clock = new ManualClock();
    const c = playAt(clock, [
      ["U", 0],
      ["F", 100],
      ["y", 100],
      ["R", 500],
    ]);
    expect(comboNow(c, clock.now())).toBe(3);
    const after = playAt(
      clock,
      [
        ["y", 800],
        ["F", 800],
      ],
      c,
    );
    expect(after.combo).toBe(1);
  });

  it("강조 단계는 4·12·24·40수에서 한 단계씩", () => {
    expect([3, 4, 11, 12, 23, 24, 39, 40, 99].map(comboLevel)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
});

describe("되돌리는 수는 콤보를 끊는다", () => {
  it("바로 앞 수를 되돌리면 0, 다음 수부터 다시 센다", () => {
    expect(play(3, "R U U' F")).toEqual([1, 2, 0, 1]);
    expect(play(3, "R2 R2")).toEqual([1, 0]);
  });

  it("같은 면을 이어 돌려 한 바퀴가 되면 끊는다(R R R R, R R2 R)", () => {
    expect(play(3, "U R R R R")).toEqual([1, 2, 3, 4, 0]);
    expect(play(3, "U R R2 R")).toEqual([1, 2, 3, 0]);
    // 한 바퀴가 아니면 끊지 않는다
    expect(play(3, "R R R")).toEqual([1, 2, 3]);
  });

  it("R R′를 되풀이하면 쌓이지 않는다", () => {
    const seen = play(3, Array.from({ length: 40 }, () => "R R'").join(" "));
    expect(Math.max(...seen)).toBe(1);
  });

  it("큰 큐브의 안쪽 층·여러 층 돌리기도 같다", () => {
    expect(play(4, "U Rw Rw'")).toEqual([1, 2, 0]);
    expect(play(5, "U 2R 2R'")).toEqual([1, 2, 0]);
    // 다른 층이면 되돌림이 아니다
    expect(play(4, "R Rw'")).toEqual([1, 2]);
  });

  it("큐브 돌리기는 건너뛰고, 그 뒤 면 이름은 돌린 만큼 바꿔 본다", () => {
    // y 뒤에는 앞의 R 면이 F 자리에 온다
    expect(play(3, "U R y F'")).toEqual([1, 2, 2, 0]);
    expect(play(3, "U R y R'")).toEqual([1, 2, 2, 3]);
    // x2 뒤에는 앞의 U 면이 D 자리, 돌림 방향도 거꾸로 보인다
    expect(play(3, "R U x2 D'")).toEqual([1, 2, 2, 0]);
  });

  /** 수 a, 큐브 돌리기, 수 b가 실제로 a를 되돌리는가: 돌리기만 한 것과 같은 색 */
  function undoes(
    n: number,
    start: PuzzleState,
    a: CubeMove,
    rot: CubeMove,
    b: CubeMove,
  ): boolean {
    const want = faceColors(n, applyMove(n, start, rot));
    const got = faceColors(
      n,
      applyMove(n, applyMove(n, applyMove(n, start, a), rot), b),
    );
    return want.every((c, i) => got[i] === c);
  }

  for (const n of [3, 4]) {
    it(`${n}×${n}: 모든 큐브 돌리기와 수에서 실제로 되돌리는 수 하나만 끊는다`, () => {
      const start = randomCubeState(n, 7);
      const moves: CubeMove[] = [];
      for (const axis of AXES)
        for (let from = 1; from <= n; from++)
          for (let to = from; to <= n; to++)
            for (const turns of [1, 2, 3] as const) {
              const mv = { axis, from, to, turns };
              if (!isRotation(n, mv)) moves.push(mv);
            }
      const rotations = AXES.flatMap((axis) =>
        ([1, 2, 3] as const).map((turns) => ({ axis, from: 1, to: n, turns })),
      );
      for (const rot of rotations)
        for (const a of moves) {
          const before = pushCombo(
            pushCombo(EMPTY_COMBO, n, a, 0),
            n,
            rot,
            100,
          );
          const hits = moves.filter(
            (b) => pushCombo(before, n, b, 200).combo === 0,
          );
          expect(hits).toHaveLength(1);
          expect(undoes(n, start, a, rot, hits[0] as CubeMove)).toBe(true);
        }
    });
  }
});

describe("진행이 없으면 끊는다", () => {
  /** R·U를 번갈아(되돌림 없이) 0.1초 간격으로, 수마다 진행 칸을 정해 넣는다 */
  function withProgress(n: number, scores: readonly number[]) {
    let c = EMPTY_COMBO;
    return scores.map((p, i) => {
      c = pushCombo(c, n, m(n, i % 2 ? "U" : "R"), i * 100, p);
      return c.combo;
    });
  }
  const T = COMBO_STEP_MOVES;

  it(`${T}수마다 시작보다 한 칸씩 더 올라 있으면 이어진다`, () => {
    // 시작 5칸, 10수마다 한 칸씩 오른다(그 사이는 그대로)
    const scores = Array.from(
      { length: 60 },
      (_, i) => 5 + Math.floor((i + 1) / T),
    );
    // 10수째에 막 6칸이 되므로 이어진다
    expect(withProgress(3, scores).at(-1)).toBe(60);
  });

  it(`${T}수 동안 그대로면 ${T}수째에 끊기고, 그 자리를 새 시작으로 다시 센다`, () => {
    const seen = withProgress(3, Array(2 * T + 1).fill(5));
    expect(seen.slice(0, T)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
    // 끊긴 뒤 다시 1부터, 또 10수째에 끊긴다
    expect(seen.slice(T)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1]);
  });

  it(`공식 도중에 잠깐 흐트러져도 최근 ${COMBO_LOOK_BACK}수 안에 넘었으면 이어진다`, () => {
    // 5칸에서 시작, 8수째에 7칸, 10수째(확인하는 수)에는 3칸으로 흐트러짐
    const scores = [5, 5, 5, 5, 5, 5, 5, 7, 4, 3, 7, 7];
    expect(withProgress(3, scores).at(-1)).toBe(12);
  });

  it(`2×2는 조각이 적어 ${COMBO_STEP_MOVES_2}수마다 본다`, () => {
    const seen = withProgress(2, Array(COMBO_STEP_MOVES_2).fill(3));
    expect(seen.at(T - 1)).toBe(T);
    expect(seen.at(-1)).toBe(0);
  });

  it("진행 칸을 주지 않으면 이 규칙은 쓰지 않는다", () => {
    const seen = play(3, Array.from({ length: 30 }, () => "R U").join(" "));
    expect(seen.at(-1)).toBe(60);
  });
});

/** 수들을 0.3초 간격으로 두며 진행 칸을 넣은 가장 긴 콤보와 면 돌리기 수 */
function playSolve(n: number, start: PuzzleState, moves: readonly CubeMove[]) {
  let state = start;
  const steps = moves.map((move, i) => {
    state = applyMove(n, state, move);
    return { move, at: i * 300, progress: flowScore(n, state) };
  });
  return {
    longest: longestCombo(n, steps),
    turns: moves.filter((mv) => !isRotation(n, mv)).length,
  };
}

describe("마구 돌리기", () => {
  /** 섞인 큐브에 무작위 바깥 면 돌리기(정해진 씨앗) */
  function randomTurns(n: number, seed: number, count: number) {
    let x = seed;
    const rand = () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x / 0x80000000;
    };
    const faces = ["R", "L", "U", "D", "F", "B"];
    const sfx = ["", "'", "2"];
    return Array.from({ length: count }, () =>
      m(n, `${faces[Math.floor(rand() * 6)]}${sfx[Math.floor(rand() * 3)]}`),
    );
  }

  it("섞인 3×3·4×4에 무작위 면 돌리기를 빠르게 넣으면 콤보가 쌓이지 않는다", () => {
    for (const n of [3, 4]) {
      const r = playSolve(n, randomCubeState(n, 3), randomTurns(n, 99, 600));
      expect(r.longest).toBeLessThanOrEqual(60);
    }
  });

  it("같은 공식만 되풀이해도(R U R′ U′ 여섯 번이면 제자리) 120수 가운데 60수를 넘게 잇지 못한다", () => {
    // 되풀이 한 바퀴 안에서 진행 칸이 오르내리는 폭만큼만 이어진다
    const n = 3;
    const moves = parseMoves(
      n,
      Array.from({ length: 30 }, () => "R U R' U'").join(" "),
    );
    expect(
      playSolve(n, randomCubeState(n, 5), moves).longest,
    ).toBeLessThanOrEqual(6 * COMBO_STEP_MOVES);
  });
});
