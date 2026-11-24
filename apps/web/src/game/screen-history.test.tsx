// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  leaveQuietly,
  useLeaveConfirm,
  useScreenHistory,
} from "./screen-history";

type Screen = { kind: string };

afterEach(() => {
  cleanup();
  act(() => useLeaveConfirm.getState().close());
});

/** 시작 → 방 → 방에서 들어간 대국까지 온 화면 기록 */
function inOnlineGame() {
  const leavePlay = vi.fn();
  const hook = renderHook(() =>
    useScreenHistory<Screen>({ kind: "start" }, { leavePlay }),
  );
  act(() => hook.result.current[1]({ kind: "online" }));
  act(() => hook.result.current[1]({ kind: "playing" }));
  return { hook, leavePlay };
}

describe("화면 안 나가기 단추로 온라인 판을 떠날 때(useScreenHistory)", () => {
  it("온라인 대국에서 시작으로 가려 하면 묻고, 답하기 전에는 판에 남는다", () => {
    const { hook, leavePlay } = inOnlineGame();
    act(() => hook.result.current[1]({ kind: "start" }));
    expect(useLeaveConfirm.getState().open?.message).toBe(
      "온라인 대국에서 나가시겠어요? 함께 하던 사람들과 연결이 끊겨요.",
    );
    expect(hook.result.current[0]).toEqual({ kind: "playing" });
    expect(leavePlay).not.toHaveBeenCalled();
  });

  it("확인창에서 「나가기」를 고르면 나가며 판을 정리한다", () => {
    const { hook, leavePlay } = inOnlineGame();
    act(() => hook.result.current[1]({ kind: "start" }));
    act(() => useLeaveConfirm.getState().open?.onLeave());
    expect(hook.result.current[0]).toEqual({ kind: "start" });
    expect(leavePlay).toHaveBeenCalledTimes(1);
  });

  it("방 화면에서 나가려 하면 방을 나갈지 묻는다", () => {
    const hook = renderHook(() => useScreenHistory<Screen>({ kind: "start" }));
    act(() => hook.result.current[1]({ kind: "online" }));
    act(() => hook.result.current[1]({ kind: "start" }));
    expect(useLeaveConfirm.getState().open?.message).toBe(
      "온라인 방에서 나가시겠어요?",
    );
  });

  it("방에서 대국으로 들어가는 것처럼 온라인 안에서 옮기면 묻지 않는다", () => {
    const { hook } = inOnlineGame();
    expect(hook.result.current[0]).toEqual({ kind: "playing" });
    expect(useLeaveConfirm.getState().open).toBeNull();
  });

  it("leaveQuietly 안에서 떠나면(이미 끝난 연결) 묻지 않는다", () => {
    const { hook } = inOnlineGame();
    act(() => leaveQuietly(() => hook.result.current[1]({ kind: "start" })));
    expect(useLeaveConfirm.getState().open).toBeNull();
    expect(hook.result.current[0]).toEqual({ kind: "start" });
  });

  it("혼자 하는 대국은 묻지 않는다", () => {
    const hook = renderHook(() => useScreenHistory<Screen>({ kind: "start" }));
    act(() => hook.result.current[1]({ kind: "playing" }));
    act(() => hook.result.current[1]({ kind: "start" }));
    expect(useLeaveConfirm.getState().open).toBeNull();
    expect(hook.result.current[0]).toEqual({ kind: "start" });
  });
});
