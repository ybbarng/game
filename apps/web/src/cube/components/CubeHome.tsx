"use client";

import { BackToGames } from "@/components/BackToGames";
import { MadeWith } from "@/components/brand/MadeWith";
import { cn } from "@/lib/cn";
import { useCubeSettings } from "../settings";
import { CubeNet } from "./CubeNet";

/**
 * 큐브 첫 화면(`/cube`). 게임 첫 화면 틀(GameHome)과 같은 모양이지만 고를 것이 달라(혼자·타이머·블라인드·배우기)
 * 따로 둔다. 아직 게임 목록에는 올리지 않는다.
 */

interface Item {
  icon: string;
  title: string;
  detail: string;
  href?: string;
  primary?: boolean;
}

const ITEMS: Item[] = [
  {
    icon: "🧊",
    title: "혼자 맞추기",
    detail: "키보드로 가상 큐브를 섞고 맞춰 시간을 잽니다(2×2~7×7)",
    href: "/cube/solo",
    primary: true,
  },
  {
    icon: "⏱",
    title: "타이머",
    detail: "실물 큐브용. 대회 규칙 섞기와 15초 살펴보기",
    href: "/cube/timer",
  },
  {
    icon: "🙈",
    title: "블라인드",
    detail: "보고 외운 뒤, 스티커가 모두 가려진 채 맞춥니다",
    href: "/cube/blind",
  },
  {
    icon: "🏁",
    title: "온라인 경주",
    detail: "친구 2~8명이 같은 섞기로 겨룹니다(키보드 기기)",
    href: "/cube/online",
  },
  {
    icon: "🤖",
    title: "컴퓨터와 경주",
    detail: "단계를 골라 같은 섞기로 나란히 맞춥니다",
    href: "/cube/vs",
  },
  {
    icon: "🎓",
    title: "배우기",
    detail: "처음부터 끝까지 따라 하는 초보자 해법(2×2~5×5, CFOP, 블라인드)",
    href: "/cube/learn",
  },
  {
    icon: "🎯",
    title: "공식 훈련",
    detail: "OLL·PLL·F2L·오르테가 상황을 무작위로 내고 시간을 잽니다",
    href: "/cube/train",
  },
  {
    icon: "✋",
    title: "핑거 트릭",
    detail: "실물 큐브로 손가락 쓰는 법을 반복 연습합니다",
    href: "/cube/fingers",
  },
];

// 첫 화면 그림용 섞인 모양(면마다 칸 색 번호)
const HERO_FACES = [
  [0, 0, 2, 0, 0, 0, 5, 0, 0],
  [1, 1, 1, 3, 1, 1, 1, 1, 4],
  [2, 2, 0, 2, 2, 2, 2, 1, 2],
  [3, 3, 3, 3, 3, 4, 3, 3, 3],
  [4, 4, 4, 4, 4, 4, 5, 4, 4],
  [5, 2, 5, 5, 5, 5, 5, 5, 5],
];

export function CubeHome() {
  const settings = useCubeSettings();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-900 p-4 text-white">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <BackToGames />
        <div className="mb-2 flex flex-col items-center text-center">
          <CubeNet
            n={3}
            faces={HERO_FACES}
            colors={settings.colors}
            hidden="black"
            className="h-24 w-auto"
          />
          <h1 className="mt-2 font-bold text-2xl">큐브 맞추기</h1>
          <p className="mt-1 font-medium text-sm text-white/85">
            키보드 두 손으로 돌리는 3D 큐브. 기록은 이 기기에만 남습니다.
          </p>
        </div>
        {ITEMS.map((item) => {
          const body = (
            <>
              <span className="w-7 text-center text-2xl">{item.icon}</span>
              <span className="flex flex-1 flex-col">
                <span className="font-bold text-base">{item.title}</span>
                <span
                  className={cn(
                    "text-xs",
                    item.primary ? "opacity-80" : "opacity-60",
                  )}
                >
                  {item.detail}
                </span>
              </span>
            </>
          );
          const cls = cn(
            "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
            item.primary
              ? "border-sky-300/60 bg-sky-500/25 hover:bg-sky-500/35"
              : "border-white/15 bg-white/5 hover:bg-white/10",
          );
          return item.href ? (
            <a key={item.title} href={item.href} className={cls}>
              {body}
            </a>
          ) : (
            <div
              key={item.title}
              aria-disabled
              className={cn(cls, "cursor-default opacity-50 hover:bg-white/5")}
            >
              {body}
            </div>
          );
        })}
        <div className="mt-1 flex justify-center gap-2">
          <a
            href="/cube/settings"
            className="rounded-xl bg-white/10 px-4 py-2 text-center text-sm hover:bg-white/15"
          >
            설정(키·색)
          </a>
        </div>
        <p className="mt-2 text-center text-[11px] opacity-40">
          <MadeWith />
        </p>
      </div>
    </main>
  );
}
