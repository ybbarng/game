// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useSettings } from "@/game/settings";
import { usePlayerNameField } from "./online-room";

afterEach(() => {
  cleanup();
  act(() => useSettings.setState({ playerName: "" }));
});

describe("온라인 방 이름 칸(usePlayerNameField)", () => {
  it("저장해 둔 이름으로 처음 채운다", () => {
    act(() => useSettings.setState({ playerName: "민준" }));
    const { result } = renderHook(() => usePlayerNameField());
    expect(result.current[0]).toBe("민준");
  });

  it("칸을 다 지우면 저장된 이름이 다시 채워지지 않는다", () => {
    act(() => useSettings.setState({ playerName: "민준" }));
    const { result } = renderHook(() => usePlayerNameField());
    act(() => result.current[1](""));
    expect(result.current[0]).toBe("");
  });

  it("설정이 그린 뒤에 불려 오면 그때 한 번 채운다", () => {
    const { result } = renderHook(() => usePlayerNameField());
    expect(result.current[0]).toBe("");
    act(() => useSettings.setState({ playerName: "서연" }));
    expect(result.current[0]).toBe("서연");
  });

  it("사람이 먼저 적은 이름은 늦게 불려 온 저장값이 덮지 않는다", () => {
    const { result } = renderHook(() => usePlayerNameField());
    act(() => result.current[1]("하준"));
    act(() => useSettings.setState({ playerName: "서연" }));
    expect(result.current[0]).toBe("하준");
  });
});
