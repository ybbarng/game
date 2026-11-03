// @vitest-environment jsdom
import {
  drandRoundForClose,
  drandTime,
  roundTimes,
  type Schedule,
} from "@game/stardraw-core";
import { describe, expect, it, vi } from "vitest";
import type { LedgerStatus } from "../local-ledger";
import { LIVE_LEAD_MS } from "../roulette";
import type { Services } from "../services";
import { broadcastRound, watchRound } from "./BroadcastToast";

// 서버가 있는 운영 빌드처럼(실시간 관측 판정은 서버가 있을 때만 돈다)
vi.mock("../services", async (orig) => ({
  ...(await orig<typeof import("../services")>()),
  serverApi: () => "http://room.test/stardraw-api",
}));

const SCHEDULE: Schedule = {
  epoch: 1_800_000_000,
  entries: [
    {
      fromRound: 1,
      length: 1200,
      closeMargin: 5,
      powTarget: 0xffffffff,
      registerPowTarget: 0xffffffff,
      phase: "trial",
    },
  ],
};
const services = {
  ledger: { schedule: SCHEDULE, record: () => null },
} as unknown as Services;
/** 1회 실시간 관측 연출이 시작하는 시각(ms). 기록이 아직 없으면 연출 길이를 46초로 본다 */
const showStart =
  drandTime(drandRoundForClose(roundTimes(SCHEDULE, 1).closesAt)) * 1000 +
  LIVE_LEAD_MS;
/** 1회 관측 1분 중(기록은 있지만 2회가 아직 열리지 않음)의 장부 상태 */
const waiting = (nowMs: number) =>
  ({
    phase: "waiting",
    round: 2,
    nextDrawRound: 1,
    now: nowMs / 1000,
  }) as unknown as LedgerStatus;

describe("방송할 회차", () => {
  it("실시간 관측 연출 중에는 그 회차를 방송한다", () => {
    expect(broadcastRound(services, waiting(showStart + 10_000))).toBe(1);
  });

  it("연출이 끝난 뒤 장부가 다음 회차를 열기 전에는 방송하지 않는다(홈에 잠깐 내려왔다 사라지던 잔상)", () => {
    const after = waiting(showStart + 46_000 + 1000);
    // 바탕이 된 판정은 아직 그 회차를 「지금 관측할 회차」로 본다
    expect(watchRound(services, after)).toBe(1);
    expect(broadcastRound(services, after)).toBeNull();
  });
});
