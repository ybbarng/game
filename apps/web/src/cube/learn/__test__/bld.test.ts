import { describe, expect, it } from "vitest";
import {
  BLD_ALGS,
  BLD_CORNER_TARGETS,
  BLD_EDGE_TARGETS,
  type BldTarget,
} from "../bld";
import { apply, type Cube, invert, solved } from "./sim";

// 스티커 자리 이름(첫 글자가 그 스티커의 면) → 시뮬레이터 좌표
const AXIS: Record<string, [number, number]> = {
  U: [1, 2],
  D: [1, -2],
  R: [0, 2],
  L: [0, -2],
  F: [2, 2],
  B: [2, -2],
};
function where(name: string): string {
  const pos = [0, 0, 0];
  for (const ch of name) {
    const [axis, v] = AXIS[ch] as [number, number];
    pos[axis] = v;
  }
  const normal = [0, 0, 0];
  const [axis, v] = AXIS[name[0] as string] as [number, number];
  normal[axis] = Math.sign(v);
  return `${pos}|${normal}`;
}

const at = (c: Cube, i: number) => {
  const s = c.stickers[i];
  return s ? `${s.pos}|${s.normal}` : "";
};
const indexOf = (p: string) => {
  const s = solved(3);
  return s.stickers.findIndex((_, i) => at(s, i) === p);
};

// 공식 뒤 자리가 바뀐 스티커의 원래 자리 → 새 자리
function moved(alg: string): Map<string, string> {
  const s0 = solved(3);
  const s = apply(s0, alg);
  const m = new Map<string, string>();
  s.stickers.forEach((_, i) => {
    if (at(s, i) !== at(s0, i)) m.set(at(s0, i), at(s, i));
  });
  return m;
}

const alg = (id: string) =>
  BLD_ALGS.find((a) => a.id === id)?.algs[0] as string;

function checkTargets(
  targets: BldTarget[],
  swap: string,
  buffer: string,
  sideEffect: string[],
) {
  for (const t of targets) {
    const full = `${t.setup} ${swap} ${invert(t.setup)}`;
    const m = moved(full);
    const target = where(t.sticker);
    // 버퍼 스티커는 글자 자리로, 글자 자리 스티커는 버퍼로
    expect(m.get(buffer), `${t.letter} ${t.sticker}`).toBe(target);
    expect(m.get(target), `${t.letter} ${t.sticker}`).toBe(buffer);
    // 그 밖에 움직인 조각은 버퍼 조각·글자 조각·정해진 곁다리뿐
    const pieceOf = (p: string) => p.split("|")[0];
    const allowed = new Set([pieceOf(buffer), pieceOf(target), ...sideEffect]);
    for (const from of m.keys())
      expect(allowed.has(pieceOf(from)), `${t.letter}: ${from}`).toBe(true);
  }
}

describe("블라인드 올드 포흐만", () => {
  it("글자는 버퍼 조각을 빼고 모두 있다", () => {
    expect(BLD_EDGE_TARGETS).toHaveLength(22);
    expect(BLD_CORNER_TARGETS).toHaveLength(21);
    expect(new Set(BLD_EDGE_TARGETS.map((t) => t.letter)).size).toBe(22);
    expect(new Set(BLD_CORNER_TARGETS.map((t) => t.letter)).size).toBe(21);
  });

  it("엣지: 준비 → T퍼뮤 → 되돌리기가 버퍼(UR)와 그 글자만 바꾼다(코너 UFR·UBR은 곁다리)", () => {
    checkTargets(BLD_EDGE_TARGETS, alg("bld-op-edge"), where("UR"), [
      "2,2,2",
      "2,2,-2",
    ]);
  });

  it("코너: 준비 → 변형 Y퍼뮤 → 되돌리기가 버퍼(UBL)와 그 글자만 바꾼다(엣지 UL·UB는 곁다리)", () => {
    checkTargets(BLD_CORNER_TARGETS, alg("bld-op-corner"), where("ULB"), [
      "-2,2,0",
      "0,2,-2",
    ]);
  });

  it("패리티 공식은 코너 UFR·UBR과 엣지 UL·UB만 맞바꾼다", () => {
    const m = moved(alg("bld-op-parity"));
    const pieces = new Set([...m.keys()].map((p) => p.split("|")[0]));
    expect([...pieces].sort()).toEqual(
      ["-2,2,0", "0,2,-2", "2,2,-2", "2,2,2"].sort(),
    );
    expect(m.get(where("UL"))).toBe(where("UB"));
    expect(m.get(where("UFR"))).toBe(where("UBR"));
  });

  it("스티커 이름을 좌표로 바르게 읽는다", () => {
    expect(indexOf(where("UR"))).toBeGreaterThanOrEqual(0);
    expect(where("RDF")).toBe("2,-2,2|1,0,0");
  });
});
