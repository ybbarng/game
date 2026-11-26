// 코너 방향 먼저(신광사 해법) 강(lessons-twist-first.ts)의 시연·해 보기 모범 답이 경우별 정해진 길(twist-first-path.ts)과
// 같고, 고르기 문제의 답이 그림 상황과 맞는지 엔진으로 본다(docs/47 16-33).
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { courseById } from "./courses";
import { goalMet } from "./judge";
import { TWIST_FIRST_333 } from "./lessons-twist-first";
import {
  CORNER_A,
  CORNER_B,
  cornerYellows,
  nextTwistFirstStep,
  placedCorners,
  runTwistFirstStage,
  type TwistFirstStageId,
  twistFirstMoves,
} from "./twist-first-path";
import type { LessonStep } from "./types";

const STAGE: Record<string, TwistFirstStageId> = {
  "333-tf-twist": "twist",
  "333-tf-place": "place",
};
const norm = (alg: string) => alg.trim().split(/\s+/).join(" ");
const stateOf = (step: LessonStep): PuzzleState =>
  applyMoves(
    3,
    solvedCube(3),
    parseMoves(3, (step.setup as { alg: string }).alg),
  );
const lesson = (id: string) => TWIST_FIRST_333.lessons.find((l) => l.id === id);
const stepWith = (id: string, text: string) =>
  lesson(id)?.steps.find((s) => s.body.includes(text)) as LessonStep;

describe("강 모범 답 = 경우별 정해진 길", () => {
  for (const l of TWIST_FIRST_333.lessons) {
    const stage = STAGE[l.id] as TwistFirstStageId;
    l.steps.forEach((step, i) => {
      if (!step.alg || !step.setup || !("alg" in step.setup)) return;
      it(`${l.title} ${i + 1}번(${step.kind})`, () => {
        const r = runTwistFirstStage(stage, stateOf(step));
        expect(norm(r.steps.map(twistFirstMoves).join(" "))).toBe(
          norm(step.alg as string),
        );
        if (step.goal) expect(goalMet(3, r.state, step.goal)).toBe(true);
      });
    });
  }

  it("해 보기가 넉넉하다: 코너 방향 여덟 이상(모양마다 하나 이상), 코너 위치 다섯 이상", () => {
    const tries = (id: string) =>
      lesson(id)?.steps.filter((s) => s.kind === "try").length ?? 0;
    expect(tries("333-tf-twist")).toBeGreaterThanOrEqual(8);
    expect(tries("333-tf-place")).toBeGreaterThanOrEqual(5);
  });

  it("코너 방향 해 보기는 일곱 경우를 모두 한 번 이상 지난다", () => {
    const seen = new Set<string>();
    for (const s of lesson("333-tf-twist")?.steps ?? []) {
      if (s.kind !== "try" || !s.setup || !("alg" in s.setup)) continue;
      for (const st of runTwistFirstStage("twist", stateOf(s)).steps)
        seen.add(st.caseId);
    }
    expect([...seen].sort()).toEqual(
      [
        "base",
        "fish",
        "side",
        "front",
        "diagonal",
        "none-back",
        "none-sides",
      ].sort(),
    );
  });

  it("마지막 해 보기는 그 걸음 연습 섞기로 아무 경우나 낸다", () => {
    const last = (id: string) => lesson(id)?.steps.at(-1)?.setup;
    expect([last("333-tf-twist"), last("333-tf-place")]).toEqual([
      { rule: "ll-edges-solved" },
      { rule: "ll-corners-unplaced" },
    ]);
  });
});

describe("고르기 문제의 답 = 그림 상황", () => {
  it("코너 방향 첫 쪽: 위를 보는 노란색은 앞-왼쪽 위 하나(기본형)", () => {
    const s = stateOf(lesson("333-tf-twist")?.steps[0] as LessonStep);
    // 앞-오른쪽, 앞-왼쪽, 뒤-왼쪽, 뒤-오른쪽 위
    expect(cornerYellows(s)).toEqual(["F", "U", "B", "R"]);
    expect(nextTwistFirstStep("twist", s)?.caseId).toBe("base");
  });

  it("하나짜리 쪽: 위를 보는 블럭이 앞-왼쪽 위이고 앞-오른쪽 위 노란색은 오른쪽", () => {
    const s = stateOf(stepWith("333-tf-twist", "기본형이 아니에요"));
    expect(cornerYellows(s).slice(0, 2)).toEqual(["R", "U"]);
  });

  it("관계도 쪽: 둘인 모양은 공식 세 번", () => {
    const s = stateOf(stepWith("333-tf-twist", "관계도예요"));
    expect(runTwistFirstStage("twist", s).steps.length).toBe(3);
  });

  it("코너 위치 첫 쪽: 제자리 코너 블럭은 앞-오른쪽 위 하나", () => {
    const s = stateOf(lesson("333-tf-place")?.steps[0] as LessonStep);
    expect(placedCorners(s)).toEqual([0]);
  });

  it("B 고르기 쪽: 제자리는 앞-왼쪽 위 하나이고 B 한 번이면 다 맞는다", () => {
    const s = stateOf(stepWith("333-tf-place", "반시계 방향으로 돌려야 해요"));
    expect(placedCorners(s)).toEqual([1]);
    expect(
      goalMet(3, applyMoves(3, s, parseMoves(3, CORNER_B)), "solved"),
    ).toBe(true);
  });

  it("제자리 없음 쪽: 제자리 코너 블럭이 없고, 어느 쪽으로 쥐어도 A 한 번이면 꼭 하나가 생긴다", () => {
    const s = stateOf(stepWith("333-tf-place", "하나도 없을 때가 있어요"));
    expect(placedCorners(s)).toEqual([]);
    for (const y of ["", "y", "y2", "y'"]) {
      const t = applyMoves(3, s, parseMoves(3, `${y} ${CORNER_A}`));
      expect(placedCorners(t).length, y).toBe(1);
    }
  });
});

describe("글", () => {
  const texts = () =>
    (courseById("333-twist-first")?.lessons ?? []).flatMap((l) => [
      l.summary,
      ...l.steps.flatMap((s) => [
        s.body,
        s.quiz?.question ?? "",
        s.quiz?.why ?? "",
        ...(s.quiz?.choices ?? []),
        ...(s.chunks?.map((c) => c.says) ?? []),
      ]),
    ]);

  it("「될 때까지」·「최대」·「한두 번」 같은 끝없는 말이 없다", () => {
    const words = /때까지|최대|한두 번|알아서|적당히|잘 보고/;
    expect(texts().filter((t) => words.test(t))).toEqual([]);
  });

  it("전문 이름(퍼뮤·수네·섹시 무브·OLL·PLL·헤드라이트)을 쓰지 않는다", () => {
    const words = /퍼뮤|수네|섹시|OLL|PLL|헤드라이트|permutation/i;
    expect(texts().filter((t) => words.test(t))).toEqual([]);
  });

  it("강·쪽 첫머리를 틀 문장(「앞 단원에서」·「이 과정에서는」·「화면의 큐브는」)으로 열지 않는다", () => {
    const frame = /앞 단원에서|이 과정에서는|화면의 큐브는|이 단원에서는/;
    expect(texts().filter((t) => frame.test(t))).toEqual([]);
  });

  it("강의 첫머리에 신광사 큐브 설명서의 해법이라는 것을 밝힌다", () => {
    expect(courseById("333-twist-first")?.summary).toContain("신광사");
    expect(lesson("333-tf-twist")?.steps[0]?.body).toContain("신광사");
  });
});
