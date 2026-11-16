"use client";

import {
  type GameResult,
  usesGesture,
  viewOf,
  type YutState,
} from "@game/yut-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { GameArchive } from "@/review/archive";
import { VERDICT_LABEL } from "@/review/commentary";
import { replayArchive } from "@/review/replay";

import { explainYut, yutKit } from "../kit";
import { sceneOf } from "../scene";
import { type ReplayCue, replayCue } from "../toss/plan";
import { PendingChips, SeatRing, SideTray, sideLabel, useSplit } from "./parts";
import { ReplayMat, useThreeD } from "./TossMat";
import { YutBoard } from "./YutBoard";

/** 자동 재생에서 한 걸음 사이 시간 */
const PLAY_MS = 700;

/** 보이는 걸음과 바로 앞에 보이던 걸음(한 걸음 앞으로 왔는지 가린다) */
interface Position {
  index: number;
  from: number;
}

/**
 * 윷놀이 다시 보기: 남긴 기록을 처음부터 다시 둬 보며 한 걸음씩 앞뒤로 움직인다.
 * 던지기 결과는 기록 속 고리 공개로 다시 계산되고, 말 움직임마다 고수가 본 기댓값과 견준 해설을 붙인다.
 * 대국 화면과 같은 두 장면(던지는 장면·말 옮기는 장면, docs/37 15절)과 3D 멍석을 쓴다. 한 걸음 앞으로 와서 던지기
 * 결과가 나오면 그 던지기의 궤적을 굴리고(대국 중과 같은 궤적), 뒤로 가거나 건너뛰면 멈춘 모습만 보인다(docs/37 14-7).
 * 키보드 ←·→로도 움직인다
 */
export function YutReplay({
  archive,
  name,
}: {
  archive: GameArchive;
  name: (seat: number) => string;
}) {
  const replayed = useMemo(() => replayArchive(yutKit, archive), [archive]);
  const states = replayed.states as YutState[];
  const last = states.length - 1;
  const [pos, setPos] = useState<Position>({ index: last, from: last });
  const index = pos.index;
  const [playing, setPlaying] = useState(false);
  const state = states[index] as YutState;
  const next = archive.log[index] ?? null;
  const nameRef = useRef(name);
  nameRef.current = name;
  /** 한 걸음 앞으로(끝이면 그대로) */
  const step = useCallback(
    () =>
      setPos((p) =>
        p.index >= last ? p : { index: p.index + 1, from: p.index },
      ),
    [last],
  );
  /** 그 걸음으로 건너뛴다(연출 없음) */
  const jump = useCallback(
    (i: number) => {
      const target = Math.max(0, Math.min(last, i));
      setPos({ index: target, from: target });
    },
    [last],
  );

  // 몸짓이 없는 옛 판(규칙 판 1)은 3D 없이 2D 윷가락
  const [threeD, lose] = useThreeD(usesGesture(state.rules));
  const cue = useMemo(
    () => replayCue(states, pos.from, pos.index, archive.seat),
    [states, pos, archive.seat],
  );
  /** 연출을 마친 걸음(그때까지는 던지는 장면에 머물고 자동 재생도 기다린다) */
  const [settled, setSettled] = useState<ReplayCue | null>(null);
  const tossing = threeD === true && cue.animate && settled !== cue;

  useEffect(() => {
    if (!playing || tossing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(step, PLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, tossing, index, last, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setPlaying(false);
        setPos((p) => {
          const target = Math.max(0, p.index - 1);
          return { index: target, from: target };
        });
      }
      if (e.key === "ArrowRight") {
        setPlaying(false);
        step();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // 고수 계산이 조금 걸려 그린 뒤에 한다(어느 걸음의 해설인지 함께 둔다).
  const [explained, setExplained] = useState<{
    index: number;
    commentary: ReturnType<typeof explainYut>;
  } | null>(null);
  useEffect(() => {
    if (!next) return;
    const timer = setTimeout(
      () =>
        setExplained({
          index,
          commentary: explainYut(
            state,
            next,
            states[index + 1] ?? null,
            index,
            nameRef.current,
          ),
        }),
      30,
    );
    return () => clearTimeout(timer);
  }, [state, next, states, index]);
  const commentary = explained?.index === index ? explained.commentary : null;

  const split = useSplit();
  const view = viewOf(state, archive.seat);
  const scene = sceneOf(state.phase, tossing);
  const moving = scene === "move";
  const result: GameResult | null = state.result;
  const resultText =
    state.phase !== "gameOver"
      ? null
      : result === null || result.side === null
        ? "이긴 편 없음"
        : `${sideLabel(view, result.side, name)} 승리(${
            result.kind === "finish"
              ? "말을 모두 냄"
              : result.kind === "resign"
                ? "기권"
                : result.kind === "time"
                  ? "시간패"
                  : "공개하지 않음"
          })`;

  return (
    // PC·눕힌 휴대폰은 윷판과 멍석을 나란히 두려고 복기 화면 폭(max-w-xl)보다 넓게, 가운데에 둔다
    <section className="flex flex-col items-center gap-3 split:grid split:w-[min(52rem,calc(100vw-2rem))] split:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] split:items-start split:gap-x-5 split:self-center">
      <p
        role="status"
        className="text-sm text-white/80 split:col-span-2 split:justify-self-center"
      >
        던지기 {state.throwCount}번 · {index}/{last}
        {resultText ? ` · ${resultText}` : ""}
      </p>
      {/*
        두 장면(docs/37 15절): 휴대폰 세로는 같은 자리에서 멍석과 윷판이 바뀐다. 건너뛰면 바로 바꾸고,
        한 걸음 앞으로 갈 때만 대국 화면처럼 천천히 바꾼다. PC·눕힌 휴대폰은 나란히(yut.css)
      */}
      <div
        className="yut-stage w-full max-w-[min(32rem,calc(100dvh-16rem))] min-w-64"
        data-scene={scene}
        data-instant={pos.index === pos.from + 1 ? undefined : ""}
        data-replay-step={index}
        data-replay-toss={tossing ? "" : undefined}
      >
        <div className="yut-layer yut-mat-layer" data-mat>
          <ReplayMat
            view={view}
            cue={cue}
            threeD={threeD}
            lose={lose}
            visible={!moving || split}
            onSettled={setSettled}
          />
          <SeatRing view={view} name={name} />
          {!moving && !tossing && state.pending.length > 0 && (
            <div className="pointer-events-none absolute top-2 left-2 z-[6]">
              <PendingChips
                values={state.pending}
                selected={null}
                usable={new Set()}
              />
            </div>
          )}
        </div>
        <div className="yut-layer yut-board-layer">
          <YutBoard
            view={view}
            events={[]}
            movable={new Map()}
            preview={null}
          />
        </div>
      </div>
      <div className="flex w-full max-w-xl flex-col items-center gap-2 split:col-start-2">
        {moving && (
          <PendingChips
            values={state.pending}
            selected={null}
            usable={new Set()}
          />
        )}
        <SideTray
          view={view}
          name={name}
          turnSide={state.rules.mode === "team" ? state.turn % 2 : state.turn}
        />
      </div>
      <div
        role="toolbar"
        aria-label="다시 보기"
        className="flex flex-wrap justify-center gap-1 split:col-start-2"
      >
        {(
          [
            ["⏮", "처음", () => jump(0)],
            ["◀", "한 수 뒤로", () => jump(index - 1)],
            ["▶", "한 수 앞으로", step],
            ["⏭", "끝", () => jump(last)],
          ] as const
        ).map(([icon, label, onClick]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => {
              setPlaying(false);
              onClick();
            }}
            className="min-w-10 rounded-lg bg-white/10 px-2 py-1 font-semibold hover:bg-white/20"
          >
            {icon}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (index >= last) jump(0);
            setPlaying((p) => !p);
          }}
          className={cn(
            "rounded-lg px-3 py-1 font-semibold",
            playing ? "bg-amber-300 text-black" : "bg-white/10",
          )}
        >
          {playing ? "⏸ 멈춤" : "자동 재생"}
        </button>
      </div>
      {commentary && (
        <div className="w-full max-w-xl rounded-xl bg-white/5 p-3 text-sm split:col-start-2">
          <p className="text-white/70">{commentary.situation.join(" · ")}</p>
          {commentary.verdict && (
            <p className="mt-1 font-semibold">
              다음 수: {VERDICT_LABEL[commentary.verdict]}
            </p>
          )}
          <ul className="mt-1 list-inside list-disc text-white/80">
            {commentary.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {replayed.error && (
        <p className="text-rose-300 text-xs split:col-start-2">
          {replayed.error}
        </p>
      )}
    </section>
  );
}
