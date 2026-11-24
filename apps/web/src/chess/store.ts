import { chessBotFor } from "@game/chess-ai";
import {
  type Action,
  type ChessRules,
  type ChessState,
  type ChessView,
  createMatch,
  type GameEvent,
} from "@game/chess-engine";
import {
  createMatchStore,
  type MatchSaved,
  savedMatchSlot,
} from "@/game/match-store";
import type { Cue } from "@/game/sound";

import { chessKit } from "./kit";
import type { ColorPick } from "./settings";

export type ChessSaved = MatchSaved<ChessRules, Action>;

const slot = savedMatchSlot<ChessSaved>("chess-save");
export const loadChess = slot.load;
export const clearChess = slot.clear;

/** 사건에 맞춰 낼 소리: 기물 놓기·잡기, 체크, 무승부 제안, 판 끝(이김·짐·비김). 장기 소리를 함께 쓴다 */
function cuesFor(events: readonly GameEvent[], me: number): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    if (e.type === "moved") out.push(e.captured ? "capture" : "piece");
    if (e.type === "check") out.push("check");
    // 상대가 무승부를 제안하면 알아채게 "짠"(마이티 공지 소리)
    if (e.type === "drawOffered" && e.seat !== me) out.push("announce");
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

export const useChess = createMatchStore<
  ChessRules,
  ChessState,
  ChessView,
  Action,
  GameEvent,
  undefined,
  ColorPick
>({
  game: "chess",
  kit: chessKit,
  botFor: chessBotFor,
  slot,
  initialLevel: 1,
  /** 이 시드의 첫 판에서 원하는 색을 쥐는 자리 */
  seatFor(rules, seed, pick) {
    const white = createMatch(rules, seed).state.whiteSeat;
    if (pick === "white") return white;
    if (pick === "black") return 1 - white;
    return Math.random() < 0.5 ? 0 : 1;
  },
  rulesOf: (state) => state.rules,
  /** 무르기로 되돌리는 내 행동: 수 두기 */
  isTurn: (action) => action.type === "move",
  cues: cuesFor,
  byOther: (events, me) =>
    events.some((e) => e.type === "moved" && e.seat !== me),
  // 컴퓨터 수를 바로 보이지 않고 잠깐 기다렸다 놓는다(생각하는 듯이). 온라인 상대 수는 바로
  otherPause: { ms: 350, when: "before", soloOnly: true },
});
