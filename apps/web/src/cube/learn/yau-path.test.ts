// 4×4 야우 옆 센터 넷의 경우별 정해진 길(yau-path.ts): 흰·노랑 센터와 흰 십자 셋만 맞은 무작위 상태를
// 규칙만으로 끝내고, 공식마다 지킬 조각이 그대로인지, 단원 글·모범 답이 규칙과 같은지 엔진으로 본다.
import { cubeTopology, faceColors, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { type Pick, playN } from "./big-path";
import { goalMet, stateForRule, stepStart } from "./judge";
import {
  YAU_444,
  YAU_CROSS_PAIR_DEMO,
  YAU_CROSS_PAIR_TRY,
  YAU_CROSS3_STATE,
  YAU_SIDE_DEMO,
  YAU_SIDE_PARK_TRY,
  YAU_SIDE_TRY,
} from "./lessons-yau";
import { invertAlg, setupFor } from "./notation";
import type { Lesson, LessonStep } from "./types";
import {
  nextYauSideStep,
  runYauSideCenters,
  sideCount,
  stepMovesYau,
  YAU_BRING,
  YAU_FACES,
  YAU_PARK,
  YAU_SIDE_CASES,
} from "./yau-path";

const { U, R, F, D, L, B } = YAU_FACES;
const n = 4;
const play = (s: PuzzleState, alg: string) => playN(n, s, alg);

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
};

const randomStart = (seed: number) => stateForRule("4x4-yau-cross3", seed);
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe("야우 옆 센터 넷", () => {
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

  it("공식 뒤마다 흰·노랑 센터와 흰 십자 셋이 그대로이고, 넣기는 오른쪽 면의 그 색을 꼭 하나 늘린다", () => {
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
        } else expect(sideCount(s, R, st.color)).toBe(before + 1);
      }
    }
  });

  it("넣기는 「쥐기 R」 + 「데려오기 R·R' 되돌리기」, 보내기는 2U 2D'뿐이다", () => {
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

describe("야우 단원이 규칙과 같다", () => {
  const lesson = (id: string) =>
    YAU_444.lessons.find((l) => l.id === id) as Lesson;
  const steps = (id: string, kind: LessonStep["kind"]) =>
    lesson(id).steps.filter((s) => s.kind === kind);
  const solveText = (s: PuzzleState) =>
    runYauSideCenters(s).steps.map(stepMovesYau).join(" ");

  it("옆 센터 단원의 시연·해 보기 모범 답 = 규칙이 그 상황에서 내는 수", () => {
    const side = lesson("yau-side-centers");
    const withAlg = side.steps.filter(
      (s) => (s.kind === "demo" || s.kind === "try") && s.alg,
    );
    expect(withAlg.map((s) => s.alg)).toEqual([
      YAU_SIDE_DEMO,
      YAU_SIDE_TRY,
      YAU_SIDE_PARK_TRY,
    ]);
    for (const st of withAlg) {
      const start = stepStart(side, st, 1);
      expect(solveText(start)).toBe(st.alg);
      expect(goalMet(n, play(start, st.alg as string), "yau-centers")).toBe(
        true,
      );
    }
    // 글이 말하는 경우: 위-뒤 칸 → R, 위-앞 칸 → 쥐기 R2 뒤 R', 보내기 → 아래-뒤 칸(쥐기 R')
    const ids = withAlg.map((st) =>
      runYauSideCenters(stepStart(side, st, 1))
        .steps.map((x) => `${x.caseId}:${x.hold}`)
        .join(),
    );
    expect(ids).toEqual(["top-back:", "top-front:R2", "park:,bottom-back:R'"]);
  });

  it("보내기 해 보기는 앞면에 빨강, 오른쪽 면에 초록이 다 모인 데서 시작한다", () => {
    const st = steps("yau-side-centers", "try")[1] as LessonStep;
    const s = stepStart(lesson("yau-side-centers"), st, 1);
    // 흰 면 아래(z2)로 쥐면 빨강(색 1)이 왼쪽 면의 제자리, 초록(색 2)이 앞면의 제자리
    expect(sideCount(s, F, 1)).toBe(4);
    expect(sideCount(s, R, 2)).toBe(4);
    expect(sideCount(s, B, 4)).toBeGreaterThan(0);
    // 보내기 문제: 같은 화면에서 2U 2D'를 치면 빨강 넷은 왼쪽 면, 초록 넷은 앞면
    const q = steps("yau-side-centers", "quiz")[1] as LessonStep;
    expect(q.setup).toEqual(st.setup);
    const parked = play(s, YAU_PARK);
    expect(sideCount(parked, L, 1)).toBe(4);
    expect(sideCount(parked, F, 2)).toBe(4);
    expect(q.quiz?.choices[q.quiz.answer]).toBe("왼쪽 면");
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

  it("십자 셋 단원의 짝짓기 수는 십자 셋을 만들고 오른쪽 자리를 비운다", () => {
    for (const alg of [YAU_CROSS_PAIR_DEMO, YAU_CROSS_PAIR_TRY]) {
      const start = play(solvedCube(n), setupFor(alg, YAU_CROSS3_STATE));
      const end = play(start, alg);
      expect(faceColors(n, end)).toEqual(
        faceColors(n, play(solvedCube(n), YAU_CROSS3_STATE)),
      );
      expect(goalMet(n, end, "yau-cross3")).toBe(true);
      expect(goalMet(n, end, "yau-cross")).toBe(false);
    }
  });
});
