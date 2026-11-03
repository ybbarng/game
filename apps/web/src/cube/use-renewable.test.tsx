// @vitest-environment jsdom

import { ManualClock } from "@game/fair-play";
import { cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { SolveSession } from "./solve-session";
import { type Renewable, useRenewable } from "./use-renewable";

afterEach(cleanup);

class Thing implements Renewable {
  disposed = false;
  constructor(readonly key: string) {}
  dispose() {
    this.disposed = true;
  }
}

describe("useRenewable", () => {
  it("개발 모드(StrictMode)에서 마운트→정리→마운트 뒤에도 치우지 않은 것을 쓴다", () => {
    const { result } = renderHook(
      () => useRenewable(() => new Thing("a"), "a"),
      {
        wrapper: StrictMode,
      },
    );
    expect(result.current.disposed).toBe(false);
  });

  it("StrictMode에서도 혼자 맞추기 세션이 섞기를 받아 살펴보기로 간다", () => {
    const { result } = renderHook(
      () =>
        useRenewable(
          () =>
            new SolveSession({
              n: 3,
              mode: "solo",
              inspection: true,
              clock: new ManualClock(),
            }),
          "3-solo",
        ),
      { wrapper: StrictMode },
    );
    result.current.start("R U F' D2");
    expect(result.current.phase).toBe("inspect");
    result.current.dispose();
  });

  it("key가 바뀌면 옛것을 치우고 새로 만든다", () => {
    const { result, rerender } = renderHook(
      ({ k }) => useRenewable(() => new Thing(k), k),
      { initialProps: { k: "a" } },
    );
    const first = result.current;
    rerender({ k: "b" });
    expect(first.disposed).toBe(true);
    expect(result.current.key).toBe("b");
    expect(result.current.disposed).toBe(false);
  });

  it("같은 key로 다시 그리면 같은 것을 쓰고, 화면을 떠나면 치운다", () => {
    const { result, rerender, unmount } = renderHook(
      ({ k }) => useRenewable(() => new Thing(k), k),
      { initialProps: { k: "a" } },
    );
    const first = result.current;
    rerender({ k: "a" });
    expect(result.current).toBe(first);
    unmount();
    expect(first.disposed).toBe(true);
  });
});
