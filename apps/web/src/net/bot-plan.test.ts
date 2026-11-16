// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { KitBot } from "@/game/kit";

import { botCheckFor, lobbyBotFields, lobbyBotPlan } from "./bot-plan";

const bot: KitBot<unknown, unknown> = { name: "중수", decide: () => null };
/** 컴퓨터 계획 판 번호가 `botPlan`인 게임(없으면 1) */
const kitOf = (botPlan?: number) => ({
  botFor: () => bot,
  ...(botPlan === undefined ? {} : { botPlan }),
});

describe("방장이 싣는 번호", () => {
  it("컴퓨터가 있는 방이면 단계와 함께 이 게임 번호를 싣는다(없으면 1)", () => {
    expect(lobbyBotFields(kitOf(2), 1)).toEqual({ botLevel: 1, botPlan: 2 });
    expect(lobbyBotFields(kitOf(), 0)).toEqual({ botLevel: 0, botPlan: 1 });
    expect(lobbyBotFields(kitOf(2), null)).toEqual({});
  });

  it("번호가 없거나 모양이 틀리면 1로 읽는다(번호를 싣기 전 화면)", () => {
    expect(lobbyBotPlan({})).toBe(1);
    expect(lobbyBotPlan({ botPlan: 3 })).toBe(3);
    for (const junk of [0, -2, 1.5, Number.NaN, "2"])
      expect(lobbyBotPlan({ botPlan: junk as number })).toBe(1);
  });
});

describe("참가자가 컴퓨터 수를 맞춰 볼지", () => {
  it("방장과 번호가 같으면 그 단계 컴퓨터로 다시 계산한다", () => {
    expect(botCheckFor(kitOf(2), { botLevel: 1, botPlan: 2 }, true)).toEqual({
      bot,
      unchecked: null,
    });
  });

  it("번호 없는 옛 방장과 번호 1인 게임은 지금처럼 맞춰 본다", () => {
    expect(botCheckFor(kitOf(), { botLevel: 1 }, true)).toEqual({
      bot,
      unchecked: null,
    });
  });

  it("방장 화면이 옛 판이면 맞춰 보지 않고 확인 못 함으로 알린다(부정 아님)", () => {
    const check = botCheckFor(kitOf(2), { botLevel: 1 }, true);
    expect(check.bot).toBeNull();
    expect(check.unchecked).toBe(
      "방장 화면의 컴퓨터가 내 화면보다 옛 판(1, 내 화면 2)이라 컴퓨터 수는 확인하지 못했다. 방장이 새로고침하면 다음 게임부터 확인한다",
    );
  });

  it("방장 화면이 새 판이면 내 쪽 새로고침을 알린다", () => {
    const check = botCheckFor(kitOf(2), { botLevel: 1, botPlan: 3 }, true);
    expect(check.bot).toBeNull();
    expect(check.unchecked).toBe(
      "방장 화면의 컴퓨터가 내 화면보다 새 판(3, 내 화면 2)이라 컴퓨터 수는 확인하지 못했다. 새로고침하면 다음 게임부터 확인한다",
    );
  });

  it("컴퓨터가 한 수도 두지 않았으면 번호가 달라도 알릴 것이 없다", () => {
    expect(botCheckFor(kitOf(2), { botLevel: 1, botPlan: 3 }, false)).toEqual({
      bot: null,
      unchecked: null,
    });
  });

  it("방장이 단계를 빼고 컴퓨터 수를 실으면 조용히 넘기지 않고 확인 못 함으로 알린다", () => {
    expect(botCheckFor(kitOf(), {}, true)).toEqual({
      bot: null,
      unchecked: "방장이 컴퓨터 단계를 알리지 않아 컴퓨터 수는 확인하지 못했다",
    });
    expect(botCheckFor(kitOf(), {}, false)).toEqual({
      bot: null,
      unchecked: null,
    });
  });
});
