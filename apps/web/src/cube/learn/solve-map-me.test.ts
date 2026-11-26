// 해법 지도의 내 기록(solve-map-me.ts): 진행 기록·공식 연습 기록·혼자 맞추기 구간을 지도 길에 겹치는지 본다.
import { describe, expect, it } from "vitest";

import type { SolveRecord } from "../records";
import { COURSES } from "./courses";
import type { LearnProgress } from "./progress";
import { edgeById, MAP_METHODS, type MapEdge, methodStages } from "./solve-map";
import { DEMO_PROGRESS, DEMO_RECORDS, DEMO_TRAIN } from "./solve-map-demo";
import {
  arrowLit,
  cellLit,
  edgeProgress,
  edgeTrain,
  methodSolo,
  stageProgress,
  teachingLessons,
} from "./solve-map-me";

const method = (id: string) =>
  MAP_METHODS.find((m) => m.id === id) as (typeof MAP_METHODS)[number];
const edge = (id: string) => edgeById(id) as MapEdge;
const courseOf = (id: string) =>
  COURSES.find((c) => c.lessons.some((l) => l.id === id))?.id;
const done = { passed: [], done: true };

describe("진도 밝기", () => {
  it("걸음을 가르치는 강은 해법 과정의 강, 과정에 없으면 걸음의 첫 강이 든 과정의 강이다", () => {
    expect([
      teachingLessons(edge("cross"), method("cfop"), courseOf),
      teachingLessons(edge("cross"), method("beginner"), courseOf),
      // 2단계 과정엔 십자 강이 없어 앞 과정(초보자) 강
      teachingLessons(edge("cross"), method("two-look"), courseOf),
      // 코너 방향 먼저: 노란 십자는 초보자 강, 노란 면부터는 코너 방향 먼저 강
      teachingLessons(
        edge("beginner-yellow-cross"),
        method("beginner-twist-first"),
        courseOf,
      ),
      teachingLessons(
        edge("twist-first-face"),
        method("beginner-twist-first"),
        courseOf,
      ),
      teachingLessons(edge("petrus-f2l"), method("petrus"), courseOf),
    ]).toEqual([
      ["cfop-cross"],
      ["333-safe-turns", "333-white-cross"],
      ["333-safe-turns", "333-white-cross"],
      ["333-ll-cross"],
      ["333-tf-face"],
      [],
    ]);
  });

  it("강을 모두 마치면 완료, 하나라도 시작했으면 배우는 중, 강이 없는 걸음은 늘 아직이다", () => {
    const half: LearnProgress = { lessons: { "333-white-cross": done } };
    const all: LearnProgress = {
      lessons: Object.fromEntries(
        COURSES.flatMap((c) => c.lessons).map((l) => [l.id, done]),
      ),
    };
    const p = (e: string, m: string, pr: LearnProgress) =>
      edgeProgress(edge(e), method(m), pr, courseOf);
    expect([
      p("cross", "beginner", DEMO_PROGRESS),
      p("beginner-yellow-cross", "beginner", DEMO_PROGRESS),
      p("beginner-edges", "beginner", DEMO_PROGRESS),
      p("cross", "beginner", half),
      p("cross", "cfop", half),
      p("petrus-f2l", "petrus", all),
      p("twist-first-edges", "beginner-twist-first", all),
    ]).toEqual([
      "done",
      "learning",
      "none",
      "learning",
      "none",
      "none",
      "done",
    ]);
  });

  it("코너 방향 먼저 카드 칸: 노란 십자까지 초보자 강을 마치고 노란 면 강을 시작하면 노란 십자 완료·노란 면 배우는 중", () => {
    const m = method("beginner-twist-first");
    const pr: LearnProgress = {
      lessons: {
        "333-safe-turns": done,
        "333-white-cross": done,
        "333-first-corners-up": done,
        "333-second-layer": done,
        "333-ll-cross": done,
        "333-tf-face": { passed: [3], done: false },
      },
    };
    expect(
      methodStages(m).map(
        (s) => `${s.to}:${stageProgress(s.edges, m, pr, courseOf)}`,
      ),
    ).toEqual([
      "cross:done",
      "first-layer:done",
      "f2l:done",
      "yellow-cross:done",
      "oll:learning",
      "pll-corners:none",
      "solved:none",
    ]);
  });

  it("카드 칸(큰 단계)은 강이 있는 걸음을 모두 마쳐야 완료다(2단계: 아래 두 층 완료, 노란 십자 완료, 노란 면 배우는 중)", () => {
    const m = method("two-look");
    const pr: LearnProgress = {
      lessons: {
        "333-safe-turns": done,
        "333-white-cross": done,
        "333-first-corners-up": done,
        "333-second-layer": done,
        "cfop-2look-oll": { passed: [1], done: false },
      },
    };
    expect(
      methodStages(m).map(
        (s) => `${s.to}:${stageProgress(s.edges, m, pr, courseOf)}`,
      ),
    ).toEqual([
      "f2l:done",
      "yellow-cross:learning",
      "oll:learning",
      "pll-corners:none",
      "solved:none",
    ]);
  });

  it("다 섞임 칸은 늘 밝고, 그 밖의 칸은 완료일 때만, 들어오는 화살표는 배우는 중부터 밝다", () => {
    expect(
      (["none", "learning", "done"] as const).map((p) => [
        cellLit(true, p),
        cellLit(false, p),
        arrowLit(p),
      ]),
    ).toEqual([
      [true, false, false],
      [true, false, true],
      [true, true, true],
    ]);
  });
});

describe("공식 연습", () => {
  it("초보자 둘째 층: 상황 셋 가운데 익숙한 것 둘, 평균은 기록 있는 상황 평균들의 평균", () => {
    const t = edgeTrain(edge("second-layer"), DEMO_TRAIN);
    expect({ familiar: t?.familiar, total: t?.total }).toEqual({
      familiar: 2,
      total: 3,
    });
    // (2260 + 2520 + 6120) / 3
    expect(Math.round(t?.avgMs ?? 0)).toBe(3633);
  });

  it("공식 연습에 없는 걸음이나 기록이 없는 걸음은 비운다", () => {
    expect([
      edgeTrain(edge("first-corners"), DEMO_TRAIN),
      edgeTrain(edge("pll"), DEMO_TRAIN),
    ]).toEqual([null, null]);
  });
});

describe("혼자 맞추기 구간", () => {
  it("층별 기록: 십자는 잘하는 걸음, 둘째 층은 약한 걸음(잰 수의 몫과 견줌)", () => {
    const solo = methodSolo(method("beginner"), DEMO_RECORDS);
    expect(
      ["cross", "first-corners", "second-layer"].map(
        (id) => solo.get(id)?.skill,
      ),
    ).toEqual(["strong", "even", "weak"]);
    expect(solo.get("cross")?.count).toBe(10);
  });

  it("한 구간이 여러 걸음을 덮는 길(초보자 마지막 층)과 구간 기록이 없는 판은 넣지 않는다", () => {
    const noSplits: SolveRecord[] = DEMO_RECORDS.map(
      ({ splits: _, ...r }) => r,
    );
    expect([
      methodSolo(method("beginner"), DEMO_RECORDS).has("beginner-edges"),
      methodSolo(method("beginner"), noSplits).size,
    ]).toEqual([false, 0]);
  });
});
