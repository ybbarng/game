"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { EmblemStill } from "./EmblemStill";
import { TIER_RING } from "./ladderRing";
import {
  BAND_ALPHA,
  BAND_EMBLEM,
  BAND_GAP,
  type BandLayout,
  bandLayout,
  bandView,
} from "./progress-view";
import { type TierPlace, tierBand } from "./rank";

/** `#rrggbb` + 진하기 → `rgba(…)` */
function tint(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** 칸 이름 글(엠블럼 정지 그림 + 구간 이름). `short`면 엠블럼만 */
function NameLabel({
  place,
  name,
  strong,
  short,
}: {
  place: TierPlace;
  name: string;
  strong?: boolean;
  short?: boolean;
}): ReactNode {
  return (
    <>
      <EmblemStill tier={place.tier} size={BAND_EMBLEM} />
      {!short && (
        <span
          className={
            strong ? "font-semibold text-white" : "text-[11px] text-white/55"
          }
        >
          {name}
        </span>
      )}
    </>
  );
}

/**
 * 지금 구간 안의 자리 막대(기록 창, docs/47 14-9). 세 칸 사다리다(사용자 2026-11-19 「뭔가 애매해 보이네」): 왼쪽 칸 = 바로 아래
 * 구간, 가운데 칸 = 지금 구간, 오른쪽 칸 = 바로 위 구간, 칸마다 그 티어 색(`TIER_RING`). 지금 칸의 지나온 부분(왼쪽 경계~지금
 * 자리)은 진하게, 남은 부분은 같은 색을 연하게, 옆 칸은 그보다 더 흐리게(`BAND_ALPHA`). 경계는 색이 바뀌는 자리와 1px 틈.
 * 경계 시간은 경계 바로 아래, 칸 이름(엠블럼·이름)은 그 아래 줄 칸 가운데, 숫자는 지금 자리 위 가운데(좌표 셈 `bandLayout`).
 * 꼭대기·맨 아래는 옆 칸 없이 지금 칸이 막대 끝까지 간다. 사이트 혼자 맞추기 기록 칸과 Cubie 기록 창 사이트 화면이 함께 쓰고,
 * 앱 네이티브 기록 창은 `TierBandView`(`apps/cubie/Sources/Cubie/NativeRecordsWindow.swift`)가 같은 글·같은 좌표 셈
 * (`TierProgress.bandLayout`)으로 그린다. 5판 평균이 없으면 그리지 않는다
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
  const mDown = useRef<HTMLSpanElement>(null);
  const mHere = useRef<HTMLSpanElement>(null);
  const mUp = useRef<HTMLSpanElement>(null);
  const low = useRef<HTMLSpanElement>(null);
  const high = useRef<HTMLSpanElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const [lay, setLay] = useState<BandLayout | null>(null);
  const ratio = band?.ratio ?? 0;

  // 막대 폭과 글 폭을 재서 좌표를 센다. 칸 이름은 늘 다 보이는 꼴로 따로 재 둔 글(`data-band-measure`)로 재서, 엠블럼만 둘
  // 때도 폭이 오락가락하지 않게 한다. 그릴 때마다 재되 같은 좌표면 상태를 두고, 폭이 바뀌면(창 크기·글꼴) 다시 잰다
  useLayoutEffect(() => {
    const r = root.current;
    const h = mHere.current;
    const l = low.current;
    const hi = high.current;
    const v = value.current;
    if (!r || !h || !l || !hi || !v) return;
    const measure = () => {
      const next = bandLayout(ratio, {
        width: r.clientWidth,
        down: mDown.current?.offsetWidth ?? null,
        here: h.offsetWidth,
        up: mUp.current?.offsetWidth ?? null,
        low: l.offsetWidth,
        high: hi.offsetWidth,
        value: v.offsetWidth,
      });
      setLay((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const e of [r, h, l, hi, v, mDown.current, mUp.current])
      if (e) ro.observe(e);
    return () => ro.disconnect();
  });

  if (!band) return null;
  const v = bandView(band, ms);
  const color = TIER_RING[band.here.tier];
  // 재기 전(첫 그림)에는 글을 숨겨 자리가 튀지 않게 한다
  const hidden = lay ? undefined : ("hidden" as const);
  const at = (x: number | null | undefined) => ({
    left: x ?? 0,
    visibility: hidden,
  });
  const name = "absolute top-[46px] flex items-center gap-1 whitespace-nowrap";
  return (
    <div
      ref={root}
      role="img"
      aria-label={v.label}
      data-cube-tier-band={band.here.tier}
      data-band-ratio={v.ratio}
      className={`relative h-[62px] text-xs tabular-nums ${className ?? ""}`}
    >
      {/* 재기만 하는 글(보이지 않음): 칸 이름을 다 보이는 꼴로 */}
      <span aria-hidden="true" className="invisible absolute top-0 left-0">
        {band.down && v.downName && (
          <span ref={mDown} data-band-measure="down" className={name}>
            <NameLabel place={band.down} name={v.downName} />
          </span>
        )}
        <span ref={mHere} data-band-measure="here" className={name}>
          <NameLabel place={band.here} name={v.hereName} strong />
        </span>
        {band.up && v.upName && (
          <span ref={mUp} data-band-measure="up" className={name}>
            <NameLabel place={band.up} name={v.upName} />
          </span>
        )}
      </span>
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
        className="absolute inset-x-0 top-[18px] h-2 overflow-hidden rounded-full"
      >
        {lay && (
          <>
            {band.down && (
              <div
                data-band-cell="down"
                className="absolute inset-y-0"
                style={{
                  left: 0,
                  width: lay.lowX - BAND_GAP,
                  backgroundColor: tint(
                    TIER_RING[band.down.tier],
                    BAND_ALPHA.side,
                  ),
                }}
              />
            )}
            <div
              data-band-cell="here"
              className="absolute inset-y-0"
              style={{
                left: lay.lowX,
                width: lay.highX - lay.lowX,
                backgroundColor: tint(color, BAND_ALPHA.rest),
              }}
            >
              <div
                data-band-done
                className="absolute inset-y-0 left-0"
                style={{
                  width: lay.markX - lay.lowX,
                  backgroundColor: tint(color, BAND_ALPHA.done),
                }}
              />
            </div>
            {band.up && (
              <div
                data-band-cell="up"
                className="absolute inset-y-0"
                style={{
                  left: lay.highX + BAND_GAP,
                  right: 0,
                  backgroundColor: tint(
                    TIER_RING[band.up.tier],
                    BAND_ALPHA.side,
                  ),
                }}
              />
            )}
          </>
        )}
      </div>
      {lay && (
        <div
          aria-hidden="true"
          data-band-mark
          className="absolute top-[14px] h-4 w-1 -translate-x-1/2 rounded-full bg-white"
          style={{ left: lay.markX }}
        />
      )}
      <span
        ref={low}
        data-band-time="low"
        className="absolute top-[29px] whitespace-nowrap text-white/60"
        style={at(lay?.lowTimeX)}
      >
        {v.lowTime}
      </span>
      <span
        ref={high}
        data-band-time="high"
        className="absolute top-[29px] whitespace-nowrap text-white/60"
        style={at(lay?.highTimeX)}
      >
        {v.highTime}
      </span>
      {band.down && v.downName && (
        <span data-band-name="down" className={name} style={at(lay?.downX)}>
          <NameLabel
            place={band.down}
            name={v.downName}
            short={lay?.downShort ?? false}
          />
        </span>
      )}
      <span data-band-name="here" className={name} style={at(lay?.hereX)}>
        <NameLabel place={band.here} name={v.hereName} strong />
      </span>
      {band.up && v.upName && (
        <span data-band-name="up" className={name} style={at(lay?.upX)}>
          <NameLabel
            place={band.up}
            name={v.upName}
            short={lay?.upShort ?? false}
          />
        </span>
      )}
    </div>
  );
}
