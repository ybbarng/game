import { gostopBotFor } from "@game/gostop-ai";
import type {
  Action,
  GameEvent,
  GostopRules,
  GostopState,
  GostopView,
} from "@game/gostop-engine";
import type { PresetDeal } from "@game/hwatu";
import {
  createMatchStore,
  type MatchSaved,
  type MatchStoreHost,
  savedMatchSlot,
} from "@/game/match-store";

import { gostopSceneMs } from "./card-fx";
import { gostopCues } from "./cues";
import { gostopKit } from "./kit";

/** 화면이 아는 대국 창구: 혼자 하기·방장은 LocalMatch, 참가자는 RemoteMatch */
export type GostopHost = MatchStoreHost<GostopView, Action, GameEvent>;
export type GostopSaved = MatchSaved<GostopRules, Action, PresetDeal>;

const slot = savedMatchSlot<GostopSaved>("gostop-save");
export const loadGostop = slot.load;
export const clearGostop = slot.clear;

export const useGostop = createMatchStore<
  GostopRules,
  GostopState,
  GostopView,
  Action,
  GameEvent,
  PresetDeal
>({
  game: "gostop",
  kit: gostopKit,
  botFor: gostopBotFor,
  slot,
  initialLevel: 0,
  /** 무르기로 되돌리는 내 행동: 카드 내기·폭탄·뒤집기 */
  isTurn: (action) =>
    action.type === "play" || action.type === "bomb" || action.type === "flip",
  opensRound: (action) => action.type === "continue",
  cues: gostopCues,
  /** 남이 한 일이라 잠깐 보여 줄 사건 */
  byOther: (events, me) =>
    events.some(
      (e) =>
        (e.type === "played" ||
          e.type === "bombed" ||
          e.type === "flipOnly" ||
          e.type === "chose" ||
          e.type === "go" ||
          e.type === "stopped") &&
        e.seat !== me,
    ),
  // 앞 장면의 카드 연출이 끝난 뒤, 남이 한 수는 조금 더 기다렸다가 보인다(무엇을 냈는지 보이게)
  otherPause: { ms: 600, when: "before" },
  sceneMs: (events, view) => gostopSceneMs(events, view.rules),
  // 판 시작 장면이면 나눠 주기 연출을 보인다(다른 사건은 이미 지난 것이라 다시 보이지 않는다)
  opening(first, view) {
    const events = (first.at(-1)?.events ?? []).filter(
      (e) => e.type === "roundStarted",
    );
    return { events, ms: gostopSceneMs(events, view.rules) };
  },
});
