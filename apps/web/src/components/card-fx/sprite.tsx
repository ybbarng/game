"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import type { Point } from "@/layout/compute-layout";
import { cn } from "@/lib/cn";

import { type CardShape, cardHeight } from "./kind";

/*
 * 카드 연출의 바탕(마이티·하트·원카드·화투 공통, docs/05 4.12). 카드 그림과 상관없이 "무대 위 한 장이 어디에서
 * 어디로 가나"만 다룬다. 카드 그림은 쓰는 쪽이 `children`으로 넣는다
 */

/** 무대 위 카드 한 장의 자리(카드 가운데 좌표) */
export interface CardPosition {
  x: number;
  y: number;
  scale?: number;
  opacity?: number;
}

/** 카드가 한 자리에서 다른 자리로 옮겨 가는 시간(ms). 화면의 `duration-300`과 같다 */
export const CARD_MOVE_MS = 300;

/** 낸 카드를 걷어 가는 시간(ms). 마이티·하트 store의 TRICK_COLLECT와 같다 */
export const COLLECT_MS = 380;

/** 걷어 가기: 가져가는 사람 쪽으로 작아지며 사라진다 */
export function collectTo(p: Point): CardPosition {
  return { x: p.x, y: p.y, scale: 0.3, opacity: 0 };
}

/** 카드 가운데 좌표·기울기·크기를 CSS transform으로 */
export function spriteTransform(
  p: CardPosition,
  w: number,
  h: number,
  rotate: number,
): string {
  return `translate(${p.x - w / 2}px, ${p.y - h / 2}px) rotate(${rotate}deg) scale(${p.scale ?? 1})`;
}

/**
 * 처음 나타날 때 `from`에서 출발해야 하는가. 출발 자리를 한 번 그린 다음 목표로 옮겨야 CSS 전환이 일어나므로,
 * 두 프레임 뒤에 `true`가 된다. `from`이 없으면 처음부터 `true`
 */
export function useArrival(hasFrom: boolean): boolean {
  const [arrived, setArrived] = useState(!hasFrom);
  useEffect(() => {
    if (arrived) return;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setArrived(true)),
    );
    return () => cancelAnimationFrame(id);
  }, [arrived]);
  return arrived;
}

/** `PlayingCard`·`CardSprite`가 함께 쓰는 자리 스타일 */
export function spriteStyle({
  at,
  from,
  arrived,
  width,
  height,
  rotate = 0,
  z = 0,
  delay = 0,
  duration,
}: {
  at: CardPosition;
  from?: CardPosition | undefined;
  arrived: boolean;
  width: number;
  height: number;
  rotate?: number;
  z?: number;
  delay?: number;
  duration?: number | undefined;
}): CSSProperties {
  const position = arrived || from === undefined ? at : from;
  return {
    width,
    height,
    zIndex: z,
    transform: spriteTransform(position, width, height, arrived ? rotate : 0),
    opacity: position.opacity ?? 1,
    transitionDelay: `${delay}ms`,
    ...(duration ? { transitionDuration: `${duration}ms` } : {}),
  };
}

/**
 * 위치가 바뀌면 그 자리로 날아가는 카드 한 장(그림은 `children`, 높이는 카드 종류가 정한다). 누르기는 받지 않는다
 */
export function CardSprite({
  kind,
  width,
  at,
  from,
  rotate = 0,
  z = 0,
  delay = 0,
  duration,
  className,
  children,
}: {
  kind: CardShape;
  width: number;
  at: CardPosition;
  /** 처음 나타날 때 출발하는 곳 */
  from?: CardPosition;
  rotate?: number;
  z?: number;
  delay?: number;
  /** 움직이는 시간(ms). 기본 `CARD_MOVE_MS` */
  duration?: number;
  className?: string;
  children: ReactNode;
}) {
  const arrived = useArrival(from !== undefined);
  const height = cardHeight(kind, width);
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-0 left-0",
        "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
        className,
      )}
      style={spriteStyle({
        at,
        from,
        arrived,
        width,
        height,
        rotate,
        z,
        delay,
        duration,
      })}
    >
      {children}
    </div>
  );
}
