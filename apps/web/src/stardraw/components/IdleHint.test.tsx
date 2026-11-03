// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FX } from "../fx-timing";
import { IdleHint, type IdleHintKind, useIdleHint } from "./IdleHint";

function Waiting({ active, kind }: { active: boolean; kind: IdleHintKind }) {
  const shown = useIdleHint(active);
  return (
    <div data-testid="thing" style={{ position: "relative" }}>
      <IdleHint kind={kind} shown={shown} />
    </div>
  );
}

let reduce = false;
beforeEach(() => {
  vi.useFakeTimers();
  reduce = false;
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes("reduce"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const hint = (c: HTMLElement) => c.querySelector("[data-idle-hint]");
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("손짓 안내: 가만히 있으면 나오고 손을 대면 사라진다", () => {
  it("기다리지 않을 때는 시간이 지나도 없다", () => {
    const { container } = render(<Waiting active={false} kind="swipe-up" />);
    wait(FX.idleHint * 3);
    expect(hint(container)).toBeNull();
  });

  it("기다리기 시작하고 시간 바로 전에는 없고, 지나면 나온다", () => {
    const { container } = render(<Waiting active kind="swipe-up" />);
    wait(FX.idleHint - 1);
    expect(hint(container)).toBeNull();
    wait(1);
    expect(hint(container)?.getAttribute("data-idle-hint")).toBe("swipe-up");
    expect(hint(container)?.className).toContain("pointer-events-none");
    expect(container.querySelector(".sd-hint-swipe-hand")).not.toBeNull();
  });

  it("누르면 곧바로 사라지고, 누르는 동안은 세지 않고, 손을 떼면 다시 같은 시간 뒤 나온다", () => {
    const { container } = render(<Waiting active kind="tap" />);
    wait(FX.idleHint);
    expect(hint(container)).not.toBeNull();
    fireEvent.pointerDown(window);
    expect(hint(container)).toBeNull();
    // 누르고 있는 동안(끄는 중)
    wait(FX.idleHint * 2);
    expect(hint(container)).toBeNull();
    fireEvent.pointerUp(window);
    wait(FX.idleHint - 1);
    expect(hint(container)).toBeNull();
    wait(1);
    expect(hint(container)?.getAttribute("data-idle-hint")).toBe("tap");
  });

  it("키를 누르면 사라지고 같은 시간 뒤 다시 나온다", () => {
    const { container } = render(<Waiting active kind="tap" />);
    wait(FX.idleHint - 1);
    fireEvent.keyDown(window, { key: "Tab" });
    wait(FX.idleHint - 1);
    expect(hint(container)).toBeNull();
    wait(1);
    expect(hint(container)).not.toBeNull();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(hint(container)).toBeNull();
  });

  it("기다림이 끝나면 곧바로 걷히고 다시 기다리면 처음부터 센다", () => {
    const view = render(<Waiting active kind="swipe-up" />);
    wait(FX.idleHint);
    expect(hint(view.container)).not.toBeNull();
    view.rerender(<Waiting active={false} kind="swipe-up" />);
    expect(hint(view.container)).toBeNull();
    view.rerender(<Waiting active kind="swipe-up" />);
    expect(hint(view.container)).toBeNull();
    wait(FX.idleHint - 1);
    expect(hint(view.container)).toBeNull();
    wait(1);
    expect(hint(view.container)).not.toBeNull();
  });

  it("움직임 줄이기면 같은 때에 움직이지 않는 손만(밀기는 위쪽 화살표와 함께)", () => {
    reduce = true;
    const swipe = render(<Waiting active kind="swipe-up" />);
    const tap = render(<Waiting active kind="tap" />);
    wait(FX.idleHint - 1);
    expect(hint(swipe.container)).toBeNull();
    wait(1);
    for (const c of [swipe.container, tap.container]) {
      expect(hint(c)?.hasAttribute("data-idle-hint-still")).toBe(true);
      expect(c.querySelector("[class*='sd-hint-'][class*='-hand']")).toBeNull();
      expect(c.querySelector(".sd-hint-trail, .sd-hint-ring")).toBeNull();
    }
    expect(swipe.container.querySelectorAll("svg")).toHaveLength(2);
  });
});
