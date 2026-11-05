"use client";

import { type RefObject, useLayoutEffect, useRef } from "react";

import { prefersReducedMotion } from "@/game/timing";

import {
  FLIP_STEP_MS,
  type FlipMove,
  type FlipSpot,
  type FlipSpots,
  sceneFlights,
} from "./flight-plan";
import type { CardFlights } from "./flights";

/*
 * 장면이 바뀔 때 카드가 앞 장면 자리에서 새 자리로 옮겨 가는 연출. 화면은 늘 새 장면 그대로 그리고, 옮긴 카드는
 * 날아가는 카드 줄(`useCardFlights`)의 겉그림이 앞 자리에서 새 자리로 날아가는 동안 새 자리에서 가린다.
 * 카드 그림·배치와 상관없다: 무대 안에서 `data-flip="<id>"`를 단 요소를 따라간다(화투 손패·바닥·먹은 패, 더미,
 * 뒷면 부채 등). `data-flip-zone`을 단 조상이 있으면 그 이름을 함께 기억한다(예: "floor"). 한 장면 안의 움직임은
 * 걸음(`step`)으로 나눠 차례로 움직인다(동시에 움직이지 않게). 계획은 `sceneFlights`(순수 함수)
 */

export { FLIP_STEP_MS, type FlipMove, type FlipSpot, type FlipSpots };

export interface CardFlipOptions<C extends string = string> {
  /** 무대(좌표 기준이자 `data-flip`을 찾는 곳). 같은 무대 안에 `FlightLayer`를 둔다 */
  stage: RefObject<HTMLElement | null>;
  /** 장면을 나타내는 값. 바뀌면 앞 장면과 비교해 움직인다 */
  scene: unknown;
  /** 겉그림을 띄울 날아가는 카드 줄 */
  fx: Pick<CardFlights<C>, "run">;
  /** `data-flip` 이름의 앞면 카드(뒷면 부채·더미처럼 뒷면이면 null) */
  faceOf: (id: string) => C | null;
  /**
   * 이번 장면에서 일부러 움직일 카드(걸음·출발·들름). 여기 없는 카드는 자리가 바뀌었으면 첫 걸음에 옮긴다
   */
  moves?: (prev: FlipSpots, next: FlipSpots) => readonly FlipMove[];
  /** 연출을 건너뛴다(나눠 주는 장면 등). 움직임 줄이기 설정이면 늘 건너뛴다 */
  skip?: boolean;
  /** 한 걸음 시간. 기본 `FLIP_STEP_MS` */
  stepMs?: number;
}

/** 걸음 수만큼의 연출 시간(움직임 줄이기면 0). 다음 장면을 이만큼 늦게 보이게 할 때 쓴다 */
export function flipMs(steps: number, stepMs = FLIP_STEP_MS): number {
  return prefersReducedMotion() ? 0 : Math.max(0, steps) * stepMs;
}

function measure(root: HTMLElement): Map<string, FlipSpot> {
  const base = root.getBoundingClientRect();
  const spots = new Map<string, FlipSpot>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-flip]")) {
    const id = el.dataset.flip;
    if (!id || spots.has(id)) continue;
    const r = el.getBoundingClientRect();
    spots.set(id, {
      rect: {
        x: r.left - base.left,
        y: r.top - base.top,
        w: r.width,
        h: r.height,
      },
      zone:
        el.closest<HTMLElement>("[data-flip-zone]")?.dataset.flipZone ?? null,
    });
  }
  return spots;
}

/** 장면이 바뀔 때 카드를 앞 자리에서 새 자리로 옮겨 보인다(설명은 파일 위) */
export function useCardFlip<C extends string = string>({
  stage,
  scene,
  fx,
  faceOf,
  moves,
  skip = false,
  stepMs = FLIP_STEP_MS,
}: CardFlipOptions<C>): void {
  const prev = useRef<Map<string, FlipSpot> | null>(null);
  const lastScene = useRef<unknown>(scene);
  const latest = useRef({ fx, faceOf, moves });
  latest.current = { fx, faceOf, moves };

  useLayoutEffect(() => {
    const root = stage.current;
    if (!root) return;
    const changed = lastScene.current !== scene;
    lastScene.current = scene;
    // 겉그림은 실제 카드를 움직이지 않으므로 언제 재어도 장면 자리 그대로다
    const next = measure(root);
    const before = prev.current;
    prev.current = next;
    if (!changed || !before || skip || prefersReducedMotion()) return;
    const { fx: line, faceOf: face, moves: plan } = latest.current;
    const { steps, duration } = sceneFlights(
      before,
      next,
      plan?.(before, next) ?? [],
      face,
      stepMs,
    );
    line.run(steps, duration);
  });
}
