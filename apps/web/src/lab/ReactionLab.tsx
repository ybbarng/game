"use client";

import { useEffect, useState } from "react";

import { E1Panel } from "./E1Panel";
import { E5Panel } from "./E5Panel";

/**
 * 공정한 동시 판정 측정 화면(docs/43 5절). 숨은 주소라 게임 목록·메뉴에 없다.
 * 기본은 E1(기기 혼자), `?mode=e5`면 속임 시험.
 * 망 측정(E2)은 실제 온라인 대전에서 저절로 잰다(net/latency.ts).
 */
export function ReactionLab() {
  const [mode, setMode] = useState<"e1" | "e5" | null>(null);
  useEffect(() => {
    setMode(
      new URLSearchParams(window.location.search).get("mode") === "e5"
        ? "e5"
        : "e1",
    );
  }, []);
  return (
    <div className="min-h-dvh bg-neutral-900">
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-5 text-white">
        <h1 className="font-bold text-xl">반응 측정실</h1>
        <p className="break-keep text-sm text-white/70">
          누가 먼저 눌렀는지 공정하게 가리는 장치를 만들려고 기기와 망을 재는
          화면입니다. 결과는 개발용 진단 기록으로 보내고, 아래 단추로 복사하거나
          내려받을 수 있습니다.
        </p>
        {mode === "e1" && <E1Panel />}
        {mode === "e5" && <E5Panel />}
      </main>
    </div>
  );
}
