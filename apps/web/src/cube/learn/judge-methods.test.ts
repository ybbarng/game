import { solveRoux, solveZZ } from "@game/cube-ai";
import {
  applyMoves,
  B,
  cubeTopology,
  D,
  F,
  faceColors,
  L,
  parseMoves,
  pieceFaces,
  piecesOfKind,
  R,
  randomCubeState,
  solvedCube,
  U,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { goalMet, stepStart } from "./judge";
import { LSE_EO4, ROUX } from "./lessons-roux";
import { YAU_444 } from "./lessons-yau";
import { EO_CHECK, PETRUS, ZZ } from "./lessons-zz";
import type { GoalName, Lesson, LessonStep, QuizSpec } from "./types";

const play = (n: number, s: PuzzleState, alg: string) =>
  applyMoves(n, s, parseMoves(n, alg));
const held = (alg: string) => play(3, solvedCube(3), `z2 ${alg}`);
const met = (alg: string, goal: GoalName) => goalMet(3, held(alg), goal);

describe("루 판정", () => {
  it("M은 두 블록·CMLL을 지키지만 센터가 옆으로 가 EO가 아니다", () => {
    expect(met("M", "roux-sb")).toBe(true);
    expect(met("M", "cmll")).toBe(true);
    expect(met("M", "lse-eo")).toBe(false);
    expect(met("M2", "lse-eo")).toBe(true);
    expect(met("M2", "lse-ulur")).toBe(true);
    expect(met("M2", "solved")).toBe(false);
  });

  it("윗면 돌리기 하나는 봐주고, 앞면을 돌리면 첫 블록이 깨진다", () => {
    expect(met("U", "lse-ulur")).toBe(true);
    // L은 왼쪽 층을 통째로 돌려 블록 모양은 그대로다. F는 깬다
    expect(met("L", "roux-fb")).toBe(true);
    expect(met("F", "roux-fb")).toBe(false);
    expect(met("R", "roux-fb")).toBe(true);
    expect(met("R", "roux-sb")).toBe(false);
    expect(met("R U R'", "cmll")).toBe(false);
  });

  it("M U M'은 엣지 방향을 바꾼다", () => {
    expect(met("M U M'", "cmll")).toBe(true);
    expect(met("M U M'", "lse-eo")).toBe(false);
    expect(met("M U2 M'", "lse-eo")).toBe(true);
  });
});

describe("ZZ·페트루스 판정", () => {
  it("F·B 4분의 1 돌리기만 엣지 방향을 바꾼다", () => {
    expect(met("R U L D", "eo")).toBe(true);
    expect(met("F", "eo")).toBe(false);
    expect(met("F2 B2", "eo")).toBe(true);
    expect(met("R U L", "eoline")).toBe(true);
    expect(met("D", "eoline")).toBe(false);
    expect(met("R U R'", "zz-left")).toBe(true);
    expect(met("L U L'", "zz-left")).toBe(false);
  });

  it("페트루스 블록은 왼쪽-뒤-아래", () => {
    expect(met("R U F", "petrus-222")).toBe(true);
    expect(met("D", "petrus-222")).toBe(false);
    expect(met("R U", "petrus-223")).toBe(true);
    expect(met("F", "petrus-223")).toBe(false);
  });
});

describe("야우 판정", () => {
  const play4 = (alg: string) => play(4, solvedCube(4), alg);
  it("흰·노랑 센터와 십자 엣지 줄을 센다", () => {
    expect(goalMet(4, play4("Rw"), "yau-ud-centers")).toBe(false);
    expect(goalMet(4, play4("Uw"), "yau-ud-centers")).toBe(true);
    // Uw는 흰 십자 줄을 통째로 돌려 서로의 차례는 그대로다
    expect(goalMet(4, play4("Uw"), "yau-cross3")).toBe(true);
    // 바깥 R은 흰 십자 줄 하나만 옮긴다(센터는 그대로)
    expect(goalMet(4, play4("R"), "yau-centers")).toBe(true);
    expect(goalMet(4, play4("R"), "yau-cross")).toBe(false);
    expect(goalMet(4, play4("R F"), "yau-cross3")).toBe(false);
  });
});

describe("새 해법 고르기 문제의 답(엔진으로 센다)", () => {
  const lessons = [ROUX, ZZ, PETRUS, YAU_444].flatMap((c) => c.lessons);
  /** 단원 id의 k번째 고르기 문제와 그 그림 상태 */
  const quiz = (id: string, k = 0) => {
    const lesson = lessons.find((l) => l.id === id) as Lesson;
    const step = lesson.steps.filter((s) => s.kind === "quiz")[k] as LessonStep;
    const q = step.quiz as QuizSpec;
    return {
      n: lesson.size,
      state: stepStart(lesson, step, 1),
      answer: q.choices[q.answer],
    };
  };
  const nn = (n: number) => n * n;
  /** 윗면 코너 칸 가운데 노란색인 수 */
  const yellowUpCorners = (n: number, s: PuzzleState) => {
    const c = faceColors(n, s);
    return [0, n - 1, nn(n) - n, nn(n) - 1].filter((k) => c[k] === D).length;
  };
  /** 윗면 엣지(날개) 칸 가운데 노란색인 칸 수 */
  const yellowUpEdgeStickers = (n: number, s: PuzzleState) => {
    const c = faceColors(n, s);
    let count = 0;
    for (let r = 0; r < n; r++)
      for (let k = 0; k < n; k++) {
        const onEdge = r === 0 || r === n - 1 || k === 0 || k === n - 1;
        const corner = (r === 0 || r === n - 1) && (k === 0 || k === n - 1);
        if (onEdge && !corner && c[r * n + k] === D) count++;
      }
    return count;
  };
  /**
   * 3×3 자리(닿은 면들)의 엣지에서 기준 칸이 있는 면. 기준 칸은 위·아래 센터 색 칸,
   * 없으면(fb가 참일 때만) 앞·뒤 센터 색 칸. 그런 칸이 없으면 null
   */
  const udStickerFace = (s: PuzzleState, at: number[], fb = false) => {
    const c = faceColors(3, s);
    const topo = cubeTopology(3);
    const p = piecesOfKind(3, "edge").find((q) => {
      const f = pieceFaces(3, q);
      return f.length === at.length && at.every((x) => f.includes(x));
    }) as number;
    const groups = [[U, D], ...(fb ? [[F, B]] : [])];
    for (const g of groups) {
      const want = g.map((f) => c[f * 9 + 4]);
      for (const st of topo.pieces[p]?.stickers ?? [])
        if (want.includes(c[st] as number))
          return topo.stickers[st]?.face as number;
    }
    return null;
  };
  /** 루 LSE 엣지 여섯(위 넷 + 아래 앞·뒤) 센터 흰·노랑 칸이 위·아래를 보지 않는 수 */
  const lseBad = (s: PuzzleState) =>
    [
      [U, F],
      [U, B],
      [U, L],
      [U, R],
      [D, F],
      [D, B],
    ].filter((at) => ![U, D].includes(udStickerFace(s, at) as number)).length;

  it("루: 두 블록 뒤 F만 첫 블록을 깬다", () => {
    expect(quiz("roux-sb").answer).toBe("F");
    expect(met("R", "roux-fb")).toBe(true);
    expect(met("M", "roux-fb")).toBe(true);
    expect(met("F", "roux-fb")).toBe(false);
  });

  it("루 CMLL: 위를 보는 노란 코너 0개", () => {
    const q = quiz("roux-cmll");
    expect(goalMet(3, q.state, "roux-sb")).toBe(true);
    expect(q.answer).toBe(`${yellowUpCorners(3, q.state)}개`);
    expect(q.answer).toBe("0개");
  });

  it("루 LSE: 나쁜 엣지 4개, M' U M으로 엣지 방향이 맞는다", () => {
    const q = quiz("roux-lse");
    expect(goalMet(3, q.state, "cmll")).toBe(true);
    expect(goalMet(3, q.state, "lse-eo")).toBe(false);
    expect(q.answer).toBe(`${lseBad(q.state)}개`);
    expect(goalMet(3, play(3, q.state, LSE_EO4), "lse-eo")).toBe(true);
  });

  it("ZZ: F 한 번 뒤 나쁜 엣지 4개", () => {
    const q = quiz("zz-eo", 0);
    const bad = piecesOfKind(3, "edge").filter((p) => {
      const at = pieceFaces(3, p);
      const ref = at.includes(U) || at.includes(D) ? [U, D] : [F, B];
      return !ref.includes(udStickerFace(q.state, at, true) as number);
    }).length;
    expect(q.answer).toBe(`${bad}개`);
    expect(goalMet(3, q.state, "eo")).toBe(false);
  });

  it("ZZ 알아보기: 위-왼쪽은 좋고, 위-앞·앞-오른쪽은 나쁘다", () => {
    const ul = quiz("zz-eo", 1);
    expect(udStickerFace(ul.state, [U, L])).toBe(U);
    expect(udStickerFace(ul.state, [U, F])).toBe(F);
    expect(ul.answer).toBe("좋은 엣지예요");
    const fr = quiz("zz-eo", 2);
    // 가운데 층 자리는 앞·뒤를 봐야 좋은데 기준 칸이 오른쪽을 본다
    expect(udStickerFace(fr.state, [F, R])).toBe(R);
    expect(fr.answer).toBe("나쁜 엣지예요");
    expect(goalMet(3, play(3, fr.state, EO_CHECK), "eo")).toBe(true);
  });

  it("ZZ 마지막 층: 위를 보는 노란 코너 1개", () => {
    const q = quiz("zz-ll");
    expect(goalMet(3, q.state, "f2l")).toBe(true);
    expect(q.answer).toBe(`${yellowUpCorners(3, q.state)}개`);
  });

  it("야우: 흰 면 아래, 흰 십자 엣지 블럭이 앞 초록·왼쪽 빨강·뒤 파랑이면 비운 오른쪽은 주황의 제자리", () => {
    const q = quiz("yau-side-centers");
    const c = faceColors(4, q.state);
    // 아래 층 엣지 줄의 옆면 스티커(맨 아랫줄 가운데 둘): 앞 초록(F)·왼쪽 빨강(R)·뒤 파랑(B), 아랫면 흰색(U)
    for (const [face, color] of [
      [F, F],
      [L, R],
      [B, B],
    ] as const)
      for (const cell of [13, 14]) expect(c[face * 16 + cell]).toBe(color);
    // 오른쪽 자리는 비었다(흰-주황 엣지 블럭이 없다)
    expect([c[R * 16 + 13], c[R * 16 + 14]]).not.toEqual([L, L]);
    expect(q.answer).toBe("주황");
  });

  it("야우 패리티: 위를 보는 노란 엣지 3개(홀수)", () => {
    const q = quiz("yau-finish");
    expect(goalMet(4, q.state, "edges-paired")).toBe(true);
    expect(q.answer).toBe(`${yellowUpEdgeStickers(4, q.state) / 2}개`);
  });
});

describe("새 해법 시연", () => {
  // 시연 수는 풀이 함수 결과를 옮겨 적은 것이다. 시연을 끝까지 두면 같은 단원 다음 해 보기의 목표가 된다
  const pairs = [ROUX, ZZ, PETRUS, YAU_444].flatMap((course) =>
    course.lessons.flatMap((lesson) =>
      lesson.steps.flatMap((step, i) => {
        if (step.kind !== "demo" || !step.alg) return [];
        const next = lesson.steps.slice(i + 1).find((s) => s.kind === "try");
        if (!next?.goal) return [];
        return [{ id: lesson.id, lesson, step, goal: next.goal }];
      }),
    ),
  );

  it("열 개 넘게 있다", () => {
    expect(pairs.length).toBeGreaterThan(10);
  });

  it.each(pairs)("$id: $step.body", ({ lesson, step, goal }) => {
    const n = lesson.size;
    const start = stepStart(lesson, step, 1);
    expect(goalMet(n, play(n, start, step.alg as string), goal)).toBe(true);
  });
});

/** 풀이 함수의 단계 경계마다 배우기 판정이 그 단계를 맞았다고 본다(두 쪽을 서로 확인) */
function stagesMeet(
  solve: (s: PuzzleState) => {
    moves: string[];
    stages: { name: string; end: number }[];
  },
  want: Record<string, GoalName>,
  seed: number,
) {
  const start = randomCubeState(3, seed);
  const r = solve(start);
  for (const st of r.stages) {
    const goal = want[st.name];
    if (!goal) continue;
    const s = play(3, start, r.moves.slice(0, st.end).join(" "));
    expect(goalMet(3, s, goal), `${seed} ${st.name}`).toBe(true);
  }
}

describe("풀이 함수와 판정이 맞는다", () => {
  it.each([1, 2, 3, 4])("루 %i", (seed) => {
    stagesMeet(
      solveRoux,
      {
        fb: "roux-fb",
        sb: "roux-sb",
        cmll: "cmll",
        "lse-eo": "lse-eo",
        "lse-ulur": "lse-ulur",
        "lse-ep": "solved",
      },
      seed,
    );
  });

  it.each([1, 2, 3, 4])("ZZ %i", (seed) => {
    stagesMeet(
      solveZZ,
      {
        eoline: "eoline",
        "zz-left": "zz-left",
        "zz-right": "f2l",
        oll: "oll",
        pll: "solved",
      },
      seed,
    );
  });
});
