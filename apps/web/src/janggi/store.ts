import { janggiBotFor } from "@game/janggi-ai";
import {
  type Action,
  createMatch,
  type GameEvent,
  type JanggiRules,
  type JanggiState,
  type JanggiView,
} from "@game/janggi-engine";
import {
  createMatchStore,
  type MatchSaved,
  savedMatchSlot,
} from "@/game/match-store";
import type { Cue } from "@/game/sound";

import { janggiKit } from "./kit";
import type { SidePick } from "./settings";

export type JanggiSaved = MatchSaved<JanggiRules, Action>;

const slot = savedMatchSlot<JanggiSaved>("janggi-save");
export const loadJanggi = slot.load;
export const clearJanggi = slot.clear;

/** 사건에 맞춰 낼 소리: 기물 놓기·잡기, 장군, 판 끝(이김·짐) */
function cuesFor(events: readonly GameEvent[], me: number): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    if (e.type === "moved") out.push(e.captured ? "capture" : "piece");
    if (e.type === "check") out.push("check");
    if (e.type === "roundEnded")
      out.push(e.result.seat === me ? "win" : "lose");
  }
  return out;
}

export const useJanggi = createMatchStore<
  JanggiRules,
  JanggiState,
  JanggiView,
  Action,
  GameEvent,
  undefined,
  SidePick
>({
  game: "janggi",
  kit: janggiKit,
  botFor: janggiBotFor,
  slot,
  initialLevel: 1,
  /** 이 시드의 첫 판에서 원하는 편을 쥐는 자리 */
  seatFor(rules, seed, pick) {
    const cho = createMatch(rules, seed).state.choSeat;
    if (pick === "cho") return cho;
    if (pick === "han") return 1 - cho;
    return Math.random() < 0.5 ? 0 : 1;
  },
  rulesOf: (state) => state.rules,
  /** 무르기로 되돌리는 내 행동: 수 두기와 쉬기 */
  isTurn: (action) => action.type === "move" || action.type === "pass",
  cues: cuesFor,
  byOther: (events, me) =>
    events.some(
      (e) => (e.type === "moved" || e.type === "passed") && e.seat !== me,
    ),
  // 컴퓨터 수를 바로 보이지 않고 잠깐 기다렸다 놓는다(생각하는 듯이). 온라인 상대 수는 바로
  otherPause: { ms: 350, when: "before", soloOnly: true },
});
