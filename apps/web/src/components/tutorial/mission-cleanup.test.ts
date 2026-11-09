// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalMatch } from "@/game/local-match";
import { useGame } from "@/game/store";
import { heartsTutorial } from "@/hearts/components/hearts-tutorial";
import { useHearts } from "@/hearts/store";

import { mightyTutorial } from "./mighty-tutorial";

// 배우기 미션을 마치고 넘어가면 미션 판을 닫는다. 컴퓨터 차례와 연출 타이머가 뒤에서 돌지 않고,
// 하던 게임(이어하기) 저장은 그대로 둔다.
const SAVED = JSON.stringify({ version: 1, log: [], marker: "하던 게임" });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("배우기 미션 판 닫기", () => {
  it("마이티: 미션을 넘기면 판을 떼고 연출 타이머를 멈춘다", () => {
    localStorage.setItem("mighty-save", SAVED);
    mightyTutorial.startMission(null);
    const host = useGame.getState().host as LocalMatch | null;
    expect(host).not.toBeNull();
    // 나눠 주기·컴퓨터 수 연출이 줄을 서 있다.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    mightyTutorial.endMission?.();
    expect(useGame.getState().host).toBeNull();
    expect(useGame.getState().view).toBeNull();
    expect(useGame.getState().queue).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    const seq = useGame.getState().seq;
    vi.runAllTimers();
    expect(useGame.getState().seq).toBe(seq);
    expect(localStorage.getItem("mighty-save")).toBe(SAVED);
  });

  it("하트: 닫지 않으면 컴퓨터가 뒤에서 계속 둔다(비교용)", () => {
    heartsTutorial.startMission(null);
    const host = useHearts.getState().host as LocalMatch | null;
    if (!host) throw new Error("미션 판이 없다");
    const before = host.save().log.length;
    vi.runOnlyPendingTimers();
    expect(host.save().log.length).toBeGreaterThan(before);
    useHearts.getState().leave();
  });

  it("하트: 미션을 넘기면 컴퓨터가 더 두지 않는다", () => {
    localStorage.setItem("hearts-save", SAVED);
    heartsTutorial.startMission(null);
    const host = useHearts.getState().host as LocalMatch | null;
    if (!host) throw new Error("미션 판이 없다");
    const before = host.save().log.length;

    heartsTutorial.endMission?.();
    expect(useHearts.getState().host).toBeNull();
    expect(useHearts.getState().view).toBeNull();
    // 이미 걸린 컴퓨터 차례 타이머는 돌아도 닫힌 판을 보고 바로 끝나고, 새로 걸지 않는다.
    vi.runAllTimers();
    expect(vi.getTimerCount()).toBe(0);
    expect(host.save().log.length).toBe(before);
    expect(localStorage.getItem("hearts-save")).toBe(SAVED);
  });
});
