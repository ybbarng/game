import { describe, expect, it } from "vitest";
import {
  applyTable,
  composePerm,
  composeTables,
  identityPerm,
  invertPerm,
  invertTable,
  isValidPerm,
  permParity,
  solvedState,
  statesEqual,
} from "./perm";
import type { MoveTable } from "./types";

// 자리 0→1→2→0 으로 돌고, 도는 동안 방향이 1씩 늘어나는 3자리 퍼즐
const cycle: MoveTable = {
  dest: Uint16Array.from([1, 2, 0, 3]),
  twistDelta: Uint8Array.from([1, 1, 1, 0]),
  twistMod: 4,
};

describe("순열", () => {
  it("합성과 역", () => {
    const p = Uint16Array.from([1, 2, 0, 3]);
    expect([...composePerm(p, invertPerm(p))]).toEqual([...identityPerm(4)]);
    expect([...composePerm(p, p)]).toEqual([2, 0, 1, 3]);
  });

  it("홀짝", () => {
    expect(permParity([0, 1, 2])).toBe(0);
    expect(permParity([1, 0, 2])).toBe(1);
    expect(permParity([1, 2, 0])).toBe(0);
    expect(permParity([1, 2, 3, 0])).toBe(1);
  });

  it("올바른 순열인지", () => {
    expect(isValidPerm([2, 0, 1])).toBe(true);
    expect(isValidPerm([0, 0, 1])).toBe(false);
    expect(isValidPerm([0, 3, 1])).toBe(false);
  });
});

describe("수 표", () => {
  it("세 번 돌면 제자리지만 방향은 3만큼 돈다", () => {
    let s = solvedState(4);
    for (let i = 0; i < 3; i++) s = applyTable(s, cycle);
    expect([...s.perm]).toEqual([0, 1, 2, 3]);
    expect([...s.twist]).toEqual([3, 3, 3, 0]);
  });

  it("합성 표는 차례로 적용한 것과 같다", () => {
    const s0 = solvedState(4);
    const a = applyTable(applyTable(s0, cycle), cycle);
    const b = applyTable(s0, composeTables(cycle, cycle));
    expect(statesEqual(a, b)).toBe(true);
  });

  it("역 표는 되돌린다", () => {
    const s = applyTable(solvedState(4), cycle);
    expect(statesEqual(applyTable(s, invertTable(cycle)), solvedState(4))).toBe(
      true,
    );
  });
});
