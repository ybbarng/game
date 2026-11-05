import { describe, expect, it } from "vitest";

import {
  assignedText,
  assignKey,
  checkAssign,
  conflictQuestion,
  customFrom,
  keylessActions,
  keysOf,
} from "./keymap-editor";

describe("사용자 키: 겹치는 키를 지정하기 전에 묻는다", () => {
  const km = customFrom("twoHand");

  it("빈 키·같은 동작의 키는 묻지 않는다", () => {
    expect(checkAssign(km, "R", { code: "Backslash" })).toEqual({
      current: null,
      orphan: false,
    });
    expect(checkAssign(km, "R", { code: "KeyI" }).current).toBeNull();
  });

  it("다른 동작의 키면 그 동작과, 키가 하나도 남지 않는지 알린다", () => {
    // J는 U 하나뿐: 옮기면 U에 키가 없다
    expect(checkAssign(km, "R", { code: "KeyJ" })).toEqual({
      current: "U",
      orphan: true,
    });
    // x는 T·Y 두 키: T를 옮겨도 Y가 남는다
    expect(checkAssign(km, "R", { code: "KeyT" })).toEqual({
      current: "x",
      orphan: false,
    });
  });

  it("묻는 글과 알림 글(해요체, 둘 다에서 뺀 것처럼 읽히지 않게)", () => {
    expect(conflictQuestion("J", "U", "R")).toBe(
      "J 키는 지금 「U」 동작이에요. 「R」 동작으로 바꿀까요?",
    );
    // 바꾸면 키가 하나도 남지 않는 동작은 묻는 글에서 미리 알린다
    expect(conflictQuestion("J", "U", "R", true)).toBe(
      "J 키는 지금 「U」 동작이에요. 「R」 동작으로 바꿀까요? 바꾸면 「U」 동작에는 키가 없어요.",
    );
    expect(assignedText("J", "R", null)).toBe("J 키를 「R」 동작에 놓았어요.");
    expect(assignedText("J", "R", "U")).toContain(
      "「U」 동작에는 이제 키가 없어요",
    );
    expect(assignedText("T", "R", "x", ["Y"])).toContain(
      "「x」 동작은 남은 키(Y)로 쳐요",
    );
  });

  it("키를 옮겨 빠진 기본 동작을 찾는다(일부러 비운 깊이·층 수는 넣지 않는다)", () => {
    expect(keylessActions(km, 3)).toEqual([]);
    expect(keylessActions(km, 5)).toEqual([]);
    const moved = assignKey(km, "R", { code: "KeyJ" }).keymap;
    expect(keysOf(moved, "U")).toEqual([]);
    // U·U2는 칠 길이 없다(U'는 F가 남았고, U2는 U' 두 번으로 친다)
    expect(keylessActions(moved, 3)).toEqual(["U"]);
  });
});
