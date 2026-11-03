import { describe, expect, it } from "vitest";
import {
  autoSolve,
  bubbleSolution,
  type Device,
  runUntil,
  setupRace,
  sortPuzzle,
} from "./race-fixture";
import { DIFFERENT_VERSION } from "./race-session";
import type { RaceGame, RaceResult } from "./types";

/** 시작 상태 만들기(`prepare`)·시작 상태 지문(`startFingerprint`) 시험 */

type Game = RaceGame<number, number[]>;

const finished = (devices: Device[]) => () =>
  devices.every((d) => d.session.snapshot().result !== undefined);

/** 지문을 섞인 숫자 줄로 두는 퍼즐. `skew`면 지문을 일부러 다르게 낸다(섞기를 다르게 만든 기기) */
function withFingerprint(skew = false): Game {
  return {
    ...sortPuzzle,
    startFingerprint: (seed, options) =>
      `${sortPuzzle.startState(seed, options).join(",")}${skew ? "!" : ""}`,
  };
}

/** 기다려야 끝나는 시작 상태 만들기. `resolve()`를 부를 때까지 끝나지 않는다 */
function slowPrepare(): {
  game: Game;
  resolve: () => void;
  reject: () => void;
  calls: () => number;
} {
  let calls = 0;
  let done: (() => void) | undefined;
  let fail: (() => void) | undefined;
  return {
    game: {
      ...sortPuzzle,
      prepare: () => {
        calls++;
        return new Promise<void>((res, rej) => {
          done = res;
          fail = rej;
        });
      },
    },
    resolve: () => done?.(),
    reject: () => fail?.(),
    calls: () => calls,
  };
}

/** 끝난 Promise의 뒷일(then)이 돌게 한다 */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("경주 틀: 시작 상태", () => {
  it("시작 상태를 늦게 만든 기기도 풀림 시각은 씨앗을 안 때부터 잰다", async () => {
    const slow = slowPrepare();
    const { clock, devices } = setupRace(2, {}, undefined, (id) =>
      id === "p2" ? slow.game : sortPuzzle,
    );
    const [a, b] = devices as [Device, Device];
    runUntil(clock, () => a.session.snapshot().phase === "inspect");
    expect(b.session.snapshot().phase).toBe("reveal");
    expect(b.session.snapshot().preparing).toBe(true);
    expect(b.session.play(0)).toEqual({ ok: false, reason: "섞기 전" });

    // 400ms 늦게 끝난다: 살펴보기는 그만큼 짧아진다
    clock.advance(400);
    slow.resolve();
    await flush();
    const snap = b.session.snapshot();
    expect(snap.phase).toBe("inspect");
    expect(snap.preparing).toBeUndefined();
    expect(snap.inspectionLeft).toBeLessThanOrEqual(1000 - 400);
    expect(b.session.startState()).toEqual(a.session.startState());
    expect(slow.calls()).toBe(1);

    autoSolve(clock, a, 300, 100);
    autoSolve(clock, b, 200, 100);
    runUntil(clock, finished(devices));
    const r = a.session.snapshot().result as RaceResult;
    expect(b.session.snapshot().result).toEqual(r);
    expect(r.players.p1?.status).toBe("done");
    expect(r.players.p2?.status).toBe("done");
  });

  it("두 기기가 수 기록을 같게 남긴다(판 끝 다시 보기)", () => {
    const { clock, devices } = setupRace(2);
    const [a, b] = devices as [Device, Device];
    autoSolve(clock, a, 300, 100);
    autoSolve(clock, b, 500, 100);
    runUntil(clock, finished(devices));
    const solution = bubbleSolution(a.session.startState() as number[]);
    for (const d of devices)
      for (const id of ["p1", "p2"]) {
        const log = d.session.moveLog(id);
        expect(log.map((x) => Number(x.m))).toEqual(solution);
      }
    expect(a.session.moveLog("p2")).toEqual(b.session.moveLog("p2"));
    expect(a.session.moveLog("p1")[0]?.t).toBe(300);
  });

  it("시작 상태를 만들지 못한 기기는 그 판 기권, 남은 사람끼리 경주한다", async () => {
    const slow = slowPrepare();
    const { clock, devices } = setupRace(3, {}, undefined, (id) =>
      id === "p3" ? slow.game : sortPuzzle,
    );
    const [a, b, c] = devices as [Device, Device, Device];
    runUntil(clock, () => c.session.snapshot().preparing === true);
    slow.reject();
    await flush();
    expect(c.session.snapshot().spectator).toBe(true);
    autoSolve(clock, a, 300, 100);
    autoSolve(clock, b, 400, 100);
    runUntil(clock, finished([a, b]));
    const r = a.session.snapshot().result as RaceResult;
    expect(r.players.p3).toMatchObject({
      status: "forfeit",
      reason: "섞기를 만들지 못함",
    });
    expect(r.ranking.slice(0, 2).sort()).toEqual(["p1", "p2"]);
    expect(b.session.snapshot().result).toEqual(r);
  });

  it("지문이 같으면 그대로 경주한다", () => {
    const { clock, devices } = setupRace(2, {}, undefined, () =>
      withFingerprint(),
    );
    devices.forEach((d, i) => {
      autoSolve(clock, d, 300 + 100 * i, 100);
    });
    runUntil(clock, finished(devices));
    const r = devices[0]?.session.snapshot().result as RaceResult;
    expect(r.cancelled).toBeUndefined();
    expect(r.ranking).toEqual(["p1", "p2"]);
  });

  it("2명에서 한 기기의 시작 상태가 다르면 섞기 어긋남으로 판이 열리지 않는다", () => {
    const { clock, devices } = setupRace(2, {}, undefined, (id) =>
      withFingerprint(id === "p2"),
    );
    runUntil(clock, finished(devices));
    const [a, b] = devices as [Device, Device];
    const ra = a.session.snapshot().result as RaceResult;
    const rb = b.session.snapshot().result as RaceResult;
    expect(ra.cancelled).toBeDefined();
    expect(rb.cancelled).toBeDefined();
    expect(ra.players.p2).toMatchObject({
      status: "forfeit",
      reason: "섞기 어긋남",
    });
    expect(rb.players.p1).toMatchObject({
      status: "forfeit",
      reason: "섞기 어긋남",
    });
  });

  it("2명에서 한 기기의 제한 시간이 다르면 섞기 어긋남으로 판이 열리지 않는다", () => {
    const { clock, devices } = setupRace(2, {}, undefined, undefined, (id) =>
      id === "p2" ? { timeLimitMs: 40_000 } : {},
    );
    runUntil(clock, finished(devices));
    const [a, b] = devices as [Device, Device];
    const ra = a.session.snapshot().result as RaceResult;
    const rb = b.session.snapshot().result as RaceResult;
    expect(ra.cancelled).toBeDefined();
    expect(rb.cancelled).toBeDefined();
    expect(ra.players.p2).toMatchObject({
      status: "forfeit",
      reason: "섞기 어긋남",
    });
    expect(rb.players.p1).toMatchObject({
      status: "forfeit",
      reason: "섞기 어긋남",
    });
  });

  it("3명에서 한 기기만 살펴보기 시간이 다르면 그 사람만 빠지고 남은 둘이 경주한다", () => {
    const { clock, devices } = setupRace(3, {}, undefined, undefined, (id) =>
      id === "p3" ? { inspectionMs: 0 } : {},
    );
    const [a, b] = devices as [Device, Device, Device];
    autoSolve(clock, a, 300, 100);
    autoSolve(clock, b, 500, 100);
    runUntil(clock, finished([a, b]));
    const r = a.session.snapshot().result as RaceResult;
    expect(b.session.snapshot().result).toEqual(r);
    expect(r.ranking).toEqual(["p1", "p2", "p3"]);
    expect(r.players.p3).toMatchObject({
      status: "forfeit",
      reason: "섞기 어긋남",
    });
  });

  it("3명에서 한 기기가 판정 설정 지문을 안 실으면(옛 판 화면) 그 사람만 「다른 판 화면」으로 빠진다", () => {
    const { clock, devices } = setupRace(3, {}, (net) => {
      net.filter = (m, from) => {
        const msg = m as { type?: string; rules?: string };
        if (from === "p3" && msg.type === "race-seed") delete msg.rules;
        return m;
      };
    });
    const [a, b] = devices as [Device, Device, Device];
    autoSolve(clock, a, 300, 100);
    autoSolve(clock, b, 500, 100);
    runUntil(clock, finished([a, b]));
    const r = a.session.snapshot().result as RaceResult;
    expect(b.session.snapshot().result).toEqual(r);
    expect(r.ranking).toEqual(["p1", "p2", "p3"]);
    expect(r.players.p3).toMatchObject({
      status: "forfeit",
      reason: DIFFERENT_VERSION,
    });
  });

  it("3명에서 한 기기의 시작 상태만 다르면 그 사람만 빠지고 남은 둘이 새 섞기로 경주한다", () => {
    const { clock, devices } = setupRace(3, {}, undefined, (id) =>
      withFingerprint(id === "p3"),
    );
    const [a, b] = devices as [Device, Device, Device];
    autoSolve(clock, a, 300, 100);
    autoSolve(clock, b, 500, 100);
    runUntil(clock, finished([a, b]));
    const r = a.session.snapshot().result as RaceResult;
    expect(b.session.snapshot().result).toEqual(r);
    expect(a.session.snapshot().attempt).toBe(1);
    expect(r.ranking).toEqual(["p1", "p2", "p3"]);
    expect(r.players.p3).toMatchObject({
      status: "forfeit",
      reason: "섞기 어긋남",
    });
  });
});
