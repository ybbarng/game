// 코너 방향 먼저 강(lessons-twist-first.ts)의 시연·해 보기 모범 답이 경우별 정해진 길(twist-first-path.ts)과 같고, 고르기
// 문제의 답이 그림 상황과 맞는지 엔진으로 본다(docs/47 16-33). 글이 말하는 길과 규칙 자료가 어긋나면 여기서 잡힌다.
import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { courseById } from "./courses";
import { goalMet } from "./judge";
import { TWIST_FIRST_333 } from "./lessons-twist-first";
import {
  edgesHome,
  pairedSides,
  runTwistFirstStage,
  type TwistFirstStageId,
  twistFirstMoves,
  YELLOW_FACE_MIRROR,
} from "./twist-first-path";
import type { LessonStep } from "./types";

const STAGE: Record<string, TwistFirstStageId> = {
  "333-tf-face": "face",
  "333-tf-corners": "corners",
  "333-tf-edges": "edges",
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
      // 왼손 노란 면 공식 시연은 단계 규칙이 아니라 공식 하나를 보이는 쪽이다(아래에서 따로 본다)
      if (step.alg === YELLOW_FACE_MIRROR) return;
      it(`${l.title} ${i + 1}번(${step.kind})`, () => {
        const r = runTwistFirstStage(stage, stateOf(step));
        expect(norm(r.steps.map(twistFirstMoves).join(" "))).toBe(
          norm(step.alg as string),
        );
        if (step.goal) expect(goalMet(3, r.state, step.goal)).toBe(true);
      });
    });
  }

  it("왼손 노란 면 공식 시연: 노란 십자와 아래 두 층은 그대로 두고 윗면을 노랗게 만든다", () => {
    const step = lesson("333-tf-edges")?.steps.find(
      (s) => s.alg === YELLOW_FACE_MIRROR,
    ) as LessonStep;
    const s = stateOf(step);
    expect(goalMet(3, s, "yellow-cross")).toBe(true);
    expect(goalMet(3, s, "oll")).toBe(false);
    expect(
      goalMet(3, applyMoves(3, s, parseMoves(3, YELLOW_FACE_MIRROR)), "oll"),
    ).toBe(true);
  });

  it("해 보기가 넉넉하다: 노란 면 일곱 이상, 코너 자리·엣지 자리 다섯 이상", () => {
    const tries = (id: string) =>
      lesson(id)?.steps.filter((s) => s.kind === "try").length ?? 0;
    expect(tries("333-tf-face")).toBeGreaterThanOrEqual(7);
    expect(tries("333-tf-corners")).toBeGreaterThanOrEqual(5);
    expect(tries("333-tf-edges")).toBeGreaterThanOrEqual(5);
  });

  it("마지막 해 보기는 그 단계 연습 섞기로 아무 경우나 낸다", () => {
    const last = (id: string) => lesson(id)?.steps.at(-1)?.setup;
    expect([
      last("333-tf-face"),
      last("333-tf-corners"),
      last("333-tf-edges"),
    ]).toEqual([
      { rule: "yellow-cross-solved" },
      { rule: "yellow-face-solved" },
      { rule: "corners-placed" },
    ]);
  });
});

describe("고르기 문제의 답 = 그림 상황", () => {
  const yellowAt = (s: PuzzleState, stickers: number[]) => {
    const c = faceColors(3, s);
    return stickers.filter((i) => c[i] === 3);
  };

  it("노란 면 첫 쪽: 위를 보는 노란색은 앞-왼쪽 위 하나", () => {
    const s = stateOf(lesson("333-tf-face")?.steps[0] as LessonStep);
    // 윗면 구석: 0 뒤-왼쪽, 2 뒤-오른쪽, 6 앞-왼쪽, 8 앞-오른쪽
    expect(yellowAt(s, [0, 2, 6, 8])).toEqual([6]);
  });

  it("거꾸로 쪽: 위를 보는 코너 블럭이 앞-왼쪽 위이고 앞-오른쪽 위 노란색은 오른쪽(9번 칸)", () => {
    const s = stateOf(stepWith("333-tf-face", "다른 모양이에요"));
    expect(yellowAt(s, [0, 2, 6, 8])).toEqual([6]);
    // 앞-오른쪽 위 코너의 세 칸: 윗면 8, 오른쪽 9, 앞 20
    expect(yellowAt(s, [8, 9, 20])).toEqual([9]);
  });

  it("마주 보는 두 옆면 쪽: 노란색 둘씩이 앞과 뒤", () => {
    const s = stateOf(stepWith("333-tf-face", "마주 보는 두 옆면에 둘씩"));
    expect(yellowAt(s, [9, 11, 18, 20, 36, 38, 45, 47])).toEqual([
      18, 20, 45, 47,
    ]);
  });

  it("노란색 둘인 옆면이 하나인 쪽: 그 면은 왼쪽", () => {
    const s = stateOf(stepWith("333-tf-face", "노란색 둘이 함께 있는 옆면"));
    const sides = { R: [9, 11], F: [18, 20], L: [36, 38], B: [45, 47] };
    const two = Object.entries(sides).filter(
      ([, xs]) => yellowAt(s, xs).length === 2,
    );
    expect(two.map(([f]) => f)).toEqual(["L"]);
  });

  it("위를 보는 둘인 쪽: 앞-왼쪽 위 노란색이 앞(18번 칸)", () => {
    const s = stateOf(stepWith("333-tf-face", "둘인 모양은 셋이에요"));
    expect(yellowAt(s, [6, 18, 38])).toEqual([18]);
  });

  it("코너 자리 첫 쪽: 바른 짝은 뒤 한 면", () => {
    const s = stateOf(lesson("333-tf-corners")?.steps[0] as LessonStep);
    expect(pairedSides(s)).toEqual(["B"]);
  });

  it("위 층이 비켜난 쪽: U 한 번이면 코너 블럭이 모두 제자리", () => {
    const s = stateOf(stepWith("333-tf-corners", "통째로 비켜나 있을 때"));
    const after = (u: string) =>
      goalMet(3, applyMoves(3, s, parseMoves(3, u)), "oll") &&
      runTwistFirstStage("corners", applyMoves(3, s, parseMoves(3, u))).steps
        .length === 0;
    expect(["U", "U'", "U2"].filter(after)).toEqual(["U"]);
  });

  it("윗면 맞추기: 앞-오른쪽 위 코너 블럭의 제자리가 앞-왼쪽 위면 U, 뒤-오른쪽 위면 U', 뒤-왼쪽 위면 U2로 코너가 모두 제자리", () => {
    // 위 층 구석의 옆 칸 둘(옆면 센터 번호): 앞-왼쪽 F·L, 뒤-오른쪽 B·R, 뒤-왼쪽 B·L
    const RULE: [number[], string][] = [
      [[22, 40], "U"],
      [[49, 13], "U'"],
      [[49, 40], "U2"],
    ];
    for (const off of ["U", "U'", "U2"]) {
      const s = applyMoves(3, solvedCube(3), parseMoves(3, `z2 ${off}`));
      const c = faceColors(3, s);
      // 앞-오른쪽 위 코너 블럭의 옆 색 둘(오른쪽 9번, 앞 20번)
      const side = [c[9], c[20]].sort().join();
      const hit = RULE.find(
        ([centers]) =>
          centers
            .map((i) => c[i])
            .sort()
            .join() === side,
      );
      const turn = hit?.[1] as string;
      const after = applyMoves(3, s, parseMoves(3, turn));
      expect(
        runTwistFirstStage("corners", after).steps.length,
        `${off} → ${turn}`,
      ).toBe(0);
    }
  });

  it("바른 짝 없음 쪽: 바른 짝이 하나도 없고, 윗면을 돌려도 생기지 않는다", () => {
    const s = stateOf(stepWith("333-tf-corners", "바른 짝이 하나도 없을 때"));
    for (const u of ["", "U", "U2", "U'"])
      expect(pairedSides(applyMoves(3, s, parseMoves(3, u))), u).toEqual([]);
  });

  it("엣지 자리 첫 쪽: 제자리 엣지 블럭은 뒤 하나", () => {
    const s = stateOf(lesson("333-tf-edges")?.steps[0] as LessonStep);
    expect(edgesHome(s)).toEqual(["B"]);
  });

  it("엣지 자리 방향 쪽: 뒤가 제자리이고 앞 엣지 블럭의 제자리는 오른쪽", () => {
    const s = stateOf(stepWith("333-tf-edges", "앞 엣지 블럭 하나만 보면"));
    expect(edgesHome(s)).toEqual(["B"]);
    // 앞 엣지 블럭의 옆 칸(19번)이 오른쪽 센터(13번) 색
    const c = faceColors(3, s);
    expect(c[19]).toBe(c[13]);
  });

  it("엣지 없음 쪽: 제자리 엣지 블럭이 하나도 없다", () => {
    const s = stateOf(stepWith("333-tf-edges", "하나도 없을 때가 있어요"));
    expect(edgesHome(s)).toEqual([]);
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
});
