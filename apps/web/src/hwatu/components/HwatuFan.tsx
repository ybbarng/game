"use client";

import { fanSlot } from "@/layout/compute-layout";

import type { HwatuLayout } from "../table-layout";
import { HwatuCardView } from "./HwatuCard";

/**
 * 다른 사람 손패 뒷면 부채(하트·마이티처럼 자리 판 뒤에서 판 쪽으로 펼친다). 자리 판(z 20) 아래에 깔린다.
 * `offset`은 나부터 차례 순서로 몇 번째 자리인가
 */
export function HwatuFan({
  layout,
  offset,
  count,
}: {
  layout: HwatuLayout;
  offset: number;
  count: number;
}) {
  const { fan } = layout;
  return (
    <div
      role="img"
      aria-label={`뒷면 ${count}장`}
      data-fan={offset}
      className="pointer-events-none absolute inset-0"
    >
      {Array.from({ length: count }, (_, i) => {
        const at = fanSlot(layout, offset, i, count, fan);
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: 뒷면은 순서가 곧 정체다
            key={i}
            className="absolute inline-flex transition-[left,top,transform] duration-300"
            style={{
              left: at.x - fan.w / 2,
              top: at.y - fan.h / 2,
              transform: `rotate(${at.rotate}deg)`,
              zIndex: 1 + i,
            }}
          >
            <HwatuCardView faceDown width={fan.w} flip={`fan-${offset}-${i}`} />
          </span>
        );
      })}
    </div>
  );
}
