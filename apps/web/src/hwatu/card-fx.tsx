"use client";

import { isCardId, monthOf } from "@game/hwatu";
import { type RefObject, useEffect, useState } from "react";

import {
  type CardFlights,
  DealAnimation,
  FLIP_STEP_MS,
  type FlipMove,
  type FlipSpots,
  flipMs,
  HWATU_CARD,
  useCardFlights,
  useCardFlip,
} from "@/components/card-fx";
import { dealPlanFor, prefersReducedMotion } from "@/game/timing";
import type { Point } from "@/layout/compute-layout";

import type { HwatuLayout } from "./table-layout";

/*
 * 화투 셋(고스톱·민화투·나이롱뽕)의 카드 연출(docs/05 4.12). 공통 card-fx 위에 화투 흐름을 얹는다:
 * 판 시작 더미 섞기·손패와 바닥 나눠 주기, 장면마다 손패→바닥(남은 뒷면 부채→바닥), 더미→바닥, 바닥→먹은 패.
 * 한 장면의 움직임은 일어난 차례대로 한 걸음씩(동시에 움직이지 않게)
 */

/** 화투 나눠 주기 묶음: 손패·바닥 모두 두 바퀴(4장, 나머지) */
export const HWATU_DEAL_PATTERN = [4, 6] as const;

/**
 * 나눠 받는 곳의 장수: 선부터 자리 차례로 손패, 마지막에 바닥. `players`명, 손패 `hand`장, 바닥 `floor`장
 */
export function dealCounts(
  players: number,
  hand: number,
  floor: number,
): number[] {
  return [
    ...Array.from({ length: players }, () => hand),
    ...(floor > 0 ? [floor] : []),
  ];
}

/** 나눠 주기 연출 시간(움직임 줄이기면 0) */
export function hwatuDealMs(
  counts: readonly number[],
  pattern: readonly number[] = HWATU_DEAL_PATTERN,
): number {
  return prefersReducedMotion() ? 0 : dealPlanFor(counts, pattern).duration;
}

/** 장면 연출 시간: 걸음 수만큼(움직임 줄이기면 0) */
export function hwatuStepsMs(steps: number, stepMs = FLIP_STEP_MS): number {
  return flipMs(steps, stepMs);
}

/**
 * 판 시작 장면(`started`)이면 나눠 주는 동안 참. 움직임 줄이기면 늘 거짓. `scene`이 바뀌어 새 판이 시작될 때마다
 * 다시 돈다
 */
export function useHwatuDealing(
  scene: unknown,
  started: boolean,
  ms: number,
): boolean {
  const [dealingFor, setDealingFor] = useState<unknown>(null);
  const [shownFor, setShownFor] = useState<unknown>(null);
  if (started && ms > 0 && shownFor !== scene) {
    setShownFor(scene);
    setDealingFor(scene);
  }
  useEffect(() => {
    if (dealingFor === null) return;
    const id = setTimeout(() => setDealingFor(null), ms);
    return () => clearTimeout(id);
  }, [dealingFor, ms]);
  return dealingFor !== null && dealingFor === shownFor;
}

/** `data-flip` 이름의 앞면 카드: 카드 id면 그 카드, 뒷면 부채(`fan-…`)·더미(`deck`)는 뒷면 */
export function hwatuFaceOf(id: string): string | null {
  return isCardId(id) ? id : null;
}

/**
 * 화투 장면 연출: 장면(`scene`)이 바뀔 때 `moves`대로 카드 겉그림이 앞 자리에서 새 자리로 날아간다. 돌려준 줄을
 * `HwatuStage`의 `fx`로 넘기면 무대가 겉그림을 그리고 날아오는 카드를 가린다
 */
export function useHwatuFlights({
  stage,
  scene,
  skip,
  moves,
  stepMs = FLIP_STEP_MS,
}: {
  stage: RefObject<HTMLElement | null>;
  scene: unknown;
  skip: boolean;
  moves: (prev: FlipSpots, next: FlipSpots) => readonly FlipMove[];
  /** 한 걸음 시간(나이롱뽕은 조금 짧다) */
  stepMs?: number;
}): CardFlights {
  const fx = useCardFlights();
  useCardFlip({ stage, scene, skip, fx, faceOf: hwatuFaceOf, moves, stepMs });
  return fx;
}

/**
 * 판 시작 연출: 가운데 판에서 더미를 섞고, 선부터 자리 차례로 손패를, 마지막에 바닥 패를 나눠 준다.
 * `seats`는 나부터 차례 순서의 자리 수, `dealerOffset`은 선이 나부터 몇 번째인가
 */
export function HwatuDeal({
  layout,
  seats,
  dealerOffset,
  hand,
  floor,
  deckLeft,
  dealKey,
  pattern = HWATU_DEAL_PATTERN,
}: {
  layout: HwatuLayout;
  seats: number;
  dealerOffset: number;
  hand: number;
  floor: number;
  /** 다 나눈 뒤 더미에 남는 장수 */
  deckLeft: number;
  dealKey: string;
  /** 나눠 주는 묶음(기본 4장·나머지) */
  pattern?: readonly number[];
}) {
  const { center, hand: row, deck } = layout;
  const board: Point = {
    x: center.x + center.w / 2,
    y: center.y + center.h / 2,
  };
  const placeOf = (offset: number): Point => {
    if (offset === 0)
      return { x: center.x + center.w / 2, y: row.top + row.card.h / 2 };
    const p = layout.seats[offset]?.plate;
    return p ? { x: p.x + p.w / 2, y: p.y + p.h } : board;
  };
  const order = Array.from(
    { length: seats },
    (_, k) => (dealerOffset + k) % seats,
  );
  const targets = [...order.map(placeOf), ...(floor > 0 ? [board] : [])];
  return (
    <DealAnimation
      key={dealKey}
      center={{ x: center.x + Math.max(deck, 40), y: board.y }}
      kind={HWATU_CARD}
      width={deck}
      targets={targets}
      handSize={hand}
      counts={dealCounts(seats, hand, floor)}
      kittyCount={deckLeft}
      startDelay={0}
      pattern={pattern}
    />
  );
}

/** 앞 장면에서 `offset`번째 자리 뒷면 부채의 맨 끝 카드(남이 낸 카드가 출발하는 곳) */
export function fanSource(prev: FlipSpots, offset: number): string | undefined {
  const prefix = `fan-${offset}-`;
  let best: string | undefined;
  let bestIndex = -1;
  for (const id of prev.keys()) {
    if (!id.startsWith(prefix)) continue;
    const i = Number(id.slice(prefix.length));
    if (i > bestIndex) {
      bestIndex = i;
      best = id;
    }
  }
  return best;
}

/** 앞 장면 바닥에 있던 카드 중 `card`와 같은 달이고 `among`에 든 첫 카드(짝 맞춘 바닥 카드) */
export function floorMatch(
  prev: FlipSpots,
  card: string,
  among: readonly string[],
): string | undefined {
  const month = monthOf(card);
  return among.find(
    (id) =>
      id !== card && prev.get(id)?.zone === "floor" && monthOf(id) === month,
  );
}

/** 낸(뒤집은) 카드 한 장과 그 카드로 먹은 바닥 카드 */
export interface HwatuPlay {
  card: string;
  /** "hand": 낸 사람 손패(남이면 뒷면 부채)에서, "deck": 더미에서 */
  source: "hand" | "deck";
  /** 나부터 차례 순서로 몇 번째 자리인가(손패에서 낼 때 출발 자리) */
  offset: number;
  /** 이 카드와 함께 먹은 바닥 카드. 비었으면 바닥에 놓인다 */
  took: readonly string[];
  /**
   * 먹은 패로 가는 걸음을 늦춘다(고스톱처럼 내고 뒤집은 뒤 한꺼번에 가져갈 때). 주면 그 걸음에 먹은 패로 간다
   */
  takeAt?: number;
}

/**
 * 장면의 움직임: 낸 카드마다 한 걸음(출발 자리 → 바닥, 먹었으면 짝 맞춘 바닥 카드 위), 먹었으면 다음 걸음에 함께
 * 먹은 패로. `start`번째 걸음부터 센다. 반환: 움직임과 다 쓴 걸음 수
 */
export function hwatuPlayMoves(
  prev: FlipSpots,
  plays: readonly HwatuPlay[],
  start = 0,
): { moves: FlipMove[]; steps: number } {
  const moves: FlipMove[] = [];
  let step = start;
  for (const p of plays) {
    const from =
      p.source === "deck"
        ? "deck"
        : p.offset === 0
          ? undefined
          : fanSource(prev, p.offset);
    const taking = p.took.length > 0;
    const match = taking ? floorMatch(prev, p.card, p.took) : undefined;
    const takeStep = taking ? (p.takeAt ?? step + 1) : step;
    // 짝 맞춘 바닥 카드 위로 간 뒤, 먹은 패로 가는 걸음까지 그 위에서 기다린다
    const holds = match ? Math.max(1, takeStep - step) : 0;
    moves.push({
      id: p.card,
      step,
      ...(from ? { from } : {}),
      ...(match ? { via: Array.from({ length: holds }, () => match) } : {}),
    });
    if (taking && p.takeAt === undefined) {
      for (const t of p.took)
        if (t !== p.card) moves.push({ id: t, step: takeStep });
      step = takeStep + 1;
    } else step += 1;
  }
  return { moves, steps: step - start };
}
