import { omokBotFor } from "@game/omok-ai";
import {
  type Action,
  createMatch,
  type GameEvent,
  type OmokRules,
  type OmokState,
  type OmokView,
} from "@game/omok-engine";
import {
  createMatchStore,
  type MatchSaved,
  savedMatchSlot,
} from "@/game/match-store";
import type { Cue } from "@/game/sound";

import { omokKit } from "./kit";

export type OmokSaved = MatchSaved<OmokRules, Action>;

/** 내 돌: 흑(먼저 둔다)·백·무작위 */
export type StonePick = "black" | "white" | "random";

const slot = savedMatchSlot<OmokSaved>("omok-save");
export const loadOmok = slot.load;
export const clearOmok = slot.clear;

/** 사건에 맞춰 낼 소리: 돌 놓기, 판 끝(이김·짐·비김) */
function cuesFor(events: readonly GameEvent[], me: number): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    if (e.type === "placed") out.push("stone");
    if (e.type === "roundEnded")
      out.push(
        e.result.kind === "draw"
          ? "roundEnd"
          : e.result.seat === me
            ? "win"
            : "lose",
      );
  }
  return out;
}

export const useOmok = createMatchStore<
  OmokRules,
  OmokState,
  OmokView,
  Action,
  GameEvent,
  undefined,
  StonePick
>({
  game: "omok",
  kit: omokKit,
  botFor: omokBotFor,
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
  isTurn: (action) => action.type === "place",
  cues: cuesFor,
  byOther: (events, me) =>
    events.some((e) => e.type === "placed" && e.seat !== me),
  // 컴퓨터 수를 바로 보이지 않고 잠깐 기다렸다 놓는다(생각하는 듯이). 온라인 상대 수는 바로
  otherPause: { ms: 350, when: "before", soloOnly: true },
});
