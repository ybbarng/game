import { applyMoves, isSolved, parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { solveHuman } from "./methods";
import { BASE_MEAN_MS_V3, botPlan } from "./plan";
import { scrambledState } from "./scramble-test-util";
import {
  BOT_PLAN_VERSION,
  BOT_TARGET_MS,
  botSkillLabel,
  botSkillText,
  levelMethod,
  levelText,
  readBotSkill,
} from "./skill";
import { yauReduce } from "./yau";

/** 4×4 컴퓨터 야우(docs/47 10-4): 중수가 야우, 계획 표 4. 옛 표 3 글은 옛 계획(축소법) 그대로 */

const SEEDS = [1, 2, 3];
const start = (seed: number) => scrambledState("444", seed);

describe("4×4 야우 사람 해법", () => {
  it.each(SEEDS)(
    "섞기(씨앗 %i)를 앞 다섯 단계는 단원 규칙 그대로, 뒤는 3×3처럼 끝까지 맞춘다",
    (seed) => {
      const s = start(seed);
      const h = solveHuman("yau", 4, s);
      expect(
        isSolved(4, applyMoves(4, s, parseMoves(4, h.moves.join(" ")))),
      ).toBe(true);
      expect(h.stages.slice(0, 5).map((st) => st.name)).toEqual([
        "yau-centers",
        "yau-cross3",
        "centers-rest",
        "yau-last-cross",
        "edges",
      ]);
      // 앞 다섯 단계는 배우기 단원(단계 지도 시연)이 쓰는 수와 같다
      const front = h.moves.slice(0, (h.stages[4]?.end ?? 0) as number);
      expect(front.join(" ")).toBe(
        yauReduce(s)
          .stages.map((st) => st.moves)
          .filter(Boolean)
          .join(" "),
      );
      // 단계가 빈틈없이 이어진다
      for (let i = 1; i < h.stages.length; i++)
        expect(h.stages[i]?.start).toBe(h.stages[i - 1]?.end);
      expect(h.stages.at(-1)?.end).toBe(h.moves.length);
    },
  );

  it("4×4가 아니면 야우가 없다", () => {
    expect(() => solveHuman("yau", 5, scrambledState("555", 1))).toThrow(
      RangeError,
    );
  });
});

describe("계획 표 4: 4×4 중수가 야우", () => {
  it("4×4 중수만 야우, 다른 단계·크기는 그대로", () => {
    expect(levelMethod("club", 4)).toBe("yau");
    expect(levelMethod("fast", 4)).toBe("advanced");
    expect(levelMethod("club", 5)).toBe("fourlook");
    expect(levelMethod("club", 3)).toBe("fourlook");
    expect(BOT_PLAN_VERSION).toBe(4);
    expect(levelText("club")).toBe("4:club");
  });

  it("다른 기기가 다시 계산해도 같은 계획이고, 단계는 야우 차례다", () => {
    const s = start(2);
    const a = botPlan(levelText("club"), 4, s, 77, { inspectionMs: 15_000 });
    expect(botPlan("4:club", 4, s, 77, { inspectionMs: 15_000 })).toEqual(a);
    expect(a.fallback).toBeUndefined();
    expect(a.stages[0]?.name).toBe("yau-centers");
    const solved = applyMoves(
      4,
      s,
      parseMoves(4, a.moves.map((m) => m.move).join(" ")),
    );
    expect(isSolved(4, solved)).toBe(true);
  });
});

describe("옛 계획 표 3 글", () => {
  it("읽으면 버전이 붙고, 글로 되돌리면 그대로다", () => {
    expect(readBotSkill("3:club")).toEqual({
      kind: "level",
      level: "club",
      version: 3,
    });
    expect(readBotSkill("3:fit:150000")).toEqual({
      kind: "fit",
      targetMs: 150_000,
      version: 3,
    });
    expect(botSkillText(readBotSkill("3:club") as never)).toBe("3:club");
    expect(readBotSkill("4:club")).toEqual({ kind: "level", level: "club" });
    // 그보다 옛 표와 모르는 표는 다시 계산하지 않는다
    expect(readBotSkill("2:club")).toBeNull();
    expect(readBotSkill("5:club")).toBeNull();
    expect(botSkillLabel("3:club")).toBe("중수");
  });

  it("4×4 중수는 옛 계획(축소법·옛 배율) 그대로 다시 계산한다", () => {
    const s = start(3);
    const old = botPlan("3:club", 4, s, 5);
    expect(old.stages[0]?.name).toBe("centers-ud");
    const club = BOT_TARGET_MS[4]?.club as number;
    const base = BASE_MEAN_MS_V3[4]?.club as number;
    expect(old).toEqual(
      botPlan("4:club", 4, s, 5, {
        solve: (_m, size, st) => solveHuman("fourlook", size, st),
        scale: club / base,
      }),
    );
  });

  it("4×4 중수 밖은 지금 표와 같은 계획이다", () => {
    const s = start(1);
    expect(botPlan("3:fast", 4, s, 9)).toEqual(botPlan("4:fast", 4, s, 9));
    expect(botPlan("3:fit:400000", 4, s, 9)).toEqual(
      botPlan("4:fit:400000", 4, s, 9),
    );
  });
});
