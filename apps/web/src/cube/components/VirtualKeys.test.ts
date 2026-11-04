// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  attachKeyboard,
  KeyInterpreter,
  type KeyResult,
  notationKeymap,
  twoHandKeymap,
} from "../input";
import { sendKey } from "./VirtualKeys";

/** 화면 키를 보내 해석기가 받은 결과를 모은다(혼자 맞추기·대결의 `CubePlay`와 같은 연결) */
function collect(keymap: ReturnType<typeof twoHandKeymap>) {
  const it = new KeyInterpreter(3, keymap);
  const got: KeyResult[] = [];
  const detach = attachKeyboard(
    window,
    () => it,
    (r) => got.push(r),
  );
  return { got, detach };
}

describe("화면 키보드", () => {
  it("진짜 키처럼 해석기에 닿는다: 「두 손」 I = R, Shift+I = Rw, K = R'", () => {
    const { got, detach } = collect(twoHandKeymap());
    sendKey("keydown", { code: "KeyI" });
    sendKey("keyup", { code: "KeyI" });
    sendKey("keydown", { code: "KeyI", shift: true });
    sendKey("keydown", { code: "KeyK" });
    detach();
    expect(got.map((r) => (r.kind === "move" ? r.notation : r.kind))).toEqual([
      "R",
      "Rw",
      "R'",
    ]);
  });

  it("「표기」 배치의 Alt 층(넓게)도 같다", () => {
    const { got, detach } = collect(notationKeymap());
    sendKey("keydown", { code: "KeyR", alt: true });
    sendKey("keydown", { code: "KeyR", alt: true, shift: true });
    detach();
    expect(got.map((r) => (r.kind === "move" ? r.notation : r.kind))).toEqual([
      "Rw",
      "Rw'",
    ]);
  });

  it("떼는 키는 조합 키도 뗀 상태로 보낸다(Shift를 누른 채로 남지 않게)", () => {
    const seen: boolean[] = [];
    const on = (e: KeyboardEvent) => seen.push(e.shiftKey);
    window.addEventListener("keyup", on);
    sendKey("keyup", { code: "KeyI", shift: true });
    window.removeEventListener("keyup", on);
    expect(seen).toEqual([false]);
  });
});
