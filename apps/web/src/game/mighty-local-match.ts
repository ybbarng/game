import { heuristicBot } from "@game/mighty-ai";
import type {
  Action,
  GameEvent,
  LoggedAction,
  MatchState,
  PlayerView,
  PresetDeal,
  RuleSet,
} from "@game/mighty-engine";

import type { KitBot, KitLoggedAction } from "./kit";
import {
  LocalMatch,
  type LocalMatchOptions,
  type SavedMatch,
} from "./local-match";
import { mightyKit } from "./mighty-kit";

type MightyOptions = Omit<LocalMatchOptions, "kit" | "bot"> & {
  bot?: KitBot<PlayerView, Action>;
};

/**
 * 마이티 대국. 키트는 마이티, 컴퓨터는 따로 주지 않으면 휴리스틱 봇이다.
 * 공통 `LocalMatch`가 마이티를 기본값으로 두면 모든 게임 화면이 마이티 키트·컴퓨터를 실어 여기로 뺐다
 * (2026-11-25 첫 화면 가볍게)
 */
export class MightyLocalMatch extends LocalMatch<
  RuleSet,
  MatchState,
  PlayerView,
  Action,
  GameEvent,
  PresetDeal
> {
  constructor(
    options: MightyOptions,
    savedLog?: readonly KitLoggedAction<Action>[],
  ) {
    super(
      { ...options, kit: mightyKit, bot: options.bot ?? heuristicBot },
      savedLog,
    );
  }

  /** 이어하기: 저장한 시작 조건과 행동 기록에서 되살린다 */
  static restore(
    saved: SavedMatch,
    extra: Pick<MightyOptions, "bot" | "pace" | "runBot"> = {},
  ): MightyLocalMatch {
    return new MightyLocalMatch(
      {
        rules: saved.rules,
        seed: saved.seed,
        humanSeat: saved.humanSeat,
        ...extra,
        ...(saved.presetDeal ? { presetDeal: saved.presetDeal } : {}),
      },
      saved.log as LoggedAction[],
    );
  }
}
