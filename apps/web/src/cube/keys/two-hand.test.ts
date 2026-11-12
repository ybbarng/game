import { describe, expect, it } from "vitest";

import {
  chordsFor,
  KeyInterpreter,
  presetKeymap,
  resolveAction,
} from "../input";
import { canonicalNotation } from "../input/actions";
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
    // 표의 키가 실제 배치에서(3×3) 그 수다. 3×3 이름(M' 등)으로 본다
    const action = resolveAction(keymap, press(r.code)) ?? "";
    expect(canonicalNotation(3, action)).toBe(r.move);
    // 실물에서 그 수를 하는 손으로 친다
    expect(handOf(r.code)).toBe(r.hand);
    // 손이 움직이는 쪽으로 줄을 고른다(위 줄은 숫자 줄·위 줄, 가운데 줄, 아래 줄)
    const row = keyRowOf(r.code);
    if (r.row === "up") expect(row).toBeLessThanOrEqual(2);
    else if (r.row === "home") expect(row).toBe(3);
    else expect(row).toBe(4);
  });

  it("위·아래 짝은 같은 손에서 위 줄이 앞면을 올리는 쪽", () => {
    const at = (m: string) =>
      TWO_HAND_RULES.find((r) => r.move === m) as (typeof TWO_HAND_RULES)[0];
    for (const [up, down] of [
      ["R", "R'"],
      ["L'", "L"],
      ["Rw", "Rw'"],
      ["Lw'", "Lw"],
      ["x", "x'"],
      ["M'", "M"],
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

describe("「두 손」 = csTimer 글자 키 + 숫자 깊이 + Shift 같이 돌리기(2026-11-12)", () => {
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
  ])("Shift+%s = %s(바깥 두 층 함께), Alt는 쓰지 않는다", (code, wide) => {
    for (const n of [3, 4, 5])
      expect(run(n, [code, true])).toMatchObject({ notation: wide });
    expect(resolveAction(keymap, { ...press(code), altKey: true })).toBeNull();
  });

  it("숫자 2~7은 깊이, 층 수 키는 없다", () => {
    for (let d = 2; d <= 7; d++) {
      expect(resolveAction(keymap, press(`Digit${d}`))).toBe(`depth:${d}`);
      // Shift를 누른 채로 쳐도 같은 깊이(Shift+3은 자판 글자로는 #)
      expect(
        resolveAction(keymap, { ...press(`Digit${d}`), shiftKey: true }),
      ).toBe(`depth:${d}`);
    }
    for (const a of ["layers:L+", "layers:L-", "layers:R+", "layers:R-"])
      expect(chordsFor(keymap, a)).toHaveLength(0);
    for (const code of ["Digit1", "Digit8", "Digit9", "Digit0"])
      expect(resolveAction(keymap, press(code))).toBeNull();
  });

  it("숫자 n + 면 키 = 그 면의 n번째 층 하나, 다음 수에는 남지 않는다", () => {
    expect(run(5, ["Digit3"], ["KeyI"])).toMatchObject({ notation: "M'" });
    expect(run(7, ["Digit3"], ["KeyI"])).toMatchObject({ notation: "3R" });
    expect(run(7, ["Digit3"], ["KeyK"])).toMatchObject({ notation: "3R'" });
    expect(run(4, ["Digit2"], ["KeyJ"])).toMatchObject({ notation: "2U" });
    // 한 번만: 그다음 I는 그냥 R
    expect(run(7, ["Digit3"], ["KeyI"], ["KeyI"])).toMatchObject({
      notation: "R",
    });
  });

  it("3×3: 2 + 면 키 = 가운데 층(M·E·S), T·B·.·X도 M'·M", () => {
    expect(run(3, ["Digit2"], ["KeyI"])).toMatchObject({ notation: "M'" });
    expect(run(3, ["Digit2"], ["KeyD"])).toMatchObject({ notation: "M" });
    expect(run(3, ["Digit2"], ["KeyJ"])).toMatchObject({ notation: "E'" });
    expect(run(3, ["Digit2"], ["KeyS"])).toMatchObject({ notation: "E" });
    expect(run(3, ["Digit2"], ["KeyH"])).toMatchObject({ notation: "S" });
    expect(run(3, ["Digit2"], ["KeyW"])).toMatchObject({ notation: "S'" });
    expect(run(3, ["KeyT"])).toMatchObject({ notation: "M'" });
    expect(run(3, ["KeyB"])).toMatchObject({ notation: "M" });
    expect(run(3, ["Period"])).toMatchObject({ notation: "M'" });
    expect(run(3, ["KeyX"])).toMatchObject({ notation: "M'" });
    // x·x'은 Y·N
    expect(run(3, ["KeyY"])).toMatchObject({ notation: "x" });
    expect(run(3, ["KeyN"])).toMatchObject({ notation: "x'" });
  });

  it("숫자 n + Shift + 면 키 = 바깥 n층 함께(7×7 바깥 세 층 = 3 → Shift+I)", () => {
    expect(run(7, ["Digit3"], ["KeyI", true])).toMatchObject({
      notation: "3Rw",
    });
    expect(run(7, ["Digit3"], ["KeyK", true])).toMatchObject({
      notation: "3Rw'",
    });
    // Shift를 먼저 누른 채 숫자 → 면 키
    expect(run(7, ["Digit3", true], ["KeyI", true])).toMatchObject({
      notation: "3Rw",
    });
    // 넓게 글자 키도 같다(3 → U = 3Rw)
    expect(run(7, ["Digit3"], ["KeyU"])).toMatchObject({ notation: "3Rw" });
    // 2 + Shift + 면 키는 Shift + 면 키 하나와 같다(바깥 두 층)
    expect(run(7, ["Digit2"], ["KeyK", true])).toMatchObject({
      notation: "Rw'",
    });
    // 큐브 전체가 되면 x(3×3의 3 → Shift+I)
    expect(run(3, ["Digit3"], ["KeyI", true])).toMatchObject({
      notation: "x",
    });
    // 모든 면에서: 5×5 3Uw
    expect(run(5, ["Digit3"], ["KeyJ", true])).toMatchObject({
      notation: "3Uw",
    });
  });

  it("T·B는 정가운데 층, 짝수 크기에서는 키를 먹지 않는다. .·X는 늘 둘째 층 하나", () => {
    expect(run(7, ["KeyB"])).toMatchObject({ notation: "M" });
    expect(run(4, ["KeyT"])).toBeNull();
    expect(run(4, ["Period"])).toMatchObject({ notation: "2R" });
    expect(run(4, ["KeyX"])).toMatchObject({ notation: "2L'" });
  });

  it("명령은 기억한 깊이를 버린다", () => {
    expect(run(4, ["Digit3"], ["Escape"], ["KeyI"])).toMatchObject({
      notation: "R",
    });
    // 2×2에는 깊이가 없다
    expect(run(2, ["Digit2"])).toBeNull();
  });
});
