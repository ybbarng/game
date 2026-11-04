"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { useCubeSettings } from "../../settings";
import { CountCard } from "./CountCard";
import { OrientCard } from "./OrientCard";
import { ReassembleCard } from "./ReassembleCard";
import { CommutatorCard, GodCard, OrderCard } from "./ShortCards";
import { SizesCard } from "./SizesCard";

/**
 * 큐브의 수학(`/cube/math`). 재미로 읽는 이야기 카드를 차례로 넘기고, 카드마다 직접 해 보는 것이 하나씩 있다.
 * 숫자와 판정은 모두 엔진·BigInt로 계산한다(`cube/math/*.test.ts`). 한 번에 카드 하나만 그린다
 * (키보드로 돌리는 큐브가 한 화면에 둘 생기지 않게).
 */

const CARDS = [
  { id: "count", title: "섞는 경우의 수" },
  { id: "reassemble", title: "뽑아서 다시 끼우면" },
  { id: "orient", title: "방향과 짝" },
  { id: "sizes", title: "크기와 패리티" },
  { id: "god", title: "신의 수" },
  { id: "order", title: "되풀이하면 돌아온다" },
  { id: "commutator", title: "교환자와 켤레" },
] as const;

type CardId = (typeof CARDS)[number]["id"];

export function CubeMathApp() {
  const settings = useCubeSettings();
  const [index, setIndex] = useState(0);
  const card = CARDS[index] ?? CARDS[0];

  // 주소의 #카드 로 바로 열기
  useEffect(() => {
    const id = window.location.hash.slice(1);
    const i = CARDS.findIndex((c) => c.id === id);
    if (i >= 0) setIndex(i);
  }, []);
  const go = (i: number) => {
    const next = Math.max(0, Math.min(CARDS.length - 1, i));
    setIndex(next);
    try {
      window.history.replaceState(null, "", `#${CARDS[next]?.id}`);
    } catch {
      // 주소를 못 바꿔도 카드는 넘어간다
    }
    window.scrollTo({ top: 0 });
  };

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4"
        data-cube-math={card.id}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-xl">큐브의 수학</h1>
          <span className="ml-auto text-white/60 text-xs" data-math-progress>
            {index + 1}/{CARDS.length}
          </span>
        </header>
        <nav className="flex flex-wrap gap-1" aria-label="카드 차례">
          {CARDS.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => go(i)}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "min-h-8 rounded-lg px-2.5 py-1 text-xs",
                i === index ? "bg-sky-500/30 font-semibold" : "bg-white/5",
              )}
            >
              {i + 1}. {c.title}
            </button>
          ))}
        </nav>

        <section className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4">
          <h2 className="font-bold text-lg">{card.title}</h2>
          <Card id={card.id} settings={settings} />
        </section>

        <div className="flex justify-between">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => go(index - 1)}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm disabled:opacity-30"
          >
            이전
          </button>
          {index < CARDS.length - 1 ? (
            <button
              type="button"
              data-math-next
              onClick={() => go(index + 1)}
              className="rounded-xl bg-sky-500 px-4 py-2 font-semibold text-black text-sm"
            >
              다음: {CARDS[index + 1]?.title}
            </button>
          ) : (
            <a
              href="/cube"
              className="rounded-xl bg-sky-500 px-4 py-2 font-semibold text-black text-sm"
            >
              큐브로 돌아가기
            </a>
          )}
        </div>
      </main>
    </div>
  );
}

function Card({
  id,
  settings,
}: {
  id: CardId;
  settings: ReturnType<typeof useCubeSettings>;
}) {
  switch (id) {
    case "count":
      return <CountCard />;
    case "reassemble":
      return <ReassembleCard settings={settings} />;
    case "orient":
      return <OrientCard settings={settings} />;
    case "sizes":
      return <SizesCard settings={settings} />;
    case "god":
      return <GodCard settings={settings} />;
    case "order":
      return <OrderCard settings={settings} />;
    case "commutator":
      return <CommutatorCard settings={settings} />;
  }
}
