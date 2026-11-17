"use client";

import { useEffect, useRef, useState } from "react";

import { changeLine, chartLabel, chartLayout } from "./history-chart";
import { TIER_RING } from "./ladderRing";
import type { TierChange, TierHistoryPoint } from "./rank";
import { TIER_LABEL } from "./table";

/** 그래프 높이(px) */
export const CHART_HEIGHT = 200;

/**
 * 티어 이력(docs/47 14-8, 2026-11-18 사용자 「티어 변화 이력 같은 것도 보이면 좋겠어. 날짜별로 상승하는 그래프라거나..?」).
 * 위에 그래프(가로 판 차례와 날짜 눈금, 세로 그 판까지의 최고 5판 평균, 뒤에 티어 띠, 계단 선, 티어가 바뀐 판에 점),
 * 아래에 바뀐 순간 목록(최신이 위). 5판 평균이 아직 없으면 두지 않는다(큰 칸이 「아직 5판 평균이 없어요」를 보인다)
 */
export function TierHistoryChart({
  n,
  history,
}: {
  n: number;
  history: {
    points: readonly TierHistoryPoint[];
    changes: readonly TierChange[];
  };
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const shown = history.changes.length > 0;
  // 그래프 칸 폭에 맞춰 다시 셈한다(휴대폰 너비에서도 글자가 줄지 않게). 기록이 늦게 읽혀 칸이 나중에 생겨도 잰다
  // biome-ignore lint/correctness/useExhaustiveDependencies: shown은 칸이 생긴 때를 알리는 값
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = () => setWidth(Math.round(el.clientWidth));
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown]);
  if (!shown) return null;
  const layout =
    width > 0 ? chartLayout(n, history, width, CHART_HEIGHT) : null;
  const label = chartLabel(n, history);
  return (
    <section data-cube-tier-history={n} className="flex flex-col gap-2">
      <h2 className="font-semibold">티어 이력</h2>
      <div
        ref={box}
        className="w-full rounded-xl border border-white/10 bg-black/20"
        style={{ height: CHART_HEIGHT }}
      >
        {layout && (
          <svg
            role="img"
            aria-label={label}
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="block"
          >
            {layout.bands.map((b) => (
              <g key={b.tier} data-cube-history-band={b.tier}>
                <rect
                  x={layout.plot.x}
                  y={b.y0}
                  width={layout.width - layout.plot.x - 4}
                  height={b.y1 - b.y0}
                  fill={TIER_RING[b.tier]}
                  fillOpacity={0.14}
                />
                {b.label && (
                  <text
                    x={layout.width - 8}
                    y={(b.y0 + b.y1) / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill={TIER_RING[b.tier]}
                  >
                    {TIER_LABEL[b.tier]}
                  </text>
                )}
              </g>
            ))}
            <polyline
              data-cube-history-line
              points={layout.line.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke="white"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {layout.dots.map(([x, y], i) => {
              const c = history.changes[i] as TierChange;
              return (
                <circle
                  key={`${c.no}-${c.at}`}
                  data-cube-history-dot={c.to.tier}
                  cx={x}
                  cy={y}
                  r={4.5}
                  fill={TIER_RING[c.to.tier]}
                  stroke="#171717"
                  strokeWidth={1.5}
                />
              );
            })}
            {layout.ticks.map((t) => (
              <text
                key={`${t.label}-${t.x}`}
                x={t.x}
                y={layout.height - 6}
                textAnchor={t.anchor}
                fontSize={10}
                fill="rgba(255,255,255,0.45)"
              >
                {t.label}
              </text>
            ))}
          </svg>
        )}
      </div>
      <ol
        data-cube-history-changes
        className="flex flex-col gap-0.5 text-sm tabular-nums"
      >
        {[...history.changes].reverse().map((c) => (
          <li key={`${c.no}-${c.at}`} className="text-white/80">
            {changeLine(c)}
          </li>
        ))}
      </ol>
    </section>
  );
}
