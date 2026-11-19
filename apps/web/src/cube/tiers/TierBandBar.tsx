"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { EmblemStill } from "./EmblemStill";
import { TIER_RING } from "./ladderRing";
import { type BandLayout, bandLayout, bandView } from "./progress-view";
import { tierBand } from "./rank";

/**
 * 지금 구간 안의 자리 막대(기록 창, docs/47 14-9). 막대는 두 경계 바깥까지 꼬리로 조금 이어지고, 두 경계는 막대 안쪽의
 * 눈금이다(사용자 2026-11-19 「양쪽 경계 문구가 기니까, 문구 중간에 바를 표시하는 게」). 왼쪽 눈금 = 지금 구간에 든 경계,
 * 오른쪽 눈금 = 바로 위 구간 경계(꼭대기는 0초), 그 사이의 흰 눈금 = 티어를 정한 최고 5판 평균. 경계 글(엠블럼·이름·시간)은
 * 눈금 아래 가운데, 숫자는 지금 눈금 위 가운데(좌표 셈 `bandLayout`). 사이트 혼자 맞추기 기록 칸과 Cubie 기록 창 사이트
 * 화면이 함께 쓰고, 앱 네이티브 기록 창은 `TierBandView`(`apps/cubie/Sources/Cubie/NativeRecordsWindow.swift`)가 같은 글·
 * 같은 좌표 셈(`TierProgress.bandLayout`)으로 그린다. 5판 평균이 없으면 그리지 않는다
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
  const root = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const [lay, setLay] = useState<BandLayout | null>(null);
  const ratio = band?.ratio ?? 0;

  // 막대 폭과 글 폭을 재서 좌표를 센다. 그릴 때마다 재되(크기를 바꾸면 글이 바뀐다) 같은 좌표면 상태를 두고,
  // 폭이 바뀌면(창 크기·글꼴) 다시 잰다
  useLayoutEffect(() => {
    const r = root.current;
    const l = left.current;
    const rt = right.current;
    const v = value.current;
    if (!r || !l || !rt || !v) return;
    const measure = () => {
      const next = bandLayout(
        ratio,
        r.clientWidth,
        l.offsetWidth,
        rt.offsetWidth,
        v.offsetWidth,
      );
      setLay((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const e of [r, l, rt, v]) ro.observe(e);
    return () => ro.disconnect();
  });

  if (!band) return null;
  const v = bandView(band, ms);
  const color = TIER_RING[band.here.tier];
  // 재기 전(첫 그림)에는 글을 숨겨 자리가 튀지 않게 한다
  const hidden = lay ? undefined : ("hidden" as const);
  const at = (x: number | undefined) => ({ left: x ?? 0, visibility: hidden });
  return (
    <div
      ref={root}
      role="img"
      aria-label={v.label}
      data-cube-tier-band={band.here.tier}
      data-band-ratio={v.ratio}
      className={`relative h-[46px] text-xs tabular-nums ${className ?? ""}`}
    >
      <span
        ref={value}
        data-band-value
        className="absolute top-0 whitespace-nowrap font-semibold"
        style={{ ...at(lay?.valueX), color }}
      >
        {v.value}
      </span>
      <div
        data-band-track
        className="absolute inset-x-0 top-[18px] h-2 rounded-full bg-white/15"
      >
        {lay && (
          <div
            className="absolute inset-y-0"
            style={{
              left: lay.lowX,
              width: lay.markX - lay.lowX,
              backgroundColor: color,
            }}
          />
        )}
      </div>
      {lay && (
        <>
          <div
            aria-hidden="true"
            data-band-tick="low"
            className="absolute top-[15px] h-[14px] w-0.5 -translate-x-1/2 rounded-full bg-white/70"
            style={{ left: lay.lowX }}
          />
          <div
            aria-hidden="true"
            data-band-tick="high"
            className="absolute top-[15px] h-[14px] w-0.5 -translate-x-1/2 rounded-full bg-white/70"
            style={{ left: lay.highX }}
          />
          <div
            aria-hidden="true"
            data-band-mark
            className="absolute top-[14px] h-4 w-1 -translate-x-1/2 rounded-full bg-white"
            style={{ left: lay.markX }}
          />
        </>
      )}
      <span
        ref={left}
        data-band-left
        className="absolute top-[30px] flex items-center gap-1 whitespace-nowrap"
        style={at(lay?.leftX)}
      >
        <EmblemStill tier={band.here.tier} size={16} />
        <span className="text-white/80">{v.leftName}</span>
        <span className="text-white/60">{v.leftTime}</span>
      </span>
      <span
        ref={right}
        data-band-right
        className="absolute top-[30px] flex items-center gap-1 whitespace-nowrap"
        style={at(lay?.rightX)}
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
  );
}
