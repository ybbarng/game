"use client";

import type { StickerMask } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useEffect, useRef, useState } from "react";

import { stickersFromState } from "../../bridge";
import type { CubeSettings } from "../../settings";
import { type CubeView, loadCubeView } from "../../view";
import { CubePosterPair } from "../CubePosterPair";

/**
 * 상태 하나를 3D로 보이는 큐브(「큐브의 수학」). 키는 받지 않는다. `syncToken`이 바뀌면 `state`로 다시 칠하고,
 * 부모가 수를 따라 돌리고 싶으면 `onView`로 받은 장면에 `enqueue`한다. 3D를 못 그리면 비스듬한 큐브 그림 둘.
 */
export function StateCube({
  n,
  state,
  mask = null,
  syncToken,
  settings,
  moveMs,
  onView,
  className,
}: {
  n: number;
  state: PuzzleState;
  mask?: StickerMask | null;
  syncToken: number;
  settings: CubeSettings;
  moveMs?: number;
  onView?: (view: CubeView | null) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const live = useRef({ state, mask, onView });
  live.current = { state, mask, onView };

  const ms = moveMs ?? settings.moveMs;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    setReady(false);
    const ro = new ResizeObserver(() =>
      viewRef.current?.resize(canvas.clientWidth, canvas.clientHeight),
    );
    void loadCubeView()
      .then(({ CubeView }) => {
        if (disposed) return;
        const view = CubeView.create(canvas, {
          n,
          quality: settings.quality,
          colors: settings.colors,
          stickerless: settings.stickerless,
          hidden: settings.hidden,
          moveMs: ms,
        });
        view.setStickers(
          stickersFromState(n, live.current.state, live.current.mask),
        );
        viewRef.current = view;
        ro.observe(canvas);
        setReady(true);
        live.current.onView?.(view);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      live.current.onView?.(null);
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [
    n,
    ms,
    settings.quality,
    settings.colors,
    settings.stickerless,
    settings.hidden,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: syncToken이 바뀔 때만 다시 칠한다
  useEffect(() => {
    viewRef.current?.flush();
    viewRef.current?.setStickers(
      stickersFromState(n, live.current.state, live.current.mask),
    );
  }, [syncToken, n]);

  return (
    <div className={className ?? "relative aspect-square w-full max-w-[300px]"}>
      {failed ? (
        <div data-cube-no3d className="flex h-full items-center p-2">
          <CubePosterPair
            n={n}
            state={state}
            mask={mask}
            settings={settings}
            className="w-full"
          />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          data-cube-canvas
          data-cube-ready={ready ? "" : undefined}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        />
      )}
    </div>
  );
}
