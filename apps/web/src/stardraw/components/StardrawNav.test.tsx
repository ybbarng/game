// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { buzz, VIBRATE_KEY } from "../haptics";
import type { Services } from "../services";
import { TabBar } from "./StardrawNav";

/*
 * 「더 보기」의 「진동」 켜고 끄기(docs/36 11-70): 진동 함수가 있는 기기에만 줄이 있고, 끄면 이 기기에 저장되어 모든 진동이 멈춘다
 */

const services = { ns: "stardraw" } as unknown as Services;

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  Reflect.deleteProperty(navigator, "vibrate");
});

function openMore() {
  const view = render(
    <TabBar services={services} keyInfo={null} active="home" onGo={() => {}} />,
  );
  fireEvent.click(view.getByRole("button", { name: "더 보기" }));
  return view;
}

describe("더 보기의 진동 설정", () => {
  it("진동 함수가 없는 기기(아이폰 등)에는 줄을 두지 않는다", () => {
    const view = openMore();
    expect(view.queryByRole("switch", { name: "진동" })).toBeNull();
  });

  it("기본은 켬, 누르면 꺼서 이 기기에 저장하고 진동이 멈춘다", () => {
    const calls: unknown[] = [];
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (p: unknown) => {
        calls.push(p);
        return true;
      },
    });
    const view = openMore();
    const sw = view.getByRole("switch", { name: "진동" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(localStorage.getItem(VIBRATE_KEY)).toBe("off");
    expect(buzz("confirm")).toBe(false);
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(buzz("confirm")).toBe(true);
    expect(calls).toEqual([20]);
  });
});
