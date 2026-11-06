import type { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";
import {
  autoSolve,
  type Device,
  runUntil,
  setupRace,
  TEST_OPTIONS,
} from "./race-fixture";

/**
 * 게임이 끝났다고 확정한 남(`RaceSession.judgeOut`, docs/47 9-6). 그 사람이 스스로 그만둔다고 알리지 않아도 판이 제한 시간까지
 * 끌리지 않는다. ManualClock·DelayNet 위라 결정적이다.
 */

const REASON = "시험: 끝났다고 봄";

/** 풀림 뒤 `startMs`부터 `everyMs`마다 맨 앞 두 칸을 바꾼다(맞추지 않고 계속 두는 사람). 판이 끝나거나 거절되면 멈춘다 */
function fidget(
  clock: ManualClock,
  d: Device,
  startMs: number,
  everyMs: number,
) {
  let started = false;
  d.session.onChange((snap) => {
    if (started || snap.phase !== "race") return;
    started = true;
    const tick = () => {
      if (!d.session.play(0).ok) return;
      clock.after(everyMs, tick);
    };
    clock.after(startMs, tick);
  });
}

/** 이 기기가 본 그 사람의 받은 마지막 수 시각 */
const lastOf = (d: Device, id: string) =>
  d.session.moveLog(id).at(-1)?.t ?? Number.NEGATIVE_INFINITY;

describe("게임이 끝났다고 본 사람(judgeOut)", () => {
  it("알리지 않고 계속 두어도 기다림 뒤 그 사람을 DNF로 두고 판을 닫는다. 수 기록은 그 시각까지로 자른다", () => {
    const { clock, devices } = setupRace(2);
    const [p1, p2] = devices as [Device, Device];
    autoSolve(clock, p1, 100, 50);
    fidget(clock, p2, 100, 100);
    const upTo = 1_500;
    // 그 시각 뒤 수를 아직 받지 못했으면 받지 않는다
    expect(p1.session.judgeOut("p2", REASON, upTo)).toBe(false);
    runUntil(clock, () => lastOf(p1, "p2") > upTo);
    expect(p1.session.judgeOut("p2", REASON, upTo)).toBe(true);
    // 두 번째 부름은 버린다
    expect(p1.session.judgeOut("p2", "다른 까닭", upTo + 500)).toBe(false);
    const since = clock.now();
    runUntil(clock, () => p1.session.snapshot().result !== undefined);
    // 제한 시간(20초)이 아니라 기다림(3초) 뒤에 닫힌다
    expect(clock.now() - since).toBeLessThan(3_100);
    expect(clock.now() - since).toBeGreaterThanOrEqual(3_000);
    const r = p1.session.snapshot().result;
    expect(r?.players.p2).toMatchObject({ status: "dnf", reason: REASON });
    expect(r?.ranking).toEqual(["p1", "p2"]);
    const log = p1.session.moveLog("p2");
    expect(log.every((x) => x.t <= upTo)).toBe(true);
    expect(r?.players.p2?.moves).toBe(log.length);
    expect(clock.now()).toBeLessThan(TEST_OPTIONS.timeLimitMs);
  });

  it("기다리는 동안 그 사람이 스스로 그만두면 그 말대로 둔다(정직한 기기는 예전과 같다)", () => {
    const { clock, devices } = setupRace(2);
    const [p1, p2] = devices as [Device, Device];
    autoSolve(clock, p1, 100, 50);
    fidget(clock, p2, 100, 100);
    runUntil(clock, () => lastOf(p1, "p2") > 1_000);
    expect(p1.session.judgeOut("p2", REASON, 1_000)).toBe(true);
    clock.advance(1_000);
    p2.session.retire("약속 안 함");
    runUntil(clock, () => p1.session.snapshot().result !== undefined);
    const r = p1.session.snapshot().result;
    expect(r?.players.p2?.reason).toBe("약속 안 함");
    // 자르지 않는다: 그만두기 전에 둔 수가 모두 남는다
    expect(lastOf(p1, "p2")).toBeGreaterThan(1_000);
    expect(r).toEqual(p2.session.snapshot().result);
  });

  it("그 사람의 수가 늦게 닿는 기기와 빨리 닿는 기기가 같은 시각으로 정하면 결과가 같다", () => {
    const { clock, devices } = setupRace(3, {}, (net) => {
      net.setDelay("p3", "p1", 40);
      net.setDelay("p3", "p2", 900);
    });
    const [p1, p2, p3] = devices as [Device, Device, Device];
    autoSolve(clock, p1, 100, 60);
    autoSolve(clock, p2, 200, 80);
    fidget(clock, p3, 100, 70);
    const upTo = 2_000;
    for (const d of [p1, p2]) {
      let sent = false;
      d.session.onChange(() => {
        if (!sent && lastOf(d, "p3") > upTo)
          sent = d.session.judgeOut("p3", REASON, upTo);
      });
    }
    runUntil(clock, () =>
      [p1, p2].every((d) => d.session.snapshot().result !== undefined),
    );
    const r1 = p1.session.snapshot().result;
    expect(r1?.players.p3).toMatchObject({ status: "dnf", reason: REASON });
    expect(p2.session.snapshot().result).toEqual(r1);
    expect(p2.session.moveLog("p3")).toEqual(p1.session.moveLog("p3"));
  });
});
