import { describe, expect, it } from "vitest";

import {
  chordsFor,
  KeyInterpreter,
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

describe("「두 손」 = csTimer 자리 + Shift 넓게(2026-11-04)", () => {
  const keymap = presetKeymap("twoHand");
  const run = (n: number, ...keys: [string, boolean?][]) => {
    const it = new KeyInterpreter(n, keymap);
    let r: ReturnType<KeyInterpreter["handle"]> = null;
    for (const [code, shift] of keys)
      r = it.handle({ ...press(code), shiftKey: shift ?? false });
    return r;
  };

  it.each([
    ["Digit1", "S'"],
    ["Digit2", "E"],
    ["Digit9", "E'"],
    ["Digit0", "S"],
  ])("csTimer 숫자 키 %s = %s(3×3)", (code, move) => {
    expect(resolveAction(keymap, press(code))).toBe(move);
    expect(run(3, [code])).toMatchObject({ kind: "move", notation: move });
  });

  it.each([
    ["KeyI", "Rw"],
    ["KeyK", "Rw'"],
    ["KeyJ", "Uw"],
    ["KeyF", "Uw'"],
    ["KeyH", "Fw"],
    ["KeyD", "Lw"],
  ])("Shift+%s = %s, Alt는 쓰지 않는다", (code, wide) => {
    for (const n of [3, 4, 5])
      expect(run(n, [code, true])).toMatchObject({ notation: wide });
    expect(resolveAction(keymap, { ...press(code), altKey: true })).toBeNull();
  });

  it("깊이 숫자 키는 없다(csTimer에 없는 우리 방식은 거둠)", () => {
    for (let d = 2; d <= 7; d++)
      expect(chordsFor(keymap, `depth:${d}`)).toHaveLength(0);
  });

  it("층 수: 7·8은 오른손, 3·4는 왼손. R 키는 바깥 k층, Rw·Shift는 k+1층", () => {
    // 4×4: 7 한 번 → 오른손 2층. R = Rw, Rw = 3Rw, Shift+I = 3Rw
    expect(run(4, ["Digit7"])).toMatchObject({ kind: "layers", right: 2 });
    expect(run(4, ["Digit7"], ["KeyI"])).toMatchObject({ notation: "Rw" });
    expect(run(4, ["Digit7"], ["KeyU"])).toMatchObject({ notation: "3Rw" });
    expect(run(4, ["Digit7"], ["KeyI", true])).toMatchObject({
      notation: "3Rw",
    });
    // 층 수는 유지된다(다음 수에도)
    expect(run(4, ["Digit7"], ["KeyI"], ["KeyK"])).toMatchObject({
      notation: "Rw'",
    });
    // 8로 되돌림, 1 아래로는 안 내려간다
    expect(run(4, ["Digit7"], ["Digit8"], ["Digit8"], ["KeyI"])).toMatchObject({
      notation: "R",
    });
    // 왼손: 4 한 번 → L = Lw. 오른손은 그대로
    expect(run(5, ["Digit4"], ["KeyD"])).toMatchObject({ notation: "Lw" });
    expect(run(5, ["Digit4"], ["KeyI"])).toMatchObject({ notation: "R" });
    // 넓게가 큐브 전체가 되면 x로 적는다(4×4 오른손 3층 + Rw = 4층)
    expect(run(4, ["Digit7"], ["Digit7"], ["Digit7"], ["KeyU"])).toMatchObject({
      notation: "x",
    });
    // 다른 면은 층 수를 따르지 않는다
    expect(run(4, ["Digit7"], ["KeyJ"])).toMatchObject({ notation: "U" });
  });

  it("층 수는 섞기·맞춘 상태로 때 1로, Space로는 되돌리지 않는다", () => {
    expect(run(4, ["Digit7"], ["Space"], ["KeyI"])).toMatchObject({
      notation: "Rw",
    });
    expect(run(4, ["Digit7"], ["Escape"], ["KeyI"])).toMatchObject({
      notation: "R",
    });
    expect(run(4, ["Digit7"], ["Enter"], ["KeyI"])).toMatchObject({
      notation: "R",
    });
    // 3×3에는 층 수 키가 없다
    expect(run(3, ["Digit7"])).toBeNull();
  });
});
