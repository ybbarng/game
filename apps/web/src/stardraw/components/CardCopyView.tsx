"use client";

import { realClock } from "@game/fair-play";
import { useEffect, useState } from "react";

import { AgencyFooter } from "@/stardraw/components/AgencyFooter";
import { HomeLink } from "@/stardraw/components/HomeLink";

import { AstronautCard } from "../astronaut/AstronautCard";
import { decodeCard, type SharedCard } from "../astronaut/card-code";
import {
  type CardCheck,
  checkCard,
  type RegistrationSource,
  serverRegistrations,
} from "../astronaut/card-ledger";
import { getServices, serverApi } from "../services";

/**
 * 대조할 장부. 서버 장부면 그 회차 파일 하나를 받고, 서버가 없는 빌드(연습 장부)는 이 기기 안 장부로 본다.
 * 연습 장부는 기기마다 따로라 다른 기기에서 공유한 등록증은 찾을 수 없다
 */
function registrationSource(): RegistrationSource | null {
  const base = serverApi();
  if (base) return serverRegistrations(base);
  const practice = getServices().practice;
  if (!practice) return null;
  return async (round) => {
    await practice.settle();
    const regs = practice.closedRegistrations(round);
    if (!regs) return null;
    return {
      pubs: regs.map((r) => r.pub),
      sealedAt: practice.record(round)?.rootLoggedAt ?? 0,
    };
  };
}

const CHECK_TEXT: Record<CardCheck["state"] | "checking", string> = {
  checking: "장부에서 찾아보고 있습니다",
  found: "카노푸스 우주국 장부에 등록된 우주인입니다.",
  missing: "장부에서 찾을 수 없는 등록증입니다.",
  unsealed: "아직 장부에 오르지 않은 등록증입니다.",
  unknown: "장부와 대조할 수 없는 등록증입니다.",
  error: "장부에 닿지 못했습니다. 잠시 뒤 다시 열어 주세요.",
};

/**
 * 등록증 공유본 /stardraw/card?c=v1.…(docs/36 11-66). 주소에 담긴 값으로 등록증을 그린다(열쇠 없음).
 * 뒤집기·홀로그램은 내 등록증과 같고, 공개 열쇠는 늘 가려 꺼낼 수 없다. 공개 장부의 등록 회차 파일과 대조해
 * 장부에 있는 우주인인지 아래에 적는다. 보여 주는 사람이 주인인지는 알 수 없어 본인 확인은 두지 않는다
 */
export function CardCopyView() {
  /** undefined 주소를 읽기 전, null 알아볼 수 없는 값 */
  const [card, setCard] = useState<SharedCard | null | undefined>(undefined);
  const [check, setCheck] = useState<CardCheck | null>(null);

  useEffect(() => {
    const read = () =>
      setCard(decodeCard(new URLSearchParams(window.location.search).get("c")));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  useEffect(() => {
    if (!card) return;
    let alive = true;
    setCheck(null);
    void checkCard(card, registrationSource()).then((c) => {
      if (alive) setCheck(c);
    });
    return () => {
      alive = false;
    };
  }, [card]);

  const state = check?.state ?? "checking";
  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <HomeLink />
          <h1 className="font-bold text-lg">우주인 등록증</h1>
          <span />
        </div>
        {card === undefined ? (
          <p className="py-20 text-center text-white/60">
            하늘을 펴고 있습니다
          </p>
        ) : card === null ? (
          <p
            data-card-unreadable
            className="py-16 text-center text-white/75 leading-relaxed"
          >
            알아볼 수 없는 등록증입니다.
          </p>
        ) : (
          <section
            className="flex flex-col gap-4"
            aria-label="우주인 등록증 공유본"
            data-card-copy={card.astronaut.number}
          >
            <AstronautCard
              astronaut={card.astronaut}
              issued={card.issued}
              clock={realClock}
              copy
            />
            <p
              data-card-check={state}
              role="status"
              className={
                state === "found"
                  ? "break-keep rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-center text-emerald-50 text-sm"
                  : state === "checking"
                    ? "break-keep px-4 py-3 text-center text-sm text-white/55"
                    : "break-keep rounded-xl border border-amber-200/25 bg-amber-200/10 px-4 py-3 text-center text-amber-50 text-sm"
              }
            >
              {state === "found" ? "✓ " : ""}
              {CHECK_TEXT[state]}
            </p>
          </section>
        )}
        <div className="flex flex-col items-center pt-2">
          <a
            href="/stardraw"
            data-card-join
            className="sd-cta w-full max-w-xs rounded-2xl py-3 text-center font-bold text-slate-950"
          >
            나도 우주인 되기
          </a>
        </div>
        <footer className="pt-4 text-center text-[11px] text-white/40">
          <AgencyFooter />
        </footer>
      </div>
    </main>
  );
}
