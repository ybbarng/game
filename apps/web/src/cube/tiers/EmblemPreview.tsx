"use client";

import { type ReactNode, useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { HDR_GLOW_SRC } from "@/stardraw/hdr-glow";
import { Emblem3D, EmblemGrid, EmblemShots } from "./Emblem3D";
import {
  defaultStyle,
  GEM_STYLE_LABEL,
  type GemStyle,
  gemStyleOf,
  styleForTier,
  stylesForTier,
} from "./emblem3d/gemStyle";
import { BIG_SIZE, DRAFT_SIZE, POSTER_PAGE } from "./emblem3d/poster";
import { DRAFT_TIERS, type DraftTier } from "./emblem3d/scene";
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

/**
 * 3D 엠블럼 시안(docs/47 14-7): 열 티어를 찍은 그림 격자로 보이고, 고른 하나만 큰 칸에서 살아 있는 3D로 끌어 돌려 본다
 * (기본 다이아몬드). 아래는 고른 티어의 찍은 그림(작은 크기·각도 여섯 장).
 */
/** 주소 쿼리 하나를 바꾼다(다시 불러도 같은 시안·바탕·티어로 열리게). 값이 null이면 뺀다 */
function setParam(key: string, value: string | null): void {
  try {
    const u = new URL(window.location.href);
    if (value === null) u.searchParams.delete(key);
    else u.searchParams.set(key, value);
    window.history.replaceState(window.history.state, "", u);
  } catch {
    // 주소를 못 바꾸면 화면만 바꾼다
  }
}

/** 단추 한 줄 */
function Choice<V extends string | boolean>({
  items,
  value,
  onPick,
  data,
}: {
  items: readonly (readonly [V, string])[];
  value: V;
  onPick: (v: V) => void;
  data: string;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 text-xs">
      {items.map(([v, label]) => (
        <button
          key={label}
          type="button"
          {...{ [data]: String(v) }}
          aria-pressed={value === v}
          onClick={() => onPick(v)}
          className={cn(
            "rounded-lg px-2 py-1 ring-1 ring-white/20",
            value === v ? "bg-white/15" : "hover:bg-white/5",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Draft3d() {
  const [tier, setTier] = useState<DraftTier>("diamond");
  // 보석이 뒤를 비추는지 견주어 보는 바탕(`?emblemBg=light`로 밝게 시작)
  const [light, setLight] = useState(false);
  // 에메랄드 시안(`?gem=a|b|c|d|now`). 고르면 에메랄드를 크게 본다
  const [gem, setGem] = useState<GemStyle | null>(null);
  const [view, setView] = useState<"front" | "turned">("front");
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      setLight(q.get("emblemBg") === "light");
      const g = gemStyleOf(window.location.search);
      setGem(g);
      const t = DRAFT_TIERS.find((x) => x === q.get("tier"));
      // ?tier=diamond&gem=n 처럼 그 티어에 쓸 수 있는 시안이면 그 티어, 아니면 시안이 있는 에메랄드
      if (t && (!g || styleForTier(t, g))) setTier(t);
      else if (g) setTier("emerald");
      setAuto(q.get("auto") === "1");
    } catch {
      setLight(false);
    }
  }, []);
  // 무대를 새로 지으면 정면에서 시작한다(대기 그림이 정면이다)
  const rebuild = () => setView("front");
  const pickTier = (t: DraftTier) => {
    if (t !== tier) rebuild();
    setTier(t);
    setParam("tier", t);
  };
  // 고른 시안이 이 티어에 맞지 않으면 그 티어의 기본 시안(화려함 사다리)으로 연다
  const style = styleForTier(tier, gem) ?? defaultStyle(tier);
  const size = style ? BIG_SIZE : DRAFT_SIZE;
  // 그 티어의 시안 단추(금속 티어는 전부를 보이고, 누르면 에메랄드로)
  const styleItems = stylesForTier(tier);
  return (
    <section data-emblem3d-draft className="flex flex-col gap-3">
      <h2 className="font-semibold text-sm">3D 시안</h2>
      <EmblemGrid tiers={DRAFT_TIERS} selected={tier} onSelect={pickTier} />
      <Choice
        data="data-emblem3d-gem"
        items={styleItems.map((s) => [s, GEM_STYLE_LABEL[s]] as const)}
        value={style ?? ("" as GemStyle)}
        onPick={(s) => {
          rebuild();
          setGem(s);
          const t = styleForTier(tier, s) ? tier : "emerald";
          setTier(t);
          setParam("gem", s);
          setParam("tier", t);
        }}
      />
      <Choice
        data="data-emblem3d-bg"
        items={[
          [false, "어두운 바탕"],
          [true, "밝은 바탕"],
        ]}
        value={light}
        onPick={(on) => {
          rebuild();
          setLight(on);
          setParam("emblemBg", on ? "light" : null);
        }}
      />
      <div className="flex flex-wrap justify-center gap-2">
        <Choice
          data="data-emblem3d-view"
          items={[
            ["front", "정면"],
            ["turned", "돌린 각"],
          ]}
          value={view}
          onPick={(v) => {
            setAuto(false);
            setView(v);
          }}
        />
        <Choice
          data="data-emblem3d-auto"
          items={[[true, "자동 회전"]]}
          value={auto}
          onPick={() => setAuto(!auto)}
        />
      </div>
      <figure className="flex flex-col items-center gap-1">
        <Emblem3D
          tier={tier}
          size={size}
          pageColor={light ? POSTER_PAGE.light : undefined}
          gemStyle={style}
          view={view}
          auto={auto}
        />
        <figcaption className={cn("font-semibold text-sm", TIER_TONE[tier])}>
          {TIER_LABEL[tier]}
          {style ? ` · ${GEM_STYLE_LABEL[style]}` : ""}
        </figcaption>
      </figure>
      <h3 className="font-semibold text-white/80 text-xs">찍은 그림</h3>
      <EmblemShots key={`${tier}-${style}`} tier={tier} gemStyle={style} />
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
