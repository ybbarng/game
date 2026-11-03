import { describe, expect, it } from "vitest";
import {
  autoSolve,
  bubbleSolution,
  type Device,
  runUntil,
  setupRace,
  sortPuzzle,
} from "./race-fixture";
import type { RaceResult } from "./types";

const finished = (devices: Device[]) => () =>
  devices.every((d) => d.session.snapshot().result !== undefined);

const results = (devices: Device[]) =>
  devices.map((d) => d.session.snapshot().result as RaceResult);

/** 모든 기기가 같은 결과(순위·시간·하한·까닭)를 냈는지 */
function expectSameEverywhere(devices: Device[]): RaceResult {
  const [first, ...rest] = results(devices);
  for (const r of rest) expect(r).toEqual(first);
  return first as RaceResult;
}

describe("경주 틀", () => {
  it("정직한 2명: 두 기기가 같은 섞기·같은 순위를 내고, 빠른 연결이면 보고 시간을 그대로 인정한다", () => {
    const { clock, devices } = setupRace(2);
    const [a, b] = devices as [Device, Device];
    runUntil(clock, () => a.session.snapshot().phase === "inspect");
    expect(a.session.snapshot().seed).toBe(b.session.snapshot().seed);
    expect(a.session.startState()).toEqual(b.session.startState());

    const sa = autoSolve(clock, a, 300, 100);
    const sb = autoSolve(clock, b, 500, 100);
    runUntil(clock, finished(devices));
    const r = expectSameEverywhere(devices);
    const pa = r.players.p1;
    const pb = r.players.p2;
    expect(pa?.reported).toBe(300 + 100 * (sa.moves() - 1));
    expect(pb?.reported).toBe(500 + 100 * (sb.moves() - 1));
    // 하한 = 보고 + 왕복(2×20) − cap(200) → 보고보다 작아 그대로
    expect(pa?.bounds).toEqual({ p2: (pa?.reported as number) + 40 - 200 });
    expect(pa?.accepted).toBe(pa?.reported);
    expect(pb?.accepted).toBe(pb?.reported);
    const expected =
      (pa?.reported as number) <= (pb?.reported as number)
        ? ["p1", "p2"]
        : ["p2", "p1"];
    expect(r.ranking).toEqual(expected);
  });

  it("정직한 4명(연결마다 다른 지연, 기기마다 다른 시계): 모든 기기가 같은 결과", () => {
    const { clock, devices } = setupRace(4, {}, (net) => {
      net.setDelay("p1", "p3", 60);
      net.setDelay("p3", "p1", 45);
      net.setDelay("p2", "p4", 90);
      net.setDelay("p4", "p2", 10);
    });
    devices.forEach((d, i) => {
      autoSolve(clock, d, 200 + 150 * i, 80);
    });
    runUntil(clock, finished(devices));
    const r = expectSameEverywhere(devices);
    expect(r.ranking).toEqual(["p1", "p2", "p3", "p4"]);
    for (const id of r.ranking) {
      const p = r.players[id];
      expect(p?.status).toBe("done");
      expect(Object.keys(p?.bounds ?? {})).toHaveLength(3);
      expect(p?.accepted).toBe(p?.reported);
    }
  });

  it("살펴보기 중에는 수를 거절하고, 풀린 뒤에만 받는다", () => {
    const { clock, devices } = setupRace(2);
    const a = devices[0] as Device;
    expect(a.session.play(0)).toEqual({ ok: false, reason: "섞기 전" });
    runUntil(clock, () => a.session.snapshot().phase === "inspect");
    expect(a.session.snapshot().inspectionLeft).toBe(1000);
    expect(a.session.play(0)).toEqual({ ok: false, reason: "살펴보기 중" });
    expect(a.session.snapshot().peers[0]?.moves).toBe(0);
    clock.advance(1000);
    expect(a.session.snapshot().phase).toBe("race");
    expect(a.session.play(99)).toEqual({ ok: false, reason: "둘 수 없는 수" });
    expect(a.session.play(0).ok).toBe(true);
  });

  it("시간을 줄여 보고하면(시계를 몰래 1초 돌림) cap 안쪽까지만 이득을 본다", () => {
    const { clock, devices } = setupRace(2);
    const [cheat, honest] = devices as [Device, Device];
    const s = autoSolve(clock, cheat, 1500, 100, () => {
      cheat.clock.offset -= 1000;
    });
    autoSolve(clock, honest, 1500, 100);
    runUntil(clock, finished(devices));
    const r = expectSameEverywhere(devices);
    const trueTime = 1500 + 100 * (s.moves() - 1);
    const p = r.players.p1;
    expect(p?.reported).toBe(trueTime - 1000);
    // 하한 = 참 시간 + 왕복 40 − cap 200
    expect(p?.accepted).toBe(trueTime + 40 - 200);
    expect(trueTime - (p?.accepted as number)).toBeLessThanOrEqual(200);
    // 수마다 하한: 줄여 단 시각이 하한보다 이르다(표시만)
    expect(honest.session.snapshot().lateMoves.p1).toBe(s.moves());
  });

  it("맞추지 않았는데 맞췄다고 하면 다른 기기가 다시 적용해 보고 못 맞춤(DNF)으로 본다", () => {
    const { clock, devices } = setupRace(2);
    const [cheat, honest] = devices as [Device, Device];
    autoSolve(clock, honest, 300, 100);
    runUntil(clock, () => cheat.session.snapshot().phase === "race");
    const first = bubbleSolution(cheat.session.startState() as number[]);
    expect(cheat.session.play(first[0] as number).ok).toBe(true);
    clock.advance(100);
    cheat.transport.send({
      type: "race-done",
      race: "r1",
      attempt: cheat.session.snapshot().attempt,
      n: 1,
      t: 150,
    });
    runUntil(clock, () => honest.session.snapshot().result !== undefined);
    const r = honest.session.snapshot().result as RaceResult;
    expect(r.players.p1).toMatchObject({
      status: "dnf",
      reason: "맞추지 못함",
    });
    expect(r.ranking).toEqual(["p2", "p1"]);
  });

  it("약속 뒤 공개하지 않은 사람은 그 판 기권, 남은 사람끼리 다시 약속해 경주한다", () => {
    const { clock, net, devices } = setupRace(3, {}, (n) => {
      n.filter = (m, from) =>
        from === "p3" && (m as { type: string }).type === "race-reveal"
          ? null
          : m;
    });
    const [a, b, c] = devices as [Device, Device, Device];
    autoSolve(clock, a, 300, 100);
    autoSolve(clock, b, 400, 100);
    runUntil(clock, finished(devices));
    expect(net.filter).toBeDefined();
    const r = expectSameEverywhere(devices);
    expect(r.players.p3).toMatchObject({
      status: "forfeit",
      reason: "공개 안 함",
    });
    expect(r.ranking).toEqual(["p1", "p2", "p3"]);
    expect(a.session.snapshot().attempt).toBe(1);
    expect(c.session.snapshot().spectator).toBe(true);
    // 새 시도의 씨앗은 남은 두 사람 공개값으로 다시 정했다
    expect(a.session.snapshot().seed).toBe(b.session.snapshot().seed);
    expect(c.session.snapshot().seed).toBe(a.session.snapshot().seed);
  });

  it("공개가 일부 기기에만 닿아 기기마다 판단이 갈려도, 기권 목록을 합쳐 한 섞기로 모인다", () => {
    const { clock, devices } = setupRace(3, {}, (n) => {
      n.filter = (m, from, to) =>
        from === "p3" &&
        to === "p2" &&
        (m as { type: string }).type === "race-reveal"
          ? null
          : m;
    });
    const [a, b] = devices as [Device, Device, Device];
    autoSolve(clock, a, 300, 100);
    autoSolve(clock, b, 400, 100);
    runUntil(clock, finished(devices));
    const r = expectSameEverywhere(devices);
    expect(r.players.p3).toMatchObject({
      status: "forfeit",
      reason: "공개 안 함",
    });
    expect(a.session.snapshot().seed).toBe(b.session.snapshot().seed);
    expect(r.ranking).toEqual(["p1", "p2", "p3"]);
  });

  it("한 사람이 기기마다 다른 약속을 보내면 섞기 어긋남으로 기권", () => {
    const { clock, devices } = setupRace(3, {}, (n) => {
      n.filter = (m, from, to) => {
        const msg = m as { type: string; commit?: string; attempt: number };
        if (from === "p3" && to === "p2" && msg.attempt === 0) {
          if (msg.type === "race-commit")
            return { ...msg, commit: "다른 약속" };
          if (msg.type === "race-reveal") return null;
        }
        return m;
      };
    });
    const [a, b] = devices as [Device, Device, Device];
    autoSolve(clock, a, 300, 100);
    autoSolve(clock, b, 400, 100);
    runUntil(clock, finished(devices));
    const r = expectSameEverywhere(devices.slice(0, 2));
    expect(r.players.p3?.status).toBe("forfeit");
    expect(r.ranking).toEqual(["p1", "p2", "p3"]);
  });

  it("3명에서 한 사람이 남의 도착 하한을 거짓으로 크게 보고해도 가운데 값이라 결과가 그대로다", () => {
    const run = (lie: boolean) => {
      const { clock, devices } = setupRace(3, {}, (n) => {
        if (!lie) return;
        n.filter = (m, from) => {
          const msg = m as { type: string; of?: string; bound: number | null };
          if (from === "p3" && msg.type === "race-bound" && msg.of === "p1")
            return { ...msg, bound: (msg.bound ?? 0) + 5000 };
          return m;
        };
      });
      autoSolve(clock, devices[0] as Device, 300, 100);
      autoSolve(clock, devices[1] as Device, 350, 100);
      autoSolve(clock, devices[2] as Device, 400, 100);
      runUntil(clock, finished(devices));
      // 거짓말한 p3 기기는 자기 참값을 갖고 있으니 정직한 두 기기를 맞춰 본다
      return expectSameEverywhere(lie ? devices.slice(0, 2) : devices);
    };
    const honest = run(false);
    const lied = run(true);
    expect(lied.ranking).toEqual(honest.ranking);
    expect(lied.players.p1?.accepted).toBe(honest.players.p1?.accepted);
    expect(lied.players.p1?.usedBound).toBe(lied.players.p1?.bounds?.p2);
    expect(lied.players.p1?.bounds?.p3).toBe(
      (honest.players.p1?.bounds?.p3 as number) + 5000,
    );
  });

  it("늦게 닿은 '맞췄다'(지연 주입)는 넘는 만큼 시간이 늘고 모든 기기가 같은 값을 낸다", () => {
    const { clock, net, devices } = setupRace(2);
    const [slow, fast] = devices as [Device, Device];
    const s = autoSolve(clock, slow, 300, 100);
    autoSolve(clock, fast, 300, 100);
    runUntil(clock, () => slow.session.snapshot().phase === "race");
    net.setDelay("p1", "p2", 300);
    runUntil(clock, finished(devices));
    const r = expectSameEverywhere(devices);
    const trueTime = 300 + 100 * (s.moves() - 1);
    // 하한 = 참 시간 + (20 + 300) − 200
    expect(r.players.p1?.accepted).toBe(trueTime + 120);
    expect(r.players.p1?.reported).toBe(trueTime);
    expect(r.players.p2?.accepted).toBe(r.players.p2?.reported);
    expect(r.ranking).toEqual(["p2", "p1"]);
  });

  it("경주 중 끊겼다 돌아오면 못 받은 수를 다시 받아 확인하고, 그 판은 '확인 약함'으로 보고 시간을 쓴다", () => {
    const { clock, net, devices } = setupRace(2);
    const [flaky, steady] = devices as [Device, Device];
    autoSolve(clock, flaky, 300, 100);
    autoSolve(clock, steady, 5000, 100);
    runUntil(clock, () => flaky.session.snapshot().phase === "race");
    clock.advance(400);
    net.disconnect("p1");
    clock.advance(0);
    expect(
      steady.session.snapshot().peers.find((p) => p.id === "p1")?.connected,
    ).toBe(false);
    clock.advance(2000);
    const seenWhileDown = steady.session
      .snapshot()
      .peers.find((p) => p.id === "p1")?.moves as number;
    expect(flaky.session.snapshot().peers[0]?.moves).toBeGreaterThan(
      seenWhileDown,
    );
    net.reconnect("p1");
    runUntil(clock, finished(devices));
    const r = expectSameEverywhere(devices);
    expect(r.players.p1?.moves).toBe(flaky.session.snapshot().peers[0]?.moves);
    expect(r.players.p1).toMatchObject({
      status: "done",
      weak: true,
      usedBound: null,
      bounds: { p2: null },
    });
    expect(r.players.p1?.accepted).toBe(r.players.p1?.reported);
  });

  it("시간 안에 못 맞춘 사람은 판 끝에 DNF", () => {
    const { clock, devices } = setupRace(2, { timeLimitMs: 3000 });
    autoSolve(clock, devices[0] as Device, 100, 50);
    runUntil(clock, finished(devices));
    const r = expectSameEverywhere(devices);
    expect(r.players.p2).toMatchObject({
      status: "dnf",
      reason: "시간 안에 맞추지 못함",
    });
    expect(r.ranking).toEqual(["p1", "p2"]);
  });

  it("시험용 퍼즐: 씨앗이 같으면 같은 시작, 거품 정렬로 풀린다", () => {
    const s = sortPuzzle.startState("abc", undefined);
    expect(sortPuzzle.startState("abc", undefined)).toEqual(s);
    const solved = bubbleSolution(s).reduce(sortPuzzle.apply, s);
    expect(sortPuzzle.isSolved(solved)).toBe(true);
  });
});
