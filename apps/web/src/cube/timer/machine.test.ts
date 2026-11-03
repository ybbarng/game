import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import {
  inspectionPenalty,
  type MachineOptions,
  type TimerEventOut,
  TimerMachine,
} from "./machine";

function setup(opts: Partial<MachineOptions> = {}) {
  const clock = new ManualClock();
  const events: TimerEventOut[] = [];
  const m = new TimerMachine(
    clock,
    { inspection: false, holdMs: 300, blind: false, ...opts },
    (e) => {
      if (e.type !== "change") events.push(e);
    },
  );
  return { clock, m, events, types: () => events.map((e) => e.type) };
}

/** 준비까지 누르고 있다가 떼서 시작 */
function holdAndStart(clock: ManualClock, m: TimerMachine, holdMs = 300) {
  m.press();
  clock.advance(holdMs + 1);
  m.release();
}

describe("TimerMachine — 살펴보기 없음", () => {
  it("준비 시간을 넘게 누르고 떼면 시작하고, 누르면 멈춘다", () => {
    const { clock, m, types } = setup();
    m.press();
    expect(m.view().phase).toBe("holding");
    clock.advance(301);
    expect(m.view().phase).toBe("ready");
    m.release();
    expect(m.view().phase).toBe("running");
    clock.advance(12_345);
    m.press();
    expect(m.view().phase).toBe("idle");
    expect(m.view().last).toEqual({ ms: 12_345, penalty: "none" });
    expect(types()).toEqual(["ready", "start", "stop"]);
  });

  it("멈춤 입력 시각을 넘기면 처리가 늦어도 그 시각으로 잰다", () => {
    const { clock, m } = setup();
    holdAndStart(clock, m);
    clock.advance(5_000);
    // 멈춤 입력은 30ms 전에 일어났다
    m.press(clock.now() - 30);
    expect(m.view().last?.ms).toBe(5_000 - 30);
  });

  it("떼기 시각을 넘기면 시작 시각이 그 시각이다", () => {
    const { clock, m } = setup();
    m.press();
    clock.advance(301);
    m.release(clock.now() - 20);
    clock.advance(1_000);
    m.press();
    expect(m.view().last?.ms).toBe(1_020);
  });

  it("준비 시간이 되기 전에 떼면 취소된다", () => {
    const { clock, m, types } = setup();
    m.press();
    clock.advance(299);
    m.release();
    expect(m.view().phase).toBe("idle");
    // 걸어 둔 준비가 꺼져서 시간이 지나도 준비로 바뀌지 않는다
    clock.advance(1000);
    expect(m.view().phase).toBe("idle");
    expect(clock.pending()).toBe(0);
    expect(types()).toEqual([]);
  });

  it("준비 시간이 0이면 누르자마자 준비", () => {
    const { m } = setup({ holdMs: 0 });
    m.press();
    expect(m.view().phase).toBe("ready");
  });

  it("멈춘 키를 뗀 것은 새 풀이를 시작하지 않는다", () => {
    const { clock, m } = setup();
    holdAndStart(clock, m);
    clock.advance(1000);
    m.press();
    m.release();
    expect(m.view().phase).toBe("idle");
  });
});

describe("TimerMachine — 살펴보기", () => {
  it("첫 누름으로 살펴보기가 시작되고 8초·12초에 알림이 난다", () => {
    const { clock, m, events } = setup({ inspection: true });
    m.press();
    m.release();
    expect(m.view().phase).toBe("inspecting");
    clock.advance(7_999);
    expect(events.filter((e) => e.type === "inspection-warning")).toEqual([]);
    clock.advance(1);
    clock.advance(4_000);
    expect(events.filter((e) => e.type === "inspection-warning")).toEqual([
      { type: "inspection-warning", at: 8_000 },
      { type: "inspection-warning", at: 12_000 },
    ]);
  });

  it("살펴보기 중 누르고 있기를 일찍 떼면 살펴보기로 돌아간다", () => {
    const { clock, m } = setup({ inspection: true });
    m.press();
    m.release();
    clock.advance(1000);
    m.press();
    clock.advance(100);
    m.release();
    expect(m.view().phase).toBe("inspecting");
    expect(m.elapsed()).toBe(1100);
  });

  /** 살펴보기를 `startAt` ms에 시작하게 하고 결과의 벌점을 본다 */
  function penaltyWhenStartingAt(startAt: number) {
    const { clock, m } = setup({ inspection: true });
    m.press();
    m.release();
    clock.advance(startAt - 301);
    holdAndStart(clock, m);
    expect(m.view().phase).toBe("running");
    clock.advance(5000);
    m.press();
    return m.view().last;
  }

  it("15초 전에 시작하면 벌점이 없다", () => {
    expect(penaltyWhenStartingAt(14_999)).toEqual({
      ms: 5000,
      penalty: "none",
      inspectionMs: 14_999,
    });
  });

  it("딱 15초부터 +2(A4d1+)", () => {
    expect(penaltyWhenStartingAt(15_000)?.penalty).toBe("+2");
    expect(penaltyWhenStartingAt(16_999)?.penalty).toBe("+2");
  });

  it("딱 17초부터 DNF(A4d2+)", () => {
    expect(penaltyWhenStartingAt(17_000)?.penalty).toBe("DNF");
  });

  it("시작하면 남은 알림이 꺼진다", () => {
    const { clock, m, events } = setup({ inspection: true });
    m.press();
    m.release();
    clock.advance(1000);
    holdAndStart(clock, m);
    clock.advance(20_000);
    expect(events.some((e) => e.type === "inspection-warning")).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it("Esc로 살펴보기를 그만두면 대기로 돌아간다", () => {
    const { clock, m, types } = setup({ inspection: true });
    m.press();
    m.release();
    m.cancel();
    expect(m.view().phase).toBe("idle");
    expect(clock.pending()).toBe(0);
    expect(types()).toEqual(["inspection-start", "cancel"]);
  });

  it("벌점 경계", () => {
    expect(inspectionPenalty(14_999)).toBe("none");
    expect(inspectionPenalty(15_000)).toBe("+2");
    expect(inspectionPenalty(16_999)).toBe("+2");
    expect(inspectionPenalty(17_000)).toBe("DNF");
  });
});

describe("TimerMachine — 블라인드", () => {
  it("살펴보기 설정이 켜져 있어도 바로 누르고 있기로 간다", () => {
    const { m } = setup({ inspection: true, blind: true });
    m.press();
    expect(m.view().phase).toBe("holding");
  });

  it("첫 누름은 외우기 끝, 다음 누름이 멈춤", () => {
    const { clock, m, events } = setup({ blind: true });
    holdAndStart(clock, m);
    clock.advance(40_000);
    m.press();
    expect(m.view().phase).toBe("running");
    expect(events.at(-1)).toEqual({ type: "memo", ms: 40_000 });
    m.release();
    clock.advance(60_000);
    m.press();
    expect(m.view().last).toEqual({
      ms: 100_000,
      penalty: "none",
      memoMs: 40_000,
    });
  });
});
