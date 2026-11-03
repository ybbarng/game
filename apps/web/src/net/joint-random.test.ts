import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import {
  isJointWire,
  JointRandomHub,
  jointCommit,
  jointDraw,
  jointOutcome,
  jointPick,
  jointTiebreak,
} from "./joint-random";
import { MemoryNetwork } from "./transport";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const S = ["secretAAAA0", "secretBBBB1", "secretCCCC2"];

async function commitsFor(scope: string) {
  return Promise.all(
    S.map(async (secret, seat) => ({
      seat,
      hash: await jointCommit(scope, secret),
    })),
  );
}

describe("함께 정한 난수: 순수 부분", () => {
  it("모두 약속대로 내면 모두 정직하고, 이름표마다 값이 다르며 같은 재료면 같은 값이다", async () => {
    const commits = await commitsFor("r1");
    const reveals = S.map((secret, seat) => ({ seat, secret }));
    const one = await jointOutcome("r1", [0, 1, 2], commits, reveals);
    const two = await jointOutcome(
      "r1",
      [2, 1, 0],
      commits,
      [...reveals].reverse(),
    );
    expect(one.honest).toEqual([0, 1, 2]);
    expect(one.faulted).toEqual([]);
    expect(await jointDraw(one, "tie-1")).toBe(await jointDraw(two, "tie-1"));
    expect(await jointDraw(one, "tie-1")).not.toBe(
      await jointDraw(one, "tie-2"),
    );
    const pick = await jointPick(one, "x", 3);
    expect(pick).toBeGreaterThanOrEqual(0);
    expect(pick).toBeLessThan(3);
  });

  it.each([
    [
      "공개하지 않음",
      (r: { seat: number; secret: string }[]) => r.filter((x) => x.seat !== 1),
      "공개하지 않았다",
    ],
    [
      "약속과 다른 값",
      (r: { seat: number; secret: string }[]) =>
        r.map((x) => (x.seat === 1 ? { ...x, secret: "secretZZZZ9" } : x)),
      "약속과 다른 값을 냈다",
    ],
  ])(
    "%s: 그 자리가 잘못한 사람이 되고 값은 정직한 사람만으로 정한다",
    async (_n, edit, reason) => {
      const commits = await commitsFor("r2");
      const reveals = edit(S.map((secret, seat) => ({ seat, secret })));
      const outcome = await jointOutcome("r2", [0, 1, 2], commits, reveals);
      expect(outcome.honest).toEqual([0, 2]);
      expect(outcome.faulted).toEqual([{ seat: 1, reason }]);
      expect(outcome.secrets).toEqual([S[0], S[2]]);
      // 동점에서 잘못한 사람이 진다
      expect((await jointTiebreak(outcome, [1, 2], "tie")).at(-1)).toBe(1);
      expect((await jointTiebreak(outcome, [0, 1, 2], "tie")).at(-1)).toBe(1);
    },
  );

  it("약속하지 않은 자리, 다른 범위의 약속은 쓰지 못한다", async () => {
    const commits = await commitsFor("r3");
    const reveals = S.map((secret, seat) => ({ seat, secret }));
    const missing = await jointOutcome("r3", [0, 1, 2, 3], commits, reveals);
    expect(missing.faulted).toEqual([{ seat: 3, reason: "약속하지 않았다" }]);
    const otherScope = await jointOutcome("r4", [0, 1, 2], commits, reveals);
    expect(otherScope.honest).toEqual([]);
  });

  it("동점 가르기는 정직한 자리를 모두 한 번씩 담고 같은 재료면 같은 순서다", async () => {
    const commits = await commitsFor("r5");
    const outcome = await jointOutcome(
      "r5",
      [0, 1, 2],
      commits,
      S.map((secret, seat) => ({ seat, secret })),
    );
    const order = await jointTiebreak(outcome, [2, 0, 1, 1], "t");
    expect([...order].sort()).toEqual([0, 1, 2]);
    expect(await jointTiebreak(outcome, [0, 1, 2], "t")).toEqual(order);
  });

  it("메시지 꼬리표는 방 코드(`t`)와 섞이지 않는다", () => {
    const hash = "a".repeat(64);
    expect(
      isJointWire({ jr: 1, k: "commit", scope: "r1", seat: 0, hash }),
    ).toBe(true);
    expect(
      isJointWire({
        jr: 1,
        k: "commit",
        scope: "r1",
        seat: 0,
        hash,
        t: "reveal",
      }),
    ).toBe(false);
    expect(isJointWire({ t: "reveal", secret: "x" })).toBe(false);
  });
});

describe("함께 정한 난수: 방 흐름", () => {
  it("한 사람이 공개를 거부하면 시간이 지난 뒤 모두가 같은 결과(그 사람이 잘못함)를 낸다", async () => {
    const clock = new ManualClock();
    const net = new MemoryNetwork();
    const ids = ["p0", "p1", "p2"];
    const hubs = ids.map(
      (id, seat) =>
        new JointRandomHub({
          transport: net.join(id),
          clock,
          mySeat: () => seat,
          seatOfPeer: (peer) => {
            const i = ids.indexOf(peer);
            return i < 0 ? null : i;
          },
          timeoutMs: 3_000,
          newSecret: () => S[seat] as string,
        }),
    );
    await flush();
    await Promise.all(hubs.map((h) => h.begin("round-1", [0, 1, 2])));
    await flush();
    // 2번 자리는 약속만 하고 공개하지 않는다
    const outcomes = [hubs[0]?.reveal("round-1"), hubs[1]?.reveal("round-1")];
    for (let i = 0; i < 5; i++) await flush();
    clock.advance(3_000);
    const [a, b] = await Promise.all(outcomes);
    expect(a).toEqual(b);
    expect(a?.honest).toEqual([0, 1]);
    expect(a?.faulted).toEqual([{ seat: 2, reason: "공개하지 않았다" }]);
    if (!a) throw new Error("결과 없음");
    expect(await jointTiebreak(a, [1, 2], "tie")).toEqual([1, 2]);
  });
});
