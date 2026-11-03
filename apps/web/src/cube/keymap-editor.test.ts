import { describe, expect, it } from "vitest";

import { exportKeymap, findConflicts, importKeymap } from "./input";
import {
  assignKey,
  chordFromEvent,
  clearAction,
  customFrom,
  keysOf,
} from "./keymap-editor";

const ev = (
  code: string,
  mods: Partial<
    Record<"shiftKey" | "altKey" | "ctrlKey" | "metaKey", boolean>
  > = {},
) => ({
  code,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

describe("사용자 키 배치 편집", () => {
  it("조합 키만 누른 것과 ⌘ 조합은 키로 치지 않는다", () => {
    expect(chordFromEvent(ev("ShiftLeft", { shiftKey: true }))).toBeNull();
    expect(chordFromEvent(ev("KeyR", { metaKey: true }))).toBeNull();
    expect(
      chordFromEvent(ev("KeyR", { shiftKey: true, altKey: true })),
    ).toEqual({
      code: "KeyR",
      shift: true,
      alt: true,
    });
  });

  it("다른 동작이 쓰던 키를 지정하면 그 동작에서 빠지고 알려 준다(겹치지 않는다)", () => {
    const km = customFrom("twoHand");
    // 두 손 배치에서 I = R
    const r = assignKey(km, "U", { code: "KeyI" });
    expect(r.replaced).toBe("R");
    expect(keysOf(r.keymap, "R")).toEqual([]);
    expect(keysOf(r.keymap, "U").map((c) => c.code)).toContain("KeyI");
    expect(findConflicts(r.keymap)).toEqual([]);
    expect(r.keymap.preset).toBe("custom");
  });

  it("「이 키만」이면 그 동작의 다른 키를 지운다", () => {
    const km = customFrom("twoHand");
    const r = assignKey(km, "U", { code: "Quote" }, true);
    expect(keysOf(r.keymap, "U").map((c) => c.code)).toEqual(["Quote"]);
    expect(r.replaced).toBeNull();
  });

  it("동작 비우기, 내보내기·가져오기 왕복", () => {
    const km = clearAction(customFrom("notation"), "R");
    expect(keysOf(km, "R")).toEqual([]);
    const back = importKeymap(exportKeymap(km));
    expect(back.ok && back.keymap).toEqual(km);
  });
});
