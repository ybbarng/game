import { sha256Hex } from "@game/yut-engine";

import type { GalaxyBoard } from "./board";
import { factSquares, type StarFact } from "./cards";
import type { GalaxyConstellation } from "./sky-types";

/**
 * 관측 의뢰(docs/48 15-5 1번). 판 처음 자리마다 우주국 의뢰서 한 장을 몰래 받고, 판 끝에 모두 펼친다.
 * 이루었으면 우주국이 `NUMBERS.requestBonus`를 준다.
 *
 * 공정성(숫자야구·봉투 입찰과 같은 약속 후 공개 틀, docs/50):
 * 1. 판 처음 사슬 약속 때 자리마다 의뢰 비밀(`secret`)의 약속(`requestCommitment`)을 함께 낸다.
 *    비밀은 그 자리 0세대 사슬 씨앗에서 만든다(`requestSecretOf`). 방장도 남의 비밀을 모른다
 * 2. 첫 공개(첫 굴림, 짧은 판은 시작 별 나누기)의 해시가 「닻」(`anchor`)이다. 닻은 모든 자리 고리로 정해져
 *    누구도 고르거나 미리 알 수 없다
 * 3. 내 의뢰 = 의뢰 목록[H(비밀 | 닻) mod 장 수]. 비밀은 닻보다 먼저 약속했으므로 고를 수 없고,
 *    남은 비밀을 모르므로 남의 의뢰를 모른다
 * 4. 판 끝에 비밀을 공개하면 엔진이 약속과 맞는지, 그 비밀과 닻으로 나온 의뢰가 무엇인지, 이루었는지 다시 계산한다
 */

export type RequestGoal =
  | { kind: "fact"; fact: StarFact; need: number }
  | { kind: "season"; season: NonNullable<GalaxyConstellation["season"]> }
  | { kind: "spread"; need: number };

export interface RequestCard {
  id: number;
  title: string;
  /** 의뢰서 글(우주국 글이라 「~습니다」) */
  text: string;
  goal: RequestGoal;
}

export const REQUEST_CARDS: readonly RequestCard[] = [
  {
    id: 1,
    title: "1등성 밝기 측정",
    text: "1.5등급까지 밝은 별(1등성)을 둘 맡아 주시기 바랍니다.",
    goal: { kind: "fact", fact: "firstMagnitude", need: 2 },
  },
  {
    id: 2,
    title: "푸른 별 조사",
    text: "표면 온도 1만 K가 넘는 푸른 별을 둘 맡아 주시기 바랍니다.",
    goal: { kind: "fact", fact: "blue", need: 2 },
  },
  {
    id: 3,
    title: "붉은 별 조사",
    text: "표면 온도 4,000 K보다 낮은 붉은 별을 둘 맡아 주시기 바랍니다.",
    goal: { kind: "fact", fact: "red", need: 2 },
  },
  {
    id: 4,
    title: "먼 별 관측",
    text: "500광년 넘게 떨어진 별을 둘 맡아 주시기 바랍니다.",
    goal: { kind: "fact", fact: "far", need: 2 },
  },
  {
    id: 5,
    title: "이웃 별 관측",
    text: "100광년 안의 가까운 별을 둘 맡아 주시기 바랍니다.",
    goal: { kind: "fact", fact: "near", need: 2 },
  },
  {
    id: 6,
    title: "해를 닮은 별 조사",
    text: "표면 온도 4,000~7,500 K인 노란·주황 별을 둘 맡아 주시기 바랍니다.",
    goal: { kind: "fact", fact: "yellow", need: 2 },
  },
  {
    id: 7,
    title: "봄 하늘 지도",
    text: "봄 별자리 하나를 완성해 주시기 바랍니다.",
    goal: { kind: "season", season: "spring" },
  },
  {
    id: 8,
    title: "여름 하늘 지도",
    text: "여름 별자리 하나를 완성해 주시기 바랍니다.",
    goal: { kind: "season", season: "summer" },
  },
  {
    id: 9,
    title: "가을 하늘 지도",
    text: "가을 별자리 하나를 완성해 주시기 바랍니다.",
    goal: { kind: "season", season: "autumn" },
  },
  {
    id: 10,
    title: "겨울 하늘 지도",
    text: "겨울 별자리 하나를 완성해 주시기 바랍니다.",
    goal: { kind: "season", season: "winter" },
  },
  {
    id: 11,
    title: "넓은 하늘 순찰",
    text: "서로 다른 별자리 다섯에 별을 하나씩 맡아 주시기 바랍니다.",
    goal: { kind: "spread", need: 5 },
  },
];

export function requestById(id: number): RequestCard {
  const card = REQUEST_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`없는 의뢰 ${id}`);
  return card;
}

/** 이 판에서 이룰 수 있는 의뢰(해당하는 별·별자리가 넉넉한 것만) */
export function activeRequests(board: GalaxyBoard): number[] {
  return REQUEST_CARDS.filter((card) => {
    const goal = card.goal;
    if (goal.kind === "fact")
      return factSquares(board, goal.fact).length >= goal.need + 1;
    if (goal.kind === "season")
      return board.groups.some((g) => g.season === goal.season);
    return board.groups.length >= goal.need + 2;
  }).map((card) => card.id);
}

/** 0세대 사슬 씨앗에서 만든 의뢰 비밀(16진수 64자) */
export function requestSecretOf(seed: string): string {
  return sha256Hex(`galaxy-request-secret|${seed}`);
}

/** 의뢰 비밀의 약속(자리 번호를 넣어 남의 약속을 베껴 내지 못하게) */
export function requestCommitment(seat: number, secret: string): string {
  return sha256Hex(`galaxy-request-commit|${seat}|${secret}`);
}

/** 비밀과 닻으로 정해지는 의뢰 번호 */
export function requestOf(
  board: GalaxyBoard,
  secret: string,
  anchor: string,
): number {
  const active = activeRequests(board);
  const hex = sha256Hex(`galaxy-request|${secret}|${anchor}`);
  const index = Number.parseInt(hex.slice(0, 12), 16) % active.length;
  return active[index] as number;
}

/** 의뢰를 얼마나 이루었나(가진 별은 맡긴 별도 센다). `have >= need`면 이루었다 */
export function requestProgress(
  state: { board: GalaxyBoard; owners: readonly number[] },
  seat: number,
  card: number,
): { have: number; need: number } {
  const goal = requestById(card).goal;
  const board = state.board;
  const mine = (sq: number) => state.owners[sq] === seat;
  if (goal.kind === "fact")
    return {
      have: factSquares(board, goal.fact).filter(mine).length,
      need: goal.need,
    };
  if (goal.kind === "season") {
    // 그 계절 별자리 가운데 가장 많이 모은 별자리의 별 수 / 그 별자리 별 수
    let have = 0;
    let need = 0;
    for (const g of board.groups) {
      if (g.season !== goal.season) continue;
      const owned = g.squares.filter(mine).length;
      if (need === 0 || owned / g.squares.length > have / need) {
        have = owned;
        need = g.squares.length;
      }
    }
    return { have, need };
  }
  const groups = board.groups.filter((g) => g.squares.some(mine)).length;
  return { have: groups, need: goal.need };
}

export function requestDone(
  state: { board: GalaxyBoard; owners: readonly number[] },
  seat: number,
  card: number,
): boolean {
  const { have, need } = requestProgress(state, seat, card);
  return need > 0 && have >= need;
}

/** 0세대 사슬 씨앗으로 낸 의뢰 약속(사슬 약속 행동에 함께 싣는다) */
export function requestCommitOf(seat: number, seed: string): string {
  return requestCommitment(seat, requestSecretOf(seed));
}
