import {
  anchorPath,
  displayRound,
  ledgerId,
  ledgerMirrorPath,
  parseAnchorFile,
  roundTimes,
  type Schedule,
  verifyLedger,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { GitHubAnchor } from "./outside";
import {
  parseScheduleLiveArgs,
  scheduleChange,
  scheduleLive,
} from "./schedule-live";
import {
  FakeGitHub,
  makeRig,
  type Rig,
  readLedger,
  SCHEDULE,
  TEST_POW,
} from "./testing";

let rig: Rig | undefined;
afterEach(() => {
  rig?.close();
  rig = undefined;
});

/** 서버 장부처럼 시험 단계로 시작(시험에서는 1시간 회차로 회차 수를 줄인다) */
const TRIAL: Schedule = {
  ...SCHEDULE,
  entries: SCHEDULE.entries.map((e) => ({ ...e, phase: "trial" as const })),
};
const opensAt = (round: number) => roundTimes(TRIAL, round).opensAt;

describe("시험 → 정식: 이어지는 장부", () => {
  it("정식 예약은 다음 기록에 실리고, 그 회차부터 단계·앵커 브랜치·보이는 번호가 바뀌며 사슬은 검사를 통과한다", async () => {
    const gh = new FakeGitHub();
    rig = await makeRig({
      schedule: TRIAL,
      anchor: new GitHubAnchor(
        "ybbarng/stardraw-ledger",
        "test-token",
        gh.fetch,
      ),
    });
    await rig.finish(1);
    // 2회차 기록에 실린다: 3·4·5회차 동안 예고, 6회차부터
    expect(() => scheduleLive(rig?.store as never, opensAt(5))).toThrow(
      /3회차 예고 뒤\(6회차\)부터\(2회차 기록에 실린다\)/,
    );
    expect(scheduleLive(rig.store, opensAt(6))).toMatchObject({
      change: { fromRound: 6, length: 3600, phase: "live" },
      decidedIn: 2,
    });
    expect(() => scheduleLive(rig?.store as never, opensAt(7))).toThrow(
      /이미 예약한/,
    );
    expect(rig.engine.state().mode).toBe("trial");

    for (let round = 2; round <= 6; round++) await rig.finish(round);
    expect(rig.store.pendingChange()).toBeNull();
    expect(rig.store.record(2)?.scheduleChanges[0]?.phase).toBe("live");
    expect(rig.engine.state().liveFrom).toBe(6);
    await rig.at(opensAt(7) + 10);
    expect(rig.engine.state().mode).toBe("live");
    expect(() => scheduleLive(rig?.store as never, opensAt(60))).toThrow(
      /이미 6회차부터 정식 단계다/,
    );

    const ledger = readLedger(rig.dir);
    const report = await verifyLedger(
      ledger.genesis,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      { beaconVerifier: () => true, powParams: TEST_POW },
    );
    expect(report.problems).toEqual([]);
    expect(displayRound(report.schedule, 5).label).toBe("시험 5회");
    expect(displayRound(report.schedule, 6).label).toBe("정식 1회");

    // 앵커: 처음 일정표는 main, 시험 회차는 trial, 정식 회차는 main
    await rig.engine.anchorIdle();
    const id = ledgerId(rig.engine.genesis);
    expect(gh.text("main", "genesis.txt")).toContain(`ledger ${id}`);
    expect(gh.text("trial", anchorPath(id, 5))).toBeDefined();
    expect(gh.text("main", anchorPath(id, 5))).toBeUndefined();
    expect(
      parseAnchorFile(gh.text("main", anchorPath(id, 6)) ?? "")?.round,
    ).toBe(6);

    // 장부 사본: 시험 회차는 trial에, 정식 첫 회차 앞에서 지난 시험 회차까지 main에 채워 main 하나로 전체를 받는다
    const head = (branch: string) =>
      JSON.parse(gh.text(branch, ledgerMirrorPath(id, "head.json")) ?? "{}")
        .rounds;
    expect(head("trial")).toBe(5);
    expect(head("main")).toBe(6);
    expect(gh.text("main", ledgerMirrorPath(id, "rounds/000001.json"))).toBe(
      gh.text("trial", ledgerMirrorPath(id, "rounds/000001.json")),
    );
    expect(
      gh.text("trial", ledgerMirrorPath(id, "rounds/000006.json")),
    ).toBeUndefined();
  });

  it("정각 추첨에 맞지 않는 시각, 회차 경계가 아닌 시각은 거절한다", async () => {
    rig = await makeRig({ schedule: TRIAL });
    expect(() => scheduleLive(rig?.store as never, opensAt(30) + 600)).toThrow(
      /x:55/,
    );
    expect(() =>
      scheduleLive(rig?.store as never, opensAt(30) + 3600 * 0.5 + 300),
    ).toThrow();
    expect(rig.store.pendingChange()).toBeNull();
  });

  it("예약한 뒤 기록이 늦게 닫혀 예고 규칙에 늦으면 싣지 않고 지운다", async () => {
    rig = await makeRig({ schedule: TRIAL });
    await rig.finish(1);
    rig.store.setPendingChange({
      ...(TRIAL.entries[0] as Schedule["entries"][0]),
      fromRound: 5,
      phase: "live",
    });
    await rig.finish(2);
    expect(rig.store.record(2)?.scheduleChanges).toEqual([]);
    expect(rig.store.pendingChange()).toBeNull();
    expect(rig.logs.join("\n")).toMatch(/싣지 못해 지웠다/);
  });

  it("회차 길이 바꾸기(docs/36 11-32): 시험 1시간 → 시험 30분 → 정식 1시간이 한 사슬로 검사를 통과하고, 예고 중에는 다음 바꾸기를 받지 않는다", async () => {
    rig = await makeRig({ schedule: TRIAL });
    await rig.finish(1);
    expect(() => scheduleChange(rig?.store as never, opensAt(6), 3600)).toThrow(
      /지금 일정과 같다/,
    );
    expect(() =>
      scheduleChange(rig?.store as never, opensAt(6) + 600, 1800),
    ).toThrow(/x:25·x:55/);
    expect(scheduleChange(rig.store, opensAt(6), 1800)).toMatchObject({
      change: { fromRound: 6, length: 1800, phase: "trial" },
      decidedIn: 2,
    });
    await rig.finish(2);
    // 2회차 기록에 실려 6회차부터 효력: 그 전에는 다음 바꾸기를 받지 않는다
    const at = (round: number) =>
      roundTimes(rig?.engine.schedule() as Schedule, round).opensAt;
    expect(() => scheduleLive(rig?.store as never, at(12))).toThrow(
      /예고 중인 일정 바꾸기가 있다/,
    );
    for (let round = 3; round <= 6; round++) await rig.finish(round);
    expect(at(7) - at(6)).toBe(1800);
    expect(rig.engine.state().mode).toBe("trial");
    // 30분 회차 사이에서 정각 추첨이 되는 x:55만 정식 1회가 될 수 있다
    expect(() => scheduleLive(rig?.store as never, at(11))).toThrow(/x:55/);
    expect(scheduleLive(rig.store, at(12))).toMatchObject({
      change: { fromRound: 12, length: 3600, phase: "live" },
      decidedIn: 7,
    });
    for (let round = 7; round <= 12; round++) await rig.finish(round);
    expect(rig.engine.state().liveFrom).toBe(12);

    const ledger = readLedger(rig.dir);
    const report = await verifyLedger(
      ledger.genesis,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      { beaconVerifier: () => true, powParams: TEST_POW },
    );
    expect(report.problems).toEqual([]);
    expect(
      report.schedule.entries.map((e) => [e.fromRound, e.length, e.phase]),
    ).toEqual([
      [1, 3600, "trial"],
      [6, 1800, "trial"],
      [12, 3600, "live"],
    ]);
    expect(displayRound(report.schedule, 11).label).toBe("시험 11회");
    expect(displayRound(report.schedule, 12).label).toBe("정식 1회");
  });

  it("명령 인자: --from은 ISO 시각(초 단위)", () => {
    expect(
      parseScheduleLiveArgs(["--from", "2026-11-02T08:55:00+09:00"]),
    ).toEqual({ from: Date.parse("2026-11-02T08:55:00+09:00") / 1000 });
    expect(() => parseScheduleLiveArgs([])).toThrow(/--from/);
  });
});
