import { botPlanOf, type KitBot } from "@/game/kit";

import type { LobbyState } from "./protocol";

/**
 * 판 끝 다시 계산에서 컴퓨터 수를 맞춰 볼 수 있는가(컴퓨터 계획 판 번호, docs/13 「컴퓨터 계획 판 번호」).
 *
 * 방장은 방 상태에 컴퓨터 단계(`botLevel`)와 계획 판 번호(`botPlan`, 없으면 1: 번호를 싣기 전 화면)를 싣는다.
 * 참가자는 **자기 기기의 번호와 같을 때만** 자기 컴퓨터로 다시 계산해 맞춰 본다. 다르면 배포 직후 옛 화면과 새 화면이
 * 한 방에 있는 것이라 정직한 방장의 컴퓨터 수도 다르게 나온다. 그때는 부정으로 짚지 않고 「컴퓨터 수는 확인하지 못했다」고
 * 보이고 알린다(`unchecked`). 방장이 번호를 속여도 얻는 것은 이 「확인 못 함」 표시뿐이고(숨겨지지 않는다), 번호는
 * 컴퓨터 수를 맞춰 볼지에만 쓰여 섞기·내 수·화면 확인은 그대로 한다. 참가자는 모르는 번호의 계산을 믿지 않는다
 */
export interface BotCheck<View, Action> {
  /** 다시 계산할 컴퓨터. null이면 컴퓨터 수를 맞춰 보지 않는다 */
  bot: KitBot<View, Action> | null;
  /** 컴퓨터가 둔 수가 있는데 맞춰 보지 못한 까닭(판 끝 결과에 함께 보인다). 맞춰 봤거나 볼 것이 없으면 null */
  unchecked: string | null;
}

/** 방 상태에 실린 방장의 컴퓨터 계획 판 번호(없으면 1) */
export function lobbyBotPlan(lobby: Pick<LobbyState, "botPlan">): number {
  const plan = lobby.botPlan;
  return typeof plan === "number" && Number.isSafeInteger(plan) && plan >= 1
    ? plan
    : 1;
}

/** 방장이 방 상태에 실을 컴퓨터 단계와 계획 판 번호 */
export function lobbyBotFields(
  kit: { readonly botPlan?: number },
  botLevel: number | null,
): Pick<LobbyState, "botLevel" | "botPlan"> {
  return botLevel === null ? {} : { botLevel, botPlan: botPlanOf(kit) };
}

/**
 * `botMoved`: 기록에 컴퓨터가 둔 수가 있는가. 없으면 맞춰 볼 것이 없어 `unchecked`도 없다
 */
export function botCheckFor<View, Action>(
  kit: {
    botFor?(level: number): KitBot<View, Action>;
    readonly botPlan?: number;
  },
  lobby: Pick<LobbyState, "botLevel" | "botPlan">,
  botMoved: boolean,
): BotCheck<View, Action> {
  if (!kit.botFor) return { bot: null, unchecked: null };
  const level = lobby.botLevel;
  if (level === undefined)
    return {
      bot: null,
      unchecked: botMoved
        ? "방장이 컴퓨터 단계를 알리지 않아 컴퓨터 수는 확인하지 못했다"
        : null,
    };
  const host = lobbyBotPlan(lobby);
  const mine = botPlanOf(kit);
  if (host === mine) return { bot: kit.botFor(level), unchecked: null };
  if (!botMoved) return { bot: null, unchecked: null };
  return {
    bot: null,
    unchecked:
      host > mine
        ? `방장 화면의 컴퓨터가 내 화면보다 새 판(${host}, 내 화면 ${mine})이라 컴퓨터 수는 확인하지 못했다. 새로고침하면 다음 게임부터 확인한다`
        : `방장 화면의 컴퓨터가 내 화면보다 옛 판(${host}, 내 화면 ${mine})이라 컴퓨터 수는 확인하지 못했다. 방장이 새로고침하면 다음 게임부터 확인한다`,
  };
}
