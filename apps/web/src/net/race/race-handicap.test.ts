import { describe, expect, it } from "vitest";
import {
  autoSolve,
  bubbleSolution,
  type Device,
  runUntil,
  setupRace,
  sortPuzzle,
} from "./race-fixture";
import type { RaceGame, RaceResult } from "./types";

/**
 * 대결 틀의 핸디캡 받침(docs/47 9-5): 사람마다 출발 늦추기(`startDelayMs`)와 사람마다 끝 판정(`isSolved(state, player)`).
 * 모두 ManualClock·DelayNet 위라 결정적이다.
 */

const finished = (devices: Device[]) => () =>
  devices.every((d) => d.session.snapshot().result !== undefined);

function sameEverywhere(devices: Device[]): RaceResult {
  const [first, ...rest] = devices.map(
    (d) => d.session.snapshot().result as RaceResult,
  );
  for (const r of rest) expect(r).toEqual(first);
  return first as RaceResult;
}

// biome-ignore lint/suspicious/noExplicitAny: 고친 클라이언트 재현은 private 안을 그대로 만진다
const inside = (d: Device): any => d.session;

describe("출발 늦추기", () => {
  it("늦춘 사람은 k초 전 수를 둘 수 없고(살펴보기는 그대로), k초가 지나면 둔다. 시간은 같은 풀림부터 잰다", () => {
    const { clock, devices } = setupRace(2, { startDelayMs: { p1: 3_000 } });
    const [slow, other] = devices as [Device, Device];
    runUntil(clock, () => slow.session.snapshot().phase === "race");
    const moves = bubbleSolution(slow.session.startState() as number[]);
    expect(slow.session.play(moves[0] as number)).toEqual({
      ok: false,
      reason: "출발 전",
    });
    clock.advance(2_900);
    expect(slow.session.play(moves[0] as number)).toMatchObject({ ok: false });
    clock.advance(100);
    // 꼭 k초도 된다
    expect(slow.session.play(moves[0] as number)).toMatchObject({ ok: true });
    for (const m of moves.slice(1)) slow.session.play(m);
    // 늦추지 않은 사람은 처음부터 둔다
    autoSolve(clock, other, 0, 100);
    runUntil(clock, finished(devices));
    const r = sameEverywhere(devices);
    expect(r.players.p1?.status).toBe("done");
    expect(r.players.p1?.accepted).toBeGreaterThanOrEqual(3_000);
  });

  it("정직하게 k초에 둔 수는 연결이 느려도 받는다", () => {
    const { clock, devices } = setupRace(
      2,
      { startDelayMs: { p1: 2_000 } },
      (net) => {
        net.setDelay("p1", "p2", 400);
        net.setDelay("p2", "p1", 400);
      },
    );
    autoSolve(clock, devices[0] as Device, 2_000, 50);
    autoSolve(clock, devices[1] as Device, 0, 50);
    runUntil(clock, finished(devices));
    const r = sameEverywhere(devices);
    expect(r.players.p1?.status).toBe("done");
    expect(r.players.p2?.status).toBe("done");
  });

  it("고친 클라이언트가 출발 전에 두고 시각을 늦게 적어 보내면, 도착 시각으로 증명되어 그 사람만 DNF", () => {
    const { clock, devices } = setupRace(3, { startDelayMs: { p1: 5_000 } });
    const [cheat, ...honest] = devices as [Device, Device, Device];
    for (const d of honest) autoSolve(clock, d, 300, 100);
    // 콘솔에서: 자기 기기의 막기를 빼고, 시계를 5초 앞으로 돌려 수에 「5초 뒤」를 단다
    inside(cheat).startDelay = new Map();
    autoSolve(clock, cheat, 200, 50, () => {
      cheat.clock.offset += 5_000;
    });
    runUntil(clock, finished(honest));
    const r = sameEverywhere(honest);
    expect(r.players.p1).toMatchObject({ status: "dnf" });
    expect(r.players.p1?.reason).toMatch(/^출발 전에 둔 수\(1번째\)$/);
    expect(r.players.p2?.status).toBe("done");
    expect(r.players.p3?.status).toBe("done");
  });

  it("단 시각이 출발 전이면 바로 DNF", () => {
    const { clock, devices } = setupRace(2, { startDelayMs: { p1: 5_000 } });
    const [cheat, honest] = devices as [Device, Device];
    inside(cheat).startDelay = new Map();
    autoSolve(clock, cheat, 100, 50);
    autoSolve(clock, honest, 300, 100);
    runUntil(clock, finished([honest]));
    const r = honest.session.snapshot().result as RaceResult;
    expect(r.players.p1?.reason).toBe("출발 전에 둔 수(1번째)");
  });

  it("기기마다 다른 출발 늦추기를 받으면 판정 설정이 어긋나 판이 열리지 않는다. 0초만 있으면 예전 판과 같다", () => {
    const { clock, devices } = setupRace(2, {}, undefined, undefined, (id) =>
      id === "p1" ? { startDelayMs: { p1: 3_000 } } : {},
    );
    runUntil(clock, finished(devices));
    for (const d of devices)
      expect(d.session.snapshot().result?.cancelled).toBeDefined();

    // 0초는 늦추기가 없는 것과 같다(옛 판 화면과 지문이 같다)
    const same = setupRace(2, {}, undefined, undefined, (id) =>
      id === "p1" ? { startDelayMs: { p1: 0, p2: 0 } } : {},
    );
    for (const d of same.devices) autoSolve(same.clock, d, 100, 100);
    runUntil(same.clock, finished(same.devices));
    const r = sameEverywhere(same.devices);
    expect(r.cancelled).toBeUndefined();
    expect(r.players.p1?.status).toBe("done");
  });
});

describe("사람마다 끝 판정", () => {
  /** p1은 앞 두 칸만 맞으면 끝(목표 다르게) */
  const partial: RaceGame<number, number[]> = {
    ...sortPuzzle,
    isSolved: (state, player) =>
      player === "p1"
        ? state[0] === 0 && state[1] === 1
        : sortPuzzle.isSolved(state),
  };

  it("목표에 닿은 수에서 끝나고, 다른 기기도 같은 판정으로 받는다", () => {
    const { clock, devices } = setupRace(
      2,
      { inspectionMs: 0, gameOptions: { goal: "p1:front" } },
      undefined,
      () => partial,
    );
    const [short, full] = devices as [Device, Device];
    autoSolve(clock, full, 100, 100);
    runUntil(clock, () => short.session.snapshot().phase === "race");
    // 목표에 닿을 때까지 한 수씩(닿은 뒤에는 「끝남」이라 더 두지 않는다)
    for (const m of bubbleSolution(short.session.startState() as number[])) {
      clock.advance(100);
      const played = short.session.play(m);
      expect(played.ok).toBe(true);
      if (played.ok && played.solved) break;
    }
    runUntil(clock, finished(devices));
    const r = sameEverywhere(devices);
    expect(r.players.p1?.status).toBe("done");
    expect(r.players.p2?.status).toBe("done");
    const log = devices[1]?.session.moveLog("p1") ?? [];
    const start = devices[1]?.session.startState() as number[];
    // 끝난 상태는 목표만 맞고, 그 앞 수까지는 목표가 아니었다
    let state = start;
    for (const [i, x] of log.entries()) {
      state = sortPuzzle.apply(state, Number(x.m));
      expect(partial.isSolved(state, "p1")).toBe(i === log.length - 1);
    }
    expect(r.players.p1?.moves).toBe(log.length);
  });
});
