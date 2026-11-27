// 코너 방향 먼저(신광사 해법) 강(lessons-twist-first.ts)의 시연·해 보기 모범 답이 경우별 정해진 길(twist-first-path.ts)과
// 같고, 고르기 문제의 답이 그림 상황과 맞는지 엔진으로 본다(docs/47 16-33).
import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { splitMoveText } from "../keys/move-keys";
import { courseById } from "./courses";
import { goalMet } from "./judge";
import { TWIST_FIRST_333 } from "./lessons-twist-first";
import {
  CORNER_A,
  CORNER_B,
  cornerYellows,
  edgesMatched,
  edgesUp,
  nextTwistFirstStep,
  placedCorners,
  runTwistFirstStage,
  TWIST_FIRST_STAGES,
  type TwistFirstStageId,
  twistFirstMoves,
} from "./twist-first-path";
import type { LessonStep } from "./types";

const STAGE: Record<string, TwistFirstStageId> = {
  "333-tf-cross": "cross",
  "333-tf-corners": "corners",
  "333-tf-second": "second",
  "333-tf-eo": "eo",
  "333-tf-ep": "ep",
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
const casesOf = (stage: TwistFirstStageId) =>
  (TWIST_FIRST_STAGES.find((s) => s.id === stage)?.cases ?? []).map(
    (c) => c.id,
  );

describe("강 모범 답 = 경우별 정해진 길", () => {
  it("강은 설명서 1~7단계 일곱이고, 차례가 흰 십자 → 첫 층 코너 → 둘째 층 엣지 → 엣지 방향 → 엣지 위치 → 코너 방향 → 코너 위치다", () => {
    expect(TWIST_FIRST_333.lessons.map((l) => l.title)).toEqual([
      "흰 십자",
      "첫 층 코너",
      "둘째 층 엣지",
      "엣지 방향",
      "엣지 위치",
      "코너 방향",
      "코너 위치",
    ]);
  });

  for (const l of TWIST_FIRST_333.lessons) {
    const stage = STAGE[l.id] as TwistFirstStageId;
    l.steps.forEach((step, i) => {
      if (!step.alg || !step.setup || !("alg" in step.setup)) return;
      // 어디를 돌려도 되는지 보이는 돌리기 쪽(흰 십자 앞쪽, 다 쳤을 때 말이 따로 있음)은 풀이가 아니다
      if (step.kind === "turn" && step.passedText) return;
      it(`${l.title} ${i + 1}번(${step.kind})`, () => {
        const r = runTwistFirstStage(stage, stateOf(step));
        const want = norm(r.steps.map(twistFirstMoves).join(" "));
        // 시연은 공식 한 번 단위(2026-11-27 사용자): 풀이의 첫 걸음(쥐기 + 공식 한 번)과 같다. 직접 치기는 그 앞부분
        const first = norm(r.steps[0] ? twistFirstMoves(r.steps[0]) : "");
        if (step.kind === "turn")
          expect(want.startsWith(norm(step.alg as string))).toBe(true);
        else if (step.kind === "demo")
          expect(first.endsWith(norm(step.alg as string))).toBe(true);
        else expect(want).toBe(norm(step.alg as string));
        if (step.goal) expect(goalMet(3, r.state, step.goal)).toBe(true);
      });
    });
  }

  it("해 보기가 넉넉하고, 단계마다 해 보기가 그 단계의 모든 경우를 한 번 이상 지난다(윗면만 돌리는 경우는 빼고)", () => {
    for (const l of TWIST_FIRST_333.lessons) {
      const stage = STAGE[l.id] as TwistFirstStageId;
      const seen = new Set<string>();
      for (const s of l.steps) {
        if (s.kind !== "try" || !s.setup || !("alg" in s.setup)) continue;
        for (const st of runTwistFirstStage(stage, stateOf(s)).steps)
          seen.add(st.caseId);
      }
      const want = casesOf(stage).filter((c) => c !== "align");
      expect([...seen].sort(), l.id).toEqual(want.sort());
    }
  });

  it("마지막 해 보기는 그 단계 연습 섞기로 아무 경우나 낸다", () => {
    const last = (id: string) => lesson(id)?.steps.at(-1)?.setup;
    expect(TWIST_FIRST_333.lessons.map((l) => last(l.id))).toEqual([
      { rule: "random-cross" },
      { rule: "white-cross-up" },
      { rule: "first-layer-solved" },
      { rule: "second-layer-solved" },
      { rule: "ll-cross-solved" },
      { rule: "ll-edges-solved" },
      { rule: "ll-corners-unplaced" },
    ]);
  });

  it("코너 방향 강은 공식 시연 바로 다음 쪽에 관계도를 문제 없는 시연 쪽으로 두고, 문제는 그다음 쪽에 둔다", () => {
    const steps = lesson("333-tf-twist")?.steps ?? [];
    const demo = steps.findIndex((s) => s.kind === "demo");
    const flow = steps[demo + 1];
    expect([flow?.sheet, flow?.kind, flow?.quiz]).toEqual([
      "tf-flow",
      "demo",
      undefined,
    ]);
    expect(steps[demo + 2]?.kind).toBe("quiz");
    expect(steps[demo + 2]?.sheet).toBeUndefined();
  });
});

describe("고르기 문제의 답 = 그림 상황", () => {
  it("흰 십자 돌리기 쪽: 윗면 U는 흰 엣지 블럭 넷을 모두 벗어나게, 옆면 R은 위-오른쪽을 내리고, 아랫면 D D는 흰 십자를 그대로 둔다(경우 그림보다 앞)", () => {
    const steps = lesson("333-tf-cross")?.steps ?? [];
    const sheet = steps.findIndex((s) => s.sheet === "beginner-tf-cross");
    const turns = steps.slice(0, sheet).filter((s) => s.kind === "turn");
    expect(turns.map((s) => s.alg)).toEqual(["U", "U'", "R", "D D"]);
    const cross = (alg: string) =>
      goalMet(
        3,
        applyMoves(3, solvedCube(3), parseMoves(3, alg)),
        "white-cross",
      );
    expect([cross("U"), cross("U U'"), cross("R"), cross("D D")]).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it("흰 십자 첫 쪽과 경우 그림 쪽: 흰-초록 엣지 블럭이 아래-앞, 흰색이 아래라 F2", () => {
    const steps = lesson("333-tf-cross")?.steps ?? [];
    const sheet = steps.findIndex((s) => s.sheet === "beginner-tf-cross");
    for (const k of [0, sheet]) {
      const s = stateOf(steps[k] as LessonStep);
      expect(nextTwistFirstStep("cross", s)).toMatchObject({
        caseId: "down",
        hold: "",
        alg: "F2",
      });
    }
  });

  it("첫 층 코너 첫 두 쪽: 자리 밑, 흰색이 오른쪽이라 코너 넣기", () => {
    for (const k of [0, 1]) {
      const s = stateOf(lesson("333-tf-corners")?.steps[k] as LessonStep);
      expect(nextTwistFirstStep("corners", s)).toMatchObject({
        caseId: "right",
        hold: "",
      });
    }
  });

  it("둘째 층 첫 두 쪽: 위-앞 엣지 블럭의 옆 색이 앞 센터 색이고, 공식 A로 넣는다", () => {
    const s = stateOf(lesson("333-tf-second")?.steps[1] as LessonStep);
    expect(nextTwistFirstStep("second", s)).toMatchObject({
      caseId: "right",
      hold: "",
    });
  });

  it("엣지 방향 둘째 쪽: 기본형(ㄱ자, 뒤와 왼쪽)", () => {
    const s = stateOf(lesson("333-tf-eo")?.steps[1] as LessonStep);
    expect(edgesUp(s).sort()).toEqual(["B", "L"]);
  });

  it("엣지 방향 일자 쪽은 두 번, 점 쪽은 세 번이다", () => {
    const line = stateOf(stepWith("333-tf-eo", "일자는 앞뒤로 세워"));
    expect(runTwistFirstStage("eo", line).steps.length).toBe(2);
    const dot = stateOf(stepWith("333-tf-eo", "늘 가로 일자"));
    // 이 쪽 그림은 점에서 한 번 친 뒤의 가로 일자다
    expect(edgesUp(dot).sort()).toEqual(["L", "R"]);
  });

  it("엣지 위치 첫 쪽: 제자리 엣지 블럭은 뒤 하나", () => {
    const s = stateOf(lesson("333-tf-ep")?.steps[0] as LessonStep);
    expect(edgesMatched(s)).toEqual(["B"]);
  });

  it("엣지 위치 셋째 쪽: 앞과 왼쪽이 제자리이고 이웃이라 U'를 한 칸 더 돌리면 뒤 하나만 맞는다", () => {
    const s = stateOf(lesson("333-tf-ep")?.steps[2] as LessonStep);
    expect(edgesMatched(s).sort()).toEqual(["F", "L"]);
    expect(nextTwistFirstStep("ep", s)).toMatchObject({
      caseId: "adjacent",
      hold: "U'",
    });
    expect(edgesMatched(applyMoves(3, s, parseMoves(3, "U'")))).toEqual(["B"]);
  });

  it("엣지 위치 마주 봄 쪽: 공식 두 번", () => {
    const s = stateOf(stepWith("333-tf-ep", "마주 볼 때도"));
    const r = runTwistFirstStage("ep", s);
    expect(r.steps.map((x) => x.caseId)).toEqual(["opposite", "adjacent"]);
  });

  it("코너 방향 첫 두 쪽: 위를 보는 노란색은 앞-오른쪽·뒤-왼쪽 위 대각선(기본형, 쥔 그대로)", () => {
    for (const k of [0, 1]) {
      const s = stateOf(lesson("333-tf-twist")?.steps[k] as LessonStep);
      // 앞-오른쪽, 앞-왼쪽, 뒤-왼쪽, 뒤-오른쪽 위
      expect(cornerYellows(s)).toEqual(["U", "L", "U", "B"]);
      expect(nextTwistFirstStep("twist", s)).toMatchObject({
        caseId: "base",
        hold: "",
      });
    }
  });

  it("관계도 쪽: 하나도 없는 모양은 공식 세 번", () => {
    const s = stateOf(stepWith("333-tf-twist", "관계도예요"));
    expect(cornerYellows(s).includes("U")).toBe(false);
    expect(runTwistFirstStage("twist", s).steps.length).toBe(3);
  });

  it("코너 위치 헤드라이트 쪽: 헤드라이트는 왼쪽 면(위 층 코너 블럭 둘의 왼쪽 면 스티커가 같은 색)", () => {
    const step = stepWith("333-tf-place", "「헤드라이트」라고 불러요");
    const c = faceColors(3, stateOf(step));
    expect(c[36]).toBe(c[38]);
    expect([c[9] === c[11], c[18] === c[20], c[45] === c[47]]).toEqual([
      false,
      false,
      false,
    ]);
    expect(step.quiz?.choices[step.quiz.answer]).toBe("왼쪽 면");
  });

  it("코너 위치 첫 쪽: 제자리 코너 블럭은 앞-오른쪽 위 하나", () => {
    const s = stateOf(lesson("333-tf-place")?.steps[0] as LessonStep);
    expect(placedCorners(s)).toEqual([0]);
  });

  it("B 고르기 쪽: 제자리는 앞-오른쪽 위 하나이고, y로 다시 쥐고 공식 B 한 번이면 다 맞는다", () => {
    const s = stateOf(stepWith("333-tf-place", "헤드라이트가 뒤 면에 있어요"));
    expect(placedCorners(s)).toEqual([0]);
    expect(nextTwistFirstStep("place", s)).toMatchObject({
      caseId: "b",
      hold: "y",
    });
    expect(
      goalMet(3, applyMoves(3, s, parseMoves(3, `y ${CORNER_B}`)), "solved"),
    ).toBe(true);
  });

  it("A 시연 쪽: 제자리는 앞-오른쪽 위, 앞-왼쪽 위 블럭의 제자리는 뒤-왼쪽 위라 공식 A", () => {
    const s = stateOf(
      stepWith("333-tf-place", "헤드라이트가 왼쪽 면이에요. 공식 A"),
    );
    expect(placedCorners(s)).toEqual([0]);
    expect(nextTwistFirstStep("place", s)).toMatchObject({
      caseId: "a",
      hold: "",
    });
    expect(
      goalMet(3, applyMoves(3, s, parseMoves(3, CORNER_A)), "solved"),
    ).toBe(true);
  });

  it("제자리 없음 쪽: 제자리 코너 블럭이 없고, 어느 쪽으로 쥐어도 공식 A 한 번이면 꼭 하나가 생긴다", () => {
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

  it("전문 이름(퍼뮤·수네·섹시 무브·OLL·PLL)을 쓰지 않는다(헤드라이트는 뜻을 풀고 쓴다, 2026-11-27 사용자)", () => {
    const words = /퍼뮤|수네|섹시|OLL|PLL|permutation/i;
    expect(texts().filter((t) => words.test(t))).toEqual([]);
  });

  it("강·쪽 첫머리를 틀 문장(「앞 단원에서」·「이 과정에서는」·「화면의 큐브는」)으로 열지 않는다", () => {
    const frame = /앞 단원에서|이 과정에서는|화면의 큐브는|이 단원에서는/;
    expect(texts().filter((t) => frame.test(t))).toEqual([]);
  });

  it("공식 B는 늘 「공식 B」로 불러 B면 돌리기 칩으로 그려지지 않는다", () => {
    // 공식 줄 속 수는 앞이나 뒤가 빈칸 하나로 다른 수와 이어진다. 둘 다 아니면 홀로 선 글자다
    const spaceOnly = (p?: { kind: string; text: string }) =>
      p?.kind === "text" && /^ $/.test(p.text);
    const bad = texts().filter((t) =>
      splitMoveText(t).some(
        (p, i, all) =>
          p.kind === "move" &&
          p.text === "B" &&
          !spaceOnly(all[i - 1]) &&
          !spaceOnly(all[i + 1]),
      ),
    );
    expect(bad).toEqual([]);
  });

  it("강의 첫머리에 신광사 큐브 설명서의 해법이라는 것을 밝힌다", () => {
    expect(courseById("333-twist-first")?.summary).toContain("신광사");
    expect(lesson("333-tf-cross")?.steps[0]?.body).toContain("신광사");
  });
});
