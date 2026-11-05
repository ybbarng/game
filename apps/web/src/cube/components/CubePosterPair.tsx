"use client";

import type { StickerMask } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { type ReactNode, useMemo } from "react";

import { cn } from "@/lib/cn";
import { type StickerMarks, stickersFromState } from "../bridge";
import { type CubeLook, lookColors, lookPatterns } from "../item-look";
import type { CubeSettings } from "../settings";
import { backSideState } from "../timer/scrambled";
import { CubePoster } from "./CubePoster";
import { posterShapes } from "./cube-poster-art";

/** 포스터 한 장의 그림 크기(CSS 픽셀). 3D 캔버스처럼 정사각형으로 두고 칸에 맞춰 줄인다 */
const POSTER_PX = 200;

/**
 * 비스듬한 SVG 큐브 둘(three.js 없음): 위·앞·오른쪽과 큐브를 돌려 쥔 아래·왼쪽·뒤(`backSideState`)라 여섯 면이
 * 모두 보인다. 타이머의 섞인 모습, 대결의 상대 작은 큐브·다시 보기, 배우기·패턴의 작은 그림, 그리고 3D를 못 그리는
 * 기기(WebGL 없음)의 큐브 자리가 쓴다(여럿을 띄워도 3D 장면을 만들지 않는다). 펼친 그림(전개도)은 쓰지 않는다
 * (2026-11-05 사용자). 칸마다 자리 번호(`data-sticker`)·가림·표시를 달고, `onSticker`면 칸을 누를 수 있다.
 * 못 그리면 `fallback`.
 */
export function CubePosterPair({
  n,
  state,
  settings,
  fallback,
  captions = true,
  className,
  look,
  mask,
  marks,
  onSticker,
  hidden,
}: {
  /** 가림(스티커 정체마다). 가린 칸은 `hidden` 색으로 */
  mask?: StickerMask | null | undefined;
  /** 칸 표시(스티커 정체마다): 고름·맞음·틀림 테두리 */
  marks?: StickerMarks | null | undefined;
  /** 칸을 누르면 그 자리 번호(f*n*n + k) */
  onSticker?: ((slot: number) => void) | undefined;
  /** 가린 칸 색. 없으면 설정대로 */
  hidden?: "black" | "gray" | undefined;
  /** 아이템전 화면 방해(색 뒤집기·흑백 화면). 큐브 장면과 같은 색·무늬로 칠한다 */
  look?: CubeLook | null | undefined;
  n: number;
  state: PuzzleState;
  settings: CubeSettings;
  fallback?: ReactNode;
  /** 그림 아래 「위·앞·오른쪽」「아래·왼쪽·뒤」(작은 칸에서는 끈다) */
  captions?: boolean;
  className?: string;
}) {
  const sides = useMemo(() => {
    try {
      const front = stickersFromState(n, state, mask, marks);
      const back = stickersFromState(n, backSideState(n, state), mask, marks);
      // 그릴 수 있는지 먼저 본다(못 그리면 대신 보일 것)
      posterShapes(n, front, POSTER_PX, POSTER_PX);
      return [
        { key: "front", label: "위·앞·오른쪽", stickers: front },
        { key: "back", label: "아래·왼쪽·뒤", stickers: back },
      ] as const;
    } catch {
      return null;
    }
  }, [n, state, mask, marks]);
  // 스티커 정체 → 원래 상태의 자리(뒤쪽 그림은 돌려 쥔 상태라 자리 번호가 다르다)
  const slotOf = useMemo(() => {
    const at = new Map<number, number>();
    state.perm.forEach((id, slot) => {
      at.set(id, slot);
    });
    return (id: number) => at.get(id) ?? id;
  }, [state]);
  if (!sides) return <>{fallback ?? null}</>;
  return (
    <div
      className={cn(
        "grid grid-cols-2",
        captions ? "gap-2" : "gap-0.5",
        className,
      )}
      data-cube-posters
    >
      {sides.map((s) => (
        <figure key={s.key} className="flex flex-col items-center gap-1">
          <CubePoster
            n={n}
            stickers={s.stickers}
            colors={lookColors(settings.colors, look)}
            patterns={lookPatterns(look)}
            width={POSTER_PX}
            height={POSTER_PX}
            stickerless={settings.stickerless}
            hidden={hidden ?? settings.hidden}
            slotOf={slotOf}
            onSticker={onSticker}
            shadow={captions && settings.quality !== "low"}
            className="h-auto w-full"
          />
          {captions && (
            <figcaption className="text-white/50 text-xs">{s.label}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
