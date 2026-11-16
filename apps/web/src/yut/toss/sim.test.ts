import type { Gesture, NakReason, Sticks } from "@game/yut-engine";
import { describe, expect, it } from "vitest";

import {
  findLibrarySeeds,
  LAST_GAP,
  LIBRARY_SEEDS,
  LIBRARY_SIZE,
  library,
  MAT_RADIUS,
  planToss,
  poseAt,
  radialExtent,
  restSegment,
  restsFlat,
  robustFace,
  STOP_GAP,
  seatAngle,
  type TossInput,
} from "./sim";

/** 가락 넷의 열여섯 가지 앞뒷면(도·개·걸·윷·모·빽도가 모두 들어 있다) */
const ALL_STICKS: Sticks[] = Array.from(
  { length: 16 },
  (_, n) => [0, 1, 2, 3].map((i) => ((n >> i) & 1) === 1) as Sticks,
);

const STEADY: Gesture = { height: 50, direction: 0, strength: 40 };
/** 몸짓 몇 가지: 알맞게, 높이·세게, 왼쪽으로 치우침, 오른쪽으로 쓸어 던짐 */
const GESTURES: Gesture[] = [
  STEADY,
  { height: 95, direction: 12, strength: 88 },
  { height: 20, direction: -40, strength: 15 },
  { height: 60, direction: 75, strength: 60 },
];

function input(
  sticks: Sticks,
  gesture: Gesture,
  nak: NakReason | null,
  index = 7,
  angle = seatAngle(0, 2),
): TossInput {
  return { index, gesture, sticks, nak, angle };
}

describe("윷가락 궤적 모음", () => {
  it("면마다 보통 궤적과 조금 더 구르는 궤적을 정한 수만큼 채운다", () => {
    const lib = library();
    expect(lib.flat.normal).toHaveLength(LIBRARY_SIZE.normal);
    expect(lib.round.normal).toHaveLength(LIBRARY_SIZE.normal);
    expect(lib.flat.long).toHaveLength(LIBRARY_SIZE.long);
    expect(lib.round.long).toHaveLength(LIBRARY_SIZE.long);
  });

  it("적어 둔 씨앗은 고르는 규칙으로 다시 찾은 씨앗과 같다(흉내를 바꾸면 다시 적는다)", () => {
    expect(findLibrarySeeds()).toEqual(LIBRARY_SEEDS);
  });

  it("모음의 궤적은 제 면으로 멈추고, 시작 값을 조금 흔들어도 그 면이다", () => {
    const lib = library();
    for (const [flat, box] of [
      [true, lib.flat],
      [false, lib.round],
    ] as const)
      for (const settle of [...box.normal, ...box.long]) {
        expect(settle.flat).toBe(flat);
        expect(robustFace(settle.seed)).toBe(flat);
      }
  });

  it("조금 더 구르는 궤적은 보통 궤적보다 오래 구른다", () => {
    const lib = library();
    const longest = Math.max(
      ...[...lib.flat.normal, ...lib.round.normal].map((s) => s.duration),
    );
    for (const s of [...lib.flat.long, ...lib.round.long])
      expect(s.duration).toBeGreaterThan(longest);
  });
});

describe("궤적 고르기: 정해진 결과로 끝난다", () => {
  it("가락 넷의 열여섯 가지 앞뒷면마다, 몸짓마다 그 면으로 멈춘다", () => {
    for (const sticks of ALL_STICKS)
      for (const gesture of GESTURES) {
        const plan = planToss(input(sticks, gesture, null));
        expect(
          [0, 1, 2, 3].map((k) => restsFlat(plan, k)),
          `${sticks} ${JSON.stringify(gesture)}`,
        ).toEqual(sticks);
      }
  });

  it("낙이 아니면 네 가락 모두 멍석 안에 온전히 멈추고 서로 겹치지 않는다", () => {
    for (const sticks of ALL_STICKS) {
      const plan = planToss(input(sticks, STEADY, null));
      for (const s of plan.sticks) {
        expect(s.out).toBe(false);
        expect(radialExtent(restSegment(s)).far).toBeLessThan(MAT_RADIUS);
      }
    }
  });

  it("낙 궤적은 한 가락 넘게 멍석 밖에 온전히 멈춘다(쓸어 던지면 넷 모두)", () => {
    for (const sticks of ALL_STICKS) {
      const chance = planToss(
        input(sticks, { height: 70, direction: 40, strength: 80 }, "chance"),
      );
      const outside = chance.sticks.filter(
        (s) => radialExtent(restSegment(s)).near > MAT_RADIUS,
      );
      expect(outside.length).toBeGreaterThanOrEqual(1);
      expect(outside.length).toBe(chance.sticks.filter((s) => s.out).length);

      const sweep = planToss(
        input(sticks, { height: 50, direction: -80, strength: 50 }, "sweep"),
      );
      for (const s of sweep.sticks)
        expect(radialExtent(restSegment(s)).near).toBeGreaterThan(MAT_RADIUS);
      // 낙이어도 가락 앞뒷면은 엔진이 정한 그대로 보인다
      expect([0, 1, 2, 3].map((k) => restsFlat(sweep, k))).toEqual(sticks);
    }
  });

  it("몸짓·결과·자리가 달라도 멈춘 가락끼리 겹치지 않게 놓인다(낙이면 나간 가락은 밖, 나머지는 안)", () => {
    const naks: (NakReason | null)[] = [null, "chance", "sweep"];
    let n = 0;
    for (let height = 15; height <= 100; height += 17)
      for (let direction = -90; direction <= 90; direction += 30)
        for (let strength = 0; strength <= 100; strength += 25) {
          n++;
          const sticks = ALL_STICKS[n % 16] as Sticks;
          const nak = naks[n % 3] ?? null;
          const angle = seatAngle(n % 4, 4);
          const plan = planToss(
            input(sticks, { height, direction, strength }, nak, n, angle),
          );
          expect(plan.fits, `${height},${direction},${strength} ${nak}`).toBe(
            true,
          );
        }
  });

  it("같은 던지기 번호·몸짓이면 같은 궤적, 몸짓이 다르면 다른 궤적", () => {
    const sticks: Sticks = [true, false, true, false];
    const a = planToss(input(sticks, STEADY, null));
    const b = planToss(input(sticks, { ...STEADY }, null));
    expect(poseAt(b, 2, 0.8)).toEqual(poseAt(a, 2, 0.8));
    const c = planToss(input(sticks, { ...STEADY, strength: 41 }, null));
    expect(poseAt(c, 2, 0.8)).not.toEqual(poseAt(a, 2, 0.8));
  });
});

describe("가락은 하나씩 멈추고 마지막은 조금 더 구른다", () => {
  it("멈추는 시각이 서로 간격을 두고, 마지막 가락은 더 늦게 멈춘다", () => {
    for (const gesture of GESTURES) {
      const plan = planToss(input([true, true, false, true], gesture, null));
      const [a, b, c, d] = plan.sticks
        .map((s) => s.stop)
        .sort((x, y) => x - y) as [number, number, number, number];
      expect(b - a).toBeGreaterThanOrEqual(STOP_GAP - 1e-9);
      expect(c - b).toBeGreaterThanOrEqual(STOP_GAP - 1e-9);
      expect(d - c).toBeGreaterThanOrEqual(LAST_GAP - 1e-9);
      expect(plan.duration).toBe(d);
    }
  });

  it("멈춘 뒤에는 움직이지 않는다", () => {
    const plan = planToss(input([false, true, true, false], STEADY, null));
    for (const [k, s] of plan.sticks.entries())
      expect(poseAt(plan, k, s.stop + 0.5)).toEqual(
        poseAt(plan, k, s.stop + 3),
      );
  });

  it("손을 떠난 자리는 던진 사람 자리 쪽이다(다른 사람은 그 자리 방향에서 날아온다)", () => {
    const sticks: Sticks = [true, false, false, true];
    for (const [offset, players] of [
      [0, 2],
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 4],
    ] as const) {
      const angle = seatAngle(offset, players);
      const plan = planToss(input(sticks, STEADY, null, 3, angle));
      const start = poseAt(plan, 0, 0);
      const toward =
        (start.x * Math.cos(angle) + start.z * Math.sin(angle)) /
        Math.hypot(start.x, start.z);
      // 자리 방향과 거의 같다(5도 안쪽), 멍석 가장자리 바깥
      expect(toward).toBeGreaterThan(Math.cos((5 * Math.PI) / 180));
      expect(Math.hypot(start.x, start.z)).toBeGreaterThan(MAT_RADIUS);
    }
  });
});

describe("자리 방향", () => {
  it("나는 화면 앞(+z), 1:1 상대는 건너편, 넷이면 오른쪽·건너편·왼쪽", () => {
    expect(Math.sin(seatAngle(0, 2))).toBeCloseTo(1);
    expect(Math.sin(seatAngle(1, 2))).toBeCloseTo(-1);
    expect(Math.cos(seatAngle(1, 4))).toBeCloseTo(1);
    expect(Math.sin(seatAngle(2, 4))).toBeCloseTo(-1);
    expect(Math.cos(seatAngle(3, 4))).toBeCloseTo(-1);
  });
});
