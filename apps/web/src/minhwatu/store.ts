import type { PresetDeal } from "@game/hwatu";
import { minhwatuBotFor } from "@game/minhwatu-ai";
import type {
  Action,
  GameEvent,
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
} from "@game/minhwatu-engine";
import {
  createMatchStore,
  type MatchSaved,
  savedMatchSlot,
} from "@/game/match-store";

import { minhwatuSceneMs } from "./card-fx";
import { minhwatuCues } from "./cues";
import { minhwatuKit } from "./kit";

export type MinhwatuSaved = MatchSaved<MinhwatuRules, Action, PresetDeal>;

const slot = savedMatchSlot<MinhwatuSaved>("minhwatu-save");
export const loadMinhwatu = slot.load;
export const clearMinhwatu = slot.clear;

export const useMinhwatu = createMatchStore<
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
  Action,
  GameEvent,
  PresetDeal
>({
  game: "minhwatu",
  kit: minhwatuKit,
  botFor: minhwatuBotFor,
  slot,
  initialLevel: 0,
  rulesOf: (state) => state.rules,
  practiceSeed: 1,
  /** 무르기로 되돌리는 내 행동: 패 내기(내 고르기와 그 뒤 컴퓨터 차례도 함께 되돌린다) */
  isTurn: (action) => action.type === "play",
  undoable: (latest) => latest.phase === "play" || latest.phase === "pick",
  // 이번 판에 내가 낸 패가 있어야 한다(지난 판으로는 되돌리지 않는다)
  opensRound: (action) => action.type === "continue",
  cues: minhwatuCues,
  /** 남(컴퓨터·다른 사람)이 낸 걸음인가 */
  byOther: (events, me) =>
    events.some(
      (e) => (e.type === "played" || e.type === "picked") && e.seat !== me,
    ),
  // 남이 낸 차례를 바로 넘기지 않고 잠깐 보여 준다(무엇을 내고 먹었는지 보이게)
  otherPause: { ms: 700, when: "after" },
  sceneMs: (events, view) => minhwatuSceneMs(events, view.handCounts.length),
  opening: (first) => ({ events: first.at(-1)?.events ?? [], ms: 0 }),
});
