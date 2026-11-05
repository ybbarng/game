"use client";

import type { StickerMask } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import {
  faceGrid,
  marksAtSlots,
  type StickerMarks,
  stickersFromState,
} from "../bridge";
import { stickerAtHit } from "../learn/interact";
import type { CubeSettings } from "../settings";
import { type CubeView, loadCubeView } from "../view";
import { CubeNet } from "./CubeNet";
import { StageWithNet, useBackView } from "./StageWithNet";

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
}: {
  n: number;
  state: PuzzleState;
  mask: StickerMask | null;
  settings: CubeSettings;
  onSticker?: (sticker: number) => void;
  /** 칸 표시(스티커 정체마다): 고른 조각·맞음·틀림을 3D 고리와 펼친 그림 테두리로 */
  marks?: StickerMarks | null;
  /** 3D를 못 그릴 때 대신 보일 것. 없으면 펼친 그림 */
  fallback?: ReactNode;
  /** 큐브 아래 「끌면 둘러볼 수 있어요」 안내 */
  hint?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = useRef({ state, mask, onSticker, marks });
  live.current = { state, mask, onSticker, marks };
  const back = useBackView(settings.backView, !failed);
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

  const net = (
    <CubeNet
      n={n}
      faces={faceGrid(n, state, mask)}
      colors={settings.colors}
      hidden={settings.hidden}
      className="h-auto w-full"
      onCell={onSticker}
      marks={marksAtSlots(state, marks)}
    />
  );
  return (
    <div className="flex w-full flex-col items-center gap-2" data-cube-still>
      {failed ? (
        (fallback ?? (
          <div
            data-cube-no3d
            className="flex aspect-square w-full max-w-[360px] items-center p-4"
          >
            {net}
          </div>
        ))
      ) : (
        <StageWithNet
          boxRef={back.ref}
          maxWidth={mirror ? 440 : 360}
          // 뒤쪽 칸도 고를 수 있게 거울 판이나 펼친 그림을 둔다
          net={back.mode === "net" ? net : null}
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
            </div>
          }
        />
      )}
      {hint && !(failed && fallback) && (
        <p className="text-white/50 text-xs">
          {onSticker
            ? back.mode === "mirror"
              ? "큐브나 거울에서 칸을 눌러요. 끌면 둘러볼 수 있어요."
              : back.mode === "net"
                ? "큐브나 펼친 그림에서 칸을 눌러요. 끌면 둘러볼 수 있어요."
                : "큐브에서 칸을 눌러요. 끌면 둘러볼 수 있어요."
            : "끌면 큐브를 둘러볼 수 있어요."}
        </p>
      )}
    </div>
  );
}
