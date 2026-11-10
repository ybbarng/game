"use client";

import { cn } from "@/lib/cn";

import { formatMs } from "../records";

/**
 * 섞은 판을 다 맞춘 순간의 짧은 축하(docs/47 15-22, 사용자 2026-11-10 「너무 과하지는 않고 심플하게」).
 * 차례대로 하나씩 움직인다(globals.css `mini-cheer-*`):
 * 1. 큐브가 살짝 움츠렸다 통 튄다(0~0.48초, 감싼 `wrapRef`에 `mini-cheer-pop`). 1.02배까지만 커져 작은 창에서도 잘리지 않는다.
 * 2. 큐브 둘레에 옅은 빛 고리가 한 번 퍼졌다 사라진다(0.42~1.32초).
 * 3. 이번 시간을 큐브 아래에 작게 보였다 지운다(0.6~2.4초, 숫자만, 최고 기록이면 금색).
 * 맞추는 동안은 시간을 숨기니(쫓기지 않게) 다 맞춘 뒤 한 번 보여 주는 것이 결과를 확인하는 자연스러운 끝이다.
 * 기록 창을 열지 않아도 이번 판이 몇 초였는지 안다.
 * 「동작 줄이기」면 튀기·퍼지기 없이 빛과 숫자가 잠깐 나타났다 사라지기만 한다. 이 조각이 붙어 있는 동안만 CSS가 움직이고
 * 3D 장면은 다시 그리지 않는다(감싼 칸의 CSS 변형이라 화면 합성만 한다).
 */

/** 축하 조각이 붙어 있는 시간(ms). 숫자가 사라지는 끝까지 */
export const CHEER_MS = 2400;

export interface CheerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function SolveCheer({
  ms,
  best,
  reduced,
  cube,
}: {
  ms: number;
  best: boolean;
  reduced: boolean;
  /** 큐브가 차지한 사각형(창 왼쪽 위 기준 px). 모르면 창 가운데 */
  cube: CheerRect | null;
}) {
  const side = cube ? Math.max(cube.w, cube.h) : null;
  return (
    <div
      data-mini-cheer={best ? "best" : ""}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <span
        className={cn(
          "mini-cheer-glow absolute block rounded-full",
          reduced && "mini-cheer-still",
        )}
        style={
          cube && side
            ? {
                left: cube.x + cube.w / 2 - side * 0.65,
                top: cube.y + cube.h / 2 - side * 0.65,
                width: side * 1.3,
                height: side * 1.3,
              }
            : {
                left: "15%",
                top: "15%",
                width: "70%",
                height: "70%",
              }
        }
      />
      <span
        data-mini-cheer-time
        className={cn(
          "mini-cheer-time absolute bottom-[4%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-[0.6em] py-[0.15em] font-mono font-semibold tabular-nums",
          "text-[clamp(8px,11vmin,13px)]",
          best ? "text-amber-200" : "text-white/90",
        )}
      >
        {formatMs(ms)}
      </span>
    </div>
  );
}
