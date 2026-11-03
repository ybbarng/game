import { describe, expect, it } from "vitest";

import { ALG_SETS, type AlgCase } from "../learn";
import { caseById } from "./check";
import { algLink, parseAlgLink } from "./link";
import {
  ALGS_KEY,
  type AlgBook,
  addMine,
  algsOf,
  commitAlgBook,
  exportAlgBook,
  importAlgBook,
  loadAlgBook,
  removeMine,
  saveAlgBook,
  setAsText,
  setUsed,
  unknownCaseIds,
  usedAlg,
  watchAlgBook,
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

  it("저장소에 쓰고 읽는다. 깨진 값은 버린다", () => {
    const st = memory();
    const r = addMine({}, SUNE, LEFT_SUNE_BACK);
    if (!r.ok) throw new Error();
    saveAlgBook(setUsed(r.book, SUNE, r.alg), st);
    expect(loadAlgBook(st)[SUNE.id]?.use).toBe(r.alg);

    st.data.set(ALGS_KEY, "{깨짐");
    expect(loadAlgBook(st)).toEqual({});
    st.data.set(
      ALGS_KEY,
      JSON.stringify({ "oll-27": { mine: [1] }, "oll-26": 3 }),
    );
    expect(loadAlgBook(st)).toEqual({ "oll-27": { mine: [] } });
    expect(loadAlgBook(null)).toEqual({});
  });

  it("자료에 없는 상황의 공식은 남겨 두고, 저장·내보내기에도 그대로 둔다", () => {
    const st = memory();
    st.data.set(
      ALGS_KEY,
      JSON.stringify({ "oll-old": { mine: ["R U R'"], use: "R U R'" } }),
    );
    const book = loadAlgBook(st);
    expect(unknownCaseIds(book)).toEqual(["oll-old"]);
    // 다른 상황을 바꿔 저장해도 지워지지 않는다
    const r = addMine(book, SUNE, LEFT_SUNE_BACK);
    if (!r.ok) throw new Error();
    commitAlgBook(book, r.book, st);
    const back = loadAlgBook(st);
    expect(back["oll-old"]).toEqual({ mine: ["R U R'"], use: "R U R'" });
    expect(JSON.parse(exportAlgBook(back)).cases["oll-old"]).toEqual({
      mine: ["R U R'"],
      use: "R U R'",
    });
    // 아무것도 남지 않은 모르는 상황은 세지 않는다
    expect(unknownCaseIds({ "oll-old": { mine: [] } })).toEqual([]);
  });
});

describe("두 탭에서 함께 쓰기", () => {
  const AA = byId("oll-26");
  const ANTI_BACK = "L' U' L U' L' U2 L";

  it("저장할 때 바꾼 상황만 덮어 써서 다른 탭이 바꾼 상황을 지우지 않는다", () => {
    const st = memory();
    // 두 탭이 같은 빈 상태에서 시작
    const tabA = loadAlgBook(st);
    const tabB = loadAlgBook(st);
    const a = addMine(tabA, SUNE, LEFT_SUNE_BACK);
    if (!a.ok) throw new Error();
    const savedA = commitAlgBook(tabA, a.book, st);
    expect(Object.keys(savedA)).toEqual([SUNE.id]);

    const b = addMine(tabB, AA, ANTI_BACK);
    if (!b.ok) throw new Error(b.message);
    const savedB = commitAlgBook(tabB, b.book, st);
    // 앞 탭이 넣은 수네 공식이 남아 있다
    expect(Object.keys(savedB).sort()).toEqual([AA.id, SUNE.id].sort());
    expect(loadAlgBook(st)).toEqual(savedB);

    // 같은 상황은 나중 저장이 이긴다(앞 탭이 지운 것을 뒤 탭이 다시 고르면 그 값)
    const removed = removeMine(savedA, SUNE, a.alg);
    commitAlgBook(savedA, removed, st);
    expect(loadAlgBook(st)[SUNE.id]?.mine).toEqual([]);
    expect(loadAlgBook(st)[AA.id]?.mine).toHaveLength(1);
  });

  it("다른 탭이 저장하면 다시 읽어 알려 준다", () => {
    const st = memory();
    const target = new EventTarget();
    const seen: AlgBook[] = [];
    const stop = watchAlgBook((b) => seen.push(b), target, st);
    const r = addMine({}, SUNE, LEFT_SUNE_BACK);
    if (!r.ok) throw new Error();
    saveAlgBook(r.book, st);
    const storageEvent = (key: string | null) =>
      Object.assign(new Event("storage"), { key });
    target.dispatchEvent(storageEvent("other.key"));
    expect(seen).toEqual([]);
    target.dispatchEvent(storageEvent(ALGS_KEY));
    expect(seen).toEqual([r.book]);
    stop();
    target.dispatchEvent(storageEvent(ALGS_KEY));
    expect(seen).toHaveLength(1);
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
