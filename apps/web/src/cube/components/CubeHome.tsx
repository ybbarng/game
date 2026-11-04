"use client";

import { BackToGames } from "@/components/BackToGames";
import { MadeWith } from "@/components/brand/MadeWith";
import { cn } from "@/lib/cn";
import { CubeHero } from "./CubeHero";

/**
 * 큐브 첫 화면(`/cube`). 위에는 섞이고 맞춰지기를 되풀이하는 큐브(`CubeHero`), 아래에는 고를 것을
 * 묶음(맞추기·대결·배우기·실물 큐브)으로 나눈 2열 격자. 항목은 아이콘과 짧은 이름만 둔다
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
}

interface Group {
  title: string;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    title: "맞추기",
    items: [
      {
        icon: "🧊",
        title: "혼자 맞추기",
        href: "/cube/solo",
        // 한 줄 전체로 두면 블라인드 옆 칸이 비어 어색했다(2026-11-04). 나란히 두고 색으로만 강조
        tone: "sky",
      },
      { icon: "🙈", title: "블라인드", href: "/cube/blind" },
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
    title: "배우기",
    items: [
      {
        icon: "👋",
        title: "처음이라면",
        href: "/cube/intro",
        tone: "amber",
        attr: "data-cube-intro-link",
      },
      { icon: "🎓", title: "해법 배우기", href: "/cube/learn" },
      { icon: "⌨️", title: "키 익히기", href: "/cube/keys/learn" },
      { icon: "🎯", title: "공식 훈련", href: "/cube/train" },
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

export function CubeHome() {
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
                    "flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-3 transition",
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
