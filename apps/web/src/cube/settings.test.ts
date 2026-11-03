import { describe, expect, it } from "vitest";

import {
  COLOR_SCHEMES,
  DEFAULT_SETTINGS,
  loadSettings,
  parseSettings,
  SETTINGS_KEY,
  saveSettings,
  withFaceColor,
  withScheme,
} from "./settings";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

describe("큐브 설정 저장", () => {
  it("저장한 설정을 그대로 읽는다(왕복)", () => {
    const store = memoryStorage();
    const s = {
      ...withFaceColor(withScheme(DEFAULT_SETTINGS, "colorblind"), 2, 0x123456),
      moveMs: 150,
      quality: "low" as const,
      stickerless: true,
      hidden: "gray" as const,
      sound: false,
      inspection: false,
    };
    expect(saveSettings(s, store)).toBe(true);
    expect(loadSettings(store)).toEqual(s);
    expect(s.colorScheme).toBe("custom");
    expect(s.colors[2]).toBe(0x123456);
  });

  it("없거나 깨진 글은 기본값", () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    const store = memoryStorage();
    store.setItem(SETTINGS_KEY, "{깨짐");
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });

  it("틀린 칸만 기본값으로, 회전 시간은 0~200ms로 자른다", () => {
    const s = parseSettings(
      JSON.stringify({
        moveMs: 999,
        quality: "ultra",
        sound: "네",
        hidden: "gray",
      }),
    );
    expect(s.moveMs).toBe(200);
    expect(s.quality).toBe("high");
    expect(s.sound).toBe(true);
    expect(s.hidden).toBe("gray");
  });

  it("색 묶음을 고르면 그 묶음의 색, 직접 고른 색이 이상하면 표준", () => {
    expect(
      parseSettings(JSON.stringify({ colorScheme: "highContrast" })).colors,
    ).toEqual(COLOR_SCHEMES.highContrast);
    expect(
      parseSettings(JSON.stringify({ colorScheme: "custom", colors: [1, 2] }))
        .colors,
    ).toEqual(COLOR_SCHEMES.standard);
  });

  it("저장소가 막혀 있어도 오류 없이 기본값·false", () => {
    const broken = {
      getItem: () => {
        throw new Error("막힘");
      },
      setItem: () => {
        throw new Error("막힘");
      },
    };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, broken)).toBe(false);
  });
});
