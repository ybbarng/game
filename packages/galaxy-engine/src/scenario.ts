import { chainCommit, derivedSeed } from "@game/yut-engine";

import { BASE, type GalaxyBoard } from "./board";
import { createMatch, seasonFor } from "./match";
import { type GalaxyRules, meteorFor, NUMBERS, STANDARD_RULES } from "./rules";
import type { GalaxyState } from "./state";

/** 장면의 별 하나: 칸, 주인, 정거장 단(기본 1), 맡김 */
export interface ScenarioStar {
  square: number;
  owner: number;
  level?: number;
  mortgaged?: boolean;
}

/**
 * 튜토리얼 장면: 정해진 칸·자금·주인에서 시작하는 상태를 만든다(판은 `turn` 단계, 굴리기 전).
 * 사슬은 모든 자리가 재료(시드)로 약속해 둔 상태라, 장면 뒤에도 굴리기가 이어진다(내 자리도 재료로 공개한다).
 * 적지 않은 것은 새 판과 같다(모두 우주국, 시작 자금, 주인 없는 별). 시작 자금은 판 중간 장면이라
 * 뒤 자리 보정(`lateSeatBonus`) 없이 모두 같은 기본 값이다
 */
export function createGalaxyScenario(options: {
  board: GalaxyBoard;
  rules?: GalaxyRules;
  seed?: number;
  turn?: number;
  positions?: number[];
  cash?: number[];
  stars?: ScenarioStar[];
  jailed?: number[];
  /** 남은 공문 더미(번호). 적지 않으면 판의 공문 모두 */
  deck?: number[];
  round?: number;
  /** 달이 있는 칸(달의 길을 켠 판만). 적지 않으면 판 처음 자리 */
  moon?: number;
}): GalaxyState {
  const rules = options.rules ?? {
    ...STANDARD_RULES,
    sky: options.board.skyId,
  };
  const { state } = createMatch(rules, options.seed ?? 1, options.board);
  const turn = options.turn ?? 0;
  const jailed = state.jailed.map(
    (_, s) => options.jailed?.includes(s) ?? false,
  );
  const next: GalaxyState = {
    ...state,
    phase: "turn",
    round: options.round ?? 1,
    season: seasonFor(rules, options.round ?? 1),
    meteor: meteorFor(rules, options.round ?? 1),
    moon: state.moon === null ? null : (options.moon ?? state.moon),
    starter: turn,
    revealFor: null,
    turn: {
      seat: turn,
      doubles: 0,
      rolls: 0,
      offered: false,
      next: jailed[turn] ? "jailRoll" : "roll",
      again: false,
    },
    positions: options.positions
      ? [...options.positions]
      : state.positions.map(() => BASE),
    cash: options.cash
      ? [...options.cash]
      : state.cash.map(() => NUMBERS.startFunds[rules.length]),
    jailed,
    owners: [...state.owners],
    levels: [...state.levels],
    mortgaged: [...state.mortgaged],
    deck: options.deck ? [...options.deck] : [...state.deck],
    chains: state.keys.map((key) => {
      const commit = chainCommit(derivedSeed(key, 0));
      return { commit, last: commit, used: 0 };
    }),
  };
  for (const star of options.stars ?? []) {
    if (!options.board.squares[star.square]?.star)
      throw new Error(`장면의 ${star.square}번 칸은 별 칸이 아니다`);
    next.owners[star.square] = star.owner;
    next.levels[star.square] = star.level ?? 1;
    next.mortgaged[star.square] = star.mortgaged ?? false;
  }
  return next;
}
