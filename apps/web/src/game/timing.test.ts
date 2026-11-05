// @vitest-environment node
import { describe, expect, it } from "vitest";

import { dealPackets, dealPlan, dealPlanFor, FLIGHT_MS } from "./timing";

describe("나눠 주기 순서", () => {
  it("원작처럼 5마는 2·3·3·2, 6마는 2·3·3, 7마는 2·3·2장씩 묶어 준다", () => {
    expect(dealPackets(10)).toEqual([2, 3, 3, 2]);
    expect(dealPackets(8)).toEqual([2, 3, 3]);
    expect(dealPackets(7)).toEqual([2, 3, 2]);
  });

  it("선부터 한 사람씩 묶음을 주고 한 바퀴 돌면 다음 묶음", () => {
    const { flights } = dealPlan(10, 5);
    expect(flights).toHaveLength(50);
    // 첫 바퀴: 0번 2장, 1번 2장, …
    expect(flights.slice(0, 4).map((f) => f.player)).toEqual([0, 0, 1, 1]);
    // 둘째 바퀴의 첫 묶음은 다시 0번이 3장
    expect(flights.slice(10, 13).map((f) => f.player)).toEqual([0, 0, 0]);
    // 모든 사람이 10장씩
    for (let p = 0; p < 5; p++)
      expect(flights.filter((f) => f.player === p)).toHaveLength(10);
    // 나가는 시각은 순서대로다
    for (let k = 1; k < flights.length; k++)
      expect(flights[k]?.delay).toBeGreaterThanOrEqual(
        flights[k - 1]?.delay ?? 0,
      );
  });

  it("원작처럼 앞 묶음이 도착한 뒤에 다음 묶음이 출발한다", () => {
    const { flights } = dealPlan(10, 5);
    // 0번의 2장 묶음 다음 1번 묶음의 첫 장
    const firstPacketLast = flights[1]?.delay ?? 0;
    const nextPacket = flights[2]?.delay ?? 0;
    expect(nextPacket).toBeGreaterThanOrEqual(firstPacketLast + FLIGHT_MS);
  });
});

describe("받는 곳마다 장수가 다른 나눠 주기(화투 손패·바닥)", () => {
  it("같은 장수면 dealPlan과 같다", () => {
    expect(dealPlanFor([10, 10, 10, 10, 10])).toEqual(dealPlan(10, 5));
  });

  it("맞고: 손패 10장씩과 바닥 8장을 다섯 장 묶음으로 한 바퀴에 하나씩 준다", () => {
    const { flights } = dealPlanFor([10, 10, 8], [5]);
    const got = [0, 1, 2].map(
      (t) => flights.filter((f) => f.player === t).length,
    );
    expect(got).toEqual([10, 10, 8]);
    expect(flights.slice(0, 15).map((f) => f.player)).toEqual([
      ...Array(5).fill(0),
      ...Array(5).fill(1),
      ...Array(5).fill(2),
    ]);
  });
});
