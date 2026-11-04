import { describe, expect, test } from "vitest";

import {
  addMyPattern,
  loadMyPatterns,
  MY_PATTERNS_KEY,
  readPatternAlg,
  removeMyPattern,
  saveMyPatterns,
} from "./mine";

function memory(): Pick<Storage, "getItem" | "setItem"> {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
}

describe("내 패턴", () => {
  test("넣고 저장하고 다시 읽는다", () => {
    const s = memory();
    let list = addMyPattern([], { size: 3, name: " 내 꽃 ", alg: "R U" }, "a");
    list = addMyPattern(list, { size: 3, name: "", alg: "F2" }, "b");
    saveMyPatterns(list, s);
    expect(loadMyPatterns(s)).toEqual([
      { id: "b", size: 3, name: "내 패턴", alg: "F2" },
      { id: "a", size: 3, name: "내 꽃", alg: "R U" },
    ]);
    expect(removeMyPattern(list, "a").map((p) => p.id)).toEqual(["b"]);
  });

  test("같은 크기·같은 공식은 이름만 바꾼다", () => {
    const list = addMyPattern([], { size: 3, name: "하나", alg: "R U" }, "a");
    const next = addMyPattern(list, { size: 3, name: "둘", alg: "R U" }, "b");
    expect(next).toEqual([{ id: "a", size: 3, name: "둘", alg: "R U" }]);
    const other = addMyPattern(list, { size: 4, name: "넷", alg: "R U" }, "c");
    expect(other).toHaveLength(2);
  });

  test("깨진 저장값은 버린다", () => {
    const s = memory();
    s.setItem(MY_PATTERNS_KEY, "{oops");
    expect(loadMyPatterns(s)).toEqual([]);
    s.setItem(
      MY_PATTERNS_KEY,
      JSON.stringify([{ id: 1 }, { id: "x", size: 9, name: "a", alg: "R" }]),
    );
    expect(loadMyPatterns(s)).toEqual([]);
    expect(loadMyPatterns(null)).toEqual([]);
  });

  test("공식 읽기: 다듬고, 틀린 곳을 알려 준다", () => {
    expect(readPatternAlg(3, "  r U2   R' ")).toEqual({
      ok: true,
      alg: "Rw U2 R'",
      count: 3,
    });
    expect(readPatternAlg(3, "")).toMatchObject({ ok: false });
    const bad = readPatternAlg(3, "R Q");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toContain("Q");
    // 짝수 크기에는 가운데 층 M이 없다
    expect(readPatternAlg(4, "M2").ok).toBe(false);
  });
});
