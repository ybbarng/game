import { describe, expect, it } from "vitest";

import {
  addSession,
  addSolve,
  currentSession,
  emptyBook,
  exportBook,
  importBook,
  loadBook,
  readBook,
  removeSolve,
  type Solve,
  STORAGE_KEY,
  saveBook,
  setNote,
  setPenalty,
  solvesOf,
} from "./book";

/** localStorage 흉내(node 환경이라 jsdom 없이) */
class MemoryStorage {
  private map = new Map<string, string>();
  fail = false;
  getItem(k: string) {
    if (this.fail) throw new Error("막힘");
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw new Error("막힘");
    this.map.set(k, v);
  }
}

const asStorage = (m: MemoryStorage) => m as unknown as Storage;

function solve(id: string, at: number, extra: Partial<Solve> = {}): Solve {
  return {
    id,
    at,
    event: "333",
    session: "333-1",
    ms: 10_000,
    penalty: "none",
    scramble: "R U R' U'",
    official: false,
    ...extra,
  };
}

describe("기록장", () => {
  it("더하고, 벌점·메모를 고치고, 지운다", () => {
    let book = addSolve(emptyBook(), solve("a", 1));
    book = addSolve(book, solve("b", 2));
    book = setPenalty(book, "a", "+2");
    book = setNote(book, "b", "PLL 실수");
    expect(book.solves.map((s) => [s.id, s.penalty, s.note])).toEqual([
      ["a", "+2", undefined],
      ["b", "none", "PLL 실수"],
    ]);
    book = setNote(book, "b", " ");
    expect("note" in (book.solves[1] as Solve)).toBe(false);
    book = removeSolve(book, "a");
    expect(book.solves.map((s) => s.id)).toEqual(["b"]);
  });

  it("새 세션을 만들면 그 세션이 골라지고 기록이 나뉜다", () => {
    let book = addSolve(emptyBook(), solve("a", 1));
    book = addSession(book);
    const id = currentSession(book);
    expect(id).toBe("333-2");
    book = addSolve(book, solve("b", 2, { session: id }));
    expect(solvesOf(book, "333-1").map((s) => s.id)).toEqual(["a"]);
    expect(solvesOf(book, id).map((s) => s.id)).toEqual(["b"]);
    // 다른 종목은 제 기본 세션
    expect(currentSession(book, "222")).toBe("222-1");
  });
});

describe("저장", () => {
  it("저장했다 읽으면 같다", () => {
    const storage = new MemoryStorage();
    let book = addSolve(emptyBook(), solve("a", 1, { memoMs: 3000 }));
    book = setNote(book, "a", "메모");
    saveBook(book, asStorage(storage));
    expect(loadBook(asStorage(storage))).toEqual(book);
  });

  it("저장소가 막혀도 오류 없이 빈 기록장", () => {
    const storage = new MemoryStorage();
    storage.fail = true;
    expect(() => saveBook(emptyBook(), asStorage(storage))).not.toThrow();
    expect(loadBook(asStorage(storage))).toEqual(emptyBook());
  });

  it("깨진 값이나 다른 버전은 빈 기록장", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{깨짐");
    expect(loadBook(asStorage(storage))).toEqual(emptyBook());
    expect(readBook({ version: 2 })).toBeNull();
  });

  it("모양이 틀린 기록 줄은 버린다", () => {
    const book = readBook({
      version: 1,
      solves: [
        solve("a", 1),
        { id: "x", ms: "빠름" },
        solve("b", 2, { session: "없음" }),
      ],
    });
    expect(book?.solves.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("내보내기·가져오기", () => {
  it("내보낸 것을 빈 기록장에 가져오면 기록이 같다", () => {
    let book = addSolve(emptyBook(), solve("a", 1));
    book = addSession(book);
    book = addSolve(book, solve("b", 2, { session: "333-2", penalty: "DNF" }));
    const back = importBook(emptyBook(), exportBook(book));
    expect(back.solves).toEqual(book.solves);
    expect(back.sessions).toEqual(book.sessions);
  });

  it("두 번 가져와도 겹치지 않고, 시각 차례로 합친다", () => {
    const mine = addSolve(emptyBook(), solve("b", 2));
    const text = exportBook(addSolve(emptyBook(), solve("a", 1)));
    const once = importBook(mine, text);
    const twice = importBook(once, text);
    expect(twice.solves.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("다른 파일은 알기 쉬운 오류", () => {
    expect(() => importBook(emptyBook(), "아님")).toThrow("JSON");
    expect(() => importBook(emptyBook(), '{"version":1}')).toThrow(
      "큐브 타이머",
    );
  });
});
