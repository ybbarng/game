"use client";

import { type ReactNode, useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { HDR_GLOW_SRC } from "@/stardraw/hdr-glow";
import { Emblem3D, EmblemShots } from "./Emblem3D";
import { DRAFT_TIERS } from "./emblem3d/scene";
import { HDR_CHECK_WHITE_SRC, hdrFacetSrc } from "./emblemArt";
import { type MyTier, tierOf } from "./rank";
import { TierEmblem } from "./TierEmblem";
import { TIER_TONE, TierLink } from "./TierTable";
import { DIVISIONS, TIER_IDS, TIER_LABEL, TIER_TABLE } from "./table";
import "@/cube/tiers/emblem.css";

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

        <Draft3d />

        <HdrCheck />

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
                <TierEmblem key={t} tier={t} size={s} />
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

/** 3D 엠블럼 시안(docs/47 14-7): 다이아몬드(보석)·골드(금속) 큰 칸 둘과 찍은 그림 */
function Draft3d() {
  return (
    <section data-emblem3d-draft className="flex flex-col gap-3">
      <h2 className="font-semibold text-sm">3D 시안</h2>
      <div className="flex flex-wrap justify-center gap-4">
        {DRAFT_TIERS.map((t) => (
          <figure key={t} className="flex flex-col items-center gap-1">
            <Emblem3D tier={t} size={300} />
            <figcaption className={cn("font-semibold text-sm", TIER_TONE[t])}>
              {TIER_LABEL[t]}
            </figcaption>
          </figure>
        ))}
      </div>
      <h3 className="font-semibold text-white/80 text-xs">찍은 그림</h3>
      <div className="flex flex-col gap-3">
        {DRAFT_TIERS.map((t) => (
          <EmblemShots key={t} tier={t} />
        ))}
      </div>
    </section>
  );
}

/** 「HDR 확인」 견본: HDR 맥에서 브라우저가 HDR 그림을 HDR로 그리는지, 엠블럼 그림이 충분히 밝은지 가른다 */
function HdrCheck() {
  const [screen, setScreen] = useState<string | null>(null);
  useEffect(() => {
    try {
      const high = matchMedia("(dynamic-range: high)").matches;
      const limit = CSS.supports("dynamic-range-limit", "no-limit");
      setScreen(
        `이 브라우저: 화면 ${high ? "HDR" : "SDR"} · dynamic-range-limit ${limit ? "지원" : "모름"}`,
      );
    } catch {
      setScreen(null);
    }
  }, []);
  // img에는 위치·변형을 걸지 않는다(Safari가 위치·변형 걸린 HDR 그림을 SDR로 그린 적이 있다, docs/36)
  const img = (src: string, px: number) => (
    <span className="block" style={{ width: px, height: px }}>
      {/* biome-ignore lint/performance/noImgElement: HDR 견본 그림은 원본 그대로 보여야 한다 */}
      <img
        src={src}
        alt=""
        width={px}
        height={px}
        draggable={false}
        className="emb-hdr-check block h-full w-full"
      />
    </span>
  );
  const item = (label: string, body: ReactNode) => (
    <figure className="flex flex-col items-center gap-1">
      {body}
      <figcaption className="text-white/60 text-xs">{label}</figcaption>
    </figure>
  );
  return (
    <section data-cube-hdr-check className="flex flex-col gap-2">
      <h2 className="font-semibold text-sm">HDR 확인</h2>
      <p className="text-white/70 text-xs">
        HDR 화면이면 첫 네모가 둘째 네모·흰 글자보다 확실히 밝다. 첫 네모부터
        같아 보이면 브라우저나 화면이 HDR 그림을 HDR로 그리지 않는 것이고, 첫
        네모는 밝은데 엠블럼 빛만 흐리면 엠블럼 그림이 모자란 것이다.
      </p>
      {screen && (
        <p data-cube-hdr-check-screen className="text-white/50 text-xs">
          {screen}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-4">
        {item("HDR 흰색(1000 nit)", img(HDR_CHECK_WHITE_SRC, 64))}
        {item("보통 흰색", <span className="block size-16 bg-white" />)}
        {item(
          "흰 글자",
          <span className="flex h-16 items-center font-black text-3xl text-white">
            흰색
          </span>,
        )}
        {item("별 따기 별빛", img(HDR_GLOW_SRC, 96))}
        {item("다이아몬드 엠블럼 빛", img(hdrFacetSrc("diamond"), 192))}
      </div>
    </section>
  );
}
