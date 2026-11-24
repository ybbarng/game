import { describe, expect, it } from "vitest";

import {
  powMismatches,
  proverMismatches,
  R255,
  zeroRoundMismatches,
} from "./fast-path-fixture";
import { proveKeys } from "./proof";
import { GROUP_1024 } from "./sra";

/*
 * 계산을 줄인 길이 바꾸기 전 길과 같은 결과를 내는지 적은 고정 입력으로 본다(fast-path-fixture.ts).
 * 수천 개로 견주는 것은 bench(fast-path.strength.ts)가 한다.
 */
describe("계산을 줄인 길은 바꾸기 전과 결과가 같다", () => {
  it("ristretto255 생성원 곱하기는 일반 곱하기와 같은 점을 내고, 경계 지수·잘못된 점에서 같은 값이나 같은 오류를 낸다", () => {
    expect(powMismatches(48)).toEqual([]);
  });

  it("섞기 증명 도전 0 확인: 하나씩 보기와 가중치 묶음이 맞음·틀림·던짐을 같게 가른다", async () => {
    const { mismatches, holds, threw } = await zeroRoundMismatches(24);
    expect(mismatches).toEqual([]);
    // 종류별: 맞음 넷과 바꿔치기할 짝이 없는 한 장짜리 하나만 통과, 군 밖 입력 넷은 던진다
    expect(holds).toEqual([4, 0, 1, 0, 0, 0]);
    expect(threw).toEqual([0, 0, 0, 0, 4, 0]);
  });

  it("열쇠 증명 만들기: 맞는 진술이면 A^u가 Π O^w와 같고, 틀린 진술은 바꾸기 전처럼 확인을 통과하지 못한다", async () => {
    expect(await proverMismatches(9, proveKeys)).toEqual([]);
  });

  it("묶어 보는 길은 지수 길이에 따라 비용이 다른 곱셈군에만 쓴다", () => {
    expect(R255.flatPow).toBe(true);
    expect(GROUP_1024.flatPow).toBe(false);
  });
});
