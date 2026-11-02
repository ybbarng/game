"use client";

import { useEffect, useState } from "react";

/** 없는 주소 화면의 갈 곳: 늘 게임 목록, 별 따기 경로(/stardraw/…)면 별 따기 홈을 먼저 */
export function NotFoundLinks() {
  // 404 파일은 빌드 때 한 번 그려 주소를 모른다. 열린 뒤 실제 주소를 본다
  const [stardraw, setStardraw] = useState(false);
  useEffect(() => {
    setStardraw(/^\/stardraw(\/|$)/.test(window.location.pathname));
  }, []);
  return (
    <nav aria-label="갈 곳" className="flex flex-col items-center gap-3">
      {stardraw && (
        <a
          href="/stardraw"
          data-not-found-stardraw
          className="sd-cta rounded-2xl px-6 py-3 font-bold text-slate-950"
        >
          하늘의 별 따기 홈
        </a>
      )}
      <a
        href="/"
        data-not-found-home
        className={
          stardraw
            ? "text-sm text-white/70 underline underline-offset-2 hover:text-white"
            : "rounded-2xl border border-white/25 px-6 py-3 font-semibold hover:bg-white/10"
        }
      >
        게임 목록
      </a>
    </nav>
  );
}
