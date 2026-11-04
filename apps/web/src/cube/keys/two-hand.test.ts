import { describe, expect, it } from "vitest";

import {
  KeyInterpreter,
  middleSliceName,
  notationToMove,
  presetKeymap,
  resolveAction,
} from "../input";
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

describe("「두 손」 보탬 키: Shift = 넓게, 숫자 = 몇째 층(2026-11-04)", () => {
  const keymap = presetKeymap("twoHand");
  const run = (n: number, ...keys: [string, boolean?][]) => {
    const it = new KeyInterpreter(n, keymap);
    let r: ReturnType<KeyInterpreter["handle"]> = null;
    for (const [code, shift] of keys)
      r = it.handle({ ...press(code), shiftKey: shift ?? false });
    return r;
  };

  it.each([
    ["KeyI", "Rw"],
    ["KeyK", "Rw'"],
    ["KeyJ", "Uw"],
    ["KeyF", "Uw'"],
    ["KeyH", "Fw"],
    ["KeyD", "Lw"],
  ])("Shift+%s = %s(모든 크기)", (code, wide) => {
    for (const n of [3, 4, 5])
      expect(run(n, [code, true])).toMatchObject({
        kind: "move",
        notation: wide,
      });
    // Alt는 쓰지 않는다(브라우저 단축키와 부딪친다)
    expect(resolveAction(keymap, { ...press(code), altKey: true })).toBeNull();
  });

  it.each([
    ["KeyJ", "2U", "E'"],
    ["KeyF", "2U'", "E"],
    ["KeyS", "2D", "E"],
    ["KeyH", "2F", "S"],
    ["KeyW", "2B", "S'"],
    ["KeyI", "2R", "M'"],
    ["KeyD", "2L", "M"],
  ])("3×3의 2 → %s = %s = %s", (code, layer, slice) => {
    // 엔진에서 같은 돌리기다
    expect(notationToMove(3, layer)).toEqual(notationToMove(3, slice));
    expect(middleSliceName(3, layer)).toBe(slice);
    // 해석기는 받아들이고 보통 이름으로 적는다
    expect(run(3, ["Digit2"], [code])).toMatchObject({
      kind: "move",
      notation: slice,
    });
  });

  it("5×5: 3 → J = E', 4×4: 2 → I = 2R, 숫자 → Shift = 그 층까지 넓게", () => {
    expect(notationToMove(5, "3U")).toEqual(notationToMove(5, "E'"));
    expect(run(5, ["Digit3"], ["KeyJ"])).toMatchObject({ notation: "E'" });
    expect(middleSliceName(5, "3F2")).toBe("S2");
    expect(run(4, ["Digit2"], ["KeyI"])).toMatchObject({ notation: "2R" });
    expect(run(4, ["Digit3"], ["KeyI", true])).toMatchObject({
      notation: "3Rw",
    });
    expect(run(5, ["Digit4"], ["KeyI", true])).toMatchObject({
      notation: "4Rw",
    });
    expect(middleSliceName(4, "2U")).toBeNull();
    expect(middleSliceName(5, "2U")).toBeNull();
  });

  it("숫자는 1~n층을 다 받고, 가장 짧은 이름으로 적는다", () => {
    expect(run(3, ["Digit3"], ["KeyI"])).toMatchObject({ notation: "L'" });
    expect(run(4, ["Digit3"], ["KeyI"])).toMatchObject({ notation: "2L'" });
    expect(run(4, ["Digit4"], ["KeyI"])).toMatchObject({ notation: "L'" });
    expect(run(3, ["Digit3"], ["KeyI", true])).toMatchObject({
      notation: "x",
    });
    expect(run(4, ["Digit4"], ["KeyI", true])).toMatchObject({
      notation: "x",
    });
  });
});
