// @vitest-environment jsdom
import { ManualClock } from "@game/fair-play";
import type { RoundRecord } from "@game/stardraw-core";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FX } from "../fx-timing";
import { drawOrder } from "../results";
import { DrawView } from "./DrawView";

/** 관측 기록 하나(RoomView.test와 같은 방법: drand 서명에서 뽑힌 순서를 그대로 쓴다) */
function observed(): RoundRecord {
  const base = {
    v: 1,
    round: 1,
    void: false,
    drandRound: 1,
    drandSignature: new Uint8Array(48).fill(7),
    winners: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  } as unknown as RoundRecord;
  const order = drawOrder(base);
  return {
    ...base,
    numbers: order.slice(0, 6).sort((a, b) => a - b),
    bonus: order[6] as number,
  };
}

let reduce = false;
beforeEach(() => {
  reduce = false;
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes("reduce"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const record = observed();
const drawn = drawOrder(record).slice(0, 6);
const ascending = [...drawn].sort((a, b) => a - b);

/** 연출이 이미 끝난 시각에 들어온 관측 화면(첫 장면부터 별이 다 떠 있다) */
function finishedShow() {
  const clock = new ManualClock();
  clock.advance(1_000_000);
  const view = render(
    <DrawView record={record} label="시험 1회" clock={clock} startedAt={0} />,
  );
  const balls = () =>
    [...view.container.querySelectorAll<HTMLElement>("[data-sort-ball]")].map(
      (el) => Number(el.dataset.sortBall),
    );
  const shining = () =>
    view.container.querySelectorAll(".sd-ball-shine").length;
  const wait = (ms: number) => act(() => clock.advance(ms));
  return { balls, shining, wait };
}

describe("관측 마무리: 작은 순으로 다시 놓고 하나씩 다시 빛낸다", () => {
  it("이 기록은 뽑힌 순서가 작은 순이 아니다(시험 전제)", () => {
    expect(drawn).not.toEqual(ascending);
  });

  it("별이 다 뜬 뒤 쉬었다가 작은 순으로 놓고, 그 순서로 한 번씩 빛난 뒤 멈춘다", () => {
    const { balls, shining, wait } = finishedShow();
    expect(balls()).toEqual(drawn);
    wait(FX.sortWait - 1);
    expect(balls()).toEqual(drawn);
    wait(1);
    expect(balls()).toEqual(ascending);
    expect(shining()).toBe(0);
    wait(FX.sortMove + FX.pause);
    // 첫 번째(가장 작은 번호) 공이 빛난다
    const first = document.querySelector(".sd-ball-shine");
    expect(
      first?.closest<HTMLElement>("[data-sort-ball]")?.dataset.sortBall,
    ).toBe(String(ascending[0]));
    // 여섯 공과 보너스까지 차례로, 끝나면 빛남이 걷힌다
    wait(FX.sortShine * 7 + FX.pause);
    expect(shining()).toBe(0);
    expect(balls()).toEqual(ascending);
  });

  it("움직임 줄이기면 처음부터 작은 순이고 다시 빛내기는 없다", () => {
    reduce = true;
    const { balls, shining, wait } = finishedShow();
    expect(balls()).toEqual(ascending);
    wait(FX.sortWait + FX.sortMove + FX.sortShine * 8);
    expect(shining()).toBe(0);
  });
});

describe("다시 빛내기: 공이 빛나는 그 순간 하늘의 같은 별도 빛난다(docs/36 11-72)", () => {
  const skyGlow = () =>
    document.querySelector<HTMLElement>("[data-sky]")?.dataset.skyGlow;
  /** 지금 빛나는 공 번호(보너스 공은 data-sort-ball 밖이라 data-ball로 읽는다) */
  const ballGlow = () =>
    document.querySelector<HTMLElement>(".sd-ball-shine")?.dataset.ball;

  it("정렬 전과 끝난 뒤에는 하늘에 빛나는 별이 없고, 빛나는 동안은 늘 공과 같은 별이다", () => {
    const { wait } = finishedShow();
    expect(skyGlow()).toBeUndefined();
    wait(FX.sortWait + FX.sortMove + FX.pause - 1);
    expect(skyGlow()).toBeUndefined();
    const seq = [...ascending, drawOrder(record)[6] as number];
    seq.forEach((n, i) => {
      wait(i === 0 ? 1 : FX.sortShine);
      expect(ballGlow()).toBe(String(n));
      expect(skyGlow()).toBe(String(n));
    });
    wait(FX.sortShine + FX.pause);
    expect(ballGlow()).toBeUndefined();
    expect(skyGlow()).toBeUndefined();
  });

  it("움직임 줄이기면 하늘 별도 빛나지 않는다", () => {
    reduce = true;
    const { wait } = finishedShow();
    for (let i = 0; i < 10; i++) {
      wait(FX.sortShine);
      expect(skyGlow()).toBeUndefined();
    }
  });
});
