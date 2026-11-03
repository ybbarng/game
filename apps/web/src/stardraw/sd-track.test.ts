// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HttpError } from "./errors";
import type { Ledger } from "./ledger";
import {
  instrument,
  markReal,
  resetSdTrack,
  sdTrack,
  setWhere,
  trackArrival,
  trackPredictStart,
  trackView,
} from "./sd-track";
import type { KeyInfo, Wallet } from "./wallet";

/** 하늘의 별 따기 통계 이벤트(docs/33 11절) */
const events: { name: string; data: unknown }[] = [];

beforeEach(() => {
  (globalThis as { umami?: unknown }).umami = {
    track: (name: string, data: unknown) => events.push({ name, data }),
  };
});

afterEach(() => {
  events.length = 0;
  resetSdTrack();
  localStorage.clear();
  delete (globalThis as { umami?: unknown }).umami;
});

const KEY = { kind: "passkey" } as unknown as KeyInfo;

function fakes(opts: {
  create?: () => Promise<KeyInfo>;
  recover?: () => Promise<KeyInfo | null>;
  submit?: () => Promise<{ receivedAt: number }>;
}) {
  const wallet = {
    createPasskey: opts.create ?? (async () => KEY),
    recoverPasskey: opts.recover ?? (async () => KEY),
  } as unknown as Wallet;
  const ledger = {
    submit: opts.submit ?? (async () => ({ receivedAt: 1 })),
  } as unknown as Ledger;
  return { wallet, ledger };
}

describe("별 따기 통계: 실제 게임에서만", () => {
  it("실제 게임으로 표시하지 않은 이름공간(연습 장부·데모)은 아무것도 보내지 않는다", () => {
    sdTrack("stardraw", "sd-view", { view: "records" });
    trackView("stardraw-demo", "draw");
    expect(events).toEqual([]);
    markReal("stardraw");
    trackView("stardraw", "draw");
    expect(events).toEqual([{ name: "sd-view", data: { view: "draw" } }]);
  });
});

describe("별 따기 통계: 패스키와 예측서 내기", () => {
  beforeEach(() => markReal("stardraw"));

  it("등록증 만들기·제시 성공은 화면 이름과 함께, 실패는 까닭과 함께 보내고 결과는 그대로 돌려준다", async () => {
    const ok = fakes({});
    instrument("stardraw", ok.wallet, ok.ledger);
    setWhere("enter");
    expect(await ok.wallet.createPasskey()).toBe(KEY);
    setWhere("observe");
    expect(await ok.wallet.recoverPasskey(async () => null)).toBe(KEY);

    const cancelled = new DOMException("닫음", "NotAllowedError");
    const bad = fakes({
      create: async () => {
        throw cancelled;
      },
      recover: async () => null,
    });
    instrument("stardraw", bad.wallet, bad.ledger);
    await expect(bad.wallet.createPasskey()).rejects.toBe(cancelled);
    expect(await bad.wallet.recoverPasskey(async () => null)).toBeNull();

    expect(events).toEqual([
      {
        name: "sd-key",
        data: { how: "create", where: "enter", inApp: false },
      },
      {
        name: "sd-key",
        data: { how: "present", where: "observe", inApp: false },
      },
      {
        name: "sd-key-fail",
        data: { step: "create", kind: "cancelled", inApp: false },
      },
      {
        name: "sd-key-fail",
        data: { step: "present", kind: "not-found", inApp: false },
      },
    ]);
  });

  it("예측서를 내는 데 성공하면 아무것도 보내지 않고, 실패하면 까닭 종류만 보낸다", async () => {
    const ok = fakes({});
    instrument("stardraw", ok.wallet, ok.ledger);
    await ok.ledger.submit({} as never);
    expect(events).toEqual([]);

    const busy = new HttpError("우주국이 바쁩니다", 503);
    const bad = fakes({
      submit: async () => {
        throw busy;
      },
    });
    instrument("stardraw", bad.wallet, bad.ledger);
    await expect(bad.ledger.submit({} as never)).rejects.toBe(busy);
    expect(events).toEqual([
      { name: "sd-predict-fail", data: { why: "busy" } },
    ]);
  });
});

describe("별 따기 통계: 예측 시작과 공지 링크", () => {
  beforeEach(() => markReal("stardraw"));

  it("회차마다 첫 별을 담을 때 한 번만, 이 기기의 첫 예측인지와 함께 보낸다", () => {
    trackPredictStart("stardraw", 5, 0);
    trackPredictStart("stardraw", 5, 1);
    trackPredictStart("stardraw", 5, 2);
    localStorage.setItem("stardraw-tickets", JSON.stringify([{ t: "x" }]));
    trackPredictStart("stardraw", 6, 1);
    expect(events).toEqual([
      { name: "sd-predict", data: { kind: "first" } },
      { name: "sd-predict", data: { kind: "again" } },
    ]);
  });

  it("공지 꼬리표로 오면 한 번 보내고 주소에서 꼬리표만 지운다", () => {
    window.history.replaceState(null, "", "/stardraw?from=notice#records");
    trackArrival("stardraw");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#records");
    trackArrival("stardraw");
    window.history.replaceState(null, "", "/stardraw?from=other");
    trackArrival("stardraw");
    expect(events).toEqual([{ name: "sd-arrive", data: { from: "notice" } }]);
  });
});
