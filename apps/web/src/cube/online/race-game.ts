import { sha256Hex } from "@game/baseball-engine";
import {
  applyMove,
  applyMoves,
  type CubeMove,
  cube3Progress,
  formatMove,
  isRotation,
  isSolved,
  isValidMove,
  type MilestoneId,
  parseMoves,
  solvedCube,
  solvedPieceRatio,
} from "@game/cube-engine";
import type { Scramble, ScrambleEvent } from "@game/cube-scramble";
import type { PuzzleState } from "@game/puzzle-core";

import type { RaceGame } from "@/net/race/types";
import { goalReached } from "./handicap";
import {
  applyItemAct,
  applyLogText,
  type ItemAct,
  isItemText,
  itemCheckpoints,
  parseItemText,
} from "./items";
import {
  hasItems,
  PARTY_REASONS,
  type PartyMode,
  partyCheckpoints,
} from "./party";

/**
 * 계획을 끝내 만들지 못한 컴퓨터가 그 판을 기권하는 까닭(`bot-racer.ts`가 쓴다). 남이 보낸 그만두기 까닭은
 * 대결 틀 목록과 이것 안에서만 받는다
 */
export const BOT_NO_PLAN = "컴퓨터가 맞출 길을 찾지 못함";

/**
 * 큐브 맞추기를 대결 틀(`net/race`)에 붙이는 어댑터(docs/47 9절).
 *
 * 씨앗(모두의 약속 후 공개로 정한 글) → 해시로 uint32 → 대회 규칙 섞기(웹 워커) → 섞인 시작 상태.
 * 섞기는 해법기를 거쳐 오래 걸릴 수 있어 `prepare`에서 미리 만들어 둔다(대결 틀이 끝날 때까지 기다린다).
 * 섞기 글을 시작 상태 지문으로 실어 모든 기기가 같은 섞기를 만들었는지 맞춰 본다(해법기 판이 달라
 * 같은 씨앗에서 다른 섞기가 나오면 "섞기 어긋남").
 */

/** 섞기 만들기. 제품은 웹 워커(`scrambleInWorker`), 시험은 짧은 가짜 섞기를 넣는다 */
export type Scrambler = (
  event: ScrambleEvent,
  seed: number,
) => Scramble | Promise<Scramble>;

/** 대결 틀에 흘려보내는 수: 면 돌리기, 아이템전이면 특별한 수(쓰기·맞은 섞기 넣기)도 */
export type CubeAct = CubeMove | ItemAct;

export const isItemAct = (m: CubeAct): m is ItemAct => "item" in m;

export interface CubeRaceGame extends RaceGame<CubeAct, PuzzleState> {
  n: number;
  event: ScrambleEvent;
  /** 이 씨앗으로 만든 섞기(`prepare`가 끝난 뒤) */
  scrambleFor(seed: string): Scramble | undefined;
}

/** 대결 씨앗(글) → 섞기 씨앗(uint32). 판·시도마다 씨앗이 다르므로 섞기도 다르다 */
export function scrambleSeed(seed: string): number {
  return Number.parseInt(sha256Hex(`cube-scramble|${seed}`).slice(0, 8), 16);
}

export function eventForSize(n: number): ScrambleEvent {
  return `${n}${n}${n}` as ScrambleEvent;
}

/** 진행 단계 이름(docs/47 9-1). 3×3은 십자·F2L·OLL·끝을 알아보고, 다른 크기는 맞은 조각 비율 */
export function stageLabel(n: number, state: PuzzleState): string {
  if (isSolved(n, state)) return "끝";
  if (n === 3) {
    const p = cube3Progress(state);
    if (p.stage === "none") return "시작";
    if (p.stage === "cross")
      return p.f2lPairs > 0 ? `F2L ${p.f2lPairs}/4` : "십자";
    if (p.stage === "f2l") return "두 층(F2L)";
    if (p.stage === "oll") return "윗면(OLL)";
  }
  return `맞은 조각 ${Math.round(solvedPieceRatio(n, state) * 100)}%`;
}

/** 큐브 돌리기(x·y·z)를 뺀 수 수 */
export function turnCount(n: number, log: readonly { m: string }[]): number {
  let count = 0;
  for (const { m } of log) {
    // 아이템전의 특별한 수(쓰기·맞은 섞기)는 수로 세지 않는다
    if (isItemText(m)) continue;
    const move = parseMoves(n, m)[0];
    if (move && !isRotation(n, move)) count++;
  }
  return count;
}

/** 큐브 상태(조각 자리·방향)의 해시. 기기마다 엔진이 같은 상태를 만들었는지 맞춰 본다 */
export function stateHash(state: PuzzleState): string {
  return sha256Hex(`${state.perm.join(",")}|${state.twist.join(",")}`).slice(
    0,
    16,
  );
}

/**
 * `goals`: 사람마다 목표 이정표(핸디캡 「목표 다르게」, docs/47 9-5). 그 사람은 목표에 닿은 수에서 끝난다.
 * 모든 기기가 같은 표를 써야 하므로 방이 판정 설정 지문에 넣어 맞춰 본다(`raceOptionsFor`)
 */
export function createCubeRaceGame(
  n: number,
  scrambler: Scrambler,
  event: ScrambleEvent = eventForSize(n),
  goals: Readonly<Record<string, MilestoneId>> = {},
  /**
   * 파티 모드(docs/47 9-6·9-7): 깎는(받는) 이정표를 대결 틀의 중간 지점으로 넘긴다. 아이템전이면 특별한 수(쓰기·맞은 섞기)도
   * 받아 다시 적용하고, 그 시각도 중간 지점으로 확인한다. `true`는 체력바(옛 부르기)
   */
  party: PartyMode | boolean = false,
): CubeRaceGame {
  const mode: PartyMode | undefined =
    party === true ? "hp" : party === false ? undefined : party;
  const items = mode !== undefined && hasItems(mode);
  const cache = new Map<number, Scramble>();
  const scrambleOf = (seed: string) => cache.get(scrambleSeed(seed));
  return {
    id: `cube-${event}`,
    n,
    event,
    scrambleFor: scrambleOf,
    prepare(seed) {
      const key = scrambleSeed(seed);
      if (cache.has(key)) return;
      const made = scrambler(event, key);
      const keep = (s: Scramble) => {
        if (s.event !== event) throw new Error("종목이 다른 섞기");
        cache.set(key, s);
      };
      if (made instanceof Promise) return made.then(keep);
      keep(made);
    },
    startState(seed) {
      const s = scrambleOf(seed);
      if (!s) throw new Error("섞기를 아직 만들지 않았다");
      return applyMoves(n, solvedCube(n), parseMoves(n, s.text));
    },
    startFingerprint(seed) {
      const s = scrambleOf(seed);
      if (!s) throw new Error("섞기를 아직 만들지 않았다");
      // 섞기 글만 맞춰 보면 엔진 판이 달라 같은 글에서 다른 상태가 나와도 못 잡는다: 시작 상태도 함께
      const start = applyMoves(n, solvedCube(n), parseMoves(n, s.text));
      return `${event}|${s.text}|${stateHash(start)}`;
    },
    apply(state, move) {
      if (isItemAct(move)) {
        if (!items) throw new RangeError("둘 수 없는 수");
        return applyItemAct(n, state, move);
      }
      if (!isValidMove(n, move)) throw new RangeError("둘 수 없는 수");
      // 아이템전: 되감기가 되돌릴 내 마지막 수를 상태에 함께 적는다(`applyLogText`와 같은 규칙)
      return items
        ? applyLogText(n, state, formatMove(n, move))
        : applyMove(n, state, move);
    },
    isSolved: (state, player) =>
      player !== undefined && Object.hasOwn(goals, player)
        ? goalReached(n, state, goals[player])
        : isSolved(n, state),
    progress: (state) => solvedPieceRatio(n, state),
    retireReasons: [BOT_NO_PLAN, ...PARTY_REASONS],
    ...(mode
      ? {
          checkpointsOf: (state: PuzzleState) =>
            items
              ? [...partyCheckpoints(n, state), ...itemCheckpoints(state)]
              : partyCheckpoints(n, state),
        }
      : {}),
    // 큐브 돌리기(x·y·z)와 아이템전의 특별한 수는 수로 세지 않는다(의심 표시 「수가 지나치게 적음」 등)
    isTurn(text) {
      if (isItemText(text)) return false;
      const move = parseMoves(n, text)[0];
      return move !== undefined && !isRotation(n, move);
    },
    encodeMove: (move) => (isItemAct(move) ? move.text : formatMove(n, move)),
    decodeMove(text) {
      if (items && isItemText(text)) {
        const act = parseItemText(n, text);
        if (!act) throw new Error("모양이 틀린 아이템 수");
        return act;
      }
      const moves = parseMoves(n, text);
      if (moves.length !== 1) throw new Error("수 하나가 아니다");
      return moves[0] as CubeMove;
    },
  };
}
