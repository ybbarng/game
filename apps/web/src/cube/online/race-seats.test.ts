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

  it("사람 수 2·3·4·5·8 × 화면 세 가지: 칸·꼴·폭", () => {
    // [왼쪽, 위, 오른쪽, 위 줄 칸 수, 위 줄 줄 수, 위 꼴, 옆 꼴, 옆 폭, 위 자리 폭]
    type Row = [
      number,
      number,
      number,
      number,
      number,
      string,
      string,
      number,
      number | null,
    ];
    const want: Record<string, Record<number, Row>> = {
      wide: {
        2: [0, 1, 0, 1, 1, "top", "side", 0, 288],
        3: [1, 0, 1, 1, 0, "top", "side", 176, 288],
        4: [1, 1, 1, 1, 1, "top", "side", 176, 288],
        5: [1, 2, 1, 2, 1, "top", "side", 176, 288],
        8: [2, 3, 2, 3, 1, "top", "side", 176, 288],
      },
      short: {
        2: [0, 0, 1, 1, 0, "top", "slim", 160, 288],
        3: [1, 0, 1, 1, 0, "top", "slim", 160, 288],
        4: [1, 0, 2, 1, 0, "top", "slim", 160, 288],
        5: [2, 0, 2, 1, 0, "top", "slim", 160, 288],
        8: [3, 0, 4, 1, 0, "top", "slim", 160, 288],
      },
      narrow: {
        2: [0, 1, 0, 1, 1, "slim", "slim", 0, null],
        3: [0, 2, 0, 2, 1, "slim", "slim", 0, null],
        4: [0, 3, 0, 3, 1, "tiny", "slim", 0, null],
        5: [0, 4, 0, 4, 1, "tiny", "slim", 0, null],
        8: [0, 7, 0, 4, 2, "tiny", "slim", 0, null],
      },
    };
    for (const mode of ["wide", "short", "narrow"] as const)
      for (const count of [2, 3, 4, 5, 8]) {
        const p = planSeats(people(count - 1), mode);
        const got: Row = [
          p.left.length,
          p.top.length,
          p.right.length,
          p.topColumns,
          p.topRows,
          p.topLook,
          p.sideLook,
          p.sideWidth,
          p.topSeatWidth,
        ];
        expect([mode, count, got]).toEqual([mode, count, want[mode]?.[count]]);
      }
  });

  it("데스크톱 1280 폭: 양옆 칸 둘과 사이를 빼도 내 큐브 칸이 600px 넘게 남는다", () => {
    // 바깥 틀 max-w-5xl(1024px) − 옆 칸 둘 − 사이(12px 둘)
    const p = planSeats(people(7), "wide");
    expect(1024 - 2 * p.sideWidth - 2 * 12).toBeGreaterThan(600);
    // 위 줄 셋과 사이(12px 둘)는 1024px 안에 든다
    expect(p.top.length * (p.topSeatWidth ?? 0) + 2 * 12).toBeLessThanOrEqual(
      1024,
    );
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
