"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

import { stillSrc } from "./emblem3d/still";
import { divisionPips, PALETTE, TierEmblem } from "./TierEmblem";
import type { Division, TierId } from "./table";

/**
 * 티어 엠블럼 정지 그림(docs/47 14-7 「정지 그림」): 3D 엠블럼을 정면에서 찍은 그림(`emblem3d/still.ts`). 티어표·기록·티어
 * 화면 등 3D 장면을 띄우지 않는 곳에서 쓴다. 그림 파일을 못 받으면 평면 SVG 엠블럼(`TierEmblem`)으로 바꾼다. 로딩
 * 중에는 평면을 보이지 않는다(빈 자리, 고정 규칙 2-1절).
 */
export function EmblemStill({
  tier,
  size = 32,
  division = null,
  label,
  className,
}: {
  tier: TierId;
  /** 너비(px). 구간 표시가 있으면 아래로 조금 길다 */
  size?: number;
  /** 있으면 아래에 구간 표시(28px 아래에서는 그리지 않는다, `TierEmblem`과 같다) */
  division?: Division | null;
  /** 주면 이름이 있는 그림(읽어 주기)으로, 없으면 장식 */
  label?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <TierEmblem
        tier={tier}
        size={size}
        division={division}
        {...(className ? { className } : {})}
        {...(label ? { label } : {})}
      />
    );
  const pips = division !== null && size >= 28;
  const p = PALETTE[tier];
  return (
    <span
      data-cube-emblem={tier}
      data-cube-emblem-still=""
      {...(pips && division ? { "data-cube-emblem-division": division } : {})}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
      className={cn("inline-flex shrink-0 flex-col items-center", className)}
      style={{ width: size }}
    >
      {/* biome-ignore lint/performance/noImgElement: 정적 내보내기의 작은 그림이라 next/image가 필요 없다 */}
      <img
        src={stillSrc(tier, size)}
        alt=""
        width={size}
        height={size}
        draggable={false}
        decoding="async"
        onError={() => setBroken(true)}
        // 정적 HTML이라 붙기 전에 이미 실패했으면 onError가 오지 않는다
        ref={(el) => {
          if (el?.complete && el.naturalWidth === 0) setBroken(true);
        }}
        className="block"
        style={{ width: size, height: size }}
      />
      {pips && division && (
        <svg
          viewBox="0 0 64 10"
          width={size}
          height={(size * 10) / 64}
          aria-hidden
          className="block"
        >
          {/* 구간: 마름모 넷 가운데 켜진 개수(TierEmblem과 같은 모양) */}
          {[0, 1, 2, 3].map((i) => {
            const x = 32 + (i - 1.5) * 9;
            const on = i < divisionPips(division);
            return (
              <polygon
                key={i}
                points={`${x},1.6 ${x + 3.2},5 ${x},8.4 ${x - 3.2},5`}
                fill={on ? p.accent : "#ffffff"}
                fillOpacity={on ? 1 : 0.16}
                stroke={on ? p.dark : "none"}
                strokeWidth="0.6"
              />
            );
          })}
        </svg>
      )}
    </span>
  );
}
