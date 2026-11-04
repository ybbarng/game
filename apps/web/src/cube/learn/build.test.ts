import {
  cubeTopology,
  FACE_NORMALS,
  OPPOSITE_FACE,
  pieceFaces,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import {
  B,
  BUILD_START,
  buildAsks,
  buildBegin,
  buildCount,
  buildFill,
  buildNext,
  buildOrder,
  buildTakeApart,
  buildTap,
  buildVerdict,
  D,
  F,
  handedness,
  L,
  R,
  U,
} from "./build";

const center = (f: number) =>
  buildOrder().centers.find((p) => pieceFaces(3, p)[0] === f) as number;

describe("분해·조립 차례", () => {
  it("축 → 가운데 6 → 모서리 12 → 꼭짓점 8(붙은 색 1 → 2 → 3)", () => {
    const o = buildOrder();
    expect(o.centers).toHaveLength(6);
    expect(o.edges).toHaveLength(12);
    expect(o.corners).toHaveLength(8);
    for (const p of o.centers) expect(pieceFaces(3, p)).toHaveLength(1);
    for (const p of o.edges) expect(pieceFaces(3, p)).toHaveLength(2);
    for (const p of o.corners) expect(pieceFaces(3, p)).toHaveLength(3);
    expect(BUILD_START.placed).toHaveLength(26);
  });

  it("가운데는 흰 위·초록 앞을 잡아 두고 넷을 고른다, 모서리 둘·꼭짓점 하나를 고른 뒤 나머지를 끼운다", () => {
    let b = buildBegin(buildTakeApart());
    expect(b.phase).toBe("centers");
    expect(buildCount(b)).toEqual({ done: 2, total: 6 });
    for (const f of [D, R, B, L]) {
      expect(buildAsks(b)).toBe(true);
      expect(buildNext(b)).toBe(center(f));
      b = buildTap(b, center(f)).state;
    }
    expect(b.phase).toBe("edges");
    expect(buildCount(b)).toEqual({ done: 0, total: 12 });
    const [e1, e2] = buildOrder().edges as [number, number];
    expect(buildAsks(b)).toBe(true);
    b = buildTap(b, e1).state;
    b = buildTap(b, e2).state;
    expect(buildAsks(b)).toBe(false);
    b = buildFill(b);
    expect(b.phase).toBe("corners");
    b = buildTap(b, buildOrder().corners[0] as number).state;
    expect(buildAsks(b)).toBe(false);
    b = buildFill(b);
    expect(b.phase).toBe("done");
    expect(new Set(b.placed).size).toBe(26);
  });
});

describe("가운데 규칙", () => {
  const start = buildBegin(buildTakeApart());
  it("맞은편 짝: 노랑은 흰 맞은편, 초록 맞은편 자리는 파랑 자리", () => {
    expect(buildNext(start)).toBe(center(D));
    expect(buildVerdict(start, center(R))).toEqual({
      kind: "opposite",
      pair: U,
      across: false,
    });
    expect(buildVerdict(start, center(B))).toEqual({
      kind: "opposite",
      pair: F,
      across: true,
    });
    expect(buildVerdict(start, center(U))).toEqual({ kind: "taken" });
    expect(buildVerdict(start, center(D))).toEqual({ kind: "ok" });
  });

  it("빨강을 왼쪽에 끼우면 거울(맞출 수 없는 큐브)", () => {
    const b = buildTap(start, center(D)).state;
    expect(buildNext(b)).toBe(center(R));
    expect(buildVerdict(b, center(L))).toEqual({ kind: "mirror" });
    // 흰-초록-빨강 꼭짓점의 세 면 돌림 차례가 거울 자리에서는 거꾸로다
    const n = (f: number) => FACE_NORMALS[f] as readonly number[];
    expect(handedness(n(U), n(F), n(R))).toBe(-handedness(n(U), n(F), n(L)));
    expect(OPPOSITE_FACE[R as 0]).toBe(L);
  });

  it("다른 종류의 자리·제 색 사이가 아닌 자리는 끼우지 않는다", () => {
    const b = buildTap(start, center(D)).state;
    const edge = cubeTopology(3).pieces.findIndex((p) => p.kind === "edge");
    expect(buildVerdict(b, edge).kind).toBe("kind");
    let e = buildFill(b);
    expect(e.phase).toBe("edges");
    const [first, second] = buildOrder().edges as [number, number];
    expect(buildVerdict(e, second)).toEqual({
      kind: "slot",
      between: pieceFaces(3, second),
    });
    e = buildTap(e, first).state;
    expect(e.placed).toContain(first);
  });
});
