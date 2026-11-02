"use client";

import { AgencyFooter } from "@/stardraw/components/AgencyFooter";
import { HomeLink } from "@/stardraw/components/HomeLink";

import { useLedger } from "../services";
import { QualifyPanel } from "./QualifyPanel";

/** /stardraw/qualify: 소속 받기(실제 장부) */
export function QualifyView() {
  const { services } = useLedger();
  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <HomeLink />
          <h1 className="font-bold text-lg">소속</h1>
          <span />
        </div>
        <p className="break-keep text-sm text-white/75" data-qual-about>
          소속은 카노푸스 우주국장이 우주인에게 부여하는 모임입니다.
          별·성단·성운·은하가 있고, 소속마다 정한 방법으로 확인한 우주인만 받을
          수 있습니다. 받은 소속은 예측서와 등록증에 표시됩니다.
        </p>
        {services ? (
          <QualifyPanel services={services} />
        ) : (
          <p className="py-20 text-center text-white/60">
            하늘을 펴고 있습니다
          </p>
        )}
        <footer className="flex flex-col items-center gap-2 pt-4 text-center text-[11px] text-white/40">
          <a href="/stardraw/privacy" className="hover:text-white/70">
            개인정보처리방침
          </a>
          <p>
            <AgencyFooter />
          </p>
        </footer>
      </div>
    </main>
  );
}
