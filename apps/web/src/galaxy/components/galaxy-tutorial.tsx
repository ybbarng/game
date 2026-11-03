"use client";

import {
  type Action,
  cardById,
  createMatch,
  type GalaxyView,
  type GameEvent,
  viewOf,
} from "@game/galaxy-engine";
import { useMemo } from "react";

import type { TutorialKit } from "@/components/tutorial/kit";
import { seatLabel } from "../format";
import { EMPTY_TIMELINE } from "../fx";
import { useGalaxyTutorialProgress } from "../progress";
import { skyArt } from "../sky-art";
import { magScale, starRgb } from "../star-color";
import { useGalaxy } from "../store";
import {
  type BoardScene,
  boardGroup,
  boardStar,
  GALAXY_LESSONS,
  GALAXY_REAL_RULES,
  GALAXY_TUTORIAL_LEVEL,
  type GalaxyScene,
  type PairScene,
  type SkyScene,
  sceneState,
  TUTORIAL_BOARD,
} from "../tutorial";
import { GalaxyBoard } from "./GalaxyBoard";
import { GALAXY_BG, GalaxyGame } from "./GalaxyGame";

/** 설명·퀴즈의 판 그림(움직임 없이, 누를 수 없다). 공문이 있으면 아래에 종이로 */
function BoardSceneView({ scene }: { scene: BoardScene }) {
  const view = useMemo(() => viewOf(sceneState(scene), 0), [scene]);
  const card = scene.card === undefined ? null : cardById(scene.card);
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2">
      <div className="pointer-events-none w-full">
        <GalaxyBoard
          view={view}
          timeline={EMPTY_TIMELINE}
          elapsed={0}
          selected={null}
          name={(seat) => seatLabel(seat, 0, null, 2)}
          marked={new Set(scene.marked ?? [])}
        />
      </div>
      {card && (
        <div
          data-scene-card
          className="w-[86%] max-w-80 rounded-md border border-amber-900/20 bg-[#f6efe0] px-4 pt-2 pb-3 text-slate-900 shadow-lg"
        >
          <p className="border-amber-900/25 border-b pb-1 text-center font-semibold text-[10px] text-amber-950/70 tracking-[0.2em]">
            카노푸스 우주국 공문
          </p>
          <p className="mt-1.5 font-black text-sm">{card.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug">{card.text}</p>
        </div>
      )}
    </div>
  );
}

/** 별자리 하나의 선 그림(이름 없이). 고른 별은 반짝인다 */
export function ConstellationArt({ scene }: { scene: SkyScene }) {
  const g = boardGroup(scene.group);
  const index = TUTORIAL_BOARD.groups.indexOf(g);
  const art = skyArt(TUTORIAL_BOARD)[index];
  if (!art) return null;
  const half = 112;
  const { x, y } = art.center;
  return (
    <svg
      data-scene-sky={scene.group}
      viewBox={`${x - half} ${y - half} ${half * 2} ${half * 2}`}
      className="mx-auto aspect-square w-full max-w-64 rounded-2xl bg-[radial-gradient(ellipse_at_50%_40%,#132044_0%,#0a1230_60%,#070b1f_100%)]"
      role="img"
      aria-label="별자리 선 그림"
    >
      {art.segments.map(([a, b], i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: 선 토막 차례는 바뀌지 않는다
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="#c7d2fe"
          strokeOpacity={0.55}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      ))}
      {art.extra.map((e) => (
        <circle
          key={`${e.x}-${e.y}`}
          cx={e.x}
          cy={e.y}
          r={Math.max(1.4, 3.2 - e.mag * 0.5)}
          fill="#e2e8f0"
          opacity={0.6}
        />
      ))}
      {g.squares.map((sq) => {
        const p = art.stars.get(sq);
        const star = TUTORIAL_BOARD.squares[sq]?.star?.star;
        if (!p || !star) return null;
        const r = 3 + 5 * magScale(star.mag);
        const lit = scene.star === star.id;
        return (
          <g key={sq} data-lit={lit || undefined}>
            {lit && (
              <circle
                cx={p.x}
                cy={p.y}
                r={r + 7}
                fill="none"
                stroke="#fde68a"
                strokeWidth={2}
                className="motion-safe:animate-pulse"
              />
            )}
            <circle cx={p.x} cy={p.y} r={r} fill={starRgb(star.k)} />
          </g>
        );
      })}
    </svg>
  );
}

/** 두 별 견주기: 이름·별자리·색만(숫자는 풀이에서) */
function PairView({ scene }: { scene: PairScene }) {
  return (
    <div data-scene-pair className="mx-auto flex w-full max-w-sm gap-2">
      {scene.stars.map((id) => {
        const s = boardStar(id);
        const group = TUTORIAL_BOARD.groups[s.group];
        return (
          <div
            key={id}
            className="flex flex-1 flex-col items-center gap-1 rounded-2xl bg-[#0a1230] p-3"
          >
            <svg viewBox="0 0 40 40" className="size-12" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill={starRgb(s.star.k, 0.18)} />
              <circle
                cx="20"
                cy="20"
                r={5 + 9 * magScale(s.star.mag)}
                fill={starRgb(s.star.k)}
              />
            </svg>
            <span className="font-bold">{s.star.ko}</span>
            <span className="text-white/60 text-xs">{group?.ko}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 설명·퀴즈 장면 */
export function GalaxySceneView({ scenario }: { scenario: GalaxyScene }) {
  if (scenario.kind === "sky") return <ConstellationArt scene={scenario} />;
  if (scenario.kind === "pair") return <PairView scene={scenario} />;
  return <BoardSceneView scene={scenario} />;
}

/** 은하 한 바퀴 배우기. 미션은 굴림 눈을 정해 둔 장면에서 입문 컴퓨터와, 장면이 없으면 짧은 판 처음부터 */
export const galaxyTutorial: TutorialKit<
  GalaxyView,
  GameEvent,
  GalaxyScene,
  Action
> = {
  title: "은하 한 바퀴 배우기",
  background: GALAXY_BG,
  lessons: GALAXY_LESSONS,
  progress: useGalaxyTutorialProgress,
  glossary: false,
  startMission(scenario) {
    if (scenario && scenario.kind !== "board")
      throw new Error("미션 장면은 판이어야 한다");
    if (scenario)
      useGalaxy
        .getState()
        .startPractice(
          sceneState(scenario),
          GALAXY_TUTORIAL_LEVEL,
          scenario.dice,
        );
    else
      useGalaxy
        .getState()
        .startPractice(
          createMatch(
            GALAXY_REAL_RULES,
            Math.floor(Math.random() * 2 ** 31),
            TUTORIAL_BOARD,
          ).state,
          GALAXY_TUTORIAL_LEVEL,
        );
  },
  subscribe: (listener) =>
    useGalaxy.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: GalaxySceneView,
  Table: ({ onExit, mission }) => (
    <GalaxyGame
      onExit={() => {
        useGalaxy.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
