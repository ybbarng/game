"use client";

import { type RefObject, useEffect, useState } from "react";

import { cn } from "@/lib/cn";

import { isTyping, loadKeymap, resolveAction } from "../input";
import type { CubeView } from "../view";

/**
 * 「처음 각도로」(2026-11-10): 끌어 돌린 보기는 손을 떼도 남는다(`CubeView`의 `keepView` 기본). 보기가 처음 각에서
 * 벗어나 있을 때만 큐브 칸 오른쪽 아래에 작은 단추가 뜨고, 누르거나 키(기본 ↑, 키 배치의 `viewHome`)를 치면 천천히
 * 처음 각으로 돌아온다. 키는 그때 돌아갈 보기가 있을 때만 먹는다(아니면 ↑로 페이지가 그대로 올라간다).
 *
 * 큐브 3D 화면마다 장면을 담은 `relative` 칸 안에 둔다. 판·문제가 바뀌어도 각도는 그대로 둔다(사용자가 고른
 * 각도를 화면이 버리지 않는다, docs/47 4-2).
 */
export function ViewHome({
  viewRef,
  ready,
  className,
}: {
  viewRef: RefObject<CubeView | null>;
  /** 장면이 준비됐는지(바뀌면 새 장면에 다시 붙는다) */
  ready: boolean;
  className?: string;
}) {
  const [turned, setTurned] = useState(false);

  useEffect(() => {
    const view = ready ? viewRef.current : null;
    if (!view) {
      setTurned(false);
      return;
    }
    return view.onViewTurn(setTurned);
  }, [ready, viewRef]);

  useEffect(() => {
    if (!ready) return;
    const keymap = loadKeymap();
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const action = resolveAction(keymap, {
        code: e.code,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        repeat: e.repeat,
      });
      if (action !== "viewHome") return;
      if (viewRef.current?.resetView()) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ready, viewRef]);

  if (!turned) return null;
  return (
    <button
      type="button"
      data-cube-view-home
      onClick={() => viewRef.current?.resetView()}
      className={cn(
        "absolute right-2 bottom-2 z-10 rounded-lg bg-black/60 px-2.5 py-1 text-white/85 text-xs hover:bg-black/75",
        className,
      )}
    >
      처음 각도로
    </button>
  );
}
