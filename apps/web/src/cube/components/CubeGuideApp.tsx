"use client";

import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import {
  CubeIntroSteps,
  FIRST_LESSON,
  MORE_STEPS,
  READ_STEPS,
} from "./CubeIntroApp";
import { KeyDrillApp, readDrillMode } from "./KeyDrillApp";
import { KeyLearnApp } from "./KeyLearnApp";

/**
 * 사이트 쓰는 법(`/cube/intro`, docs/47 16-2·16-8). 예전의 「처음이라면: 화면 쓰는 법」(11단계)과 「키 익히기」(14단계),
 * 조작 훈련을 한 안내로 합쳤다. 네 부분을 차례로 지난다(`?part=`):
 * 읽기(표기·화면·키 배치·보는 법) → 키(키 익히기) → 연습(수 보고 치기·키 보고 맞히기, 공식 따라 치기) → 다음(처음 맞추기로, 더 알아보기).
 * 키 익히기 진도는 예전처럼 이 기기에 남는다(`cube.keylearn.v1`).
 */

export type GuidePart = "read" | "keys" | "practice" | "next";

const PARTS: { id: GuidePart; title: string }[] = [
  { id: "read", title: "읽기" },
  { id: "keys", title: "키" },
  { id: "practice", title: "연습" },
  { id: "next", title: "다음" },
];

export function readPart(search: string): GuidePart {
  const p = new URLSearchParams(search).get("part");
  return PARTS.some((x) => x.id === p) ? (p as GuidePart) : "read";
}

export function CubeGuideApp() {
  // undefined: 주소를 아직 안 읽음(미리 그린 HTML과 첫 그리기를 맞춘다)
  const [part, setPart] = useState<GuidePart | undefined>();
  const [search, setSearch] = useState("");
  useEffect(() => {
    const read = () => {
      setSearch(window.location.search);
      setPart(readPart(window.location.search));
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const go = useCallback((p: GuidePart) => {
    setPart(p);
    window.history.pushState(null, "", `?part=${p}`);
    window.scrollTo(0, 0);
  }, []);

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-cube-guide={part}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-xl">사이트 쓰는 법</h1>
          <a
            href="/cube/keys"
            data-guide-keys-table
            className="ml-auto text-sm text-white/70 underline-offset-2 hover:text-white hover:underline"
          >
            단축키 표
          </a>
        </header>
        <nav className="grid grid-cols-4 gap-1" aria-label="안내 부분">
          {PARTS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              data-guide-part={p.id}
              aria-current={p.id === part ? "step" : undefined}
              onClick={(e) => {
                go(p.id);
                e.currentTarget.blur();
              }}
              className={cn(
                "rounded-lg px-2 py-1.5 text-sm",
                p.id === part
                  ? "bg-sky-500/30 font-semibold"
                  : "bg-white/5 hover:bg-white/10",
              )}
            >
              {i + 1}. {p.title}
            </button>
          ))}
        </nav>

        {part === "read" && (
          <div className="mx-auto w-full max-w-2xl">
            <CubeIntroSteps only={READ_STEPS} onFinish={() => go("keys")} />
          </div>
        )}
        {part === "keys" && <KeyLearnApp onFinish={() => go("practice")} />}
        {part === "practice" && (
          <KeyDrillApp
            initialMode={readDrillMode(search)}
            onFinish={() => go("next")}
          />
        )}
        {part === "next" && <NextPart />}
      </main>
    </div>
  );
}

const MORE_TITLE: Record<(typeof MORE_STEPS)[number], string> = {
  rotate: "x·y·z",
  slices: "M·E·S",
  wide: "넓게·큰 큐브",
  keys: "단축키 모음",
};

function NextPart() {
  const [more, setMore] = useState<(typeof MORE_STEPS)[number] | null>(null);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <a
        href={`/cube/learn?lesson=${FIRST_LESSON?.id ?? ""}`}
        data-intro-learn
        className="rounded-2xl border border-amber-300/60 bg-amber-400/15 px-4 py-4 font-bold text-lg hover:bg-amber-400/25"
      >
        처음 맞추기
      </a>
      <div className="grid gap-2 sm:grid-cols-3">
        <a
          href="/cube/solo"
          className="rounded-xl bg-white/10 px-4 py-3 hover:bg-white/15"
        >
          <b>혼자 맞추기</b>
          <span className="block text-white/70 text-xs">
            이미 맞출 줄 안다면
          </span>
        </a>
        <a
          href="/cube/methods"
          className="rounded-xl bg-white/10 px-4 py-3 hover:bg-white/15"
        >
          <b>해법 익히기</b>
          <span className="block text-white/70 text-xs">
            다른 해법을 배우려면
          </span>
        </a>
        <a
          href="/cube/timer"
          className="rounded-xl bg-white/10 px-4 py-3 hover:bg-white/15"
        >
          <b>실물 큐브 타이머</b>
          <span className="block text-white/70 text-xs">
            실물로 맞출 줄 안다면
          </span>
        </a>
      </div>
      <section className="flex flex-col gap-2" data-guide-more>
        <h2 className="font-semibold text-sm text-white/70">더 알아보기</h2>
        <div className="flex flex-wrap gap-1.5">
          {MORE_STEPS.map((id) => (
            <button
              key={id}
              type="button"
              data-guide-more-step={id}
              aria-pressed={more === id}
              onClick={(e) => {
                setMore(more === id ? null : id);
                e.currentTarget.blur();
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                more === id
                  ? "border-sky-300 bg-sky-500/20"
                  : "border-white/15 hover:bg-white/10",
              )}
            >
              {MORE_TITLE[id]}
            </button>
          ))}
        </div>
        {more && <CubeIntroSteps key={more} only={[more]} />}
      </section>
    </div>
  );
}
