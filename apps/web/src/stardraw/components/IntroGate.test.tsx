// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IntroGate } from "./IntroGate";

const HOLD_MS = 1300;
const LEAVE_MS = 700;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function gate(ready: boolean) {
  const onLeave = vi.fn();
  const onDone = vi.fn();
  const view = render(
    <IntroGate ready={ready} onLeave={onLeave} onDone={onDone} />,
  );
  const dialog = view.getByRole("dialog");
  return { view, dialog, onLeave, onDone };
}

describe("우주국 인사가 물러나면 onDone을 꼭 한 번 부른다", () => {
  it("그대로 두면 1.3초 머문 뒤 물러나고 0.7초 뒤 끝난다", () => {
    const { onLeave, onDone } = gate(true);
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(onLeave).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(LEAVE_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("일찍 눌러 물러나는 중에 머무는 시간(1.3초)이 지나도 끝난다(빈 화면에 갇히던 일)", () => {
    const { dialog, onLeave, onDone } = gate(true);
    // 0.8초에 누르면 곧바로 물러나기 시작하고, 물러나는 0.7초 사이에 1.3초 타이머가 울린다
    act(() => vi.advanceTimersByTime(800));
    fireEvent.click(dialog);
    expect(onLeave).toHaveBeenCalledTimes(1);
    // 1.3초에 머무는 타이머가 울리고 화면이 다시 그려진 뒤(브라우저처럼 act를 나눈다), 물러나기가 끝난다
    act(() => vi.advanceTimersByTime(HOLD_MS - 800));
    act(() => vi.advanceTimersByTime(LEAVE_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("물러나는 중에 또 눌러도 한 번만 끝난다", () => {
    const { dialog, onDone } = gate(true);
    fireEvent.click(dialog);
    fireEvent.click(dialog);
    act(() => vi.advanceTimersByTime(HOLD_MS + LEAVE_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("장부가 늦으면 눌러도 기다렸다가, 준비되는 대로 물러나 끝난다", () => {
    const { view, dialog, onLeave, onDone } = gate(false);
    fireEvent.click(dialog);
    act(() => vi.advanceTimersByTime(5000));
    expect(onLeave).not.toHaveBeenCalled();
    const onLeave2 = vi.fn();
    const onDone2 = vi.fn();
    view.rerender(<IntroGate ready onLeave={onLeave2} onDone={onDone2} />);
    expect(onLeave2).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(LEAVE_MS));
    expect(onDone2).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});
