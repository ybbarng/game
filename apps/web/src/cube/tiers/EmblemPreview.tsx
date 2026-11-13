"use client";

import { type ReactNode, useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { HDR_GLOW_SRC } from "@/stardraw/hdr-glow";
import { Emblem3D, EmblemGrid, EmblemShots } from "./Emblem3D";
import { EmblemStill } from "./EmblemStill";
import { emblemSize, POSTER_PAGE } from "./emblem3d/poster";
import { DRAFT_TIERS, type DraftTier } from "./emblem3d/scene";
import type { ShotJob } from "./emblem3d/stage";
import { HDR_CHECK_WHITE_SRC } from "./emblemArt";
import { type MyTier, tierOf } from "./rank";
import { TierEmblem } from "./TierEmblem";
import { TIER_TONE, TierLink } from "./TierTable";
import { DIVISIONS, TIER_IDS, TIER_LABEL, TIER_TABLE } from "./table";
import "@/cube/tiers/emblem.css";

/** 3×3 표의 티어마다 구간 II 상한(구간이 없으면 그 티어 상한)을 Ao5로 본 내 티어 */
const LINK_SAMPLES: MyTier[] = (TIER_TABLE[3] ?? []).flatMap((row) => {
  const cut = row.cuts[row.cuts.length === 4 ? 2 : 0] as number;
  const ao5 = Math.round(cut * 1000);
  const place = tierOf(3, ao5);
  return place ? [{ n: 3, ao5, place }] : [];
});

/** 정지 그림을 견줄 크기(티어 화면 64, 티어표·Cubie 28, 기록 칸 18) */
const STILL_SIZES = [128, 64, 48, 32, 28, 24, 18] as const;
/** 평면 엠블럼과 나란히 견줄 작은 크기 */
const SMALL_SIZES = [28, 24, 18] as const;

/** 티어 엠블럼 미리보기(`/cube/tiers/emblems`, 개발용) */
export function EmblemPreview() {
  useEffect(() => {
    try {
      // 정지 그림 찍기(`scripts/render-emblem-posters.mjs`)가 부르는 고리. 이 개발용 화면에서 `?stills=1`일 때만 둔다
      if (new URLSearchParams(window.location.search).get("stills") === "1")
        (window as { __emblemStills?: unknown }).__emblemStills = async (
          jobs: ShotJob[],
        ) => (await import("./emblem3d/stage")).captureShots(jobs, 0);
    } catch {
      // 주소를 못 읽으면 고리를 두지 않는다
    }
  }, []);

  return (
    <main
      data-game="cube"
      data-cube-emblem-preview
      className="min-h-dvh bg-neutral-900 text-white"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-4">
        <h1 className="font-bold text-lg">티어 엠블럼</h1>

        <Draft3d />

        <section data-cube-emblem-sizes className="flex flex-col gap-2">
          <h2 className="font-semibold text-sm">정지 그림</h2>
          {STILL_SIZES.map((s) => (
            <div key={s} className="flex flex-wrap items-center gap-3">
              <span className="w-10 text-right text-white/50 text-xs">
                {s}px
              </span>
              {TIER_IDS.map((t) => (
                <EmblemStill key={t} tier={t} size={s} />
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
              <EmblemStill tier="gold" size={64} division={d} />
              <figcaption className="text-white/60 text-xs">
                골드 {d}
              </figcaption>
            </figure>
          ))}
        </section>

        {/* 작은 크기에서 정지 그림과 평면 엠블럼(마지막 대체)을 나란히 */}
        <section data-cube-emblem-small className="flex flex-col gap-2">
          <h2 className="font-semibold text-sm">작은 크기: 정지 그림 · 평면</h2>
          {SMALL_SIZES.map((s) => (
            <div key={s} className="flex flex-wrap items-center gap-3">
              <span className="w-10 text-right text-white/50 text-xs">
                {s}px
              </span>
              {TIER_IDS.map((t) => (
                <span key={t} className="flex items-center gap-0.5">
                  <EmblemStill tier={t} size={s} />
                  <TierEmblem tier={t} size={s} />
                </span>
              ))}
            </div>
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

        <HdrCheck />
      </div>
    </main>
  );
}

/** 주소 쿼리 하나를 바꾼다(다시 불러도 같은 바탕·티어로 열리게). 값이 null이면 뺀다 */
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

/**
 * 3D 엠블럼(docs/47 14-7): 열 티어를 대기 그림 격자로 보이고, 고른 하나만 큰 칸에서 살아 있는 3D로 끌어 돌려 본다
 * (기본 다이아몬드, `?tier=`로 고름). 아래는 고른 티어의 찍은 그림(작은 크기·각도 여섯 장).
 */
function Draft3d() {
  const [tier, setTier] = useState<DraftTier>("diamond");
  // 보석이 뒤를 비추는지 견주어 보는 바탕(`?emblemBg=light`로 밝게 시작)
  const [light, setLight] = useState(false);
  const [view, setView] = useState<"front" | "turned">("front");
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      setLight(q.get("emblemBg") === "light");
      const t = DRAFT_TIERS.find((x) => x === q.get("tier"));
      if (t) setTier(t);
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
  // 보석 티어는 생김새가 보이게 크게(emblem3d/poster.ts emblemSize)
  const size = emblemSize(tier);
  return (
    <section data-emblem3d-draft className="flex flex-col gap-3">
      <h2 className="font-semibold text-sm">3D 엠블럼</h2>
      <EmblemGrid tiers={DRAFT_TIERS} selected={tier} onSelect={pickTier} />
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
          view={view}
          auto={auto}
        />
        <figcaption className={cn("font-semibold text-sm", TIER_TONE[tier])}>
          {TIER_LABEL[tier]}
        </figcaption>
      </figure>
      <h3 className="font-semibold text-white/80 text-xs">찍은 그림</h3>
      <EmblemShots key={tier} tier={tier} />
    </section>
  );
}

/** 「HDR 확인」 견본: HDR 맥에서 브라우저가 HDR 그림을 HDR로 그리는지 가른다(3D 엠블럼 HDR 길을 옮길 때 쓴다) */
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
        같아 보이면 브라우저나 화면이 HDR 그림을 HDR로 그리지 않는 것이다.
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
      </div>
    </section>
  );
}
