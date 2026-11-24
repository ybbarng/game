import { describe, expect, it } from "vitest";

import { soloStarter } from "./solo-start";

/** 넘겨받은 새 판 선택지를 모으는 저장소 */
function recordingStore() {
  const calls: unknown[] = [];
  return {
    calls,
    store: { getState: () => ({ newGame: (o: unknown) => calls.push(o) }) },
  };
}

describe("혼자 하기 새 판 열기(soloStarter)", () => {
  const settings = { level: 2, size: 9, pick: "black" as const };
  const choose = (s: typeof settings) => ({
    rules: { size: s.size },
    pick: s.pick,
  });

  it("그때의 설정으로 규칙·편·컴퓨터 단계를 넘기고, 씨앗이 없으면 넣지 않는다", () => {
    const { calls, store } = recordingStore();
    soloStarter(store, { getState: () => settings }, choose)();
    expect(calls).toEqual([{ rules: { size: 9 }, pick: "black", level: 2 }]);
    expect(calls[0]).not.toHaveProperty("seed");
  });

  it("씨앗을 주면 그 씨앗으로 연다(0도 씨앗이다)", () => {
    const { calls, store } = recordingStore();
    soloStarter(store, { getState: () => settings }, choose)(0);
    expect(calls).toEqual([
      { rules: { size: 9 }, pick: "black", level: 2, seed: 0 },
    ]);
  });
});
