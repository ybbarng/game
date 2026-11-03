import { describe, expect, it } from "vitest";
import { FINGER_DRILLS } from "../fingers";
import { ALL_ALG_CASES } from "../index";
import { FINGER_NOTATION } from "../types";
import { tokens } from "./sim";

const valid = new Set(Object.keys(FINGER_NOTATION));

// 수 하나에 맞는 손가락 낱말. 표기 설명의 괄호 속 수 목록과 맞춰 본다
function fits(move: string, finger: string): boolean {
  const desc = FINGER_NOTATION[finger as keyof typeof FINGER_NOTATION];
  const list = /\(([^)]*)\)/.exec(desc)?.[1] ?? "";
  if (finger === "rot") return /^[xyz]/.test(move);
  const names = list.split(/[·,\s]/).filter((x) => x.length > 0);
  return names.some((n) => n === move || n.replace(/'/g, "'") === move);
}

describe("손가락 표기", () => {
  it.each(FINGER_DRILLS)("$title: 수마다 맞는 손가락 낱말이 하나씩", (d) => {
    const moves = tokens(d.alg);
    const fingers = d.fingers.split(" ");
    expect(fingers).toHaveLength(moves.length);
    fingers.forEach((f, i) => {
      expect(valid.has(f), f).toBe(true);
      expect(fits(moves[i] as string, f), `${moves[i]} ← ${f}`).toBe(true);
    });
  });

  it("공식 상황의 손가락 표기도 같은 규칙", () => {
    for (const c of ALL_ALG_CASES.filter((x) => x.fingers !== undefined)) {
      const moves = tokens(c.algs[0] as string);
      const fingers = (c.fingers as string).split(" ");
      expect(fingers, c.name).toHaveLength(moves.length);
      fingers.forEach((f, i) => {
        expect(
          fits(moves[i] as string, f),
          `${c.name} ${moves[i]} ← ${f}`,
        ).toBe(true);
      });
    }
  });
});
