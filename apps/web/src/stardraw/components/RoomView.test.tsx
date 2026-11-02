// @vitest-environment jsdom
import type { Schedule } from "@game/stardraw-core";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Services } from "../services";

/*
 * 관측지의 별똥별(2026-11-02 사용자: 「별똥별 보내기 화면에 안 보이던데」). 방 스트림에 별똥별 응원이 오면
 * 하늘 위에 머리와 꼬리가 있는 별똥별이 생기는지를 본다. 서버 대신 흉내 낸 스트림을 쓴다
 */

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

/** 방 스트림 흉내: 인사 다음에 별똥별 응원 하나, 그 뒤로는 열어 둔다 */
function roomStream(): Response {
  const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const text =
    ev({
      type: "hello",
      serverTime: Date.now(),
      round: 1,
      drawAt: 0,
      entryDeadline: 0,
      closesAt: 0,
      me: null,
      people: [],
      watchers: 1,
      sealed: false,
      drawn: false,
      picks: null,
    }) + ev({ type: "cheer", from: "someone", kind: "meteor", to: null });
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
    },
  });
  return new Response(body, { status: 200 });
}

const services = {
  ns: "stardraw",
  ledger: {
    schedule: SCHEDULE,
    status: () => ({ phase: "open" }),
    isRegistered: async () => false,
  },
  wallet: { loadKey: () => null, loadProof: () => null },
} as unknown as Services;

let RoomView: typeof import("./RoomView").RoomView;

beforeAll(async () => {
  // 하늘 판(캔버스)과 크기 관찰은 jsdom에 없어 그리지 않는다
  HTMLCanvasElement.prototype.getContext = () => null;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  ({ RoomView } = await import("./RoomView"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("관측지 별똥별", () => {
  it("방 스트림에 별똥별 응원이 오면 하늘 위에 머리와 꼬리가 있는 별똥별이 생긴다", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/events")
        ? roomStream()
        : new Response("{}", { status: 404 }),
    );
    const view = render(
      <RoomView
        api="http://room.test/stardraw-api"
        services={services}
        round={1}
        record={undefined}
        ticket={undefined}
        onEnter={() => {}}
      />,
    );
    await waitFor(() => {
      expect(view.container.querySelector("[data-room-meteor]")).not.toBeNull();
    });
    const meteor = view.container.querySelector(
      "[data-room-meteor]",
    ) as HTMLElement;
    expect(meteor.querySelector(".sd-room-meteor-streak")).not.toBeNull();
  });
});
