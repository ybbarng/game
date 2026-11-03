// @vitest-environment node
import { ManualClock } from "@game/fair-play";
import {
  acceptFrom,
  DEFAULT_WEBAUTHN_POLICY,
  OBSERVE_SECONDS,
} from "@game/stardraw-core";
import { describe, expect, it } from "vitest";

import { type LedgerStore, LocalLedger } from "./local-ledger";
import { clockOf, roundCardText } from "./round-card";

// 2026-10-29 14:55 KST. 1회차 마감 15:55, 관측 16:00
const START = 1793253300;
const HOUR = 3600;

function setup(ticketRounds: number[] = []) {
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
  const card = () =>
    roundCardText(ledger.schedule, ledger.status(), (r) =>
      ticketRounds.includes(r),
    );
  return { clock, ledger, card };
}

describe("홈 회차 카드", () => {
  it("마감 뒤에는 관측까지 세고, 관측 시각이 지나면 0:00에 멈추지 않고 관측 중이라고 말한다", async () => {
    const { clock, ledger, card } = setup();
    expect(card()).toMatchObject({
      round: 1,
      state: "open",
      countdown: { kind: "close" },
    });
    // 1회차 마감(15:55): 장부는 2회차·waiting, 카드는 1회차
    clock.advance(HOUR * 1000);
    await ledger.settle();
    expect(ledger.status()).toMatchObject({ round: 2, phase: "waiting" });
    expect(card()).toMatchObject({
      round: 1,
      state: "drawing",
      headline: "1회 예측을 마감했어요.",
      countdown: { label: "관측까지", kind: "draw", left: 300 },
    });
    // 관측 1초 전까지는 센다
    clock.advance(299 * 1000);
    expect(card()).toMatchObject({
      state: "drawing",
      countdown: { left: 1 },
    });
    // 관측 시각 그 순간부터 관측 1분 동안(기록이 아직 장부에 안 들어와도)
    clock.advance(1000);
    const nextOpens = acceptFrom(ledger.schedule, 2);
    const observing = {
      round: 1,
      state: "observing",
      headline: "지금 1회 관측 중이에요.",
      noteKey: "observing-none",
      countdown: null,
      foot: `다음 회차는 ${clockOf(nextOpens)}부터 예측할 수 있어요.`,
    };
    expect(card()).toMatchObject(observing);
    await ledger.settle();
    clock.advance((OBSERVE_SECONDS - 1) * 1000);
    expect(ledger.status()).toMatchObject({ round: 2, phase: "waiting" });
    expect(card()).toMatchObject(observing);
    // 다음 회차 접수가 열리면 다음 회차 카드
    clock.advance(1000);
    expect(card()).toMatchObject({
      round: 2,
      state: "open",
      headline: "지금 2회 예측을 받고 있어요.",
    });
  });

  it("예측서를 냈으면 관측 중에도 관측지로 이끈다", async () => {
    const { clock, ledger, card } = setup([1]);
    expect(card()).toMatchObject({ state: "entered", noteKey: "open-entered" });
    clock.advance(HOUR * 1000);
    await ledger.settle();
    expect(card()).toMatchObject({
      state: "drawing",
      noteKey: "closed-entered",
    });
    clock.advance(300 * 1000);
    expect(card()).toMatchObject({
      state: "observing",
      noteKey: "observing-entered",
      note: "관측지에서 함께 지켜봐 주세요.",
      countdown: null,
    });
  });
});
