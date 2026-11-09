"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { type MyTier, tierOf } from "./rank";
import { TierEmblem } from "./TierEmblem";
import { TIER_TONE, TierLink } from "./TierTable";
import { DIVISIONS, TIER_IDS, TIER_LABEL, TIER_TABLE } from "./table";

const SIZES = [64, 32, 24, 16] as const;

/** 3×3 표의 티어마다 구간 II 상한(구간이 없으면 그 티어 상한)을 Ao5로 본 내 티어 */
const LINK_SAMPLES: MyTier[] = (TIER_TABLE[3] ?? []).flatMap((row) => {
  const cut = row.cuts[row.cuts.length === 4 ? 2 : 0] as number;
  const ao5 = Math.round(cut * 1000);
  const place = tierOf(3, ao5);
  return place ? [{ n: 3, ao5, place }] : [];
});

/** 티어 엠블럼 미리보기(`/cube/tiers/emblems`, 개발용) */
export function EmblemPreview() {
  const [hdr, setHdr] = useState(false);
  useEffect(() => {
    try {
      setHdr(new URLSearchParams(window.location.search).get("hdr") === "1");
    } catch {
      // 주소를 못 읽으면 보통 모습
    }
  }, []);

  return (
    <main
      data-game="cube"
      data-cube-emblem-preview
      className={cn(
        "min-h-dvh bg-neutral-900 text-white",
        hdr && "emb-hdr-force",
      )}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-4">
        <h1 className="font-bold text-lg">티어 엠블럼</h1>

        <section
          data-cube-emblem-big
          className="flex flex-wrap justify-center gap-x-4 gap-y-4"
        >
          {TIER_IDS.map((t) => (
            <figure key={t} className="flex w-28 flex-col items-center gap-1">
              <TierEmblem
                tier={t}
                size={112}
                division={
                  t === "grandmaster" || t === "challenger" ? null : "I"
                }
                still={hdr}
              />
              <figcaption className={cn("font-semibold text-sm", TIER_TONE[t])}>
                {TIER_LABEL[t]}
              </figcaption>
            </figure>
          ))}
        </section>

        <section data-cube-emblem-sizes className="flex flex-col gap-2">
          {SIZES.map((s) => (
            <div key={s} className="flex flex-wrap items-center gap-3">
              <span className="w-10 text-right text-white/50 text-xs">
                {s}px
              </span>
              {TIER_IDS.map((t) => (
                <TierEmblem key={t} tier={t} size={s} still={hdr} />
              ))}
            </div>
          ))}
        </section>

        <section
          data-cube-emblem-divisions
          className="flex flex-wrap items-end gap-4"
        >
          {DIVISIONS.map((d) => (
            <figure key={d} className="flex flex-col items-center gap-1">
              <TierEmblem tier="gold" size={48} division={d} />
              <figcaption className="text-white/60 text-xs">
                골드 {d}
              </figcaption>
            </figure>
          ))}
        </section>

        {/* 기록 칸과 같은 TierLink(구간 없는 그랜드마스터·챌린저는 이름만) */}
        <section data-cube-emblem-links className="flex flex-col gap-1 text-sm">
          {LINK_SAMPLES.map((mine) => (
            <p key={mine.place.tier}>
              <span className="text-white/50">티어 </span>
              <TierLink mine={mine} />
            </p>
          ))}
        </section>
      </div>
    </main>
  );
}
