import { describe, expect, it } from "vitest";
import { autoSolve, type Device, runUntil, setupRace } from "./race-fixture";
import { LEFT_RACE, OTHER_REASON } from "./race-session";
import type { RaceResult } from "./types";

/**
 * 고친 클라이언트(콘솔·확장 프로그램)가 보내는 공격을 재현한다(docs/47 9-2 「막은 것」).
 * private 함수를 바꿔 끼우거나 메시지를 직접 보낸다. 모두 ManualClock·DelayNet 위라 결정적이다.
 */

const finished = (devices: Device[]) => () =>
  devices.every((d) => d.session.snapshot().result !== undefined);

/** 정직한 기기들이 모두 같은 결과를 냈는지 */
function sameEverywhere(devices: Device[]): RaceResult {
  const [first, ...rest] = devices.map(
    (d) => d.session.snapshot().result as RaceResult,
  );
  for (const r of rest) expect(r).toEqual(first);
  return first as RaceResult;
}

// biome-ignore lint/suspicious/noExplicitAny: 공격 재현은 private 안을 그대로 만진다
const inside = (d: Device): any => d.session;

const attemptOf = (d: Device) => d.session.snapshot().attempt;

describe("대결 틀: 공격 재현", () => {
  it("① 섞기를 정한 뒤 시도 번호만 올린 약속(판 엎기)을 보내도 다시 섞지 않고, 보낸 사람만 빠진다(정직한 세 기기 같은 결과)", () => {
    const { clock, devices } = setupRace(4);
    const [cheat, ...honest] = devices as [Device, Device, Device, Device];
    autoSolve(clock, honest[0] as Device, 300, 100);
    autoSolve(clock, honest[1] as Device, 400, 100);
    autoSolve(clock, honest[2] as Device, 500, 100);
    const victim = honest[0] as Device;
    runUntil(clock, () => victim.session.moveLog("p2").length >= 3);
    // 콘솔에서 하던 것: 시도를 하나 올려 약속을 새로 보낸다
    inside(cheat).startAttempt(cheat.session.snapshot().attempt + 1);
    runUntil(clock, finished(honest));
    const r = sameEverywhere(honest);
    for (const d of honest) expect(attemptOf(d)).toBe(0);
    expect(r.players.p1).toMatchObject({
      status: "forfeit",
      reason: LEFT_RACE,
    });
    expect(r.ranking).toEqual(["p2", "p3", "p4", "p1"]);
  });

  it("① 2명: 판 엎기를 보내면 보낸 사람이 기권, 상대는 그 판을 이어서 맞춘다", () => {
    const { clock, devices } = setupRace(2);
    const [cheat, honest] = devices as [Device, Device];
    autoSolve(clock, honest, 300, 100);
    runUntil(clock, () => honest.session.moveLog("p2").length >= 2);
    inside(cheat).startAttempt(1);
    runUntil(clock, finished([honest]));
    const r = honest.session.snapshot().result as RaceResult;
    expect(attemptOf(honest)).toBe(0);
    expect(r.cancelled).toBeUndefined();
    expect(r.players.p2?.status).toBe("done");
    expect(r.players.p1).toMatchObject({
      status: "forfeit",
      reason: LEFT_RACE,
    });
  });

  it("① 섞기를 정한 뒤 스스로 기권하는 약속(컴퓨터 기권시키기)으로 다시 섞기를 얻지 못한다", () => {
    const { clock, devices } = setupRace(3);
    const [cheat, ...honest] = devices as [Device, Device, Device];
    autoSolve(clock, honest[0] as Device, 300, 100);
    autoSolve(clock, honest[1] as Device, 400, 100);
    runUntil(clock, () => honest[0]?.session.snapshot().phase === "inspect");
    cheat.transport.send({
      type: "race-commit",
      race: "r1",
      attempt: 1,
      commit: "-",
      out: [{ id: "p1", reason: "섞기를 만들지 못함" }],
    });
    runUntil(clock, finished(honest));
    const r = sameEverywhere(honest);
    for (const d of honest) expect(attemptOf(d)).toBe(0);
    expect(r.players.p1).toMatchObject({
      status: "forfeit",
      reason: "섞기를 만들지 못함",
    });
  });

  it("② 남이 맞춘 뒤 그 사람을 기권 목록에 넣어 보내도 따르지 않는다(정직한 세 기기 같은 결과)", () => {
    const { clock, devices } = setupRace(4);
    const [cheat, ...honest] = devices as [Device, Device, Device, Device];
    const victim = honest[0] as Device;
    autoSolve(clock, victim, 200, 50);
    autoSolve(clock, honest[1] as Device, 400, 100);
    autoSolve(clock, honest[2] as Device, 500, 100);
    runUntil(clock, () =>
      honest.every(
        (d) =>
          d.session.snapshot().peers.find((p) => p.id === "p2")?.status ===
          "done",
      ),
    );
    cheat.transport.send({
      type: "race-commit",
      race: "r1",
      attempt: 1,
      commit: "x",
      out: [{ id: "p2", reason: "공개 안 함" }],
    });
    runUntil(clock, finished(honest));
    const r = sameEverywhere(honest);
    expect(r.players.p2?.status).toBe("done");
    expect(r.ranking[0]).toBe("p2");
    expect(r.players.p1).toMatchObject({
      status: "forfeit",
      reason: LEFT_RACE,
    });
  });

  it("② 2명: 상대가 맞춘 뒤 거짓 기권 목록을 보내도 상대 화면의 승리는 그대로다", () => {
    const { clock, devices } = setupRace(2);
    const [cheat, victim] = devices as [Device, Device];
    autoSolve(clock, victim, 200, 50);
    runUntil(clock, () => victim.session.snapshot().phase === "waiting");
    cheat.transport.send({
      type: "race-commit",
      race: "r1",
      attempt: 1,
      commit: "x",
      out: [{ id: "p2", reason: "공개 안 함" }],
    });
    runUntil(clock, finished([victim]));
    const r = victim.session.snapshot().result as RaceResult;
    expect(r.cancelled).toBeUndefined();
    expect(r.ranking).toEqual(["p2", "p1"]);
    expect(r.players.p2?.status).toBe("done");
  });

  it("② 거짓 race-seed(남의 약속을 바꿔 적음)로 남을 섞기 어긋남으로 빼지 못한다. 다수와 다른 보낸 사람이 빠진다", () => {
    const { clock, devices } = setupRace(4, {}, (net) => {
      net.filter = (m, from) => {
        const msg = m as { type?: string; commits?: Record<string, string> };
        if (from === "p1" && msg.type === "race-seed" && msg.commits)
          msg.commits.p2 = "가짜 약속";
        return m;
      };
    });
    const [, ...honest] = devices as [Device, Device, Device, Device];
    autoSolve(clock, honest[0] as Device, 300, 100);
    autoSolve(clock, honest[1] as Device, 400, 100);
    autoSolve(clock, honest[2] as Device, 500, 100);
    runUntil(clock, finished(honest));
    const r = sameEverywhere(honest);
    for (const d of honest) expect(attemptOf(d)).toBe(0);
    expect(r.players.p2?.status).toBe("done");
    expect(r.players.p1).toMatchObject({
      status: "forfeit",
      reason: "섞기 어긋남",
    });
  });

  it("③ 1:1에서 상대 하한을 크게 지어내면 그 판은 판정 없음(두 값을 남기고 순위·승패 없음). 폭 안쪽은 하한을 쓴다", () => {
    const run = (extra: number) => {
      const { clock, devices } = setupRace(2, {}, (net) => {
        net.filter = (m, from) => {
          const msg = m as { type?: string; of?: string; bound?: number };
          if (from === "p1" && msg.type === "race-bound" && msg.of === "p2")
            return { ...msg, bound: (msg.bound ?? 0) + extra };
          return m;
        };
      });
      const [slow, fast] = devices as [Device, Device];
      autoSolve(clock, slow, 3000, 100);
      autoSolve(clock, fast, 300, 100);
      runUntil(clock, finished(devices));
      return fast.session.snapshot().result as RaceResult;
    };
    const lied = run(9_999_000);
    const p2 = lied.players.p2;
    expect(p2?.disputed).toBe(true);
    expect(p2?.unranked).toBe(true);
    expect(p2?.accepted).toBeUndefined();
    expect(p2?.reported).toBeLessThan(3000);
    expect(p2?.usedBound).toBeGreaterThan(9_000_000);
    // 느린 공격자가 이기지 못한다: 그 판은 판정하지 않는다
    expect(lied.noDecision).toBe(true);
    // 폭(1초) 안쪽: 지금처럼 하한을 쓴다(조용히 깎지 않는다)
    const small = run(800).players.p2;
    expect(small?.disputed).toBeUndefined();
    expect(small?.accepted).toBe(small?.usedBound);
    expect(small?.accepted).toBeGreaterThan(small?.reported as number);
  });

  it("③ 1:1에서 공격자가 자기 시간을 짧게 거짓 보고해도(시계를 15초 돌림) 1위가 되지 않고 판정 없음이다(두 기기 같은 결과)", () => {
    const { clock, devices } = setupRace(2);
    const [cheat, honest] = devices as [Device, Device];
    // 실제로는 정직한 사람보다 훨씬 늦게 맞추지만 첫 수 전에 시계를 15초 뒤로 돌린다
    const s = autoSolve(clock, cheat, 15_000, 100, () => {
      cheat.clock.offset -= 15_000;
    });
    autoSolve(clock, honest, 2_000, 100);
    runUntil(clock, finished(devices));
    const r = sameEverywhere(devices);
    const p1 = r.players.p1;
    expect(p1?.reported).toBe(100 * (s.moves() - 1));
    expect(p1?.disputed).toBe(true);
    expect(p1?.accepted).toBeUndefined();
    expect(r.noDecision).toBe(true);
    expect(r.ranking[0]).toBe("p2");
  });

  it("기권·DNF 까닭 글은 정한 목록 안에서만 받고, 밖이면 「기타」", () => {
    const { clock, devices } = setupRace(3);
    const [cheat, ...honest] = devices as [Device, Device, Device];
    autoSolve(clock, honest[0] as Device, 300, 100);
    autoSolve(clock, honest[1] as Device, 400, 100);
    runUntil(clock, () => honest[0]?.session.snapshot().phase === "race");
    cheat.transport.send({
      type: "race-retire",
      race: "r1",
      attempt: 0,
      reason: "<b>방장이 졌다고 함</b> 이 판은 무효",
    });
    runUntil(clock, finished(honest));
    const r = sameEverywhere(honest);
    expect(r.players.p1).toMatchObject({ status: "dnf", reason: OTHER_REASON });
  });

  it("race-moves의 순서 번호는 받은 수 + 몇백까지만 받아 둔다(메모리)", () => {
    const { clock, devices } = setupRace(2);
    const [cheat, honest] = devices as [Device, Device];
    runUntil(clock, () => honest.session.snapshot().phase === "race");
    cheat.transport.send({
      type: "race-moves",
      race: "r1",
      attempt: 0,
      moves: Array.from({ length: 2000 }, (_, k) => ({
        i: 1_000_000 + k,
        m: "0",
        t: 10,
      })),
    });
    clock.advance(100);
    const rec = inside(honest).a.records.get("p1");
    expect(rec.raw.size).toBe(0);
  });
});
