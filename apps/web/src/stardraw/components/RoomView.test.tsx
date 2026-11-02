// @vitest-environment jsdom
import {
  drandRoundForClose,
  drandTime,
  emptyWinners,
  type RoundRecord,
  roundTimes,
  type Schedule,
  toBase64Url,
} from "@game/stardraw-core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MARKS_DELAY_MS } from "../after-observe";
import { drawOrder } from "../results";
import { LIVE_LEAD_MS, LIVE_ROULETTE_TIMING, planRoulette } from "../roulette";
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

/** 방 스트림 흉내: 인사(언덕 아래에서 보는 연결 수 watchers) 다음에 별똥별 응원 하나, 그 뒤로는 열어 둔다 */
function roomStream(watchers = 1): Response {
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
      watchers,
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

/** 관측지 RoomView를 그린다(방 스트림은 흉내, 언덕 아래 연결 수만 바꾼다) */
function renderRoom(watchers: number) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    String(input).endsWith("/events")
      ? roomStream(watchers)
      : new Response("{}", { status: 404 }),
  );
  return render(
    <RoomView
      api="http://room.test/stardraw-api"
      services={services}
      round={1}
      record={undefined}
      ticket={undefined}
      onEnter={() => {}}
    />,
  );
}

/*
 * 관측지 사람 수(2026-11-02 사용자: 머리 줄보다 별자리 밑, 언덕의 우주인들 곁에). 언덕 위 얼굴과 언덕 아래에서 보는
 * 연결을 더한 수를 언덕 머리에 두고, 나 혼자면 「아직 언덕에 다른 우주인이 오지 않았어요.」만 둔다
 */
describe("관측지 사람 수", () => {
  it("여럿이면 언덕 머리에 「관측지에 N명이 있어요.」", async () => {
    const view = renderRoom(3);
    await waitFor(() => {
      expect(view.container.querySelector("[data-room-count]")).not.toBeNull();
    });
    const count = view.container.querySelector("[data-room-count]");
    expect(count?.textContent).toBe("관측지에 3명이 있어요.");
    expect(count?.closest("[data-room-hill]")).not.toBeNull();
  });

  it("나 혼자면 사람 수 없이 언덕이 비었다는 말만", async () => {
    const view = renderRoom(1);
    await waitFor(() => {
      expect(view.container.textContent).toContain(
        "아직 언덕에 다른 우주인이 오지 않았어요.",
      );
    });
    expect(view.container.querySelector("[data-room-count]")).toBeNull();
  });
});

/*
 * 관측이 끝난 뒤(docs/36 11-44): 언덕 위 얼굴의 등수 표지와 최고 등수 금빛 테두리, 1~3등의 관측 뒤 첫 말은
 * 하늘 가운데 소감으로. 서버 시각(인사의 serverTime)을 관측 연출이 끝난 뒤로 두고 흉내 스트림으로 본다
 */
describe("관측이 끝난 뒤", () => {
  /** 회차 1의 관측 기록: drand 값으로 정해지는 당첨 번호를 그대로 싣는다 */
  function observed(): RoundRecord {
    const base = {
      v: 1,
      round: 1,
      void: false,
      drandRound: 1,
      drandSignature: new Uint8Array(48).fill(7),
      winners: emptyWinners(),
    } as unknown as RoundRecord;
    const order = drawOrder(base);
    return {
      ...base,
      numbers: order.slice(0, 6).sort((a, b) => a - b),
      bonus: order[6] as number,
    };
  }
  const record = observed();
  const times = roundTimes(SCHEDULE, 1);
  const showEnd =
    drandTime(drandRoundForClose(times.closesAt)) * 1000 +
    LIVE_LEAD_MS +
    planRoulette(drawOrder(record), LIVE_ROULETTE_TIMING).totalMs;
  /** 등수 표지가 붙은 뒤의 서버 시각 */
  const later = showEnd + MARKS_DELAY_MS + 1000;
  const others = Array.from({ length: 45 }, (_, i) => i + 1).filter(
    (n) => !record.numbers.includes(n) && n !== record.bonus,
  );
  const pub = (seed: number) =>
    toBase64Url(new Uint8Array(33).fill(seed).map((b, i) => (b + i) % 256));
  /** a 1등, b 4등, c 낙첨 */
  const byPerson = {
    a: [...record.numbers],
    b: [...record.numbers.slice(0, 4), ...others.slice(0, 2)],
    c: others.slice(2, 8),
  };
  const people = ["a", "b", "c"].map((id, i) => ({
    id,
    pub: pub(i + 1),
    entered: true,
  }));

  function stream(me: string | null, events: unknown[]): Response {
    const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
    const text =
      ev({
        type: "hello",
        serverTime: later,
        round: 1,
        drawAt: 0,
        entryDeadline: 0,
        closesAt: 0,
        me,
        people,
        watchers: 0,
        sealed: true,
        drawn: true,
        picks: { counts: {}, byPerson },
      }) + events.map(ev).join("");
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
      },
    });
    return new Response(body, { status: 200 });
  }

  function renderAfter(me: string | null, events: unknown[]) {
    if (me)
      sessionStorage.setItem(
        "stardraw-room-pass-1",
        JSON.stringify({ pass: "p", id: me }),
      );
    else sessionStorage.clear();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/events")
        ? stream(me, events)
        : new Response("{}", { status: 404 }),
    );
    return render(
      <RoomView
        api="http://room.test/stardraw-api"
        services={services}
        round={1}
        record={record}
        ticket={undefined}
        onEnter={() => {}}
      />,
    );
  }
  const say = (id: string, from: string, text: string) => ({
    type: "say",
    id,
    from,
    text,
    at: later,
  });

  it("당첨된 얼굴에만 등수 표지, 가장 높은 등수는 금빛", async () => {
    const view = renderAfter(null, []);
    await waitFor(() => {
      expect(view.container.querySelector("[data-face-rank]")).not.toBeNull();
    });
    const marks = [...view.container.querySelectorAll("[data-face-rank]")].map(
      (m) => m.textContent,
    );
    expect(marks).toEqual(["1등", "4등"]);
    const best = [...view.container.querySelectorAll("[data-face-best]")];
    expect(best.map((f) => f.getAttribute("data-face"))).toEqual(["a"]);
    expect(best[0]?.classList.contains("sd-room-face-best")).toBe(true);
  });

  it("1등의 관측 뒤 첫 말은 하늘 가운데 소감, 두 번째 말과 4등의 말은 풍등", async () => {
    const view = renderAfter("c", [
      say("1-1", "a", "드디어 별을 맞혔어요"),
      say("1-2", "a", "모두 고마워요"),
      say("1-3", "b", "축하해요"),
    ]);
    await waitFor(() => {
      expect(view.container.querySelector("[data-speech]")).not.toBeNull();
    });
    const speech = view.container.querySelector("[data-speech]") as HTMLElement;
    expect(speech.getAttribute("data-speech")).toBe("1");
    expect(speech.textContent).toContain("드디어 별을 맞혔어요");
    expect(speech.textContent).toContain("1등");
    // 같은 사람의 두 번째 말은 보통 풍등(4등의 말은 옆 풍등이 비켜날 때까지 기다렸다 떠서 여기서는 소감이 아닌 것만 본다)
    await waitFor(() => {
      expect(
        view.container.querySelector("[data-lantern='a']:not([data-speech])")
          ?.textContent,
      ).toBe("모두 고마워요");
    });
    expect(view.container.querySelectorAll("[data-speech]")).toHaveLength(1);
    // 소감도 길게 누르면 풍등처럼 신고 창
    fireEvent.contextMenu(speech);
    expect(
      view.container.querySelector("[data-room-menu]")?.textContent,
    ).toContain("신고");
  });

  it("내가 1~3등이면 관측 뒤 첫 말 전까지 말하기 칸이 소감을 청한다", async () => {
    const view = renderAfter("a", []);
    await waitFor(() => {
      expect(
        view.container
          .querySelector("[data-room-input]")
          ?.getAttribute("placeholder"),
      ).toBe("입상 소감을 남겨 보세요");
    });
  });

  it("4등이면 말하기 칸은 그대로", async () => {
    const view = renderAfter("b", []);
    await waitFor(() => {
      expect(view.container.querySelector("[data-face-rank]")).not.toBeNull();
    });
    expect(
      view.container
        .querySelector("[data-room-input]")
        ?.getAttribute("placeholder"),
    ).toBe("말하기");
  });
});
