// 초보자 마지막 층 가리기(2026-11-10 사용자 「일자 십자 이야기를 하는데 모양에는 그게 없잖아. 코너 블럭 색깔도 없애야」).
// 노란 십자 단계는 「ll-cross」로 윗층 엣지의 노란 칸만 보인다. 단계마다 가린 큐브에서 보이는 모양(점·ㄱ자·일자)이
// 본문이 말하는 모양과 같은지, 공식 연습 노란 십자 상황도 이름이 말하는 모양인지 본다. 옆면 맞추기는 「ll-edges」로
// 윗층 코너 블럭을 가린다.
import {
  applyMoves,
  cubeGroups,
  cubeTopology,
  faceColors,
  maskAtSlots,
  parseMoves,
  type StickerMask,
  U,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { PRACTICE_N, problemStart } from "../practice/problem";
import { stageById } from "../practice/stages";
import { COURSES } from "./index";
import { maskFor, stepStart } from "./judge";
import type { Lesson } from "./types";

const YELLOW = 3;
/** 윗면 칸 번호: 엣지 칸이 어느 옆면 쪽인지 */
const TOP_EDGE: [string, number][] = [
  ["뒤", 1],
  ["왼쪽", 3],
  ["오른쪽", 5],
  ["앞", 7],
];
const TOP_CORNERS = [0, 2, 6, 8];
const TOP_CENTER = 4;

const lessonOf = (id: string): Lesson => {
  const l = COURSES.flatMap((c) => c.lessons).find((x) => x.id === id);
  if (!l) throw new Error(id);
  return l;
};
const play = (s: PuzzleState, alg: string) =>
  alg.trim() ? applyMoves(3, s, parseMoves(3, alg)) : s;

/**
 * 가린 큐브에서 윗면에 보이는 노란 엣지 모양. 「점」, 「십자」, 「일자 가로」(왼쪽·오른쪽), 「일자 세로」(앞·뒤),
 * 「ㄱ자 뒤·왼쪽」처럼 노란 두 칸의 쪽. 노란 칸이 보이는 칸만 센다
 */
function seenShape(s: PuzzleState, mask: StickerMask): string {
  const col = faceColors(3, s);
  const vis = maskAtSlots(s, mask);
  const seen = (i: number) => vis[i] === "visible" && col[i] === YELLOW;
  const up = TOP_EDGE.filter(([, i]) => seen(i)).map(([name]) => name);
  if (up.length === 0) return "점";
  if (up.length === 4) return "십자";
  if (up.length !== 2) return `노란 엣지 ${up.length}개`;
  if (up.includes("왼쪽") && up.includes("오른쪽")) return "일자 가로";
  if (up.includes("앞") && up.includes("뒤")) return "일자 세로";
  return `ㄱ자 ${up.join("·")}`;
}

/** 노란 십자 가리기: 윗면에서 코너 칸은 회색, 노란 센터는 보이고, 윗층의 노란 칸 말고는 아무것도 보이지 않는다 */
function expectCrossMask(s: PuzzleState, mask: StickerMask) {
  const vis = maskAtSlots(s, mask);
  const col = faceColors(3, s);
  for (const i of TOP_CORNERS) expect(vis[i]).toBe("gray");
  expect(vis[TOP_CENTER]).toBe("visible");
  expect(col[TOP_CENTER]).toBe(YELLOW);
  // 윗층 조각(스티커 번호 = 맞춘 상태의 자리)에서 보이는 것은 엣지의 노란 칸뿐
  const g = cubeGroups(3, U);
  const topo = cubeTopology(3);
  for (const p of g.lastLayerCorners)
    for (const st of topo.pieces[p]?.stickers ?? [])
      expect(mask[st]).toBe("gray");
  for (const p of g.lastLayerEdges)
    for (const st of topo.pieces[p]?.stickers ?? [])
      expect(mask[st]).toBe(Math.floor(st / 9) === YELLOW ? "visible" : "gray");
  for (const p of g.f2l)
    for (const st of topo.pieces[p]?.stickers ?? [])
      expect(mask[st]).toBe("visible");
}

describe("노란 십자 가리기(ll-cross)", () => {
  const lesson = lessonOf("333-ll-cross");
  const mask = maskFor(3, "ll-cross") as StickerMask;

  it("단원의 모든 단계가 ll-cross를 쓴다", () => {
    expect(lesson.steps.map((s) => s.mask)).toEqual(
      lesson.steps.map(() => "ll-cross"),
    );
  });

  // 단계마다: 시작 모양(가린 큐브에서 보이는 것), 본문에 적힌 모양 낱말, 쥐는 수 뒤의 모양
  const EXPECT: { start: string; word: string; held?: [string, string] }[] = [
    { start: "일자 가로", word: "일자" },
    { start: "일자 가로", word: "일자" },
    { start: "ㄱ자 왼쪽·앞", word: "ㄱ자", held: ["U", "ㄱ자 뒤·왼쪽"] },
    { start: "ㄱ자 왼쪽·앞", word: "ㄱ자", held: ["U", "ㄱ자 뒤·왼쪽"] },
    { start: "ㄱ자 뒤·오른쪽", word: "ㄱ자", held: ["U'", "ㄱ자 뒤·왼쪽"] },
    { start: "점", word: "점" },
    { start: "ㄱ자 오른쪽·앞", word: "ㄱ자", held: ["U2", "ㄱ자 뒤·왼쪽"] },
    { start: "점", word: "점" },
  ];

  it("단계마다 시작 모양을 적어 두었다(무작위 마무리 하나만 뺀다)", () => {
    expect(EXPECT).toHaveLength(lesson.steps.length - 1);
    expect(lesson.steps.at(-1)?.setup).toEqual({
      rule: "second-layer-solved",
    });
  });

  EXPECT.forEach((want, i) => {
    const step = lesson.steps[i];
    it(`${i + 1}번: 가린 큐브의 모양이 ${want.start}이고 본문도 「${want.word}」`, () => {
      if (!step) throw new Error(`${i}`);
      const s = stepStart(lesson, step, 1);
      expectCrossMask(s, mask);
      expect(seenShape(s, mask)).toBe(want.start);
      expect(step.body).toContain(want.word);
      if (want.held) {
        expect(seenShape(play(s, want.held[0]), mask)).toBe(want.held[1]);
        expect(step.alg ?? want.held[0]).toMatch(
          new RegExp(`^${want.held[0]}( |$)`),
        );
      }
    });
  });

  it("점에서 공식 한 번이면 앞·오른쪽 ㄱ자(본문 「노란 두 칸이 앞과 오른쪽인 ㄱ자」)", () => {
    const step = lesson.steps[5];
    if (!step?.alg) throw new Error("점 단계");
    expect(step.body).toContain("앞과 오른쪽인 ㄱ자");
    const after = play(stepStart(lesson, step, 1), step.alg);
    expect(seenShape(after, mask)).toBe("ㄱ자 오른쪽·앞");
  });

  it("무작위 마무리도 코너 블럭은 가리고 모양은 넷 가운데 하나", () => {
    const step = lesson.steps.at(-1);
    if (!step) throw new Error("마무리");
    for (let seed = 1; seed <= 20; seed++) {
      const s = stepStart(lesson, step, seed);
      expectCrossMask(s, mask);
      expect(seenShape(s, mask)).toMatch(
        /^(점|ㄱ자 .+|일자 (가로|세로)|십자)$/,
      );
    }
  });

  it("공식 연습 노란 십자: 상황 이름의 모양이 가린 큐브와 같다", () => {
    const stage = stageById("beginner-yellow-cross");
    if (!stage) throw new Error("단계");
    expect(stage.mask).toBe("ll-cross");
    const want: Record<string, string> = {
      "beginner-yc-line": "일자 가로",
      "beginner-yc-corner": "ㄱ자 뒤·왼쪽",
      "beginner-yc-dot": "점",
    };
    expect(stage.cases.map((c) => c.id).sort()).toEqual(
      Object.keys(want).sort(),
    );
    for (const c of stage.cases) {
      const s = problemStart(stage, c.algs[0] as string);
      const m = maskFor(PRACTICE_N, stage.mask) as StickerMask;
      expectCrossMask(s, m);
      const shape = want[c.id] as string;
      expect(seenShape(s, m), c.name).toBe(shape);
      expect(c.name).toContain(shape.split(" ")[0] as string);
    }
  });
});

describe("옆면 맞추기 가리기(ll-edges)", () => {
  const g = cubeGroups(3, U);
  const topo = cubeTopology(3);
  const mask = maskFor(3, "ll-edges") as StickerMask;

  it("윗층 코너 블럭만 회색, 엣지 블럭과 아래 두 층은 보인다", () => {
    for (const p of g.lastLayerCorners)
      for (const st of topo.pieces[p]?.stickers ?? [])
        expect(mask[st]).toBe("gray");
    for (const p of [...g.lastLayerEdges, ...g.f2l])
      for (const st of topo.pieces[p]?.stickers ?? [])
        expect(mask[st]).toBe("visible");
  });

  it("옆면 맞추기 단원과 공식 연습이 ll-edges를 쓴다", () => {
    const lesson = lessonOf("333-ll-edges");
    expect(new Set(lesson.steps.map((s) => s.mask))).toEqual(
      new Set(["ll-edges"]),
    );
    expect(stageById("beginner-edges")?.mask).toBe("ll-edges");
  });
});
