// @vitest-environment jsdom
import {
  drandRoundForClose,
  drandTime,
  roundTimes,
  type Schedule,
} from "@game/stardraw-core";
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetBuzzed } from "../haptics";
import type { LedgerStatus } from "../local-ledger";
import { LIVE_LEAD_MS } from "../roulette";
import type { Services } from "../services";
import {
  BROADCAST_DELAY_MS,
  BroadcastToast,
  broadcastRound,
  watchRound,
} from "./BroadcastToast";

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

/*
 * 방송 토스트 진동(docs/36 11-70): 내려오는 순간 [30, 80, 30] 한 번. 회차마다 한 번이라 화면을 옮겨 다시 내려와도,
 * 관측 안내로 문구가 바뀌어도 다시 울리지 않는다. 관측지에 있어(토스트를 띄우지 않으면) 울리지 않는다
 */
describe("방송 토스트 진동", () => {
  let calls: unknown[];
  beforeEach(() => {
    calls = [];
    forgetBuzzed();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (p: unknown) => {
        calls.push(p);
        return true;
      },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "vibrate");
  });
  /** 1회 마감 직후(관측 5분 전쯤)의 장부 상태 */
  const closing = (nowMs: number) =>
    ({
      phase: "closing",
      round: 1,
      now: nowMs / 1000,
    }) as unknown as LedgerStatus;
  const toast = (status: LedgerStatus, screen: string, hidden = false) =>
    createElement(BroadcastToast, {
      services,
      status,
      hidden,
      settled: true,
      screen,
      onGo: () => {},
    });

  it("내려오는 순간 한 번, 화면을 옮겨 다시 내려오거나 문구가 바뀌어도 그 회차에는 다시 울리지 않는다", () => {
    const view = render(toast(closing(showStart - 300_000), "home"));
    expect(calls).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(BROADCAST_DELAY_MS);
    });
    expect(view.container.querySelector("[data-broadcast='1']")).not.toBeNull();
    expect(calls).toEqual([[30, 80, 30]]);
    // 다른 화면으로: 다시 쉰 뒤 내려온다
    view.rerender(toast(closing(showStart - 290_000), "mine"));
    act(() => {
      vi.advanceTimersByTime(BROADCAST_DELAY_MS);
    });
    expect(view.container.querySelector("[data-broadcast='1']")).not.toBeNull();
    // 관측 안내(15초 전)부터: 관측지로 부르는 문구로 바뀐다
    view.rerender(toast(closing(showStart - 14_000), "mine"));
    expect(view.container.textContent).toContain(
      "시험 1회 관측이 시작됩니다. 우주인 여러분은",
    );
    expect(calls).toEqual([[30, 80, 30]]);
  });

  it("관측지에 있으면(토스트를 띄우지 않으면) 울리지 않는다", () => {
    render(toast(closing(showStart - 300_000), "room", true));
    act(() => {
      vi.advanceTimersByTime(BROADCAST_DELAY_MS);
    });
    expect(calls).toEqual([]);
  });
});
