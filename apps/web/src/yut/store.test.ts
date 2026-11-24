// @vitest-environment jsdom

import { STANDARD_RULES } from "@game/yut-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadYut, setTossDirector, useYut } from "./store";

/** 내 차례면 하나 한다(던지기·첫 말 옮기기). 한 것이 있으면 true */
function actOnce(): boolean {
  const s = useYut.getState();
  const d = s.view?.decision;
  if (!d || s.queue.length > 0 || s.tossing) return false;
  if (d.kind === "throw")
    return s.throwGesture({ height: 40, direction: 1, strength: 50 }).ok;
  if (d.kind === "move") {
    const o = d.options[0];
    return o
      ? s.submit({ type: "move", value: o.value, from: o.from }).ok
      : false;
  }
  return false;
}

/** 내가 말을 `times`번 옮길 때까지 진행한다 */
function playUntilMoved(times: number): void {
  for (let i = 0; i < 300; i++) {
    const log = useYut.getState().local?.save().log ?? [];
    if (
      log.filter((e) => e.seat === 0 && e.action.type === "move").length >=
      times
    )
      break;
    vi.runOnlyPendingTimers();
    actOnce();
  }
}

const myActions = (type: string) =>
  (useYut.getState().local?.save().log ?? []).filter(
    (e) => e.seat === 0 && e.action.type === type,
  ).length;

describe("윷놀이 저장소(공장 + 던지기 사슬·연출 확장)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    setTossDirector(null);
    useYut.getState().leave();
    vi.useRealTimers();
  });

  it("사슬 약속·고리 공개·몸짓 열기는 내 기기가 저절로 낸다", () => {
    useYut.getState().newGame({ rules: STANDARD_RULES, level: 0, seed: 7 });
    playUntilMoved(2);
    expect(myActions("commit")).toBeGreaterThanOrEqual(1);
    expect(myActions("reveal")).toBeGreaterThanOrEqual(2);
    expect(myActions("open")).toBeGreaterThanOrEqual(2);
  });

  it("멍석이 던지기를 맡으면 연출이 끝날 때까지 다음 장면을 멈추고 말 옮기기를 받지 않는다", () => {
    const directed: number[] = [];
    setTossDirector((view) => {
      directed.push(view.throwCount);
      return true;
    });
    useYut.getState().newGame({ rules: STANDARD_RULES, level: 0, seed: 7 });
    // 컴퓨터가 던진 것을 연출하는 때까지(내 던지기 연출은 바로 끝낸다)
    const botTossing = () => {
      const s = useYut.getState();
      return s.tossing && s.view?.turn !== s.view?.mySeat;
    };
    for (let i = 0; i < 300 && !botTossing(); i++) {
      if (useYut.getState().tossing) useYut.getState().finishToss();
      vi.runOnlyPendingTimers();
      actOnce();
    }
    expect(botTossing()).toBe(true);
    const shown = useYut.getState().view;
    expect(
      useYut.getState().submit({ type: "move", value: 1, from: -1 }),
    ).toEqual({ ok: false, error: "잠깐만요." });
    // 연출 중에 컴퓨터가 말을 옮겨도 그 장면은 쌓이기만 하고 보이지 않는다(안전장치 9초 전까지)
    vi.advanceTimersByTime(3000);
    useYut.getState().landToss();
    expect(useYut.getState().landed).toBe(true);
    expect(useYut.getState().view).toBe(shown);
    expect(useYut.getState().queue.length).toBeGreaterThan(0);

    useYut.getState().finishToss();
    expect(useYut.getState().tossing).toBe(false);
    expect(useYut.getState().landed).toBe(false);
    // 쌓인 컴퓨터 걸음은 생각하는 쉼 뒤에 이어 보인다
    vi.advanceTimersByTime(1000);
    expect(useYut.getState().view).not.toBe(shown);
    expect(directed.length).toBeGreaterThan(0);
  });

  it("연출이 끝났다는 소식이 끝내 오지 않으면 안전장치가 이어 간다", () => {
    setTossDirector(() => true);
    useYut.getState().newGame({ rules: STANDARD_RULES, level: 0, seed: 7 });
    for (let i = 0; i < 100 && !useYut.getState().tossing; i++) {
      vi.runOnlyPendingTimers();
      actOnce();
    }
    expect(useYut.getState().tossing).toBe(true);
    vi.advanceTimersByTime(9000);
    expect(useYut.getState().tossing).toBe(false);
  });

  it("이어하면 같은 기록으로 다시 서고, 무르면 내 마지막 말 옮기기까지 되돌린다", () => {
    useYut.getState().newGame({ rules: STANDARD_RULES, level: 0, seed: 7 });
    playUntilMoved(2);
    const saved = loadYut();
    if (!saved) throw new Error("저장본이 없어요.");
    useYut.getState().leave();
    useYut.getState().resume(saved);
    const log = useYut.getState().local?.save().log ?? [];
    expect(log.length).toBe(saved.log.length);

    const lastMove = log.findLastIndex(
      (e) => e.seat === 0 && e.action.type === "move",
    );
    expect(useYut.getState().undo()).toBe(true);
    expect(useYut.getState().local?.save().log.length).toBe(lastMove);
  });
});
