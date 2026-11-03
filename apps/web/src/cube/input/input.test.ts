import { describe, expect, it } from "vitest";

import {
  actionsFor,
  isAvailable,
  isKnownAction,
  notationToMove,
  withDepth,
} from "./actions";
import { KeyInterpreter } from "./interpreter";
import {
  bind,
  findConflicts,
  type KeyInput,
  notationKeymap,
  resolveAction,
  twoHandKeymap,
} from "./keymaps";
import { exportKeymap, importKeymap, loadKeymap, saveKeymap } from "./storage";

const press = (
  code: string,
  mods: Partial<Omit<KeyInput, "code">> = {},
): KeyInput => ({
  code,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  ...mods,
});

describe("표기 → 수", () => {
  it("계약의 기본 수", () => {
    expect(notationToMove(3, "R")).toEqual({
      axis: "x",
      from: 1,
      to: 1,
      turns: 1,
    });
    expect(notationToMove(3, "L")).toEqual({
      axis: "x",
      from: 3,
      to: 3,
      turns: 3,
    });
    expect(notationToMove(3, "U")).toEqual({
      axis: "y",
      from: 1,
      to: 1,
      turns: 1,
    });
    expect(notationToMove(3, "D")).toEqual({
      axis: "y",
      from: 3,
      to: 3,
      turns: 3,
    });
    expect(notationToMove(3, "F")).toEqual({
      axis: "z",
      from: 1,
      to: 1,
      turns: 1,
    });
    expect(notationToMove(3, "B")).toEqual({
      axis: "z",
      from: 3,
      to: 3,
      turns: 3,
    });
    expect(notationToMove(3, "x")).toEqual({
      axis: "x",
      from: 1,
      to: 3,
      turns: 1,
    });
  });

  it("반대·두 번, 넓게·안쪽 층", () => {
    expect(notationToMove(3, "R'")?.turns).toBe(3);
    expect(notationToMove(3, "L'")?.turns).toBe(1);
    expect(notationToMove(3, "B2")?.turns).toBe(2);
    expect(notationToMove(4, "Rw")).toEqual({
      axis: "x",
      from: 1,
      to: 2,
      turns: 1,
    });
    expect(notationToMove(4, "r")).toEqual(notationToMove(4, "Rw"));
    expect(notationToMove(5, "3Lw'")).toEqual({
      axis: "x",
      from: 3,
      to: 5,
      turns: 1,
    });
    expect(notationToMove(4, "2R")).toEqual({
      axis: "x",
      from: 2,
      to: 2,
      turns: 1,
    });
    expect(notationToMove(4, "2D")).toEqual({
      axis: "y",
      from: 3,
      to: 3,
      turns: 3,
    });
    expect(notationToMove(7, "z'")).toEqual({
      axis: "z",
      from: 1,
      to: 7,
      turns: 3,
    });
  });

  it("가운데 층은 홀수 크기만, M은 L 방향·E는 D 방향·S는 F 방향", () => {
    expect(notationToMove(3, "M")).toEqual({
      axis: "x",
      from: 2,
      to: 2,
      turns: 3,
    });
    expect(notationToMove(3, "E")).toEqual({
      axis: "y",
      from: 2,
      to: 2,
      turns: 3,
    });
    expect(notationToMove(3, "S")).toEqual({
      axis: "z",
      from: 2,
      to: 2,
      turns: 1,
    });
    expect(notationToMove(5, "M'")).toEqual({
      axis: "x",
      from: 3,
      to: 3,
      turns: 1,
    });
    expect(notationToMove(4, "M")).toBeNull();
    expect(notationToMove(2, "M")).toBeNull();
  });

  it("뜻이 없는 표기", () => {
    expect(notationToMove(3, "4R")).toBeNull();
    expect(notationToMove(3, "1R")).toBeNull();
    expect(notationToMove(3, "Q")).toBeNull();
    expect(notationToMove(3, "R3")).toBeNull();
  });

  it("다음 수 깊이를 붙인다", () => {
    expect(withDepth("R'", 3)).toBe("3R'");
    expect(withDepth("Rw2", 3)).toBe("3Rw2");
    expect(withDepth("r", 3)).toBe("3Rw");
    expect(withDepth("x", 3)).toBe("x");
    expect(withDepth("M", 3)).toBe("M");
  });
});

describe("크기별 동작 목록", () => {
  const ids = (n: number) => new Set(actionsFor(n).map((a) => a.id));

  it("2×2: 면·큐브 돌리기·명령만", () => {
    const s = ids(2);
    expect(s.has("R")).toBe(true);
    expect(s.has("y'")).toBe(true);
    expect(s.has("undo")).toBe(true);
    expect(s.has("Rw")).toBe(false);
    expect(s.has("M")).toBe(false);
    expect(s.has("depth:2")).toBe(false);
  });

  it("3×3: 넓게·가운데 층, 깊이 고르기는 없다", () => {
    const s = ids(3);
    expect(s.has("Rw'")).toBe(true);
    expect(s.has("M2")).toBe(true);
    expect(s.has("2R")).toBe(false);
    expect(s.has("depth:2")).toBe(false);
  });

  it("4×4: 안쪽 층·깊이 고르기, 가운데 층은 없다", () => {
    const s = ids(4);
    expect(s.has("2R")).toBe(true);
    expect(s.has("3R")).toBe(false);
    expect(s.has("depth:3")).toBe(true);
    expect(s.has("depth:4")).toBe(false);
    expect(s.has("M")).toBe(false);
  });

  it("7×7: 가운데까지 안쪽 층, 깊이 6까지", () => {
    const s = ids(7);
    expect(s.has("4R")).toBe(true);
    expect(s.has("4Rw")).toBe(true);
    expect(s.has("5R")).toBe(false);
    expect(s.has("depth:6")).toBe(true);
    expect(s.has("M")).toBe(true);
  });

  it("목록의 모든 수는 그 크기에서 수로 바뀐다", () => {
    for (let n = 2; n <= 7; n++)
      for (const a of actionsFor(n)) {
        expect(isAvailable(n, a.id), `${n} ${a.id}`).toBe(true);
        if (["face", "wide", "inner", "slice", "rotate"].includes(a.group))
          expect(notationToMove(n, a.id), `${n} ${a.id}`).not.toBeNull();
      }
  });
});

describe("키 배치", () => {
  it("기본 묶음에는 겹치는 키가 없다", () => {
    expect(findConflicts(twoHandKeymap())).toEqual([]);
    expect(findConflicts(notationKeymap())).toEqual([]);
  });

  it("두 손 배치에는 모든 면의 시계·반시계와 x y z가 있다", () => {
    const actions = new Set(twoHandKeymap().bindings.map((b) => b.action));
    for (const f of ["R", "L", "U", "D", "F", "B"]) {
      expect(actions.has(f)).toBe(true);
      expect(actions.has(`${f}'`)).toBe(true);
    }
    for (const r of ["x", "x'", "y", "y'", "z", "z'"])
      expect(actions.has(r)).toBe(true);
  });

  it("겹치는 키를 찾는다", () => {
    const km = twoHandKeymap();
    km.bindings.push({ code: "KeyI", action: "L" });
    expect(findConflicts(km)).toEqual([{ chord: "KeyI", actions: ["R", "L"] }]);
  });

  it("bind는 그 키의 옛 동작을 빼고 사용자 배치가 된다", () => {
    const km = bind(twoHandKeymap(), { code: "KeyI" }, "L");
    expect(km.preset).toBe("custom");
    expect(findConflicts(km)).toEqual([]);
    expect(resolveAction(km, press("KeyI"))).toBe("L");
  });

  it("조합 키는 정확히 맞아야 하고, 되풀이 누름·⌘ 조합은 무시한다", () => {
    const km = notationKeymap();
    expect(resolveAction(km, press("KeyR"))).toBe("R");
    expect(resolveAction(km, press("KeyR", { shiftKey: true }))).toBe("R'");
    expect(resolveAction(km, press("KeyR", { altKey: true }))).toBe("Rw");
    expect(
      resolveAction(km, press("KeyR", { altKey: true, shiftKey: true })),
    ).toBe("Rw'");
    expect(resolveAction(km, press("KeyR", { repeat: true }))).toBeNull();
    expect(resolveAction(km, press("KeyR", { metaKey: true }))).toBeNull();
    expect(resolveAction(km, press("KeyZ", { ctrlKey: true }))).toBe("undo");
  });

  it("맥의 ⌘Z만 Ctrl+Z처럼 되돌리기로 받는다", () => {
    const km = twoHandKeymap();
    expect(resolveAction(km, press("KeyZ", { metaKey: true }))).toBe("undo");
    expect(
      resolveAction(km, press("KeyZ", { metaKey: true, shiftKey: true })),
    ).toBeNull();
    expect(
      resolveAction(km, press("KeyZ", { metaKey: true, repeat: true })),
    ).toBeNull();
    // Ctrl+Z에 되돌리기가 아닌 동작을 놓았으면 ⌘Z는 브라우저에 맡긴다
    const other = bind(km, { code: "KeyZ", ctrl: true }, "x2");
    expect(resolveAction(other, press("KeyZ", { metaKey: true }))).toBeNull();
  });
});

describe("키 → 동작 → 수", () => {
  it("두 손: I는 R, K는 R', ;는 y", () => {
    const it3 = new KeyInterpreter(3, twoHandKeymap());
    expect(it3.handle(press("KeyI"))).toMatchObject({
      kind: "move",
      notation: "R",
      move: { axis: "x", from: 1, to: 1, turns: 1 },
    });
    expect(it3.handle(press("KeyK"))).toMatchObject({ notation: "R'" });
    expect(it3.handle(press("Semicolon"))).toMatchObject({
      notation: "y",
      move: { axis: "y", from: 1, to: 3, turns: 1 },
    });
    expect(it3.handle(press("Backspace"))).toMatchObject({
      kind: "command",
      command: "undo",
    });
  });

  it("쓸 수 없는 크기의 동작은 키를 먹지 않는다", () => {
    expect(
      new KeyInterpreter(4, twoHandKeymap()).handle(press("Digit5")),
    ).toBeNull();
    expect(
      new KeyInterpreter(3, twoHandKeymap()).handle(
        press("KeyI", { shiftKey: true }),
      ),
    ).toBeNull();
    expect(
      new KeyInterpreter(4, twoHandKeymap()).handle(
        press("KeyI", { shiftKey: true }),
      ),
    ).toMatchObject({ notation: "2R" });
  });

  it("표기: 숫자로 다음 수 깊이를 고르고, 한 수에만 붙는다", () => {
    const it5 = new KeyInterpreter(5, notationKeymap());
    expect(it5.handle(press("Digit3"))).toMatchObject({
      kind: "depth",
      depth: 3,
    });
    expect(it5.pendingDepth).toBe(3);
    expect(it5.handle(press("KeyR", { altKey: true }))).toMatchObject({
      notation: "3Rw",
      move: { axis: "x", from: 1, to: 3, turns: 1 },
    });
    expect(it5.pendingDepth).toBeNull();
    expect(it5.handle(press("KeyR"))).toMatchObject({ notation: "R" });
    it5.handle(press("Digit2"));
    expect(it5.handle(press("KeyL", { shiftKey: true }))).toMatchObject({
      notation: "2L'",
      move: { axis: "x", from: 4, to: 4, turns: 1 },
    });
  });

  it("3×3에서는 깊이 고르기 키가 없다", () => {
    expect(
      new KeyInterpreter(3, notationKeymap()).handle(press("Digit2")),
    ).toBeNull();
  });
});

describe("저장·내보내기·가져오기", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };

  it("사용자 배치를 저장했다 읽는다", () => {
    const s = memory();
    const km = bind(notationKeymap(), { code: "KeyQ", ctrl: true }, "x2");
    expect(saveKeymap(km, s)).toBe(true);
    expect(loadKeymap(s)).toEqual(km);
  });

  it("저장소가 없거나 깨졌으면 두 손", () => {
    expect(loadKeymap(null).preset).toBe("twoHand");
    const broken = {
      getItem: () => {
        throw new Error("막힘");
      },
      setItem: () => {
        throw new Error("막힘");
      },
    };
    expect(loadKeymap(broken).preset).toBe("twoHand");
    expect(saveKeymap(twoHandKeymap(), broken)).toBe(false);
  });

  it("내보낸 글을 다시 가져온다", () => {
    const km = bind(twoHandKeymap(), { code: "KeyQ", alt: true }, "3Rw'");
    expect(importKeymap(exportKeymap(km))).toEqual({ ok: true, keymap: km });
  });

  it("마우스 돌리기는 사용자 배치에서만 받는다", () => {
    const preset = importKeymap(
      JSON.stringify({ version: 1, preset: "twoHand", mouseRotate: true }),
    );
    expect(preset).toMatchObject({ ok: true, keymap: { mouseRotate: false } });
    const custom = importKeymap(
      JSON.stringify({
        version: 1,
        preset: "custom",
        mouseRotate: true,
        bindings: [{ code: "KeyR", action: "R" }],
      }),
    );
    expect(custom).toMatchObject({ ok: true, keymap: { mouseRotate: true } });
  });

  it("모양이 틀린 글은 까닭과 함께 거절한다", () => {
    expect(importKeymap("{").ok).toBe(false);
    expect(importKeymap('{"version":2}').ok).toBe(false);
    const bad = importKeymap(
      JSON.stringify({
        version: 1,
        preset: "custom",
        mouseRotate: false,
        bindings: [{ code: "KeyR", action: "Q" }],
      }),
    );
    expect(bad).toEqual({ ok: false, error: "1번째 키의 동작(Q)을 모릅니다" });
    expect(isKnownAction("depth:9")).toBe(false);
    expect(isKnownAction("7Rw")).toBe(true);
  });
});
