// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { createTutorialProgress } from "@/tutorial/progress";

import {
  beforeSend,
  SKIP_PAGEVIEW_MS,
  setAnalyticsOff,
  shouldSend,
  skipNextPageview,
  takeSkip,
} from "./analytics";
import { track } from "./track";

const ON = { off: false, gpc: false, search: "" };

describe("사이트 통계: 보내기 직전 확인(docs/33 3절 ②)", () => {
  it("주소에 쿼리·#·방 코드가 남아 있으면 보내지 않는다", () => {
    expect(shouldSend({ url: "/omok" }, ON)).toBe(true);
    expect(
      shouldSend({ url: "/omok", referrer: "https://www.google.com/" }, ON),
    ).toBe(true);
    for (const url of [
      "/omok?room=abcd1234",
      "/chess?seed=7",
      "/hearts#k=secret",
      "/review/room=x",
    ])
      expect(shouldSend({ url }, ON), url).toBe(false);
    expect(
      shouldSend(
        { url: "/omok", referrer: "https://game.byb.kr/omok?room=a" },
        ON,
      ),
    ).toBe(false);
  });

  it("이 기기에서 껐거나 GPC를 켰거나 같은 탭 시험(?net=local)이면 보내지 않는다", () => {
    expect(shouldSend({ url: "/" }, { ...ON, off: true })).toBe(false);
    expect(shouldSend({ url: "/" }, { ...ON, gpc: true })).toBe(false);
    expect(shouldSend({ url: "/" }, { ...ON, search: "?net=local" })).toBe(
      false,
    );
    expect(shouldSend(null, ON)).toBe(false);
  });
});

describe("사이트 통계: 끄기 스위치와 이벤트", () => {
  const events: { name: string; data: unknown }[] = [];
  const umami = {
    track: (name: string, data: unknown) => events.push({ name, data }),
  };

  afterEach(() => {
    setAnalyticsOff(false);
    events.length = 0;
    delete (globalThis as { umami?: unknown }).umami;
  });

  it("끄기를 저장하면 보내기 직전 함수가 막고, 켜면 그대로 보낸다", () => {
    const payload = { url: "/janggi" };
    expect(beforeSend("event", payload)).toBe(payload);
    setAnalyticsOff(true);
    expect(beforeSend("event", payload)).toBe(false);
    setAnalyticsOff(false);
    expect(beforeSend("event", payload)).toBe(payload);
  });

  it("통계 스크립트가 없으면(개발·시험 빌드, 광고 차단기) 아무 일도 하지 않는다", () => {
    expect(() =>
      track("game-start", { game: "omok", mode: "solo", level: 1 }),
    ).not.toThrow();
    (globalThis as { umami?: unknown }).umami = {
      track: () => {
        throw new Error("막힘");
      },
    };
    expect(() => track("learn-open", { game: "omok" })).not.toThrow();
  });

  it("배우기 단원을 마치면 게임 이름·단원 id·처음인지만 보낸다", () => {
    (globalThis as { umami?: unknown }).umami = umami;
    const progress = createTutorialProgress("baduk-tutorial");
    expect(progress.game).toBe("baduk");
    progress.getState().complete("liberties");
    progress.getState().complete("liberties");
    expect(events).toEqual([
      {
        name: "lesson-finish",
        data: { game: "baduk", lesson: "liberties", first: true },
      },
      {
        name: "lesson-finish",
        data: { game: "baduk", lesson: "liberties", first: false },
      },
    ]);
  });
});

describe("하늘의 별 따기: 보내는 경로(docs/33 11절)", () => {
  const at = (path: string) => ({ url: `https://game.byb.kr${path}` });

  it("허용한 별 따기 경로만 보내고, 소속·입상 확인·국장 화면·데모와 새 경로는 보내지 않는다", () => {
    for (const path of [
      "/stardraw",
      "/stardraw/",
      "/stardraw/now",
      "/stardraw/mine",
      "/stardraw/rounds",
      "/stardraw/about",
      "/stardraw/privacy",
    ])
      expect(shouldSend(at(path), ON), path).toBe(true);
    for (const path of [
      "/stardraw/qualify",
      "/stardraw/check",
      "/stardraw/admin",
      "/stardraw/demo",
      "/stardraw/room",
      "/stardraw/awards",
      "/stardraw/new-page",
    ])
      expect(shouldSend(at(path), ON), path).toBe(false);
    // 별 따기 밖은 그대로
    expect(shouldSend(at("/omok"), ON)).toBe(true);
    expect(shouldSend(at("/stardrawing"), ON)).toBe(true);
  });

  it("보내지 않는 별 따기 경로에서 왔으면 참조 주소를 지운다(바깥 사이트 참조는 그대로)", () => {
    const fromCheck = { url: "/stardraw/rounds", referrer: "/stardraw/check" };
    expect(beforeSend("event", fromCheck)).toEqual({
      url: "/stardraw/rounds",
      referrer: "",
    });
    const fromQualify = {
      url: "/stardraw",
      referrer: "https://game.byb.kr/stardraw/qualify",
    };
    expect(beforeSend("event", fromQualify)).toMatchObject({ referrer: "" });
    const outside = {
      url: "/stardraw",
      referrer: "https://example.com/stardraw/check",
    };
    expect(beforeSend("event", outside)).toBe(outside);
    const fromHome = { url: "/stardraw/now", referrer: "/stardraw" };
    expect(beforeSend("event", fromHome)).toBe(fromHome);
  });

  it("예측서를 낸 직후의 페이지 보기 하나만 버리고, 이벤트와 정해 둔 시간 뒤의 보기는 보낸다", () => {
    skipNextPageview(1000);
    // 이벤트(name 있음)는 건너뛰기와 상관없다
    expect(takeSkip({ url: "/stardraw/mine", name: "sd-view" }, 1100)).toBe(
      false,
    );
    expect(takeSkip({ url: "/stardraw/mine" }, 1300)).toBe(true);
    // 하나만
    expect(takeSkip({ url: "/stardraw" }, 1400)).toBe(false);
    // 스크립트가 없어 보기가 오지 않았으면 시간이 지나면 풀린다
    skipNextPageview(2000);
    expect(takeSkip({ url: "/stardraw" }, 2000 + SKIP_PAGEVIEW_MS)).toBe(false);
  });
});
