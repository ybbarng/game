import { describe, expect, it } from "vitest";

import { notationKeymap, twoHandKeymap } from "../input/keymaps";
import { fingerOf, keyCost, keyCostDetail } from "./key-cost";
import { choicesOf, pickAlg, SWITCH_MARGIN } from "./pick-alg";
import { PRACTICE_STAGES, stageById } from "./stages";

const two = twoHandKeymap();
const notation = notationKeymap();

describe("키 비용: 손으로 계산한 예", () => {
  it("손가락 자리는 표준 타자 자리", () => {
    expect(fingerOf("KeyF")).toEqual({ hand: "left", finger: 1 });
    expect(fingerOf("KeyK")).toEqual({ hand: "right", finger: 2 });
    expect(fingerOf("Semicolon")).toEqual({ hand: "right", finger: 4 });
  });

  it("두 손 R U R' U' = I J K F: 키 넷 + 같은 손 다른 손가락 둘(I→J, J→K) = 4.4", () => {
    const d = keyCostDetail("R U R' U'", two);
    expect(d).toMatchObject({ presses: 4, sameHand: 2, sameFinger: 0 });
    expect(d.total).toBe(4.4);
  });

  it("표기 R U R' U' = R U ⇧R ⇧U: 양손 번갈기, Shift 둘 = 5.6", () => {
    const d = keyCostDetail("R U R' U'", notation);
    expect(d).toMatchObject({ presses: 4, sameHand: 0, modifiers: 2 });
    expect(d.total).toBe(5.6);
  });

  it("두 손 R2 = I I: 같은 키 연속 = 2.3", () => {
    expect(keyCost("R2", two)).toBe(2.3);
  });

  it("두 손 U' F' = F G: 같은 손가락(왼 검지) 연속 = 3", () => {
    expect(keyCostDetail("U' F'", two)).toMatchObject({ sameFinger: 1 });
    expect(keyCost("U' F'", two)).toBe(3);
  });

  it("큐브 돌리기는 키 하나 + 돌리기 값 = 2", () => {
    expect(keyCost("y", two)).toBe(2);
  });

  it("양손 번갈기는 덧붙는 값이 없다: 두 손 R L = I D = 2", () => {
    expect(keyCost("R L", two)).toBe(2);
  });
});

describe("기본 공식 고르기", () => {
  const pll = stageById("pll");
  const tPerm = pll?.cases.find((c) => c.id === "pll-t");

  it("고른 공식은 가장 싼 공식이고, 흔한 공식보다 키 하나 넘게 싸지 않으면 흔한 공식을 그대로", () => {
    for (const stage of PRACTICE_STAGES)
      for (const c of stage.cases)
        for (const map of [two, notation]) {
          const picked = pickAlg(c, map);
          const min = Math.min(...choicesOf(c).map((a) => keyCost(a, map)));
          const common = keyCost(c.algs[0] as string, map);
          expect(picked.common).toBe(c.algs[0]);
          if (common - min < SWITCH_MARGIN) expect(picked.alg).toBe(c.algs[0]);
          else expect(keyCost(picked.alg, map), c.id).toBe(min);
        }
  });

  it("두 손 배치에서 Ja 퍼뮤는 큐브 돌리기 없는 공식으로 바꾼다", () => {
    const ja = stageById("pll")?.cases.find((c) => c.id === "pll-ja");
    if (!ja) throw new Error("no Ja");
    const picked = pickAlg(ja, two);
    expect(picked.common).toBe("x R2 F R F' R U2 r' U r U2 x'");
    expect(picked.alg).toBe("R' U L' U2 R U' R' U2 R L");
  });

  it("값이 같으면 실물에서 흔한 공식(자료의 첫 공식)을 그대로 쓴다", () => {
    const c = stageById("beginner-second")?.cases[0];
    if (!c) throw new Error("no case");
    expect(pickAlg(c, two).alg).toBe(c.algs[0]);
  });

  it("내 공식에서 고른 공식이 있으면 그것이 먼저", () => {
    const sune = stageById("oll")?.cases.find((c) => c.id === "oll-27");
    if (!sune?.source) throw new Error("no Sune");
    const other = choicesOf(sune).find((a) => a !== pickAlg(sune, two).alg);
    if (!other) throw new Error("no other alg");
    const book = { [sune.source.id]: { mine: [], use: other } };
    expect(pickAlg(sune, two, book)).toMatchObject({
      alg: other,
      why: "mine",
    });
  });

  it("목록에 없는 공식을 골라 두었으면(지웠으면) 키 비용으로 고른다", () => {
    if (!tPerm?.source) throw new Error("no T perm");
    const book = { [tPerm.source.id]: { mine: [], use: "R U R' U'" } };
    expect(pickAlg(tPerm, two, book).why).toBe("keys");
  });
});
