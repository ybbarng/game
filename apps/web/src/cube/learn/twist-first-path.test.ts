// 3×3 초보자(코너 방향 먼저, 신광사 해법)의 경우별 정해진 길(twist-first-path.ts)을 엔진으로 확인한다(docs/47 16-33).
// 1. 무작위로 섞은 큐브를 단원 규칙만으로(흰 십자·첫 층 코너는 beginner-path.ts) 끝까지 맞춘다.
// 2. 단계마다 나올 수 있는 모양을 모두 만들어, 경우마다 정해진 수로 끝나고 적어 둔 「다음 경우」로 넘어가는지, 앞 단계에서
//    맞춘 것이 내내 그대로인지 본다.
// 3. 공식이 설명서 결과 그림대로 조각을 옮기는지 본다(transcription.md의 엔진 대조를 시험으로 남긴다).
// 4. 코너 방향 관계도(beginner-cases.ts TWIST_FLOW)가 엔진으로 친 결과와 같은지 본다.
import { faceColors, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { TWIST_FLOW } from "./beginner-cases";
import { play } from "./beginner-path";
import { goalMet, stateForRule } from "./judge";
import {
  CORNER_A,
  CORNER_B,
  CORNER_DOWN,
  CORNER_IN,
  CORNER_PULL,
  CORNER_TURN,
  cornerYellows,
  EDGE_CYCLE,
  EDGE_FLIP,
  edgesMatched,
  edgesUp,
  nextTwistFirstStep,
  placedCorners,
  runTwistFirstStage,
  SECOND_A,
  SECOND_B,
  TWIST_FIRST_FLIP_BEFORE,
  TWIST_FIRST_ORDER,
  TWIST_FIRST_STAGES,
  type TwistFirstStageId,
  type TwistFirstStep,
  twistFirstCase,
  twistFirstMoves,
} from "./twist-first-path";

/** 공식이 걸음들에 몇 번 들었나 */
const count = (steps: TwistFirstStep[], alg: string) =>
  steps.reduce((k, st) => k + st.alg.split(alg).length - 1, 0);

const down = () => play(solvedCube(3), "z2");
const key = (s: PuzzleState) => Array.from(faceColors(3, s)).join("");

/** 위 엣지 넷이 제자리·바른 방향(윗면 돌리기 없이)이고 아래 두 층이 맞음 */
function edgesHome(s: PuzzleState): boolean {
  return (
    goalMet(3, s, "f2l") &&
    edgesUp(s).length === 4 &&
    edgesMatched(s).length === 4
  );
}

function solveByRules(start: PuzzleState) {
  let s = start;
  const runs = {} as Record<TwistFirstStageId, TwistFirstStep[]>;
  for (const id of TWIST_FIRST_ORDER) {
    if (id === TWIST_FIRST_FLIP_BEFORE) s = play(s, "z2");
    const r = runTwistFirstStage(id, s);
    runs[id] = r.steps;
    s = r.state;
    const goal = TWIST_FIRST_STAGES.find((x) => x.id === id)?.goal;
    expect(goalMet(3, s, goal ?? "solved"), id).toBe(true);
  }
  return { end: s, runs };
}

/** 맞춘 큐브에서 수들을 이어 쳐 나오는 모양을 모두 모은다(같은 스티커 배치는 하나) */
function collect(gens: string[], depth: number, from = down()): PuzzleState[] {
  const out = new Map<string, PuzzleState>([[key(from), from]]);
  let layer = [...out.values()];
  for (let d = 0; d < depth; d++) {
    const next: PuzzleState[] = [];
    for (const s of layer)
      for (const g of gens) {
        const t = play(s, g);
        if (out.has(key(t))) continue;
        out.set(key(t), t);
        next.push(t);
      }
    layer = next;
  }
  return [...out.values()];
}

/** 걸음마다 적어 둔 「다음 경우」가 실제 다음 걸음(또는 끝)과 맞는지 */
function nextMatches(stage: TwistFirstStageId, s0: PuzzleState) {
  let s = s0;
  for (;;) {
    const st = nextTwistFirstStep(stage, s);
    if (!st) return;
    s = play(s, twistFirstMoves(st));
    const want = twistFirstCase(stage, st.caseId).next;
    const got = nextTwistFirstStep(stage, s)?.caseId ?? "done";
    const ok = want === undefined ? got === "done" : want.includes(got);
    expect(
      ok,
      `${stage} ${st.caseId} → ${got}(적은 것 ${want?.join("·") ?? "끝"})`,
    ).toBe(true);
  }
}

describe("무작위 섞기를 규칙만으로 끝까지", () => {
  it("50개 모두 맞춰지고, 단계마다 공식 횟수가 상한 안이며, 모든 경우를 만난다", () => {
    const seen = new Map<TwistFirstStageId, Set<string>>();
    for (let seed = 1; seed <= 50; seed++) {
      const { end, runs } = solveByRules(stateForRule("random-cross", seed));
      expect(goalMet(3, end, "solved"), `${seed}`).toBe(true);
      expect(count(runs.eo, EDGE_FLIP), `${seed}`).toBeLessThanOrEqual(3);
      expect(count(runs.ep, EDGE_CYCLE), `${seed}`).toBeLessThanOrEqual(2);
      expect(count(runs.twist, CORNER_TURN), `${seed}`).toBeLessThanOrEqual(3);
      expect(
        count(runs.place, CORNER_A) + count(runs.place, CORNER_B),
        `${seed}`,
      ).toBeLessThanOrEqual(2);
      for (const [id, steps] of Object.entries(runs)) {
        const set = seen.get(id as TwistFirstStageId) ?? new Set<string>();
        for (const st of steps) set.add(st.caseId);
        seen.set(id as TwistFirstStageId, set);
      }
    }
    const missing = TWIST_FIRST_STAGES.flatMap((st) =>
      st.cases
        .filter((c) => !seen.get(st.id)?.has(c.id))
        .map((c) => `${st.id} ${c.id}`),
    );
    expect(missing).toEqual([]);
  });

  it("1·2단계는 공식 횟수가 많아야 블럭마다 셋(흰 엣지 블럭은 빼기 한 번 + 넣기, 코너 블럭은 빼기 · 다시 놓기 · 넣기)이다", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { runs } = solveByRules(stateForRule("random-cross", seed));
      expect(runs.cross.length, `${seed}`).toBeLessThanOrEqual(8);
      expect(runs.corners.length, `${seed}`).toBeLessThanOrEqual(12);
    }
  });

  it("단계마다 연습 섞기도 규칙대로 그 단계를 끝낸다", () => {
    const RULE: [TwistFirstStageId, Parameters<typeof stateForRule>[0]][] = [
      ["corners", "white-cross-up"],
      ["second", "first-layer-solved"],
      ["eo", "second-layer-solved"],
      ["ep", "ll-cross-solved"],
      ["twist", "ll-edges-solved"],
      ["place", "ll-corners-unplaced"],
    ];
    for (const [id, rule] of RULE)
      for (let seed = 1; seed <= 10; seed++) {
        const r = runTwistFirstStage(id, stateForRule(rule, seed));
        const goal = TWIST_FIRST_STAGES.find((x) => x.id === id)?.goal;
        expect(goalMet(3, r.state, goal ?? "solved"), `${id} ${seed}`).toBe(
          true,
        );
      }
  });
});

describe("단계마다 나올 수 있는 모양 모두", () => {
  it("흰 십자: 흰 엣지 블럭 하나가 어디에 어떻게 있든(24가지) 규칙대로 넣고, 다음 경우가 적은 대로다", () => {
    // 흰 엣지 블럭 하나(흰-초록)를 열두 자리 · 두 방향에 두고 나머지 흰 엣지는 맞춘다: 그 블럭만 흩는 수
    const up = solvedCube(3);
    const shapes = collect(["F", "F2", "D", "R2 D R2", "y"], 5, up).filter(
      (s) => {
        const c = faceColors(3, s);
        // 흰 엣지 블럭 셋만 제자리·바른 방향(윗면 칸이 흰색이고 옆 칸이 그 면 센터 색)
        const ok = [
          [7, 19],
          [5, 10],
          [1, 46],
          [3, 37],
        ].filter(
          ([u, side]) =>
            c[u as number] === c[4] &&
            c[side as number] === c[Math.floor((side as number) / 9) * 9 + 4],
        ).length;
        return ok === 3;
      },
    );
    let n = 0;
    for (const s of shapes) {
      const r = runTwistFirstStage("cross", s);
      expect(goalMet(3, r.state, "white-cross")).toBe(true);
      expect(r.steps.length).toBeLessThanOrEqual(2);
      nextMatches("cross", s);
      n++;
    }
    expect(n).toBeGreaterThan(20);
  });

  it("첫 층 코너: 코너 블럭 하나가 어디에 어떻게 있든 규칙대로 넣고, 흰 십자와 다른 코너는 그대로다", () => {
    const shapes = collect(
      [CORNER_IN, CORNER_PULL, CORNER_DOWN, "D", "y"],
      4,
      play(solvedCube(3), ""),
    ).filter((s) => goalMet(3, s, "white-cross"));
    const seen = new Set<string>();
    for (const s of shapes) {
      const r = runTwistFirstStage("corners", s);
      expect(goalMet(3, r.state, "first-layer")).toBe(true);
      for (const st of r.steps) seen.add(st.caseId);
    }
    expect([...seen].sort()).toEqual(["down", "front", "right", "slot"]);
  });

  it("둘째 층: 엣지가 어디에 어떻게 있든 규칙대로 넣고, 엣지 하나만 흩어졌으면 다음 경우도 적은 대로다", () => {
    // 넣기 공식을 여러 쥐기와 윗면 돌리기로 쳐서 가운데 층 엣지를 흩는다
    const shapes = collect([SECOND_A, SECOND_B, "U", "y"], 4);
    // 가운데 층 엣지 자리(앞-오른쪽, 앞-왼쪽, 뒤-왼쪽, 뒤-오른쪽)의 두 스티커가 모두 제 면 센터 색인 수
    const middleOk = (s: PuzzleState) => {
      const c = faceColors(3, s);
      return [
        [23, 12],
        [21, 41],
        [50, 39],
        [48, 14],
      ].filter((p) => p.every((i) => c[i] === c[Math.floor(i / 9) * 9 + 4]))
        .length;
    };
    let single = 0;
    for (const s of shapes) {
      if (!goalMet(3, s, "first-layer")) continue;
      const r = runTwistFirstStage("second", s);
      expect(goalMet(3, r.state, "second-layer")).toBe(true);
      if (middleOk(s) !== 3) continue;
      single++;
      nextMatches("second", s);
    }
    expect(single).toBeGreaterThan(20);
  });

  it("엣지 방향: 모양 넷, 공식은 많아야 세 번, 다음 경우가 적은 대로이고 아래 두 층은 그대로다", () => {
    const shapes = collect([EDGE_FLIP, "U"], 8);
    const kinds = new Set(shapes.map((s) => edgesUp(s).sort().join("")));
    expect(kinds.size).toBe(8);
    for (const s of shapes) {
      const r = runTwistFirstStage("eo", s);
      expect(goalMet(3, r.state, "yellow-cross")).toBe(true);
      expect(count(r.steps, EDGE_FLIP)).toBeLessThanOrEqual(3);
      nextMatches("eo", s);
    }
  });

  it("엣지 위치: 엣지 자리 24가지(방향 맞음), 공식은 많아야 두 번이고 다음 경우가 적은 대로다", () => {
    const shapes = collect([EDGE_CYCLE, "U", "y"], 8);
    const places = new Set(
      shapes.map((s) => {
        const c = faceColors(3, s);
        return [19, 10, 46, 37].map((i) => c[i]).join("");
      }),
    );
    expect(places.size).toBe(24);
    for (const s of shapes) {
      const r = runTwistFirstStage("ep", s);
      expect(goalMet(3, r.state, "yellow-edges")).toBe(true);
      expect(count(r.steps, EDGE_CYCLE)).toBeLessThanOrEqual(2);
      nextMatches("ep", s);
    }
  });

  it("코너 방향: 방향 27가지, 공식은 많아야 세 번, 다음 경우가 적은 대로이고 위 엣지는 그대로다", () => {
    const shapes = collect(
      [CORNER_TURN, `y ${CORNER_TURN} y'`, `y2 ${CORNER_TURN} y2`],
      8,
    );
    const orient = new Set(shapes.map((s) => cornerYellows(s).join("")));
    expect(orient.size).toBe(27);
    for (const s of shapes) {
      expect(edgesHome(s)).toBe(true);
      const r = runTwistFirstStage("twist", s);
      expect(goalMet(3, r.state, "oll")).toBe(true);
      expect(edgesHome(r.state)).toBe(true);
      expect(count(r.steps, CORNER_TURN)).toBeLessThanOrEqual(3);
      nextMatches("twist", s);
    }
  });

  it("코너 위치: 코너 자리 12가지(방향 맞음), 하나는 A나 B 한 번, 없으면 두 번이고 위 엣지는 그대로다", () => {
    const shapes = collect([CORNER_A, `y ${CORNER_A} y'`], 8);
    const places = new Set(
      shapes.map((s) => {
        const c = faceColors(3, s);
        return [8, 9, 20, 6, 18, 38, 0, 36, 47, 2, 45, 11]
          .map((i) => c[i])
          .join("");
      }),
    );
    expect(places.size).toBe(12);
    for (const s of shapes) {
      const r = runTwistFirstStage("place", s);
      expect(goalMet(3, r.state, "solved")).toBe(true);
      const ids = r.steps.map((x) => x.caseId);
      expect(ids.length).toBe(ids[0] === "none" ? 2 : ids.length ? 1 : 0);
      nextMatches("place", s);
    }
  });
});

describe("공식은 설명서 그림의 결과대로 조각을 옮긴다", () => {
  /** 그 공식이 한 번에 맞추는 모양 */
  const solvedBy = (alg: string) =>
    play(down(), alg.split(" ").reverse().map(inv).join(" "));
  const inv = (m: string) =>
    m.endsWith("'") ? m.slice(0, -1) : m.endsWith("2") ? m : `${m}'`;

  it("둘째 층 A는 위-앞 엣지 블럭(옆 색이 앞, 위 색이 오른쪽 센터 색)을 앞-오른쪽에, B는 위 색이 왼쪽 센터 색인 것을 앞-왼쪽에 넣는다", () => {
    for (const [alg, side] of [
      [SECOND_A, 1],
      [SECOND_B, 4],
    ] as const) {
      const s = solvedBy(alg);
      const c = faceColors(3, s);
      expect([c[19], c[7]]).toEqual([c[22], c[side * 9 + 4]]);
      expect(goalMet(3, s, "first-layer")).toBe(true);
    }
  });

  it("엣지 방향: 기본형(뒤와 왼쪽)은 한 번에 십자, A(앞뒤 줄)는 쥔 그대로 기본형, B(점)는 한 번에 줄(가로)", () => {
    const base = play(down(), "");
    void base;
    const after = (up: string) => {
      const s = collect([EDGE_FLIP, "U"], 6).find(
        (x) => edgesUp(x).sort().join("") === up,
      ) as PuzzleState;
      return edgesUp(play(s, EDGE_FLIP)).sort().join("");
    };
    expect(after("BL")).toBe("BFLR");
    expect(after("BF")).toBe("BL");
    expect(after("")).toBe("LR");
  });

  it("엣지 위치: 뒤 엣지 블럭은 그대로, 앞 → 왼쪽, 왼쪽 → 오른쪽, 오른쪽 → 앞으로 옮긴다(설명서 「불변」 그림)", () => {
    const s = play(down(), EDGE_CYCLE);
    const c = faceColors(3, s);
    const ctr = (f: number) => c[f * 9 + 4];
    // 자리(앞 19, 오른쪽 10, 뒤 46, 왼쪽 37)에 든 블럭의 옆 색
    expect([c[46], c[37], c[10], c[19]]).toEqual([
      ctr(5),
      ctr(2),
      ctr(4),
      ctr(1),
    ]);
    expect(edgesUp(s).length).toBe(4);
  });

  it("코너 방향: 기본형(대각선)은 쥔 그대로 한 번에 다 맞고, a~d는 그림대로 쥐고 한 번이면 기본형이다", () => {
    expect(cornerYellows(solvedBy(CORNER_TURN)).join("")).toBe("ULUB");
    for (const n of TWIST_FLOW.filter((x) =>
      ["a", "b", "c", "d"].includes(x.id),
    ))
      expect(n.to, n.id).toBe("base");
  });

  it("코너 위치 A는 앞-오른쪽 위를 두고 뒤-왼쪽 → 뒤-오른쪽 → 앞-왼쪽 → 뒤-왼쪽(시계 방향), B는 앞-왼쪽 위를 두고 뒤-오른쪽 → 뒤-왼쪽 → 앞-오른쪽 → 뒤-오른쪽(반시계 방향)", () => {
    // 맞춘 큐브에서 치고, 자리마다 든 블럭이 원래 어느 자리 것인지 본다
    const from = (alg: string) => {
      const s = play(down(), alg);
      const c = faceColors(3, s);
      const SL = [
        [8, 9, 20],
        [6, 18, 38],
        [0, 36, 47],
        [2, 45, 11],
      ];
      const ref = faceColors(3, down());
      return SL.map((slot) => {
        const got = slot
          .map((i) => c[i])
          .sort()
          .join();
        return SL.findIndex(
          (t) =>
            t
              .map((i) => ref[i])
              .sort()
              .join() === got,
        );
      });
    };
    // 자리 0 앞-오른쪽, 1 앞-왼쪽, 2 뒤-왼쪽, 3 뒤-오른쪽에 든 블럭의 원래 자리
    expect(from(CORNER_A)).toEqual([0, 3, 1, 2]);
    expect(from(CORNER_B)).toEqual([2, 1, 3, 0]);
    expect(placedCorners(play(down(), CORNER_A))).toEqual([0]);
  });
});

describe("코너 방향 관계도", () => {
  const stateOf = (alg: string) => play(solvedCube(3), alg);

  it("모양마다 그림은 그 경우의 쥐기 그대로이고, 공식을 한 번 치면 적어 둔 모양이 된다", () => {
    for (const n of TWIST_FLOW) {
      const s = stateOf(n.alg);
      const first = nextTwistFirstStep("twist", s);
      if (n.id === "done") {
        expect(first).toBeNull();
        continue;
      }
      expect([first?.caseId, first?.hold], n.id).toEqual([n.id, ""]);
      const after = play(s, CORNER_TURN);
      const got = nextTwistFirstStep("twist", after)?.caseId ?? "done";
      expect(got, n.id).toBe(n.to);
    }
  });

  it("관계도는 코너 방향의 모든 경우와 다 맞음을 한 번씩 담는다", () => {
    const ids = (
      TWIST_FIRST_STAGES.find((s) => s.id === "twist")?.cases ?? []
    ).map((c) => c.id);
    expect(TWIST_FLOW.map((n) => n.id).sort()).toEqual([...ids, "done"].sort());
  });

  it("어느 모양에서 시작해도 관계도의 화살표를 따라 많아야 세 번이면 다 맞음에 닿는다", () => {
    const to = (id: string) => TWIST_FLOW.find((n) => n.id === id)?.to;
    for (const n of TWIST_FLOW) {
      let id: string | undefined = n.id;
      let k = 0;
      while (id && id !== "done") {
        id = to(id);
        k++;
      }
      expect(k, n.id).toBeLessThanOrEqual(3);
    }
  });
});
