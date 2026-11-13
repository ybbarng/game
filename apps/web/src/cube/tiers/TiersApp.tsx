"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { formatMs } from "../records";
import { EmblemStill } from "./EmblemStill";
import { tierName } from "./rank";
import { TIER_TONE, TierTable, useMyTier } from "./TierTable";
import {
  TIER_DATA_DATE,
  TIER_SIZES,
  WCA_CREDIT,
  WCA_PEOPLE,
  WCA_RESULTS_URL,
} from "./table";

/** 주소의 `?n=4`(없거나 표에 없는 크기면 3) */
function sizeFromUrl(): number {
  try {
    const n = Number(new URLSearchParams(window.location.search).get("n"));
    return (TIER_SIZES as readonly number[]).includes(n) ? n : 3;
  } catch {
    return 3;
  }
}

/** 큐브 티어표(`/cube/tiers`, docs/47 14절) */
export function TiersApp() {
  const [n, setN] = useState(3);
  useEffect(() => setN(sizeFromUrl()), []);
  const mine = useMyTier(n);

  const pick = (next: number) => {
    setN(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("n", String(next));
      window.history.replaceState(null, "", url);
    } catch {
      // 주소를 못 바꿔도 표는 바뀐다
    }
  };

  return (
    <main
      data-game="cube"
      className="min-h-dvh bg-neutral-900 text-white"
      data-cube-tiers={n}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4">
        <header className="flex items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">티어표</h1>
        </header>

        <section className="flex flex-col gap-1.5 text-sm text-white/80 leading-relaxed">
          <p>
            같은 크기 혼자 맞추기에서 낸 가장 좋은 Ao5로 티어를 매깁니다. Ao5는
            연달아 맞춘 5번 가운데 가장 빠른 판과 가장 느린 판을 빼고 남은 3번의
            평균입니다.
          </p>
          <p>
            골드부터 위는 세계 큐브 협회(WCA) 대회 기록의 분포로 정했고,
            아이언·브론즈·실버는 대회에 나가지 않는 사람까지 담도록 넓혔습니다.
            큰 큐브는 3×3 기록이 같은 사람이 그 크기에서 내는 기록에 맞춰,
            크기가 달라도 같은 티어면 비슷한 실력입니다.
          </p>
        </section>

        <fieldset className="grid grid-cols-6 gap-1.5">
          <legend className="sr-only">크기</legend>
          {TIER_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === n}
              data-cube-tier-size={s}
              onClick={() => pick(s)}
              className={cn(
                "rounded-lg border py-2 font-semibold text-sm",
                s === n
                  ? "border-sky-300/70 bg-sky-500/25"
                  : "border-white/15 bg-white/5 hover:bg-white/10",
              )}
            >
              {s}×{s}
            </button>
          ))}
        </fieldset>

        <div
          data-cube-tier-mine-box
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm"
        >
          {mine ? (
            <div className="flex items-center gap-3">
              <EmblemStill
                tier={mine.place.tier}
                division={mine.place.division}
                size={64}
              />
              <p>
                <span
                  data-cube-my-tier={mine.place.tier}
                  className={cn(
                    "block font-bold text-base",
                    TIER_TONE[mine.place.tier],
                  )}
                >
                  {tierName(mine.place)}
                </span>
                내 최고 Ao5{" "}
                <span className="font-mono font-semibold tabular-nums">
                  {formatMs(mine.ao5)}
                </span>
              </p>
            </div>
          ) : (
            <p className="text-white/70">
              이 크기는 아직 Ao5가 없습니다.{" "}
              <a href="/cube/solo" className="text-sky-300 hover:underline">
                혼자 맞추기
              </a>
              에서 5번 맞추면 생깁니다.
            </p>
          )}
          <p className="mt-1 text-white/50 text-xs">
            기록은 이 기기에만 저장됩니다.
          </p>
        </div>

        <section className="flex flex-col gap-1">
          <h2 className="font-semibold">
            {n}×{n}
          </h2>
          <p className="text-white/50 text-xs">
            칸의 시간은 그 구간에 드는 최고 Ao5의 상한입니다. 「WCA 경기자
            중」은 그 티어에 드는 시간 이하인 대회 경기자의 비율입니다(
            {n}×{n} 평균 기록이 있는 약{" "}
            {(WCA_PEOPLE[n] ?? 0).toLocaleString("ko-KR")}명 가운데).
          </p>
          <TierTable n={n} mine={mine} />
        </section>

        <footer className="flex flex-col gap-1 border-white/10 border-t pt-3 text-[11px] text-white/45">
          <p>
            WCA 수치: WCA 결과 내보내기 {TIER_DATA_DATE} 판. 그랜드마스터·챌린저
            경계는 그때의 세계 약 1,000위·300위 기록이라 해마다 빨라질 수
            있습니다.
          </p>
          <p data-cube-wca-credit lang="en">
            {WCA_CREDIT.split(WCA_RESULTS_URL)[0]}
            <a
              href={WCA_RESULTS_URL}
              className="underline hover:text-white/70"
              rel="noreferrer"
              target="_blank"
            >
              {WCA_RESULTS_URL}
            </a>
            {WCA_CREDIT.split(WCA_RESULTS_URL)[1]}
          </p>
        </footer>
      </div>
    </main>
  );
}
