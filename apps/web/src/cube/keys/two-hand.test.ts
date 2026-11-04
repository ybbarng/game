import { describe, expect, it } from "vitest";

import { presetKeymap, resolveAction } from "../input";
import { handOf } from "./layout";
import { keyRowOf, TWO_HAND_RULES } from "./two-hand";

const press = (code: string) => ({
  code,
  key: "",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
});

describe("「두 손」 = 실물 핑거 트릭을 옮긴 배치", () => {
  const keymap = presetKeymap("twoHand");

  it.each(TWO_HAND_RULES)("$move: $code", (r) => {
    // 표의 키가 실제 배치에서 그 수다
    expect(resolveAction(keymap, press(r.code))).toBe(r.move);
    // 실물에서 그 수를 하는 손으로 친다
    expect(handOf(r.code)).toBe(r.hand);
    // 손이 움직이는 쪽으로 줄을 고른다(위 줄은 숫자 줄·위 줄, 가운데 줄, 아래 줄)
    const row = keyRowOf(r.code);
    if (r.row === "up") expect(row).toBeLessThanOrEqual(2);
    else if (r.row === "home") expect(row).toBe(3);
    else expect(row).toBe(4);
  });

  it("위·아래 짝은 같은 손에서 위 줄이 올리는 쪽", () => {
    const at = (m: string) =>
      TWO_HAND_RULES.find((r) => r.move === m) as (typeof TWO_HAND_RULES)[0];
    for (const [up, down] of [
      ["R", "R'"],
      ["L'", "L"],
      ["Rw", "Rw'"],
      ["Lw'", "Lw"],
      ["x", "x'"],
      ["M", "M'"],
    ] as const) {
      expect(at(up).hand).toBe(at(down).hand);
      expect(keyRowOf(at(up).code)).toBeLessThan(keyRowOf(at(down).code));
    }
  });

  it("시계·반시계 짝(U·F·D·y·z)은 두 손으로 나뉜다", () => {
    const at = (m: string) => TWO_HAND_RULES.find((r) => r.move === m);
    for (const [a, b] of [
      ["U", "U'"],
      ["F", "F'"],
      ["D", "D'"],
      ["y", "y'"],
      ["z", "z'"],
    ])
      expect(at(a as string)?.hand).not.toBe(at(b as string)?.hand);
  });
});
