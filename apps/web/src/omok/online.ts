import { omokBotFor } from "@game/omok-ai";
import type {
  Action,
  GameEvent,
  OmokRules,
  OmokState,
  OmokView,
} from "@game/omok-engine";

import { boardRoom } from "@/components/board-room";

import { omokKit } from "./kit";
import { omokSession } from "./session";
import { VARIANT_INFO } from "./settings";
import { useOmok } from "./store";

/** 친구와 오목(`BoardOnlineScreen`)에서 오목만 다른 것 */
export const omokOnline = boardRoom<
  OmokRules,
  OmokState,
  OmokView,
  Action,
  GameEvent
>({
  kit: omokKit,
  name: "오목",
  shareTitle: "오목 한 판 하자",
  session: omokSession,
  useStore: useOmok,
  botFor: omokBotFor,
  rulesSummary(rules) {
    const variant = VARIANT_INFO.find((v) => v.value === rules.variant);
    return `${variant?.label ?? ""} 규칙 · 첫 판 흑은 무작위 · 판마다 흑백 바꿈`;
  },
  rulesNote: (rules) =>
    VARIANT_INFO.find((v) => v.value === rules.variant)?.description ?? "",
});
