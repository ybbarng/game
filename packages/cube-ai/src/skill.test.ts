import { describe, expect, it } from "vitest";
import {
  aboutTime,
  BOT_LEVELS,
  BOT_PLAN_VERSION,
  BOT_TARGET_MS,
  botSkillLabel,
  botSkillText,
  fitLevel,
  fitTargetMs,
  levelText,
  readBotSkill,
} from "./skill";

describe("컴퓨터 단계 글", () => {
  it("단계·맞춤은 버전을 붙여 보내고 그대로 읽힌다", () => {
    for (const level of BOT_LEVELS) {
      const text = levelText(level);
      expect(text).toBe(`${BOT_PLAN_VERSION}:${level}`);
      expect(readBotSkill(text)).toEqual({ kind: "level", level });
    }
    const fit = botSkillText({ kind: "fit", targetMs: 45_300 });
    expect(fit).toBe(`${BOT_PLAN_VERSION}:fit:45300`);
    expect(readBotSkill(fit)).toEqual({ kind: "fit", targetMs: 45_300 });
  });

  it("옛 값(버전 없음)은 옛 계획으로 읽고, 이름은 가까운 새 단계", () => {
    expect(readBotSkill("beginner")).toEqual({
      kind: "legacy",
      level: "beginner",
    });
    expect(botSkillLabel("beginner")).toBe("입문");
    expect(botSkillLabel("intermediate")).toBe("중수");
    expect(botSkillLabel("advanced")).toBe("초고수");
    expect(botSkillLabel("expert")).toBe("초고수");
  });

  it("다른 버전·모르는 모양은 읽지 않는다(계획을 맞춰 보지 않는다)", () => {
    for (const text of [
      `${BOT_PLAN_VERSION + 1}:pro`,
      "2:fast2",
      "2:fit:12",
      "2:fit:99999999",
      "novice",
      "",
      7,
      null,
    ])
      expect(readBotSkill(text)).toBeNull();
    expect(botSkillLabel("3:pro")).toBe("다른 버전");
  });
});

describe("내 실력에 맞춤", () => {
  it("기록이 없으면 초보 목표, 있으면 내 평균(100ms 단위)", () => {
    expect(fitTargetMs(3, null)).toBe(BOT_TARGET_MS[3]?.casual);
    expect(fitTargetMs(2, null)).toBe(BOT_TARGET_MS[2]?.casual);
    expect(fitTargetMs(3, 41_234)).toBe(41_200);
  });

  it("목표에 가장 가까운 단계를 고르고, 범위 밖은 끝으로 줄인다", () => {
    expect(fitLevel(3, 40_000)).toEqual({ level: "club", targetMs: 40_000 });
    expect(fitLevel(3, 13_000).level).toBe("pro");
    expect(fitLevel(3, 2_000)).toEqual({ level: "pro", targetMs: 7_000 });
    expect(fitLevel(3, 900_000)).toEqual({
      level: "novice",
      targetMs: 180_000,
    });
  });

  it("이름에 목표 시간이 붙는다", () => {
    expect(botSkillLabel("2:fit:45300", 3)).toBe("내 실력에 맞춤 약 45초");
    expect(aboutTime(60_000)).toBe("약 1분");
    expect(aboutTime(95_000)).toBe("약 1분 40초");
    expect(aboutTime(3_000)).toBe("약 3초");
  });
});
