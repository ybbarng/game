import { describe, expect, it } from "vitest";

import { myTier } from "../tiers/rank";
import {
  anonymousName,
  loadMiniProfile,
  PROFILE_KEY,
  profileTierText,
} from "./profile";

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    map: m,
  };
}

describe("Cubie 프로필", () => {
  it("익명 이름은 네 자리 번호", () => {
    expect(anonymousName(0)).toBe("익명 큐버 #1000");
    expect(anonymousName(0.5)).toBe("익명 큐버 #5500");
    expect(anonymousName(0.99999)).toBe("익명 큐버 #9999");
  });

  it("처음 한 번 지은 이름을 남기고 다음부터 그대로 쓴다", () => {
    const s = memory();
    const first = loadMiniProfile(s, () => 0.25);
    expect(first).toEqual({
      name: "익명 큐버 #3250",
      photo: null,
      signedIn: false,
    });
    expect(loadMiniProfile(s, () => 0.9).name).toBe("익명 큐버 #3250");
  });

  it("망가진 값이면 새로 짓고, 저장소가 막혀도 이름은 있다", () => {
    expect(loadMiniProfile(memory({ [PROFILE_KEY]: "{" }), () => 0).name).toBe(
      "익명 큐버 #1000",
    );
    expect(
      loadMiniProfile(memory({ [PROFILE_KEY]: '{"name":" "}' }), () => 0).name,
    ).toBe("익명 큐버 #1000");
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadMiniProfile(blocked, () => 0).name).toBe("익명 큐버 #1000");
    expect(loadMiniProfile(null, () => 0).name).toBe("익명 큐버 #1000");
  });

  it("티어 글은 크기와 티어 이름, 없으면 기록 창과 같은 글", () => {
    expect(profileTierText(3, null)).toBe("3×3 5판 뒤에");
    const rec = (ms: number) => ({ ms, penalty: 0 as const });
    const mine = myTier(
      3,
      [1, 2, 3, 4, 5].map(() => rec(15_000)),
    );
    expect(mine).not.toBeNull();
    expect(profileTierText(3, mine)).toMatch(/^3×3 \S+/);
    expect(profileTierText(3, mine)).not.toContain("5판 뒤에");
  });
});
