import { describe, expect, it } from "vitest";

import { planSeats, seatModeOf } from "./race-seats";

const people = (c: number) => Array.from({ length: c }, (_, i) => `p${i + 1}`);

describe("대결 자리 나누기", () => {
  it("화면 모양: 좁은 세로·낮은 가로·데스크톱", () => {
    expect(seatModeOf(412, 915)).toBe("narrow");
    expect(seatModeOf(915, 412)).toBe("short");
    expect(seatModeOf(1280, 720)).toBe("wide");
  });

  it("상대 1~7명 모두 빠짐없이 한 번씩 앉는다", () => {
    for (const mode of ["wide", "short", "narrow"] as const)
      for (let c = 1; c <= 7; c++) {
        const p = planSeats(people(c), mode);
        expect([...p.left, ...p.top, ...p.right].sort()).toEqual(
          people(c).sort(),
        );
      }
  });

  it("데스크톱: 위 줄은 셋까지, 양옆은 둘까지", () => {
    for (let c = 1; c <= 7; c++) {
      const p = planSeats(people(c), "wide");
      expect(p.top.length).toBeLessThanOrEqual(3);
      expect(p.left.length).toBeLessThanOrEqual(2);
      expect(p.right.length).toBeLessThanOrEqual(2);
    }
    expect(planSeats(people(1), "wide").top).toEqual(["p1"]);
  });

  it("시계 방향: 왼쪽 칸 아래에서 위 → 위 줄 → 오른쪽 칸 위에서 아래", () => {
    const p = planSeats(people(7), "wide");
    expect(p.left).toEqual(["p2", "p1"]);
    expect(p.top).toEqual(["p3", "p4", "p5"]);
    expect(p.right).toEqual(["p6", "p7"]);
  });

  it("휴대폰 가로는 양옆에만, 휴대폰 세로는 위에 한 줄(다섯부터 두 줄)", () => {
    const s = planSeats(people(7), "short");
    expect(s.top).toEqual([]);
    expect(s.left.length + s.right.length).toBe(7);
    expect(planSeats(people(1), "short").right).toEqual(["p1"]);
    expect(planSeats(people(4), "narrow").topColumns).toBe(4);
    expect(planSeats(people(7), "narrow").topColumns).toBe(4);
    expect(planSeats(people(5), "narrow").topColumns).toBe(3);
  });
});
