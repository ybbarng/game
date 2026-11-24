import { beforeEach, describe, expect, it, vi } from "vitest";

/** 읽은 횟수를 세는 가짜 저장소(경계: zustand persist의 rehydrate만 흉내 낸다) */
function fakeStore() {
  const store = { reads: 0, persist: { rehydrate: () => void store.reads++ } };
  return store;
}

async function freshModule() {
  vi.resetModules();
  return import("./persist-hydration");
}

describe("hydrateAfterFirstPaint", () => {
  beforeEach(() => vi.resetModules());

  it("첫 그리기 전에 올린 저장소는 rehydrateStores가 부를 때 한 번 읽는다", async () => {
    const { hydrateAfterFirstPaint, rehydrateStores } = await freshModule();
    const a = hydrateAfterFirstPaint(fakeStore());
    const b = hydrateAfterFirstPaint(fakeStore());
    expect([a.reads, b.reads]).toEqual([0, 0]);
    await rehydrateStores();
    expect([a.reads, b.reads]).toEqual([1, 1]);
  });

  it("첫 그리기 뒤에 불러온 화면의 저장소는 올리는 순간 읽는다", async () => {
    const { hydrateAfterFirstPaint, rehydrateStores } = await freshModule();
    await rehydrateStores();
    const late = hydrateAfterFirstPaint(fakeStore());
    expect(late.reads).toBe(1);
  });
});
