"use client";

import { useEffect } from "react";

import { rehydrateStores } from "@/lib/persist-hydration";

/**
 * 브라우저에 저장해 둔 설정과 튜토리얼 진행을 첫 그리기 뒤에 불러온다.
 * 처음부터 읽으면 미리 그려 둔 HTML(기본값)과 첫 화면이 달라 React가 화면을 버리고 다시 그린다.
 * 어느 저장소를 읽을지는 저장소 파일이 `hydrateAfterFirstPaint`로 스스로 올린다(이 화면이 불러온 것만).
 */
export function StoreHydration() {
  useEffect(() => {
    void rehydrateStores().then(() => {
      // 화면이 단추에 동작을 붙이고 저장값까지 읽었다는 표시. 화면 시험이 누르기 전에 기다린다
      // (그 전에 누르면 누름이 사라지거나, 늦게 읽힌 저장값이 고른 것을 덮어쓴다)
      document.documentElement.dataset.hydrated = "";
    });
  }, []);
  return null;
}
