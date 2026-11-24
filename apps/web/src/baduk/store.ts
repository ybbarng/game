import { badukBotFor } from "@game/baduk-ai";
import {
  type Action,
  type BadukRules,
  type BadukState,
  type BadukView,
  createMatch,
  type GameEvent,
} from "@game/baduk-engine";
import {
  createMatchStore,
  type MatchSaved,
  savedMatchSlot,
} from "@/game/match-store";
import type { Cue } from "@/game/sound";

import { badukKit } from "./kit";
import type { StonePick } from "./settings";

export type BadukSaved = MatchSaved<BadukRules, Action>;

const slot = savedMatchSlot<BadukSaved>("baduk-save");
export const loadBaduk = slot.load;
export const clearBaduk = slot.clear;

/** 사건에 맞춰 낼 소리: 돌 놓기·따내기(돌 놓는 "딱"에 들어낸 돌이 부딪는 "자글"을 더한 바둑 소리), 판 끝(이김·짐) */
function cuesFor(events: readonly GameEvent[], me: number): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    if (e.type === "placed")
      out.push(e.captured.length > 0 ? "badukCapture" : "stone");
    if (e.type === "roundEnded")
      out.push(e.result.seat === me ? "win" : "lose");
  }
  return out;
}

export const useBaduk = createMatchStore<
  BadukRules,
  BadukState,
  BadukView,
  Action,
  GameEvent,
  undefined,
  StonePick
>({
  game: "baduk",
  kit: badukKit,
  botFor: badukBotFor,
  slot,
  initialLevel: 1,
  /** 이 시드의 첫 판에서 원하는 돌을 쥐는 자리 */
  seatFor(rules, seed, pick) {
    const black = createMatch(rules, seed).state.blackSeat;
    if (pick === "black") return black;
    if (pick === "white") return 1 - black;
    return Math.random() < 0.5 ? 0 : 1;
  },
  rulesOf: (state) => state.rules,
  /** 무르기로 되돌리는 내 행동: 돌 놓기와 쉬기 */
  isTurn: (action) => action.type === "place" || action.type === "pass",
  cues: cuesFor,
  byOther: (events, me) =>
    events.some(
      (e) => (e.type === "placed" || e.type === "passed") && e.seat !== me,
    ),
  // 컴퓨터 수를 바로 보이지 않고 잠깐 기다렸다 놓는다(생각하는 듯이). 온라인 상대 수는 바로
  otherPause: { ms: 350, when: "before", soloOnly: true },
});
