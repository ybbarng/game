"use client";

import { useEffect, useState } from "react";

import { dealPlanFor, FLIGHT_MS, SHUFFLE_MS } from "@/game/timing";
import type { Point } from "@/layout/compute-layout";

import type { CardKind } from "./kind";
import { type CardPosition, CardSprite } from "./sprite";

/** 덱 연출용 뒷면 한 장 */
function Back({
  kind,
  width,
  at,
  rotate,
  z,
  duration,
}: {
  kind: CardKind;
  width: number;
  at: CardPosition;
  rotate: number;
  z: number;
  duration: number;
}) {
  return (
    <CardSprite
      kind={kind}
      width={width}
      at={at}
      rotate={rotate}
      z={z}
      duration={duration}
    >
      {kind.renderBack(width)}
    </CardSprite>
  );
}

interface DealAnimationProps {
  center: Point;
  /** 카드 종류(뒷면 그림과 높이) */
  kind: CardKind;
  /** 덱 카드 한 장 너비 */
  width: number;
  /** 선부터 차례로, 카드를 받을 곳 */
  targets: Point[];
  /** 받는 곳마다 같은 장수일 때 한 곳의 장수 */
  handSize: number;
  /** 받는 곳마다 장수가 다르면 곳마다의 장수(화투: 손패와 바닥). 주면 `handSize` 대신 쓴다 */
  counts?: readonly number[];
  kittyCount: number;
  /** 다른 연출(딜미스 알림 등)이 끝난 뒤 시작한다 */
  startDelay: number;
  /** 한 사람에게 주는 묶음 크기(없으면 마이티 2·3·3·2) */
  pattern?: readonly number[];
  /**
   * 섞는 연출 시간. 멘탈 포커처럼 실제로 섞는 동안 이미 섞는 연출(`ShuffleLoop`)을 보였으면
   * 최소 시간(`SHUFFLE_MS`)에서 남은 만큼만 섞고 바로 나눠 준다
   */
  shuffleMs?: number;
}

/**
 * 나눠 받은 카드가 받는 자리에 내려앉을 때의 크기(덱 카드 대비). 손패가 받은 자리에서 펼쳐지기 시작하는 크기도
 * 이것이다(`useHandSpread`, 하트·마이티 손패의 `from`)
 */
export const DEALT_SCALE = 0.55;

type Stage =
  | "stack"
  | "split"
  | "merge"
  | "split2"
  | "merge2"
  | "deal"
  | "settle";

/**
 * 판 시작 연출(마이티·하트·화투 공통): 가운데 덱을 두 번 섞고 선부터 묶음(기본 2·3·3·2장)으로 나눠 준다.
 * 다 나눈 뒤 남은 카드(`kittyCount`)는 덱 자리에 그대로 둔다
 */
export function DealAnimation({
  center,
  kind,
  width,
  targets,
  handSize,
  counts,
  kittyCount,
  startDelay,
  pattern,
  shuffleMs = SHUFFLE_MS,
}: DealAnimationProps) {
  const [stage, setStage] = useState<Stage>("stack");
  /** 덱을 떠난 카드 수. 카드마다 떠나는 순간에 위로 올려야 받는 자리에서 나중 카드가 위에 쌓인다 */
  const [launched, setLaunched] = useState(0);
  const perTarget = counts ?? targets.map(() => handSize);
  const total = perTarget.reduce((a, b) => a + b, 0);
  const { flights } = dealPlanFor(perTarget, pattern);
  const lastFlight = flights.at(-1)?.delay ?? 0;
  const countsKey = perTarget.join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: 장수 목록은 글자(countsKey)로 비교한다
  useEffect(() => {
    const start = startDelay + shuffleMs;
    const timers = dealPlanFor(perTarget, pattern).flights.map((f, k) =>
      setTimeout(() => setLaunched(k + 1), start + f.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [countsKey, pattern, startDelay, shuffleMs]);

  useEffect(() => {
    const step = shuffleMs / 4;
    const shuffles: [Stage, number][] =
      shuffleMs > 0
        ? [
            ["split", startDelay],
            ["merge", startDelay + step],
            ["split2", startDelay + step * 2],
            ["merge2", startDelay + step * 3],
          ]
        : [];
    const plan: [Stage, number][] = [
      ...shuffles,
      ["deal", startDelay + shuffleMs],
      ["settle", startDelay + shuffleMs + lastFlight + FLIGHT_MS],
    ];
    const timers = plan.map(([s, at]) => setTimeout(() => setStage(s), at));
    return () => timers.forEach(clearTimeout);
  }, [startDelay, lastFlight, shuffleMs]);

  const count = total + kittyCount;
  const split = stage === "split" || stage === "split2";
  return (
    <>
      {/* 나눠 주는 연출이 도는 동안의 표시(화면 시험이 연출이 있는 길을 확인할 때 쓴다) */}
      <span data-dealing hidden />
      {Array.from({ length: count }, (_, i) => {
        // 아래부터 쌓는다. 바닥 카드는 맨 아래에 남고, 나눠 줄 카드는 맨 위부터 나간다.
        const isKitty = i < kittyCount;
        const order = count - 1 - i;
        const flight = isKitty ? undefined : flights[order];
        const dealt = !isKitty && order < launched;
        const half = i % 2 === 0 ? -1 : 1;
        const stack = i * 0.35;
        const at = dealt
          ? {
              ...(targets[flight?.player ?? 0] as Point),
              scale: DEALT_SCALE,
              opacity: 0.9,
            }
          : {
              x: center.x + (split ? half * width * 0.62 : 0),
              y: center.y - stack,
              // 다 나눈 뒤 남은 바닥 카드는 덱 자리에 그대로 둔다(게임 화면이 이어받는다).
              scale: 1,
            };
        return (
          <Back
            // biome-ignore lint/suspicious/noArrayIndexKey: 덱 연출용 뒷면 카드는 순서가 곧 정체다
            key={i}
            kind={kind}
            width={width}
            at={at}
            rotate={split ? half * 6 : 0}
            // 덱에서는 맨 위 카드가 맨 위에 보이고 먼저 나간다. 덱을 떠난 카드는 나중에 떠날수록
            // 위에 있어야 받는 자리에 먼저 받은 카드 위로 쌓인다.
            z={dealt ? 100 + order : 10 + i}
            duration={dealt ? FLIGHT_MS : 400}
          />
        );
      })}
    </>
  );
}

/**
 * 멘탈 포커: 모두가 실제로 섞는 동안 가운데 덱이 갈라졌다 합쳐지기를 되풀이한다.
 * 섞기가 끝나면 나눠 주기 연출(`DealAnimation`)이 이어받는다
 */
export function ShuffleLoop({
  center,
  kind,
  width,
  count,
}: {
  center: Point;
  kind: CardKind;
  /** 덱 카드 한 장 너비 */
  width: number;
  count: number;
}) {
  const [split, setSplit] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setSplit((s) => !s), SHUFFLE_MS / 4);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const half = i % 2 === 0 ? -1 : 1;
        return (
          <Back
            // biome-ignore lint/suspicious/noArrayIndexKey: 덱 연출용 뒷면 카드는 순서가 곧 정체다
            key={i}
            kind={kind}
            width={width}
            at={{
              x: center.x + (split ? half * width * 0.62 : 0),
              y: center.y - i * 0.35,
              scale: 1,
            }}
            rotate={split ? half * 6 : 0}
            z={10 + i}
            duration={400}
          />
        );
      })}
    </>
  );
}
