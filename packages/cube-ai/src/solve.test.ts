import { formatMove, parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { type Marked, mergeMarked } from "./solve";

/** "F U |R R' U B"처럼 `|` 바로 뒤 수에 멈춤 표시를 단다 */
function marked(text: string): Marked[] {
  const out: Marked[] = [];
  let look = false;
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    const t = tok.startsWith("|") ? tok.slice(1) : tok;
    if (tok.startsWith("|")) look = true;
    if (!t) continue;
    out.push({ m: parseMoves(3, t)[0] as NonNullable<Marked["m"]>, look });
    look = false;
  }
  return out;
}

/** 합친 결과를 같은 꼴 글로 */
function show(list: readonly Marked[]): string {
  return list.map((x) => (x.look ? "|" : "") + formatMove(3, x.m)).join(" ");
}

describe("mergeMarked", () => {
  it("합쳐진 수는 앞쪽 수의 표시를 받는다", () => {
    expect(show(mergeMarked(marked("F |U U B")))).toBe("F |U2 B");
    expect(show(mergeMarked(marked("F U |U B")))).toBe("F |U2 B");
  });

  it("지워진 수의 표시는 다음 수가 받는다", () => {
    expect(show(mergeMarked(marked("F |R R' B")))).toBe("F |B");
  });

  it("지워진 뒤 다음 수가 앞 수와 합쳐지면 그 합친 수가 표시를 받는다(한 수 밀리지 않는다)", () => {
    expect(show(mergeMarked(marked("F U |R R' U B")))).toBe("F |U2 B");
  });

  it("지워지고 또 지워지면 표시는 남은 다음 수까지 간다", () => {
    expect(show(mergeMarked(marked("F |R R' U U' B")))).toBe("F |B");
  });
});
