// @vitest-environment node
import { ManualClock } from "@game/fair-play";
import {
  acceptFrom,
  DEFAULT_WEBAUTHN_POLICY,
  OBSERVE_SECONDS,
} from "@game/stardraw-core";
import { describe, expect, it } from "vitest";

import { gateClock, gateStatusLine } from "./gate-status";
import { type LedgerStore, LocalLedger } from "./local-ledger";

// 2026-10-29 14:55 KST. 1회차 마감 15:55, 관측 16:00
const START = 1793253300;
const HOUR = 3600;

function setup() {
  const clock = new ManualClock();
  clock.advance(START * 1000);
  let text: string | null = null;
  const store: LedgerStore = {
    load: () => text,
    save: (t) => {
      text = t;
    },
  };
  const ledger = new LocalLedger({
    clock,
    store,
    policy: DEFAULT_WEBAUTHN_POLICY,
    random: (n) => new Uint8Array(n).fill(7),
    bots: 0,
  });
  const line = () => gateStatusLine(ledger.schedule, ledger.status(), null);
  return { clock, ledger, line };
}

describe("홈 상태 줄", () => {
  it("앞 회차 마감부터 다음 회차 접수 전까지는 앞 회차를 말한다", async () => {
    const { clock, ledger, line } = setup();
    expect(line()).toBe("지금 1회 예측을 받고 있어요 · 마감까지 59:55");
    // 1회차 마감(15:55): 장부는 2회차·waiting을 준다
    clock.advance(HOUR * 1000);
    await ledger.settle();
    expect(ledger.status()).toMatchObject({ round: 2, phase: "waiting" });
    expect(line()).toBe("1회 예측을 마감했어요 · 관측까지 5:00");
    // 관측 시각이 지나 관측 1분 중이면 관측 안내와 다음 회차 접수 시각
    clock.advance((5 * 60 + 3) * 1000);
    await ledger.settle();
    expect(ledger.status()).toMatchObject({ round: 2, phase: "waiting" });
    expect(line()).toBe(
      `지금 1회 관측 중이에요 · 2회 예측은 ${gateClock(acceptFrom(ledger.schedule, 2))}부터`,
    );
    clock.advance(OBSERVE_SECONDS * 1000);
    expect(line()).toMatch(/^지금 2회 예측을 받고 있어요 · 마감까지 /);
  });

  it("실시간 관측 중이면 그 회차를 말한다", () => {
    const { ledger } = setup();
    expect(gateStatusLine(ledger.schedule, ledger.status(), 1)).toBe(
      "지금 1회 관측 중이에요.",
    );
  });
});
