import { describe, expect, it } from "vitest";
import {
  autoSolve,
  bubbleSolution,
  type DelayNet,
  type Device,
  OffsetClock,
  runUntil,
  setupRace,
  sortPuzzle,
  TEST_OPTIONS,
} from "./race-fixture";
import { RaceSession, shiftResume } from "./race-session";
import type { RaceOptions, RaceResult } from "./types";

/**
 * 새로고침 뒤 같은 판 이어 가기(docs/47 9-11). 새로고침은 「세션을 버리고 연결이 끊긴 뒤, 남겨 둔 내 몫으로 새 세션을 만들어
 * 다시 잇는다」로 흉내 낸다. 새 세션의 시계는 처음부터 다시 잰다(제품의 `performance.now`처럼 시작점이 다르다).
 */

const finished = (devices: Device[]) => () =>
  devices.every((d) => d.session.snapshot().result !== undefined);

function expectSameEverywhere(devices: Device[]): RaceResult {
  const [first, ...rest] = devices.map(
    (d) => d.session.snapshot().result as RaceResult,
  );
  for (const r of rest) expect(r).toEqual(first);
  return first as RaceResult;
}

/** 새로고침: 남길 것을 받아 두고 세션을 버리고 끊는다. `back`으로 같은 아이디의 새 기기를 만들어 다시 잇는다 */
function refresh(
  net: DelayNet,
  device: Device,
  ids: string[],
  options: Partial<RaceOptions> = {},
) {
  const saved = device.session.resumeData();
  device.session.dispose();
  net.disconnect(device.id);
  return {
    saved,
    back(): Device {
      // 새 페이지의 시계는 0 근처에서 다시 잰다
      const clock = new OffsetClock(net.clock, -net.clock.now() + 5);
      const by = clock.now() - device.clock.now();
      const transport = net.join(device.id);
      let counter = 100;
      const session = new RaceSession({
        game: sortPuzzle,
        transport,
        clock,
        race: "r1",
        players: ids,
        options: { ...TEST_OPTIONS, ...options },
        random: () => `${device.id}-new-${counter++}`,
        ...(saved ? { resume: shiftResume(saved, by) } : {}),
      });
      session.start();
      net.reconnect(device.id);
      return { id: device.id, session, transport, clock };
    },
  };
}

/** 지금 상태에서 거품 정렬로 끝까지 `everyMs`마다 한 수씩 둔다 */
function solveFromHere(net: DelayNet, device: Device, everyMs: number) {
  const moves = bubbleSolution(
    device.session.stateOf(device.id) as number[],
  ).reverse();
  const step = () => {
    const m = moves.pop();
    if (m === undefined) return;
    const r = device.session.play(m);
    if (!r.ok) throw new Error(`수가 거절됨: ${r.reason}`);
    net.clock.after(everyMs, step);
  };
  step();
}

describe("대결 틀: 새로고침 뒤 이어 가기", () => {
  it("대결 중 새로고침해도 같은 섞기·같은 내 수로 이어 두고, 비운 동안도 시간이 흘러 모든 기기가 같은 결과를 낸다", () => {
    const ids = ["p1", "p2"];
    const { clock, net, devices } = setupRace(2);
    const [p1, p2] = devices as [Device, Device];
    autoSolve(clock, p2, 15_000, 100);
    runUntil(clock, () => p1.session.snapshot().phase === "race");
    const start = p1.session.startState() as number[];
    const plan = bubbleSolution(start);
    expect(plan.length).toBeGreaterThan(3);
    for (const m of plan.slice(0, 3)) expect(p1.session.play(m).ok).toBe(true);
    const before = p1.session.snapshot().elapsed as number;
    const stateBefore = p1.session.stateOf("p1");
    const r = refresh(net, p1, ids);
    clock.advance(3_000);
    const again = r.back();
    runUntil(clock, () => again.session.snapshot().phase === "race");
    expect(again.session.snapshot().seed).toBe(p2.session.snapshot().seed);
    expect(again.session.stateOf("p1")).toEqual(stateBefore);
    expect(again.session.moveLog("p1")).toHaveLength(3);
    // 비운 3초도 시간에 든다(풀림 시각을 그대로 되살렸다)
    expect(again.session.snapshot().elapsed).toBeGreaterThanOrEqual(
      before + 3_000,
    );
    solveFromHere(net, again, 100);
    runUntil(clock, finished([again, p2]));
    const result = expectSameEverywhere([again, p2]);
    expect(result.players.p1).toMatchObject({
      status: "done",
      moves: plan.length,
      // 끊겼으니 상대 하한은 「확인 약함」, 보고 시간을 쓴다(끊겼다 돌아온 사람과 같다)
      weak: true,
    });
    expect(result.players.p1?.reported).toBeGreaterThan(before + 3_000);
    expect(result.ranking[0]).toBe("p1");
  });

  it("살펴보기 중 새로고침해도 풀림 시각이 그대로라 살펴보기를 늘리지 못한다", () => {
    const ids = ["p1", "p2"];
    const { clock, net, devices } = setupRace(2, { inspectionMs: 1_000 });
    const [p1] = devices as [Device, Device];
    runUntil(clock, () => p1.session.snapshot().phase === "inspect");
    const left = p1.session.snapshot().inspectionLeft as number;
    const at = clock.now();
    const r = refresh(net, p1, ids, { inspectionMs: 1_000 });
    expect(r.saved?.releaseAt).toBeDefined();
    clock.advance(400);
    const again = r.back();
    runUntil(clock, () => again.session.snapshot().seed !== undefined);
    const snap = again.session.snapshot();
    expect(snap.phase).toBe("inspect");
    // 남은 살펴보기 = 새로고침할 때 남았던 것 − 그 뒤 흐른 시간(비운 400ms 포함)
    expect(snap.inspectionLeft).toBe(left - (clock.now() - at));
  });

  it("약속만 보내고 새로고침해도 같은 약속·같은 공개값을 다시 보내 섞기를 다시 정하지 않는다", () => {
    const ids = ["p1", "p2"];
    const { clock, net, devices } = setupRace(2, {}, (n) => {
      // p2의 약속이 늦게 닿아 p1은 아직 공개하지 않았다
      n.setDelay("p2", "p1", 2_000);
    });
    const [p1, p2] = devices as [Device, Device];
    clock.advance(100);
    expect(p1.session.snapshot().phase).toBe("commit");
    const r = refresh(net, p1, ids);
    expect(r.saved?.revealedAt).toBeUndefined();
    net.setDelay("p2", "p1", 20);
    clock.advance(200);
    const again = r.back();
    runUntil(clock, () => again.session.snapshot().seed !== undefined);
    runUntil(clock, () => p2.session.snapshot().seed !== undefined);
    expect(again.session.snapshot().attempt).toBe(0);
    expect(p2.session.snapshot().attempt).toBe(0);
    expect(again.session.snapshot().seed).toBe(p2.session.snapshot().seed);
  });

  it("돌아온 기기는 비운 동안의 일을 잴 수 없어 남의 하한을 확인 약함으로 보낸다(1:1 상대 판을 판정 없음으로 만들지 못한다)", () => {
    const ids = ["p1", "p2"];
    const { clock, net, devices } = setupRace(2);
    const [p1, p2] = devices as [Device, Device];
    autoSolve(clock, p2, 100, 100);
    runUntil(clock, () => p1.session.snapshot().phase === "race");
    const r = refresh(net, p1, ids);
    // 비운 동안 p2가 맞춘다
    runUntil(clock, () => p2.session.snapshot().peers[1]?.status === "done");
    clock.advance(5_000);
    const again = r.back();
    runUntil(clock, () => again.session.snapshot().peers[1]?.status === "done");
    solveFromHere(net, again, 100);
    runUntil(clock, finished([again, p2]));
    const result = expectSameEverywhere([again, p2]);
    expect(result.noDecision).toBeUndefined();
    expect(result.players.p2).toMatchObject({
      status: "done",
      bounds: { p1: null },
    });
    expect(result.players.p2?.accepted).toBe(result.players.p2?.reported);
    expect(result.ranking).toEqual(["p2", "p1"]);
  });
});
