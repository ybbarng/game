"use client";

import type { StickerMask } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { type StickerMarks, stickersFromState } from "../bridge";
import { stickerAtHit } from "../learn/interact";
import type { CubeSettings } from "../settings";
import { type CubeView, loadCubeView } from "../view";
import { CubePosterPair } from "./CubePosterPair";
import { StageBox, useBackView } from "./StageBox";
import { ViewHome } from "./ViewHome";

/** 정지한 큐브(돌리지 않음). 끌면 보는 각만 바뀌고, `onSticker`가 있으면 누른 칸을 알린다 */
export function StillCube({
  n,
  state,
  mask,
  settings,
  onSticker,
  marks,
  fallback,
  hint = true,
  mirrorMinWidth,
}: {
  n: number;
  state: PuzzleState;
  mask: StickerMask | null;
  settings: CubeSettings;
  onSticker?: (sticker: number) => void;
  /** 칸 표시(스티커 정체마다): 고른 조각·맞음·틀림을 3D 고리와 큐브 그림 테두리로 */
  marks?: StickerMarks | null;
  /** 3D를 못 그릴 때 대신 보일 것. 없으면 비스듬한 큐브 그림 둘(앞쪽 셋·뒤쪽 셋, 칸을 누를 수 있다) */
  fallback?: ReactNode;
  /** 큐브 아래 「끌면 둘러볼 수 있어요」 안내 */
  hint?: boolean;
  /** 거울 판을 보일 가장 좁은 자리. 보기만 하는 작은 큐브(모양 만들기 목표)는 `MIRROR_VIEW_MIN_WIDTH` */
  mirrorMinWidth?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = useRef({ state, mask, onSticker, marks });
  live.current = { state, mask, onSticker, marks };
  const back = useBackView(settings.backView, !failed, mirrorMinWidth);
  const mirror = back.mode === "mirror";
  useEffect(() => {
    if (ready) viewRef.current?.setMirror(mirror);
  }, [mirror, ready]);

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
          onTap: (hit) => {
            const i = stickerAtHit(n, hit.center, hit.normal);
            if (i !== null) live.current.onSticker?.(i);
          },
        });
        view.setStickers(
          stickersFromState(
            n,
            live.current.state,
            live.current.mask,
            live.current.marks,
          ),
        );
        viewRef.current = view;
        ro.observe(canvas);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [
    n,
    settings.quality,
    settings.colors,
    settings.stickerless,
    settings.hidden,
  ]);

  useEffect(() => {
    viewRef.current?.setStickers(stickersFromState(n, state, mask, marks));
  }, [n, state, mask, marks]);

  const posters = (
    <CubePosterPair
      n={n}
      state={state}
      mask={mask}
      marks={marks}
      settings={settings}
      onSticker={onSticker}
      className="w-full max-w-sm"
    />
  );
  return (
    <div className="flex w-full flex-col items-center gap-2" data-cube-still>
      {failed ? (
        (fallback ?? (
          <div
            data-cube-no3d
            className="flex w-full max-w-[360px] items-center justify-center p-2"
          >
            {posters}
          </div>
        ))
      ) : (
        <StageBox
          boxRef={back.ref}
          // 뒤쪽 칸도 고를 수 있게 거울 판까지 들인다
          maxWidth={mirror ? 440 : 360}
          stage={
            <div className="relative aspect-square w-full">
              <canvas
                ref={canvasRef}
                data-cube-canvas
                data-cube-ready={ready ? "" : undefined}
                className={cn(
                  "h-full w-full touch-none",
                  onSticker
                    ? "cursor-pointer"
                    : "cursor-grab active:cursor-grabbing",
                )}
              />
              <ViewHome viewRef={viewRef} ready={ready} />
            </div>
          }
        />
      )}
      {hint && !(failed && (fallback || !onSticker)) && (
        <p className="text-white/50 text-xs">
          {failed
            ? "두 그림에서 칸을 눌러요."
            : onSticker
              ? back.mode === "mirror"
                ? "큐브나 거울에서 칸을 눌러요. 끌면 둘러볼 수 있어요."
                : "큐브에서 칸을 눌러요. 끌면 둘러볼 수 있어요."
              : "끌면 큐브를 둘러볼 수 있어요."}
        </p>
      )}
    </div>
  );
}
