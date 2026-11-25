import { describe, expect, it } from "vitest";

import {
  CURRENT_SIZE_KEY,
  loadCurrentSize,
  parseCurrentSize,
  saveCurrentSize,
  sizeFor,
} from "./current-size";

function memoryStorage(init: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(init));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

describe("지금 크기 저장", () => {
  it("아무것도 저장하지 않았으면 3×3이다", () => {
    expect(loadCurrentSize(memoryStorage())).toBe(3);
    expect(loadCurrentSize(null)).toBe(3);
  });

  it("저장한 크기를 그대로 읽는다", () => {
    const store = memoryStorage();
    expect(saveCurrentSize(6, store)).toBe(true);
    expect(store.map.get(CURRENT_SIZE_KEY)).toBe('{"v":1,"n":6}');
    expect(loadCurrentSize(store)).toBe(6);
  });

  it("2×2~7×7 밖의 크기는 저장하지 않고, 저장돼 있어도 3×3으로 읽는다", () => {
    const store = memoryStorage();
    expect(saveCurrentSize(8, store)).toBe(false);
    expect(saveCurrentSize(1, store)).toBe(false);
    expect(saveCurrentSize(3.5, store)).toBe(false);
    expect(store.map.has(CURRENT_SIZE_KEY)).toBe(false);
    expect(parseCurrentSize('{"n":9}')).toBeNull();
    expect(parseCurrentSize('{"n":"4"}')).toBeNull();
    expect(parseCurrentSize("망가진 글")).toBeNull();
    expect(
      loadCurrentSize(memoryStorage({ [CURRENT_SIZE_KEY]: '{"n":0}' })),
    ).toBe(3);
  });

  it("지금 크기가 없으면 옛 첫 화면 연출 크기(3이 아닌 값)를 한 번 옮겨 저장한다", () => {
    const store = memoryStorage({
      "cube.settings.v1": JSON.stringify({ heroSize: 5, sound: false }),
    });
    expect(loadCurrentSize(store)).toBe(5);
    expect(store.map.get(CURRENT_SIZE_KEY)).toBe('{"v":1,"n":5}');
  });

  it("옛 첫 화면 연출 크기가 3이거나 틀린 값이면 옮기지 않는다", () => {
    for (const heroSize of [3, 9, "4"]) {
      const store = memoryStorage({
        "cube.settings.v1": JSON.stringify({ heroSize }),
      });
      expect(loadCurrentSize(store)).toBe(3);
      expect(store.map.has(CURRENT_SIZE_KEY)).toBe(false);
    }
  });

  it("지금 크기를 이미 저장했으면 옛 첫 화면 연출 크기를 보지 않는다", () => {
    const store = memoryStorage({
      [CURRENT_SIZE_KEY]: '{"v":1,"n":2}',
      "cube.settings.v1": JSON.stringify({ heroSize: 6 }),
    });
    expect(loadCurrentSize(store)).toBe(2);
  });

  it("저장소를 못 읽으면 3×3으로 돈다", () => {
    const broken = {
      getItem: () => {
        throw new Error("막힘");
      },
      setItem: () => {
        throw new Error("막힘");
      },
    };
    expect(loadCurrentSize(broken)).toBe(3);
    expect(saveCurrentSize(4, broken)).toBe(false);
  });
});

describe("화면이 열 크기", () => {
  it("지금 크기가 그 화면에 있으면 그 크기로 연다", () => {
    expect(sizeFor([2, 3, 4, 5], 4)).toBe(4);
    expect(sizeFor([2, 3, 4, 5, 6, 7], 7)).toBe(7);
  });

  it("그 화면에 없는 크기면 3×3으로 연다", () => {
    expect(sizeFor([2, 3, 4, 5], 6)).toBe(3);
    expect(sizeFor([3, 2], 4)).toBe(3);
  });

  it("3×3도 없는 화면이면 그 화면의 첫 크기로 연다", () => {
    expect(sizeFor([4, 5, 6, 7], 2)).toBe(4);
  });
});
