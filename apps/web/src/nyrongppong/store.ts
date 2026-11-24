import type { PresetDeal } from "@game/hwatu";
import { nyrongppongBotFor } from "@game/nyrongppong-ai";
import type {
  Action,
  GameEvent,
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
} from "@game/nyrongppong-engine";
import {
  createMatchStore,
  type MatchSaved,
  savedMatchSlot,
} from "@/game/match-store";
import type { Cue } from "@/game/sound";

import { nyrongppongDealMs } from "./card-fx";
import { nyrongppongKit } from "./kit";

export type NyrongppongSaved = MatchSaved<NyrongppongRules, Action, PresetDeal>;

/**
 * 컴퓨터가 한 번 행동하기 전에 기다리는 시간. 화면에서 늦추지 않고 대국 진행 자체를 늦춘다.
 * 뽕 응답 창은 버린 순간부터 재므로, 화면만 늦추면 내 응답 시간이 그만큼 줄기 때문이다
 */
export const BOT_PACE_MS = 450;

/** 판 시작 나눠 주기 연출이 끝나는 시각. 컴퓨터는 그 뒤에 첫 행동을 한다 */
let dealUntil = 0;

/** 판 시작 장면이면 나눠 주는 동안 컴퓨터를 기다리게 한다 */
function noteDeal(events: readonly GameEvent[], players: number): void {
  if (events.some((e) => e.type === "roundStarted"))
    dealUntil = Date.now() + nyrongppongDealMs(players);
}

/** 컴퓨터 행동 사이를 늦춘다(브라우저가 그림을 그리고 입력을 받는다). 나눠 주는 중이면 끝날 때까지 */
function botPace(next: () => void): void {
  setTimeout(() => {
    // 쉬는 사이 판이 시작됐을 수 있어 깨어날 때 본다
    const extra = dealUntil - Date.now();
    if (extra > 0) setTimeout(next, extra);
    else next();
  }, BOT_PACE_MS);
}

const slot = savedMatchSlot<NyrongppongSaved>("nyrongppong-save");
export const loadNyrongppong = slot.load;
export const clearNyrongppong = slot.clear;

/** 사건에 맞춰 낼 소리: 카드 버리기·가져오기, 뽕, 판 끝 */
function cuesFor(events: readonly GameEvent[], me: number): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    if (e.type === "roundStarted") out.push("deal");
    if (e.type === "discarded") out.push("hwatuSlap");
    if (e.type === "drew" && e.seat === me) out.push("hwatuFlip");
    if (e.type === "ppong") out.push("ppong");
    if (e.type === "stopped") out.push("cardSet");
    if (e.type === "declared") out.push("yak");
    if (e.type === "roundEnded") {
      const scores = e.result.scores;
      const best = Math.min(...scores);
      out.push(scores[me] === best ? "win" : "lose");
    }
  }
  return out;
}

/**
 * 나이롱뽕은 화면을 늦추지 않는다: 받은 장면을 바로 보이고(쉼·연출 대기 없음), 컴퓨터 진행 자체를 `botPace`로 늦춘다.
 * 뽕 응답 창이 화면이 아니라 대국 시계로 흐르기 때문이다
 */
export const useNyrongppong = createMatchStore<
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
  Action,
  GameEvent,
  PresetDeal
>({
  game: "nyrongppong",
  kit: nyrongppongKit,
  botFor: nyrongppongBotFor,
  slot,
  initialLevel: 0,
  rulesOf: (state) => state.rules,
  practiceSeed: 1,
  pace: botPace,
  /** 무르기로 되돌리는 내 행동: 버리기·약·스톱·가져오기 */
  isTurn: (action) =>
    action.type === "discard" ||
    action.type === "declare" ||
    action.type === "stop" ||
    action.type === "draw",
  // 내가 버린 뒤 남들이 뽕할지 고르는 동안(call)에도 무른다
  undoable: (latest) =>
    latest.phase === "discard" ||
    latest.phase === "draw" ||
    latest.phase === "call",
  cues: cuesFor,
  byOther: () => false,
  otherPause: { ms: 0, when: "before" },
  // 화면은 기다리지 않고, 판 시작이면 나눠 주는 동안 컴퓨터만 기다리게 한다
  sceneMs(events, view) {
    noteDeal(events, view.rules.players);
    return 0;
  },
  opening(first, view) {
    const events = first.flatMap((s) => s.events);
    noteDeal(events, view.rules.players);
    return { events, ms: 0 };
  },
});
