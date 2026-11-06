"use client";

import {
  type Action,
  applyMove,
  type Board,
  createJanggiScenario,
  createMatch,
  type GameEvent,
  HEIGHT,
  type JanggiView,
  KIND_NAMES,
  type Kind,
  type Move,
  pointAt,
  pointName,
  pseudoTargets,
  SETUPS,
  type Setup,
  SIDE_NAMES,
  type Side,
  WIDTH,
} from "@game/janggi-engine";
import { useMemo, useState } from "react";

import type { TutorialKit } from "@/components/tutorial/kit";
import { cn } from "@/lib/cn";
import { useJanggiTutorialProgress } from "@/tutorial/progress";

import { piecesInDanger } from "../danger";
import { openingPieces, SETUP_NAMES } from "../opening-lessons";
import { useJanggiSettings } from "../settings";
import { useJanggi } from "../store";
import {
  JANGGI_LESSONS,
  JANGGI_TUTORIAL_RULES,
  type JanggiScene,
} from "../tutorial";
import { JanggiBoard, pointPercent } from "./JanggiBoard";
import { JanggiGame } from "./JanggiGame";

const sceneState = (scene: JanggiScene) =>
  createJanggiScenario({ rules: JANGGI_TUTORIAL_RULES, ...scene });

const parse = (text: string): Move => {
  const [from = "", to = ""] = text.split("-");
  return { from: pointAt(from), to: pointAt(to) };
};

/** 장면마다 새 번호. 단계가 바뀌면 넘겨 보던 수·고른 차림을 처음으로 돌린다 */
const sceneKeys = new WeakMap<JanggiScene, number>();
let nextSceneKey = 0;
function keyOf(scene: JanggiScene): number {
  let key = sceneKeys.get(scene);
  if (key === undefined) {
    key = nextSceneKey++;
    sceneKeys.set(scene, key);
  }
  return key;
}

/** 설명·퀴즈에 보이는 판 그림 */
function JanggiSceneView({ scenario }: { scenario: JanggiScene }) {
  return <SceneBody key={keyOf(scenario)} scenario={scenario} />;
}

/**
 * 판 바깥 여백의 칸 번호(기보 표기와 같다): 위쪽에 세로줄 번호(왼쪽부터 1~9),
 * 왼쪽에 가로줄 번호(위부터 1~9, 맨 아래 줄은 0). 자리 이름은 「가로줄 + 세로줄」이다(79 = 7째 가로줄의 9째 세로줄)
 */
const COLUMNS = Array.from({ length: WIDTH }, (_, x) => x);
const ROWS = Array.from({ length: HEIGHT }, (_, y) => y);

function BoardNumbers() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {COLUMNS.map((x) => (
        <span
          key={`c${x}`}
          data-axis-col={x + 1}
          className="-translate-x-1/2 absolute top-0 -mt-3.5 text-[10px] text-white/60 leading-none tabular-nums"
          style={{ left: `${pointPercent(x, 0)[0]}%` }}
        >
          {x + 1}
        </span>
      ))}
      {ROWS.map((y) => (
        <span
          key={`r${y}`}
          data-axis-row={(y + 1) % 10}
          className="-translate-y-1/2 absolute left-0 -ml-3.5 text-[10px] text-white/60 leading-none tabular-nums"
          style={{ top: `${pointPercent(0, y)[1]}%` }}
        >
          {(y + 1) % 10}
        </span>
      ))}
    </div>
  );
}

/**
 * `show` 자리 기물이 갈 수 있는 곳에 점, `rings`는 얇은 주황 고리, `warn`은 빨간 점선 고리.
 * `pickSetup`이면 판 위 단추로 내 상차림을 바꾸고, `replay`면 「다음 수」로 한 수씩 넘긴다. 판은 누를 수 없다
 */
function SceneBody({ scenario }: { scenario: JanggiScene }) {
  const labels = useJanggiSettings((s) => s.labels);
  const [setup, setSetup] = useState<Setup>("NENE");
  const [frame, setFrame] = useState(0);
  const moves = useMemo(
    () => (scenario.replay ?? []).map(parse),
    [scenario.replay],
  );
  const start = useMemo(
    () =>
      sceneState(
        scenario.pickSetup
          ? { ...scenario, pieces: openingPieces(setup, "NENE") }
          : scenario,
      ).board,
    [scenario, setup],
  );
  const before: Board = useMemo(
    () =>
      moves.slice(0, Math.max(0, frame - 1)).reduce<Board>(applyMove, start),
    [moves, frame, start],
  );
  const last = frame > 0 ? (moves[frame - 1] ?? null) : null;
  const board = last ? applyMove(before, last) : before;
  const from = scenario.show && frame === 0 ? pointAt(scenario.show) : null;
  const shown =
    from === null ? [] : pseudoTargets(board, from).map((to) => ({ from, to }));
  const rings = (scenario.rings ?? []).map(pointAt);
  const danger = scenario.replay
    ? piecesInDanger(board, "c")
    : (scenario.warn ?? []).map(pointAt);

  return (
    <div className="flex flex-col items-center gap-2">
      {scenario.pickSetup && (
        <fieldset className="grid w-full grid-cols-2 gap-1.5">
          <legend className="sr-only">내 상차림 바꿔 보기</legend>
          {SETUPS.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={setup === s.value}
              onClick={() => setSetup(s.value)}
              className={cn(
                "rounded-xl border px-2 py-1.5 font-semibold text-sm",
                setup === s.value
                  ? "border-amber-300 bg-amber-300/25"
                  : "border-white/15 bg-white/5 hover:bg-white/10",
              )}
            >
              {s.label}
            </button>
          ))}
        </fieldset>
      )}
      <div className="relative mx-auto mt-3 aspect-[924/1024] w-full max-w-[16rem]">
        <BoardNumbers />
        <JanggiBoard
          board={board}
          flipped={false}
          legal={shown}
          selected={from}
          onSelect={() => {}}
          onMove={() => {}}
          lastMove={last}
          checkedKing={null}
          labels={labels}
          rings={rings}
          danger={danger}
        />
      </div>
      {scenario.pickSetup && (
        <p className="text-sm" data-setup-caption>
          초 {SETUPS.find((s) => s.value === setup)?.label}:{" "}
          {SETUP_NAMES[setup].name} · {SETUP_NAMES[setup].formation}
        </p>
      )}
      {scenario.replay && (
        <div className="flex w-full flex-col items-center gap-1.5">
          <p className="min-h-5 text-sm" data-replay-caption>
            {last
              ? `${frame}/${moves.length}수 · ${moveText(before, last)}`
              : `처음 판 · ${moves.length}수를 넘겨 봐요`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={frame === 0}
              onClick={() => setFrame(0)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              처음부터
            </button>
            <button
              type="button"
              disabled={frame >= moves.length}
              onClick={() => setFrame((f) => f + 1)}
              className="rounded-lg bg-amber-300/25 px-3 py-1.5 font-semibold text-sm disabled:opacity-40"
            >
              다음 수
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "한 차 11→41 · 초 차 잃음"처럼 넘긴 수를 말로. `before`는 그 수를 두기 전 판 */
function moveText(before: Board, last: Move): string {
  // 한의 졸은 병이라 부른다(배우기 글과 같게).
  const name = (cell: string) =>
    `${SIDE_NAMES[cell[0] as Side]} ${cell === "hP" ? "병" : KIND_NAMES[cell[1] as Kind]}`;
  const taken = before[last.to] ?? "";
  const capture = taken
    ? ` · ${name(taken)} ${taken[0] === "c" ? "잃음" : "잡음"}`
    : "";
  return `${name(before[last.from] ?? "")} ${pointName(last.from)}→${pointName(last.to)}${capture}`;
}

/** 장기 배우기. 미션 상대는 입문 컴퓨터, 장면이 없으면 내가 초로 상차림부터 한 판 */
export const janggiTutorial: TutorialKit<
  JanggiView,
  GameEvent,
  JanggiScene,
  Action
> = {
  title: "장기 배우기",
  background: "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]",
  lessons: JANGGI_LESSONS,
  progress: useJanggiTutorialProgress,
  glossary: false,
  startMission(scenario) {
    const state = scenario
      ? sceneState(scenario)
      : {
          ...createMatch(JANGGI_TUTORIAL_RULES, Date.now()).state,
          choSeat: 0,
        };
    useJanggi.getState().startPractice(state);
  },
  subscribe: (listener) =>
    useJanggi.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: JanggiSceneView,
  Table: ({ onExit, mission }) => (
    <JanggiGame
      onExit={() => {
        useJanggi.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
