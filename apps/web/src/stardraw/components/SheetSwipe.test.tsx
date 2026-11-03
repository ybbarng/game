// @vitest-environment jsdom
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FX } from "../fx-timing";
import { Sheet } from "./EnterSubmit";

/**
 * 예측서 밀어 올리기 판정(2026-11-03 PC 제보: 빨리 끌거나 마우스가 벗어나면 제출이 안 됐다).
 * 시각은 이벤트마다 timeStamp로 정해 준다(실제 시간을 기다리지 않는다)
 */
beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

function setup() {
  const onSwiped = vi.fn();
  const { getByRole } = render(
    <Sheet sheet="in" awaiting onSwiped={onSwiped}>
      <span>예측서</span>
    </Sheet>,
  );
  return { el: getByRole("button", { name: "예측서 제출" }), onSwiped };
}

type Kind = "pointerDown" | "pointerMove" | "pointerUp" | "lostPointerCapture";
function send(
  el: HTMLElement,
  kind: Kind,
  y: number,
  t: number,
  pointerType: "mouse" | "touch",
) {
  const ev = createEvent[kind](el, { clientY: y, pointerId: 1, pointerType });
  // 0이면 React가 「시각 없음」으로 보고 지금 시각을 쓰므로 1000을 더한다
  Object.defineProperty(ev, "timeStamp", { value: 1000 + t });
  fireEvent(el, ev);
}

describe("마우스", () => {
  it("위로 조금만 끌어도 낸다(거리·속도와 상관없이)", () => {
    const { el, onSwiped } = setup();
    send(el, "pointerDown", 500, 0, "mouse");
    send(el, "pointerMove", 470, 400, "mouse");
    send(el, "pointerUp", 470, 800, "mouse");
    expect(onSwiped).toHaveBeenCalledTimes(1);
  });

  it("아래로 끌었다 놓으면 내지 않는다", () => {
    const { el, onSwiped } = setup();
    send(el, "pointerDown", 500, 0, "mouse");
    send(el, "pointerMove", 540, 200, "mouse");
    send(el, "pointerUp", 540, 400, "mouse");
    expect(onSwiped).not.toHaveBeenCalled();
  });

  it("끌다가 붙잡기가 풀려도(창 밖에서 뗌) 마지막 자리로 판정해 낸다", () => {
    const { el, onSwiped } = setup();
    send(el, "pointerDown", 500, 0, "mouse");
    send(el, "pointerMove", 430, 100, "mouse");
    send(el, "lostPointerCapture", 0, 150, "mouse");
    expect(onSwiped).toHaveBeenCalledTimes(1);
  });

  it("클릭(제자리 누르기)은 낸다", () => {
    const { el, onSwiped } = setup();
    send(el, "pointerDown", 500, 0, "mouse");
    send(el, "pointerUp", 501, 120, "mouse");
    expect(onSwiped).toHaveBeenCalledTimes(1);
  });
});

describe("손가락", () => {
  it("빨리 튕기면 뗀 자리가 마지막 움직임과 같아도 속도로 낸다", () => {
    const { el, onSwiped } = setup();
    const short = FX.swipeDistance / 2;
    send(el, "pointerDown", 500, 0, "touch");
    send(el, "pointerMove", 500 - short / 2, 16, "touch");
    send(el, "pointerMove", 500 - short, 32, "touch");
    send(el, "pointerUp", 500 - short, 34, "touch");
    expect(onSwiped).toHaveBeenCalledTimes(1);
  });

  it("짧게 천천히 끌다 놓으면 제자리로 돌아간다", () => {
    const { el, onSwiped } = setup();
    send(el, "pointerDown", 500, 0, "touch");
    send(el, "pointerMove", 480, 300, "touch");
    send(el, "pointerMove", 470, 600, "touch");
    send(el, "pointerUp", 470, 900, "touch");
    expect(onSwiped).not.toHaveBeenCalled();
  });
});
