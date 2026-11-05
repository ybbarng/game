import { describe, expect, it } from "vitest";

import {
  COLOR_SCHEMES,
  DEFAULT_SETTINGS,
  effectiveRaceAlerts,
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
      caseAlert: true,
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
    // 옛 설정(상황 알림 칸 없음)은 꺼짐
    expect(s.caseAlert).toBe(false);
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

  it("첫 화면 큐브: 옛 저장값에 칸이 없으면 3×3·번갈아, 크기에 맞지 않는 해법은 번갈아", () => {
    const old = parseSettings(
      JSON.stringify({ version: 1, colorScheme: "standard", sound: false }),
    );
    expect(old.heroSize).toBe(3);
    expect(old.heroMethod).toBe("alternate");
    expect(old.sound).toBe(false);

    const ok = parseSettings(
      JSON.stringify({ heroSize: 2, heroMethod: "2-algs" }),
    );
    expect([ok.heroSize, ok.heroMethod]).toEqual([2, "2-algs"]);
    const mismatch = parseSettings(
      JSON.stringify({ heroSize: 4, heroMethod: "3-cfop" }),
    );
    expect([mismatch.heroSize, mismatch.heroMethod]).toEqual([4, "alternate"]);
    const bad = parseSettings(
      JSON.stringify({ heroSize: 7, heroMethod: "없는 해법" }),
    );
    expect([bad.heroSize, bad.heroMethod]).toEqual([3, "alternate"]);
  });

  it("수 흐름 띠: 옛 저장값·모르는 값은 켬, 고른 값은 그대로", () => {
    expect(parseSettings(JSON.stringify({ version: 1 })).flowStrip).toBe("on");
    expect(
      parseSettings(JSON.stringify({ flowStrip: "small" })).flowStrip,
    ).toBe("small");
    expect(parseSettings(JSON.stringify({ flowStrip: "off" })).flowStrip).toBe(
      "off",
    );
    expect(parseSettings(JSON.stringify({ flowStrip: 3 })).flowStrip).toBe(
      "on",
    );
  });

  it("대결 알림: 옛 저장값·모르는 값은 켬, 움직임 줄이기면 켬도 조용히", () => {
    expect(parseSettings(JSON.stringify({ version: 1 })).raceAlerts).toBe("on");
    expect(
      parseSettings(JSON.stringify({ raceAlerts: "quiet" })).raceAlerts,
    ).toBe("quiet");
    expect(parseSettings(JSON.stringify({ raceAlerts: "x" })).raceAlerts).toBe(
      "on",
    );
    expect(effectiveRaceAlerts("on", true)).toBe("quiet");
    expect(effectiveRaceAlerts("on", false)).toBe("on");
    expect(effectiveRaceAlerts("off", true)).toBe("off");
  });

  it("손가락 자리: 새 칸 「모든 화면에서도」는 기본 끔, 옛 keyFingers(켬)는 이어 받지 않는다", () => {
    expect(parseSettings(null).keyFingersAll).toBe(false);
    expect(
      parseSettings(JSON.stringify({ keyFingers: true })).keyFingersAll,
    ).toBe(false);
    expect(
      parseSettings(JSON.stringify({ keyFingersAll: true })).keyFingersAll,
    ).toBe(true);
    expect(
      "keyFingers" in parseSettings(JSON.stringify({ keyFingers: true })),
    ).toBe(false);
  });

  it("뒷면 보기: 옛 저장값·모르는 값은 거울, 고른 값은 그대로", () => {
    expect(parseSettings(JSON.stringify({ version: 1 })).backView).toBe(
      "mirror",
    );
    expect(parseSettings(JSON.stringify({ backView: "net" })).backView).toBe(
      "net",
    );
    expect(parseSettings(JSON.stringify({ backView: "off" })).backView).toBe(
      "off",
    );
    expect(parseSettings(JSON.stringify({ backView: "유리" })).backView).toBe(
      "mirror",
    );
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
