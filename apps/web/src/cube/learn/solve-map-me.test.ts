// 해법 지도 위의 「나」(solve-map-me.ts): 진행 기록·공식 연습 기록·혼자 맞추기 구간을 지도 길에 겹치는지 본다.
import { describe, expect, it } from "vitest";

import type { SolveRecord } from "../records";
import type { LearnProgress } from "./progress";
import { edgeById, MAP_METHODS, type MapEdge } from "./solve-map";
import { DEMO_PROGRESS, DEMO_RECORDS, DEMO_TRAIN } from "./solve-map-demo";
import { edgeLearn, edgeTrain, methodSolo, myNode } from "./solve-map-me";

const method = (id: string) =>
  MAP_METHODS.find((m) => m.id === id) as (typeof MAP_METHODS)[number];
const edge = (id: string) => edgeById(id) as MapEdge;
const EMPTY: LearnProgress = { lessons: {} };

describe("진행", () => {
  it("아무것도 안 했으면 어느 해법에도 「나」의 자리가 없다(null)", () => {
    expect(MAP_METHODS.map((m) => myNode(m, EMPTY))).toEqual(
      MAP_METHODS.map(() => null),
    );
  });

  it("해법마다 앞에서부터 끝낸 길을 따라간 마지막 지점에 「나」가 있다", () => {
    expect(
      ["beginner", "two-look", "cfop", "roux", "zz"].map((id) =>
        myNode(method(id), DEMO_PROGRESS),
      ),
    ).toEqual(["f2l", "oll", "cross", "roux-fb", null]);
  });

  it("길은 단원 하나라도 끝냈으면 끝냄, 해 보기만 통과했으면 하는 중이다", () => {
    expect(
      ["cross", "beginner-yellow-cross", "beginner-edges"].map((id) =>
        edgeLearn(edge(id), DEMO_PROGRESS),
      ),
    ).toEqual(["done", "started", "none"]);
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
