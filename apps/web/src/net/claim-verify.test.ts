// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { KitClaims, VerifyContext } from "@/game/kit";

import type { ClaimsResolved } from "./claim";
import { claimsVerifier } from "./claim-verify";

/**
 * 판 끝 다시 계산의 청구 묶음 맞춰 보기(`claimsVerifier`). 끊긴 구간(`VerifyContext.gaps`) 안에서만
 * 받지 못한 발표의 묶음을 넘기고, 그 밖에서 기대와 다르면 짚는다
 */
type A = { type: "claims"; batch: number } | { type: "move" };

const spec: KitClaims<unknown, A> = {
  stimulusOf: () => 0,
  board: () => 0,
  isBody: (b): b is unknown => true,
  judge: () => "ok",
  // 판정된 청구가 없으면 엔진에 넣을 것이 없다
  action: (r) =>
    r.entries.length > 0 ? { type: "claims", batch: r.batch } : null,
  recorded: (a) => a.type === "claims",
};

const resolved = (batch: number, empty = false): ClaimsResolved =>
  ({
    v: 1,
    kind: "claims-resolved",
    game: "x",
    batch,
    at: 0,
    entries: empty ? [] : [{}],
  }) as unknown as ClaimsResolved;

/** 기록을 차례로 맞춰 보고 처음 나온 문제(없으면 끝 확인 결과) */
function run(log: number[], context: VerifyContext): string | null {
  const v = claimsVerifier<A>(spec);
  for (const [index, batch] of log.entries()) {
    const problem = v.verifyUnsigned({
      seat: 0,
      action: { type: "claims", batch },
      index,
      context,
    });
    if (problem) return problem;
  }
  return v.verifyUnsignedDone(context);
}

describe("claimsVerifier: 끊긴 구간", () => {
  const got = [resolved(0), resolved(3)];

  it("끊긴 구간 안(받은 0번과 다시 받은 3번 사이)의 받지 못한 묶음은 넘긴다", () => {
    const context = {
      claimsResolved: got,
      partial: true,
      gaps: [1],
      complete: true,
    };
    expect(run([0, 1, 2, 3], context)).toBeNull();
  });

  it("끊긴 구간 밖(끊기기 전, 다시 받은 뒤)의 기대와 다른 묶음은 짚는다", () => {
    const base = { claimsResolved: got, partial: true, complete: true };
    expect(run([7, 0, 3], { ...base, gaps: [1] })).toContain("끊긴 구간 밖");
    expect(run([0, 3, 9], { ...base, gaps: [1] })).toContain(
      "받은 발표보다 많다",
    );
  });

  it("새로고침(구간 0)은 처음 받은 발표 앞까지만 넘긴다", () => {
    const base = { claimsResolved: got, partial: true, complete: true };
    expect(run([5, 6, 0, 3], { ...base, gaps: [0] })).toBeNull();
    expect(run([0, 5, 3], { ...base, gaps: [0] })).toContain("끊긴 구간 밖");
  });

  it("엔진에 넣을 것이 없는 발표는 자리 셈에서 뺀다", () => {
    // 받은 발표: 0번(넣을 것 없음), 끊김, 다시 받은 3번
    const context = {
      claimsResolved: [resolved(0, true), resolved(3)],
      partial: true,
      gaps: [1],
      complete: true,
    };
    expect(run([1, 2, 3], context)).toBeNull();
  });

  it("받은 발표가 기록에서 빠지면 끊긴 적이 있어도 짚는다", () => {
    const context = {
      claimsResolved: got,
      partial: true,
      gaps: [1],
      complete: true,
    };
    expect(run([0, 1], context)).toContain("빠졌다");
  });

  it("구간을 모르면(예전 호출) 받은 것이 차례대로 있는지만 본다", () => {
    const context = { claimsResolved: got, partial: true, complete: true };
    expect(run([7, 0, 8, 3, 9], context)).toBeNull();
  });
});
