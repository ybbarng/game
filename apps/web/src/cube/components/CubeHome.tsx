"use client";

import { useEffect, useState } from "react";
import { BackToGames } from "@/components/BackToGames";
import { MadeWith } from "@/components/brand/MadeWith";
import { SAFE_P4 } from "@/components/safe-area";
import { cn } from "@/lib/cn";
import { ALL_SIZES, setCurrentSize, useCurrentSize } from "../current-size";
import { loadLearn as loadKeyLearn } from "../keys/storage";
import { loadLearn } from "../learn/progress";
import {
  BASICS_HREF,
  BASICS_ICON,
  BASICS_TITLE,
  METHODS_HREF,
  METHODS_ICON,
  METHODS_TITLE,
} from "../nav/learn-names";
import type { NextKind, NextStep } from "../nav/next-step";
import { loadRecords } from "../records";
import { CubeHero } from "./CubeHero";
import { SizePicker } from "./SizePicker";
import "@/cube/components/cube-fx.css";

/**
 * 큐브 첫 화면(`/cube`, docs/47 16-2). 위에는 섞이고 맞춰지기를 되풀이하는 큐브(`CubeHero`), 그 아래 「다음에 할 것」 칸 하나,
 * 그리고 문 둘(배우기·맞추기·겨루기)과 더 보기. 항목은 아이콘과 짧은 이름만 둔다. 문 아래의 화면(오늘의 섞기,
 * 공식 훈련 등)은 각 문 안에서 고르고, 모든 화면은 기능 지도(`/cube/map`)에 있다. 배우는 곳은 「큐브의 기초」(조각·움직임·
 * 표기)와 「해법 배우기」 두 칸이고 해법·과정은 해법 배우기 안에서 고른다(docs/47 16-26·16-27).
 */

interface Item {
  icon: string;
  title: string;
  href: string;
  /** 한 줄 전체(글 크기는 그대로). 묶음 칸 수가 홀수일 때 빈칸 없이 줄을 채운다 */
  span?: boolean;
  /** 화면 시험이 찾는 표시 */
  attr?: string;
  /** 「다음에 할 것」이 이 칸과 같은 걸음이면 묶음에서 감춘다(같은 칸이 두 번 보이지 않게, docs/47 16-26) */
  sameAs?: NextKind;
}

interface Group {
  title: string;
  items: Item[];
}

/** 문 둘과 더 보기. 칸 수가 홀수인 묶음은 한 칸이 줄을 채운다 */
const GROUPS: Group[] = [
  {
    title: "배우기",
    items: [
      {
        icon: "👋",
        title: "사이트 쓰는 법",
        href: "/cube/intro",
        attr: "data-cube-intro-link",
        sameAs: "intro",
      },
      {
        icon: BASICS_ICON,
        title: BASICS_TITLE,
        href: BASICS_HREF,
        attr: "data-cube-basics-link",
      },
      {
        icon: METHODS_ICON,
        title: METHODS_TITLE,
        href: METHODS_HREF,
        attr: "data-cube-learn-link",
      },
    ],
  },
  {
    title: "맞추기·겨루기",
    items: [
      { icon: "🧊", title: "혼자 맞추기", href: "/cube/solo", span: true },
      { icon: "🏁", title: "친구와 대결", href: "/cube/online" },
      { icon: "🤖", title: "컴퓨터와 대결", href: "/cube/vs" },
    ],
  },
  {
    title: "더 보기",
    items: [
      { icon: "🎨", title: "패턴", href: "/cube/patterns" },
      {
        icon: "🏅",
        title: "티어표",
        href: "/cube/tiers",
        attr: "data-cube-tiers-link",
      },
      { icon: "🔢", title: "큐브의 수학", href: "/cube/math" },
      { icon: "⏱", title: "타이머", href: "/cube/timer" },
      { icon: "✋", title: "핑거 트릭", href: "/cube/fingers" },
      { icon: "⚙️", title: "설정", href: "/cube/settings" },
      {
        icon: "🗺",
        title: "기능 지도",
        href: "/cube/map",
        span: true,
        attr: "data-cube-map-link",
      },
    ],
  },
];

/**
 * 묶음에 보일 칸. 「다음에 할 것」과 같은 칸은 감추고, 보일 반 칸 수가 홀수면 마지막 칸이 줄을 채운다(배우기 묶음:
 * 셋이면 해법 배우기가 한 줄, 사이트 쓰는 법을 감춰 둘이면 반 칸 둘).
 * 다음 걸음이 아직 정해지지 않았으면(`null`) 감출 칸이 있는 묶음은 칸 대신 자리만 둔다(칸이 떴다 사라지지 않게)
 */
function visibleItems(items: Item[], next: NextKind | null): Item[] | null {
  if (next === null && items.some((i) => i.sameAs)) return null;
  const shown = items.filter((i) => i.sameAs !== next);
  const halves = shown.filter((i) => !i.span);
  if (halves.length % 2 === 0) return shown;
  const last = halves[halves.length - 1];
  return shown.map((i) => (i === last ? { ...i, span: true } : i));
}

/** 혼자 맞추기 기록을 보는 크기(2×2~7×7) */
const SIZES = [2, 3, 4, 5, 6, 7];

/**
 * 「다음에 할 것」(docs/47 16-5): 이 기기의 키 익히기·배우기 진도와 혼자 맞추기 기록으로 고른다.
 * 과정 자료는 첫 화면 꾸러미에 싣지 않게 불러온다
 */
function useNextStep(): NextStep | null {
  const [step, setStep] = useState<NextStep | null>(null);
  useEffect(() => {
    let live = true;
    const solo3 = loadRecords("solo", 3).filter((r) => r.ms !== null).length;
    const input = {
      keysDone: loadKeyLearn().done.length,
      learn: loadLearn(),
      solo3,
      anySolo: SIZES.some((n) => loadRecords("solo", n).length > 0),
    };
    Promise.all([import("../learn/courses"), import("../nav/next-step")]).then(
      ([{ COURSES }, { nextStep }]) => {
        if (live) setStep(nextStep(input, COURSES));
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return step;
}

export function CubeHome() {
  const next = useNextStep();
  const size = useCurrentSize();
  return (
    <main
      data-game="cube"
      // 홈 화면에 추가해 열면 상태 막대 밑까지 깔리니 안전 영역만큼 띄운다
      className={`flex min-h-dvh items-center justify-center bg-neutral-900 p-4 text-white ${SAFE_P4}`}
    >
      <div className="flex w-full max-w-sm flex-col gap-4">
        <BackToGames />
        <div className="flex flex-col items-center text-center">
          <CubeHero />
          <h1 className="mt-1 font-bold text-2xl">큐브 맞추기</h1>
          {/* 지금 크기(docs/47 16-28): 하는 화면이 이 크기로 열린다. 위 큐브 연출도 이 크기 */}
          <SizePicker
            attr="data-cube-home-size"
            sizes={ALL_SIZES}
            value={size}
            onPick={setCurrentSize}
            className="mt-2"
          />
        </div>
        <section className="flex flex-col gap-1.5" data-cube-next-section>
          <h2 className="px-1 font-semibold text-white/50 text-xs">
            다음에 할 것
          </h2>
          {/* 진도를 읽기 전에도 자리를 잡아 아래 칸이 밀리지 않게 */}
          {next ? (
            <a
              href={next.href}
              data-cube-next={next.kind}
              className="cube-rise flex min-h-16 min-w-0 items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-400/15 px-4 py-3.5 transition hover:bg-amber-400/25 active:scale-[0.98]"
            >
              <span aria-hidden className="text-2xl">
                {next.icon}
              </span>
              <span className="truncate font-bold text-lg">{next.title}</span>
            </a>
          ) : (
            <div aria-hidden className="min-h-16 rounded-2xl bg-white/5" />
          )}
        </section>
        {GROUPS.map((group) => {
          const items = visibleItems(group.items, next?.kind ?? null);
          return (
            <section
              key={group.title}
              className="flex flex-col gap-1.5"
              data-cube-group={group.title}
            >
              <h2 className="px-1 font-semibold text-white/50 text-xs">
                {group.title}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {/* 다음 걸음을 읽기 전: 한 줄 높이의 자리만(칸과 같은 테두리·안쪽 여백·글 줄 높이) */}
                {items === null && (
                  <div
                    aria-hidden
                    data-cube-group-pending
                    className="col-span-2 flex items-center rounded-2xl border border-transparent bg-white/5 px-3 py-3"
                  >
                    <span className="invisible text-xl">·</span>
                  </div>
                )}
                {(items ?? []).map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    {...(item.attr ? { [item.attr]: "" } : {})}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-3 transition hover:bg-white/10 active:scale-[0.98]",
                      item.span && "col-span-2",
                    )}
                  >
                    <span aria-hidden className="text-xl">
                      {item.icon}
                    </span>
                    <span className="truncate font-bold text-sm">
                      {item.title}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
        <p className="mt-1 text-center text-[11px] opacity-40">
          <MadeWith />
        </p>
      </div>
    </main>
  );
}
