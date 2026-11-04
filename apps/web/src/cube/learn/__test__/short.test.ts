import { describe, expect, it } from "vitest";
import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "../algs-2look";
import { OLL_CASES } from "../algs-oll";
import { ORTEGA_OLL, ORTEGA_PBL } from "../algs-ortega";
import { PLL_CASES } from "../algs-pll";
import {
  allCornersOriented,
  cornerPermClass,
  dlCornerPerm,
  f2lIntact,
  llCornerOriKey,
  llCornerPerm,
  llOrientation,
  ollKey,
  pllKey,
} from "./pieces";
import { apply, type Cube, colorMap, invert, normalize, solved } from "./sim";

const stateOf = (alg: string) => apply(solved(3), invert(alg));

// 옆면(앞·오른·뒤·왼) 중 위층(또는 아래층) 코너 두 스티커가 같은 색인 면
function headlights(c: Cube, y: 2 | -2): string[] {
  const m = colorMap(normalize(c));
  const sides: [string, string, string][] = [
    ["앞", "2,Y,2|0,0,1", "-2,Y,2|0,0,1"],
    ["오른", "2,Y,2|1,0,0", "2,Y,-2|1,0,0"],
    ["뒤", "2,Y,-2|0,0,-1", "-2,Y,-2|0,0,-1"],
    ["왼", "-2,Y,2|-1,0,0", "-2,Y,-2|-1,0,0"],
  ];
  return sides
    .filter(
      ([, a, b]) =>
        m.get(a.replace("Y", String(y))) === m.get(b.replace("Y", String(y))),
    )
    .map(([name]) => name);
}

describe("2단계 OLL", () => {
  it("엣지 공식 셋: 아래 두 층을 지키고 윗면 엣지 무늬가 이름과 맞는다", () => {
    const edges = TWO_LOOK_OLL.filter((c) => c.group === "edges");
    expect(edges).toHaveLength(3);
    const oriented = (alg: string) =>
      [...llOrientation(stateOf(alg)).slice(4)]
        .map((x, i) => (x === "0" ? i : -1))
        .filter((i) => i >= 0);
    // 위층 엣지 자리 순서: 앞 0, 왼 1, 뒤 2, 오른 3
    for (const c of edges)
      expect(f2lIntact(stateOf(c.algs[0] as string)), c.name).toBe(true);
    expect(oriented("F R U R' U' F'")).toEqual([1, 3]);
    expect(oriented("F U R U' R' F'")).toEqual([1, 2]);
    expect(oriented("f R U R' U' f'")).toEqual([0, 3]);
    expect(oriented("F R U R' U' F' f R U R' U' f'")).toEqual([]);
  });

  it("코너 공식 일곱은 OLL 21~27과 같은 상황이다", () => {
    const corners = TWO_LOOK_OLL.filter((c) => c.group === "corners");
    expect(corners).toHaveLength(7);
    for (const c of corners) {
      const n = Number(c.id.split("-").pop());
      const full = OLL_CASES.find((o) => o.id === `oll-${n}`);
      expect(ollKey(stateOf(c.algs[0] as string)), c.name).toBe(
        ollKey(stateOf(full?.algs[0] as string)),
      );
    }
  });
});

describe("2단계 PLL", () => {
  it("코너 공식 둘: 이웃·대각 바꿈", () => {
    const cls = (id: string) =>
      cornerPermClass(
        llCornerPerm(
          stateOf(TWO_LOOK_PLL.find((c) => c.id === id)?.algs[0] as string),
        ),
      );
    expect(cls("2look-pll-headlights")).toBe("adjacent");
    expect(cls("2look-pll-diagonal")).toBe("diagonal");
  });

  it("헤드라이트 공식(T퍼뮤) 상황은 헤드라이트가 왼쪽에 있다", () => {
    expect(
      headlights(stateOf("R U R' U' R' F R2 U' R' U' R U R' F'"), 2),
    ).toEqual(["왼"]);
  });

  it("엣지 공식 넷은 PLL의 U·H·Z와 같다", () => {
    const edges = TWO_LOOK_PLL.filter((c) => c.group === "edges");
    expect(edges).toHaveLength(4);
    for (const c of edges) {
      const full = PLL_CASES.find((p) => p.id === c.id.replace("2look-", ""));
      expect(pllKey(invert(c.algs[0] as string)), c.name).toBe(
        pllKey(invert(full?.algs[0] as string)),
      );
      expect(
        cornerPermClass(llCornerPerm(stateOf(c.algs[0] as string))),
        c.name,
      ).toBe("solved");
    }
  });
});

describe("2×2 오르테가", () => {
  it("OLL 7: 아래 코너 넷이 흰 면을 지키고, 일곱 상황이 서로 다르다", () => {
    expect(ORTEGA_OLL).toHaveLength(7);
    const keys = new Set<string>();
    for (const c of ORTEGA_OLL) {
      const s = stateOf(c.algs[0] as string);
      const n = normalize(s);
      const dPieces = dlCornerPerm(n);
      expect(
        dPieces.every((i) => i >= 0),
        c.name,
      ).toBe(true);
      const k = llCornerOriKey(s);
      expect(k, c.name).not.toBe("0000");
      expect(keys.has(k), `${c.name} 겹침`).toBe(false);
      keys.add(k);
    }
  });

  it("PBL: 코너 방향은 그대로, 위·아래 자리 바꿈이 묶음과 맞는다", () => {
    for (const c of ORTEGA_PBL) {
      const s = stateOf(c.algs[0] as string);
      expect(allCornersOriented(s), c.name).toBe(true);
      const top = cornerPermClass(llCornerPerm(s));
      const bottom = cornerPermClass(dlCornerPerm(s));
      expect(`${top}/${bottom}`, c.name).toBe(c.group);
    }
  });

  it("PBL 설명의 헤드라이트 자리가 맞다", () => {
    const s = (id: string) =>
      stateOf(ORTEGA_PBL.find((c) => c.id === id)?.algs[0] as string);
    expect(headlights(s("ortega-pbl-adj-top"), 2)).toEqual(["왼"]);
    expect(headlights(s("ortega-pbl-adj-adj"), 2)).toEqual(["앞"]);
    expect(headlights(s("ortega-pbl-adj-adj"), -2)).toEqual(["앞"]);
    expect(headlights(s("ortega-pbl-adj-diag"), 2)).toEqual(["앞"]);
  });
});
