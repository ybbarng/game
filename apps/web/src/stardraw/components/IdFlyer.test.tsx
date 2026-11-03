// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FX } from "../fx-timing";
import type { Services } from "../services";
import { type CardSpot, IdFlyer } from "./IdFlyer";
import { idText, touchScreen } from "./IdPresent";

/** 실루엣 카드(pub 없음)만 그리므로 services는 쓰이지 않는다 */
const services = {} as Services;

let coarse = false;
beforeEach(() => {
  vi.useFakeTimers();
  coarse = false;
  window.matchMedia = ((q: string) => ({
    matches: coarse && q.includes("coarse"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function flyer(
  card: CardSpot,
  press?: { onPress: () => void; onCancel: () => void },
) {
  return render(
    <IdFlyer
      services={services}
      pub={null}
      blank
      card={card}
      text={idText("제출", true)}
      press={press && { label: "신분증 제출", ...press }}
    />,
  );
}

const finger = (c: HTMLElement) =>
  c.querySelector<HTMLButtonElement>("[data-id-finger]");

describe("신분증: 가운데 등록증과 지문 단추", () => {
  it("기다릴 때 등록증은 가운데에 다 보이고, 아래 지문 단추에 「본인 확인」 글자가 함께 있다", () => {
    const { container } = flyer("ready", {
      onPress: () => {},
      onCancel: () => {},
    });
    const card = container.querySelector<HTMLElement>("[data-id-card]");
    expect(card?.style.transform).toBe("translateY(0) scale(1)");
    expect(card?.getAttribute("aria-label")).toBe("신분증 제출");
    const f = finger(container);
    expect(f?.tagName).toBe("BUTTON");
    expect(f?.getAttribute("type")).toBe("button");
    expect(f?.textContent).toBe("본인 확인");
    // 등록증과 이름이 겹치지 않는다(화면 시험이 둘을 따로 찾는다)
    expect(f?.getAttribute("aria-label")).toBe("본인 확인으로 신분증 제출");
    expect(f?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("지문 단추를 누르면 그 처리기 안에서 바로 onPress를 부른다(기다림 없이)", () => {
    const onPress = vi.fn();
    const { container } = flyer("ready", { onPress, onCancel: () => {} });
    fireEvent.click(finger(container) as HTMLButtonElement);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("키보드: 지문 단추에 초점이 가고, 등록증도 Enter로 같은 onPress", () => {
    const onPress = vi.fn();
    const { container } = flyer("ready", { onPress, onCancel: () => {} });
    const f = finger(container) as HTMLButtonElement;
    f.focus();
    expect(document.activeElement).toBe(f);
    const card = container.querySelector("[data-id-card]") as HTMLElement;
    expect(card.tabIndex).toBe(0);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("가만히 있으면 누르는 손짓은 등록증이 아니라 지문 단추 안에 나오고, 그동안 빛남은 멈춘다", () => {
    const { container } = flyer("ready", {
      onPress: () => {},
      onCancel: () => {},
    });
    const glow = container.querySelector<HTMLElement>(".sd-finger-glow");
    expect(glow?.style.animationPlayState).toBe("running");
    act(() => vi.advanceTimersByTime(FX.idleHint - 1));
    expect(container.querySelector("[data-idle-hint]")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const hint = container.querySelector("[data-idle-hint='tap']");
    expect(hint).not.toBeNull();
    expect(finger(container)?.contains(hint)).toBe(true);
    expect(
      container.querySelector("[data-id-card]")?.contains(hint ?? null),
    ).toBe(false);
    expect(glow?.style.animationPlayState).toBe("paused");
    // 손을 대면 사라진다
    fireEvent.pointerDown(window);
    expect(container.querySelector("[data-idle-hint]")).toBeNull();
  });

  it("누른 뒤(떠오름·확인)에는 지문 단추가 걷히고, 기다리는 일이 없으면 처음부터 없다", () => {
    const press = { onPress: () => {}, onCancel: () => {} };
    expect(finger(flyer("lift", press).container)).toBeNull();
    cleanup();
    const up = flyer("up");
    expect(finger(up.container)).toBeNull();
    expect(up.queryByText("취소")).toBeNull();
  });

  it("「취소」는 지문 단추와 따로 아래에 있고 onCancel을 부른다", () => {
    const onCancel = vi.fn();
    const onPress = vi.fn();
    const view = flyer("ready", { onPress, onCancel });
    fireEvent.click(view.getByText("취소"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(finger(view.container)?.contains(view.getByText("취소"))).toBe(
      false,
    );
  });
});

describe("신분증 위쪽 문구: 기기에 따라 누를 것을 가리킨다", () => {
  it("터치 화면은 지문, PC(마우스)는 「본인 확인」", () => {
    expect(idText("제출", true)).toBe("지문을 눌러 신분증을 제출해 주세요.");
    expect(idText("제시", false)).toBe(
      "「본인 확인」을 눌러 신분증을 제시해 주세요.",
    );
  });

  it("터치 화면 판단은 (pointer: coarse)", () => {
    expect(touchScreen()).toBe(false);
    coarse = true;
    expect(touchScreen()).toBe(true);
  });
});
