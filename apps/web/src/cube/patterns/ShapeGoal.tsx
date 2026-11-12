"use client";

import type { PuzzleState } from "@game/puzzle-core";

import { cn } from "@/lib/cn";
import { MIRROR_VIEW_MIN_WIDTH } from "../back-view";
import { CubePosterPair } from "../components/CubePosterPair";
import { StillCube } from "../components/StillCube";
import type { CubeLook } from "../item-look";
import type { CubeSettings } from "../settings";

/**
 * 모양 만들기의 목표 그림(혼자 하기·대결이 함께 쓴다, docs/47 9-10). 내가 돌리는 큐브와 같은 3D 큐브에 같은 거울 판
 * (설정의 뒷면 보기)으로 뒤·왼쪽·아래를 보이고, 끌면 둘러본다(2026-11-12 사용자 「거울 상을 쓰는 게 낫지 않을까?
 * 일관성 측면에서」). 3D를 못 그리는 기기와 아이템전 화면 방해(`look`)가 있을 때는 비스듬한 큐브 그림 둘.
 * 고르는 카드처럼 그림이 여럿인 곳은 3D 장면을 여럿 만들지 않게 그대로 큐브 그림 둘(`CubePosterPair`)을 쓴다.
 */
export function ShapeGoal({
  n,
  state,
  settings,
  look,
  className,
}: {
  n: number;
  state: PuzzleState;
  settings: CubeSettings;
  look?: CubeLook | null;
  /** 그림 자리의 너비(Tailwind) */
  className?: string;
}) {
  const posters = (
    <CubePosterPair
      n={n}
      state={state}
      settings={settings}
      look={look}
      captions={false}
      className="w-full"
    />
  );
  return (
    <div data-cube-shape-goal className={cn("shrink-0", className)}>
      {look ? (
        posters
      ) : (
        <StillCube
          n={n}
          state={state}
          mask={null}
          settings={settings}
          hint={false}
          mirrorMinWidth={MIRROR_VIEW_MIN_WIDTH}
          fallback={posters}
        />
      )}
    </div>
  );
}
