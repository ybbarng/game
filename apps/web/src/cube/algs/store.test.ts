import { describe, expect, it } from "vitest";

import { ALG_SETS, type AlgCase } from "../learn";
import { caseById } from "./check";
import { algLink, parseAlgLink } from "./link";
import {
  ALGS_KEY,
  addMine,
  algsOf,
  exportAlgBook,
  importAlgBook,
  loadAlgBook,
  removeMine,
  saveAlgBook,
  setAsText,
  setUsed,
  usedAlg,
} from "./store";

const byId = (id: string): AlgCase => {
  const c = caseById(id);
  if (!c) throw new Error(id);
  return c;
};

function memory(): Pick<Storage, "getItem" | "setItem"> & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

const SUNE = byId("oll-27");
const LEFT_SUNE_BACK = "L U L' U L U2 L'";

describe("내 공식", () => {
  it("맞는 공식만 넣고, 앞 윗면 돌리기가 필요하면 붙여 넣는다", () => {
    const bad = addMine({}, SUNE, "R U R'");
    expect(bad.ok).toBe(false);
    expect(bad.book).toEqual({});

    const r = addMine({}, SUNE, LEFT_SUNE_BACK);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.alg).toMatch(/^U/);
    expect(algsOf(r.book, SUNE).map((x) => x.kind)).toEqual([
      ...SUNE.algs.map((_, i) => (i === 0 ? "main" : "alt")),
      "mine",
    ]);
    // 같은 것을 또 넣으면 그대로
    const again = addMine(r.book, SUNE, r.alg);
    expect(again.book).toBe(r.book);
    expect(again.message).toBe("이미 있음");
  });

  it("쓰는 공식: 고르지 않으면 대표, 지우면 대표로 돌아간다", () => {
    const r = addMine({}, SUNE, LEFT_SUNE_BACK);
    if (!r.ok) throw new Error();
    expect(usedAlg(r.book, SUNE)).toBe(SUNE.algs[0]);
    const chosen = setUsed(r.book, SUNE, r.alg);
    expect(usedAlg(chosen, SUNE)).toBe(r.alg);
    const removed = removeMine(chosen, SUNE, r.alg);
    expect(usedAlg(removed, SUNE)).toBe(SUNE.algs[0]);
    expect(setUsed(chosen, SUNE, SUNE.algs[0] as string)[SUNE.id]?.use).toBe(
      undefined,
    );
  });

  it("저장소에 쓰고 읽는다. 깨진 값·없는 상황은 버린다", () => {
    const st = memory();
    const r = addMine({}, SUNE, LEFT_SUNE_BACK);
    if (!r.ok) throw new Error();
    saveAlgBook(setUsed(r.book, SUNE, r.alg), st);
    expect(loadAlgBook(st)[SUNE.id]?.use).toBe(r.alg);

    st.data.set(ALGS_KEY, "{깨짐");
    expect(loadAlgBook(st)).toEqual({});
    st.data.set(
      ALGS_KEY,
      JSON.stringify({ "no-such": { mine: ["R"] }, "oll-27": { mine: [1] } }),
    );
    expect(loadAlgBook(st)).toEqual({ "oll-27": { mine: [] } });
    expect(loadAlgBook(null)).toEqual({});
  });
});

describe("내보내기·가져오기", () => {
  it("내보낸 것을 가져오면 같다", () => {
    const r = addMine({}, SUNE, LEFT_SUNE_BACK);
    if (!r.ok) throw new Error();
    const book = setUsed(r.book, SUNE, r.alg);
    const back = importAlgBook({}, exportAlgBook(book));
    expect(back.added).toBe(1);
    expect(back.rejected).toEqual([]);
    expect(usedAlg(back.book, SUNE)).toBe(r.alg);
  });

  it("가져올 때도 모두 검사한다", () => {
    const text = JSON.stringify({
      format: "cube-algs",
      version: 1,
      cases: {
        "oll-27": { mine: ["R U R'", LEFT_SUNE_BACK], use: "R U R'" },
        "pll-zz": { mine: ["R"] },
      },
    });
    const r = importAlgBook({}, text);
    expect(r.added).toBe(1);
    expect(r.rejected.map((x) => [x.caseId, x.message])).toEqual([
      ["oll-27", "F2L이 깨짐"],
      ["pll-zz", "없는 상황"],
    ]);
    // 떨어진 공식은 쓰는 공식으로 고르지 않는다
    expect(usedAlg(r.book, SUNE)).toBe(SUNE.algs[0]);
    expect(() => importAlgBook({}, "{")).toThrow("JSON을 읽지 못함");
    expect(() => importAlgBook({}, "[]")).toThrow("공식 파일이 아님");
  });
});

describe("복사·링크", () => {
  it("묶음 전체를 줄 목록으로", () => {
    const pll = ALG_SETS.find((s) => s.set === "pll");
    if (!pll) throw new Error();
    const lines = setAsText({}, pll).split("\n");
    expect(lines).toHaveLength(21);
    expect(lines[0]).toBe("Ua 퍼뮤: M2 U M U2 M' U M2");
  });

  it("링크에 상황과 공식을 싣고 다시 읽는다", () => {
    const url = algLink("oll-27", "R U R' U  R U2 R'", "https://game.byb.kr");
    expect(url).toBe(
      "https://game.byb.kr/cube/algs?case=oll-27&alg=R+U+R%27+U+R+U2+R%27",
    );
    expect(parseAlgLink(new URL(url).search)).toEqual({
      caseId: "oll-27",
      alg: "R U R' U R U2 R'",
    });
    expect(parseAlgLink("?case=oll-27")).toEqual({
      caseId: "oll-27",
      alg: null,
    });
    expect(parseAlgLink("?case=nope&alg=R")).toBeNull();
    expect(parseAlgLink("")).toBeNull();
  });
});
