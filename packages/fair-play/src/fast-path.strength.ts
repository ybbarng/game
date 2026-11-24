import { describe, expect, it } from "vitest";

import {
  powMismatches,
  proverMismatches,
  zeroRoundMismatches,
} from "./fast-path-fixture";
import { proveKeys } from "./proof";

declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void };

/**
 * 계산을 줄인 길이 바꾸기 전 길과 같은 결과를 내는지 고정 입력 수천 개로 견준다(fast-path-fixture.ts).
 * 단위 시험(fast-path.test.ts)은 같은 함수를 적은 수로 돌린다. 몇 초 걸려 bench에 둔다.
 */
describe("계산을 줄인 길: 고정 입력 수천 개 (pnpm --filter @game/fair-play bench)", () => {
  it("ristretto255 생성원 곱하기 지수 4,000개와 경계", () => {
    const t0 = performance.now();
    expect(powMismatches(4000)).toEqual([]);
    console.log(
      `생성원 곱하기 4,000개: ${Math.round(performance.now() - t0)}ms`,
    );
  }, 600_000);

  it("섞기 증명 도전 0 확인 회 3,000개", async () => {
    const t0 = performance.now();
    const { mismatches, holds, threw } = await zeroRoundMismatches(3000);
    expect(mismatches).toEqual([]);
    // 맞음(종류 0) 500개 모두와, 바꿔치기할 짝이 없는 한 장짜리(종류 2의 1/4)만 통과. 군 밖 입력(종류 4)은 모두 던진다
    expect(holds).toEqual([500, 0, 125, 0, 0, 0]);
    expect(threw).toEqual([0, 0, 0, 0, 500, 0]);
    console.log(`도전 0 확인 3,000회: ${Math.round(performance.now() - t0)}ms`);
  }, 600_000);

  it("열쇠 증명 진술 1,500개(맞는 것 1,000·틀린 것 500)", async () => {
    const t0 = performance.now();
    expect(await proverMismatches(1500, proveKeys)).toEqual([]);
    console.log(`열쇠 증명 1,500개: ${Math.round(performance.now() - t0)}ms`);
  }, 600_000);
});
