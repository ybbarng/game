"use client";

import { EmblemStill } from "./EmblemStill";
import { TIER_RING } from "./ladderRing";
import { bandView } from "./progress-view";
import { tierBand } from "./rank";

/**
 * 지금 구간 안의 자리 막대(기록 창, docs/47 14-9). 왼쪽 끝 = 지금 구간에 든 경계, 오른쪽 끝 = 바로 위 구간 경계
 * (꼭대기는 0초), 표시 = 티어를 정한 최고 5판 평균. 사이트 혼자 맞추기 기록 칸과 Cubie 기록 창 사이트 화면이 함께 쓰고,
 * 앱 네이티브 기록 창은 `TierBandView`(`apps/cubie/Sources/Cubie/NativeRecordsWindow.swift`)가 같은 글·자리로 그린다.
 * 5판 평균이 없으면 그리지 않는다
 */
export function TierBandBar({
  n,
  ms,
  className,
}: {
  n: number;
  /** 최고 5판 평균(ms) */
  ms: number;
  className?: string;
}) {
  const band = tierBand(n, ms);
  if (!band) return null;
  const v = bandView(band, ms);
  const color = TIER_RING[band.here.tier];
  const pct = `${(v.ratio * 100).toFixed(3)}%`;
  return (
    <div
      role="img"
      aria-label={v.label}
      data-cube-tier-band={band.here.tier}
      data-band-ratio={v.ratio}
      className={`flex flex-col gap-0.5 text-xs tabular-nums ${className ?? ""}`}
    >
      {/* 숫자는 막대 안쪽으로 밀어 넣는다: 자리만큼 왼쪽으로 옮기고 제 너비의 같은 비율만큼 되돌린다 */}
      <div className="relative h-4">
        <span
          data-band-value
          className="absolute top-0 whitespace-nowrap font-semibold"
          style={{ left: pct, transform: `translateX(-${pct})`, color }}
        >
          {v.value}
        </span>
      </div>
      <div data-band-track className="relative h-2 rounded-full bg-white/15">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: pct, backgroundColor: color }}
        />
        <div
          aria-hidden="true"
          data-band-mark
          className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-white"
          style={{ left: pct }}
        />
      </div>
      <div className="flex items-start justify-between gap-2">
        <span
          data-band-left
          className="flex min-w-0 items-center gap-1 break-keep"
        >
          <EmblemStill tier={band.here.tier} size={16} />
          <span className="text-white/80">{v.leftName}</span>
          <span className="text-white/60">{v.leftTime}</span>
        </span>
        <span
          data-band-right
          className="flex min-w-0 items-center justify-end gap-1 break-keep text-right"
        >
          {band.up && (
            <>
              <EmblemStill tier={band.up.tier} size={16} />
              <span className="text-white/80">{v.rightName}</span>
            </>
          )}
          <span className="text-white/60">{v.rightTime}</span>
        </span>
      </div>
    </div>
  );
}
