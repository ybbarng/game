"use client";

import { solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useMemo, useRef } from "react";

import { cn } from "@/lib/cn";
import { CubePosterPair } from "../components/CubePosterPair";
import { StillCube } from "../components/StillCube";
import { useCubeSettings } from "../settings";
import { useReducedMotion } from "../use-reduced-motion";
import { CubeNet } from "./CubeNet";
import { scrambledState } from "./net";

/**
 * 타이머의 섞인 모습 그림(2026-11-05 사용자 「전개도로 뜨는데 큐브 모양인게 훨씬 나아」).
 *
 * - 기본: 3D 정지 큐브(`StillCube`). 끌면 둘러볼 수 있고, 뒷면은 설정의 뒷면 보기(기본 거울 판)로 보인다.
 * - WebGL이 없거나(3D를 못 띄움) 움직임 줄이기면: 비스듬한 SVG 큐브 둘(`CubePoster`). 하나는 위·앞·오른쪽,
 *   하나는 큐브를 돌려 쥔 아래·왼쪽·뒤(`backSideState`)라 여섯 면이 모두 보인다.
 * - 그것도 못 그리면(공식을 읽지 못함 등): 펼친 그림.
 *
 * 섞기를 기다리는 동안(`scramble` null)에도 자리를 그대로 두고 앞 그림을 흐리게 보여, 섞기가 나와도 아래 누름
 * 자리가 밀리지 않고 3D 장면도 새로 만들지 않는다.
 */
export function ScramblePicture({
  n,
  scramble,
}: {
  n: number;
  scramble: string | null;
}) {
  const settings = useCubeSettings();
  const reduced = useReducedMotion();
  // 마지막으로 읽은 섞기 상태(기다리는 동안 흐리게 보인다). 처음에는 맞춘 큐브
  const last = useRef<{ n: number; state: PuzzleState } | null>(null);
  const parsed = useMemo(() => {
    if (scramble === null) return null;
    try {
      return scrambledState(n, scramble);
    } catch {
      return undefined;
    }
  }, [n, scramble]);
  if (parsed) last.current = { n, state: parsed };
  const state =
    parsed ??
    (last.current?.n === n ? last.current.state : null) ??
    solvedCube(n);
  const waiting = scramble === null;

  // 공식을 읽지 못하면 펼친 그림(그것도 못 그리면 아무것도 그리지 않는다)
  if (parsed === undefined && scramble !== null)
    return (
      <Frame mode="net" waiting={false}>
        <CubeNet n={n} scramble={scramble} />
      </Frame>
    );

  const posters = (
    <CubePosterPair
      n={n}
      state={state}
      settings={settings}
      fallback={scramble ? <CubeNet n={n} scramble={scramble} /> : null}
      className="w-full max-w-sm sm:max-w-md"
    />
  );
  if (reduced)
    return (
      <Frame mode="poster" waiting={waiting}>
        {posters}
      </Frame>
    );
  return (
    <Frame mode="3d" waiting={waiting}>
      <StillCube
        n={n}
        state={state}
        mask={null}
        settings={settings}
        hint={false}
        fallback={<div data-cube-poster-fallback>{posters}</div>}
      />
    </Frame>
  );
}

function Frame({
  mode,
  waiting,
  children,
}: {
  mode: "3d" | "poster" | "net";
  waiting: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-full justify-center transition-opacity",
        waiting && "animate-pulse opacity-30",
      )}
      data-cube-scramble-picture={mode}
      data-waiting={waiting ? "" : undefined}
      aria-hidden={waiting || undefined}
    >
      {children}
    </div>
  );
}
