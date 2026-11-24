"use client";

import type { ReactNode } from "react";

import { HIT_AREA } from "@/components/hit-area";
import { cn } from "@/lib/cn";

/** 옵션 화면의 한 묶음: 작은 제목과 고르는 것 */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold text-sm">{title}</h2>
      {children}
    </section>
  );
}

/**
 * 옵션·규칙 화면의 틀: 제목과 「처음으로」, 그 아래 반투명 판.
 * 게임마다 다른 것은 바탕(`bg`)과 판 색(`panelClassName`)뿐이다.
 */
export function SubScreen({
  title,
  onBack,
  bg,
  game,
  panelClassName,
  children,
}: {
  title: string;
  onBack: () => void;
  /** 화면 바탕(게임 첫 화면과 같은 것) */
  bg?: string;
  /** `main`의 `data-game` */
  game?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  return (
    <main
      data-game={game}
      className={cn(
        "flex min-h-dvh justify-center p-4 text-white",
        "pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
        bg,
      )}
    >
      <div className="flex w-full max-w-md flex-col gap-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">{title}</h1>
          <button
            type="button"
            onClick={onBack}
            className={cn(HIT_AREA, "rounded-lg bg-white/10 px-3 py-1 text-sm")}
          >
            처음으로
          </button>
        </div>
        <div
          className={cn(
            "flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur",
            panelClassName,
          )}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
