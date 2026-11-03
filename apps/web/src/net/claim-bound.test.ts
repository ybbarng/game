import { describe, expect, it } from "vitest";

import { claimBound, lateClaimAccepted } from "./claim-bound";

describe("claimBound: 아래 경계와 깎기(docs/43 1-2)", () => {
  // 손님 청구를 방장이 확인. 편도 30ms씩(RTT 60), 그리기 10ms, 사람 rt 250ms → a − s = 30 + 10 + 250 + 30 = 320
  const honest = { elapsedMs: 320, rttMinMs: 60, rtReportedMs: 250 };

  it.each([
    // [설명, 입력, 기대 깎인 양, 어겼나]
    ["정직: 여분 10ms는 여유 30 안", { ...honest, slackMs: 30 }, 0, false],
    [
      "여유 0이면 정직해도 그리기만큼 깎인다",
      { ...honest, slackMs: 0 },
      10,
      true,
    ],
    [
      "여분이 여유를 1ms 넘게 rt를 깎으면 그 1ms가 되돌려진다",
      { ...honest, rtReportedMs: 250 - 21, slackMs: 30 },
      1,
      true,
    ],
    [
      "여유 안쪽 거짓은 통과(남는 한계)",
      { ...honest, rtReportedMs: 250 - 20, slackMs: 30 },
      0,
      false,
    ],
    [
      "rt를 100 깎으면 여유를 넘는 80만큼 되돌린다",
      { ...honest, rtReportedMs: 150, slackMs: 30 },
      80,
      true,
    ],
    [
      "빈틈 1: 핑 답을 100 늦춰 RTT_min 160이면 100 깎은 rt가 그대로 통과",
      { elapsedMs: 320, rttMinMs: 160, rtReportedMs: 150, slackMs: 30 },
      0,
      false,
    ],
    [
      "같은 청구를 getStats RTT(60) 기준으로 보면 잡힌다",
      { elapsedMs: 320, rttMinMs: 60, rtReportedMs: 150, slackMs: 30 },
      80,
      true,
    ],
    [
      "방장 청구를 손님이 확인(RTT 0): 편도 차이만 남는다",
      { elapsedMs: 255, rttMinMs: 0, rtReportedMs: 250, slackMs: 20 },
      0,
      false,
    ],
    [
      "빈틈 2: 방장이 자극을 100 늦게 보내고 rt를 100 깎으면 그 손님 확인은 통과",
      { elapsedMs: 155, rttMinMs: 0, rtReportedMs: 150, slackMs: 20 },
      0,
      false,
    ],
    [
      "제때 받은 다른 손님의 확인에는 걸린다",
      { elapsedMs: 255, rttMinMs: 0, rtReportedMs: 150, slackMs: 20 },
      85,
      true,
    ],
  ])("%s", (_name, input, clipped, violated) => {
    const result = claimBound(input);
    expect(result.clippedMs).toBe(clipped);
    expect(result.violated).toBe(violated);
    expect(result.allowedRtMs).toBe(
      Math.max(input.rtReportedMs, result.lowerMs),
    );
    expect(result.lowerMs).toBe(
      input.elapsedMs - input.rttMinMs - input.slackMs,
    );
  });

  it("늦게 닿은 정직한 청구는 버리지 않고 앞섬만 줄인다", () => {
    // 청구가 앞 막힘으로 300ms 늦음
    const late = claimBound({
      elapsedMs: 620,
      rttMinMs: 60,
      rtReportedMs: 250,
      slackMs: 30,
    });
    expect(late.allowedRtMs).toBe(530);
    expect(late.excessMs).toBe(310);
  });
});

describe("lateClaimAccepted: 지난 판 청구를 받는 시간(docs/43 2-2)", () => {
  it.each([
    [1000 + 60 + 30, true],
    [1000 + 60 + 31, false],
    [900, true],
  ])("도착 %d → %s", (arrivedAtMs, ok) => {
    expect(
      lateClaimAccepted({
        nextSentAtMs: 1000,
        arrivedAtMs,
        rttMinMs: 60,
        slackMs: 30,
      }),
    ).toBe(ok);
  });
});
