"use client";

import { useEffect, useState } from "react";

import { SizePicker } from "../components/SizePicker";
import { sizeFor, useCurrentSize } from "../current-size";
import { installCaptureHook } from "./emblem3d/capture";
import { TierHistoryChart } from "./TierHistoryChart";
import { TierShowcase } from "./TierShowcase";
import {
  basisFromSearch,
  type TierBasis,
  TierTable,
  useTierProgress,
} from "./TierTable";
import {
  TIER_DATA_DATE,
  TIER_SIZES,
  WCA_CREDIT,
  WCA_PEOPLE,
  WCA_RESULTS_URL,
} from "./table";

/** 주소의 `?n=4`(없거나 표에 없는 크기면 null) */
function sizeFromUrl(): number | null {
  try {
    const n = Number(new URLSearchParams(window.location.search).get("n"));
    return (TIER_SIZES as readonly number[]).includes(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * 큐브 티어표(`/cube/tiers`, docs/47 14절). 보는 화면(docs/47 16-28): 주소 `?n=`가 있으면 그 크기, 없으면 지금 크기로
 * 열고, 여기서 크기를 바꿔도 지금 크기는 그대로다
 */
export function TiersApp() {
  const current = useCurrentSize();
  /** 이 화면에서 고르거나 주소로 받은 크기(없으면 지금 크기) */
  const [viewing, setViewing] = useState<number | null>(null);
  const n = viewing ?? sizeFor(TIER_SIZES, current);
  const [basis, setBasis] = useState<TierBasis>("solo");
  useEffect(() => {
    setViewing(sizeFromUrl());
    setBasis(basisFromSearch(window.location.search));
    try {
      installCaptureHook(window.location.search);
    } catch {
      // 찍기 고리는 제품 화면에 없어도 된다
    }
  }, []);
  const { mine, goal, history } = useTierProgress(n, basis);

  const pick = (next: number) => {
    setViewing(next);
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
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
        <header className="flex items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">티어표</h1>
        </header>

        <SizePicker
          optionAttr="data-cube-tier-size"
          sizes={TIER_SIZES}
          value={n}
          onPick={pick}
          className="self-start"
        />

        <TierShowcase n={n} mine={mine} goal={goal} basis={basis} />
        <TierHistoryChart n={n} history={history} />

        <section className="flex flex-col gap-1.5 text-sm text-white/80 leading-relaxed">
          <p>
            같은 크기에서 낸 가장 좋은 5판 평균(Ao5)으로 티어를 매겨요. 5판
            평균은 연달아 맞춘 5판 가운데 가장 빠른 판과 가장 느린 판을 빼고
            남은 3판의 평균이에요.
          </p>
          <p>
            골드부터 위는 세계 큐브 협회(WCA) 대회 기록의 분포로 정했고,
            아이언·브론즈·실버는 대회에 나가지 않는 사람까지 담도록 넓혔어요. 큰
            큐브는 3×3 기록이 같은 사람이 그 크기에서 내는 기록에 맞춰, 크기가
            달라도 같은 티어면 비슷한 실력이에요.
          </p>
        </section>

        <section className="flex flex-col gap-1">
          <h2 className="font-semibold">
            {n}×{n}
          </h2>
          <p className="text-white/50 text-xs">
            칸의 시간은 그 구간에 드는 최고 5판 평균의 상한이에요. 「WCA 경기자
            중」은 그 티어에 드는 시간 이하인 대회 경기자의 비율이에요(
            {n}×{n} 평균 기록이 있는 약{" "}
            {(WCA_PEOPLE[n] ?? 0).toLocaleString("ko-KR")}명 가운데).
          </p>
          <TierTable n={n} mine={mine} />
        </section>

        <footer className="flex flex-col gap-1 border-white/10 border-t pt-3 text-[11px] text-white/45">
          <p>
            WCA 수치: WCA 결과 내보내기 {TIER_DATA_DATE} 판. 그랜드마스터·챌린저
            경계는 그때의 세계 약 1,000위·300위 기록이라 해마다 빨라질 수
            있어요.
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
