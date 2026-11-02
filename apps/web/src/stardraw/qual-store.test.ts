// @vitest-environment jsdom
import {
  blindStampRequest,
  newIssuerKey,
  newQualSeed,
  type QualHolding,
  type QualInfo,
  qualKeyFromSeed,
  recoveryCode,
  signBlinded,
  toBase64Url,
  toHex,
  unblindStamp,
} from "@game/stardraw-core";
import { beforeEach, describe, expect, it } from "vitest";

import { importRecoveryCode, loadHoldings, removeHolding } from "./qual-store";

/** 장부에 효력이 생긴 기간 하나와 그 기간 열쇠로 찍은 증서 */
function periodWithHolding(): { info: QualInfo; holding: QualHolding } {
  const issuer = newIssuerKey();
  const periodId = crypto.getRandomValues(new Uint8Array(32));
  const seed = newQualSeed();
  const request = blindStampRequest(periodId, qualKeyFromSeed(seed).publicKey);
  const holding = {
    periodId,
    seed,
    stamp: unblindStamp(
      signBlinded(issuer.secretKey, request.blinded),
      request.factor,
    ),
  };
  const info: QualInfo = {
    round: 20,
    periods: [
      {
        id: toHex(periodId),
        affiliation: "11".repeat(32),
        affiliationName: "벌집 성단",
        number: 1,
        startsAt: 0,
        endsAt: 2_000_000_000,
        issuerKey: toBase64Url(issuer.publicKey),
        from: 13,
        issued: 1,
        reissued: 0,
        badge: 2,
        method: "기관 계정",
        open: true,
        verify: "google",
      },
    ],
  };
  return { info, holding };
}

describe("다른 기기에서 복구 코드 불러오기(docs/39 2절 8단계)", () => {
  beforeEach(() => localStorage.clear());

  it("장부의 기간 열쇠로 확인되는 코드면 이 기기에 저장한다", () => {
    const { info, holding } = periodWithHolding();
    importRecoveryCode("t", "L", info, recoveryCode(holding));
    const saved = loadHoldings("t", "L");
    expect(saved).toHaveLength(1);
    expect(toHex(saved[0]?.seed ?? new Uint8Array())).toBe(toHex(holding.seed));
  });

  it("다른 기간 열쇠로 찍은 코드와 장부에 없는 기간의 코드는 거절하고 저장하지 않는다", () => {
    const { info, holding } = periodWithHolding();
    const other = periodWithHolding();
    // 같은 기간 id에 다른 열쇠로 찍은 도장
    const forged = { ...other.holding, periodId: holding.periodId };
    expect(() =>
      importRecoveryCode("t", "L", info, recoveryCode(forged)),
    ).toThrow("도장이 맞지 않는 복구 코드입니다");
    expect(() =>
      importRecoveryCode("t", "L", info, recoveryCode(other.holding)),
    ).toThrow("이 장부에서 지금 쓸 수 있는 자격 기간의 코드가 아닙니다");
    expect(loadHoldings("t", "L")).toEqual([]);
  });
});

describe("이 기기에서 지우기(qual-store)", () => {
  beforeEach(() => localStorage.clear());

  it("그 기간의 자격과 받다가 끊겨 남은 요청(씨앗)을 함께 지운다", () => {
    localStorage.setItem(
      "t-qual",
      JSON.stringify([
        { ledger: "L", periodId: "aa", seed: "s1", stamp: "x" },
        { ledger: "L", periodId: "bb", seed: "s2", stamp: "y" },
      ]),
    );
    localStorage.setItem(
      "t-qual-pending",
      JSON.stringify({
        ledger: "L",
        periodId: "aa",
        seed: "s3",
        factor: "1",
        blinded: "b",
      }),
    );
    removeHolding("t", "L", "aa");
    expect(JSON.parse(localStorage.getItem("t-qual") ?? "[]")).toEqual([
      { ledger: "L", periodId: "bb", seed: "s2", stamp: "y" },
    ]);
    expect(localStorage.getItem("t-qual-pending")).toBeNull();
  });

  it("다른 기간의 남은 요청은 그대로 둔다", () => {
    const pending = {
      ledger: "L",
      periodId: "bb",
      seed: "s3",
      factor: "1",
      blinded: "b",
    };
    localStorage.setItem("t-qual-pending", JSON.stringify(pending));
    removeHolding("t", "L", "aa");
    expect(
      JSON.parse(localStorage.getItem("t-qual-pending") ?? "null"),
    ).toEqual(pending);
  });
});
