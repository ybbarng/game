"use client";

import type { PuzzleState } from "@game/puzzle-core";
import { type ReactNode, useMemo } from "react";

import { cn } from "@/lib/cn";
import { stickersFromState } from "../bridge";
import type { CubeSettings } from "../settings";
import { backSideState } from "../timer/net";
import { CubePoster } from "./CubePoster";
import { posterShapes } from "./cube-poster-art";

/** 포스터 한 장의 그림 크기(CSS 픽셀). 3D 캔버스처럼 정사각형으로 두고 칸에 맞춰 줄인다 */
const POSTER_PX = 200;

/**
 * 비스듬한 SVG 큐브 둘(three.js 없음): 위·앞·오른쪽과 큐브를 돌려 쥔 아래·왼쪽·뒤(`backSideState`)라 여섯 면이
 * 모두 보인다. 타이머의 섞인 모습, 대결의 상대 작은 큐브·다시 보기가 쓴다(여럿을 띄워도 3D 장면을 만들지 않는다).
 * 못 그리면 `fallback`.
 */
export function CubePosterPair({
  n,
  state,
  settings,
  fallback,
  captions = true,
  className,
}: {
  n: number;
  state: PuzzleState;
  settings: CubeSettings;
  fallback: ReactNode;
  /** 그림 아래 「위·앞·오른쪽」「아래·왼쪽·뒤」(작은 칸에서는 끈다) */
  captions?: boolean;
  className?: string;
}) {
  const sides = useMemo(() => {
    try {
      const front = stickersFromState(n, state);
      const back = stickersFromState(n, backSideState(n, state));
      // 그릴 수 있는지 먼저 본다(못 그리면 대신 보일 것)
      posterShapes(n, front, POSTER_PX, POSTER_PX);
      return [
        { key: "front", label: "위·앞·오른쪽", stickers: front },
        { key: "back", label: "아래·왼쪽·뒤", stickers: back },
      ] as const;
    } catch {
      return null;
    }
  }, [n, state]);
  if (!sides) return <>{fallback}</>;
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
            colors={settings.colors}
            width={POSTER_PX}
            height={POSTER_PX}
            stickerless={settings.stickerless}
            hidden={settings.hidden}
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
