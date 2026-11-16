import { describe, expect, it } from "vitest";

import { parseSplits, type SolveRecord } from "../records";
import { goldSplits } from "./gold";
import {
  methodBests,
  methodPath,
  methodSplits,
  methodsFor,
  parseMethod,
  theoryBest,
  usableMethod,
} from "./methods";

const rec = (n: number, splits: string): SolveRecord => ({
  at: 1,
  n,
  mode: "solo",
  ms: 30_000,
  penalty: 0,
  moves: 60,
  scramble: "R U",
  splits,
});

describe("내 해법 고르기", () => {
  it("3×3은 여섯 가지, 큰 큐브는 자동·층별·CFOP(4×4는 야우도), 2×2는 자동만", () => {
    expect(methodsFor(3)).toEqual([
      "auto",
      "layer",
      "cfop",
      "roux",
      "zz",
      "corners",
    ]);
    expect(methodsFor(4)).toEqual(["auto", "layer", "cfop", "yau"]);
    expect(methodsFor(5)).toEqual(["auto", "layer", "cfop"]);
    expect(usableMethod(5, "yau")).toBe("auto");
    expect(methodsFor(2)).toEqual(["auto"]);
    expect(usableMethod(4, "roux")).toBe("auto");
    expect(usableMethod(5, "cfop")).toBe("cfop");
  });

  it("해법을 고르면 그 해법의 단계만 남는다(자동은 그대로)", () => {
    const all = parseSplits(
      "eoline@1500 cross@2000 roux1@4000 f2l1@6000 layer1@9000 layer2@12000 oll@15000 ll@18000",
    );
    expect(methodSplits(3, "cfop", all).map((s) => s.id)).toEqual([
      "cross",
      "f2l1",
      "layer2",
      "oll",
      "ll",
    ]);
    expect(methodSplits(3, "roux", all).map((s) => s.id)).toEqual([
      "roux1",
      "ll",
    ]);
    expect(methodSplits(3, "auto", all)).toEqual(all);
  });

  it("큰 큐브의 해법 단계는 앞에 센터·엣지 짝이 붙는다", () => {
    expect(methodPath(4, "layer")).toEqual([
      "centers",
      "edges",
      "cross",
      "layer1",
      "layer2",
      "oll",
      "ll",
    ]);
    expect(methodPath(4, "auto")).toBeNull();
    expect(methodPath(2, "auto")).toEqual(["layer1", "oll", "ll"]);
  });

  it("구간 골드는 고른 해법의 단계끼리 견준다: 자동에서는 루 첫 블록에 묶인 칩도 CFOP에서는 F2L 1/4", () => {
    // 옛 판: F2L 1/4와 첫 블록을 같은 순간에 지났다(자동이면 대표가 첫 블록인 칩 하나)
    const prior = [rec(3, "cross@2000 f2l1@7000 roux1@7000 ll@30000")];
    const now = parseSplits("cross@2000 f2l1@6500 ll@29000");
    expect(methodBests(3, "cfop", prior).get("cross>f2l1")).toBe(5_000);
    expect(
      goldSplits(
        methodSplits(3, "cfop", now),
        methodBests(3, "cfop", prior),
      ).has(6_500),
    ).toBe(true);
    // 자동은 옛 구간이 「십자>첫 블록」이라 견줄 것이 없다
    expect(goldSplits(now, methodBests(3, "auto", prior)).has(6_500)).toBe(
      false,
    );
  });

  it("못 읽는 저장 값은 자동", () => {
    expect(parseMethod("cfop")).toBe("cfop");
    expect(parseMethod(null)).toBe("auto");
    expect(parseMethod("petrus")).toBe("auto");
  });
});

describe("이론 최고", () => {
  it("해법의 구간마다 여러 판의 가장 짧은 기록을 더한다", () => {
    const records = [
      rec(
        3,
        "cross@3000 roux1@4000 layer1@12000 layer2@20000 oll@26000 ll@30000",
      ),
      rec(3, "cross@2000 layer1@13000 layer2@19000 oll@27000 ll@32000"),
    ];
    const t = theoryBest(3, "layer", records);
    expect(t?.parts).toEqual([
      { key: "start>cross", id: "cross", ms: 2_000 },
      { key: "cross>layer1", id: "layer1", ms: 9_000 },
      { key: "layer1>layer2", id: "layer2", ms: 6_000 },
      { key: "layer2>oll", id: "oll", ms: 6_000 },
      { key: "oll>ll", id: "ll", ms: 4_000 },
    ]);
    expect(t?.total).toBe(27_000);
  });

  it("두 단계를 한 수에 지난 판은 그 사이 두 구간에 쓰지 않는다", () => {
    // 십자와 F2L 1/4를 함께(X십자): 「시작>십자」·「십자>F2L 1/4」는 이 판에서 따로 잴 수 없다
    const xcross = rec(
      3,
      "cross@4000 f2l1@4000 f2l2@9000 f2l3@14000 layer2@19000 oll@23000 ll@26000",
    );
    const t = theoryBest(3, "cfop", [xcross]);
    expect(t?.parts.map((p) => p.ms)).toEqual([
      null,
      null,
      5_000,
      5_000,
      5_000,
      4_000,
      3_000,
    ]);
    expect(t?.total).toBeNull();
  });

  it("자동(3×3)은 판마다 길이 달라 없고, 2×2는 한 길이라 자동에도 있다", () => {
    expect(theoryBest(3, "auto", [])).toBeNull();
    const t = theoryBest(2, "auto", [
      rec(2, "layer1@2500 oll@5000 ll@7000"),
      rec(2, "layer1@3000 oll@4800 ll@6200"),
    ]);
    expect(t?.total).toBe(2_500 + 1_800 + 1_400);
  });
});
