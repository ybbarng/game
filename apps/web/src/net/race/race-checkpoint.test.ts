import { describe, expect, it } from "vitest";
import { checkTime } from "./judge";
import {
  autoSolve,
  type Device,
  runUntil,
  setupRace,
  sortPuzzle,
} from "./race-fixture";
import type { CheckpointLog, RaceGame } from "./types";

/**
 * 대결 틀의 중간 지점 시각 확인(`RaceOptions.checkpoints`, 체력바 대결 docs/47 9-6). 처음 지난 지점마다 증인이 도착 하한을
 * `race-bound`(`at`)로 알려, 모든 기기가 같은 하한 묶음으로 같은 인정 시각을 낸다. ManualClock·DelayNet 위라 결정적이다.
 */

/** 앞에서부터 k칸이 제자리면 지점 `k` */
const marked: RaceGame<number, number[]> = {
  ...sortPuzzle,
  checkpointsOf(state) {
    const ids: string[] = [];
    for (let k = 1; k < state.length && state[k - 1] === k - 1; k++)
      ids.push(`k${k}`);
    return ids;
  },
};

const finished = (devices: Device[]) => () =>
  devices.every((d) => d.session.snapshot().result !== undefined);

/** 결과 뒤 한 사람의 지점 인정 시각(같은 규칙 `checkTime`) */
function accepted(log: CheckpointLog | undefined): (number | undefined)[] {
  return (log?.marks ?? []).map(
    (m) => checkTime(m.t, m.bounds, 1_000).accepted,
  );
}

// biome-ignore lint/suspicious/noExplicitAny: 판정 설정 지문을 견준다
const inside = (d: Device): any => d.session;

describe("중간 지점 시각 확인", () => {
  it("지연이 있어도 모든 기기가 같은 지점·같은 하한 묶음을 갖고, 판 끝은 그 하한을 기다린다", () => {
    const { clock, devices } = setupRace(
      3,
      { checkpoints: true },
      (net) => {
        net.setDelay("p1", "p2", 300);
        net.setDelay("p2", "p1", 260);
        net.setDelay("p1", "p3", 40);
        net.setDelay("p3", "p2", 180);
      },
      () => marked,
    );
    autoSolve(clock, devices[0] as Device, 200, 120);
    autoSolve(clock, devices[1] as Device, 300, 90);
    autoSolve(clock, devices[2] as Device, 100, 150);
    runUntil(clock, finished(devices));
    for (const id of ["p1", "p2", "p3"]) {
      const logs = devices.map((d) => d.session.checkpointLog(id));
      const first = logs[0] as CheckpointLog;
      expect(first.marks.length).toBeGreaterThan(0);
      for (const log of logs.slice(1)) expect(log).toEqual(first);
      // 다른 두 기기가 모두 하한을 냈다
      for (const m of first.marks) {
        expect(Object.keys(m.bounds).sort()).toEqual(
          ["p1", "p2", "p3"].filter((x) => x !== id),
        );
        expect(m.settled).toBe(true);
      }
      // 정직한 수는 인정 시각이 단 시각 그대로이거나 연결 지연만큼만 늦다
      for (const [i, t] of accepted(first).entries()) {
        const m = first.marks[i];
        expect(t).toBeGreaterThanOrEqual(m?.t as number);
        expect((t as number) - (m?.t as number)).toBeLessThan(400);
      }
    }
  });

  it("시각을 일찍 적어 보낸 고친 클라이언트는 증인 하한으로 늦춰지고(셋 이상), 1:1이면 다툼으로 남는다", () => {
    const { clock, devices } = setupRace(
      3,
      { checkpoints: true },
      undefined,
      () => marked,
    );
    const [cheat, ...honest] = devices as [Device, Device, Device];
    for (const d of honest) autoSolve(clock, d, 2_000, 400);
    // 콘솔에서 시계를 3초 뒤로 돌려 수마다 「3초 이른」 시각을 단다
    autoSolve(clock, cheat, 3_000, 100, () => {
      cheat.clock.offset -= 3_000;
    });
    runUntil(clock, finished(honest));
    const log = honest[0]?.session.checkpointLog("p1") as CheckpointLog;
    expect(honest[1]?.session.checkpointLog("p1")).toEqual(log);
    const first = log.marks[0];
    expect(first?.t).toBeLessThan(500);
    const checked = checkTime(first?.t as number, first?.bounds ?? {}, 1_000);
    // 실제로 둔 때(풀림 뒤 3초 + 첫 지점까지)보다 이르게는 인정하지 않는다(cap 200ms만큼만 당겨진다)
    expect(checked.accepted).toBeGreaterThan(2_700);

    const one = setupRace(2, { checkpoints: true }, undefined, () => marked);
    const [c2, h2] = one.devices as [Device, Device];
    autoSolve(one.clock, h2, 2_000, 400);
    autoSolve(one.clock, c2, 3_000, 100, () => {
      c2.clock.offset -= 3_000;
    });
    runUntil(one.clock, finished([h2]));
    const m = h2.session.checkpointLog("p1")?.marks[0];
    expect(checkTime(m?.t as number, m?.bounds ?? {}, 1_000).disputed).toBe(
      true,
    );
  });

  it("끄면 판정 설정 지문이 예전과 같고 하한을 보내지 않는다. 기기마다 다르게 켜면 판이 열리지 않는다", () => {
    const plain = setupRace(2, {}, undefined, () => marked);
    const off = setupRace(2, { checkpoints: false }, undefined, () => marked);
    expect(inside(off.devices[0] as Device).rules).toBe(
      inside(plain.devices[0] as Device).rules,
    );
    const on = setupRace(2, { checkpoints: true }, undefined, () => marked);
    expect(inside(on.devices[0] as Device).rules).not.toBe(
      inside(plain.devices[0] as Device).rules,
    );
    // 꺼진 판: 지점을 적지 않는다
    for (const d of off.devices) autoSolve(off.clock, d, 100, 100);
    runUntil(off.clock, finished(off.devices));
    expect(off.devices[0]?.session.checkpointLog("p2")?.marks).toEqual([]);

    const mixed = setupRace(
      2,
      {},
      undefined,
      () => marked,
      (id) => (id === "p1" ? { checkpoints: true } : {}),
    );
    runUntil(mixed.clock, finished(mixed.devices));
    for (const d of mixed.devices)
      expect(d.session.snapshot().result?.cancelled).toBeDefined();
  });

  it("엉뚱한 수 번호의 지점 하한은 받아 두지 않는다", () => {
    const { clock, net, devices } = setupRace(
      2,
      { checkpoints: true },
      undefined,
      () => marked,
    );
    const [p1, p2] = devices as [Device, Device];
    autoSolve(clock, p1, 100, 100);
    autoSolve(clock, p2, 100, 100);
    runUntil(clock, () => p2.session.snapshot().phase === "race");
    for (let k = 0; k < 200; k++)
      p1.transport.send({
        type: "race-bound",
        race: "r1",
        attempt: 0,
        of: "p2",
        bound: 0,
        at: 100 + k,
      });
    void net;
    runUntil(clock, finished(devices));
    // biome-ignore lint/suspicious/noExplicitAny: 받아 둔 칸 수를 본다
    const rec = (inside(p2).a as any).records.get("p2");
    expect(rec.markBounds.size).toBeLessThan(80);
  });
});
