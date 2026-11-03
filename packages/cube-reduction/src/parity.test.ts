import { describe, expect, test } from "vitest";
import {
  reductionGeometry,
  slotPaired,
  slotScore,
  wingParity,
} from "./geometry";
import { EDGE_PARITY_TEXT, PLL_PARITY_TEXT } from "./macros";
import { applyMovesColors, moves } from "./sim";
import { centersSolvedOn, pairedSlots } from "./test-util";
import { threeParity, toThreeFacelets } from "./three";

const IDENTITY = [0, 1, 2, 3, 4, 5];
const SOLVED3 = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

function solvedColors(n: number): Uint8Array {
  return new Uint8Array(6 * n * n).map((_, i) => Math.floor(i / (n * n)));
}

/** 3×3 문자열에서 두 자리씩 글자를 바꾼다 */
function swap(s: string, pairs: readonly [number, string][]): string {
  const a = s.split("");
  for (const [i, c] of pairs) a[i] = c;
  return a.join("");
}

describe("4×4 패리티 공식", () => {
  const n = 4;

  test("OLL 패리티: 가운데·짝은 그대로, UF 모서리 하나만 뒤집힌다", () => {
    const c = applyMovesColors(n, solvedColors(n), moves(n, EDGE_PARITY_TEXT));
    expect(centersSolvedOn(n, c, IDENTITY)).toBe(true);
    expect(pairedSlots(n, c)).toBe(12);
    const three = toThreeFacelets(n, c, IDENTITY);
    // UF 모서리 스티커(U면 7번, F면 19번)만 서로 바뀐다
    expect(three).toBe(
      swap(SOLVED3, [
        [7, "F"],
        [19, "U"],
      ]),
    );
    expect(threeParity(three)).toEqual({ oll: true, pll: false });
  });

  test("PLL 패리티: 가운데·짝은 그대로, UF·UB 모서리 짝만 맞바뀐다", () => {
    const c = applyMovesColors(n, solvedColors(n), moves(n, PLL_PARITY_TEXT));
    expect(centersSolvedOn(n, c, IDENTITY)).toBe(true);
    expect(pairedSlots(n, c)).toBe(12);
    const three = toThreeFacelets(n, c, IDENTITY);
    // UF(7, 19)와 UB(1, 46): U 스티커는 그대로 U, 옆 스티커가 F↔B
    expect(three).toBe(
      swap(SOLVED3, [
        [19, "B"],
        [46, "F"],
      ]),
    );
    expect(threeParity(three)).toEqual({ oll: false, pll: true });
  });

  test("두 공식을 두 번 돌리면 제자리다", () => {
    for (const text of [EDGE_PARITY_TEXT, PLL_PARITY_TEXT]) {
      const twice = moves(n, `${text} ${text}`);
      expect(applyMovesColors(n, solvedColors(n), twice)).toEqual(
        solvedColors(n),
      );
    }
  });
});

describe("5×5 모서리 패리티", () => {
  const n = 5;
  const g = reductionGeometry(n);

  test("UF 모서리의 두 날개만 맞바뀐다(가운데 조각과 날개가 어긋난다)", () => {
    const c = applyMovesColors(n, solvedColors(n), moves(n, EDGE_PARITY_TEXT));
    expect(centersSolvedOn(n, c, IDENTITY)).toBe(true);
    const color = (p: number) => c[p] as number;
    const broken = g.slots.filter((s) => !slotPaired(s, color));
    expect(broken.map((s) => s.faces)).toEqual([[0, 2]]);
    expect(slotScore(broken[0] as (typeof g.slots)[number], color)).toBe(0);
    // 꼭짓점·가운데 모서리 조각은 그대로라 3×3으로 보면 맞아 있다
    expect(toThreeFacelets(n, c, IDENTITY)).toBe(SOLVED3);
    expect(wingParity(n, c)).toBe(1);
  });

  test("날개 순열 홀짝: 안쪽 한 층 90°는 홀, 짝 지은 모양은 짝", () => {
    expect(wingParity(n, solvedColors(n))).toBe(0);
    expect(
      wingParity(n, applyMovesColors(n, solvedColors(n), moves(n, "2R"))),
    ).toBe(1);
    expect(
      wingParity(
        n,
        applyMovesColors(n, solvedColors(n), moves(n, "R U2 F' L")),
      ),
    ).toBe(0);
  });
});
