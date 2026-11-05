"use client";

import { useEffect, useState } from "react";
import { BackToGames } from "@/components/BackToGames";
import { MadeWith } from "@/components/brand/MadeWith";

import { cn } from "@/lib/cn";
import { kstDate, loadDaily } from "../daily";
import { loadLearn } from "../learn/progress";
import { CubeHero } from "./CubeHero";

/**
 * 큐브 첫 화면(`/cube`). 위에는 섞이고 맞춰지기를 되풀이하는 큐브(`CubeHero`), 아래에는 고를 것을
 * 묶음 여섯(배우기·맞추기·대결·연습·더 알아보기·실물 큐브)으로 나눈 2열 격자. 항목은 아이콘과 짧은 이름만 둔다
 * (고를 것이 많아 무엇부터 볼지 헷갈리지 않게, docs/47 0절 2026-11-04).
 */

interface Item {
  icon: string;
  title: string;
  href: string;
  /** 눈에 띄게 할 강조 색 */
  tone?: "sky" | "amber";
  /** 한 줄 전체(크게) */
  wide?: boolean;
  /** 한 줄 전체(글 크기는 그대로). 묶음 칸 수가 홀수일 때 마지막 칸이 빈칸 없이 줄을 채운다 */
  span?: boolean;
  /** 화면 시험이 찾는 표시 */
  attr?: string;
  /** 이름 오른쪽 작은 표시(「오늘 완료」) */
  note?: string;
}

interface Group {
  title: string;
  items: Item[];
}

/** 배우기 묶음 첫 칸: 처음 온 사람은 「처음이라면」, 진도가 있으면 그 자리가 「이어서 배우기: ○○」 */
const FIRST_TIME: Item = {
  icon: "👋",
  title: "처음이라면: 화면 쓰는 법",
  href: "/cube/intro",
  tone: "amber",
  span: true,
  attr: "data-cube-intro-link",
};

/**
 * 묶음 여섯(2026-11-05 점검 뒤): 배우기 → 맞추기 → 대결 → 연습 → 더 알아보기 → 실물 큐브. 처음 온 사람의 길이 맨 위에
 * 오게 배우기를 앞에 둔다. 강조는 배우기 첫 칸 하나뿐(처음 온 사람이 못 하는 「혼자 맞추기」와 함께 빛나 길이 갈렸다).
 * 칸 수가 홀수인 묶음은 한 칸이 줄을 채운다
 */
function groups(learnFirst: Item, dailyDone: boolean): Group[] {
  return [
    {
      title: "배우기",
      items: [
        learnFirst,
        { icon: "🎓", title: "맞추는 법 배우기", href: "/cube/learn" },
        { icon: "⌨️", title: "키 익히기", href: "/cube/keys/learn" },
      ],
    },
    {
      title: "맞추기",
      items: [
        { icon: "🧊", title: "혼자 맞추기", href: "/cube/solo" },
        { icon: "🙈", title: "블라인드", href: "/cube/blind" },
        {
          icon: "📅",
          title: "오늘의 섞기",
          href: "/cube/daily",
          span: true,
          attr: "data-cube-daily-link",
          ...(dailyDone ? { note: "오늘 완료" } : {}),
        },
        {
          icon: "⏳",
          title: "제한 도전",
          href: "/cube/challenge",
          span: true,
          attr: "data-cube-challenge-link",
        },
      ],
    },
    {
      title: "대결",
      items: [
        { icon: "🏁", title: "친구와 대결", href: "/cube/online" },
        { icon: "🤖", title: "컴퓨터와 대결", href: "/cube/vs" },
      ],
    },
    {
      title: "연습",
      items: [
        { icon: "🎯", title: "공식 훈련", href: "/cube/train" },
        { icon: "✚", title: "십자 훈련", href: "/cube/train/cross" },
        { icon: "📒", title: "내 공식", href: "/cube/algs", span: true },
      ],
    },
    {
      // 재미로 읽고 만들어 보는 것(배우기 다음 차례로 오해하지 않게 따로, 2026-11-04 점검)
      title: "더 알아보기",
      items: [
        { icon: "🔢", title: "큐브의 수학", href: "/cube/math" },
        { icon: "🎨", title: "패턴 만들기", href: "/cube/patterns" },
      ],
    },
    {
      title: "실물 큐브",
      items: [
        { icon: "⏱", title: "타이머", href: "/cube/timer" },
        { icon: "✋", title: "핑거 트릭", href: "/cube/fingers" },
      ],
    },
  ];
}

/** 진도(이 기기)의 마지막 단원 → 「이어서 배우기」 칸. 단원 자료는 첫 화면 꾸러미에 싣지 않게 불러온다 */
function useContinueItem(): Item | null {
  const [item, setItem] = useState<Item | null>(null);
  useEffect(() => {
    const last = loadLearn().last;
    if (!last) return;
    let live = true;
    import("../learn").then(({ COURSES }) => {
      if (!live) return;
      const lesson = COURSES.flatMap((c) => c.lessons).find(
        (l) => l.id === last,
      );
      if (lesson)
        setItem({
          icon: "▶️",
          title: `이어서 배우기: ${lesson.title}`,
          href: `/cube/learn?lesson=${lesson.id}`,
          tone: "amber",
          span: true,
          attr: "data-cube-continue",
        });
    });
    return () => {
      live = false;
    };
  }, []);
  return item;
}

/** 오늘(한국 시각) 이 기기에서 오늘의 섞기를 한 크기가 있는가 */
function useDailyDone(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const today = kstDate(Date.now());
    setDone(loadDaily().some((e) => e.date === today));
  }, []);
  return done;
}

export function CubeHome() {
  const continueItem = useContinueItem();
  const dailyDone = useDailyDone();
  const GROUPS = groups(continueItem ?? FIRST_TIME, dailyDone);
  return (
    <main
      data-game="cube"
      className="flex min-h-dvh items-center justify-center bg-neutral-900 p-4 text-white"
    >
      <div className="flex w-full max-w-sm flex-col gap-4">
        <BackToGames />
        <div className="flex flex-col items-center text-center">
          <CubeHero />
          <h1 className="mt-1 font-bold text-2xl">큐브 맞추기</h1>
        </div>
        {GROUPS.map((group) => (
          <section
            key={group.title}
            className="flex flex-col gap-1.5"
            data-cube-group={group.title}
          >
            <h2 className="px-1 font-semibold text-white/50 text-xs">
              {group.title}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  {...(item.attr ? { [item.attr]: "" } : {})}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-3 transition active:scale-[0.98]",
                    item.wide && "col-span-2 justify-center py-3.5",
                    item.span && "col-span-2",
                    !item.tone &&
                      "border-white/15 bg-white/5 hover:bg-white/10",
                    item.tone === "sky" &&
                      "border-sky-300/60 bg-sky-500/25 hover:bg-sky-500/35",
                    item.tone === "amber" &&
                      "border-amber-300/60 bg-amber-400/15 hover:bg-amber-400/25",
                  )}
                >
                  <span aria-hidden className="text-xl">
                    {item.icon}
                  </span>
                  <span
                    className={cn(
                      "truncate font-bold",
                      item.wide ? "text-lg" : "text-sm",
                    )}
                  >
                    {item.title}
                  </span>
                  {item.note && (
                    <span
                      data-cube-note
                      className="ml-auto shrink-0 rounded-full border border-emerald-300/50 bg-emerald-400/15 px-2 py-0.5 font-semibold text-[11px] text-emerald-200"
                    >
                      {item.note}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </section>
        ))}
        <a
          href="/cube/settings"
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10"
        >
          <span aria-hidden>⚙️</span>
          설정
        </a>
        <p className="mt-1 text-center text-[11px] opacity-40">
          <MadeWith />
        </p>
      </div>
    </main>
  );
}
