// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShownHistory, useStimulusShown } from "./stimulus-shown";

describe("ShownHistory: 누른 순간 화면에 있던 판", () => {
  const history = new ShownHistory();
  history.record(1, 1000);
  history.record(2, 1500.5);
  history.record(2, 1600); // 다시 그려도 처음 시각을 지킨다

  it.each([
    [999, null],
    [1000, { stimulus: 1, rtMs: 0 }],
    [1300, { stimulus: 1, rtMs: 300 }],
    // 새 판이 뜨기 직전 누름은 옛 판 청구
    [1500.25, { stimulus: 1, rtMs: 500.25 }],
    [1750.5, { stimulus: 2, rtMs: 250 }],
  ])("누름 %d → %j", (pressedAt, expected) => {
    const seen = history.seen(pressedAt);
    if (expected === null) expect(seen).toBeNull();
    else expect(seen).toMatchObject(expected);
  });

  it("오래된 판은 버린다", () => {
    const small = new ShownHistory(2);
    small.record(1, 10);
    small.record(2, 20);
    small.record(3, 30);
    expect(small.list().map((e) => e.stimulus)).toEqual([2, 3]);
    expect(small.shownAt(1)).toBeNull();
  });
});

describe("useStimulusShown: 그린 프레임 시각", () => {
  /** 가짜 requestAnimationFrame: 시험이 프레임을 직접 돌린다 */
  function fakeFrames() {
    let next = 1;
    const queued = new Map<number, (t: number) => void>();
    return {
      raf: (cb: (t: number) => void) => {
        queued.set(next, cb);
        return next++;
      },
      cancelRaf: (id: number) => {
        queued.delete(id);
      },
      frame(time: number) {
        const callbacks = [...queued.values()];
        queued.clear();
        act(() => {
          for (const cb of callbacks) cb(time);
        });
      },
      queued: () => queued.size,
    };
  }

  it("판이 바뀐 뒤 첫 프레임 시각을 적고, 누른 시각으로 seen과 rt를 낸다", () => {
    const frames = fakeFrames();
    const shown: number[] = [];
    const { result, rerender } = renderHook(
      ({ stimulus }: { stimulus: number | null }) =>
        useStimulusShown(stimulus, {
          raf: frames.raf,
          cancelRaf: frames.cancelRaf,
          onShown: (e) => shown.push(e.shownAt),
        }),
      { initialProps: { stimulus: null as number | null } },
    );
    expect(frames.queued()).toBe(0);
    rerender({ stimulus: 7 });
    frames.frame(2016.5);
    expect(shown).toEqual([2016.5]);
    expect(result.current.seen(2266.5)).toMatchObject({
      stimulus: 7,
      rtMs: 250,
    });
    expect(result.current.seen(2000)).toBeNull();
  });

  it("그리기 전에 판이 다시 바뀌면 앞 판은 적지 않는다", () => {
    const frames = fakeFrames();
    const { result, rerender } = renderHook(
      ({ stimulus }: { stimulus: number | null }) =>
        useStimulusShown(stimulus, {
          raf: frames.raf,
          cancelRaf: frames.cancelRaf,
        }),
      { initialProps: { stimulus: 1 as number | null } },
    );
    rerender({ stimulus: 2 });
    frames.frame(100);
    expect(result.current.history.list()).toEqual([
      { stimulus: 2, shownAt: 100 },
    ]);
  });
});
