// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  KEYBOARD_MIN_PX,
  rowFaceLimit,
  typingFit,
  useTypingFit,
} from "./typing-fit";

/*
 * 관측지에서 말하는 동안 키보드 위에 담기(docs/36 11-61): 언제 칸을 바꾸는지(초점 + 키보드), 얼굴 한 줄에 몇 명을 놓는지
 */

const phone = { width: 390, offsetTop: 0, scale: 1 };

describe("typingFit: 언제 키보드 위 칸으로 바꾸나", () => {
  it("초점이 있고 보이는 높이가 기준보다 많이 줄면 보이는 칸의 자리와 크기", () => {
    expect(
      typingFit(true, 844, { ...phone, height: 450, offsetTop: 12 }),
    ).toEqual({ top: 12, height: 450, width: 390 });
  });

  it("초점이 없으면 키보드가 있어도 그대로", () => {
    expect(typingFit(false, 844, { ...phone, height: 450 })).toBeNull();
  });

  it("PC(키보드 없음)나 주소 줄이 접히는 정도의 차이는 그대로", () => {
    expect(typingFit(true, 900, { ...phone, height: 900 })).toBeNull();
    expect(
      typingFit(true, 844, { ...phone, height: 844 - KEYBOARD_MIN_PX }),
    ).toBeNull();
  });

  it("확대해 보는 중이면(보이는 높이가 줄어도) 그대로", () => {
    expect(
      typingFit(true, 844, { ...phone, height: 300, scale: 2 }),
    ).toBeNull();
  });

  it("visualViewport가 없으면 아무것도 하지 않는다", () => {
    expect(typingFit(true, 844, null)).toBeNull();
  });
});

describe("rowFaceLimit: 얼굴 한 줄", () => {
  it("다 들어가면 모두, 넘치면 +n 자리 하나를 비운다", () => {
    // 358px: (358 + 6) / 42 = 8자리
    expect(rowFaceLimit(358, 5, 12)).toBe(8);
    expect(rowFaceLimit(358, 8, 12)).toBe(8);
    expect(rowFaceLimit(358, 9, 12)).toBe(7);
  });

  it("넓어도 평소 상한을 넘지 않는다", () => {
    expect(rowFaceLimit(2000, 30, 12)).toBe(11);
    expect(rowFaceLimit(2000, 12, 12)).toBe(12);
  });
});

/** jsdom에는 visualViewport가 없어 흉내 낸다(키보드가 오르내리면 height가 바뀌고 resize가 온다) */
class FakeViewport extends EventTarget {
  width = 390;
  height = 844;
  offsetTop = 0;
  scale = 1;
  set(next: Partial<Pick<FakeViewport, "height" | "offsetTop">>) {
    Object.assign(this, next);
    this.dispatchEvent(new Event("resize"));
  }
}

function withViewport(vv: FakeViewport | undefined) {
  Object.defineProperty(window, "visualViewport", {
    value: vv,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: 844,
    configurable: true,
  });
}

describe("useTypingFit: 초점과 키보드를 따라간다", () => {
  afterEach(() => {
    cleanup();
    withViewport(undefined);
  });

  it("초점 뒤 키보드가 올라오면 칸, 내려가거나 초점이 빠지면 다시 null", () => {
    const vv = new FakeViewport();
    withViewport(vv);
    const { result } = renderHook(() => useTypingFit());
    expect(result.current.fit).toBeNull();

    act(() => result.current.onFocus());
    // 초점만으로는 바꾸지 않는다(키보드가 아직 없다)
    expect(result.current.fit).toBeNull();
    act(() => vv.set({ height: 450 }));
    expect(result.current.fit).toEqual({ top: 0, height: 450, width: 390 });
    // 아이폰처럼 보이는 칸이 밀리면 자리를 따라간다
    act(() => {
      vv.offsetTop = 30;
      vv.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.fit?.top).toBe(30);

    // 키보드를 내리면(초점은 남아도) 원래대로
    act(() => vv.set({ height: 844, offsetTop: 0 }));
    expect(result.current.fit).toBeNull();

    act(() => vv.set({ height: 450 }));
    expect(result.current.fit).not.toBeNull();
    act(() => result.current.onBlur());
    expect(result.current.fit).toBeNull();
  });

  it("초점이 빠진 뒤의 viewport 소식은 듣지 않는다", () => {
    const vv = new FakeViewport();
    withViewport(vv);
    const { result } = renderHook(() => useTypingFit());
    act(() => result.current.onFocus());
    act(() => result.current.onBlur());
    act(() => vv.set({ height: 450 }));
    expect(result.current.fit).toBeNull();
  });

  it("visualViewport가 없으면 초점이 있어도 null", () => {
    withViewport(undefined);
    const { result } = renderHook(() => useTypingFit());
    act(() => result.current.onFocus());
    expect(result.current.fit).toBeNull();
  });
});
