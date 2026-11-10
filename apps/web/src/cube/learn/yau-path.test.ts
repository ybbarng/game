// 4×4 야우의 경우별 정해진 길(yau-path.ts, 엣지 여덟은 big-path.ts의 축소법 처음 엣지 규칙): 흰 십자 셋, 옆 센터 넷,
// 마지막 십자 엣지, 엣지 여덟을 무작위 상태에서 규칙만으로 끝내고, 공식마다 지킬 조각이 그대로인지,
// 단원 글·모범 답이 규칙과 같은지 엔진으로 본다(docs/47 16-16·16-17).
import { cubeTopology, faceColors, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { type Pick, playN, runEdges444, stepMovesBig } from "./big-path";
import { goalMet, stateForRule, stepStart } from "./judge";
import {
  YAU_444,
  YAU_CROSS_CLEAR_TRY,
  YAU_CROSS_DOWN_DEMO,
  YAU_CROSS_FRONT_TRY,
  YAU_CROSS_LOW_TRY,
  YAU_CROSS_PAIR_DEMO,
  YAU_CROSS_PAIR_HELD,
  YAU_CROSS_PAIR_TRY,
  YAU_CROSS_SAME_TRY,
  YAU_CROSS_UP_DEMO,
  YAU_CROSS_UP_WHITE_TRY,
  YAU_CROSS3_STATE,
  YAU_LAST_DEMO,
  YAU_LAST_TRY,
  YAU_PAIR,
  YAU_SIDE_DEMO,
  YAU_SIDE_LEFT_TRY,
  YAU_SIDE_PARK_TRY,
  YAU_SIDE_TRY,
  YAU_SIDE_TWO_TRY,
} from "./lessons-yau";
import { invertAlg, setupFor } from "./notation";
import type { Lesson, LessonStep } from "./types";
import {
  nextYauCrossStep,
  nextYauLastCrossStep,
  nextYauSideStep,
  runYauCross,
  runYauLastCross,
  runYauSideCenters,
  sideCount,
  stepMovesYau,
  stepMovesYauCross,
  stepMovesYauLast,
  whiteWings,
  YAU_BRING,
  YAU_CROSS_CASES,
  YAU_FACES,
  YAU_PARK,
  YAU_SIDE_CASES,
  yauCrossTarget,
} from "./yau-path";

const { U, R, F, D, L, B } = YAU_FACES;
const n = 4;
const play = (s: PuzzleState, alg: string) => playN(n, s, alg);
const faceTurns = (alg: string) =>
  alg.split(" ").filter((m) => m && !/^[xyz]/.test(m)).length;

/** 씨앗마다 다른 고르는 차례(결정적) */
function pickFrom(seed: number): Pick {
  let x = seed * 2654435761;
  return (count) => {
    x = (x * 1103515245 + 12345) >>> 0;
    return x % count;
  };
}

/** 지킬 조각: 흰·노랑 센터 블럭 여덟과 아래 층 앞·왼쪽·뒤 엣지 줄의 날개 여섯(흰 면 아래로 쥔 쪽) */
const KEEP_STICKERS = (() => {
  const topo = cubeTopology(n);
  const out: number[] = [];
  topo.pieces.forEach((p) => {
    const faces = p.stickers.map((st) => topo.stickers[st]?.face as number);
    const center =
      (p.kind === "center" || p.kind === "innerCenter") &&
      (faces[0] === U || faces[0] === D);
    const line =
      p.kind === "wing" &&
      faces.includes(D) &&
      (faces.includes(F) || faces.includes(L) || faces.includes(B));
    if (center || line) out.push(...p.stickers);
  });
  return out;
})();
const kept = (s: PuzzleState) => {
  const col = faceColors(n, s);
  return KEEP_STICKERS.map((st) => col[st]).join();
};

/** 데려온 칸에서 다른 줄로 옮기는 돌리기(단원 글의 표) */
const TURN: Record<string, string> = {
  "top-front": "R'",
  "top-back": "R",
  "bottom-front": "R",
  "bottom-back": "R'",
  "top-two": "R2",
  "bottom-two": "R2",
};

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe("야우 흰 십자 셋", () => {
  const start = (seed: number) => stateForRule("4x4-yau-ud-centers", seed);

  it("흰·노랑 센터만 맞은 무작위 60개를 규칙만으로(고르는 차례도 씨앗마다) 끝내고, 경우 여섯을 모두 만난다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const r = runYauCross(start(seed), pickFrom(seed));
      expect(goalMet(n, r.state, "yau-cross3"), `${seed}`).toBe(true);
      expect(
        faceTurns(r.steps.map(stepMovesYauCross).join(" ")),
      ).toBeLessThanOrEqual(32);
      for (const st of r.steps) seen.add(st.caseId);
    }
    // 위 층에 짝지어 흰색이 위인 경우는 드물어 아래에서 따로 본다
    expect([...seen].sort()).toEqual(
      YAU_CROSS_CASES.map((c) => c.id)
        .filter((id) => id !== "up-white-up")
        .sort(),
    );
  });

  it("위 층에 짝지어 흰색이 위면 U로 위-앞에 두고 F2 한 번에 끝난다", () => {
    const s = play(
      solvedCube(n),
      setupFor("y2 U2 F2", `${YAU_CROSS3_STATE} y2`),
    );
    expect(
      runYauCross(s).steps.map((x) => `${x.caseId}:${stepMovesYauCross(x)}`),
    ).toEqual(["up-white-up:y2 U2 F2"]);
  });

  it("걸음마다 흰·노랑 센터가 그대로이고 넣은 흰 엣지 블럭이 빠지지 않으며, 짝 넣기(F·F'·F2로 끝)마다 하나 는다", () => {
    for (const seed of SEEDS) {
      let s = start(seed);
      let placed = placedCount(s);
      for (;;) {
        const st = nextYauCrossStep(s, pickFrom(seed));
        if (!st) break;
        s = play(s, stepMovesYauCross(st));
        expect(goalMet(n, s, "yau-ud-centers")).toBe(true);
        const now = placedCount(s);
        if (st.caseId === "pair" || st.caseId === "up-white-up")
          expect(now).toBeGreaterThan(placed);
        else expect(now).toBe(placed);
        placed = now;
      }
      expect(placed).toBe(3);
    }
  });

  it("쓰는 수는 큐브 돌리기와 U·2U·2D·F, 아래 층 빈 자리 면의 반 바퀴뿐이다", () => {
    for (const seed of SEEDS.slice(0, 20))
      for (const st of runYauCross(start(seed), pickFrom(seed)).steps)
        for (const m of stepMovesYauCross(st).split(" "))
          expect(m, st.caseId).toMatch(/^([xyz]|U|2U|2D|F|R2|L2|B2)['2]?$/);
  });
});

/** 넣을 차례의 몇째인가(흰-초록 0, 흰-빨강 1, 흰-파랑 2, 셋 다 들었으면 3) */
function placedCount(s: PuzzleState): number {
  const t = yauCrossTarget(s);
  return t === null ? 3 : [2, 1, 5].indexOf(t.color);
}

describe("야우 옆 센터 넷", () => {
  const randomStart = (seed: number) => stateForRule("4x4-yau-cross3", seed);

  it("무작위 40개를 규칙만으로 끝내고, 모든 경우를 만난다", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const start = randomStart(seed);
      expect(goalMet(n, start, "yau-cross3")).toBe(true);
      expect(goalMet(n, start, "yau-centers")).toBe(false);
      const r = runYauSideCenters(start, pickFrom(seed));
      expect(goalMet(n, r.state, "yau-centers"), `${seed}`).toBe(true);
      // 보내기 둘과 넣기 많아야 열둘
      expect(r.steps.length).toBeLessThanOrEqual(14);
      for (const st of r.steps) seen.add(st.caseId);
    }
    expect([...seen].sort()).toEqual(YAU_SIDE_CASES.map((c) => c.id).sort());
  });

  it("공식 뒤마다 흰·노랑 센터와 흰 십자 셋이 그대로이고, 넣기는 오른쪽 면의 그 색을 꼭 하나(둘 넣기는 둘) 늘린다", () => {
    for (const seed of SEEDS) {
      let s = randomStart(seed);
      const keep = kept(s);
      for (;;) {
        const st = nextYauSideStep(s, pickFrom(seed));
        if (!st) break;
        const held = play(s, st.hold);
        expect(kept(held)).toBe(keep);
        const before = sideCount(held, R, st.color);
        s = play(held, st.alg);
        expect(kept(s)).toBe(keep);
        if (st.caseId === "park") {
          expect(before).toBe(4);
          expect(sideCount(s, F, st.color)).toBe(4);
        } else
          expect(sideCount(s, R, st.color)).toBe(
            before + (st.caseId.endsWith("two") ? 2 : 1),
          );
      }
    }
  });

  it("둘 넣기를 더하면 무작위 200개 평균 수가 줄어든다(하나씩만 넣을 때와 견줌)", () => {
    const avg = (two: boolean) => {
      let total = 0;
      for (let seed = 1; seed <= 200; seed++)
        total += faceTurns(
          runYauSideCenters(randomStart(seed), undefined, { two })
            .steps.map(stepMovesYau)
            .join(" "),
        );
      return total / 200;
    };
    const one = avg(false);
    const two = avg(true);
    // 2026-11-10 기준 하나씩 30.4수, 둘 넣기 27.4수(docs/47 16-17)
    expect(two).toBeLessThan(one - 2);
  });

  it("넣기는 「쥐기 R」 + 「데려오기 R·R'·R2 되돌리기」, 보내기는 2U 2D'뿐이다", () => {
    const brings = new Set(
      Object.values(YAU_BRING).flatMap((x) => Object.values(x)),
    );
    for (const seed of SEEDS.slice(0, 10))
      for (const st of runYauSideCenters(randomStart(seed), pickFrom(seed))
        .steps) {
        expect(["", "R", "R'", "R2"]).toContain(st.hold);
        if (st.caseId === "park") {
          expect(st.alg).toBe(YAU_PARK);
          continue;
        }
        const [bring, turn, back] = st.alg.split(" ");
        expect(brings.has(bring as string)).toBe(true);
        expect(turn).toBe(TURN[st.caseId]);
        expect(back).toBe(invertAlg(bring as string));
      }
  });

  it("보내기(2U 2D')는 오른쪽 면 넷을 앞면으로, 앞면 넷을 왼쪽 면으로 통째로 옮긴다", () => {
    const s = play(solvedCube(n), YAU_PARK);
    const col = faceColors(n, s);
    const base = faceColors(n, solvedCube(n));
    const cells = [5, 6, 9, 10];
    for (const [from, to] of [
      [R, F],
      [F, L],
      [L, B],
      [B, R],
    ] as const)
      for (const c of cells) expect(col[to * 16 + c]).toBe(base[from * 16 + c]);
  });
});

describe("야우 마지막 십자 엣지", () => {
  const start = (seed: number) => stateForRule("4x4-yau-centers", seed);

  it("센터와 흰 십자 셋이 맞은 무작위 80개를 규칙만으로(고르는 차례도 씨앗마다) 끝내고, 걸음마다 센터·십자 셋이 그대로다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      let s = start(seed);
      let steps = 0;
      for (;;) {
        const st = nextYauLastCrossStep(s, pickFrom(seed));
        if (!st) break;
        seen.add(st.caseId);
        s = play(s, stepMovesYauLast(st));
        expect(goalMet(n, s, "yau-centers"), `${seed} ${st.caseId}`).toBe(true);
        steps++;
        expect(steps).toBeLessThanOrEqual(8);
      }
      expect(goalMet(n, s, "yau-cross"), `${seed}`).toBe(true);
    }
    // 비운 자리에 뒤집혀 든 경우는 드물어 아래에서 따로 본다
    expect([...seen].sort()).toEqual(
      [
        "bring",
        "drop-up",
        "flip",
        "high",
        "ins-lift",
        "ins-mid",
        "ins-up-side",
        "ins-up-white-up",
        "low",
        "out-front",
      ].sort(),
    );
  });

  it("비운 자리에 뒤집혀 들었으면 F2로 올린 뒤 위 층 넣기(흰색 옆)", () => {
    const s = play(solvedCube(n), setupFor("F2 R U' R' F", "z2 y"));
    expect(
      runYauLastCross(s).steps.map((x) => `${x.caseId}:${stepMovesYauLast(x)}`),
    ).toEqual(["ins-flipped:F2", "ins-up-side:R U' R' F"]);
  });
});

describe("야우 엣지 여덟(축소법 처음 엣지 규칙)", () => {
  it("흰 십자까지 맞은 무작위 40개를 묶고, 걸음마다 흰 십자·센터가 그대로이며 x2·아래 층에서 내리기가 나오지 않는다", () => {
    for (const seed of SEEDS) {
      const s0 = stateForRule("4x4-yau-cross", seed);
      const r = runEdges444(s0);
      expect(goalMet(n, r.state, "edges-paired"), `${seed}`).toBe(true);
      let s = s0;
      for (const st of r.steps) {
        expect(["turn-over", "drop-down"]).not.toContain(st.caseId);
        s = play(s, stepMovesBig(st));
        expect(goalMet(n, s, "yau-cross"), `${seed} ${st.caseId}`).toBe(true);
      }
    }
  });
});

describe("야우 단원이 규칙과 같다", () => {
  const lesson = (id: string) =>
    YAU_444.lessons.find((l) => l.id === id) as Lesson;
  const steps = (id: string, kind: LessonStep["kind"]) =>
    lesson(id).steps.filter((s) => s.kind === kind);
  const withAlg = (id: string) =>
    lesson(id).steps.filter(
      (s) => (s.kind === "demo" || s.kind === "try") && s.alg,
    );

  it("십자 셋 단원의 시연·해 보기 모범 답 = 규칙이 그 상황에서 내는 수, 경우는 짝 방향 어긋남·위 층·위 층에 붙어 흰색이 위·같은 층", () => {
    const l = lesson("yau-cross3");
    expect(withAlg("yau-cross3").map((s) => s.alg)).toEqual([
      YAU_CROSS_PAIR_DEMO,
      YAU_CROSS_PAIR_TRY,
      YAU_CROSS_UP_DEMO,
      YAU_CROSS_DOWN_DEMO,
      YAU_CROSS_UP_WHITE_TRY,
      YAU_CROSS_FRONT_TRY,
      YAU_CROSS_CLEAR_TRY,
      YAU_CROSS_SAME_TRY,
      YAU_CROSS_LOW_TRY,
    ]);
    const ids = withAlg("yau-cross3").map((st) => {
      const start = stepStart(l, st, 1);
      const r = runYauCross(start);
      expect(r.steps.map(stepMovesYauCross).join(" ")).toBe(st.alg);
      // 흰-파랑 자리를 앞으로 쥔 십자 셋 상태로 끝난다
      expect(faceColors(n, r.state)).toEqual(
        faceColors(n, play(solvedCube(n), `${YAU_CROSS3_STATE} y2`)),
      );
      return r.steps.map((x) => x.caseId).join();
    });
    expect(ids).toEqual([
      "pair",
      "pair",
      "up,pair",
      "down-side,up,pair",
      "up-white-up",
      "down-front,pair",
      "down-front,pair",
      "same-layer,pair",
      "same-layer,pair",
    ]);
    // 같은 층 문제는 해 보기와 같은 화면이고, F2는 앞-오른쪽 줄 위 자리를 앞-왼쪽 줄 아래 자리로 보낸다
    const q = steps("yau-cross3", "quiz").find((x) =>
      x.quiz?.question.includes("F2"),
    ) as LessonStep;
    expect(q.setup).toEqual(withAlg("yau-cross3")[7]?.setup);
    expect(q.quiz?.choices[q.quiz.answer]).toBe("앞-왼쪽 줄 아래 자리");
  });

  it("옆 센터 단원의 시연·해 보기 모범 답 = 규칙이 그 상황에서 내는 수", () => {
    const side = lesson("yau-side-centers");
    const list = withAlg("yau-side-centers");
    expect(list.map((s) => s.alg)).toEqual([
      YAU_SIDE_DEMO,
      YAU_SIDE_TRY,
      YAU_SIDE_PARK_TRY,
      YAU_SIDE_LEFT_TRY,
      YAU_SIDE_TWO_TRY,
    ]);
    const ids = list.map((st) => {
      const start = stepStart(side, st, 1);
      const r = runYauSideCenters(start);
      expect(r.steps.map(stepMovesYau).join(" ")).toBe(st.alg);
      expect(goalMet(n, r.state, "yau-centers")).toBe(true);
      return r.steps.map((x) => `${x.caseId}:${x.hold}`).join();
    });
    // 글이 말하는 경우: 위-뒤 칸 → R, 위-앞 칸 → 쥐기 R2 뒤 R', 보내기 → 아래-뒤 칸(쥐기 R'), 둘 넣기(쥐기 없음)
    expect(ids).toEqual([
      "top-back:",
      "top-front:R2",
      "park:,bottom-back:R'",
      "top-front:,park:,bottom-back:R'",
      "top-two:",
    ]);
    // 둘 넣기 해 보기: 앞면·왼쪽 면이 다 맞고 뒷면 윗줄 두 칸이 주황(색 4)
    const two = stepStart(side, list[4] as LessonStep, 1);
    expect(sideCount(two, F, 2)).toBe(4);
    expect(sideCount(two, L, 1)).toBe(4);
    const col = faceColors(n, two);
    expect([col[B * 16 + 5], col[B * 16 + 6]]).toEqual([4, 4]);
    expect([col[R * 16 + 9], col[R * 16 + 10]]).not.toContain(4);
  });

  it("보내기 해 보기는 앞면에 빨강, 오른쪽 면에 초록이 다 모인 데서 시작한다", () => {
    const st = steps("yau-side-centers", "try")[1] as LessonStep;
    const s = stepStart(lesson("yau-side-centers"), st, 1);
    // 흰 면 아래(z2)로 쥐면 빨강(색 1)이 왼쪽 면의 제자리, 초록(색 2)이 앞면의 제자리
    expect(sideCount(s, F, 1)).toBe(4);
    expect(sideCount(s, R, 2)).toBe(4);
    expect(sideCount(s, B, 4)).toBeGreaterThan(0);
    // 보내기 문제: 같은 화면에서 2U 2D'를 치면 빨강 넷은 왼쪽 면, 초록 넷은 앞면
    const q = steps("yau-side-centers", "quiz").find((x) =>
      x.quiz?.question.includes("보내기"),
    ) as LessonStep;
    expect(q.setup).toEqual(st.setup);
    const parked = play(s, YAU_PARK);
    expect(sideCount(parked, L, 1)).toBe(4);
    expect(sideCount(parked, F, 2)).toBe(4);
    expect(q.quiz?.choices[q.quiz.answer]).toBe("왼쪽 면");
  });

  it("엣지 묶기 단원: 마지막 십자 엣지 시연·해 보기와 엣지 짝 시연 = 규칙이 낸 수", () => {
    const l = lesson("yau-edges");
    const list = withAlg("yau-edges");
    expect(list.map((s) => s.alg)).toEqual([
      YAU_LAST_DEMO,
      YAU_LAST_TRY,
      YAU_PAIR,
    ]);
    const [demo, tryLast, pairDemo] = list as LessonStep[];
    for (const [st, ids] of [
      [demo, ["ins-up-side"]],
      [tryLast, ["ins-lift", "ins-up-white-up"]],
    ] as const) {
      const r = runYauLastCross(stepStart(l, st as LessonStep, 1));
      expect(r.steps.map(stepMovesYauLast).join(" ")).toBe(st?.alg);
      expect(r.steps.map((x) => x.caseId)).toEqual(ids);
    }
    const s = stepStart(l, pairDemo as LessonStep, 1);
    const first = runEdges444(s).steps[0];
    expect(first?.caseId).toBe("low");
    expect(first && stepMovesBig(first)).toBe(YAU_PAIR);
    expect(goalMet(n, play(s, YAU_PAIR), "edges-paired")).toBe(true);
    expect(goalMet(n, play(s, YAU_PAIR), "yau-cross")).toBe(true);
  });

  it("십자 셋·옆 센터 단원의 시작 모양: 흰·노랑 센터와 십자 셋(옆 센터 안 맞음), 십자 셋 단원은 십자가 셋보다 적다", () => {
    const base = play(solvedCube(n), YAU_CROSS3_STATE);
    expect(goalMet(n, base, "yau-cross3")).toBe(true);
    expect(goalMet(n, base, "yau-cross")).toBe(false);
    expect(goalMet(n, base, "yau-centers")).toBe(false);
    for (const f of [R, F, L, B])
      for (const c of [0, 1, 2, 3, 4, 5])
        expect(sideCount(base, f, c)).toBeLessThan(4);
    for (const id of ["yau-cross3", "yau-side-centers"])
      for (const st of lesson(id).steps) {
        const s = stepStart(lesson(id), st, 1);
        expect(goalMet(n, s, "yau-ud-centers"), id).toBe(true);
        expect(goalMet(n, s, "yau-cross"), `${id} ${st.body}`).toBe(false);
        expect(goalMet(n, s, "yau-centers"), `${id} ${st.body}`).toBe(false);
        if (id === "yau-cross3")
          expect(goalMet(n, s, "yau-cross3"), st.body).toBe(false);
        else expect(goalMet(n, s, "yau-cross3"), st.body).toBe(true);
      }
  });
});

describe("긴 단계를 한 가지 목표씩 나눈 단계(docs/47 16-18)", () => {
  const lesson = (id: string) =>
    YAU_444.lessons.find((l) => l.id === id) as Lesson;
  const quizBy = (id: string, word: string) =>
    lesson(id).steps.find(
      (s) => s.kind === "quiz" && s.quiz?.question.includes(word),
    ) as LessonStep;
  const answer = (st: LessonStep) => st.quiz?.choices[st.quiz.answer];
  const startOf = (id: string, st: LessonStep) => stepStart(lesson(id), st, 1);
  const cell = (f: number, r: number, c: number) => f * 16 + r * 4 + c;

  it("한 수 해 보기는 바로 뒤 시연·해 보기 모범 답의 앞부분이다(쥐기 y2는 앞서 친 상황)", () => {
    for (const l of YAU_444.lessons)
      l.steps.forEach((st, i) => {
        if (st.kind !== "turn") return;
        const after = l.steps
          .slice(i + 1)
          .find((x) => x.kind === "demo" || x.kind === "try") as LessonStep;
        const s = stepStart(l, st, 1);
        const a = stepStart(l, after, 1);
        const held = after.alg?.startsWith("y2 ") ? play(a, "y2") : a;
        const rest = (after.alg ?? "").replace(/^y2 /, "");
        expect(faceColors(n, s), st.body).toEqual(faceColors(n, held));
        expect(rest.startsWith(st.alg as string), st.body).toBe(true);
      });
  });

  it("흰 십자 셋: 쥐기 문제 → 줄·칸 문제 → 2U' 한 수 → 짝짓기 시연", () => {
    expect(YAU_CROSS_PAIR_DEMO).toBe(`y2 ${YAU_CROSS_PAIR_HELD}`);
    const hold = quizBy("yau-cross3", "쥘까요");
    expect(answer(hold)).toBe("y2");
    const line = quizBy("yau-cross3", "어느 줄");
    // 쥐기 문제 화면에서 y2를 치면 줄·칸 문제 화면
    expect(faceColors(n, play(startOf("yau-cross3", hold), "y2"))).toEqual(
      faceColors(n, startOf("yau-cross3", line)),
    );
    const s = startOf("yau-cross3", line);
    const blue = whiteWings(s, 5);
    expect(blue.map((w) => w.line)).toEqual(["FL", "FL"]);
    expect(blue.map((w) => w.level).sort()).toEqual([0, 1]);
    expect(blue.every((w) => w.whiteFace === F)).toBe(true);
    expect(answer(line)).toBe("앞-왼쪽 줄");
    // 2U'는 위 자리 날개만 앞-오른쪽 줄로 옮긴다
    const turn = lesson("yau-cross3").steps.find(
      (x) => x.kind === "turn",
    ) as LessonStep;
    expect(turn.setup).toEqual(line.setup);
    const moved = whiteWings(play(s, turn.alg as string), 5);
    expect(moved.map((w) => `${w.line}${w.level}`).sort()).toEqual([
      "FL1",
      "FR0",
    ]);
  });

  it("옆 센터: 옮기지 않는 수 문제 → 2U 데려오기 한 수 → 데려온 칸 문제 → 옮기기 시연", () => {
    const sides = [R, F, L, B];
    const centers = (s: PuzzleState) => {
      const col = faceColors(n, s);
      return sides.flatMap((f) =>
        [1, 2].flatMap((r) => [1, 2].map((c) => col[cell(f, r, c)])),
      );
    };
    const scrambled = [1, 2, 3].map((seed) =>
      stateForRule("4x4-yau-cross3", seed),
    );
    const moveQuiz = quizBy("yau-side-centers", "옮기지 않는");
    expect(answer(moveQuiz)).toBe("U");
    for (const s of scrambled) {
      expect(centers(play(s, "U"))).toEqual(centers(s));
      expect(centers(play(s, "R"))).not.toEqual(centers(s));
      expect(centers(play(s, "2U"))).not.toEqual(centers(s));
    }
    // 데려오기 한 수: 뒷면 윗줄의 주황 센터 블럭(색 4)이 오른쪽 면 위-뒤 칸에
    const turn = lesson("yau-side-centers").steps.find(
      (x) => x.kind === "turn",
    ) as LessonStep;
    expect(turn.alg).toBe(YAU_BRING.top.B);
    const brought = play(startOf("yau-side-centers", turn), turn.alg as string);
    expect(faceColors(n, brought)[cell(R, 1, 2)]).toBe(4);
    // 데려온 칸: 그 면을 마주 보고 왼쪽 칸은 오른쪽 면 앞쪽 칸, 오른쪽 칸은 뒤쪽 칸, 줄은 그대로
    const FACE = { F, B, L } as const;
    for (const s of scrambled)
      for (const [row, r] of [
        ["top", 1],
        ["bottom", 2],
      ] as const)
        for (const face of ["F", "B", "L"] as const) {
          const before = faceColors(n, s);
          const after = faceColors(n, play(s, YAU_BRING[row][face]));
          for (const c of [1, 2])
            expect(after[cell(R, r, c)]).toBe(before[cell(FACE[face], r, c)]);
        }
    const cellQuiz = quizBy("yau-side-centers", "2U'로 데려오면");
    expect(cellQuiz.quiz?.question).toContain(YAU_BRING.top.F);
    expect(answer(cellQuiz)).toBe("위-앞 칸");
  });

  it("엣지 묶기: 야우에 나오지 않는 수 문제 → Dw 한 수", () => {
    const q = quizBy("yau-edges", "나오지 않는");
    expect(answer(q)).toBe("x2로 큐브 뒤집기");
    const ids = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5])
      for (const st of runEdges444(stateForRule("4x4-yau-cross", seed)).steps)
        ids.add(st.caseId);
    expect(ids.has("turn-over")).toBe(false);
    expect(ids.has("store")).toBe(true);
    expect(ids.has("low")).toBe(true);
  });
});

describe("답은 문제를 풀어야 알고, 앞에 보인 경우만 목록에 둔다(docs/47 16-19)", () => {
  const lesson = (id: string) =>
    YAU_444.lessons.find((l) => l.id === id) as Lesson;
  const quizBy = (id: string, word: string) =>
    lesson(id).steps.find(
      (s) => s.kind === "quiz" && s.quiz?.question.includes(word),
    ) as LessonStep;
  const answer = (st: LessonStep) => st.quiz?.choices[st.quiz.answer] as string;
  const startOf = (id: string, st: LessonStep) => stepStart(lesson(id), st, 1);
  const cell = (f: number, r: number, c: number) => f * 16 + r * 4 + c;
  const next = (id: string, st: LessonStep) => {
    const steps = lesson(id).steps;
    return steps[steps.indexOf(st) + 1] as LessonStep;
  };

  it("본문은 답을 말하지 않는다(흰 십자 셋 F2·위 층 흰색 위, 옆 센터 보내기·대각선 칸, 마지막 십자 엣지 쥐기·F2)", () => {
    for (const [id, word] of [
      ["yau-cross3", "그 날개는 어디로"],
      ["yau-cross3", "흰색이 아래를 보며"],
      ["yau-side-centers", "빨강 센터 블럭 넷은"],
      ["yau-side-centers", "새로 올라와"],
      ["yau-edges", "비운 자리를 앞으로"],
      ["yau-edges", "F2를 치면 흰-주황"],
    ] as const) {
      const q = quizBy(id, word);
      expect(q, word).toBeDefined();
      expect(q.body, word).not.toContain(answer(q));
    }
    // 보내기 문제 본문은 앞면 것이 어디로 가는지 말하지 않는다(오른쪽 면 → 앞면만)
    expect(quizBy("yau-side-centers", "빨강 센터 블럭 넷은").body).not.toMatch(
      /앞면에 있던|왼쪽 면으로/,
    );
    expect(quizBy("yau-cross3", "그 날개는 어디로").body).not.toMatch(
      /다른 높이|아래 자리로/,
    );
  });

  it("흰 십자 셋: 위 층에 붙어 흰색이 위 → U2 뒤 F2만 흰색이 아래로 넣고, 바로 뒤 해 보기가 같은 화면이다", () => {
    const q = quizBy("yau-cross3", "흰색이 아래를 보며");
    expect(answer(q)).toBe("F2");
    const s = startOf("yau-cross3", q);
    const blue = whiteWings(s, 5);
    expect(blue.map((w) => w.line)).toEqual(["UB", "UB"]);
    expect(blue.every((w) => w.whiteFace === U)).toBe(true);
    const put = (alg: string) =>
      whiteWings(play(s, alg), 5).every(
        (w) => w.line === "DF" && w.whiteFace === D,
      );
    expect(put("U2 F2")).toBe(true);
    expect(put("U2 F")).toBe(false);
    expect(put("U2 F'")).toBe(false);
    const t = next("yau-cross3", q);
    expect(t.kind).toBe("try");
    expect(t.setup).toEqual(q.setup);
    expect(t.alg).toBe(YAU_CROSS_UP_WHITE_TRY);
    // 이 경우를 보인 단계가 마지막 목록(②)보다 앞에 있다
    const steps = lesson("yau-cross3").steps;
    const last = steps[steps.length - 1] as LessonStep;
    expect(last.body).toContain("흰색이 위면 U로 위-앞에 두고 F2");
    expect(steps.indexOf(q)).toBeLessThan(steps.length - 1);
  });

  it("옆 센터: 옮기기 R은 데려온 칸의 대각선(아래-앞) 블럭을 윗줄로 올리고, 비우기는 R2만 대각선(아래-뒤)에 다른 블럭을 둔다", () => {
    const diag = quizBy("yau-side-centers", "새로 올라와");
    expect(answer(diag)).toBe("아래-앞 칸");
    const s = startOf("yau-side-centers", diag);
    const before = faceColors(n, s);
    const after = faceColors(n, play(s, `${YAU_BRING.top.B} R`));
    expect(after[cell(R, 1, 1)]).toBe(before[cell(R, 2, 1)]);

    const empty = quizBy("yau-side-centers", "비우기로");
    expect(answer(empty)).toBe("R2");
    const e = startOf("yau-side-centers", empty);
    const ORANGE = 4;
    // 2U로 데려오면 주황이 위-앞 칸에, 그 대각선은 아래-뒤 칸
    expect(faceColors(n, play(e, YAU_BRING.top.B))[cell(R, 1, 1)]).toBe(ORANGE);
    for (const [hold, ok] of [
      ["R", false],
      ["R'", false],
      ["R2", true],
    ] as const)
      expect(faceColors(n, play(e, hold))[cell(R, 2, 2)] !== ORANGE, hold).toBe(
        ok,
      );
    // 비우기 문제 바로 뒤 해 보기가 같은 화면이고 R2로 시작한다
    const t = next("yau-side-centers", empty);
    expect(t.setup).toEqual(empty.setup);
    expect(t.alg).toBe(YAU_SIDE_TRY);
    expect(t.alg?.startsWith("R2 ")).toBe(true);
  });

  it("마지막 십자 엣지: 비운 자리가 오른쪽이면 y, 흰색이 옆인 흰-주황을 U' F2로 넣으면 흰색이 앞을 본다", () => {
    const hold = quizBy("yau-edges", "비운 자리를 앞으로");
    expect(answer(hold)).toBe("y");
    const s = startOf("yau-edges", hold);
    // 비운 자리(아래-오른쪽)에 흰-주황이 없고, y를 치면 다음 문제 화면
    expect(
      whiteWings(s, 4).some((w) => w.line === "DR" && w.whiteFace === D),
    ).toBe(false);
    const flipQ = quizBy("yau-edges", "F2를 치면 흰-주황");
    expect(next("yau-edges", hold)).toBe(flipQ);
    expect(faceColors(n, play(s, "y"))).toEqual(
      faceColors(n, startOf("yau-edges", flipQ)),
    );
    expect(answer(flipQ)).toContain("뒤집혀");
    const f = startOf("yau-edges", flipQ);
    const wings = whiteWings(play(f, "U' F2"), 4);
    expect(wings.every((w) => w.line === "DF" && w.whiteFace === F)).toBe(true);
    // 바로 뒤 시연은 같은 화면에서 흰색이 옆일 때의 넣기
    const demo = next("yau-edges", flipQ);
    expect(demo.kind).toBe("demo");
    expect(demo.setup).toEqual(flipQ.setup);
    expect(demo.alg).toBe(YAU_LAST_DEMO);
  });
});

describe("목록의 경우는 모두 앞에서 보이고, 긴 단계는 한 목표씩(docs/47 16-20)", () => {
  const lesson = (id: string) =>
    YAU_444.lessons.find((l) => l.id === id) as Lesson;
  const answer = (st: LessonStep) => st.quiz?.choices[st.quiz.answer] as string;
  const startOf = (id: string, st: LessonStep) => stepStart(lesson(id), st, 1);
  const quizBy = (id: string, word: string) => {
    const q = lesson(id).steps.find(
      (s) => s.kind === "quiz" && s.quiz?.question.includes(word),
    );
    if (!q) throw new Error(`문제 없음: ${word}`);
    return q;
  };
  const next = (id: string, st: LessonStep) => {
    const steps = lesson(id).steps;
    return steps[steps.indexOf(st) + 1] as LessonStep;
  };
  const cell = (f: number, r: number, c: number) => f * 16 + r * 4 + c;
  const wingsAt = (s: PuzzleState, color: number) =>
    whiteWings(s, color)
      .map((w) => `${w.line}${w.level}`)
      .sort();
  /** 마지막 해 보기(무작위)보다 앞의 단계 */
  const before = (id: string) => {
    const steps = lesson(id).steps;
    return steps.slice(0, steps.length - 1);
  };
  const isMove = (x: string) => /^([0-9]?[URFDLBMESxyz]w?['2]?\s?)+$/.test(x);

  it("야우 문제의 본문은 답(공식이 아닌 보기)을 말하지 않는다", () => {
    for (const l of YAU_444.lessons)
      for (const st of l.steps) {
        if (st.kind !== "quiz") continue;
        const a = answer(st);
        if (isMove(a)) continue;
        expect(st.body, `${l.id}: ${st.quiz?.question}`).not.toContain(a);
      }
  });

  it("야우 글은 「줄」·「칸」을 한 뜻으로 쓴다(윗줄·아랫줄·위 칸·아래 칸·한 줄로 없음)", () => {
    const texts = YAU_444.lessons.flatMap((l) => [
      l.summary,
      ...l.steps.flatMap((s) => [
        s.body,
        s.passedText ?? "",
        s.quiz?.question ?? "",
        s.quiz?.why ?? "",
        ...(s.quiz?.choices ?? []),
      ]),
    ]);
    for (const t of texts)
      expect(t).not.toMatch(
        /윗줄|아랫줄|(?<!오른쪽|왼쪽) (위|아래) 칸|^(위|아래) 칸|한 줄로|한 줄이|한 줄에|묶은 줄|같은 칸|다른 칸|칸이 다르/,
      );
  });

  it("흰 십자 셋: 목록의 경우 여섯과 비키기·둘 다 아래 자리를 마지막 해 보기 앞에서 보인다", () => {
    const seen = new Set<string>();
    for (const st of before("yau-cross3")) {
      if (st.kind === "look") continue;
      const s = startOf("yau-cross3", st);
      const r = runYauCross(s);
      const steps = st.kind === "quiz" ? r.steps.slice(0, 1) : r.steps;
      let cur = s;
      for (const x of steps) {
        seen.add(x.caseId);
        // 비키기(2U2·2D2)를 친 넣기
        if (/2[UD]2/.test(x.hold) && x.alg === "F") seen.add("clear");
        if (x.caseId === "same-layer") {
          const rot = x.hold.startsWith("y2") ? "y2" : "";
          const lv = whiteWings(play(cur, rot), 5).map((w) => w.level);
          seen.add(`same-${lv[0]}`);
        }
        cur = play(cur, stepMovesYauCross(x));
      }
    }
    for (const id of [
      ...YAU_CROSS_CASES.map((c) => c.id),
      "clear",
      "same-0",
      "same-1",
    ])
      expect(seen.has(id), id).toBe(true);
  });

  it("흰 십자 셋: 첫 찾기를 나눈 둘러보기·제자리 문제", () => {
    const steps = lesson("yau-cross3").steps;
    const look = steps[0] as LessonStep;
    expect(look.kind).toBe("look");
    const s = startOf("yau-cross3", look);
    // 흰 센터가 위, z2를 치면 아래
    expect(faceColors(n, s)[cell(U, 1, 1)]).toBe(0);
    expect(faceColors(n, play(s, "z2"))[cell(D, 1, 1)]).toBe(0);
    const home = steps[1] as LessonStep;
    expect(answer(home)).toBe("뒤");
    const t = yauCrossTarget(startOf("yau-cross3", home));
    expect(t).toEqual({ color: 5, rot: "y2" });
  });

  it("흰 십자 셋: 짝짓기 시연 앞의 2D 문제·F 문제는 2U' 뒤의 화면에서 하나만 맞는다", () => {
    const d = quizBy("yau-cross3", "아래 자리 날개도");
    const s = startOf("yau-cross3", d);
    // 2U' 한 수 해 보기를 친 뒤의 화면
    const turn = lesson("yau-cross3").steps.find(
      (x) => x.kind === "turn",
    ) as LessonStep;
    expect(faceColors(n, s)).toEqual(
      faceColors(n, play(startOf("yau-cross3", turn), "2U'")),
    );
    for (const m of ["2D", "2D'", "2D2"])
      expect(wingsAt(play(s, m), 5).join() === "FR0,FR1", m).toBe(
        m === answer(d),
      );
    const f = next("yau-cross3", d);
    expect(faceColors(n, startOf("yau-cross3", f))).toEqual(
      faceColors(n, play(s, "2D")),
    );
    for (const m of ["F", "F'", "F2"]) {
      const w = whiteWings(play(startOf("yau-cross3", f), m), 5);
      expect(
        w.every((x) => x.line === "DF" && x.whiteFace === D),
        m,
      ).toBe(m === answer(f));
    }
    expect(next("yau-cross3", f).alg).toBe(YAU_CROSS_PAIR_DEMO);
  });

  it("흰 십자 셋: 줄 고르기 문제 → 같은 큐브 해 보기", () => {
    const q = quizBy("yau-cross3", "흰색이 옆을 볼까요");
    expect(answer(q)).toBe("앞-왼쪽 줄");
    const s = startOf("yau-cross3", q);
    expect(
      whiteWings(s, 5).every((w) => w.line === "FR" && w.whiteFace === F),
    ).toBe(true);
    expect(
      whiteWings(play(s, "2U 2D'"), 5).every(
        (w) => w.line === "FL" && w.whiteFace === L,
      ),
    ).toBe(true);
    const t = next("yau-cross3", q);
    expect(t.alg).toBe(YAU_CROSS_PAIR_TRY);
    expect(faceColors(n, play(startOf("yau-cross3", t), "y2"))).toEqual(
      faceColors(n, s),
    );
  });

  it("흰 십자 셋: 비키기 문제는 2D2만 다른 날개를 뒤쪽 줄로, 둘 다 아래 자리 문제는 2D만 맞다", () => {
    const c = quizBy("yau-cross3", "무엇으로 비킬까요");
    const s = startOf("yau-cross3", c);
    expect(wingsAt(s, 5)).toEqual(["DF0", "FR1"]);
    expect(answer(c)).toBe("2D2");
    expect(wingsAt(play(s, "2D2"), 5)).toEqual(["BL1", "DF0"]);
    expect(wingsAt(play(s, "2U2"), 5)).toEqual(["DF0", "FR1"]);
    let t = next("yau-cross3", c);
    expect(t.alg).toBe(YAU_CROSS_CLEAR_TRY);
    expect(faceColors(n, play(startOf("yau-cross3", t), "y2"))).toEqual(
      faceColors(n, s),
    );

    const low = quizBy("yau-cross3", "F2를 치기 전에");
    const l = startOf("yau-cross3", low);
    expect(wingsAt(l, 5)).toEqual(["FL1", "FR1"]);
    expect(answer(low)).toBe("2D");
    // 앞-오른쪽 줄에 날개가 있고 앞-왼쪽 줄에는 없어야 F2가 하나만 보낸다
    const ok = (m: string) => {
      const w = wingsAt(play(l, m), 5);
      return w.includes("FR1") && !w.some((x) => x.startsWith("FL"));
    };
    expect(ok("")).toBe(false);
    expect(ok("2D")).toBe(true);
    expect(ok("2D'")).toBe(false);
    expect(wingsAt(play(l, "2D F2"), 5)).toEqual(["BR1", "FL0"]);
    t = next("yau-cross3", low);
    expect(t.alg).toBe(YAU_CROSS_LOW_TRY);
    expect(faceColors(n, play(startOf("yau-cross3", t), "y2"))).toEqual(
      faceColors(n, l),
    );
  });

  it("옆 센터: 칸 이름 문제, 왼쪽 면에서 데려오기, 둘 넣기 R2, 고르는 차례 문제", () => {
    const ORANGE = 4;
    const GREEN = 2;
    const RED = 1;
    const name = quizBy("yau-side-centers", "주황이 아닌 센터 블럭은");
    const nc = faceColors(n, startOf("yau-side-centers", name));
    expect(answer(name)).toBe("아래-앞 칸");
    expect([nc[cell(R, 1, 1)], nc[cell(R, 1, 2)], nc[cell(R, 2, 2)]]).toEqual([
      ORANGE,
      ORANGE,
      ORANGE,
    ]);
    expect(nc[cell(R, 2, 1)]).not.toBe(ORANGE);

    const left = quizBy("yau-side-centers", "왼쪽 면 위 두 칸의 블럭");
    const ls = startOf("yau-side-centers", left);
    expect(answer(left)).toBe("2U2");
    expect(sideCount(ls, R, GREEN)).toBe(3);
    expect(sideCount(ls, B, GREEN)).toBe(0);
    expect(faceColors(n, ls)[cell(L, 1, 1)]).toBe(GREEN);
    expect(faceColors(n, play(ls, "2U2"))[cell(R, 1, 1)]).toBe(GREEN);
    const st = nextYauSideStep(ls);
    expect(st && `${st.caseId}:${st.from}:${stepMovesYau(st)}`).toBe(
      "top-front:L:2U2 R' 2U2",
    );
    expect(next("yau-side-centers", left).alg).toBe(YAU_SIDE_LEFT_TRY);
    // 왼쪽 면 넣기 뒤가 보내기 해 보기의 처음 모습
    const park = lesson("yau-side-centers").steps.find(
      (x) => x.alg === YAU_SIDE_PARK_TRY,
    ) as LessonStep;
    expect(faceColors(n, play(ls, "2U2 R' 2U2"))).toEqual(
      faceColors(n, startOf("yau-side-centers", park)),
    );

    const two = quizBy("yau-side-centers", "R2를 치면");
    const ts = startOf("yau-side-centers", two);
    expect(answer(two)).toBe("오른쪽 면 아래 두 칸");
    const after = faceColors(n, play(ts, "2U R2"));
    expect([after[cell(R, 2, 1)], after[cell(R, 2, 2)]]).toEqual([
      ORANGE,
      ORANGE,
    ]);
    expect(next("yau-side-centers", two).alg).toBe(YAU_SIDE_TWO_TRY);

    const order = quizBy("yau-side-centers", "첫 넣기는");
    const os = startOf("yau-side-centers", order);
    expect(answer(order)).toBe("왼쪽 면 아래 두 칸 둘 넣기");
    const first = nextYauSideStep(os);
    expect(first && `${first.caseId}:${first.from}`).toBe("bottom-two:L");
    // 앞면 위 두 칸도 빨강 둘(차례가 늦어 고르지 않는 보기)
    const oc = faceColors(n, os);
    expect([oc[cell(F, 1, 1)], oc[cell(F, 1, 2)]]).toEqual([RED, RED]);
    expect(sideCount(os, B, RED)).toBe(0);
  });

  it("옆 센터: 마지막 해 보기 앞에서 둘 넣기·보내기·하나 넣기, 뒷면·왼쪽 면에서 데려오기를 보인다", () => {
    const cases = new Set<string>();
    const froms = new Set<string>();
    for (const st of before("yau-side-centers")) {
      const s = startOf("yau-side-centers", st);
      const r = runYauSideCenters(s);
      const steps = st.kind === "quiz" ? r.steps.slice(0, 1) : r.steps;
      for (const x of steps) {
        cases.add(x.caseId);
        if (x.from) froms.add(x.from);
      }
    }
    for (const id of [
      "top-front",
      "top-back",
      "bottom-back",
      "top-two",
      "bottom-two",
      "park",
    ])
      expect(cases.has(id), id).toBe(true);
    expect(froms.has("B")).toBe(true);
    expect(froms.has("L")).toBe(true);
  });

  it("마지막 십자 엣지: 떨어진 날개 문제 넷은 그 경우의 수 하나가 답이고, 마지막 해 보기 앞에서 목록의 경우를 모두 보인다", () => {
    const at = (word: string) => {
      const q = quizBy("yau-edges", word);
      return { q, s: startOf("yau-edges", q) };
    };
    const first = (s: PuzzleState) => {
      const st = nextYauLastCrossStep(s);
      return st && `${st.caseId}:${st.hold}:${st.alg}`;
    };
    const mid = at("어느 수로 넣을까요");
    expect(first(mid.s)).toBe("ins-mid::F");
    expect(answer(mid.q)).toBe("F");

    const down = at("위-앞 엣지 자리로 올리는");
    expect(first(down.s)).toBe("out-front::F2");
    expect(answer(down.q)).toBe("F2");
    const up = at("U2로 위-뒤에 두고");
    expect(next("yau-edges", down.q)).toBe(up.q);
    expect(faceColors(n, play(down.s, "F2"))).toEqual(faceColors(n, up.s));
    expect(first(up.s)).toBe("drop-up:U2:L' U' L");
    expect(wingsAt(play(up.s, "U2 L' U' L"), 4)).toEqual(["FL1", "FR1"]);
    expect(answer(up.q)).toBe("앞-왼쪽 줄 아래 자리");

    const top = at("위-뒤의 날개는");
    expect(first(top.s)).toBe("bring::R U R'");
    expect(wingsAt(top.s, 4)).toEqual(["UB1", "UF1"]);
    expect(wingsAt(play(top.s, "R U R'"), 4)[0]).toMatch(/^FR/);
    expect(answer(top.q)).toBe("앞-오른쪽 줄");

    const flipQ = at("엣지 뒤집기 R U R' F R' F' R을 치면");
    expect(first(flipQ.s)).toBe("flip::R U R' F R' F' R");
    expect(wingsAt(flipQ.s, 4)).toEqual(["FL1", "FR0"]);
    expect(wingsAt(play(flipQ.s, "R U R' F R' F' R"), 4)).toEqual([
      "FL1",
      "FR1",
    ]);
    expect(answer(flipQ.q)).toBe("앞-오른쪽 줄 아래 자리");
    // 문제 화면도 센터와 흰 십자 셋이 맞은 상태
    for (const s of [mid.s, down.s, up.s, top.s, flipQ.s])
      expect(goalMet(n, s, "yau-centers")).toBe(true);

    const steps = lesson("yau-edges").steps;
    const listTry = steps.find(
      (x) => x.kind === "try" && x.setup && "rule" in x.setup,
    ) as LessonStep;
    const seen = new Set<string>();
    for (const st of steps.slice(0, steps.indexOf(listTry))) {
      const s = startOf("yau-edges", st);
      if (goalMet(n, s, "yau-cross")) continue;
      const r = runYauLastCross(s);
      const run = st.kind === "quiz" ? r.steps.slice(0, 1) : r.steps;
      for (const x of run) seen.add(x.caseId);
    }
    // 나) Dw·Uw 경우는 축소법에서 배우고 이 단원 뒤 Dw 시연에서 다시 본다
    for (const id of [
      "ins-up-white-up",
      "ins-up-side",
      "ins-mid",
      "ins-lift",
      "out-front",
      "bring",
      "drop-up",
      "flip",
    ])
      expect(seen.has(id), id).toBe(true);
  });
});
