// @vitest-environment jsdom
import { ManualClock } from "@game/fair-play";
import {
  drandRoundForClose,
  drandTime,
  emptyWinners,
  type RoundRecord,
  roundTimes,
  type Schedule,
  toBase64Url,
} from "@game/stardraw-core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
function roomStream(watchers = 1, extra: object = {}): Response {
  const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const text =
    ev({
      ...extra,
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
let LANTERN_MS = 0;
let LANTERN_CLEAR_MS = 0;
let METEOR_MS = 0;
let CHEER_SPREAD_MS = 0;
let CHEER_METEORS_MAX = 0;

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
  ({
    RoomView,
    LANTERN_MS,
    LANTERN_CLEAR_MS,
    METEOR_MS,
    CHEER_SPREAD_MS,
    CHEER_METEORS_MAX,
  } = await import("./RoomView"));
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

  it("출발점의 가로·세로와 기울기를 따로 뽑는다(늘 같은 대각선에서만 떨어지지 않게)", async () => {
    // 뽑는 차례: 열쇠 x, 가로 x, 세로 y, 기울기
    const draws = [0.1, 0.9, 0.1, 0.5];
    vi.spyOn(Math, "random").mockImplementation(() => draws.shift() ?? 0.5);
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
    const style = (
      view.container.querySelector("[data-room-meteor]") as HTMLElement
    ).style;
    expect(style.left).toBe("54%");
    expect(style.top).toBe("8%");
    expect(style.transform).toBe("rotate(24deg)");
  });
});

/*
 * 기기 시계(clock 주입): 풍등이 차례로 뜨고 사라지는 때, 별똥별이 사라지는 때, 끊긴 스트림을 다시 잇는 때를
 * ManualClock으로 정확한 순간에 일으킨다(실제 시간을 기다리지 않는다)
 */
describe("관측지 기기 시계", () => {
  const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const hello = (people: unknown[] = []) =>
    ev({
      type: "hello",
      serverTime: Date.now(),
      round: 1,
      drawAt: 0,
      entryDeadline: 0,
      closesAt: 0,
      me: null,
      people,
      watchers: 1,
      sealed: false,
      drawn: false,
      picks: null,
    });
  /** 흉내 스트림. `end`면 보낸 뒤 닫는다(서버가 끊은 것처럼) */
  const body = (text: string, end = false) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(text));
          if (end) c.close();
        },
      }),
      { status: 200 },
    );
  function renderWith(clock: ManualClock, streams: () => Response) {
    const events = vi.fn(streams);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/events")
        ? events()
        : new Response("{}", { status: 404 }),
    );
    sessionStorage.clear();
    const view = render(
      <RoomView
        api="http://room.test/stardraw-api"
        services={services}
        round={1}
        record={undefined}
        ticket={undefined}
        onEnter={() => {}}
        clock={clock}
      />,
    );
    return { view, events };
  }

  it("가까운 자리의 풍등은 앞 풍등이 비켜날 때까지 기다렸다 뜨고, 뜬 지 LANTERN_MS 뒤 사라진다", async () => {
    const clock = new ManualClock();
    const people = ["a", "b"].map((id, i) => ({
      id,
      pub: toBase64Url(new Uint8Array(33).fill(i + 1)),
      entered: false,
    }));
    const at = Date.now();
    const { view } = renderWith(clock, () =>
      body(
        hello(people) +
          ev({ type: "say", id: "1-1", from: "a", text: "첫 말", at }) +
          ev({ type: "say", id: "1-2", from: "b", text: "둘째 말", at }),
      ),
    );
    const lantern = (from: string) =>
      view.container.querySelector(`[data-lantern='${from}']`);
    // 두 말을 받으면 첫 풍등은 바로(0ms 뒤) 뜬다
    await waitFor(() => {
      act(() => clock.advance(0));
      expect(lantern("a")).not.toBeNull();
    });
    // jsdom은 자리가 모두 0이라 둘째 풍등은 같은 자리 → 첫 풍등이 비켜날 때까지 기다린다
    expect(lantern("b")).toBeNull();
    act(() => clock.advance(LANTERN_CLEAR_MS - 1));
    expect(lantern("b")).toBeNull();
    act(() => clock.advance(1));
    expect(lantern("b")).not.toBeNull();
    act(() => clock.advance(LANTERN_MS - LANTERN_CLEAR_MS - 1));
    expect(lantern("a")).not.toBeNull();
    act(() => clock.advance(1));
    expect(lantern("a")).toBeNull();
    expect(lantern("b")).not.toBeNull();
  });

  it("별똥별은 METEOR_MS 동안만 하늘에 있다", async () => {
    const clock = new ManualClock();
    const { view } = renderWith(clock, () =>
      body(
        hello() + ev({ type: "cheer", from: "x", kind: "meteor", to: null }),
      ),
    );
    const meteor = () => view.container.querySelector("[data-room-meteor]");
    await waitFor(() => expect(meteor()).not.toBeNull());
    act(() => clock.advance(METEOR_MS - 1));
    expect(meteor()).not.toBeNull();
    act(() => clock.advance(1));
    expect(meteor()).toBeNull();
  });

  it("묶은 응원은 CHEER_SPREAD_MS에 고르게 펼치고, 별똥별은 CHEER_METEORS_MAX개까지", async () => {
    const clock = new ManualClock();
    const { view } = renderWith(clock, () =>
      body(hello() + ev({ type: "cheers", meteor: 40, twinkle: {} })),
    );
    const meteors = () =>
      view.container.querySelectorAll("[data-room-meteor]").length;
    await waitFor(() => expect(meteors()).toBe(1));
    const step = CHEER_SPREAD_MS / CHEER_METEORS_MAX;
    act(() => clock.advance(step - 1));
    expect(meteors()).toBe(1);
    act(() => clock.advance(1));
    expect(meteors()).toBe(2);
    act(() => clock.advance(step * (CHEER_METEORS_MAX - 2)));
    expect(meteors()).toBe(CHEER_METEORS_MAX);
    // 첫 별똥별이 사라질 때까지 더 늘지 않는다
    act(() => clock.advance(METEOR_MS - step * (CHEER_METEORS_MAX - 1) - 1));
    expect(meteors()).toBe(CHEER_METEORS_MAX);
    act(() => clock.advance(1));
    expect(meteors()).toBe(CHEER_METEORS_MAX - 1);
  });

  it("스트림이 끊기면 2초 뒤에 다시 잇는다", async () => {
    const clock = new ManualClock();
    const { events } = renderWith(clock, () => body(hello(), true));
    // 끊김을 받으면 다시 잇기를 시계에 걸어 둔다
    await waitFor(() => expect(clock.pending()).toBe(1));
    expect(events).toHaveBeenCalledTimes(1);
    act(() => clock.advance(1999));
    expect(events).toHaveBeenCalledTimes(1);
    act(() => clock.advance(1));
    expect(events).toHaveBeenCalledTimes(2);
  });
});

/** 관측지 RoomView를 그린다(방 스트림은 흉내, 언덕 아래 연결 수만 바꾼다) */
function renderRoom(
  watchers: number,
  svc: Services = services,
  extra: object = {},
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    String(input).endsWith("/events")
      ? roomStream(watchers, extra)
      : new Response("{}", { status: 404 }),
  );
  return render(
    <RoomView
      api="http://room.test/stardraw-api"
      services={svc}
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

  it("마감 전에 온 사람에게도 관측까지 남은 시간을 알린다", async () => {
    const view = renderRoom(1);
    await waitFor(() => {
      expect(
        view.container.querySelector("[data-room-phase='open']")?.textContent,
      ).toMatch(/^지금 시험 1회 예측을 받고 있습니다\. 관측까지 \d+:\d\d/);
    });
    // 회차 이름은 상태 줄 한 곳에만(따로 회차 줄을 두지 않는다, 2026-11-03 사용자)
    expect(view.container.textContent?.match(/시험 1회/g)).toHaveLength(1);
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
 * 언덕 나누기(docs/36 11-56): 예전 서버(인사에 hill 없음)와 언덕 하나는 화면이 그대로이고, 언덕이 둘 이상일 때만 내 언덕 이름을
 * 언덕 머리에 두며 사람 수는 모든 언덕의 얼굴 + 보는 연결
 */
describe("관측지 언덕 나누기", () => {
  it("인사에 언덕이 없거나(예전 서버) 하나면 언덕 이름을 두지 않는다", async () => {
    for (const extra of [{}, { hill: 1, hills: 1, faces: 0 }]) {
      const view = renderRoom(3, services, extra);
      await waitFor(() => {
        expect(
          view.container.querySelector("[data-room-count]")?.textContent,
        ).toBe("관측지에 3명이 있어요.");
      });
      expect(view.container.querySelector("[data-room-hill-name]")).toBeNull();
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("언덕이 둘 이상이면 내 언덕 이름, 사람 수는 모든 언덕의 얼굴 + 보는 연결", async () => {
    const view = renderRoom(10, services, { hill: 2, hills: 3, faces: 50 });
    await waitFor(() => {
      expect(
        view.container.querySelector("[data-room-hill-name]")?.textContent,
      ).toBe("2번 언덕");
    });
    const name = view.container.querySelector("[data-room-hill-name]");
    expect(name?.closest("[data-room-hill]")).not.toBeNull();
    expect(view.container.querySelector("[data-room-count]")?.textContent).toBe(
      "관측지에 60명이 있어요.",
    );
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

  function stream(
    me: string | null,
    events: unknown[],
    extra: object = {},
    who: unknown[] = people,
  ): Response {
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
        people: who,
        watchers: 0,
        sealed: true,
        drawn: true,
        picks: { counts: {}, byPerson },
        ...extra,
      }) + events.map(ev).join("");
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
      },
    });
    return new Response(body, { status: 200 });
  }

  function renderAfter(
    me: string | null,
    events: unknown[],
    extra: object = {},
    who: unknown[] = people,
  ) {
    if (me)
      sessionStorage.setItem(
        "stardraw-room-pass-1",
        JSON.stringify({ pass: "p", id: me }),
      );
    else sessionStorage.clear();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/events")
        ? stream(me, events, extra, who)
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

  it("언덕에 오르기는 관측 전에는 권장 단추, 끝난 뒤에는 평범한 단추(다음 회차 예측이 권장)", async () => {
    const before = renderRoom(3, services);
    await waitFor(() => {
      expect(
        before.container
          .querySelector("[data-room-join]")
          ?.getAttribute("data-room-join"),
      ).toBe("cta");
    });
    cleanup();
    vi.restoreAllMocks();
    const view = renderAfter(null, []);
    await waitFor(() => {
      expect(
        view.container
          .querySelector("[data-room-join]")
          ?.getAttribute("data-room-join"),
      ).toBe("plain");
    });
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

  it("다른 언덕에서 온 말은 입상 소감만 띄운다(얼굴이 없어도 실려 온 공개 열쇠와 고른 별로)", async () => {
    const view = renderAfter(
      "c",
      [
        // 서버는 다른 언덕의 1~3등 말만 건네지만, 그 밖의 말이 와도 띄우지 않는다
        { ...say("1-1", "y", "다른 언덕 이야기"), hill: 2 },
        {
          ...say("1-2", "z", "2번 언덕에서 1등"),
          hill: 2,
          pub: pub(9),
          picks: [...record.numbers],
        },
        { ...say("1-3", "b", "축하해요"), hill: 1 },
      ],
      { hill: 1, hills: 2, faces: 5 },
    );
    await waitFor(() => {
      expect(
        view.container.querySelector("[data-speech]")?.textContent,
      ).toContain("2번 언덕에서 1등");
    });
    // 내 언덕의 말은 풍등. 그보다 먼저 온 다른 언덕의 말은 뜨지 않았다
    await waitFor(() => {
      expect(view.container.querySelector("[data-lantern='b']")).not.toBeNull();
    });
    expect(view.container.querySelector("[data-lantern='y']")).toBeNull();
  });

  it("국장은 다른 언덕의 말도 풍등으로, 언덕이 둘 이상이면 언덕 번호를 붙인다", async () => {
    const view = renderAfter(
      "d",
      [{ ...say("1-1", "y", "광고입니다"), hill: 2 }],
      { hill: 1, hills: 2, faces: 5 },
      [...people, { id: "d", pub: pub(7), entered: false, director: true }],
    );
    await waitFor(() => {
      expect(
        view.container.querySelector("[data-lantern='y'] [data-lantern-hill]")
          ?.textContent,
      ).toBe("2번 언덕");
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

  it("말하는 동안 키보드가 올라오면 키보드 위 칸에 하늘·얼굴 한 줄·입력 칸만, 초점이 빠지면 원래대로(docs/36 11-61)", async () => {
    // jsdom에는 visualViewport가 없어 흉내 낸다: 키보드가 올라오면 보이는 높이가 844 → 450
    const vv = Object.assign(new EventTarget(), {
      width: 390,
      height: 844,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", {
      value: vv,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 844,
      configurable: true,
    });
    try {
      const view = renderAfter("c", []);
      await waitFor(() => {
        expect(
          view.container.querySelector("[data-room-input]"),
        ).not.toBeNull();
      });
      const input = view.container.querySelector(
        "[data-room-input]",
      ) as HTMLInputElement;
      const typing = () => view.container.querySelector("[data-room-typing]");
      // 초점만으로는(PC처럼 키보드가 없으면) 바뀌지 않는다
      fireEvent.focus(input);
      expect(typing()).toBeNull();
      act(() => {
        vv.height = 450;
        vv.dispatchEvent(new Event("resize"));
      });
      const box = typing() as HTMLElement;
      expect(box).not.toBeNull();
      expect(box.style.top).toBe("0px");
      expect(box.style.height).toBe("450px");
      // 머리 줄·상태 줄은 숨기고, 하늘·얼굴·입력 칸은 남긴다
      expect(
        view.container.querySelector("[data-room-title]")?.parentElement
          ?.classList,
      ).toContain("hidden");
      expect(
        view.container.querySelector("[data-room-phase]")?.classList,
      ).toContain("hidden");
      expect(
        (view.container.querySelector("[data-room-sky]") as HTMLElement).style
          .width,
      ).toBe("min(100cqw, 100cqh)");
      expect(view.container.querySelector("[data-face]")?.classList).toContain(
        "size-9",
      );
      expect(input.closest("[data-room-typing]")).toBe(box);

      fireEvent.blur(input);
      expect(typing()).toBeNull();
      expect(
        view.container.querySelector("[data-room-phase]")?.classList,
      ).not.toContain("hidden");
    } finally {
      Object.defineProperty(window, "visualViewport", {
        value: undefined,
        configurable: true,
      });
    }
  });
});

/*
 * 앱 안 브라우저(2026-11-03 운영 둘러보기): 카카오톡에서 관측지의 「우주인 등록하고 언덕에 오르기」를 누르면 빨간 글 한 줄만
 * 떨어져 떴다. 누른 단추 바로 아래에 입구와 같은 안내(바깥 브라우저로 열기·메뉴 안내·주소 복사)가 나온다.
 * WebAuthn이 없으면(jsdom 기본) 신청서를 띄우지 않고 미리 안내하고, 있으면 막지 않고 시도한 뒤 실패하면 안내한다
 * (2026-11-03 사용자: 「처음부터 막기보다는 시도라도 할 수 있게」)
 */
describe("관측지의 앱 안 브라우저", () => {
  const kakao = (ua: string) =>
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);
  // 앞 시험이 남긴 대화 표(언덕에 오른 상태)를 지운다
  beforeEach(() => sessionStorage.clear());

  it.each([
    [
      "아이폰",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5",
      "Safari로 열기",
      "공유 단추",
    ],
    [
      "안드로이드",
      "Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 KAKAOTALK/25.9.1 (INAPP)",
      "다른 브라우저로 열기",
      "⋮ 단추",
    ],
  ])(
    "%s 카카오톡: 누른 단추 아래에 바깥 브라우저 안내",
    async (_name, ua, label, steps) => {
      kakao(ua);
      const view = renderRoom(1);
      const join = await view.findByRole("button", {
        name: "우주인 등록하고 언덕에 오르기",
      });
      fireEvent.click(join);
      const notice = await waitFor(() => {
        const n = view.container.querySelector("[data-room-blocked]");
        expect(n).not.toBeNull();
        return n as HTMLElement;
      });
      // 누른 단추와 같은 칸(언덕 아래 내 자리) 안
      expect(notice.parentElement).toBe(join.parentElement);
      expect(notice.textContent).toContain(
        "카카오톡 안에서는 패스키를 쓸 수 없습니다.",
      );
      const open = notice.querySelector("[data-open-outside]");
      expect(open?.textContent).toBe(label);
      expect(open?.getAttribute("href")).toMatch(
        /^kakaotalk:\/\/web\/openExternal\?url=/,
      );
      expect(notice.textContent).toContain(steps);
      expect(notice.textContent).toContain("주소 복사");
      expect(view.container.querySelector("[data-register-form]")).toBeNull();
    },
  );

  it("신분증 제시를 눌러도 같은 안내", async () => {
    kakao(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5",
    );
    const view = renderRoom(1);
    fireEvent.click(
      await view.findByRole("button", {
        name: "이미 등록했어요 · 신분증 제시",
      }),
    );
    await waitFor(() => {
      expect(
        view.container.querySelector("[data-room-blocked] [data-open-outside]"),
      ).not.toBeNull();
    });
  });

  it("WebAuthn이 있으면 막지 않고 시도하고, 실패하면 그 자리에 안내한 뒤 다시 시도할 수 있다", async () => {
    kakao(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5",
    );
    // 패스키 API가 있는 웹뷰(움직임 줄이기: 신청서 없이 바로 패스키 만들기)
    const win = window as unknown as { PublicKeyCredential?: unknown };
    win.PublicKeyCredential = () => {};
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { create: () => Promise.reject(new Error("쓰지 않음")) },
    });
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) =>
        ({
          matches: q.includes("reduce"),
          media: q,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList,
    );
    // 웹뷰는 패스키를 못 써도 취소와 같은 오류를 낸다
    const createPasskey = vi.fn(() =>
      Promise.reject(new DOMException("x", "NotAllowedError")),
    );
    const view = renderRoom(1, {
      ...services,
      wallet: { ...services.wallet, createPasskey },
    } as unknown as Services);
    try {
      const join = await view.findByRole("button", {
        name: "우주인 등록하고 언덕에 오르기",
      });
      fireEvent.click(join);
      const notice = await waitFor(() => {
        const n = view.container.querySelector("[data-room-blocked]");
        expect(n).not.toBeNull();
        return n as HTMLElement;
      });
      expect(createPasskey).toHaveBeenCalledTimes(1);
      expect(notice.textContent).toContain(
        "카카오톡 안에서는 패스키 확인을 마치지 못했습니다. Safari로 옮겨 오시면 이어서 접수하겠습니다.",
      );
      // 바깥으로 여는 단추는 안내가 뜬 다음 차례에 그려진다(주소를 화면에서 읽는다) — 조건으로 기다린다
      await waitFor(() =>
        expect(notice.querySelector("[data-open-outside]")).not.toBeNull(),
      );
      // 같은 사람이 다시 눌러도 막지 않는다
      fireEvent.click(join);
      await waitFor(() => expect(createPasskey).toHaveBeenCalledTimes(2));
    } finally {
      delete win.PublicKeyCredential;
      Reflect.deleteProperty(navigator, "credentials");
    }
  });
});

describe("관측 안내 자리", () => {
  it("다음 회차 안내(guide)는 하늘과 언덕 아래, 화면 맨 아래에 둔다(2026-11-03 사용자)", async () => {
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
        guide={<aside data-testid="guide" />}
      />,
    );
    const guide = await view.findByTestId("guide");
    const hill = view.container.querySelector("[data-room-hill]");
    expect(hill).not.toBeNull();
    expect(
      (hill as Node).compareDocumentPosition(guide) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
